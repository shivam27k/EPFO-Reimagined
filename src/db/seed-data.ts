import { eq } from "drizzle-orm";

import type { DemoPersona } from "../domain/types";
import { calculatePostedEpfBalance } from "../domain/epf-balance";
import { ensureDatabaseReady, getDb } from "./client";
import {
  claimEvents,
  claims,
  contributions,
  demoUsers,
  employments,
  kycRecords,
  memberProfiles,
  scenarioRuns,
  serviceRequests,
} from "./schema";

export const DEMO_CREDENTIALS = Object.freeze({
  newMember: Object.freeze({
    id: "demo-user-new-member",
    username: "new.member@demo.epfsahayak.in",
    password: "DemoNew#2026",
    passwordHash:
      "$2a$10$abcdefghijklmnopqrstuu1QYXBjd32iyA4aOLsDY5ZNS6wjR/kVC",
    persona: "NEW_MEMBER" as const,
    displayName: "Rohan Mehta",
  }),
  existingMember: Object.freeze({
    id: "demo-user-existing-member",
    username: "existing.member@demo.epfsahayak.in",
    password: "DemoExisting#2026",
    passwordHash:
      "$2a$10$abcdefghijklmnopqrstuuhduW/0Xdsiv3YXYuMZohrRvMab5gL2q",
    persona: "EXISTING_MEMBER" as const,
    displayName: "Ananya Sharma",
  }),
});

export function buildDemoUserSeeds() {
  return [
    {
      id: DEMO_CREDENTIALS.newMember.id,
      username: DEMO_CREDENTIALS.newMember.username,
      passwordHash: DEMO_CREDENTIALS.newMember.passwordHash,
      persona: DEMO_CREDENTIALS.newMember.persona,
      displayName: DEMO_CREDENTIALS.newMember.displayName,
    },
    {
      id: DEMO_CREDENTIALS.existingMember.id,
      username: DEMO_CREDENTIALS.existingMember.username,
      passwordHash: DEMO_CREDENTIALS.existingMember.passwordHash,
      persona: DEMO_CREDENTIALS.existingMember.persona,
      displayName: DEMO_CREDENTIALS.existingMember.displayName,
    },
  ] as const;
}

function buildExistingContributionSeeds(demoRunId: string, employmentId: string) {
  const rows = [];
  const cursor = new Date(Date.UTC(2021, 3, 1));
  const end = new Date(Date.UTC(2026, 4, 1));

  while (cursor <= end) {
    const wageMonth = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    rows.push({
      id: `${demoRunId}:contribution:${wageMonth}`,
      employmentId,
      wageMonth,
      employeeEpf: 216000,
      employerEpf: 66600,
      employerEps: 149400,
      postingStatus: wageMonth === "2026-05" ? "MISSING" as const : "POSTED" as const,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return rows;
}

export function buildDemoRunSeed(persona: DemoPersona, demoRunId: string) {
  if (persona === "NEW_MEMBER") {
    return {
      profile: {
        demoRunId,
        uan: "1000 0000 4321",
        aadhaarName: "Rohan Mehta",
        bankName: "Rohan Mehta",
        panName: "Rohan Mehta",
        dateOfBirth: "1998-03-14",
        mobileMasked: "+91 ******2104",
        onboardingComplete: false,
      },
      kycRecords: [
        {
          id: `${demoRunId}:kyc:aadhaar`,
          demoRunId,
          type: "AADHAAR" as const,
          valueMasked: "XXXX-XXXX-4321",
          status: "NOT_STARTED" as const,
          updatedAt: "2026-08-01T09:00:00.000Z",
        },
        {
          id: `${demoRunId}:kyc:pan`,
          demoRunId,
          type: "PAN" as const,
          valueMasked: "ABCDE****F",
          status: "NOT_STARTED" as const,
          updatedAt: "2026-08-01T09:00:00.000Z",
        },
        {
          id: `${demoRunId}:kyc:bank`,
          demoRunId,
          type: "BANK" as const,
          valueMasked: "HDFC ****1188",
          status: "NOT_STARTED" as const,
          updatedAt: "2026-08-01T09:00:00.000Z",
        },
      ],
      employments: [],
      contributions: [],
      claims: [],
      claimEvents: [],
      serviceRequests: [],
      scenarioRuns: [
        {
          id: `${demoRunId}:scenario:onboarding-name-mismatch`,
          demoRunId,
          scenarioKey: "ONBOARDING_NAME_MISMATCH" as const,
          stage: "START" as const,
          updatedAt: "2026-08-01T09:00:00.000Z",
        },
      ],
    } as const;
  }

  const employmentId = `${demoRunId}:employment:current`;
  const claimId = `${demoRunId}:claim:final-settlement`;
  const existingContributions = buildExistingContributionSeeds(demoRunId, employmentId);

  return {
    profile: {
      demoRunId,
      uan: "1012 3456 7890",
      aadhaarName: "Ananya Sharma",
      bankName: "Ananya Sharmaa",
      panName: "Ananya Sharma",
      dateOfBirth: "1991-11-23",
      mobileMasked: "+91 ******8031",
      onboardingComplete: true,
    },
    kycRecords: [
      {
        id: `${demoRunId}:kyc:aadhaar`,
        demoRunId,
        type: "AADHAAR" as const,
        valueMasked: "XXXX-XXXX-9087",
        status: "VERIFIED" as const,
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
      {
        id: `${demoRunId}:kyc:pan`,
        demoRunId,
        type: "PAN" as const,
        valueMasked: "ANAPS****K",
        status: "VERIFIED" as const,
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
      {
        id: `${demoRunId}:kyc:bank`,
        demoRunId,
        type: "BANK" as const,
        valueMasked: "ICICI ****2442",
        status: "MISMATCH" as const,
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
    ],
    employments: [
      {
        id: employmentId,
        demoRunId,
        memberId: "PYBOM00424890000012345",
        establishmentName: "Sahyadri Mobility Components Pvt Ltd",
        joinedAt: "2021-04-12",
        exitedAt: null,
        epfMember: true,
        epsMember: true,
      },
    ],
    contributions: existingContributions,
    claims: [
      {
        id: claimId,
        demoRunId,
        type: "FINAL_SETTLEMENT" as const,
        amount: calculatePostedEpfBalance(existingContributions),
        status: "DRAFT" as const,
        submittedAt: null,
      },
    ],
    claimEvents: [
      {
        id: `${demoRunId}:claim-event:draft`,
        claimId,
        status: "DRAFT" as const,
        actor: "MEMBER" as const,
        explanation: "Draft claim prepared with synthetic EPF balances.",
        occurredAt: "2026-08-01T09:30:00.000Z",
      },
    ],
    serviceRequests: [
      {
        id: `${demoRunId}:service-request:exit-date`,
        demoRunId,
        type: "MISSING_EXIT_DATE",
        owner: "EMPLOYER" as const,
        status: "OPEN" as const,
        createdAt: "2026-08-01T09:45:00.000Z",
        resolvedAt: null,
      },
    ],
    scenarioRuns: [
      {
        id: `${demoRunId}:scenario:missing-exit-date`,
        demoRunId,
        scenarioKey: "MISSING_EXIT_DATE" as const,
        stage: "ISSUE_LOADED" as const,
        updatedAt: "2026-08-01T09:45:00.000Z",
      },
      {
        id: `${demoRunId}:scenario:claim-bank-name-mismatch`,
        demoRunId,
        scenarioKey: "CLAIM_BANK_NAME_MISMATCH" as const,
        stage: "ISSUE_LOADED" as const,
        updatedAt: "2026-08-01T09:45:00.000Z",
      },
    ],
  } as const;
}

export async function insertSeedForRun(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  persona: DemoPersona,
  demoRunId: string,
) {
  const seed = buildDemoRunSeed(persona, demoRunId);
  const kycRecordSeeds: (typeof kycRecords.$inferInsert)[] =
    seed.kycRecords.map((record) => ({ ...record }));
  const employmentSeeds: (typeof employments.$inferInsert)[] =
    seed.employments.map((employment) => ({ ...employment }));
  const contributionSeeds: (typeof contributions.$inferInsert)[] =
    seed.contributions.map((contribution) => ({ ...contribution }));
  const claimSeeds: (typeof claims.$inferInsert)[] = seed.claims.map(
    (claim) => ({ ...claim }),
  );
  const claimEventSeeds: (typeof claimEvents.$inferInsert)[] =
    seed.claimEvents.map((event) => ({ ...event }));
  const serviceRequestSeeds: (typeof serviceRequests.$inferInsert)[] =
    seed.serviceRequests.map((request) => ({ ...request }));
  const scenarioRunSeeds: (typeof scenarioRuns.$inferInsert)[] =
    seed.scenarioRuns.map((scenario) => ({ ...scenario }));

  await tx.insert(memberProfiles).values(seed.profile);

  if (kycRecordSeeds.length > 0) {
    await tx.insert(kycRecords).values(kycRecordSeeds);
  }
  if (employmentSeeds.length > 0) {
    await tx.insert(employments).values(employmentSeeds);
  }
  if (contributionSeeds.length > 0) {
    await tx.insert(contributions).values(contributionSeeds);
  }
  if (claimSeeds.length > 0) {
    await tx.insert(claims).values(claimSeeds);
  }
  if (claimEventSeeds.length > 0) {
    await tx.insert(claimEvents).values(claimEventSeeds);
  }
  if (serviceRequestSeeds.length > 0) {
    await tx.insert(serviceRequests).values(serviceRequestSeeds);
  }
  if (scenarioRunSeeds.length > 0) {
    await tx.insert(scenarioRuns).values(scenarioRunSeeds);
  }
}

export async function seedAllDemoUsers() {
  await ensureDatabaseReady();
  const db = getDb();

  for (const user of buildDemoUserSeeds()) {
    await db
      .insert(demoUsers)
      .values(user)
      .onConflictDoUpdate({
        target: demoUsers.id,
        set: {
          username: user.username,
          passwordHash: user.passwordHash,
          persona: user.persona,
          displayName: user.displayName,
        },
      });
  }

  return db.select().from(demoUsers).where(eq(demoUsers.id, demoUsers.id));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/src/db/seed-data.ts")) {
  await seedAllDemoUsers();
  const users = await getDb().select().from(demoUsers);
  console.log(`Seeded ${users.length} demo users.`);
}
