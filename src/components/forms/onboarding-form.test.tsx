import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { getOnboardingPreflight } from "@/domain/process-definitions";
import { onboardingDraftRequestSchema } from "@/domain/onboarding-schema";
import { bankMismatchDemoOnboardingData } from "@/domain/demo-onboarding-data";
import { OnboardingForm } from "./onboarding-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

describe("OnboardingForm", () => {
  test("requires explicit demo disclosure before either start choice", () => {
    render(<OnboardingForm preflight={getOnboardingPreflight()} />);

    const manual = screen.getByRole("button", { name: /enter demo details manually/i });
    const autofill = screen.getByRole("button", { name: /fill with valid demo data/i });
    expect(manual).toBeDisabled();
    expect(autofill).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /accept the synthetic-data disclosure/i }));
    expect(manual).toBeEnabled();
    expect(autofill).toBeEnabled();
  });

  test("renders the current step directly from registry definitions", () => {
    render(<OnboardingForm preflight={getOnboardingPreflight()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /accept the synthetic-data disclosure/i }));
    fireEvent.click(screen.getByRole("button", { name: /fill with valid demo data/i }));

    expect(screen.getByLabelText("UAN returned from UMANG")).toHaveValue("100000004321");
    expect(screen.getByText(/official allotment and activation now continue in umang/i)).toBeInTheDocument();
  });

  test("does not announce saved progress after a failed draft request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Save unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })));
    render(<OnboardingForm preflight={getOnboardingPreflight()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /accept the synthetic-data disclosure/i }));
    fireEvent.click(screen.getByRole("button", { name: /fill with valid demo data/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Save unavailable")).toBeVisible();
    expect(screen.queryByText(/progress saved/i)).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Identity and UAN");
    vi.unstubAllGlobals();
  });

  test("manual progress save accepts only the current completed step", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const parsed = onboardingDraftRequestSchema.safeParse(JSON.parse(String(init?.body)));
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: "Draft rejected" }), {
          status: 422,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        currentStep: 1,
        disclosureAccepted: true,
        values: parsed.data.values,
        maskedValues: {},
        updatedAt: "2026-08-22T00:00:00.000Z",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    render(<OnboardingForm preflight={getOnboardingPreflight()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /accept the synthetic-data disclosure/i }));
    fireEvent.click(screen.getByRole("button", { name: /enter demo details manually/i }));
    fireEvent.change(screen.getByLabelText("UAN returned from UMANG"), {
      target: { value: "100000004321" },
    });
    fireEvent.change(screen.getByLabelText("Name on Aadhaar result sheet"), {
      target: { value: "Priya Sharma" },
    });
    fireEvent.change(screen.getByLabelText("Date of birth returned by simulated identity check"), {
      target: { value: "1998-03-14" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Progress saved to this demo run.")).toBeVisible();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Contact");
    vi.unstubAllGlobals();
  });

  test("shows a compact alert and highlights the bank-name field when it does not match Aadhaar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      profile: { onboardingComplete: false },
      findings: [{
        code: "BANK_NAME_MISMATCH",
        severity: "BLOCKER",
        owner: "BANK",
        title: "Bank name does not match Aadhaar",
        explanation: "The bank account holder name must match the verified identity name.",
        allowedActions: ["CORRECT_BANK_NAME"],
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    const { demoDisclosureAccepted: _accepted, ...values } = bankMismatchDemoOnboardingData;

    render(<OnboardingForm
      draft={{
        currentStep: 3,
        disclosureAccepted: true,
        values,
        maskedValues: {},
        updatedAt: "2026-08-24T00:00:00.000Z",
      }}
      preflight={getOnboardingPreflight()}
    />);
    fireEvent.click(screen.getByRole("button", { name: /save demo profile/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Name mismatch");
    expect(alert).toHaveTextContent("Name on bank statement must exactly match the verified Aadhaar name Rohan Mehta");
    expect(alert.querySelector(".kyc-name-comparison")).not.toBeInTheDocument();
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Name on bank statement")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/change the bank account name to exactly match rohan mehta/i)).toBeVisible();
    vi.unstubAllGlobals();
  });
});
