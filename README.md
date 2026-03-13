# StealthSalary

### Fully Encrypted Onchain Payroll powered by FHE

> Privacy-preserving payroll where salaries are encrypted at every stage — storage, computation, and disclosure. No party, including the blockchain itself, ever sees plaintext compensation data.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.x-363636?logo=solidity)](https://soliditylang.org/)
[![fhEVM](https://img.shields.io/badge/fhEVM-Zama-ffd208)](https://docs.zama.ai/fhevm)
[![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=next.js)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-BSD--3--Clause--Clear-blue)](LICENSE)

---

## The Problem

Payroll is one of the most sensitive categories of financial data, yet current onchain payroll solutions expose salary amounts in plaintext on public ledgers. Employees' compensation becomes public knowledge, organizations leak competitive salary intelligence, and the fundamental privacy expectation of employer-employee relationships is violated.

Off-chain payroll systems solve privacy but sacrifice the transparency, auditability, and programmability that blockchains provide. **No existing solution delivers both onchain execution and genuine salary confidentiality.**

## The Solution

StealthSalary uses **Fully Homomorphic Encryption (FHE)** via fhEVM to keep salary data encrypted as `euint64` values throughout the entire lifecycle:

- Payroll is denominated in an **ERC-7984 confidential token** (PAY) — even fund transfers are encrypted
- Payroll totals are computed homomorphically (`FHE.add`) without decrypting individual salaries
- Employees decrypt their own salary client-side through an EIP-712 re-encryption flow
- Withdrawals are processed through the gateway for atomic decrypt-and-transfer

---

## Architecture

```
┌──────────┐          ┌─────────────────────┐          ┌──────────┐
│ Employer │          │   Contract (fhEVM)   │          │ Employee │
└────┬─────┘          └──────────┬──────────┘          └────┬─────┘
     │                           │                          │
     │── encrypt salary ────────>│                          │
     │   (fhevmjs client-side)   │── FHE.fromExternal()     │
     │                           │── store euint64 salary   │
     │                           │                          │
     │── run payroll ───────────>│                          │
     │                           │── FHE.add(total, salary) │
     │                           │   (homomorphic sum)      │
     │                           │                          │
     │                           │<──── request withdrawal ─│
     │                           │── gateway decrypts ──────│
     │                           │── transfer PAY tokens    │
     │                           │                          │
     │                           │<──── income proof ───────│
     │                           │── FHE.allowTransient() ──│
     │                           │   (selective disclosure) │
```

---

## Key Features

| Feature | Description |
|---|---|
| **Encrypted Salaries** | Stored as `euint64` ciphertexts — no onchain observer can read compensation data |
| **Homomorphic Payroll** | Totals computed via `FHE.add` without decrypting any individual salary |
| **Compliance Proofs** | Verify `salary >= minimumWage` using `FHE.gte` — no salary revealed |
| **Selective Disclosure** | Employees grant one-time read access to third parties (banks, landlords) via `FHE.allowTransient` |
| **ERC-7984 Token** | Confidential PAY token with encrypted balances and transfers |
| **Gateway Withdrawals** | Atomic decrypt-and-transfer prevents front-running |
| **Client-side Encryption** | Plaintext never leaves the browser — encrypted locally via fhevmjs |
| **Equity Vesting** | `ConfidentialVesting` contract with encrypted grant amounts and cliff periods |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **FHE** | fhEVM, fhevmjs v0.6, @fhevm/solidity v0.11 |
| **Token** | ERC-7984 (OpenZeppelin Confidential Contracts v0.3) |
| **Contracts** | Solidity 0.8.x, Hardhat, hardhat-deploy |
| **Frontend** | Next.js 16, React 19, wagmi v3, Reown AppKit |
| **Styling** | Tailwind CSS 4 |
| **Network** | Ethereum Sepolia with coprocessor |

---

## Project Structure

```
├── confidential-payroll/          # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── PayrollToken.sol       # ERC-7984 confidential token (PAY)
│   │   ├── ConfidentialPayroll.sol # Core payroll contract
│   │   └── ConfidentialVesting.sol # Encrypted equity vesting
│   ├── deploy/                    # Deployment scripts
│   └── test/                      # Test suite
│
└── frontend/                      # Web application (Next.js)
    └── src/app/
        ├── page.tsx               # Landing page
        ├── employer/page.tsx      # Employer dashboard
        └── employee/page.tsx      # Employee dashboard
```

---

## Quick Start

### Contracts

```bash
cd confidential-payroll
npm install

# Run tests (local fhEVM mock)
npm test

# Deploy to Sepolia
cp .env.example .env
# Add DEPLOYER_PRIVATE_KEY to .env
npm run deploy:sepolia
```

### Frontend

```bash
cd frontend
npm install

# Configure environment
cp .env.local.example .env.local
# Set NEXT_PUBLIC_PAYROLL_ADDRESS, NEXT_PUBLIC_TOKEN_ADDRESS, NEXT_PUBLIC_REOWN_PROJECT_ID

npm run dev
# Open http://localhost:3000
```

---

## Screenshots

| Light Mode | Dark Mode |
|---|---|
| Brutalist UI with Zama-inspired yellow accent | AMOLED black dark theme |

---

## Deployment

Deployed on **Sepolia testnet** (Chain ID `11155111`).

| Contract | Address |
|---|---|
| **ConfidentialPayroll** | `0xcEA4beC8cA7B49D49f5722f20e570c7647Dd8E05` |
| **PayrollToken (PAY)** | `0xc1Ab20Ae9c1387812132380A6E8EfDE7637Ab722` |

---

## How It Works

1. **Employer adds employees** — salary is encrypted client-side with fhevmjs before submitting to the blockchain
2. **Employer runs payroll** — contract homomorphically adds each employee's encrypted salary to their encrypted balance
3. **Employee views salary** — signs an EIP-712 permit to decrypt their own salary/balance client-side
4. **Employee withdraws** — initiates withdrawal, employer approves, gateway decrypts and transfers PAY tokens
5. **Income verification** — employee grants transient FHE access to a third-party contract for proof-of-income

---

## Tests

56 tests passing across `PayrollToken`, `ConfidentialPayroll`, and `ConfidentialVesting` contracts.

```bash
cd confidential-payroll
npm test
```

---

## License

BSD-3-Clause-Clear
