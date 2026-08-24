"use client";

import { CalendarCheck2, CircleAlert, KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CompactFacts } from "@/components/ui/task-first";

type EmploymentOption = {
  employmentKey: string;
  memberIdMasked: string;
  establishmentName: string;
  joinedAt: string;
  latestContributionMonth: string | null;
};

const exitReasonLabels = {
  RETIREMENT: "Retirement",
  SUPERANNUATION: "Superannuation",
  PERMANENT_DISABLEMENT: "Permanent disablement",
  CESSATION_SHORT_SERVICE: "Cessation (short service) — any other reason",
} as const;

export function MarkExitForm({ employments }: { employments: EmploymentOption[] }) {
  const router = useRouter();
  const [employmentKey, setEmploymentKey] = useState(employments[0]?.employmentKey ?? "");
  const [exitDate, setExitDate] = useState("");
  const [confirmExitDate, setConfirmExitDate] = useState("");
  const [reason, setReason] = useState("");
  const [consent, setConsent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const errorAlertRef = useRef<HTMLParagraphElement>(null);
  const selected = useMemo(() => employments.find((item) => item.employmentKey === employmentKey), [employments, employmentKey]);
  const exitDateError = messageIsError && message.toLowerCase().includes("exit date");

  useEffect(() => {
    if (!messageIsError) return;
    errorAlertRef.current?.focus();
    errorAlertRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [messageIsError, message]);

  function loadValidDemoExit() {
    const month = selected?.latestContributionMonth;
    if (!month) return;
    const [year, monthNumber] = month.split("-").map(Number);
    const value = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    setExitDate(value);
    setConfirmExitDate(value);
    setReason("CESSATION_SHORT_SERVICE");
    setConsent(true);
    setAcknowledged(true);
    setOtpRequested(true);
    setOtp("123456");
    setMessageIsError(false);
    setMessage("Valid fictional Mark Exit details loaded. Review every value before recording it.");
  }

  function requestOtp() {
    if (!consent) {
      setMessageIsError(true);
      setMessage("Accept the simulated Aadhaar authentication disclosure before requesting the demo OTP.");
      return;
    }
    setOtpRequested(true);
    setOtp("123456");
    setMessageIsError(false);
    setMessage("Demo OTP generated: 123456. No Aadhaar or mobile service was contacted.");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessageIsError(false);
    setMessage("");
    try {
      const response = await fetch("/api/employment/mark-exit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employmentKey, exitDate, confirmExitDate, reason, simulatedAadhaarConsent: consent, acknowledgementAccepted: acknowledged, demoOtp: otp }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "The date of exit could not be recorded.");
      setMessageIsError(false);
      setMessage(result.message ?? "Date of exit recorded.");
      router.replace("/employment?updated=exit");
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "The date of exit could not be recorded. No data changed.");
    } finally {
      setPending(false);
    }
  }

  if (employments.length === 0) {
    return <section className="service-empty"><h2>No employment is available to mark as exited</h2><p>Every employment in this demo already has an exit date, or onboarding has not created an employment record yet.</p></section>;
  }

  return (
    <form className="mark-exit-form" onSubmit={submit}>
      <section className="mark-exit-employment">
        <div className="section-heading-row"><div><p className="utility-label">Step 1</p><h2>Select employment</h2></div><button className="demo-fill-action" onClick={loadValidDemoExit} type="button">Fill valid demo details</button></div>
        {selected ? <CompactFacts items={[
          { label: "Employment", value: selected.establishmentName, supporting: selected.memberIdMasked },
          { label: "Joining date", value: selected.joinedAt },
          { label: "Last contribution", value: selected.latestContributionMonth ?? "No contribution recorded" },
        ]} /> : null}
        <label>Employment record<select value={employmentKey} onChange={(event) => setEmploymentKey(event.target.value)}>{employments.map((employment) => <option key={employment.employmentKey} value={employment.employmentKey}>{employment.establishmentName} · {employment.memberIdMasked}</option>)}</select></label>
      </section>

      <section className="mark-exit-details">
        <div><p className="utility-label">Step 2</p><h2>Record the exit</h2><p>Enter the date twice so an accidental date does not become an irreversible record.</p></div>
        <div className="mark-exit-grid">
          <label>Exit date<input aria-invalid={exitDateError} required type="date" value={exitDate} onChange={(event) => setExitDate(event.target.value)} /></label>
          <label>Confirm exit date<input aria-invalid={exitDateError} required type="date" value={confirmExitDate} onChange={(event) => setConfirmExitDate(event.target.value)} /></label>
          <label>Reason for exit<select required value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Select a reason</option>{Object.entries(exitReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </section>

      <section className="mark-exit-auth">
        <div className="mark-exit-auth-heading"><ShieldCheck aria-hidden="true" size={24} /><div><p className="utility-label">Step 3</p><h2>Confirm with simulated Aadhaar OTP</h2></div></div>
        <div className="mark-exit-section-body">
          <label className="confirmation-label"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" /><span>I understand this prototype will simulate Aadhaar-linked authentication. No Aadhaar number, biometric, OTP service or government system is used.</span></label>
          <div className="otp-row"><button className="secondary-action" disabled={!consent} onClick={requestOtp} type="button"><KeyRound aria-hidden="true" size={17} /> Request demo OTP</button><label>Demo OTP<input disabled={!otpRequested} inputMode="numeric" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} /></label></div>
        </div>
      </section>

      <section className="mark-exit-warning">
        <div className="mark-exit-auth-heading"><CalendarCheck2 aria-hidden="true" size={24} /><div><p className="utility-label">Before recording</p><h2>Read these consequences carefully</h2></div></div>
        <div className="mark-exit-section-body">
          <ul><li>The recorded date is shown as part of the employment history.</li><li>If contributions exist after this date, the record requires correction through the responsible EPFO/employer process.</li><li>After settlement, an incorrect exit date cannot be casually edited in the member portal.</li><li>Final settlement ends this service period for relevant withdrawal and pension calculations.</li></ul>
          <label className="confirmation-label"><input checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" /><span>I have reviewed the selected employment, date, reason and consequences.</span></label>
        </div>
      </section>

      <div className="mark-exit-submit">
        {message ? (
          <p
            aria-live={messageIsError ? "assertive" : "polite"}
            className={messageIsError ? "form-error-alert" : undefined}
            ref={errorAlertRef}
            role={messageIsError ? "alert" : "status"}
            tabIndex={messageIsError ? -1 : undefined}
          >
            {messageIsError ? <CircleAlert aria-hidden="true" size={19} /> : null}
            <span>{message}</span>
          </p>
        ) : <span />}
        <button className="primary-action" disabled={pending || !consent || !acknowledged || otp.length !== 6} type="submit">{pending ? "Recording exit…" : "Record date of exit"}</button>
      </div>
    </form>
  );
}
