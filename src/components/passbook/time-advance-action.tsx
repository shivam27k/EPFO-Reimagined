"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TimeAdvanceAction({ variant = "secondary" }: { variant?: "primary" | "secondary" } = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function advanceTime() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/scenarios/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "ADVANCE_TIME" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Time simulation failed.");
      setMessage("Six fictional wage months created. Refreshing the passbook…");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Time simulation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="demo-inline-actions">
      <button className={variant === "primary" ? "primary-action" : "secondary-action"} disabled={pending} onClick={advanceTime} type="button">
        <CalendarClock aria-hidden="true" size={17} />
        {pending ? "Advancing…" : "Simulate six contribution months"}
      </button>
      <p aria-live="polite">{message}</p>
    </div>
  );
}
