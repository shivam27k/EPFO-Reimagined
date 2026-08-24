"use client";

import { CircleHelp, X } from "lucide-react";

export interface ProactivePromptModel {
  key: string;
  eyebrow: string;
  title: string;
  explanation: string;
  reason: string;
  processKey?: "ONBOARDING" | "FINAL_CLAIM";
  questionCount?: number;
}

export function ProactivePrompt({
  prompt,
  onDismiss,
  onChooseGuidance,
}: {
  prompt: ProactivePromptModel;
  onDismiss: () => void;
  onChooseGuidance?: (mode: "ONE_BY_ONE" | "REVIEW_ALL") => void;
}) {
  return (
    <section className="proactive-prompt" aria-labelledby={`proactive-${prompt.key}`}>
      <CircleHelp aria-hidden="true" size={20} />
      <div>
        <p className="utility-label">{prompt.eyebrow}</p>
        <h2 id={`proactive-${prompt.key}`}>{prompt.title}</h2>
        <p>{prompt.explanation}</p>
        <p className="proactive-reason"><strong>Why this appeared:</strong> {prompt.reason}</p>
        {prompt.processKey && prompt.questionCount && onChooseGuidance ? (
          <div className="proactive-actions" aria-label="Choose assistant guidance style">
            <button className="primary-action" onClick={() => onChooseGuidance("ONE_BY_ONE")} type="button">
              Guide me one by one
            </button>
            <button className="secondary-action" onClick={() => onChooseGuidance("REVIEW_ALL")} type="button">
              Review all {prompt.questionCount} questions
            </button>
          </div>
        ) : null}
      </div>
      <button className="icon-action" onClick={onDismiss} type="button" aria-label="Dismiss this assistant suggestion">
        <X aria-hidden="true" size={18} />
      </button>
    </section>
  );
}
