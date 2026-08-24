"use client";

import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { MemberRequestStatus, MemberRequestType } from "@/server/services/member-request-service";
import styles from "./member-management.module.css";

const nextCommand = { NOT_STARTED: "OPEN", OPEN: "ADVANCE", IN_PROGRESS: "RESOLVE", RESOLVED: null } as const;

export function MemberRequestAction({ type, status = "NOT_STARTED", labels }: {
  type: MemberRequestType;
  status?: MemberRequestStatus | "NOT_STARTED";
  labels: { open: string; advance: string; resolve: string; resolved: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const command = nextCommand[status];
  const label = status === "NOT_STARTED" ? labels.open : status === "OPEN" ? labels.advance : status === "IN_PROGRESS" ? labels.resolve : labels.resolved;

  async function act() {
    if (!command) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/member/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, command }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The simulated request could not be updated.");
      setMessage("Simulated request saved in this demo session.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The simulated request could not be updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.requestAction}>
      <button className="primary-action" disabled={pending || !command} onClick={act} type="button">
        {pending ? <LoaderCircle aria-hidden="true" size={17} /> : status === "RESOLVED" ? <CheckCircle2 aria-hidden="true" size={17} /> : <ArrowRight aria-hidden="true" size={17} />}
        {pending ? "Saving…" : label}
      </button>
      <p aria-live="polite">{message}</p>
    </div>
  );
}
