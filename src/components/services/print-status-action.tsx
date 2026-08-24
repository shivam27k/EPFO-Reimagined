"use client";

import { Printer } from "lucide-react";

import styles from "@/app/(portal)/services/services.module.css";

export function PrintStatusAction({ label = "Print fictional status" }: { label?: string }) {
  return (
    <button className={styles.localAction} onClick={() => window.print()} type="button">
      <Printer aria-hidden="true" size={17} />
      {label}
    </button>
  );
}
