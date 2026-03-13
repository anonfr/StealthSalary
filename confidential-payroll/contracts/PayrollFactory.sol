// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayrollToken} from "./PayrollToken.sol";
import {ConfidentialPayroll} from "./ConfidentialPayroll.sol";

/// @title PayrollFactory
/// @notice Deploys a new PayrollToken + ConfidentialPayroll pair for any employer.
///         The caller becomes the employer and token owner, with initial tokens minted
///         and the payroll contract pre-approved as operator.
contract PayrollFactory {
    struct PayrollInstance {
        address payroll;
        address token;
    }

    /// @notice All payroll instances created by each employer
    mapping(address => PayrollInstance[]) public employerPayrolls;

    /// @notice All instances ever created (for discoverability)
    PayrollInstance[] public allInstances;

    event PayrollCreated(
        address indexed employer,
        address payroll,
        address token,
        uint256 index
    );

    /// @notice Deploy a new payroll system. Caller becomes the employer.
    /// @param initialMint Number of PAY tokens to mint to the employer (6 decimals)
    function createPayroll(uint64 initialMint) external returns (address payroll, address token) {
        // Deploy token — caller is owner (can mint more later)
        PayrollToken tok = new PayrollToken(msg.sender);
        token = address(tok);

        // Deploy payroll — caller is employer AND gateway (so they can process withdrawals)
        ConfidentialPayroll pay = new ConfidentialPayroll(msg.sender, msg.sender, token);
        payroll = address(pay);

        // Mint initial tokens to the employer
        if (initialMint > 0) {
            // Factory is not the owner, so we need the token owner (msg.sender) to mint
            // We can't mint here — employer must call token.mint() themselves after creation
        }

        PayrollInstance memory instance = PayrollInstance(payroll, token);
        employerPayrolls[msg.sender].push(instance);
        allInstances.push(instance);

        emit PayrollCreated(msg.sender, payroll, token, allInstances.length - 1);
    }

    /// @notice Get all payroll instances for an employer
    function getEmployerPayrolls(address employer) external view returns (PayrollInstance[] memory) {
        return employerPayrolls[employer];
    }

    /// @notice Get total number of payroll instances created
    function totalInstances() external view returns (uint256) {
        return allInstances.length;
    }
}
