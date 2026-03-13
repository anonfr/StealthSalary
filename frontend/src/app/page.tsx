"use client";

import { useEffect, useState } from "react";
import { useAccount, useDisconnect, useReadContract } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useRouter } from "next/navigation";
import { PAYROLL_ABI, PAYROLL_ADDRESS } from "@/lib/contracts";

export default function Home() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: employer } = useReadContract({
    address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "employer",
    query: { enabled: mounted && isConnected },
  });
  const { data: isEmployee } = useReadContract({
    address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "isEmployee",
    args: address ? [address] : undefined,
    query: { enabled: mounted && isConnected && !!address },
  });

  const isEmployer = mounted && isConnected && employer && address && employer.toLowerCase() === address.toLowerCase();
  const connected = mounted && isConnected;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="relative z-10 flex flex-col items-center gap-8 max-w-2xl w-full text-center fade-in">

        {/* Logo + Tagline */}
        <div className="flex items-center gap-3 mb-2">
          <div className="accent-badge w-10 h-10 flex items-center justify-center text-xl">
            🔒
          </div>
          <span className="text-sm font-medium text-[var(--fg-muted)] tracking-widest uppercase font-mono">
            Built on Zama fhEVM
          </span>
        </div>

        <h1 className="text-5xl font-bold leading-tight text-[var(--fg)]">
          Confidential Payroll
        </h1>
        <p className="text-lg text-[var(--fg-muted)] max-w-lg">
          The first fully encrypted onchain payroll system. Employee salaries are stored and
          processed as FHE ciphertexts — never visible to anyone except the individual.
        </p>

        {/* Feature tags */}
        <div className="flex flex-wrap gap-3 justify-center text-sm">
          {["Salaries encrypted with FHE", "Zero-knowledge compliance proofs", "Selective income disclosure"].map((f) => (
            <span key={f} className="px-3 py-1 border border-[var(--border)] bg-[var(--base-300)] text-[var(--fg)] font-mono text-xs">{f}</span>
          ))}
        </div>

        {!connected ? (
          <button
            onClick={() => open()}
            className="accent-btn mt-4 px-8 py-3 text-lg"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-4 w-full max-w-sm">
            {/* Connected wallet info */}
            <div className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] bg-[var(--bg-card)] text-sm">
              <span className="w-2 h-2 bg-[var(--success)]" />
              <span className="font-mono text-[var(--fg-muted)] text-xs">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <button onClick={() => open({ view: "Networks" })} className="ml-1 text-xs text-[var(--accent)] hover:underline">Network</button>
              <button onClick={() => disconnect()} className="ml-1 text-[var(--fg-muted)] hover:text-[var(--fg)] text-xs underline">Disconnect</button>
            </div>

            {/* Role cards */}
            <div className="grid grid-cols-2 gap-3 w-full">
              <button onClick={() => router.push("/employer")}
                className={`p-4 border border-[var(--border)] transition-all ${isEmployer
                  ? "bg-[var(--accent)] text-[var(--fg-on-accent)]"
                  : "bg-[var(--bg-card)] text-[var(--fg)] hover:bg-[var(--base-300)]"}`}>
                <div className="text-2xl mb-1">🏢</div>
                <div className="text-sm font-semibold">Employer</div>
                <div className={`text-xs mt-1 ${isEmployer ? "opacity-70" : "text-[var(--fg-muted)]"}`}>
                  {isEmployer ? "You own this contract" : "Manage payroll"}
                </div>
              </button>
              <button onClick={() => router.push("/employee")}
                className={`p-4 border border-[var(--border)] transition-all ${isEmployee
                  ? "bg-[var(--accent)] text-[var(--fg-on-accent)]"
                  : "bg-[var(--bg-card)] text-[var(--fg)] hover:bg-[var(--base-300)]"}`}>
                <div className="text-2xl mb-1">👤</div>
                <div className="text-sm font-semibold">Employee</div>
                <div className={`text-xs mt-1 ${isEmployee ? "opacity-70" : "text-[var(--fg-muted)]"}`}>
                  {isEmployee ? "You are registered" : "View your salary"}
                </div>
              </button>
            </div>

            {PAYROLL_ADDRESS === "0x0000000000000000000000000000000000000000" && (
              <p className="text-xs text-[var(--fg)] bg-[var(--base-300)] border border-[var(--border)] px-3 py-2">Set NEXT_PUBLIC_PAYROLL_ADDRESS in .env.local</p>
            )}
          </div>
        )}

        {/* Stats footer */}
        <div className="mt-8 grid grid-cols-3 gap-px bg-[var(--border)] overflow-hidden border border-[var(--border)] w-full max-w-md text-sm">
          {[{ label: "Encryption", value: "FHE 128-bit" }, { label: "Network", value: "Sepolia" }, { label: "Tests", value: "51 passing" }].map((s) => (
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
