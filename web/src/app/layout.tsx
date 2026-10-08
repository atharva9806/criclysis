import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import Nav from "@/components/Nav";
import { DataCredit } from "@/components/DataCredit";

export const metadata: Metadata = {
  title: "Criclysis: international cricket analytics",
  description:
    "Career records, strengths and weaknesses, team records and match results for international cricket, built from Cricsheet ball-by-ball data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Nav />
        <main className="pt-14">{children}</main>
        <footer className="mt-24 border-t border-black/5 bg-[#f5f5f7]">
          <div className="mx-auto max-w-6xl px-6 py-10 text-xs text-[#6e6e73]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="font-semibold text-[#1d1d1f]">Criclysis</p>
              <nav className="flex flex-wrap gap-5">
                <Link href="/players" className="hover:text-[#1d1d1f]">Players</Link>
                <Link href="/teams" className="hover:text-[#1d1d1f]">Teams</Link>
                <Link href="/matches" className="hover:text-[#1d1d1f]">Matches</Link>
                <Link href="/compare" className="hover:text-[#1d1d1f]">Compare</Link>
                <Link href="/strategy" className="hover:text-[#1d1d1f]">Strategy</Link>
                <Link href="/live" className="hover:text-[#1d1d1f]">Live</Link>
              </nav>
            </div>
            <p className="mt-6 max-w-3xl leading-relaxed">
              Every number on this site is computed from ball-by-ball data published by{" "}
              <a href="https://cricsheet.org" className="underline hover:text-[#1d1d1f]">Cricsheet</a> under the{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/" className="underline hover:text-[#1d1d1f]">CC BY 4.0</a> licence.
              The data is refreshed from Cricsheet&apos;s public files about once a day; there is no live-score feed. Ball-by-ball coverage
              starts in the early 2000s, so careers that began earlier are only partly covered.
            </p>
            <DataCredit className="mt-4" />
            <p className="mt-4">Criclysis is not affiliated with Cricsheet, the ICC or any cricket board.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
