"use client";

import { ArrowLeft, ArrowRight, CircleAlert, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DemoShortcut } from "@/components/demo/demo-shortcut";
import { PreflightPanel } from "@/components/process/preflight-panel";
import { bankMismatchDemoOnboardingData, validDemoOnboardingData } from "@/domain/demo-onboarding-data";
import {
  ASSISTANT_PATCH_APPLIED_EVENT,
  ASSISTANT_VALIDATION_EVENT,
  type AssistantPatchAppliedEventDetail,
  type AssistantValidationEventDetail,
} from "@/domain/assistant-events";
import {
  onboardingRequestSchema,
  type OnboardingDraftDto,
  type OnboardingEditableValues,
} from "@/domain/onboarding-schema";
import {
  onboardingSteps,
  processDefinitions,
  type OnboardingQuestionKey,
  type getOnboardingPreflight,
} from "@/domain/process-definitions";
import { FormProgress } from "./form-progress";
import { KycForm } from "./kyc-form";

type FieldErrors = Partial<Record<OnboardingQuestionKey, string>>;
type Preflight = ReturnType<typeof getOnboardingPreflight>;
type NameMismatch = { aadhaarName: string };

const emptyDemoData: OnboardingEditableValues = {
  uan: "", aadhaarName: "", dateOfBirth: "", mobileNumber: "",
  establishmentName: "", memberId: "", joinedAt: "", epfMember: false,
  epsMember: false, panName: "", panNumber: "", bankName: "",
  bankAccountNumber: "", bankIfsc: "",
};

const stepCopy = {
  identity: { title: "Review identity", description: "Confirm the fictional UAN and identity returned by the simulated UMANG handoff." },
  contact: { title: "Add contact", description: "Add a demo mobile number; only its last four digits remain in the saved profile." },
  employment: { title: "Confirm first employment", description: "Review the fictional details an employer would record for EPF membership." },
  kyc: { title: "Check KYC readiness", description: "Review the simulated PAN and bank checks used by this demo." },
} as const;

function editableDemoValues(source: OnboardingEditableValues & { demoDisclosureAccepted: true }): OnboardingEditableValues {
  return {
    uan: source.uan,
    aadhaarName: source.aadhaarName,
    dateOfBirth: source.dateOfBirth,
    mobileNumber: source.mobileNumber,
    establishmentName: source.establishmentName,
    memberId: source.memberId,
    joinedAt: source.joinedAt,
    epfMember: source.epfMember,
    epsMember: source.epsMember,
    panName: source.panName,
    panNumber: source.panNumber,
    bankName: source.bankName,
    bankAccountNumber: source.bankAccountNumber,
    bankIfsc: source.bankIfsc,
  };
}

function isQuestionKey(value: PropertyKey): value is OnboardingQuestionKey {
  return processDefinitions.ONBOARDING.questions.some((question) => question.key === value);
}

export function OnboardingForm({ preflight, draft = null }: { preflight: Preflight; draft?: OnboardingDraftDto | null }) {
  const router = useRouter();
  const [showPreflight, setShowPreflight] = useState(!draft);
  const [disclosureAccepted, setDisclosureAccepted] = useState(draft?.disclosureAccepted ?? false);
  const [currentStep, setCurrentStep] = useState(draft?.currentStep ?? 0);
  const [values, setValues] = useState<OnboardingEditableValues>({ ...emptyDemoData, ...draft?.values });
  const [maskedValues, setMaskedValues] = useState(draft?.maskedValues ?? {});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [nameMismatch, setNameMismatch] = useState<NameMismatch | null>(null);
  const [feedback, setFeedback] = useState(draft ? "Safe saved progress was restored; re-enter masked identifiers only if you need to edit them." : "");
  const [pending, setPending] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const mismatchAlertRef = useRef<HTMLDivElement>(null);
  const step = onboardingSteps[currentStep];
  const questions = processDefinitions.ONBOARDING.questions.filter((question) => question.step === step.key);

  useEffect(() => {
    function onPatchApplied(event: Event) {
      const detail = (event as CustomEvent<AssistantPatchAppliedEventDetail>).detail;
      if (!detail?.values) return;
      setValues((current) => ({ ...current, ...detail.values }));
      setErrors((current) => {
        const next = { ...current };
        for (const key of Object.keys(detail.values) as OnboardingQuestionKey[]) delete next[key];
        return next;
      });
      const firstField = processDefinitions.ONBOARDING.questions.find((question) => question.key in detail.values);
      if (firstField) {
        const targetStep = onboardingSteps.findIndex((item) => item.key === firstField.step);
        if (targetStep >= 0) setCurrentStep(targetStep);
      }
      setShowPreflight(false);
      setFeedback("Assistant-proposed synthetic values applied to this form after confirmation. Review them before continuing.");
    }
    window.addEventListener(ASSISTANT_PATCH_APPLIED_EVENT, onPatchApplied);
    return () => window.removeEventListener(ASSISTANT_PATCH_APPLIED_EVENT, onPatchApplied);
  }, []);

  useEffect(() => {
    if (nameMismatch) mismatchAlertRef.current?.focus();
  }, [nameMismatch]);

  function startManual() {
    if (!disclosureAccepted) return;
    setValues({ ...emptyDemoData });
    setShowPreflight(false);
  }

  function fillValidData() {
    if (!disclosureAccepted) return;
    setValues(editableDemoValues(validDemoOnboardingData));
    setErrors({});
    setNameMismatch(null);
    setFeedback("Valid fictional values filled. Review them before saving.");
    setShowPreflight(false);
  }

  function setField(key: OnboardingQuestionKey, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (key === "bankName" || key === "aadhaarName") setNameMismatch(null);
    setFeedback("");
  }

  function validateField(key: OnboardingQuestionKey) {
    const result = onboardingRequestSchema.shape[key].safeParse(values[key]);
    const message = result.success ? undefined : result.error.issues[0]?.message;
    setErrors((current) => ({ ...current, [key]: message }));
    const question = processDefinitions.ONBOARDING.questions.find((item) => item.key === key);
    window.dispatchEvent(new CustomEvent<AssistantValidationEventDetail>(ASSISTANT_VALIDATION_EVENT, {
      detail: { field: key, label: question?.label ?? key, message, valid: result.success },
    }));
    return result.success;
  }

  function validateCurrentStep() {
    const nextErrors: FieldErrors = { ...errors };
    let valid = true;
    for (const question of questions) {
      const result = onboardingRequestSchema.shape[question.key].safeParse(values[question.key]);
      nextErrors[question.key] = result.success ? undefined : result.error.issues[0]?.message;
      valid = result.success && valid;
    }
    setErrors(nextErrors);
    if (!valid) queueMicrotask(() => errorSummaryRef.current?.focus());
    return valid;
  }

  async function nextStep() {
    if (!validateCurrentStep()) return;
    setPending(true);
    setFeedback("");
    try {
      const next = Math.min(currentStep + 1, onboardingSteps.length - 1);
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoDisclosureAccepted: disclosureAccepted, currentStep: next, values }),
      });
      const result = await response.json() as OnboardingDraftDto & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Demo progress could not be saved.");
      setMaskedValues(result.maskedValues ?? {});
      setCurrentStep(next);
      setFeedback("Progress saved to this demo run.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Demo progress could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = onboardingRequestSchema.safeParse({ ...values, demoDisclosureAccepted: disclosureAccepted });
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (isQuestionKey(path) && !nextErrors[path]) nextErrors[path] = issue.message;
      }
      setErrors(nextErrors);
      const firstInvalid = processDefinitions.ONBOARDING.questions.find((question) => nextErrors[question.key]);
      if (firstInvalid) {
        const firstStep = onboardingSteps.findIndex((item) => item.key === firstInvalid.step);
        if (firstStep >= 0) setCurrentStep(firstStep);
      }
      queueMicrotask(() => errorSummaryRef.current?.focus());
      return;
    }

    setPending(true);
    setFeedback("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      const result = await response.json() as {
        error?: string;
        profile?: { onboardingComplete: boolean };
        findings?: Array<{ code: string }>;
      };
      if (!response.ok) throw new Error(result.error ?? "Demo profile could not be saved.");
      const complete = Boolean(result.profile?.onboardingComplete);
      const hasBankNameMismatch = result.findings?.some((finding) => finding.code === "BANK_NAME_MISMATCH") ?? false;
      if (hasBankNameMismatch) {
        const correctionMessage = `Change the bank account name to exactly match ${parsed.data.aadhaarName}.`;
        setNameMismatch({ aadhaarName: parsed.data.aadhaarName });
        setErrors((current) => ({ ...current, bankName: correctionMessage }));
        setFeedback("");
        window.dispatchEvent(new CustomEvent<AssistantValidationEventDetail>(ASSISTANT_VALIDATION_EVENT, {
          detail: { field: "bankName", label: "Name on bank statement", message: correctionMessage, valid: false },
        }));
      } else {
        setNameMismatch(null);
        setFeedback(complete
          ? "Demo profile saved. The KYC statuses below are simulated and the profile is ready."
          : "Demo profile saved, but KYC checks must be corrected before onboarding can complete.");
      }
      if (complete) {
        router.replace("/passbook?onboarding=complete");
      } else {
        router.refresh();
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Demo profile could not be saved.");
    } finally {
      setPending(false);
    }
  }

  if (showPreflight) {
    return <PreflightPanel disclosureAccepted={disclosureAccepted} onAutofill={fillValidData} onDisclosureChange={setDisclosureAccepted} onManual={startManual} preflight={preflight} />;
  }

  const visibleErrors = questions.flatMap((question) => errors[question.key]
    ? [{ key: question.key, label: question.label, error: errors[question.key] }]
    : []);

  return (
    <div className="onboarding-workspace">
      <FormProgress currentStep={currentStep} />
      <form className="onboarding-form" noValidate onSubmit={submit}>
        <div className="form-section-heading">
          <p className="utility-label">{step.label}</p>
          <h2>{stepCopy[step.key].title}</h2>
          <p>{stepCopy[step.key].description}</p>
        </div>
        <div className="compact-data-warning">Synthetic data only. Never enter real UAN, Aadhaar, PAN, bank, member ID, mobile, government, or biometric data.</div>
        {nameMismatch ? (
          <div className="kyc-mismatch-alert" ref={mismatchAlertRef} role="alert" tabIndex={-1}>
            <CircleAlert aria-hidden="true" size={20} />
            <p>
              <strong>Name mismatch:</strong> Name on bank statement must exactly match the verified Aadhaar name <strong>{nameMismatch.aadhaarName}</strong>. Correct the highlighted field and save again.
            </p>
          </div>
        ) : null}
        {visibleErrors.length > 0 && !nameMismatch ? (
          <div className="error-summary" ref={errorSummaryRef} role="alert" tabIndex={-1}>
            <strong>Check {visibleErrors.length} field{visibleErrors.length === 1 ? "" : "s"} in this section:</strong>
            <ul>{visibleErrors.map((item) => <li key={item.key}><a href={`#${item.key}`}>{item.label}: {item.error}</a></li>)}</ul>
          </div>
        ) : null}
        <KycForm errors={errors} maskedValues={maskedValues} onBlur={validateField} onChange={setField} questions={questions} values={values} />
        <DemoShortcut
          disabled={pending}
          onFill={fillValidData}
          onIssueError={setFeedback}
          onIssueLoaded={(message) => {
            setValues(editableDemoValues(bankMismatchDemoOnboardingData));
            setErrors({});
            setNameMismatch(null);
            setFeedback(message);
          }}
          showIssue={step.key === "kyc"}
        />
        <p className="save-feedback" aria-live="polite">{feedback}</p>
        <div className="form-actions">
          {currentStep > 0 ? <button className="secondary-action" disabled={pending} onClick={() => setCurrentStep((current) => current - 1)} type="button"><ArrowLeft aria-hidden="true" size={17} /> Previous</button> : <span />}
          {currentStep < onboardingSteps.length - 1
            ? <button className="primary-action" disabled={pending} onClick={nextStep} type="button">{pending ? "Saving…" : "Save and continue"} <ArrowRight aria-hidden="true" size={17} /></button>
            : <button className="primary-action" disabled={pending} type="submit"><Save aria-hidden="true" size={17} /> {pending ? "Saving…" : "Save demo profile"}</button>}
        </div>
      </form>
    </div>
  );
}
