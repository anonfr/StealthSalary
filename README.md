# StealthSalary

**Fully encrypted onchain payroll powered by Fully Homomorphic Encryption (FHE)**

> Salaries are stored, computed, and transferred as FHE ciphertexts — no one on the blockchain, including validators, can ever see compensation data.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-stealth--salary.vercel.app-ffd208?style=flat-square&logo=vercel&logoColor=black)](https://stealth-salary.vercel.app)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.x-363636?style=flat-square&logo=solidity)](https://soliditylang.org/)
[![fhEVM](https://img.shields.io/badge/Zama-fhEVM-ffd208?style=flat-square)](https://docs.zama.ai/fhevm)
[![ERC-7984](https://img.shields.io/badge/Token-ERC--7984-blue?style=flat-square)](https://eips.ethereum.org/EIPS/eip-7984)
[![Network](https://img.shields.io/badge/Network-Sepolia-purple?style=flat-square)](https://sepolia.etherscan.io)
[![License](https://img.shields.io/badge/License-BSD--3--Clause--Clear-blue?style=flat-square)](LICENSE)

---

## Live Demo

**[https://stealth-salary.vercel.app](https://stealth-salary.vercel.app)**

- Network: **Ethereum Sepolia** (Chain ID 11155111)
- Get Sepolia ETH: [sepoliafaucet.com](https://sepoliafaucet.com) or [faucet.quicknode.com/ethereum/sepolia](https://faucet.quicknode.com/ethereum/sepolia)

---

## What Is StealthSalary?

StealthSalary solves the biggest barrier to onchain payroll: **privacy**.

On public blockchains, every salary, every payment, every balance is visible to anyone. StealthSalary uses **Fully Homomorphic Encryption** via [Zama's fhEVM](https://docs.zama.ai/fhevm) to keep all payroll data encrypted — even while performing arithmetic on it. The contract can add encrypted salaries to encrypted balances without ever decrypting them.

### What Makes It Different

| Traditional Onchain Payroll | StealthSalary |
|---|---|
| Salaries visible on-chain | Salaries stored as FHE ciphertexts (`euint64`) |
| Anyone can see balances | Only the individual can decrypt their own balance |
| Compliance requires revealing amounts | Compliance proven via FHE comparison — no amounts revealed |
| Token transfers are public | ERC-7984 confidential token with encrypted transfers |

---

## How It Works

### The FHE Stack

```
Browser (fhevmjs)                    Sepolia + Zama Coprocessor
      │                                         │
      │  encrypt(salary) ──────────────────────>│ store as euint64
      │                                         │
      │  FHE.add(balance, salary) ─ homomorphic computation (no decryption)
      │                                         │
      │  sign EIP-712 permit ──────────────────>│
      │                   Zama KMS re-encrypts ─┘
      │<─ decrypt locally ──────────────────────
```

1. **Client-side encryption** — fhevmjs encrypts salary in the browser before it ever touches the blockchain
2. **Homomorphic payroll** — `FHE.add(balance, salary)` runs onchain without decrypting either value
3. **Re-encryption for viewing** — employee signs an EIP-712 permit, Zama KMS re-encrypts the handle, decryption happens locally
4. **Confidential token** — PAY token uses ERC-7984, all balances and transfers are encrypted

---

## Getting Started (Using the Live Site)

### Prerequisites

- MetaMask or any EIP-6963 wallet (Rabby, Frame, etc.)
- Sepolia testnet ETH for gas

---

### As an Employer

#### Step 1 — Create Your Payroll

1. Go to [stealth-salary.vercel.app](https://stealth-salary.vercel.app)
2. Connect your wallet (make sure you're on **Sepolia**)
3. Click **"Create New Payroll"**
4. Approve the transaction in MetaMask — this deploys your own `PayrollToken` + `ConfidentialPayroll` contracts
5. Your new payroll appears under **"Your Payrolls"** — click **Select**

#### Step 2 — Token Setup (do this before anything else)

In the Employer Dashboard, find the **Token Setup** section:

1. **Mint Tokens** — enter an amount (e.g. `10000`) and click **"Mint to Wallet"**. This mints PAY tokens to your wallet.
2. **Approve Operator** — click **"Approve Payroll as Operator"**. This allows the payroll contract to transfer tokens from your wallet. Required before depositing.

#### Step 3 — Fund the Payroll Pool

1. Enter an amount in the **Fund Payroll Pool** section (e.g. `5000`)
2. Click **"Deposit PAY Tokens"**
3. Approve the transaction — tokens are transferred into the payroll contract

#### Step 4 — Add Employees

1. Enter the employee's **wallet address**
2. Enter their **monthly salary** in token units (e.g. `3000` = 3000 PAY/month)
3. Click **"Encrypt & Add Employee"**
4. The salary is **encrypted in your browser** using fhevmjs before being sent to the contract — the plaintext never leaves your device

#### Step 5 — Run Payroll

Click **"Run Payroll for All Employees"** — the contract executes `FHE.add(balance, salary)` for each employee homomorphically. No salary is decrypted during this operation.

#### Step 6 — Process Withdrawals

When an employee requests a withdrawal, it appears in **Pending Withdrawals**:
1. Enter the salary amount for that employee
2. Click **"Approve"** — tokens are transferred to the employee's wallet

#### Other Employer Actions

- **Compliance Check** — enter an employee address and generate an FHE proof that their salary meets minimum wage. Anyone can verify the result without seeing the actual salary.
- **Withdraw Funds** — pull PAY tokens back out of the contract (emergency/offboarding)
- **Remove Employee** — deactivate an employee. Their accumulated balance is preserved.

---

### As an Employee

#### Step 1 — Join a Payroll

1. Go to [stealth-salary.vercel.app](https://stealth-salary.vercel.app)
2. Connect your wallet
3. Click **"Join Existing Payroll"** and enter the payroll contract address your employer gave you
4. Click **"Employee"** to open your dashboard

#### Step 2 — View Your Salary

1. Click **"Decrypt"** next to **Monthly Salary**
2. A MetaMask popup appears asking you to sign an **EIP-712 permit** (this is free — no gas)
3. The Zama gateway re-encrypts your salary handle with your keypair
4. Your salary is decrypted **locally in your browser** — the plaintext never goes onchain

#### Step 3 — View Your Balance

Same process as viewing salary — click **"Decrypt"** next to **Accumulated Balance**.

#### Step 4 — Withdraw Salary

1. Click **"Initiate Withdrawal"**
2. Your employer sees the request in their **Pending Withdrawals** queue and approves it
3. PAY tokens are transferred to your wallet

#### Step 5 — Income Proof (optional)

To prove your salary to a third party (bank, landlord, verifier contract):
1. Enter the verifier's wallet address in **Income Proof**
2. Click **"Grant Proof"**
3. This calls `FHE.allowTransient(salary, verifier)` — the verifier gets one-transaction access to read your salary. It expires after that single transaction. No permanent exposure.

---

## Architecture

```
                     ┌───────────────────────┐
                     │    PayrollFactory      │
                     │  createPayroll()       │
                     │  getEmployerPayrolls() │
                     └──────────┬────────────┘
                                │ deploys pair per employer
              ┌─────────────────┼──────────────────┐
              │                                    │
   ┌──────────▼──────────┐            ┌────────────▼────────────┐
   │  PayrollToken.sol   │            │  ConfidentialPayroll.sol │
   │  (ERC-7984)         │            │                          │
   │                     │◄───────────│  euint64 salary          │
   │  Encrypted balances │ operator   │  euint64 balance         │
   │  Encrypted transfers│            │  FHE.add (homomorphic)   │
   │  setOperator()      │            │  FHE.ge  (compliance)    │
   └─────────────────────┘            │  FHE.allowTransient      │
                                      └────────────┬─────────────┘
                                                   │
                                      ┌────────────▼─────────────┐
                                      │     Zama Gateway         │
                                      │  makePubliclyDecryptable │
                                      │  userDecrypt (KMS)       │
                                      └──────────────────────────┘
```

### Smart Contracts

| Contract | Address (Sepolia) | Description |
|---|---|---|
| **PayrollFactory** | [`0x572555C8751d96Ee31dC0cbd89cb33097428072e`](https://sepolia.etherscan.io/address/0x572555C8751d96Ee31dC0cbd89cb33097428072e) | Factory for multi-tenant deployment |
| **ConfidentialPayroll** *(default)* | [`0xcEA4beC8cA7B49D49f5722f20e570c7647Dd8E05`](https://sepolia.etherscan.io/address/0xcEA4beC8cA7B49D49f5722f20e570c7647Dd8E05) | Core payroll logic |
| **PayrollToken (PAY)** *(default)* | [`0xc1Ab20Ae9c1387812132380A6E8EfDE7637Ab722`](https://sepolia.etherscan.io/address/0xc1Ab20Ae9c1387812132380A6E8EfDE7637Ab722) | ERC-7984 confidential token |

### Key Contract Functions

```solidity
// Employer: add employee with FHE-encrypted salary
addEmployee(address employee, externalEuint64 encSalary, bytes proof)

// Employer: credit all employees' encrypted balances by their encrypted salary
// No decryption happens — pure homomorphic addition
runPayroll()

// Employer: prove salary >= minimum wage without revealing amount
checkCompliance(address employee) → ebool (publicly decryptable)

// Employee: grant one-time salary access to a verifier
generateIncomeProof(address verifier)  // uses FHE.allowTransient

// Employee: request withdrawal
initiateWithdrawal()

// Employer: process employee withdrawal, transfer tokens
processWithdrawal(address employee, uint64 amount)
```

### Encrypted Data Visibility

| Data | Type | Who Can Read |
|---|---|---|
| Employee salary | `euint64` | Employer + that employee only |
| Accumulated balance | `euint64` | Employer + that employee only |
| Minimum wage threshold | `euint64` | Employer only |
| Compliance result | `ebool` | Public (decrypted via Zama gateway) |
| PAY token balances | `euint64` | Token holder only |
| PAY token transfers | `euint64` | Sender + receiver only |

---

## Project Structure

```
StealthSalary/
├── confidential-payroll/              # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── PayrollToken.sol           # ERC-7984 PAY token (encrypted balances)
│   │   ├── ConfidentialPayroll.sol    # Core payroll: salaries, compliance, withdrawal
│   │   ├── ConfidentialVesting.sol    # Encrypted equity vesting with cliff periods
│   │   └── PayrollFactory.sol        # Multi-tenant factory
│   ├── deploy/                        # Hardhat deploy scripts
│   ├── scripts/                       # Utility scripts (deployFactory.ts)
│   └── test/                          # 56 tests (mock fhEVM)
│
└── frontend/                          # Next.js 16 app
    └── src/
        ├── app/
        │   ├── page.tsx               # Home: create / join / select payroll
        │   ├── employer/page.tsx      # Employer dashboard
        │   └── employee/page.tsx      # Employee dashboard
        ├── components/
        │   ├── Providers.tsx          # wagmi + Reown AppKit
        │   ├── ThemeToggle.tsx        # Dark / light mode
        │   └── TxOverlay.tsx         # Transaction progress overlay
        └── lib/
            └── contracts.ts           # ABIs, addresses, fhevmjs instance
```

---

## Running Locally

### Prerequisites

- Node.js 20+
- MetaMask with Sepolia testnet ETH

### Frontend

```bash
git clone https://github.com/anonfr/StealthSalary.git
cd StealthSalary/frontend
npm install

# Create environment file
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_FACTORY_ADDRESS=0x572555C8751d96Ee31dC0cbd89cb33097428072e
NEXT_PUBLIC_PAYROLL_ADDRESS=0xcEA4beC8cA7B49D49f5722f20e570c7647Dd8E05
NEXT_PUBLIC_TOKEN_ADDRESS=0xc1Ab20Ae9c1387812132380A6E8EfDE7637Ab722
NEXT_PUBLIC_REOWN_PROJECT_ID=<your_reown_project_id>
```

```bash
npm run dev
# Open http://localhost:3000
```

### Smart Contracts

```bash
cd StealthSalary/confidential-payroll
npm install

# Run tests against fhEVM mock
npm test

# Deploy to Sepolia
cp .env.example .env
# Add DEPLOYER_PRIVATE_KEY to .env
npx hardhat run scripts/deployFactory.ts --network sepolia
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| FHE Engine | Zama fhEVM + fhevmjs v0.6 |
| FHE Solidity | @fhevm/solidity v0.11 |
| Confidential Token | ERC-7984 via OpenZeppelin Confidential Contracts v0.3 |
| Smart Contracts | Solidity 0.8.x, Hardhat, hardhat-deploy |
| Frontend | Next.js 16, React 19, TypeScript |
| Wallet | wagmi v3, Reown AppKit (EIP-6963 multi-wallet) |
| Styling | Tailwind CSS 4 |
| Network | Ethereum Sepolia + Zama coprocessor |
| Hosting | Vercel |

---

## Tests

```
56 tests passing

PayrollToken         (3)  — deployment, minting, access control
ConfidentialPayroll (26)  — employee management, payroll execution,
                            compliance proofs, income disclosure, withdrawals
ConfidentialVesting (16)  — encrypted grants, cliff enforcement, vesting claims
FHECounter           (3)  — template baseline
```

```bash
cd confidential-payroll && npm test
```

---

## Why This Matters

**Payroll is a $1.4 trillion industry.** The only reason it hasn't moved onchain is privacy.

StealthSalary proves it's technically feasible:

- **No salary leaks** — FHE ciphertexts are opaque to every observer
- **No compliance tradeoffs** — regulators get cryptographic proofs, not raw data
- **Employee control** — selective disclosure with `FHE.allowTransient`, one-time access only
- **Multi-tenant** — factory pattern lets any organization deploy their own private payroll
- **Production-grade** — built on Zama Protocol with the full KMS/gateway decryption pattern

---

## License

BSD-3-Clause-Clear
