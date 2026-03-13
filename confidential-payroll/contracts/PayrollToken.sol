// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title PayrollToken
/// @notice An ERC-7984 confidential fungible token used as the payroll currency.
/// @dev    The deployer (owner) can mint tokens. All balances and transfers are encrypted
///         via Zama FHE — no one can see amounts on-chain except authorised parties.
///         Decimals = 6 (inherited from ERC7984).
contract PayrollToken is ZamaEthereumConfig, ERC7984 {
    address public owner;

    error OnlyOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _owner)
        ERC7984("Payroll Token", "PAY", "")
    {
        owner = _owner;
    }

    /// @notice Mint `amount` tokens (plaintext) to `to`. Only owner can call.
    /// @dev    Uses plaintext amount for convenience; it's immediately encrypted
    ///         inside the ERC7984 `_mint` which stores as euint64.
    function mint(address to, uint64 amount) external onlyOwner {
        euint64 encAmount = FHE.asEuint64(amount);
        FHE.allowThis(encAmount);
        _mint(to, encAmount);
    }
}
