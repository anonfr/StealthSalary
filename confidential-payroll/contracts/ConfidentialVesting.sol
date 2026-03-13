// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @title ConfidentialVesting
/// @author Confidential Payroll Team
/// @notice Confidential equity / token vesting schedules using the Zama Protocol.
/// @dev    Grant amounts are encrypted — employees know their own vesting grant but
///         cannot see colleagues' grants.  The employer sees all grants.
///         Cliff and linear vesting logic is enforced on-chain; the gateway decrypts
///         the total grant to compute vested portions during claim callbacks.
///         Payments are made in ERC-7984 confidential tokens.
contract ConfidentialVesting is ZamaEthereumConfig {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address public employer;
    address public gateway;
    IERC7984 public vestingToken;

    struct VestingSchedule {
        euint64 totalGrant;      // encrypted total grant (token units)
        euint64 claimed;         // encrypted cumulative amount already claimed
        uint256 startTime;       // vesting start timestamp
        uint256 cliffDuration;   // seconds before any tokens vest
        uint256 vestingDuration; // total duration over which grant vests linearly
        bool active;
    }

    mapping(address => VestingSchedule) private _schedules;
    address[] private _beneficiaryList;

    /// @dev Set when a beneficiary calls initiateVestingClaim(); cleared on fulfil
    mapping(address => bool) public hasPendingClaim;

    uint256 public totalGranted; // plain-text accounting (sum of deposited tokens)
    uint256 public totalVested;  // plain-text accounting (sum of paid-out tokens)

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ScheduleCreated(address indexed beneficiary, uint256 cliffDuration, uint256 vestingDuration);
    event ScheduleRevoked(address indexed beneficiary);
    event ClaimInitiated(address indexed beneficiary);
    event ClaimProcessed(address indexed beneficiary, uint256 amount);
    event FundsDeposited(address indexed sender, uint256 amount);
    event FundsWithdrawn(address indexed employer, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error OnlyEmployer();
    error OnlyGateway();
    error ScheduleAlreadyExists();
    error ScheduleNotFound();
    error CliffNotReached();
    error NoPendingClaim();
    error InsufficientFunds();
    error ZeroAddress();
    error InvalidDuration();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyEmployer() {
        if (msg.sender != employer) revert OnlyEmployer();
        _;
    }

    modifier onlyGateway() {
        if (msg.sender != gateway) revert OnlyGateway();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _gateway, address _vestingToken) {
        if (_gateway == address(0)) revert ZeroAddress();
        if (_vestingToken == address(0)) revert ZeroAddress();
        employer = msg.sender;
        gateway = _gateway;
        vestingToken = IERC7984(_vestingToken);
    }

    // -------------------------------------------------------------------------
    // Employer: Fund management
    // -------------------------------------------------------------------------

    /// @notice Deposit ERC-7984 tokens into the vesting pool (plaintext amount for convenience)
    /// @dev    Employer must have set this contract as operator on the token first.
    function depositTokens(uint64 amount) external onlyEmployer {
        euint64 encAmount = FHE.asEuint64(amount);
        FHE.allowThis(encAmount);
        FHE.allow(encAmount, address(vestingToken));
        vestingToken.confidentialTransferFrom(msg.sender, address(this), encAmount);
        totalGranted += amount;
        emit FundsDeposited(msg.sender, amount);
    }

    /// @notice Allow the employer to withdraw ERC-7984 tokens from the contract
    function withdrawFunds(uint64 amount) external onlyEmployer {
        if (totalGranted < totalVested + amount) revert InsufficientFunds();
        euint64 encAmount = FHE.asEuint64(amount);
        FHE.allowThis(encAmount);
        FHE.allow(encAmount, address(vestingToken));
        vestingToken.confidentialTransfer(employer, encAmount);
        totalGranted -= amount;
        emit FundsWithdrawn(employer, amount);
    }

    // -------------------------------------------------------------------------
    // Employer: Schedule management
    // -------------------------------------------------------------------------

    /// @notice Create an encrypted vesting schedule for a beneficiary
    /// @param beneficiary      Recipient address
    /// @param encryptedGrant   Encrypted total grant amount
    /// @param proof            ZK proof of valid encrypted input
    /// @param cliffDuration    Seconds until first tokens vest (e.g. 365 days)
    /// @param vestingDuration  Total vesting period in seconds (e.g. 4 * 365 days)
    function createSchedule(
        address beneficiary,
        externalEuint64 encryptedGrant,
        bytes calldata proof,
        uint256 cliffDuration,
        uint256 vestingDuration
    ) external onlyEmployer {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (_schedules[beneficiary].active) revert ScheduleAlreadyExists();
        if (vestingDuration == 0) revert InvalidDuration();

        euint64 grant = FHE.fromExternal(encryptedGrant, proof);
        euint64 initialClaimed = FHE.asEuint64(0);

        _schedules[beneficiary] = VestingSchedule({
            totalGrant: grant,
            claimed: initialClaimed,
            startTime: block.timestamp,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            active: true
        });

        _beneficiaryList.push(beneficiary);

        // Grant read access to employer and beneficiary only
        FHE.allowThis(grant);
        FHE.allow(grant, employer);
        FHE.allow(grant, beneficiary);

        // The contract must also have access to the claimed handle
        FHE.allowThis(initialClaimed);
        FHE.allow(initialClaimed, employer);
        FHE.allow(initialClaimed, beneficiary);

        emit ScheduleCreated(beneficiary, cliffDuration, vestingDuration);
    }

    /// @notice Revoke a vesting schedule (unvested portion stays in contract)
    function revokeSchedule(address beneficiary) external onlyEmployer {
        if (!_schedules[beneficiary].active) revert ScheduleNotFound();
        _schedules[beneficiary].active = false;
        emit ScheduleRevoked(beneficiary);
    }

    // -------------------------------------------------------------------------
    // Beneficiary: Claim flow
    // -------------------------------------------------------------------------

    /// @notice Step 1 — Beneficiary requests a claim of their vested tokens.
    /// @dev    Marks the totalGrant and claimed handles for gateway decryption.
    ///         The gateway decrypts both, computes the vested amount based on
    ///         the elapsed time, and calls back `processVestingClaim`.
    function initiateVestingClaim() external {
        VestingSchedule storage s = _schedules[msg.sender];
        if (!s.active) revert ScheduleNotFound();
        if (block.timestamp < s.startTime + s.cliffDuration) revert CliffNotReached();

        // Expose handles for gateway decryption
        FHE.makePubliclyDecryptable(s.totalGrant);
        FHE.makePubliclyDecryptable(s.claimed);

        hasPendingClaim[msg.sender] = true;

        emit ClaimInitiated(msg.sender);
    }

    /// @notice Step 2 — Gateway calls this with the computed vested amount.
    /// @dev    The off-chain gateway:
    ///           1. Decrypts totalGrant and claimed.
    ///           2. Computes vestedSoFar = totalGrant * elapsed / vestingDuration
    ///           3. Computes claimable   = vestedSoFar - alreadyClaimed
    ///           4. Calls this function with `claimableAmount`.
    /// @param beneficiary      The claimant
    /// @param claimableAmount  The clear-text vested-but-unclaimed amount (token units)
    function processVestingClaim(address beneficiary, uint64 claimableAmount) external onlyGateway {
        if (!hasPendingClaim[beneficiary]) revert NoPendingClaim();

        hasPendingClaim[beneficiary] = false;

        // Update encrypted claimed amount
        VestingSchedule storage s = _schedules[beneficiary];
        s.claimed = FHE.add(s.claimed, FHE.asEuint64(claimableAmount));
        FHE.allowThis(s.claimed);
        FHE.allow(s.claimed, employer);
        FHE.allow(s.claimed, beneficiary);

        totalVested += claimableAmount;

        // Transfer ERC-7984 tokens to the beneficiary
        euint64 encAmount = FHE.asEuint64(claimableAmount);
        FHE.allowThis(encAmount);
        FHE.allow(encAmount, address(vestingToken));
        vestingToken.confidentialTransfer(beneficiary, encAmount);

        emit ClaimProcessed(beneficiary, claimableAmount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Returns whether the cliff has passed for a beneficiary
    function hasPassedCliff(address beneficiary) external view returns (bool) {
        VestingSchedule storage s = _schedules[beneficiary];
        return s.active && block.timestamp >= s.startTime + s.cliffDuration;
    }

    /// @notice Returns the caller's encrypted grant handle (readable only by the caller)
    function getMyGrant() external view returns (euint64) {
        return _schedules[msg.sender].totalGrant;
    }

    /// @notice Returns the caller's encrypted claimed handle
    function getMyClaimed() external view returns (euint64) {
        return _schedules[msg.sender].claimed;
    }

    /// @notice Returns the caller's schedule metadata (times / flags, no amounts)
    function getMySchedule()
        external
        view
        returns (uint256 startTime, uint256 cliffDuration, uint256 vestingDuration, bool active)
    {
        VestingSchedule storage s = _schedules[msg.sender];
        return (s.startTime, s.cliffDuration, s.vestingDuration, s.active);
    }

    function hasSchedule(address beneficiary) external view returns (bool) {
        return _schedules[beneficiary].active;
    }

    function beneficiaryCount() external view returns (uint256) {
        uint256 count;
        for (uint256 i = 0; i < _beneficiaryList.length; i++) {
            if (_schedules[_beneficiaryList[i]].active) count++;
        }
        return count;
    }

    /// @notice Returns the ERC-7984 token balance held by this contract (encrypted)
    function contractBalance() external view returns (euint64) {
        return vestingToken.confidentialBalanceOf(address(this));
    }
}
