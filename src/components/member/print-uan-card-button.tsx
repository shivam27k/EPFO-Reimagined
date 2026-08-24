"use client";

import { Printer } from "lucide-react";

import styles from "./member-management.module.css";

export function PrintUanCardButton() {
  return <button className={`primary-action ${styles.printButton}`} onClick={() => window.print()} type="button"><Printer aria-hidden="true" size={17} />Print fictional UAN card</button>;
}
