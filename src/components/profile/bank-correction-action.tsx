"use client";

import { BadgeCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BankCorrectionAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function correctBankRecord() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/scenarios/bank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "SIMULATE_BANK_CORRECTION" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Bank correction simulation failed.");
      setMessage("Fictional bank name corrected and simulated verification recorded.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bank correction simulation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="demo-inline-actions">
      <button className="primary-action" disabled={pending} onClick={correctBankRecord} type="button">
        <BadgeCheck aria-hidden="true" size={17} />
        {pending ? "Correcting…" : "Simulate bank correction"}
      </button>
      <p aria-live="polite">{message}</p>
    </div>
  );
}
