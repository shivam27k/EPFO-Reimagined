"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EmploymentActions({ employmentId }: { employmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function simulateExitDate() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/scenarios/employment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "SIMULATE_EMPLOYER_EXIT_DATE", employmentId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Employer simulation failed.");
      setMessage("Simulated employer response recorded. The page has refreshed with updated readiness.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Employer simulation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="demo-inline-actions">
      <button className="secondary-action" disabled={pending} onClick={simulateExitDate} type="button">
        <RefreshCw aria-hidden="true" size={17} />
        {pending ? "Simulating…" : "Simulate employer response"}
      </button>
      <p aria-live="polite">{message}</p>
    </div>
  );
}
