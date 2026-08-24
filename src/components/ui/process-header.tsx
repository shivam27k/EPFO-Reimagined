import type { ReactNode } from "react";

type ProcessHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function ProcessHeader({ eyebrow, title, description, action }: ProcessHeaderProps) {
  return (
    <header className="process-header">
      <div>
        <p className="utility-label">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="process-description">{description}</p> : null}
      </div>
      {action ? <div className="process-action">{action}</div> : null}
    </header>
  );
}
