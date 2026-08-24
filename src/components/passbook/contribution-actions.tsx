"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContributionActions({ wageMonth, missing }: { wageMonth: string; missing: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function simulate(command: "LOAD_MISSING_CONTRIBUTION" | "SIMULATE_ECR_POSTING") {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/scenarios/contributions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, wageMonth }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Contribution simulation failed.");
      setMessage(command === "SIMULATE_ECR_POSTING"
        ? "Simulated employer/ECR posting recorded."
        : "Missing contribution scenario loaded.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Contribution simulation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="demo-inline-actions">
      {missing ? (
        <button className="secondary-action" disabled={pending} onClick={() => simulate("SIMULATE_ECR_POSTING")} type="button">
          <RefreshCw aria-hidden="true" size={17} />
          {pending ? "Posting…" : "Simulate employer/ECR post"}
        </button>
      ) : (
        <button className="text-action" disabled={pending} onClick={() => simulate("LOAD_MISSING_CONTRIBUTION")} type="button">
          Load missing contribution
        </button>
      )}
      <p aria-live="polite">{message}</p>
    </div>
  );
}
