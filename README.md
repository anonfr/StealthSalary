# StealthSalary

### Fully Encrypted Onchain Payroll Powered by FHE

> Privacy-preserving payroll where salaries are encrypted at every stage — storage, computation, and disclosure. No party, including the blockchain itself, ever sees plaintext compensation data.

[![Live Demo](https://img.shields.io/badge/Live-stealth--salary.vercel.app-ffd208?style=flat-square)](https://stealth-salary.vercel.app)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.x-363636?style=flat-square&logo=solidity)](https://soliditylang.org/)
[![fhEVM](https://img.shields.io/badge/fhEVM-Zama-ffd208?style=flat-square)](https://docs.zama.ai/fhevm)
[![ERC-7984](https://img.shields.io/badge/Token-ERC--7984-blue?style=flat-square)](https://eips.ethereum.org/EIPS/eip-7984)
[![Next.js](https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=next.js)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-BSD--3--Clause--Clear-blue?style=flat-square)](LICENSE)

---

## The Problem

Payroll is one of the most sensitive categories of financial data. Current onchain payroll solutions expose salary amounts in plaintext on public ledgers:

- Employees can see each other's compensation
- Organizations leak competitive salary intelligence
- No way to prove compliance without revealing amounts
- No selective disclosure for income verification (banks, landlords)

Off-chain payroll systems solve privacy but sacrifice the transparency, auditability, and programmability that blockchains provide.

## The Solution

StealthSalary uses **Fully Homomorphic Encryption (FHE)** via [Zama's fhEVM](https://docs.zama.ai/fhevm) to keep salary data encrypted as `euint64` values throughout the entire lifecycle — from storage to computation to withdrawal.

---

## Architecture

```
                     ┌───────────────────────┐
                     │    PayrollFactory.sol  │
                     │  (Multi-tenant entry)  │
                     └──────────┬────────────┘
                                │ createPayroll()
                     ┌──────────▼────────────┐
                     │ Per-Employer Instance  │
          ┌──────────┴──────────┬────────────┴──────────┐
          │                     │                        │
 ┌────────▼────────┐  ┌────────▼─────────┐  ┌──────────▼──────────┐
 │ PayrollToken.sol │  │ ConfidentialPay  │  │ ConfidentialVesting  │
 │   (ERC-7984)    │  │   roll.sol       │  │       .sol           │
 │                 │  │                  │  │                      │
 │ Encrypted       │  │ euint64 salary   │  │ Encrypted grants     │
 │ balances &      │  │ euint64 balance  │  │ Cliff + linear       │
 │ transfers       │  │ FHE compliance   │  │ vesting              │
 └─────────────────┘  └────────┬─────────┘  └──────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    Zama Gateway     │
                    │ Decrypts ebool/     │
                    │ euint64 on-demand   │
                    └─────────────────────┘
```

---

## Deployed Contracts (Sepolia)

| Contract | Address |
|---|---|
| **PayrollFactory** | [`0x572555C8751d96Ee31dC0cbd89cb33097428072e`](https://sepolia.etherscan.io/address/0x572555C8751d96Ee31dC0cbd89cb33097428072e) |
| **ConfidentialPayroll** (default) | [`0xcEA4beC8cA7B49D49f5722f20e570c7647Dd8E05`](https://sepolia.etherscan.io/address/0xcEA4beC8cA7B49D49f5722f20e570c7647Dd8E05) |
| **PayrollToken (PAY)** (default) | [`0xc1Ab20Ae9c1387812132380A6E8EfDE7637Ab722`](https://sepolia.etherscan.io/address/0xc1Ab20Ae9c1387812132380A6E8EfDE7637Ab722) |

---

## Key Features

### Encrypted Salaries (Privacy by Default)

```solidity
euint64 salary = FHE.fromExternal(encryptedSalary, proof);
FHE.allow(salary, employer);
FHE.allow(salary, employee); // Only these two can see it
```

Salaries are stored as `euint64` ciphertexts. No onchain observer — not even validators — can read compensation data.

### Homomorphic Payroll Execution

```solidity
_employees[emp].balance = FHE.add(_employees[emp].balance, _employees[emp].salary);
// Arithmetic on encrypted values — no decryption during payroll
```

### Zero-Knowledge Compliance Proofs

```solidity
ebool isCompliant = FHE.ge(_employees[employee].salary, _minWage);
FHE.makePubliclyDecryptable(isCompliant);
// Anyone can verify "above minimum wage" — the salary is never revealed
```

### Selective Income Disclosure

```solidity
FHE.allowTransient(_employees[msg.sender].salary, verifier);
// One-transaction access — perfect for bank or rental applications
```

### Multi-Tenant Factory

Anyone can deploy their own PayrollToken + ConfidentialPayroll pair via the factory. Each employer gets an isolated payroll system.

### ERC-7984 Confidential Token

PAY token uses the ERC-7984 standard — encrypted balances, encrypted transfers, operator-based approvals.

---

## How It Works

### For Employers

1. **Create Payroll** — Deploy your own payroll system via the factory (one click)
2. **Setup** — Mint PAY tokens and approve the payroll contract as operator
3. **Add Employees** — Enter wallet address + salary. Salary is encrypted client-side with fhevmjs before hitting the blockchain
4. **Fund Pool** — Deposit PAY tokens into the payroll contract
5. **Run Payroll** — Execute payroll for all employees. Each encrypted balance is homomorphically increased by their encrypted salary
6. **Compliance** — Generate FHE proofs that any employee's salary meets minimum wage, without revealing the actual figure
7. **Process Withdrawals** — Approve employee withdrawal requests. Gateway decrypts and transfers tokens atomically

### For Employees

1. **Connect Wallet** — Join an existing payroll by entering the contract address, or get added by your employer
2. **View Salary** — Sign an EIP-712 message to decrypt your encrypted salary client-side. The plaintext never leaves your browser
3. **View Balance** — Same flow to see your accumulated encrypted balance
4. **Request Withdrawal** — Initiate a withdrawal request. Your employer approves it, and the gateway processes the encrypted transfer
5. **Income Proof** — Grant a verifier (bank, landlord, government) one-time transient access to your encrypted salary for income verification. No permanent exposure, no full financial history leak

---

## Tech Stack

| Layer | Technology |
|---|---|
| **FHE** | fhEVM, fhevmjs v0.6, @fhevm/solidity v0.11 |
| **Token** | ERC-7984 (OpenZeppelin Confidential Contracts v0.3) |
| **Contracts** | Solidity 0.8.x, Hardhat, hardhat-deploy |
| **Frontend** | Next.js 16, React 19, wagmi v3, Reown AppKit |
| **Styling** | Tailwind CSS 4 (Zama-inspired brutalist theme) |
| **Network** | Ethereum Sepolia with Zama coprocessor |
| **Hosting** | Vercel |

---

## Project Structure

```
StealthSalary/
├── confidential-payroll/            # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── PayrollToken.sol         # ERC-7984 confidential token (PAY)
│   │   ├── ConfidentialPayroll.sol   # Core payroll — salaries, payroll execution, compliance
│   │   ├── ConfidentialVesting.sol   # Encrypted equity vesting with cliff periods
│   │   └── PayrollFactory.sol       # Factory for multi-tenant deployment
│   ├── deploy/                      # Hardhat deployment scripts
│   ├── test/                        # Test suite (56 tests)
│   └── hardhat.config.ts
│
├── frontend/                        # Web application (Next.js 16)
│   └── src/
│       ├── app/
│       │   ├── page.tsx             # Home — create/join/select payroll
│       │   ├── employer/page.tsx    # Employer dashboard
│       │   └── employee/page.tsx    # Employee dashboard
│       ├── components/
│       │   ├── Providers.tsx        # wagmi + Reown AppKit setup
│       │   └── ThemeToggle.tsx      # Dark/light mode toggle
│       └── lib/
│           └── contracts.ts         # ABIs, addresses, FHE instance
│
└── README.md
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Browser wallet (MetaMask, Rabby, or any EIP-6963 compatible)
- Sepolia testnet ETH for gas

### Smart Contracts

```bash
cd confidential-payroll
npm install

# Run tests (local fhEVM mock)
npm test

# Deploy to Sepolia
cp .env.example .env    # Add DEPLOYER_PRIVATE_KEY
npm run deploy:sepolia
```

### Frontend

```bash
cd frontend
npm install

# Configure
cp .env.local.example .env.local
# Set: NEXT_PUBLIC_PAYROLL_ADDRESS, NEXT_PUBLIC_TOKEN_ADDRESS,
#       NEXT_PUBLIC_FACTORY_ADDRESS, NEXT_PUBLIC_REOWN_PROJECT_ID

npm run dev
# Open http://localhost:3000
```

---

## Encrypted Data Visibility

| Data | Type | Who Can See |
|---|---|---|
| Employee salary | `euint64` | Employer + that employee only |
| Employee balance | `euint64` | Employer + that employee only |
| Minimum wage threshold | `euint64` | Employer only |
| Compliance result | `ebool` | Public (via gateway decryption) |
| Token balances | `euint64` | Token holder only |
| Token transfers | `euint64` | Sender + receiver only |
| Vesting grant amount | `euint64` | Employer + beneficiary only |

---

## Withdrawal Flow

```
Employee                    Contract                     Zama Gateway
   │                           │                              │
   │── initiateWithdrawal() ──>│                              │
   │                           │── makePubliclyDecryptable ──>│
   │                           │      (balance handle)        │
   │                           │                              │
   │                           │<── employer approves ────────│
   │                           │    processWithdrawal()       │
   │                           │                              │
   │<── PAY token transfer ────│                              │
```

---

## Tests

56 tests passing across all contracts:

```
PayrollToken (3 tests)
  ✔ Deployment, minting, owner access control

ConfidentialPayroll (26 tests)
  ✔ Employee management — add, update salary, remove, access control
  ✔ Payroll execution — runPayroll, runPayrollFor, balance accumulation
  ✔ Compliance verification — FHE.ge against encrypted minWage
  ✔ Income proof / selective disclosure
  ✔ Withdrawal flow — initiate, gateway callback, balance reset
  ✔ End-to-end payroll cycle

ConfidentialVesting (16 tests)
  ✔ Schedule creation with encrypted grant amounts
  ✔ Cliff enforcement with time-based restrictions
  ✔ Vesting claim flow — initiate, gateway callback, claimed tracking
  ✔ Schedule revocation
```

```bash
cd confidential-payroll && npm test
```

---

## Why This Matters

Payroll is a **$1.4 trillion** industry. The only reason it hasn't moved onchain is privacy. StealthSalary proves:

1. **Technically feasible** — FHE enables full salary confidentiality at smart contract level
2. **Compliance without transparency** — regulators get cryptographic proofs, not raw data
3. **Employee empowerment** — selective disclosure to banks/landlords without full exposure
4. **Multi-tenant ready** — factory pattern lets anyone deploy their own private payroll
5. **Production architecture** — built on the Zama Protocol with gateway decryption pattern

---

## Built With

- [Zama fhEVM](https://docs.zama.ai/fhevm) — Fully Homomorphic Encryption for Ethereum
- [OpenZeppelin Confidential Contracts](https://github.com/OpenZeppelin/openzeppelin-confidential-contracts) — ERC-7984 implementation
- [Reown AppKit](https://reown.com) — Multi-wallet connectivity

---

## License

BSD-3-Clause-Clear
