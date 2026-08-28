import { ShieldCheck } from "lucide-react";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import { DemoBanner } from "@/components/demo/demo-banner";
import { PortalUtilities } from "./portal-utilities";
import {
  LogoutButton,
  MobileNavigation,
  SideNavigation,
} from "./side-navigation";

export function PortalShell({
  children,
  snapshot,
  assistantWelcomeKey,
}: {
  children: React.ReactNode;
  snapshot: MemberSnapshot;
  assistantWelcomeKey?: string;
}) {
  return (
    <div className="portal-layout">
      <aside className="portal-sidebar">
        <div className="portal-wordmark">
          <span className="wordmark-mark">EPF</span>
          <span>
            <strong>EPF Sahayak</strong>
            <small>Member guidance</small>
          </span>
        </div>
        <SideNavigation />
        <div className="sidebar-member">
          <ShieldCheck size={19} aria-hidden="true" />
          <div>
            <span>Signed in as</span>
            <strong>{snapshot.profile.displayName}</strong>
            <small>{snapshot.profile.uanMasked}</small>
          </div>
        </div>
        <LogoutButton />
      </aside>

      <div className="portal-stage">
        <DemoBanner />
        {snapshot.simulations[0] ? (
          <div className="simulation-time-banner" role="status">
            <strong>Simulated time advance:</strong> {snapshot.simulations[0].intervalLabel}
            {" "}({snapshot.simulations[0].months} fictional months). This is not live EPFO time or data.
          </div>
        ) : null}
        <header className="portal-mobile-header">
          <div className="portal-wordmark">
            <span className="wordmark-mark">EPF</span>
            <strong>EPF Sahayak</strong>
          </div>
          <LogoutButton compact />
        </header>

        <main className="portal-content" id="portal-content">
          {children}
        </main>
      </div>

      <PortalUtilities key={assistantWelcomeKey} snapshot={snapshot} assistantWelcomeKey={assistantWelcomeKey} />
      <MobileNavigation />
    </div>
  );
}
