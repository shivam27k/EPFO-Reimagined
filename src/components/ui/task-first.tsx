import type { ReactNode } from "react";

import styles from "./task-first.module.css";

export type TaskTone = "neutral" | "active" | "complete" | "attention" | "blocked";

export interface TaskPageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  officialTerm?: string;
  status?: { label: string; tone: TaskTone };
}

export function TaskPageHeader({
  eyebrow,
  title,
  description,
  officialTerm,
  status,
}: TaskPageHeaderProps): ReactNode {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.headerCopy}>
        <p className={`utility-label ${styles.eyebrow}`}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.description}>{description}</p>
        {officialTerm ? (
          <p className={styles.officialTerm}>
            <span>Official term</span>
            {officialTerm}
          </p>
        ) : null}
      </div>
      {status ? (
        <span className={styles.status} data-tone={status.tone} role="status">
          {status.label}
        </span>
      ) : null}
    </header>
  );
}

export interface NextActionPanelProps {
  eyebrow?: string;
  title: string;
  description: string;
  owner?: string;
  tone?: TaskTone;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

export function NextActionPanel({
  eyebrow,
  title,
  description,
  owner,
  tone = "active",
  action,
  secondaryAction,
}: NextActionPanelProps): ReactNode {
  return (
    <section className={styles.nextActionPanel} data-tone={tone}>
      <div className={styles.nextActionCopy}>
        {eyebrow ? <p className={`utility-label ${styles.eyebrow}`}>{eyebrow}</p> : null}
        <h2>{title}</h2>
        <p>{description}</p>
        {owner ? (
          <p className={styles.owner}>
            <span>Responsible</span>
            {owner}
          </p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className={styles.actions}>
          {action ? <div className={styles.primaryActionSlot}>{action}</div> : null}
          {secondaryAction ? <div className={styles.secondaryActionSlot}>{secondaryAction}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

interface CompactFactsProps {
  items: readonly { label: string; value: ReactNode; supporting?: string }[];
}

export function CompactFacts({ items }: CompactFactsProps): ReactNode {
  return (
    <dl className={styles.compactFacts}>
      {items.map((item) => (
        <div key={item.label} className={styles.fact}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.supporting ? <dd className={styles.supporting}>{item.supporting}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

interface DetailDisclosureProps {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function DetailDisclosure({
  summary,
  children,
  defaultOpen = false,
}: DetailDisclosureProps): ReactNode {
  return (
    <details className={styles.detailDisclosure} open={defaultOpen}>
      <summary>{summary}</summary>
      <div className={styles.disclosureContent}>{children}</div>
    </details>
  );
}
