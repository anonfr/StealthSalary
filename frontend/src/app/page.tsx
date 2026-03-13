"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, useDisconnect, useReadContract, useWriteContract } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useRouter } from "next/navigation";
import { PAYROLL_ABI, FACTORY_ABI, FACTORY_ADDRESS, getActivePayroll, setActivePayroll } from "@/lib/contracts";
import { isAddress } from "viem";

export default function Home() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Active payroll instance
  const [activePayroll, setActive] = useState<{ payroll: `0x${string}`; token: `0x${string}` } | null>(null);
  useEffect(() => { if (mounted) setActive(getActivePayroll()); }, [mounted]);

  const payrollAddr = activePayroll?.payroll;

  // Check if connected user is employer of active payroll
  const { data: employer } = useReadContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: "employer",
    query: { enabled: mounted && isConnected && !!payrollAddr },
  });
  const { data: isEmployee } = useReadContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: "isEmployee",
    args: address ? [address] : undefined,
    query: { enabled: mounted && isConnected && !!address && !!payrollAddr },
  });

  // Fetch employer's existing payrolls from factory
  const { data: existingPayrolls, refetch: refetchPayrolls } = useReadContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: "getEmployerPayrolls",
    args: address ? [address] : undefined,
    query: { enabled: mounted && isConnected && !!address && FACTORY_ADDRESS !== "0x0000000000000000000000000000000000000000" },
  }) as { data?: readonly { payroll: `0x${string}`; token: `0x${string}` }[]; refetch: () => void };

  const isEmployer = mounted && isConnected && employer && address && employer.toLowerCase() === address.toLowerCase();
  const connected = mounted && isConnected;

  // Create new payroll
  const [creating, setCreating] = useState(false);
  const handleCreatePayroll = async () => {
    if (!address) return;
    setCreating(true);
    try {
      const hash = await writeContractAsync({
        address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: "createPayroll", args: [BigInt(0)],
      });
      // Wait a bit then refetch
      setTimeout(() => refetchPayrolls(), 3000);
    } catch (e) {
      console.error(e);
    } finally { setCreating(false); }
  };

  // Select a payroll instance
  const selectPayroll = useCallback((payroll: `0x${string}`, token: `0x${string}`) => {
    setActivePayroll(payroll, token);
    setActive({ payroll, token });
  }, []);

  // Manual payroll address input
  const [manualAddr, setManualAddr] = useState("");
  const handleManualConnect = () => {
    if (!isAddress(manualAddr)) return;
    // We don't know the token address yet, will read from contract
    setActivePayroll(manualAddr as `0x${string}`, "0x0000000000000000000000000000000000000000");
    setActive({ payroll: manualAddr as `0x${string}`, token: "0x0000000000000000000000000000000000000000" });
  };

  // Read token address from active payroll if we don't have it
  const { data: payrollTokenAddr } = useReadContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: "payrollToken",
    query: { enabled: !!payrollAddr && activePayroll?.token === "0x0000000000000000000000000000000000000000" },
  });
  useEffect(() => {
    if (payrollTokenAddr && activePayroll && activePayroll.token === "0x0000000000000000000000000000000000000000") {
      selectPayroll(activePayroll.payroll, payrollTokenAddr as `0x${string}`);
    }
  }, [payrollTokenAddr, activePayroll, selectPayroll]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="relative z-10 flex flex-col items-center gap-8 max-w-2xl w-full text-center fade-in">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-2">
          <div className="accent-badge w-10 h-10 flex items-center justify-center text-xl">🔒</div>
          <span className="text-sm font-medium text-[var(--fg-muted)] tracking-widest uppercase font-mono">Built on fhEVM</span>
        </div>

        <h1 className="text-5xl font-bold leading-tight text-[var(--fg)]">StealthSalary</h1>
        <p className="text-lg text-[var(--fg-muted)] max-w-lg">
          Fully encrypted onchain payroll. Salaries are stored and processed as FHE ciphertexts — never visible to anyone except the individual.
        </p>

        {/* Feature tags */}
        <div className="flex flex-wrap gap-3 justify-center text-sm">
          {["Encrypted salaries (FHE)", "Zero-knowledge compliance", "Selective disclosure"].map((f) => (
            <span key={f} className="px-3 py-1 border border-[var(--border)] bg-[var(--base-300)] text-[var(--fg)] font-mono text-xs">{f}</span>
          ))}
        </div>

        {!connected ? (
          <button onClick={() => open()} className="accent-btn mt-4 px-8 py-3 text-lg">Connect Wallet</button>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-4 w-full max-w-md">
            {/* Connected wallet */}
            <div className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] bg-[var(--bg-card)] text-sm">
              <span className="w-2 h-2 bg-[var(--success)]" />
              <span className="font-mono text-[var(--fg-muted)] text-xs">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <button onClick={() => open({ view: "Networks" })} className="ml-1 text-xs text-[var(--accent)] hover:underline">Network</button>
              <button onClick={() => disconnect()} className="ml-1 text-[var(--fg-muted)] hover:text-[var(--fg)] text-xs underline">Disconnect</button>
            </div>

            {/* Active payroll selected — show role cards */}
            {activePayroll ? (
              <>
                <div className="w-full text-left">
                  <div className="text-xs text-[var(--fg-muted)] mb-1 uppercase tracking-wider">Active Payroll</div>
                  <div className="flex items-center justify-between px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)]">
                    <span className="font-mono text-xs text-[var(--fg)]">{payrollAddr?.slice(0, 10)}...{payrollAddr?.slice(-6)}</span>
                    <button onClick={() => { localStorage.removeItem("activePayroll"); setActive(null); }} className="text-xs text-[var(--accent)] hover:underline">Change</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full">
                  <button onClick={() => router.push("/employer")}
                    className={`p-4 border border-[var(--border)] transition-all ${isEmployer ? "bg-[var(--accent)] text-[var(--fg-on-accent)]" : "bg-[var(--bg-card)] text-[var(--fg)] hover:bg-[var(--base-300)]"}`}>
                    <div className="text-2xl mb-1">🏢</div>
                    <div className="text-sm font-semibold">Employer</div>
                    <div className={`text-xs mt-1 ${isEmployer ? "opacity-70" : "text-[var(--fg-muted)]"}`}>{isEmployer ? "You own this payroll" : "Manage payroll"}</div>
                  </button>
                  <button onClick={() => router.push("/employee")}
                    className={`p-4 border border-[var(--border)] transition-all ${isEmployee ? "bg-[var(--accent)] text-[var(--fg-on-accent)]" : "bg-[var(--bg-card)] text-[var(--fg)] hover:bg-[var(--base-300)]"}`}>
                    <div className="text-2xl mb-1">👤</div>
                    <div className="text-sm font-semibold">Employee</div>
                    <div className={`text-xs mt-1 ${isEmployee ? "opacity-70" : "text-[var(--fg-muted)]"}`}>{isEmployee ? "You are registered" : "View salary"}</div>
                  </button>
                </div>
              </>
            ) : (
              /* No active payroll — show options to create or connect */
              <div className="w-full space-y-4">
                {/* Create new payroll */}
                <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5 text-left">
                  <h2 className="font-semibold text-[var(--fg)] mb-2">Create New Payroll</h2>
                  <p className="text-xs text-[var(--fg-muted)] mb-3">Deploy your own encrypted payroll contracts. You become the employer.</p>
                  <button onClick={handleCreatePayroll} disabled={creating} className="accent-btn px-4 py-2 text-sm w-full disabled:opacity-50">
                    {creating ? "Deploying contracts..." : "Create Payroll"}
                  </button>
                </div>

                {/* Existing payrolls from factory */}
                {existingPayrolls && existingPayrolls.length > 0 && (
                  <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5 text-left">
                    <h2 className="font-semibold text-[var(--fg)] mb-2">Your Payrolls</h2>
                    <div className="space-y-2">
                      {existingPayrolls.map((p, i) => (
                        <button key={i} onClick={() => selectPayroll(p.payroll, p.token)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-[var(--base-300)] border border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--fg-on-accent)] transition-colors text-left">
                          <span className="font-mono text-xs">{p.payroll.slice(0, 10)}...{p.payroll.slice(-6)}</span>
                          <span className="text-xs">Select →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Connect to existing payroll (employee) */}
                <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5 text-left">
                  <h2 className="font-semibold text-[var(--fg)] mb-2">Join Existing Payroll</h2>
                  <p className="text-xs text-[var(--fg-muted)] mb-3">Enter a payroll contract address to connect as an employee.</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] px-3 py-2 text-sm font-mono text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                      placeholder="0x... payroll address"
                      value={manualAddr}
                      onChange={(e) => setManualAddr(e.target.value)}
                    />
                    <button onClick={handleManualConnect} disabled={!isAddress(manualAddr)} className="accent-btn px-4 py-2 text-sm disabled:opacity-50">
                      Connect
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-8 grid grid-cols-3 gap-px bg-[var(--border)] overflow-hidden border border-[var(--border)] w-full max-w-md text-sm">
          {[{ label: "Encryption", value: "FHE 128-bit" }, { label: "Network", value: "Sepolia" }, { label: "Token", value: "ERC-7984" }].map((s) => (
            <div key={s.label} className="bg-[var(--bg-card)] px-4 py-3 text-center">
              <div className="text-[var(--accent)] font-semibold font-mono">{s.value}</div>
              <div className="text-[var(--fg-muted)] text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
