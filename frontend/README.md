# Confidential Payroll -- Frontend

A privacy-preserving payroll interface built on Zama's fhEVM, enabling employers and employees to manage fully encrypted salary data directly from the browser.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS 4
- **Wallet**: wagmi v3, Reown AppKit (EIP-6963 multi-wallet discovery)
- **FHE**: fhevmjs v0.6 (client-side encryption, re-encryption)
- **Network**: Ethereum Sepolia testnet (chain ID 11155111) with Zama fhEVM coprocessor

## Prerequisites

- Node.js 20 or higher
- A browser wallet (MetaMask, Rabby, or any EIP-6963 compatible wallet)
- Sepolia testnet ETH (for gas fees)
- A deployed ConfidentialPayroll contract address

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_PAYROLL_ADDRESS` | Deployed ConfidentialPayroll contract address on Sepolia | Yes |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Reown (WalletConnect) project ID from https://cloud.reown.com | Yes |

## Development

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Pages

| Route | Description |
|---|---|
| `/` | Landing page -- project overview and wallet connection |
| `/employer` | Employer dashboard -- add employees, set encrypted salaries, run payroll, view compliance proofs |
| `/employee` | Employee dashboard -- view encrypted salary (via re-encryption), initiate withdrawals, disclose income to third parties |

## Key Features

- **Client-side FHE encryption**: Salary values are encrypted in the browser using fhevmjs before being sent to the contract. The plaintext never leaves the user's device.
- **EIP-712 re-encryption flow**: Employees sign a typed data message to generate a re-encryption keypair, allowing them to decrypt their own salary locally without exposing it onchain.
- **Gateway-based withdrawal**: Withdrawal requests go through the Zama gateway, which decrypts the salary amount and triggers the ETH transfer in a single atomic operation.
- **Income proof disclosure**: Employees can selectively grant third parties (lenders, landlords) transient access to their encrypted salary using `FHE.allowTransient`, enabling income verification without permanent data exposure.

## How FHE Encryption Works in the Frontend

1. The frontend initializes an fhevmjs instance configured with the Zama KMS and ACL contract addresses on Sepolia.
2. When an employer sets a salary, the app calls `instance.createEncryptedInput(contractAddress, userAddress)` to create an encryption context.
3. The plaintext salary value is added via `.add64(value)` and encrypted with `.encrypt()`, producing `handles` (ciphertext references) and an `inputProof` (attestation).
4. These are passed to the smart contract, which validates the encrypted input using `FHE.fromExternal()` and stores the resulting `euint64` handle.
5. For decryption, employees generate an ephemeral keypair, sign an EIP-712 message, and call `instance.reencrypt()` to retrieve the plaintext value -- decryption happens locally, never onchain.

## Network Configuration

- **Network**: Sepolia testnet
- **Chain ID**: 11155111
- **Zama KMS**: `0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A`
- **Zama ACL**: `0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D`
- **Relayer**: `https://relayer.testnet.zama.org`

## Build

```bash
npm run build
npm start
```

## License

BSD-3-Clause-Clear
