# Confidential Payroll — Built on the Zama Protocol

> A fully confidential onchain payroll and equity vesting system using Fully Homomorphic Encryption (FHE).
> Submitted to the **Zama Developer Program — Special Bounty Track & Builder Track**.

## The Problem

Public blockchains make crypto payroll nearly impossible at scale:

- **No salary privacy**: every transaction is visible — employees see each other's compensation
- **No compliance proofs**: you cannot prove regulatory compliance without revealing amounts
- **No selective disclosure**: employees cannot share proof-of-income without exposing full financial history
- **No confidential equity**: vesting schedules are public, exposing competitive compensation strategy

## The Solution

This project uses the [Zama Protocol](https://www.zama.org) to build a payroll system where **all salary figures remain encrypted at all times** — even from the blockchain itself.

- **Employer** manages encrypted salaries and runs payroll
- **Employees** see only their own salary and accumulated balance
- **Compliance** is proven via FHE comparison — regulators verify "salary ≥ minimum wage" without seeing any number
- **Income proofs** are selectively disclosed to a verifier (bank, landlord) for a single transaction only

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Employer (Admin)                    │
│  addEmployee(encSalary) → runPayroll() → checkCompliance() │
└────────────────────────┬─────────────────────────────┘
                         │
         ┌───────────────▼──────────────────┐
         │        ConfidentialPayroll.sol    │
         │  ┌─────────────────────────────┐ │
         │  │  Employee {                 │ │
         │  │    euint64 salary  (enc)    │ │
         │  │    euint64 balance (enc)    │ │
         │  │    bool    active           │ │
         │  │  }                          │ │
         │  └─────────────────────────────┘ │
         │  FHE.ge(salary, minWage) → ebool  │
         │  FHE.makePubliclyDecryptable(ebool)│
         └─────────────────┬────────────────┘
                           │
         ┌─────────────────▼────────────────┐
         │         Zama Gateway             │
         │  Decrypts ebool → public proof   │
         │  Decrypts balance → calls back   │
         └─────────────────┬────────────────┘
                           │
         ┌─────────────────▼────────────────┐
         │      Employee (Self-service)     │
         │  getMySalary() → decrypt locally │
         │  initiateWithdrawal()            │
         │  generateIncomeProof(verifier)   │
         └──────────────────────────────────┘
```

### Contracts

| Contract | Description |
|---|---|
| `ConfidentialPayroll.sol` | Core payroll: encrypted salaries, payroll execution, compliance verification, selective income disclosure, gateway-based withdrawal |
| `ConfidentialVesting.sol` | Confidential equity grants: encrypted total grant, cliff enforcement, linear vesting, gateway-based claims |

---

## Key Features

### 1. Encrypted Salaries (Privacy by Default)
```solidity
euint64 salary = FHE.fromExternal(encryptedSalary, proof);
FHE.allow(salary, employer);
FHE.allow(salary, employee); // Only these two can see it
```

### 2. Confidential Payroll Execution
```solidity
function _creditBalance(address emp) internal {
    _employees[emp].balance = FHE.add(_employees[emp].balance, _employees[emp].salary);
    // Homomorphic addition — no values are ever decrypted during payroll
}
```

### 3. Compliance Verification (Killer Feature)
```solidity
function checkCompliance(address employee) external returns (ebool) {
    ebool isCompliant = FHE.ge(_employees[employee].salary, _minWage);
    FHE.makePubliclyDecryptable(isCompliant); // Public auditable proof
    return isCompliant;
}
```
The gateway decrypts the `ebool` publicly. Anyone can verify "✅ above minimum wage" — **the salary is never revealed**.

### 4. Selective Income Proof
```solidity
function generateIncomeProof(address verifier) external {
    FHE.allowTransient(_employees[msg.sender].salary, verifier);
    // Valid for one transaction only — perfect for bank or rental applications
}
```

### 5. Confidential Equity Vesting
Encrypted grant amounts with cliff + linear vesting. Only the beneficiary and employer can see grant size.

---

## Withdrawal Flow

```
Employee                 Contract                  Zama Gateway
   │                        │                          │
   │─ initiateWithdrawal() ─►│                          │
   │                        │── makePubliclyDecryptable ─►│
   │                        │        (balance handle)    │
   │                        │◄──── processWithdrawal() ──│
   │◄──── ETH transfer ──────│                          │
```

---

## Getting Started

### Install
```bash
git clone <repo-url>
cd confidential-payroll
npm install
```

### Run Tests (Mock Environment)
```bash
npm test
```
All **45 tests pass** against the FHEVM mock environment.

### Compile
```bash
npm run compile
```

### Deploy to Sepolia
```bash
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
npx hardhat vars set ETHERSCAN_API_KEY

GATEWAY_ADDRESS=<zama-gateway-address> npm run deploy:sepolia
```

### Hardhat Tasks
```bash
npx hardhat payroll:add-employee --contract <addr> --employee <addr> --salary 3000
npx hardhat payroll:run --contract <addr>
npx hardhat payroll:check-compliance --contract <addr> --employee <addr>
npx hardhat payroll:employee-count --contract <addr>
```

---

## Encrypted Data Flow

| Variable | Type | Visible to |
|---|---|---|
| `salary` | `euint64` | Employer + Employee only |
| `balance` | `euint64` | Employer + Employee only |
| `minWage` | `euint64` | Employer only |
| Compliance result | `ebool` | Public (via Zama gateway) |
| `totalGrant` (vesting) | `euint64` | Employer + Beneficiary |
| `claimed` (vesting) | `euint64` | Employer + Beneficiary |

---

## Test Coverage — 45 Tests

```
ConfidentialPayroll (26 tests)
  ✔ Deployment (3)
  ✔ Employee management (7) — add, update, remove, access control
  ✔ Payroll execution (4) — runPayroll, runPayrollFor, accumulation
  ✔ Compliance verification (2) — FHE.ge against encrypted minWage
  ✔ Income proof / selective disclosure (2)
  ✔ Withdrawal flow (6) — initiate, gateway callback, balance reset
  ✔ End-to-end cycle (1)

ConfidentialVesting (16 tests)
  ✔ Deployment (2)
  ✔ Schedule creation (5) — encrypted grant, access control
  ✔ Cliff enforcement (3) — time-based restrictions
  ✔ Vesting claim flow (5) — initiate, gateway callback, claimed tracking
  ✔ Schedule revocation (1)

FHECounter (3 tests — template baseline)
```

---

## Why This Matters

Payroll is a **$1.4 trillion** industry. The only reason it hasn't moved onchain is privacy. This project proves:

1. **Technically possible** — FHE enables full salary confidentiality at smart contract level
2. **Compliance without transparency** — regulators get cryptographic proofs, not raw data
3. **Employee empowerment** — selective disclosure to banks/landlords without full exposure
4. **Real-world ready** — built on the production Zama Protocol with the gateway decryption pattern

---

## License

MIT
