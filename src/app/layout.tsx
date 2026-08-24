import type { Metadata } from "next";
import { bodyFont, dataFont, headingFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "EPF Sahayak",
  description: "An independent EPF guidance prototype using synthetic data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      className={`${headingFont.variable} ${bodyFont.variable} ${dataFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
