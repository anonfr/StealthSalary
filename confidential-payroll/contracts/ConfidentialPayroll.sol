// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @title ConfidentialPayroll
/// @author Confidential Payroll Team
/// @notice A fully confidential onchain payroll system built on the Zama Protocol.
/// @dev Employee salaries and accumulated balances are stored as encrypted euint64 values.
///      Payroll is denominated in an ERC-7984 confidential token (e.g. PayrollToken).
///      No party other than the employer and the individual employee can see salary figures.
///      Compliance with minimum-wage requirements is proven via FHE comparison without
///      revealing any underlying salary amounts.
contract ConfidentialPayroll is ZamaEthereumConfig {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Address of the employer who administers this payroll contract
    address public employer;

    /// @notice The ERC-7984 confidential token used for payroll payments
    IERC7984 public payrollToken;

    /// @notice Encrypted minimum-wage threshold (same unit as salaries, i.e. token units)
    euint64 private _minWage;

    /// @notice Encrypted aggregate payroll disbursed so far (visible only to employer)
    euint64 private _totalDisbursed;

    /// @notice Gateway / relayer address authorised to finalise withdrawal callbacks
    address public gateway;

    struct Employee {
        euint64 salary;   // encrypted monthly salary
        euint64 balance;  // accumulated unpaid encrypted balance
        bool active;
    }

    mapping(address => Employee) private _employees;
    address[] private _employeeList;

    /// @dev Tracks which employees have a pending withdrawal request
    mapping(address => bool) public hasPendingWithdrawal;

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event EmployeeAdded(address indexed employee);
    event EmployeeRemoved(address indexed employee);
    event SalaryUpdated(address indexed employee);
    event PayrollRun(uint256 indexed timestamp, uint256 employeeCount);
    event ComplianceChecked(address indexed employee);
    event IncomeProofGranted(address indexed employee, address indexed verifier);
    event WithdrawalInitiated(address indexed employee);
    event WithdrawalProcessed(address indexed employee, uint256 amount);
    event FundsDeposited(address indexed sender, uint256 amount);
    event FundsWithdrawn(address indexed employer, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error OnlyEmployer();
    error OnlyGateway();
    error EmployeeAlreadyExists();
    error EmployeeNotFound();
    error NoPendingWithdrawal();
    error InsufficientContractFunds();
    error ZeroAddress();

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

    /// @param _gateway       Address of the Zama gateway / relayer (used to finalise withdrawals)
    /// @param _payrollToken  Address of the ERC-7984 confidential token used for payroll
    /// @dev  Minimum wage is set post-deployment via `updateMinWage()` to avoid
    ///       the chicken-and-egg problem of encrypting inputs for an unknown address.
    constructor(address _employer, address _gateway, address _payrollToken) {
        if (_employer == address(0)) revert ZeroAddress();
        if (_gateway == address(0)) revert ZeroAddress();
        if (_payrollToken == address(0)) revert ZeroAddress();
        employer = _employer;
        gateway = _gateway;
        payrollToken = IERC7984(_payrollToken);
    }

    // -------------------------------------------------------------------------
    // Employer: Employee management
    // -------------------------------------------------------------------------

    /// @notice Add a new employee with an encrypted salary
    /// @param employee          Employee wallet address
    /// @param encryptedSalary   Encrypted salary amount (per payroll period)
    /// @param proof             ZK proof of valid encrypted input
    function addEmployee(address employee, externalEuint64 encryptedSalary, bytes calldata proof) external onlyEmployer {
        if (employee == address(0)) revert ZeroAddress();
        if (_employees[employee].active) revert EmployeeAlreadyExists();

        euint64 salary = FHE.fromExternal(encryptedSalary, proof);
        euint64 initialBalance = FHE.asEuint64(0);

        _employees[employee].salary = salary;
        _employees[employee].balance = initialBalance;
        _employees[employee].active = true;
        _employeeList.push(employee);

        // Only the employer and the employee may view this salary handle
        FHE.allowThis(salary);
        FHE.allow(salary, employer);
        FHE.allow(salary, employee);

        // The contract must have access to the balance handle to run payroll
        FHE.allowThis(initialBalance);
        FHE.allow(initialBalance, employer);
        FHE.allow(initialBalance, employee);

        emit EmployeeAdded(employee);
    }

    /// @notice Update an existing employee's encrypted salary
    function updateSalary(address employee, externalEuint64 encryptedSalary, bytes calldata proof) external onlyEmployer {
        if (!_employees[employee].active) revert EmployeeNotFound();

        euint64 newSalary = FHE.fromExternal(encryptedSalary, proof);
        _employees[employee].salary = newSalary;

        FHE.allowThis(newSalary);
        FHE.allow(newSalary, employer);
        FHE.allow(newSalary, employee);

        emit SalaryUpdated(employee);
    }

    /// @notice Deactivate an employee (does not erase their accumulated balance)
    function removeEmployee(address employee) external onlyEmployer {
        if (!_employees[employee].active) revert EmployeeNotFound();
        _employees[employee].active = false;
        emit EmployeeRemoved(employee);
    }

    /// @notice Update the encrypted minimum-wage threshold
    function updateMinWage(externalEuint64 encryptedMinWage, bytes calldata proof) external onlyEmployer {
        _minWage = FHE.fromExternal(encryptedMinWage, proof);
        FHE.allowThis(_minWage);
        FHE.allow(_minWage, employer);
    }

    // -------------------------------------------------------------------------
    // Employer: Payroll execution
    // -------------------------------------------------------------------------

    /// @notice Run payroll for ALL active employees in one transaction
    /// @dev Each employee's encrypted balance is incremented by their encrypted salary.
    ///      No salary figures are ever revealed — all arithmetic is homomorphic.
    function runPayroll() external onlyEmployer {
        uint256 count;
        for (uint256 i = 0; i < _employeeList.length; i++) {
            address emp = _employeeList[i];
            if (_employees[emp].active) {
                _creditBalance(emp);
                count++;
            }
        }
        emit PayrollRun(block.timestamp, count);
    }

    /// @notice Run payroll for a specific subset of employees (gas-optimised)
    function runPayrollFor(address[] calldata employees) external onlyEmployer {
        for (uint256 i = 0; i < employees.length; i++) {
            if (_employees[employees[i]].active) {
                _creditBalance(employees[i]);
            }
        }
        emit PayrollRun(block.timestamp, employees.length);
    }

    // -------------------------------------------------------------------------
    // Compliance — the killer feature
    // -------------------------------------------------------------------------

    /// @notice Prove that an employee's salary meets the minimum wage — WITHOUT revealing the salary.
    /// @dev    Performs FHE greater-than-or-equal comparison between the encrypted salary and the
    ///         encrypted minimum wage.  The resulting encrypted boolean is marked for public
    ///         decryption via the Zama gateway, producing an auditable on-chain compliance proof.
    /// @return isCompliant  An encrypted boolean; the gateway will decrypt it publicly.
    function checkCompliance(address employee) external returns (ebool) {
        if (!_employees[employee].active) revert EmployeeNotFound();

        ebool isCompliant = FHE.ge(_employees[employee].salary, _minWage);

        FHE.allowThis(isCompliant);
        FHE.allow(isCompliant, employer);
        FHE.allow(isCompliant, employee);
        // Mark for public gateway decryption — anyone can verify the result
        FHE.makePubliclyDecryptable(isCompliant);

        emit ComplianceChecked(employee);
        return isCompliant;
    }

    // -------------------------------------------------------------------------
    // Employee: Proof-of-income (selective disclosure)
    // -------------------------------------------------------------------------

    /// @notice Grant a third party (e.g. a bank or landlord) transient read access to your salary.
    /// @dev    Access is valid for the current transaction only (allowTransient).
    ///         The verifier can call `getSalaryOf(msg.sender)` in the same tx to read the handle.
    function generateIncomeProof(address verifier) external {
        if (!_employees[msg.sender].active) revert EmployeeNotFound();
        FHE.allowTransient(_employees[msg.sender].salary, verifier);
        emit IncomeProofGranted(msg.sender, verifier);
    }

    // -------------------------------------------------------------------------
    // Employee: Withdrawal flow
    // -------------------------------------------------------------------------

    /// @notice Step 1 — Employee requests withdrawal of their accumulated balance.
    /// @dev    Marks the encrypted balance handle for gateway decryption.
    ///         The Zama gateway listens for the FHE.allowForDecryption event, decrypts
    ///         the balance off-chain, then calls back `processWithdrawal`.
    function initiateWithdrawal() external {
        if (!_employees[msg.sender].active) revert EmployeeNotFound();

        FHE.makePubliclyDecryptable(_employees[msg.sender].balance);
        hasPendingWithdrawal[msg.sender] = true;

        emit WithdrawalInitiated(msg.sender);
    }

    /// @notice Step 2 — Gateway calls this after decrypting the employee's balance.
    /// @dev    In production this is called exclusively by the Zama gateway (onlyGateway).
    ///         Resets the employee's encrypted balance to zero and transfers ERC-7984 tokens.
    /// @param employee    The employee whose balance is being paid out
    /// @param clearAmount The decrypted balance amount (in token units)
    function processWithdrawal(address employee, uint64 clearAmount) external onlyGateway {
        if (!hasPendingWithdrawal[employee]) revert NoPendingWithdrawal();

        // Check that the contract holds enough tokens
        // Note: confidentialBalanceOf returns an encrypted handle; for the mock we use
        // totalDeposited/totalWithdrawn accounting as a safety check
        if (totalDeposited < totalWithdrawn + clearAmount) revert InsufficientContractFunds();

        hasPendingWithdrawal[employee] = false;

        // Reset encrypted balance
        euint64 zero = FHE.asEuint64(0);
        _employees[employee].balance = zero;
        FHE.allowThis(zero);
        FHE.allow(zero, employee);
        FHE.allow(zero, employer);

        totalWithdrawn += clearAmount;

        // Transfer ERC-7984 tokens to the employee
        euint64 encAmount = FHE.asEuint64(clearAmount);
        FHE.allowThis(encAmount);
        FHE.allow(encAmount, address(payrollToken));
        payrollToken.confidentialTransfer(employee, encAmount);

        emit WithdrawalProcessed(employee, clearAmount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Returns the caller's encrypted salary handle (only readable by the caller)
    function getMySalary() external view returns (euint64) {
        return _employees[msg.sender].salary;
    }

    /// @notice Returns the caller's encrypted balance handle (only readable by the caller)
    function getMyBalance() external view returns (euint64) {
        return _employees[msg.sender].balance;
    }

    /// @notice Returns the salary handle of any employee (readable only by permitted parties)
    function getSalaryOf(address employee) external view returns (euint64) {
        return _employees[employee].salary;
    }

    /// @notice Returns the balance handle of any employee (readable only by permitted parties)
    function getBalanceOf(address employee) external view returns (euint64) {
        return _employees[employee].balance;
    }

    function isEmployee(address addr) external view returns (bool) {
        return _employees[addr].active;
    }

    function employeeCount() external view returns (uint256) {
        uint256 count;
        for (uint256 i = 0; i < _employeeList.length; i++) {
            if (_employees[_employeeList[i]].active) count++;
        }
        return count;
    }

    /// @notice Returns the ERC-7984 token balance held by this contract (encrypted)
    function contractBalance() external view returns (euint64) {
        return payrollToken.confidentialBalanceOf(address(this));
    }

    /// @notice Returns the full list of employee addresses (including inactive)
    function getEmployeeList() external view returns (address[] memory) {
        return _employeeList;
    }

    // -------------------------------------------------------------------------
    // Employer: Fund management
    // -------------------------------------------------------------------------

    /// @notice Deposit ERC-7984 tokens into the payroll pool.
    /// @dev    The employer must first call `payrollToken.setOperator(thisContract, until)` to
    ///         authorise the payroll contract to pull tokens via confidentialTransferFrom.
    /// @param encryptedAmount  Encrypted token amount to deposit
    /// @param inputProof       ZK proof for the encrypted input
    function depositTokens(externalEuint64 encryptedAmount, bytes calldata inputProof) external onlyEmployer {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(amount);
        FHE.allow(amount, address(payrollToken));
        payrollToken.confidentialTransferFrom(msg.sender, address(this), amount);
        emit FundsDeposited(msg.sender, 0); // amount is encrypted
    }

    /// @notice Deposit a plaintext amount of tokens (convenience for testing / scripts)
    /// @dev    Employer must have set this contract as operator on the token first.
    function depositTokensPlaintext(uint64 amount) external onlyEmployer {
        euint64 encAmount = FHE.asEuint64(amount);
        FHE.allowThis(encAmount);
        FHE.allow(encAmount, address(payrollToken));
        payrollToken.confidentialTransferFrom(msg.sender, address(this), encAmount);
        totalDeposited += amount;
        emit FundsDeposited(msg.sender, amount);
    }

    /// @notice Allow the employer to withdraw ERC-7984 tokens from the contract
    /// @param amount The plaintext amount of tokens to withdraw
    function withdrawFunds(uint64 amount) external onlyEmployer {
        if (totalDeposited < totalWithdrawn + amount) revert InsufficientContractFunds();
        euint64 encAmount = FHE.asEuint64(amount);
        FHE.allowThis(encAmount);
        FHE.allow(encAmount, address(payrollToken));
        payrollToken.confidentialTransfer(employer, encAmount);
        totalWithdrawn += amount;
        emit FundsWithdrawn(employer, amount);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _creditBalance(address emp) internal {
        _employees[emp].balance = FHE.add(_employees[emp].balance, _employees[emp].salary);
        FHE.allowThis(_employees[emp].balance);
        FHE.allow(_employees[emp].balance, emp);
        FHE.allow(_employees[emp].balance, employer);
    }
}
