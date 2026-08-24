import type { OnboardingInput } from "@/domain/onboarding-schema";

export const validDemoOnboardingData = Object.freeze({
  demoDisclosureAccepted: true,
  uan: "100000004321",
  aadhaarName: "Rohan Mehta",
  dateOfBirth: "1998-03-14",
  mobileNumber: "9876542104",
  establishmentName: "Sahyadri Demo Components Pvt Ltd",
  memberId: "PYBOM00424890000054321",
  joinedAt: "2026-07-01",
  epfMember: true,
  epsMember: true,
  panName: "Rohan Mehta",
  panNumber: "DEMOP4321F",
  bankName: "Rohan Mehta",
  bankAccountNumber: "000000001188",
  bankIfsc: "DEMO0001188",
}) satisfies OnboardingInput;

export const bankMismatchDemoOnboardingData = Object.freeze({
  ...validDemoOnboardingData,
  bankName: "Rohan K Mehta",
}) satisfies OnboardingInput;
