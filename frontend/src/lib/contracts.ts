// ── Deployed contract addresses ─────────────────────────────────────────────
export const DEFAULT_PAYROLL_ADDRESS =
  (process.env.NEXT_PUBLIC_PAYROLL_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

export const DEFAULT_TOKEN_ADDRESS =
  (process.env.NEXT_PUBLIC_TOKEN_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

export const FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

// Legacy exports for backwards compat
export const PAYROLL_ADDRESS = DEFAULT_PAYROLL_ADDRESS;
export const TOKEN_ADDRESS = DEFAULT_TOKEN_ADDRESS;

// Helper to get/set active payroll instance from localStorage
export function getActivePayroll(): { payroll: `0x${string}`; token: `0x${string}` } | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem("activePayroll");
  if (saved) {
    try { return JSON.parse(saved); } catch { /* ignore */ }
  }
  // Fall back to env defaults
  if (DEFAULT_PAYROLL_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    return { payroll: DEFAULT_PAYROLL_ADDRESS, token: DEFAULT_TOKEN_ADDRESS };
  }
  return null;
}

export function setActivePayroll(payroll: `0x${string}`, token: `0x${string}`) {
  localStorage.setItem("activePayroll", JSON.stringify({ payroll, token }));
}

// ── Shared FHEVM instance (singleton) ────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _fhevmInstance: any = null;

export async function getFhevmInstance() {
  if (_fhevmInstance) return _fhevmInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = (window as any).relayerSDK;
  if (!sdk) throw new Error("Relayer SDK not loaded. Please refresh the page.");
  await sdk.initSDK();

  // Use a dedicated JSON-RPC provider for contract reads (eip712Domain, etc.)
  // instead of window.ethereum which may use a flaky wallet RPC.
  const sepoliaRpc = "https://sepolia.gateway.tenderly.co/2fzYxtU8bvUzrChMEpPUhp";
  const rpcProvider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      const res = await fetch(sepoliaRpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.result;
    },
  };

  _fhevmInstance = await sdk.createInstance({
    ...sdk.SepoliaConfig,
    network: rpcProvider,
  });
  return _fhevmInstance;
}

// ── ConfidentialPayroll ABI (functions used by the frontend) ─────────────────
export const PAYROLL_ABI = [
  // View
  { name: "employer", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "gateway", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "payrollToken", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "employeeCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "contractBalance", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "totalDeposited", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalWithdrawn", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "isEmployee", type: "function", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "hasPendingWithdrawal", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  // Encrypted handles (bytes32)
  { name: "getMySalary", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "getMyBalance", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  // Employer actions
  {
    name: "addEmployee", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "employee", type: "address" }, { name: "encryptedSalary", type: "bytes32" }, { name: "proof", type: "bytes" }],
    outputs: [],
  },
  {
    name: "updateSalary", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "employee", type: "address" }, { name: "encryptedSalary", type: "bytes32" }, { name: "proof", type: "bytes" }],
    outputs: [],
  },
  {
    name: "updateMinWage", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "encryptedMinWage", type: "bytes32" }, { name: "proof", type: "bytes" }],
    outputs: [],
  },
  { name: "removeEmployee", type: "function", stateMutability: "nonpayable", inputs: [{ name: "employee", type: "address" }], outputs: [] },
  { name: "runPayroll", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    name: "checkCompliance", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "employee", type: "address" }],
    outputs: [{ type: "bytes32" }],
  },
  // Employee actions
  { name: "initiateWithdrawal", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    name: "generateIncomeProof", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "verifier", type: "address" }],
    outputs: [],
  },
  // Employer: deposit tokens (plaintext convenience)
  {
    name: "depositTokensPlaintext", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint64" }],
    outputs: [],
  },
  // Employer: withdraw tokens
  {
    name: "withdrawFunds", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint64" }],
    outputs: [],
  },
  // Employee list
  {
    name: "getEmployeeList", type: "function", stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  // Gateway: process withdrawal
  {
    name: "processWithdrawal", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "employee", type: "address" }, { name: "clearAmount", type: "uint64" }],
    outputs: [],
  },
  // Events
  { name: "EmployeeAdded", type: "event", inputs: [{ name: "employee", type: "address", indexed: true }] },
  { name: "PayrollRun", type: "event", inputs: [{ name: "timestamp", type: "uint256", indexed: true }, { name: "employeeCount", type: "uint256" }] },
  { name: "ComplianceChecked", type: "event", inputs: [{ name: "employee", type: "address", indexed: true }] },
  { name: "WithdrawalInitiated", type: "event", inputs: [{ name: "employee", type: "address", indexed: true }] },
  { name: "WithdrawalProcessed", type: "event", inputs: [{ name: "employee", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { name: "FundsDeposited", type: "event", inputs: [{ name: "sender", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { name: "FundsWithdrawn", type: "event", inputs: [{ name: "employer", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
] as const;

// ── PayrollToken (ERC-7984) ABI ─────────────────────────────────────────────
export const TOKEN_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "confidentialBalanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "bytes32" }] },
  { name: "confidentialTotalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "isOperator", type: "function", stateMutability: "view", inputs: [{ name: "holder", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "bool" }] },
  // Mint (owner only)
  {
    name: "mint", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint64" }],
    outputs: [],
  },
  // Set operator (holder grants operator access)
  {
    name: "setOperator", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "operator", type: "address" }, { name: "until", type: "uint48" }],
    outputs: [],
  },
  // Transfer
  {
    name: "confidentialTransfer", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "encryptedAmount", type: "bytes32" }, { name: "inputProof", type: "bytes" }],
    outputs: [{ type: "bytes32" }],
  },
] as const;

// ── PayrollFactory ABI ──────────────────────────────────────────────────────
export const FACTORY_ABI = [
  {
    name: "createPayroll", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "initialMint", type: "uint64" }],
    outputs: [{ name: "payroll", type: "address" }, { name: "token", type: "address" }],
  },
  {
    name: "getEmployerPayrolls", type: "function", stateMutability: "view",
    inputs: [{ name: "employer", type: "address" }],
    outputs: [{ type: "tuple[]", components: [{ name: "payroll", type: "address" }, { name: "token", type: "address" }] }],
  },
  {
    name: "totalInstances", type: "function", stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "PayrollCreated", type: "event",
    inputs: [
      { name: "employer", type: "address", indexed: true },
      { name: "payroll", type: "address", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "index", type: "uint256", indexed: false },
    ],
  },
] as const;
