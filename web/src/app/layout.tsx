import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { InlineScript, THEME_SCRIPT } from "@/components/InlineScript";

export const metadata: Metadata = {
  title: "Criclysis: international cricket analytics",
  description:
    "Career records, strengths and weaknesses, team records and match results for international cricket, built from Cricsheet ball-by-ball data.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#12171e" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
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
