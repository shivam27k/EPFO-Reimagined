"use client";

import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

const issueSnapshotSchema = z.object({
  profile: z.object({
    bankName: z.string(),
    onboardingComplete: z.boolean(),
  }),
  findings: z.array(z.object({ code: z.string() })),
});

export function DemoShortcut({
  disabled,
  showIssue,
  onFill,
  onIssueLoaded,
  onIssueError,
}: {
  disabled?: boolean;
  showIssue: boolean;
  onFill: () => void;
  onIssueLoaded: (message: string) => void;
  onIssueError: (message: string) => void;
}) {
  const [issuePending, setIssuePending] = useState(false);

  async function loadIssue() {
    setIssuePending(true);
    onIssueError("");
    try {
      const response = await fetch("/api/scenarios/load", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "LOAD_ISSUE" }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ error: z.string().optional() }).safeParse(result);
        throw new Error(error.success && error.data.error ? error.data.error : "The simulated issue could not be loaded.");
      }
      if (!issueSnapshotSchema.safeParse(result).success) {
        throw new Error("The simulated issue returned an invalid response.");
      }
      onIssueLoaded("Simulated bank-name mismatch loaded. Review the changed fictional bank name, then save to see how the blocker is explained.");
    } catch (error) {
      onIssueError(error instanceof Error ? error.message : "The simulated issue could not be loaded. Try again.");
    } finally {
      setIssuePending(false);
    }
  }

  return (
    <aside className="demo-shortcut" aria-label="Simulated demo shortcuts">
      <FlaskConical aria-hidden="true" size={19} />
      <div>
        <p className="utility-label">Simulated shortcut</p>
        <p>These controls use fictional values and the same validation path as manual entry.</p>
        <div className="demo-shortcut-actions">
          <button className="secondary-action" disabled={disabled} onClick={onFill} type="button">
            Fill with valid demo data
          </button>
          {showIssue ? (
            <button className="text-action" disabled={disabled || issuePending} onClick={loadIssue} type="button">
              {issuePending ? "Loading mismatch…" : "Load bank-name mismatch"}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
