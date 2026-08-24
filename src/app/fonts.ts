import { Anek_Latin, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";

export const headingFont = Anek_Latin({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "600", "700"],
});

export const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

export const dataFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-data",
  weight: ["400", "500", "600"],
});
