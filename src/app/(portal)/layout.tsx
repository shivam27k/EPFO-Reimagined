import { redirect } from "next/navigation";

import { PortalShell } from "@/components/portal/portal-shell";
import {
  AuthenticationError,
  requireCurrentRun,
} from "@/server/auth/session";
import { getCachedMemberSnapshot } from "@/server/repositories/member-repository";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let demoRunId: string;

  try {
    const current = await requireCurrentRun();
    demoRunId = current.demoRun.id;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/login");
    }

    throw error;
  }

  const snapshot = await getCachedMemberSnapshot(demoRunId);

  return <PortalShell snapshot={snapshot}>{children}</PortalShell>;
}
