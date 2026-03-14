"use client";

import { useState, useCallback } from "react";

export type TxStep = {
  label: string;
  status: "pending" | "active" | "done" | "error";
};

type TxOverlayState = {
  title: string;
  steps: TxStep[];
  hash?: string;
  error?: string;
} | null;

export function TxOverlay({ state, onClose }: { state: TxOverlayState; onClose: () => void }) {
  if (!state) return null;

  const isComplete = state.steps.every((s) => s.status === "done");
  const hasError = state.steps.some((s) => s.status === "error") || !!state.error;
  const canClose = isComplete || hasError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm fade-in">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] p-6 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-[var(--fg)] text-lg">{state.title}</h3>
          {canClose && (
            <button onClick={onClose} className="text-[var(--fg-muted)] hover:text-[var(--fg)] text-xl leading-none">&times;</button>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {state.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                {step.status === "done" ? (
                  <div className="w-5 h-5 bg-[var(--success)] flex items-center justify-center text-white text-xs font-bold">&#10003;</div>
                ) : step.status === "active" ? (
                  <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                ) : step.status === "error" ? (
                  <div className="w-5 h-5 bg-[var(--error)] flex items-center justify-center text-white text-xs font-bold">&times;</div>
                ) : (
                  <div className="w-5 h-5 border border-[var(--border)]" />
                )}
              </div>
              <span className={`text-sm ${step.status === "active" ? "text-[var(--accent)] font-medium" : step.status === "done" ? "text-[var(--fg)]" : step.status === "error" ? "text-[var(--error)]" : "text-[var(--fg-muted)]"}`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Tx hash */}
        {state.hash && (
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="text-xs text-[var(--fg-muted)] mb-1">Transaction Hash</div>
            <a
              href={`https://sepolia.etherscan.io/tx/${state.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-[var(--accent)] hover:underline break-all"
            >
              {state.hash.slice(0, 18)}...{state.hash.slice(-12)}
            </a>
          </div>
        )}

        {/* Error */}
        {state.error && (
          <div className="mt-4 p-3 bg-[var(--base-300)] border border-[var(--border)] border-l-4 border-l-[var(--error)]">
            <div className="text-xs text-[var(--error)] break-words">{state.error}</div>
          </div>
        )}

        {/* Close button */}
        {canClose && (
          <button onClick={onClose} className={`mt-4 w-full py-2 text-sm font-medium ${isComplete ? "accent-btn" : "bg-[var(--base-300)] border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--accent)] hover:text-[var(--fg-on-accent)]"} transition-colors`}>
            {isComplete ? "Done" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}

// Hook for managing tx overlay state
export function useTxOverlay() {
  const [state, setState] = useState<TxOverlayState>(null);

  const start = useCallback((title: string, stepLabels: string[]) => {
    setState({
      title,
      steps: stepLabels.map((label, i) => ({ label, status: i === 0 ? "active" : "pending" })),
    });
  }, []);

  const advance = useCallback((stepIndex: number) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((s, i) =>
          i < stepIndex ? { ...s, status: "done" as const }
            : i === stepIndex ? { ...s, status: "active" as const }
            : s
        ),
      };
    });
  }, []);

  const setHash = useCallback((hash: string) => {
    setState((prev) => prev ? { ...prev, hash } : prev);
  }, []);

  const complete = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      return { ...prev, steps: prev.steps.map((s) => ({ ...s, status: "done" as const })) };
    });
  }, []);

  const fail = useCallback((error: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((s) =>
        s.status === "active" ? { ...s, status: "error" as const } : s
      );
      return { ...prev, steps, error };
    });
  }, []);

  const close = useCallback(() => setState(null), []);

  return { state, start, advance, setHash, complete, fail, close };
}
