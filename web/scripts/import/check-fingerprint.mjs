#!/usr/bin/env node
// Compares a build's source fingerprint with the latest complete import
// (docs/ARCHITECTURE.md §3.1 step 4).
//
//   node scripts/import/check-fingerprint.mjs <path/to/fingerprint.json>
//
// Prints exactly one line on stdout, `changed` or `unchanged`, and appends
// `changed=true|false` to $GITHUB_OUTPUT when that is set. A database with no
// dataset_meta table or no complete import counts as `changed`. Exits
// non-zero only on a real error (unreadable file, unreachable database).
import { appendFileSync, readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: node scripts/import/check-fingerprint.mjs <fingerprint.json>");
  const combined = JSON.parse(readFileSync(path, "utf8")).combined;
  if (typeof combined !== "string" || !combined) throw new Error(`${path} has no "combined" fingerprint`);
  config({ quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "criclysis-check-fingerprint" });
  await client.connect();
  let previous = null;
  try {
    const { rows } = await client.query(`SELECT to_regclass('public.dataset_meta') IS NOT NULL AS present`);
    if (rows[0].present) {
      const r = await client.query(
        `SELECT source_fingerprint FROM dataset_meta WHERE status = 'complete' ORDER BY finished_at DESC NULLS LAST, id DESC LIMIT 1`,
      );
      previous = r.rows[0]?.source_fingerprint ?? null;
    }
  } finally {
    await client.end();
  }

  const changed = previous !== combined;
  console.error(`fingerprint ${combined}; last complete import ${previous ?? "(none)"}`);
  console.log(changed ? "changed" : "unchanged");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

main().catch((e) => {
  console.error(`check-fingerprint failed: ${e?.message ?? e}`);
  process.exit(1);
});
