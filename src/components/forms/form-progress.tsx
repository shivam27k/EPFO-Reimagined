import { Check } from "lucide-react";

import { onboardingSteps } from "@/domain/process-definitions";

export function FormProgress({ currentStep }: { currentStep: number }) {
  return (
    <nav className="form-progress" aria-label="Onboarding progress">
      <p className="utility-label">
        Step {currentStep + 1} of {onboardingSteps.length} · {onboardingSteps[currentStep]?.label}
      </p>
      <ol>
        {onboardingSteps.map((step, index) => {
          const state = index < currentStep ? "complete" : index === currentStep ? "current" : "upcoming";
          return (
            <li aria-current={state === "current" ? "step" : undefined} data-state={state} key={step.key}>
              <span className="progress-marker" aria-hidden="true">
                {state === "complete" ? <Check size={14} /> : index + 1}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
