import { z, ZodError } from "zod";

import { exitReasons, MarkExitError, markEmploymentExit } from "@/server/services/mark-exit-service";
import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

const markExitSchema = z.object({
  employmentKey: z.string().regex(/^employment:[a-z0-9-]+$/i),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmExitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.enum(exitReasons),
  simulatedAadhaarConsent: z.literal(true),
  acknowledgementAccepted: z.literal(true),
  demoOtp: z.literal("123456"),
});

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = markExitSchema.parse(await request.json());
    if (input.exitDate !== input.confirmExitDate) {
      return Response.json({ error: "The two exit dates must match." }, { status: 422 });
    }

    await markEmploymentExit({
      demoRunId: current.demoRun.id,
      employmentKey: input.employmentKey,
      exitDate: input.exitDate,
      reason: input.reason,
    });

    return Response.json({
      message: "Date of exit recorded in this isolated demo run.",
      snapshot: await getMemberSnapshot(current.demoRun.id),
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof ZodError) return Response.json({ error: "Complete every required Mark Exit confirmation using synthetic demo data." }, { status: 422 });
    if (error instanceof MarkExitError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "The date of exit could not be recorded. No employment data changed." }, { status: 500 });
  }
}
