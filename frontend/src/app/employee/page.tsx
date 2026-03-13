"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useSignTypedData } from "wagmi";
import { isAddress } from "viem";
import Link from "next/link";
import { PAYROLL_ABI, PAYROLL_ADDRESS, TOKEN_ADDRESS, TOKEN_ABI, getFhevmInstance } from "@/lib/contracts";

function EncryptedCard({ label, handle, decryptedValue, onDecrypt, decrypting }: {
  label: string; handle?: unknown; decryptedValue?: bigint; onDecrypt: () => void; decrypting: boolean;
}) {
  const handleHex = typeof handle === "bigint" ? `0x${handle.toString(16).padStart(64, "0")}` : typeof handle === "string" ? handle : undefined;
  const isEmpty = !handle || handleHex === "0x" + "0".repeat(64) || handle === BigInt(0);
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
      <div className="text-xs text-[var(--fg-muted)] mb-3 uppercase tracking-wider">{label}</div>
      {isEmpty ? <div className="text-[var(--fg-muted)] text-sm italic">No data yet</div>
      : decryptedValue !== undefined ? (
        <div>
          <div className="text-3xl font-bold text-[var(--accent)]">{(Number(decryptedValue) / 1e6).toLocaleString()}</div>
          <div className="text-xs text-[var(--fg-muted)] mt-1">token units (decrypted)</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 p-3 bg-[var(--base-300)] border border-[var(--border)]">
            <span className="text-lg">🔒</span>
            <div>
              <div className="text-xs text-[var(--fg)] font-mono">{handleHex?.slice(0, 18)}...{handleHex?.slice(-6)}</div>
              <div className="text-xs text-[var(--fg-muted)]">Encrypted ciphertext handle</div>
            </div>
          </div>
          <button onClick={onDecrypt} disabled={decrypting} className="accent-btn px-4 py-2 text-sm disabled:opacity-50">
            {decrypting ? "Decrypting..." : "Decrypt"}
          </button>
        </div>
      )}
    </div>
  );
}

function Toast({ message, type }: { message: string; type: "success" | "error" | "info" }) {
  const styles: Record<string, string> = {
    success: "border-l-4 border-l-[var(--success)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)]",
    error: "border-l-4 border-l-[var(--error)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)]",
    info: "border-l-4 border-l-[var(--accent)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)]",
  };
  return <div className={`fixed bottom-6 right-6 max-w-sm px-4 py-3 border text-sm fade-in ${styles[type]}`}>{message}</div>;
}

export default function EmployeePage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" | "info" = "info") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 5000); };

  const { data: isEmployee, isLoading } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "isEmployee", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: hasPending } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "hasPendingWithdrawal", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: salaryHandle } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "getMySalary", query: { enabled: !!address && !!isEmployee } }) as { data?: `0x${string}` };
  const { data: balanceHandle } = useReadContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "getMyBalance", query: { enabled: !!address && !!isEmployee } }) as { data?: `0x${string}` };
  const { data: tokenBalanceHandle } = useReadContract({ address: TOKEN_ADDRESS, abi: TOKEN_ABI, functionName: "confidentialBalanceOf", args: address ? [address] : undefined, query: { enabled: !!address } }) as { data?: `0x${string}` };

  const [decryptedSalary, setDecryptedSalary] = useState<bigint>();
  const [decryptedBalance, setDecryptedBalance] = useState<bigint>();
  const [decryptedTokenBalance, setDecryptedTokenBalance] = useState<bigint>();
  const [decryptingSalary, setDecryptingSalary] = useState(false);
  const [decryptingBalance, setDecryptingBalance] = useState(false);
  const [decryptingTokenBalance, setDecryptingTokenBalance] = useState(false);

  const toHandle = (raw: unknown): `0x${string}` => {
    if (typeof raw === "bigint") return `0x${raw.toString(16).padStart(64, "0")}` as `0x${string}`;
    if (typeof raw === "string" && raw.startsWith("0x")) return raw as `0x${string}`;
    return `0x${String(raw)}` as `0x${string}`;
  };

  const doDecrypt = async (rawHandle: unknown, setter: (v: bigint) => void, setLoading: (b: boolean) => void, contractAddr: `0x${string}` = PAYROLL_ADDRESS) => {
    if (!address) return;
    const handle = toHandle(rawHandle);
    setLoading(true);
    try {
      showToast("Sign the EIP-712 permit to decrypt...", "info");
      const instance = await getFhevmInstance();
      const { publicKey, privateKey } = instance.generateKeypair();
      const contractAddresses = [contractAddr];
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 1;
      const eip712 = instance.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);
      const signature = await signTypedDataAsync({
        domain: eip712.domain as Record<string, unknown>,
        types: { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification } as Record<string, { name: string; type: string }[]>,
        primaryType: "UserDecryptRequestVerification",
        message: eip712.message as Record<string, unknown>,
      });
      const handleContractPairs = [{ handle, contractAddress: contractAddr }];
      const result = await instance.userDecrypt(
        handleContractPairs, privateKey, publicKey,
        signature.replace("0x", ""), contractAddresses, address,
        startTimestamp, durationDays,
      );
      const val = result[handle];
      setter(val);
      showToast("Decrypted successfully", "success");
    } catch (e: unknown) { showToast((e as Error).message?.slice(0, 80) ?? "Failed", "error");
    } finally { setLoading(false); }
  };

  const [initiating, setInitiating] = useState(false);
  const handleWithdraw = async () => {
    setInitiating(true);
    try { await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "initiateWithdrawal" }); showToast("Withdrawal initiated!", "success");
    } catch (e: unknown) { showToast((e as Error).message?.slice(0, 80) ?? "Failed", "error");
    } finally { setInitiating(false); }
  };

  const [verifierAddr, setVerifierAddr] = useState("");
  const [grantingProof, setGrantingProof] = useState(false);
  const handleProof = async () => {
    if (!isAddress(verifierAddr)) return;
    setGrantingProof(true);
    try { await writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "generateIncomeProof", args: [verifierAddr as `0x${string}`] }); showToast("Income proof granted", "success"); setVerifierAddr("");
    } catch (e: unknown) { showToast((e as Error).message?.slice(0, 80) ?? "Failed", "error");
    } finally { setGrantingProof(false); }
  };

  if (!isConnected) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-[var(--fg-muted)] mb-4">Please connect your wallet</p>
        <Link href="/" className="text-[var(--accent)] hover:underline">← Home</Link>
      </div>
    </div>
  );

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6 fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-xs text-[var(--fg-muted)] hover:text-[var(--accent)] mb-2 block">← Home</Link>
            <h1 className="text-2xl font-bold text-[var(--fg)]">Employee Dashboard</h1>
            <p className="text-[var(--fg-muted)] text-sm mt-1 font-mono">{address?.slice(0, 10)}...{address?.slice(-6)}</p>
          </div>
          {isEmployee ? (
            <span className="accent-badge px-3 py-1 text-xs font-mono">Registered</span>
          ) : (
            <span className="px-3 py-1 border border-[var(--border)] bg-[var(--base-300)] text-[var(--fg-muted)] text-xs">Not registered</span>
          )}
        </div>

        {!isEmployee ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-8 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-[var(--fg)] mb-2">You are not registered as an employee.</p>
            <p className="text-[var(--fg-muted)] text-sm">Ask your employer to add your wallet address.</p>
          </div>
        ) : (<>
          {/* FHE notice */}
          <div className="p-4 bg-[var(--base-300)] border-l-4 border-l-[var(--accent)] border border-[var(--border)] text-sm text-[var(--fg)]">
            🔒 Your salary and balance are fully encrypted with FHE. Only you can decrypt them.
          </div>

          {/* Salary & Balance cards */}
          <div className="grid grid-cols-2 gap-4">
            <EncryptedCard label="Monthly Salary" handle={salaryHandle} decryptedValue={decryptedSalary} onDecrypt={() => salaryHandle && doDecrypt(salaryHandle, setDecryptedSalary, setDecryptingSalary)} decrypting={decryptingSalary} />
            <EncryptedCard label="Accumulated Balance" handle={balanceHandle} decryptedValue={decryptedBalance} onDecrypt={() => balanceHandle && doDecrypt(balanceHandle, setDecryptedBalance, setDecryptingBalance)} decrypting={decryptingBalance} />
          </div>

          {/* Token balance */}
          <EncryptedCard label="PAY Token Wallet Balance (ERC-7984)" handle={tokenBalanceHandle} decryptedValue={decryptedTokenBalance} onDecrypt={() => tokenBalanceHandle && doDecrypt(tokenBalanceHandle, setDecryptedTokenBalance, setDecryptingTokenBalance, TOKEN_ADDRESS)} decrypting={decryptingTokenBalance} />

          {/* Withdraw */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
            <h2 className="font-semibold mb-2 text-[var(--fg)]">Withdraw Salary</h2>
            <p className="text-xs text-[var(--fg-muted)] mb-4">The Zama gateway decrypts your balance and triggers token transfer.</p>
            {hasPending && (
              <div className="p-3 bg-[var(--base-300)] border-l-4 border-l-[var(--accent)] border border-[var(--border)] text-[var(--fg)] text-sm mb-3">
                Withdrawal pending — waiting for employer approval
              </div>
            )}
            <button
              onClick={handleWithdraw}
              disabled={initiating || !!hasPending}
              className="accent-btn px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {initiating ? "Submitting..." : hasPending ? "In Progress" : "Initiate Withdrawal"}
            </button>
          </div>

          {/* Income Proof */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
            <h2 className="font-semibold mb-2 text-[var(--fg)]">Income Proof</h2>
            <p className="text-xs text-[var(--fg-muted)] mb-4">Grant a verifier transient access to your encrypted salary.</p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm font-mono text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="Verifier address (0x...)"
                value={verifierAddr}
                onChange={(e) => setVerifierAddr(e.target.value)}
              />
              <button
                onClick={handleProof}
                disabled={grantingProof || !isAddress(verifierAddr)}
                className="px-4 py-2 bg-[var(--base-300)] hover:bg-[var(--accent)] hover:text-[var(--fg-on-accent)] border border-[var(--border)] text-[var(--fg)] text-sm font-medium disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                {grantingProof ? "Granting..." : "Grant Proof"}
              </button>
            </div>
          </div>
        </>)}
      </div>
      {toast && <Toast {...toast} />}
    </div>
  );
}
