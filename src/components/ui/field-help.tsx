import type { ReactNode } from "react";

type FieldHelpProps = {
  id: string;
  children: ReactNode;
  tone?: "neutral" | "attention" | "error";
};

export function FieldHelp({ id, children, tone = "neutral" }: FieldHelpProps) {
  return (
    <p id={id} className="field-help" data-tone={tone}>
      {children}
    </p>
  );
}
