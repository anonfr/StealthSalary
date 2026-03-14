"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { isAddress, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import Link from "next/link";
import { PAYROLL_ABI, TOKEN_ADDRESS, TOKEN_ABI, getFhevmInstance, getActivePayroll } from "@/lib/contracts";
import { TxOverlay, useTxOverlay } from "@/components/TxOverlay";

function toHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] p-4">
      <div className="text-xs text-[var(--fg-muted)] mb-1 uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold text-[var(--fg)]">{value}</div>
      {sub && <div className="text-xs text-[var(--fg-muted)] mt-1">{sub}</div>}
    </div>
  );
}

function TxButton({ onClick, loading, disabled, children, variant = "primary" }: {
  onClick: () => void; loading?: boolean; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "secondary" | "danger";
}) {
  const base = "px-4 py-2 font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "accent-btn",
    secondary: "bg-[var(--base-300)] hover:bg-[var(--accent)] hover:text-[var(--fg-on-accent)] text-[var(--fg)] border border-[var(--border)] transition-colors",
    danger: "bg-[var(--base-300)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] border border-[var(--border)] transition-colors",
  };
  return <button onClick={onClick} disabled={disabled || loading} className={`${base} ${variants[variant]}`}>{loading ? "Processing..." : children}</button>;
}

function Toast({ message, type }: { message: string; type: "success" | "error" | "info" }) {
  const styles: Record<string, string> = {
    success: "border-l-4 border-l-[var(--success)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)]",
    error: "border-l-4 border-l-[var(--error)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)]",
    info: "border-l-4 border-l-[var(--accent)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)]",
  };
  return <div className={`fixed bottom-6 right-6 max-w-sm px-4 py-3 border text-sm fade-in ${styles[type]}`}>{message}</div>;
}

export default function EmployerPage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  // Dynamic payroll address from localStorage
  const active = getActivePayroll();
  const PAYROLL_ADDRESS = (active?.payroll ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const ACTIVE_TOKEN = (active?.token ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => { setToast({ message, type }); setTimeout(() => setToast(null), 4000); };
  const tx = useTxOverlay();

  const { data: employer, isLoading: loadingEmployer } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "employer" });
  const { data: empCount, refetch: refetchCount } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "employeeCount" });
  const { data: balance, refetch: refetchBalance } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "contractBalance" });
  const { data: totalDeposited } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "totalDeposited" });
  const { data: totalWithdrawn } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "totalWithdrawn" });
  const { data: employeeList, refetch: refetchList } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "getEmployeeList" }) as { data?: readonly `0x${string}`[]; refetch: () => void };

  const isOwner = isConnected && employer && address?.toLowerCase() === employer.toLowerCase();

  const [empAddress, setEmpAddress] = useState("");
  const [salary, setSalary] = useState("");
  const [addingEmp, setAddingEmp] = useState(false);
  const handleAddEmployee = async () => {
    if (!isAddress(empAddress) || !salary || !address) return;
    setAddingEmp(true);
    tx.start("Adding Employee", ["Encrypting salary with FHE", "Waiting for wallet approval", "Confirming on chain", "Employee added"]);
    try {
      const instance = await getFhevmInstance();
      const input = instance.createEncryptedInput(PAYROLL_ADDRESS, address);
      const result = await input.add64(BigInt(Math.round(parseFloat(salary) * 1e6))).encrypt();
      const handle = toHex(result.handles[0]) as `0x${string}`;
      const inputProof = toHex(result.inputProof) as `0x${string}`;
      tx.advance(1);
      const hash = await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "addEmployee", args: [empAddress as `0x${string}`, handle, inputProof] });
      tx.advance(2); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
      setEmpAddress(""); setSalary(""); refetchCount(); refetchList();
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setAddingEmp(false); }
  };

  const [runningPayroll, setRunningPayroll] = useState(false);
  const handleRunPayroll = async () => {
    setRunningPayroll(true);
    tx.start("Running Payroll", ["Waiting for wallet approval", "Executing homomorphic payroll", "Balances updated"]);
    try {
      const hash = await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "runPayroll" });
      tx.advance(1); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setRunningPayroll(false); }
  };

  const [checkAddr, setCheckAddr] = useState("");
  const [checkingCompliance, setCheckingCompliance] = useState(false);
  const handleCheckCompliance = async () => {
    if (!isAddress(checkAddr)) return;
    setCheckingCompliance(true);
    tx.start("Compliance Check", ["Waiting for wallet approval", "Generating FHE proof (salary >= min wage)", "Proof submitted"]);
    try {
      const hash = await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "checkCompliance", args: [checkAddr as `0x${string}`] });
      tx.advance(1); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setCheckingCompliance(false); }
  };

  // ── Setup: Mint + Set Operator ──────────────────────────────────────────────
  const [mintAmount, setMintAmount] = useState("");
  const [minting, setMinting] = useState(false);
  const [settingOperator, setSettingOperator] = useState(false);

  const { data: isOperatorSet, refetch: refetchOperator } = useReadContract({
    address: ACTIVE_TOKEN, abi: TOKEN_ABI, functionName: "isOperator",
    args: [address ?? "0x0000000000000000000000000000000000000000", PAYROLL_ADDRESS],
  });

  const handleMint = async () => {
    if (!mintAmount || !address) return;
    setMinting(true);
    tx.start("Minting PAY Tokens", ["Waiting for wallet approval", "Minting tokens via FHE", `${mintAmount} PAY minted`]);
    try {
      const amount = BigInt(Math.round(parseFloat(mintAmount) * 1e6));
      const hash = await writeContractAsync({ address: ACTIVE_TOKEN, abi: TOKEN_ABI, functionName: "mint", args: [address, amount], gas: BigInt(5_000_000) });
      tx.advance(1); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
      setMintAmount("");
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setMinting(false); }
  };

  const handleSetOperator = async () => {
    setSettingOperator(true);
    tx.start("Approving Operator", ["Waiting for wallet approval", "Setting payroll as token operator", "Operator approved"]);
    try {
      const hash = await writeContractAsync({ address: ACTIVE_TOKEN, abi: TOKEN_ABI, functionName: "setOperator", args: [PAYROLL_ADDRESS, 4102444800], gas: BigInt(500_000) });
      tx.advance(1); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
      refetchOperator();
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setSettingOperator(false); }
  };

  const [fundAmount, setFundAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const handleFund = async () => {
    if (!fundAmount) return;
    setFunding(true);
    tx.start("Depositing Tokens", ["Waiting for wallet approval", "Encrypting & transferring tokens", `${fundAmount} PAY deposited`]);
    try {
      const amount = BigInt(Math.round(parseFloat(fundAmount) * 1e6));
      const hash = await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "depositTokensPlaintext", args: [amount], gas: BigInt(8_000_000) });
      tx.advance(1); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
      setFundAmount(""); refetchBalance();
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setFunding(false); }
  };

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    setWithdrawing(true);
    tx.start("Withdrawing Tokens", ["Waiting for wallet approval", "Processing withdrawal", `${withdrawAmount} PAY withdrawn`]);
    try {
      const amount = BigInt(Math.round(parseFloat(withdrawAmount) * 1e6));
      const hash = await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "withdrawFunds", args: [amount] });
      tx.advance(1); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
      setWithdrawAmount(""); refetchBalance();
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setWithdrawing(false); }
  };

  const [removeAddr, setRemoveAddr] = useState("");
  const [removing, setRemoving] = useState(false);
  const handleRemove = async () => {
    if (!isAddress(removeAddr)) return;
    setRemoving(true);
    tx.start("Removing Employee", ["Waiting for wallet approval", "Removing from payroll", "Employee removed"]);
    try {
      const hash = await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "removeEmployee", args: [removeAddr as `0x${string}`] });
      tx.advance(1); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
      setRemoveAddr(""); refetchCount(); refetchList();
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setRemoving(false); }
  };

  // ── Pending Withdrawals ──────────────────────────────────────────────────
  const [pendingWithdrawals, setPendingWithdrawals] = useState<`0x${string}`[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});
  const [processingAddr, setProcessingAddr] = useState<string | null>(null);

  const fetchPendingWithdrawals = useCallback(async () => {
    if (!employeeList || employeeList.length === 0) return;
    setLoadingPending(true);
    try {
      const client = createPublicClient({ chain: sepolia, transport: http("https://sepolia.gateway.tenderly.co/2fzYxtU8bvUzrChMEpPUhp") });
      const results = await Promise.all(
        employeeList.map((addr) =>
          client.readContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "hasPendingWithdrawal", args: [addr] })
        )
      );
      const pending = employeeList.filter((_, i) => results[i]) as `0x${string}`[];
      setPendingWithdrawals(pending);
    } catch { /* ignore */ }
    setLoadingPending(false);
  }, [employeeList]);

  useEffect(() => { fetchPendingWithdrawals(); }, [fetchPendingWithdrawals]);

  const handleProcessWithdrawal = async (emp: `0x${string}`) => {
    const amountStr = withdrawAmounts[emp];
    if (!amountStr) { showToast("Enter the salary amount for this employee", "error"); return; }
    setProcessingAddr(emp);
    tx.start("Processing Withdrawal", ["Waiting for wallet approval", `Sending ${amountStr} PAY to ${emp.slice(0, 8)}...`, "Withdrawal processed"]);
    try {
      const amount = BigInt(Math.round(parseFloat(amountStr) * 1e6));
      const hash = await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "processWithdrawal", args: [emp, amount] });
      tx.advance(1); tx.setHash(hash);
      await new Promise((r) => setTimeout(r, 3000));
      tx.complete();
      setWithdrawAmounts((prev) => { const n = { ...prev }; delete n[emp]; return n; });
      fetchPendingWithdrawals();
      refetchBalance();
    } catch (e: unknown) { tx.fail((e as Error).message?.slice(0, 80) ?? "Failed");
    } finally { setProcessingAddr(null); }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--fg-muted)] mb-4">Please connect your wallet</p>
          <Link href="/" className="text-[var(--accent)] hover:underline">← Back to home</Link>
        </div>
      </div>
    );
  }

  if (loadingEmployer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6 fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-xs text-[var(--fg-muted)] hover:text-[var(--accent)] mb-2 block">← Home</Link>
            <h1 className="text-2xl font-bold text-[var(--fg)]">Employer Dashboard</h1>
            <p className="text-[var(--fg-muted)] text-sm mt-1 font-mono">{employer?.slice(0, 10)}...{employer?.slice(-6)}</p>
          </div>
          {isOwner ? (
            <span className="accent-badge px-3 py-1 text-xs font-mono">FHE Active</span>
          ) : (
            <span className="px-3 py-1 border border-[var(--border)] bg-[var(--base-300)] text-[var(--fg-muted)] text-xs">Read-only — not employer</span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Employees" value={empCount?.toString() ?? "—"} />
          <StatCard label="Contract Balance" value={balance ? "(encrypted)" : "—"} sub="ERC-7984 PAY tokens" />
          <StatCard label="Total Deposited" value={totalDeposited ? `${(Number(totalDeposited) / 1e6).toLocaleString()} PAY` : "—"} />
          <StatCard label="Total Withdrawn" value={totalWithdrawn ? `${(Number(totalWithdrawn) / 1e6).toLocaleString()} PAY` : "—"} />
        </div>

        {/* Add Employee */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span className="accent-badge w-6 h-6 text-xs flex items-center justify-center font-bold">+</span>
            Add Employee
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--fg-muted)] mb-1 block uppercase tracking-wider">Employee Address</label>
              <input className="w-full bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm font-mono text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]" placeholder="0x..." value={empAddress} onChange={(e) => setEmpAddress(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[var(--fg-muted)] mb-1 block uppercase tracking-wider">Monthly Salary (token units)</label>
              <div className="relative">
                <input className="w-full bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]" placeholder="3000" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
                <span className="absolute right-3 top-2 text-xs text-[var(--fg-muted)]">encrypted with FHE</span>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-[var(--base-300)] border-l-4 border-l-[var(--accent)] border border-[var(--border)] text-xs text-[var(--fg)]">
              🔒 The salary will be encrypted client-side before being sent to the blockchain.
            </div>
            <TxButton onClick={handleAddEmployee} loading={addingEmp} disabled={!isOwner || !isAddress(empAddress) || !salary}>Encrypt & Add Employee</TxButton>
          </div>
        </div>

        {/* Run Payroll + Compliance */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
            <h2 className="font-semibold mb-2 text-[var(--fg)]">Run Payroll</h2>
            <p className="text-xs text-[var(--fg-muted)] mb-4">Credits each employee&apos;s encrypted balance by their encrypted salary. All arithmetic is homomorphic.</p>
            <TxButton onClick={handleRunPayroll} loading={runningPayroll} disabled={!isOwner}>Run Payroll for All Employees</TxButton>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
            <h2 className="font-semibold mb-2 text-[var(--fg)]">Compliance Check</h2>
            <p className="text-xs text-[var(--fg-muted)] mb-3">Proves salary &ge; minimum wage using FHE comparison. No salary is revealed.</p>
            <input className="w-full bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm font-mono text-[var(--fg)] mb-3 focus:outline-none focus:border-[var(--accent)]" placeholder="Employee address" value={checkAddr} onChange={(e) => setCheckAddr(e.target.value)} />
            <TxButton onClick={handleCheckCompliance} loading={checkingCompliance} disabled={!isOwner || !isAddress(checkAddr)} variant="secondary">Generate Compliance Proof</TxButton>
          </div>
        </div>

        {/* Setup: Mint + Operator */}
        {isOwner && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
            <h2 className="font-semibold mb-2 flex items-center gap-2">
              <span className="accent-badge w-6 h-6 text-xs flex items-center justify-center font-bold">⚙</span>
              Token Setup
            </h2>
            <p className="text-xs text-[var(--fg-muted)] mb-4">Mint PAY tokens and approve the payroll contract before depositing.</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[var(--fg-muted)] mb-1 block uppercase tracking-wider">Mint Tokens</label>
                <div className="flex gap-2 mb-2">
                  <input className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]" placeholder="10000" type="number" value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} />
                  <span className="flex items-center text-sm text-[var(--fg-muted)]">PAY</span>
                </div>
                <TxButton onClick={handleMint} loading={minting} disabled={!mintAmount}>Mint to Wallet</TxButton>
              </div>
              <div>
                <label className="text-xs text-[var(--fg-muted)] mb-1 block uppercase tracking-wider">Operator Approval</label>
                <p className="text-xs text-[var(--fg-muted)] mb-2">
                  {isOperatorSet ? "Payroll contract is approved as operator." : "Payroll contract needs operator approval to transfer tokens."}
                </p>
                {isOperatorSet ? (
                  <span className="accent-badge px-3 py-1 text-xs">Approved</span>
                ) : (
                  <TxButton onClick={handleSetOperator} loading={settingOperator}>Approve Payroll as Operator</TxButton>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Fund + Withdraw */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
            <h2 className="font-semibold mb-2 text-[var(--fg)]">Fund Payroll Pool</h2>
            <p className="text-xs text-[var(--fg-muted)] mb-3">Deposit PAY tokens so employees can withdraw.</p>
            <div className="flex gap-2 mb-3">
              <input className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]" placeholder="1000" type="number" step="1" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
              <span className="flex items-center text-sm text-[var(--fg-muted)]">PAY</span>
            </div>
            <TxButton onClick={handleFund} loading={funding} disabled={!isOwner || !fundAmount} variant="secondary">Deposit PAY Tokens</TxButton>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
            <h2 className="font-semibold mb-2 text-[var(--fg)]">Withdraw Funds</h2>
            <p className="text-xs text-[var(--fg-muted)] mb-3">Withdraw PAY tokens from the contract.</p>
            <div className="flex gap-2 mb-3">
              <input className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]" placeholder="500" type="number" step="1" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
              <span className="flex items-center text-sm text-[var(--fg-muted)]">PAY</span>
            </div>
            <TxButton onClick={handleWithdraw} loading={withdrawing} disabled={!isOwner || !withdrawAmount} variant="secondary">Withdraw PAY Tokens</TxButton>
          </div>
        </div>

        {/* Pending Withdrawals */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="accent-badge w-6 h-6 text-xs flex items-center justify-center font-bold">!</span>
              Pending Withdrawals
            </h2>
            <button onClick={fetchPendingWithdrawals} disabled={loadingPending} className="text-xs text-[var(--accent)] hover:underline transition-colors">
              {loadingPending ? "Checking..." : "Refresh"}
            </button>
          </div>
          <p className="text-xs text-[var(--fg-muted)] mb-4">
            When an employee requests a withdrawal, it appears here. Enter their salary amount and approve to send PAY tokens to their wallet.
          </p>
          {pendingWithdrawals.length === 0 ? (
            <div className="text-sm text-[var(--fg-muted)] text-center py-4 border border-dashed border-[var(--border)]">No pending withdrawal requests</div>
          ) : (
            <div className="space-y-3">
              {pendingWithdrawals.map((emp) => (
                <div key={emp} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-[var(--base-300)] border border-[var(--border)]">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm text-[var(--fg)] break-all">{emp}</span>
                    <div className="text-xs text-[var(--fg-muted)] mt-1">Waiting for approval</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      className="w-28 bg-[var(--bg-input)] border border-[var(--border)] px-2 py-1.5 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                      placeholder="Amount"
                      type="number"
                      value={withdrawAmounts[emp] ?? ""}
                      onChange={(e) => setWithdrawAmounts((prev) => ({ ...prev, [emp]: e.target.value }))}
                    />
                    <span className="text-xs text-[var(--fg-muted)]">PAY</span>
                    <TxButton
                      onClick={() => handleProcessWithdrawal(emp)}
                      loading={processingAddr === emp}
                      disabled={!isOwner || !withdrawAmounts[emp]}
                      variant="primary"
                    >
                      Approve
                    </TxButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Remove Employee */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
          <h2 className="font-semibold mb-2 text-[var(--error)]">Remove Employee</h2>
          <p className="text-xs text-[var(--fg-muted)] mb-3">Deactivates an employee. Existing balance is preserved.</p>
          <input className="w-full bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm font-mono text-[var(--fg)] mb-3 focus:outline-none focus:border-[var(--accent)]" placeholder="Employee address" value={removeAddr} onChange={(e) => setRemoveAddr(e.target.value)} />
          <TxButton onClick={handleRemove} loading={removing} disabled={!isOwner || !isAddress(removeAddr)} variant="danger">Remove Employee</TxButton>
        </div>

        {/* Employee List */}
        {employeeList && employeeList.length > 0 && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
            <h2 className="font-semibold mb-3 text-[var(--fg)]">Registered Employees</h2>
            <div className="space-y-2">
              {employeeList.map((addr, i) => (
                <div key={addr} className="flex items-center justify-between px-3 py-2 bg-[var(--base-300)] border border-[var(--border)]">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--fg-muted)] w-5">{i + 1}</span>
                    <span className="font-mono text-sm text-[var(--fg)]">{addr.slice(0, 10)}...{addr.slice(-6)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCheckAddr(addr)} className="text-xs px-2 py-1 border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--accent)] hover:text-[var(--fg-on-accent)] text-[var(--fg)] transition-colors">Check Compliance</button>
                    <button onClick={() => setRemoveAddr(addr)} className="text-xs px-2 py-1 border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] transition-colors">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contract Info */}
        <div className="bg-[var(--base-300)] border border-[var(--border)] p-5 text-xs font-mono">
          <div className="flex gap-2 mb-1"><span className="text-[var(--fg-muted)]">Payroll:</span><span className="text-[var(--fg)]">{PAYROLL_ADDRESS ?? "—"}</span></div>
          <div className="flex gap-2 mb-1"><span className="text-[var(--fg-muted)]">Token:</span><span className="text-[var(--fg)]">{ACTIVE_TOKEN ?? TOKEN_ADDRESS}</span></div>
          <div className="flex gap-2"><span className="text-[var(--fg-muted)]">Network:</span><span className="text-[var(--fg)]">Sepolia (Chain ID 11155111)</span></div>
        </div>
      </div>
      {toast && <Toast {...toast} />}
      <TxOverlay state={tx.state} onClose={tx.close} />
    </div>
  );
}
