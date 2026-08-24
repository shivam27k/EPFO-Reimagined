import { FieldHelp } from "@/components/ui/field-help";
import type { OnboardingEditableValues } from "@/domain/onboarding-schema";
import type { OnboardingQuestion, OnboardingQuestionKey } from "@/domain/process-definitions";

export function KycForm({
  questions,
  values,
  errors,
  maskedValues,
  onChange,
  onBlur,
}: {
  questions: readonly OnboardingQuestion[];
  values: OnboardingEditableValues;
  errors: Partial<Record<OnboardingQuestionKey, string>>;
  maskedValues?: Partial<Record<OnboardingQuestionKey, string | null>>;
  onChange: (key: OnboardingQuestionKey, value: string | boolean) => void;
  onBlur: (key: OnboardingQuestionKey) => void;
}) {
  return (
    <div className="question-grid">
      {questions.map((question) => {
        const helpId = `${question.key}-help`;
        const errorId = `${question.key}-error`;
        const describedBy = `${helpId}${errors[question.key] ? ` ${errorId}` : ""}`;
        const value = values[question.key];
        const maskedValue = maskedValues?.[question.key];
        const conciseHelp = question.key === "uan"
          ? "Enter only the fictional 12-digit UAN returned by this demo; this app does not allot or activate a UAN."
          : question.explanation;
        const guidanceSummary = maskedValue
          ? question.workflowNote
            ? "View saved value, example, and official workflow"
            : "View saved value and example"
          : question.workflowNote
            ? "View example and official workflow"
            : "View example";

        if (question.control === "checkbox") {
          return (
            <div className="onboarding-field checkbox-field" key={question.key}>
              <label className="membership-choice" htmlFor={question.key}>
                <input
                  aria-describedby={describedBy}
                  checked={Boolean(values[question.key])}
                  id={question.key}
                  name={question.key}
                  onBlur={() => onBlur(question.key)}
                  onChange={(event) => onChange(question.key, event.target.checked)}
                  type="checkbox"
                />
                <span>{question.label}</span>
              </label>
              <span className="official-term">Official term: {question.officialTerm}</span>
              <FieldHelp id={helpId}>
                {conciseHelp}
              </FieldHelp>
              <details className="field-guidance">
                <summary>{guidanceSummary}</summary>
                {question.key === "uan" ? <p>{question.explanation}</p> : null}
                <p>{question.example} {question.workflowNote}</p>
              </details>
              {errors[question.key] ? <FieldHelp id={errorId} tone="error">{errors[question.key]}</FieldHelp> : null}
            </div>
          );
        }

        return (
          <div className="onboarding-field" key={question.key}>
            <label htmlFor={question.key}>{question.label}</label>
            <span className="official-term">Official term: {question.officialTerm}</span>
            <input
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors[question.key])}
              id={question.key}
              inputMode={question.inputMode}
              name={question.key}
              onBlur={() => onBlur(question.key)}
              onChange={(event) => onChange(question.key, event.target.value)}
              type={question.control}
              value={typeof value === "string" ? value : ""}
            />
            <FieldHelp id={helpId}>
              {conciseHelp}
            </FieldHelp>
            <details className="field-guidance">
              <summary>{guidanceSummary}</summary>
              {question.key === "uan" ? <p>{question.explanation}</p> : null}
              {maskedValue ? <p>Saved masked value: {maskedValue}. Re-enter it to edit.</p> : null}
              <p>{question.example} {question.workflowNote}</p>
            </details>
            {errors[question.key] ? <FieldHelp id={errorId} tone="error">{errors[question.key]}</FieldHelp> : null}
          </div>
        );
      })}
    </div>
  );
}
