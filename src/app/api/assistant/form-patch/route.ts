import { z, ZodError } from "zod";

import { processDefinitions } from "@/domain/process-definitions";
import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { applyConfirmedOnboardingPatch } from "@/server/services/onboarding-service";
import { PersonaForbiddenError } from "@/server/services/persona-guard";
import { resolveFormPatchProposal } from "@/server/assistant/assistant-store";

const allowedFields = processDefinitions.ONBOARDING.questions.map((question) => question.key) as [string, ...string[]];

const proposalSchema = z.object({
  field: z.enum(allowedFields),
  label: z.string().min(1).max(160),
  existingValue: z.string().max(180),
  proposedValue: z.string().max(180),
  source: z.string().min(1).max(240),
  confidence: z.number().min(0).max(1),
  validation: z.enum(["VALID", "NEEDS_REVIEW", "INVALID"]),
  section: z.enum(["identity", "contact", "employment", "kyc"]),
  sensitive: z.boolean().optional(),
});

const patchSchema = z.object({
  processKey: z.literal("ONBOARDING"),
  scope: z.enum(["FIELD", "SECTION", "WHOLE_FORM"]),
  section: z.enum(["identity", "contact", "employment", "kyc"]).optional(),
  proposals: z.array(proposalSchema).min(1).max(processDefinitions.ONBOARDING.questions.length),
  confirmed: z.literal(true, { error: "Review and confirm the proposed changes first." }),
  demoDisclosureAccepted: z.literal(true, { error: "Accept the synthetic-data disclosure first." }),
}).superRefine((value, context) => {
  if (value.scope === "FIELD" && value.proposals.length !== 1) {
    context.addIssue({ code: "custom", path: ["proposals"], message: "A field patch must contain exactly one field." });
  }
  if (value.scope === "SECTION" && !value.section) {
    context.addIssue({ code: "custom", path: ["section"], message: "Choose the section to update." });
  }
  if (value.proposals.some((proposal) => proposal.validation !== "VALID")) {
    context.addIssue({ code: "custom", path: ["proposals"], message: "Only proposals that pass normal field validation can be applied." });
  }
});

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    if (current.demoRun.persona !== "NEW_MEMBER") {
      return Response.json({ error: "Form assistance is available only for the new-member onboarding demo." }, { status: 403 });
    }
    const input = patchSchema.parse(await request.json());
    const draft = await applyConfirmedOnboardingPatch(current.demoRun.id, input);
    await resolveFormPatchProposal(current.demoRun.id);
    return Response.json({
      ok: true,
      draft,
      appliedFields: input.proposals.map((proposal) => proposal.field),
      message: "Confirmed synthetic values were saved through the normal onboarding draft service. Review the form before final submission.",
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof PersonaForbiddenError) return Response.json({ error: error.message }, { status: 403 });
    if (error instanceof ZodError) {
      return Response.json({ error: error.issues[0]?.message ?? "Check the proposed fields." }, { status: 422 });
    }
    if (error instanceof SyntaxError) return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    const message = error instanceof Error ? error.message : "The proposed values could not be applied.";
    return Response.json({ error: message }, { status: 409 });
  }
}
