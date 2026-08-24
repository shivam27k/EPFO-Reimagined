import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Use a valid date.");

export const onboardingRequestSchema = z.object({
  demoDisclosureAccepted: z.literal(true, {
    error: "Accept the demo disclosure before saving synthetic data.",
  }),
  uan: z.string().trim().regex(/^\d{12}$/, "Demo UAN must contain 12 digits."),
  aadhaarName: z.string().trim().min(2, "Enter the fictional Aadhaar name.").max(100),
  dateOfBirth: isoDate,
  mobileNumber: z.string().trim().regex(/^\d{10}$/, "Demo mobile number must contain 10 digits."),
  establishmentName: z.string().trim().min(3, "Enter the fictional employer name.").max(160),
  memberId: z.string().trim().regex(/^[A-Z0-9]{12,30}$/i, "Use a fictional EPF member ID."),
  joinedAt: isoDate,
  epfMember: z.boolean(),
  epsMember: z.boolean(),
  panName: z.string().trim().min(2, "Enter the fictional PAN name.").max(100),
  panNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Use a PAN-format demo value."),
  bankName: z.string().trim().min(2, "Enter the fictional bank account name.").max(100),
  bankAccountNumber: z.string().trim().regex(/^\d{8,18}$/, "Use an 8 to 18 digit demo bank account."),
  bankIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Use an 11-character IFSC-format demo value."),
});

export type OnboardingInput = z.infer<typeof onboardingRequestSchema>;
export type OnboardingEditableValues = Omit<OnboardingInput, "demoDisclosureAccepted">;

function optionalDraftField<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

export const onboardingDraftRequestSchema = z.object({
  demoDisclosureAccepted: z.literal(true, {
    error: "Accept the demo disclosure before saving progress.",
  }),
  currentStep: z.number().int().min(0).max(3),
  values: onboardingRequestSchema
    .omit({ demoDisclosureAccepted: true })
    .partial()
    .extend({
      uan: optionalDraftField(onboardingRequestSchema.shape.uan),
      aadhaarName: optionalDraftField(onboardingRequestSchema.shape.aadhaarName),
      dateOfBirth: optionalDraftField(onboardingRequestSchema.shape.dateOfBirth),
      mobileNumber: optionalDraftField(onboardingRequestSchema.shape.mobileNumber),
      establishmentName: optionalDraftField(onboardingRequestSchema.shape.establishmentName),
      memberId: optionalDraftField(onboardingRequestSchema.shape.memberId),
      joinedAt: optionalDraftField(onboardingRequestSchema.shape.joinedAt),
      panName: optionalDraftField(onboardingRequestSchema.shape.panName),
      panNumber: optionalDraftField(onboardingRequestSchema.shape.panNumber),
      bankName: optionalDraftField(onboardingRequestSchema.shape.bankName),
      bankAccountNumber: optionalDraftField(onboardingRequestSchema.shape.bankAccountNumber),
      bankIfsc: optionalDraftField(onboardingRequestSchema.shape.bankIfsc),
    }),
});

export type OnboardingDraftInput = z.infer<typeof onboardingDraftRequestSchema>;

export interface OnboardingDraftDto {
  currentStep: number;
  disclosureAccepted: boolean;
  values: Partial<Omit<OnboardingInput, "demoDisclosureAccepted">>;
  maskedValues: Partial<Record<"uan" | "mobileNumber" | "memberId" | "panNumber" | "bankAccountNumber", string | null>>;
  updatedAt: string;
}
