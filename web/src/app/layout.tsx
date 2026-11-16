import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { InlineScript, THEME_SCRIPT } from "@/components/InlineScript";

// Both faces are downloaded at build time and served from this site (next/font), so no request goes to Google.
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--ff-display", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--ff-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Criclysis: international cricket analytics",
  description:
    "Career records, strengths and weaknesses, team records and match results for international cricket, built from Cricsheet ball-by-ball data.",
};

export const viewport: Viewport = {
  // Dark is the default theme.
  themeColor: "#060a13",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${sans.variable}`}>
      <head>
        <InlineScript html={THEME_SCRIPT} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Nav />
        <main id="main" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
