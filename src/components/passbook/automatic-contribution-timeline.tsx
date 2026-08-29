"use client";

import { Building2, Check, FastForward } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const months = [
  "August 2026", "September 2026", "October 2026",
  "November 2026", "December 2026", "January 2027",
];

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function AutomaticContributionTimeline() {
  const router = useRouter();
  const started = useRef(false);
  const [visibleMonths, setVisibleMonths] = useState(0);
  const [status, setStatus] = useState<"preparing" | "posting" | "failed">("preparing");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const controller = new AbortController();
    let active = true;

    void (async () => {
      try {
        setStatus("preparing");
        setError("");
        setVisibleMonths(0);
        const response = await fetch("/api/scenarios/advance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: "ADVANCE_TIME" }),
          signal: controller.signal,
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "The fictional contribution timeline could not be created.");
        if (!active) return;
        setStatus("posting");
        for (let index = 1; index <= months.length; index += 1) {
          await wait(360);
          if (!active) return;
          setVisibleMonths(index);
        }
        await wait(420);
        if (!active) return;
        router.replace("/passbook?timeline=complete");
        router.refresh();
      } catch (caught) {
        if (!active || controller.signal.aborted) return;
        setStatus("failed");
        setError(caught instanceof Error ? caught.message : "The fictional contribution timeline could not be created.");
      }
    })();

    return () => { active = false; controller.abort(); };
  }, [attempt, router]);

  function retry() {
    started.current = false;
    setAttempt((current) => current + 1);
  }

  return (
    <section className="contribution-fast-forward" role="status" aria-live="polite" aria-label="Simulating six fictional contribution months">
      <div className="contribution-fast-forward-card">
        <header>
          <span className="fast-forward-icon"><FastForward aria-hidden="true" size={24} /></span>
          <div>
            <p className="utility-label">Fictional timeline</p>
            <h1>Fast-forwarding your EPF account by six months</h1>
            <p>{status === "preparing" ? "Preparing the simulated employer ledger…" : "Showing how monthly EPF contributions build your passbook."}</p>
          </div>
        </header>

        <ol className="contribution-month-timeline">
          {months.map((month, index) => {
            const posted = index < visibleMonths;
            const current = index === visibleMonths && status === "posting";
            return <li data-posted={posted} data-current={current} key={month}>
              <span className="timeline-marker">{posted ? <Check aria-hidden="true" size={15} /> : index + 1}</span>
              <div><strong>{month}</strong><small>{posted ? "Employer and member contributions posted" : current ? "Posting fictional contribution…" : "Next fictional wage month"}</small></div>
              {posted ? <span className="timeline-amount"><Building2 aria-hidden="true" size={14} /> ₹1,800 member · ₹1,800 employer</span> : null}
            </li>;
          })}
        </ol>

        {status === "failed" ? <div className="fast-forward-error"><p>{error}</p><button className="primary-action" onClick={retry} type="button">Retry simulation</button></div> : null}
        <footer><span style={{ width: `${Math.max(4, visibleMonths / months.length * 100)}%` }} /><small>{visibleMonths} of 6 fictional months</small></footer>
      </div>
    </section>
  );
}
