import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { DetailDisclosure, TaskPageHeader } from "@/components/ui/task-first";
import { getCachedCurrentRun as requireCurrentRun } from "@/server/auth/session";
import { getCachedMemberSnapshot as getMemberSnapshot } from "@/server/repositories/member-repository";
import styles from "./services.module.css";
import { getPortalServiceGroups } from "@/domain/portal-services";

export default async function ServicesPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const claimStatus = (snapshot.activeClaim ?? snapshot.latestClaim)?.status.replaceAll("_", " ").toLowerCase();
  const groups = getPortalServiceGroups(claimStatus);

  return (
    <div className={styles.hub}>
      <TaskPageHeader
        eyebrow="Online services"
        title="What do you need to do?"
        description="Choose an outcome first. The official EPFO form or service name stays visible beneath it."
        status={{ label: `${groups.reduce((count, group) => count + group.services.length, 0)} services`, tone: "neutral" }}
      />

      <div className={styles.outcomeGroups} data-assistant-target="services.options">
        {groups.map((group) => {
          const headingId = `outcome-${group.title.replaceAll(" ", "-").toLowerCase()}`;
          return (
            <section className={styles.outcomeGroup} aria-labelledby={headingId} key={group.title}>
              <h2 id={headingId}>{group.title}</h2>
              <div className={styles.serviceRows}>
                {group.services.map((service) => (
                  <article className={styles.serviceRow} key={service.href}>
                    <div>
                      <h3>{service.title}</h3>
                      <p className={styles.officialTerm}>{service.term}</p>
                      <p>{service.description}</p>
                    </div>
                    <Link className={styles.serviceLink} href={service.href} aria-label={`${service.title}: ${service.term}`}>
                      Open service <ArrowRight aria-hidden="true" size={17} />
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <DetailDisclosure summary="View online-service prototype boundary">
        <p className={styles.sourceNote}>These screens explain or calculate from fictional stored data. Only the existing final-settlement demo writes a claim; the other services do not submit forms or contact EPFO.</p>
      </DetailDisclosure>
    </div>
  );
}
