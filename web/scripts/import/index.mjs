#!/usr/bin/env node
// Imports a pipeline build (data/out, docs/ARCHITECTURE.md §1) into Postgres
// (§2) as a set of hash-guarded upserts in small transactions (§3.2).
//
//   node scripts/import/index.mjs --data ../data/out
//     [--allow-shrink]          skip the 5% shrink guard
//     [--budget-mb 400]         exit 2 when the database ends up larger
//     [--format-keys a,b]       only rewrite player-formats, matches, replays,
//                               team summaries and models of these formatKeys
//     [--report path.json]      also write the import report as JSON
//
// Exit codes: 0 ok, 1 error (database untouched or left at a batch
// boundary), 2 over budget (data imported), 3 another import holds the lock.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { config } from "dotenv";
import pg from "pg";
import { sha256Bytes } from "./lib/hash.mjs";
import { mapMatch, mapPlayer, mapPlayerFormat, mapTeam, mapTeamSummary, mapVenue, mapWinModel, replayStats } from "./lib/mappers.mjs";
import { assertLive, dedupePlayers, inputCounts, shrinkProblems } from "./lib/guards.mjs";
import { openSource } from "./lib/source.mjs";
import { deletePlayerFormats, insertRows, upsertRows } from "./lib/sql.mjs";

const LOCK_KEY = 4242;
const PLAYER_BATCH = 50;
const REPLAY_BATCH = 200;
const VACUUM_EVERY = 1000;
const KEEP_META_ROWS = 30;
const STATS_TABLES = ["innings", "yearly_stats", "splits", "dismissal_counts"];
const ANALYSIS_TABLES = ["traits", "profile_dimensions"];
const PF_TABLES = [...STATS_TABLES, ...ANALYSIS_TABLES, "career_stats"];
const ALL_TABLES = [
  "players", "career_stats", "innings", "yearly_stats", "splits", "traits", "profile_dimensions", "dismissal_counts",
  "teams", "team_summaries", "venues", "matches", "match_replays", "win_models", "dataset_meta",
];

function parseArgs(argv) {
  const args = { data: null, allowShrink: false, budgetMb: 400, formatKeys: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--data") args.data = next();
    else if (a === "--allow-shrink") args.allowShrink = true;
    else if (a === "--budget-mb") args.budgetMb = Number(next());
    else if (a === "--format-keys") args.formatKeys = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--report") args.report = next();
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!args.data) throw new Error("Usage: node scripts/import/index.mjs --data <dir> [--allow-shrink] [--budget-mb N] [--format-keys a,b] [--report file]");
  if (!Number.isFinite(args.budgetMb) || args.budgetMb <= 0) throw new Error("--budget-mb must be a positive number");
  return args;
}

class Changes {
  constructor() {
    this.t = {};
  }
  add(table, kind, n) {
    if (!n) return;
    this.t[table] ??= { inserted: 0, updated: 0, deleted: 0 };
    this.t[table][kind] += n;
  }
  upserted(table, returned) {
    for (const r of returned) this.add(table, r.inserted ? "inserted" : "updated", 1);
  }
  get total() {
    return Object.values(this.t).reduce((s, c) => s + c.inserted + c.updated + c.deleted, 0);
  }
}

const sizeMb = (bytes) => Math.round((bytes / 1048576) * 10) / 10;

async function tx(client, fn) {
  await client.query("BEGIN");
  try {
    const r = await fn();
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  config({ quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const t0 = Date.now();
  const timings = {};
  const lap = (name, since) => (timings[name] = Math.round((Date.now() - since) / 100) / 10);
  const warnings = [];
  const warn = (m) => {
    warnings.push(m);
    console.warn(`warning: ${m}`);
  };
  const log = (m) => console.log(m);

  log(`Importing ${args.data}`);
  const src = openSource(args.data, warn);
  const man = src.manifest;
  assertLive(man.stored);
  const thresholds = man.stored.thresholds;
  const selected = args.formatKeys ? new Set(args.formatKeys) : null;
  const inScope = (fk) => !selected || selected.has(fk);
  log(`schema v${man.version}, build ${man.buildId}${selected ? `, only ${[...selected].join(", ")}` : ""}`);

  const client = new pg.Client({ connectionString: url, application_name: "criclysis-import" });
  await client.connect();
  const { rows: lockRows } = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
  if (!lockRows[0].locked) {
    console.error("Another import holds the advisory lock; exiting.");
    await client.end();
    return 3;
  }

  // We hold the lock, so any 'running' row is left over from a killed run.
  await client.query(
    `UPDATE dataset_meta SET status = 'aborted', finished_at = now(), error = coalesce(error, 'did not finish (process ended)')
     WHERE status = 'running'`,
  );
  const { rows: metaRows } = await client.query(
    `INSERT INTO dataset_meta (build_id, schema_version, source_fingerprint, status, generated_at, manifest, cohorts)
     VALUES ($1, $2, $3, 'running', $4, $5, $6) RETURNING id`,
    [man.buildId, man.version, src.fingerprint, man.generated, JSON.stringify(man.stored), src.cohorts ? JSON.stringify(src.cohorts) : null],
  );
  const metaId = metaRows[0].id;
  const changes = new Changes();
  let exitCode = 0;

  try {
    // ---------------------------------------------------- 1. shrink guard
    const { kept: index, dropped } = dedupePlayers(src.playersIndex);
    if (dropped.length) {
      warn(`${dropped.length} players.json entries repeat a person id; kept the larger sample: ${dropped.map((d) => `${d.dropped} (kept ${d.kept})`).join(", ")}`);
    }
    const counts = inputCounts(index, src.matches);
    const skip = [...(src.playersIndex ? [] : ["players"]), ...(src.matches ? [] : ["matches"])];
    const { rows: prevRows } = await client.query(
      `SELECT counts FROM dataset_meta WHERE status = 'complete' ORDER BY finished_at DESC NULLS LAST, id DESC LIMIT 1`,
    );
    const problems = shrinkProblems(prevRows[0]?.counts?.formats, counts, { skip, formatKeys: args.formatKeys });
    if (problems.length) {
      const msg = `Shrink guard: counts fell more than 5% below the last complete import (${problems.join("; ")})`;
      if (!args.allowShrink) throw new Error(`${msg}. Re-run with --allow-shrink if this is expected.`);
      warn(`${msg}; continuing because of --allow-shrink`);
    }

    // ------------------------------------------- 2. reference data (one tx)
    let t = Date.now();
    const hashMap = async (sqlText) => new Map((await client.query(sqlText)).rows.map((r) => [r.k, r.h]));
    const changed = (map, key, row) => map.get(key) !== row.content_hash;

    const featuredFromIndex = new Map((src.replayIndex ?? []).map((r, i) => [r.id, i + 1]));
    const matchRows = (src.matches ?? []).map((m) => mapMatch(m, featuredFromIndex.get(m.id) ?? null)).filter((r) => inScope(r.format_key));

    const teamRows = new Map();
    const summaryRows = [];
    const teamFilesRead = new Map(); // teamId -> formatKeys present in its file
    for (const entry of src.teamsIndex ?? []) teamRows.set(entry.id, mapTeam(entry));
    for (const id of new Set([...(src.teamsIndex ?? []).map((e) => e.id), ...src.teamFileIds])) {
      const file = src.readTeam(id);
      if (!file) {
        warn(`teams/${id}.json not found: keeping its stored summaries`);
        continue;
      }
      if (!teamRows.has(id)) teamRows.set(id, mapTeam(file));
      const fks = [];
      for (const [fmt, tf] of Object.entries(file.formats ?? {})) {
        const row = mapTeamSummary(id, fmt, file.gender, tf);
        fks.push(row.format_key);
        if (inScope(row.format_key)) summaryRows.push(row);
      }
      teamFilesRead.set(id, fks);
    }

    const venueRows = Object.entries(src.venues ?? {}).map(([key, v]) => mapVenue(key, v));
    const modelRows = Object.entries(src.winprob?.formats ?? {})
      .map(([fk, m]) => mapWinModel(fk, m, src.winprob.holdoutFrom))
      .filter((r) => inScope(r.format_key));

    // One pg.Client runs one query at a time, so these are sequential.
    const hTeams = await hashMap(`SELECT id AS k, content_hash AS h FROM teams`);
    const hSummaries = await hashMap(`SELECT team_id || '|' || format_key AS k, content_hash AS h FROM team_summaries`);
    const hVenues = await hashMap(`SELECT key AS k, content_hash AS h FROM venues`);
    const hMatches = await hashMap(`SELECT id AS k, content_hash AS h FROM matches`);
    const hModels = await hashMap(`SELECT format_key::text AS k, content_hash AS h FROM win_models`);
    await tx(client, async () => {
      const ups = async (table, rows) => changes.upserted(table, rows.length ? await upsertRows(client, table, rows) : []);
      await ups("teams", [...teamRows.values()].filter((r) => changed(hTeams, r.id, r)));
      await ups("team_summaries", summaryRows.filter((r) => changed(hSummaries, `${r.team_id}|${r.format_key}`, r)));
      await ups("venues", venueRows.filter((r) => changed(hVenues, r.key, r)));
      await ups("matches", matchRows.filter((r) => changed(hMatches, r.id, r)));
      await ups("win_models", modelRows.filter((r) => changed(hModels, r.format_key, r)));
    });
    lap("reference", t);
    log(`reference data: ${teamRows.size} teams, ${summaryRows.length} team summaries, ${venueRows.length} venues, ${matchRows.length} matches, ${modelRows.length} models (${timings.reference}s)`);

    // --------------------------------------- 3. players, 50 per transaction
    t = Date.now();
    const knownPlayers = new Map(
      (await client.query(`SELECT id, source_id, content_hash FROM players`)).rows.map((r) => [r.source_id, { id: r.id, hash: r.content_hash }]),
    );
    const knownPF = new Map(
      (await client.query(`SELECT player_id, format_key::text AS fk, stats_hash, analysis_hash FROM career_stats`)).rows.map((r) => [
        `${r.player_id}|${r.fk}`,
        { stats: r.stats_hash, analysis: r.analysis_hash },
      ]),
    );
    const presentPF = new Set(); // "<playerId>|<fk>" seen in this build
    const keepPlayersOf = new Set(); // players whose file was missing: keep everything they have
    let changedPF = 0;
    let sinceVacuum = 0;
    let playersSeen = 0;

    const vacuum = async () => {
      const v = Date.now();
      for (const table of PF_TABLES) await client.query(`VACUUM (ANALYZE) ${table}`);
      log(`  vacuum after ${sinceVacuum} changed player-formats (${Math.round((Date.now() - v) / 100) / 10}s)`);
      sinceVacuum = 0;
    };

    for (let b = 0; b < index.length; b += PLAYER_BATCH) {
      const work = [];
      for (const entry of index.slice(b, b + PLAYER_BATCH)) {
        const file = src.readPlayer(entry.slug);
        if (!file) {
          warn(`players/${entry.slug}.json not found: keeping its stored rows`);
          keepPlayersOf.add(entry.id);
          continue;
        }
        if (file.id !== entry.id) warn(`players/${entry.slug}.json has id ${file.id}, players.json says ${entry.id}`);
        playersSeen++;
        const row = mapPlayer(file, entry);
        const known = knownPlayers.get(row.source_id);
        const pfs = Object.entries(file.formats ?? {})
          .map(([fmt, payload]) => mapPlayerFormat(fmt, payload, row.gender, thresholds))
          .filter((pf) => inScope(pf.formatKey))
          .map((pf) => {
            const prev = known ? knownPF.get(`${known.id}|${pf.formatKey}`) : undefined;
            return { ...pf, statsChanged: prev?.stats !== pf.statsHash, analysisChanged: prev?.analysis !== pf.analysisHash };
          });
        work.push({ row, known, playerChanged: known?.hash !== row.content_hash, pfs });
      }

      const dirty = work.filter((w) => w.playerChanged || w.pfs.some((pf) => pf.statsChanged || pf.analysisChanged));
      if (dirty.length) {
        const done = await tx(client, async () => {
          const ret = await upsertRows(client, "players", dirty.filter((w) => w.playerChanged).map((w) => w.row), { returning: ["id", "source_id"] });
          changes.upserted("players", ret);
          const ids = new Map(ret.map((r) => [r.source_id, r.id]));
          const statsDel = [];
          const analysisDel = [];
          const rows = { innings: [], yearly_stats: [], splits: [], dismissal_counts: [], traits: [], profile_dimensions: [] };
          const career = [];
          for (const w of dirty) {
            const pid = w.known?.id ?? ids.get(w.row.source_id);
            if (pid === undefined) throw new Error(`No id for player ${w.row.source_id}`);
            for (const pf of w.pfs) {
              const tag = (r) => ({ ...r, player_id: pid, format_key: pf.formatKey });
              if (pf.statsChanged) {
                if (w.known) statsDel.push([pid, pf.formatKey]);
                rows.innings.push(...pf.innings.map(tag));
                rows.yearly_stats.push(...pf.yearly.map(tag));
                rows.splits.push(...pf.splits.map(tag));
                rows.dismissal_counts.push(...pf.dismissals.map(tag));
              }
              if (pf.analysisChanged) {
                if (w.known) analysisDel.push([pid, pf.formatKey]);
                rows.traits.push(...pf.traits.map(tag));
                rows.profile_dimensions.push(...pf.profile.map(tag));
              }
              if (pf.statsChanged || pf.analysisChanged) {
                career.push(tag({ ...pf.career, stats_hash: pf.statsHash, analysis_hash: pf.analysisHash }));
              }
            }
          }
          for (const table of STATS_TABLES) changes.add(table, "deleted", await deletePlayerFormats(client, table, statsDel));
          for (const table of ANALYSIS_TABLES) changes.add(table, "deleted", await deletePlayerFormats(client, table, analysisDel));
          for (const [table, list] of Object.entries(rows)) changes.add(table, "inserted", list.length ? await insertRows(client, table, list) : 0);
          if (career.length) {
            changes.upserted(
              "career_stats",
              await upsertRows(client, "career_stats", career, {
                guard: `t.stats_hash IS DISTINCT FROM excluded.stats_hash OR t.analysis_hash IS DISTINCT FROM excluded.analysis_hash`,
              }),
            );
          }
          return { ids, changedPF: career.length, replaced: new Set([...statsDel, ...analysisDel].map(([p, f]) => `${p}|${f}`)).size };
        });
        // Committed: the in-memory view now matches the database.
        for (const w of dirty) {
          const pid = w.known?.id ?? done.ids.get(w.row.source_id);
          knownPlayers.set(w.row.source_id, { id: pid, hash: w.row.content_hash });
          for (const pf of w.pfs) knownPF.set(`${pid}|${pf.formatKey}`, { stats: pf.statsHash, analysis: pf.analysisHash });
        }
        changedPF += done.changedPF;
        // Only replaced rows leave dead tuples behind, so only they count towards VACUUM.
        sinceVacuum += done.replaced;
      }
      for (const w of work) {
        const pid = knownPlayers.get(w.row.source_id).id;
        for (const pf of w.pfs) presentPF.add(`${pid}|${pf.formatKey}`);
      }
      if (sinceVacuum >= VACUUM_EVERY) await vacuum();
      if ((b / PLAYER_BATCH) % 20 === 19) log(`  players ${Math.min(b + PLAYER_BATCH, index.length)}/${index.length}, ${changedPF} player-formats changed`);
    }
    lap("players", t);
    log(`players: ${playersSeen} read, ${changedPF} player-formats changed (${timings.players}s)`);

    // ------------------------------------------- 4. replays, 200 per tx
    t = Date.now();
    let replaysSeen = 0;
    let replaysNoMatch = 0;
    const replayIds = new Set();
    if (src.replayFiles) {
      const matchFk = new Map((await client.query(`SELECT id, format_key::text AS fk FROM matches`)).rows.map((r) => [r.id, r.fk]));
      const hReplays = await hashMap(`SELECT match_id AS k, content_hash AS h FROM match_replays`);
      let batch = [];
      const flush = async () => {
        if (!batch.length) return;
        const rows = batch;
        batch = [];
        await tx(client, async () => changes.upserted("match_replays", await upsertRows(client, "match_replays", rows)));
      };
      for (const f of src.replayFiles) {
        replayIds.add(f.matchId);
        const fk = matchFk.get(f.matchId);
        if (fk === undefined) {
          replaysNoMatch++;
          continue;
        }
        if (!inScope(fk)) continue;
        replaysSeen++;
        const raw = readFileSync(f.path);
        const gz = f.gzipped ? raw : gzipSync(raw, { level: 6 });
        const hash = sha256Bytes(gz);
        if (hReplays.get(f.matchId) === hash) continue;
        const json = f.gzipped ? gunzipSync(gz) : raw;
        const stats = replayStats(JSON.parse(json.toString("utf8")), json.length);
        batch.push({ match_id: f.matchId, gz, bytes: stats.bytes, balls: stats.balls, content_hash: hash });
        if (batch.length >= REPLAY_BATCH) await flush();
      }
      await flush();
      if (replaysNoMatch) warn(`${replaysNoMatch} replay file(s) have no row in matches: skipped`);
    }
    lap("replays", t);
    log(`replays: ${replaysSeen} matched files (${timings.replays}s)`);

    // ------------------------------------------------ 5. deletions (one tx)
    t = Date.now();
    await tx(client, async () => {
      const del = async (table, sqlText, params) => {
        const r = await client.query(sqlText, params);
        changes.add(table, "deleted", r.rowCount ?? 0);
      };
      const fkFilter = selected ? [...selected] : null;

      if (src.playersIndex) {
        const keepIds = index.map((p) => p.id);
        const gone = `SELECT id FROM players WHERE NOT (source_id = ANY($1::text[]))`;
        // Counted explicitly: ON DELETE CASCADE does not report rows.
        for (const table of PF_TABLES) await del(table, `DELETE FROM ${table} WHERE player_id IN (${gone})`, [keepIds]);
        await del("players", `DELETE FROM players WHERE NOT (source_id = ANY($1::text[]))`, [keepIds]);
        const keepPids = new Set([...keepPlayersOf].map((sid) => knownPlayers.get(sid)?.id).filter((x) => x !== undefined));
        const livePids = new Set(index.map((p) => knownPlayers.get(p.id)?.id).filter((x) => x !== undefined));
        const stale = [...knownPF.keys()]
          .map((k) => k.split("|"))
          .map(([pid, fk]) => [Number(pid), fk])
          .filter(([pid, fk]) => livePids.has(pid) && !keepPids.has(pid) && inScope(fk) && !presentPF.has(`${pid}|${fk}`));
        for (const table of PF_TABLES) changes.add(table, "deleted", await deletePlayerFormats(client, table, stale));
      }
      if (src.matches) {
        const ids = (src.matches ?? []).map((m) => m.id);
        const scope = fkFilter ? ` AND format_key = ANY($2::format_key[])` : "";
        const p = fkFilter ? [ids, fkFilter] : [ids];
        await del("match_replays", `DELETE FROM match_replays WHERE match_id IN (SELECT id FROM matches WHERE NOT (id = ANY($1::text[]))${scope})`, p);
        await del("matches", `DELETE FROM matches WHERE NOT (id = ANY($1::text[]))${scope}`, p);
      }
      if (src.replayFiles) {
        const scope = fkFilter ? ` AND match_id IN (SELECT id FROM matches WHERE format_key = ANY($2::format_key[]))` : "";
        await del("match_replays", `DELETE FROM match_replays WHERE NOT (match_id = ANY($1::text[]))${scope}`, fkFilter ? [[...replayIds], fkFilter] : [[...replayIds]]);
      }
      if (src.teamsIndex) {
        const ids = [...teamRows.keys()];
        await del("team_summaries", `DELETE FROM team_summaries WHERE NOT (team_id = ANY($1::text[]))`, [ids]);
        await del("teams", `DELETE FROM teams WHERE NOT (id = ANY($1::text[]))`, [ids]);
      }
      for (const [teamId, fks] of teamFilesRead) {
        const scope = fkFilter ? ` AND format_key = ANY($3::format_key[])` : "";
        await del(
          "team_summaries",
          `DELETE FROM team_summaries WHERE team_id = $1 AND NOT (format_key = ANY($2::format_key[]))${scope}`,
          fkFilter ? [teamId, fks, fkFilter] : [teamId, fks],
        );
      }
      if (src.venues) await del("venues", `DELETE FROM venues WHERE NOT (key = ANY($1::text[]))`, [venueRows.map((r) => r.key)]);
      if (src.winprob) {
        const keys = Object.keys(src.winprob.formats);
        const scope = fkFilter ? ` AND format_key = ANY($2::format_key[])` : "";
        await del("win_models", `DELETE FROM win_models WHERE NOT (format_key::text = ANY($1::text[]))${scope}`, fkFilter ? [keys, fkFilter] : [keys]);
      }
    });
    lap("deletions", t);

    // ------------------------------------------------ 6. finish the run
    const runCounts = {
      formats: counts,
      players: index.length,
      matches: src.matches?.length ?? null,
      replays: src.replayFiles?.length ?? null,
      teams: src.teamsIndex ? teamRows.size : null,
      venues: src.venues ? venueRows.length : null,
      winModels: src.winprob ? Object.keys(src.winprob.formats).length : null,
      partial: args.formatKeys,
      missing: src.missing,
      warnings: warnings.slice(0, 50),
    };
    await client.query(
      `UPDATE dataset_meta SET status = 'complete', finished_at = now(), counts = $2, changes = $3 WHERE id = $1`,
      [metaId, JSON.stringify(runCounts), JSON.stringify(changes.t)],
    );
    // Keep the last 30 runs, and always the latest complete one.
    await client.query(
      `DELETE FROM dataset_meta WHERE id NOT IN (SELECT id FROM dataset_meta ORDER BY id DESC LIMIT ${KEEP_META_ROWS})
       AND id <> (SELECT id FROM dataset_meta WHERE status = 'complete' ORDER BY finished_at DESC NULLS LAST, id DESC LIMIT 1)`,
    );

    // --------------------------------------------- 7. analyse and measure
    t = Date.now();
    await client.query("ANALYZE");
    const { rows: sizes } = await client.query(
      `SELECT c.relname AS table, pg_total_relation_size(c.oid)::bigint AS bytes, c.reltuples::bigint AS rows
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[]) ORDER BY 2 DESC`,
      [ALL_TABLES],
    );
    const { rows: dbRows } = await client.query(`SELECT pg_database_size(current_database())::bigint AS bytes`);
    lap("analyze", t);
    const dbBytes = Number(dbRows[0].bytes);
    log("\ntable sizes (pg_total_relation_size):");
    for (const s of sizes) log(`  ${s.table.padEnd(20)} ${String(sizeMb(Number(s.bytes))).padStart(8)} MB  ${String(Math.max(0, Number(s.rows))).padStart(9)} rows`);
    log(`  ${"database".padEnd(20)} ${String(sizeMb(dbBytes)).padStart(8)} MB`);
    log(`\nchanges: ${changes.total === 0 ? "none (0 rows changed)" : changes.total + " rows"}`);
    for (const [table, c] of Object.entries(changes.t)) log(`  ${table.padEnd(20)} +${c.inserted} ~${c.updated} -${c.deleted}`);
    timings.total = Math.round((Date.now() - t0) / 100) / 10;
    log(`\nimport complete in ${timings.total}s`);

    const report = {
      buildId: man.buildId,
      schemaVersion: man.version,
      fingerprint: src.fingerprint,
      datasetMetaId: metaId,
      totalChanges: changes.total,
      changes: changes.t,
      counts: runCounts,
      timings,
      sizes: Object.fromEntries(sizes.map((s) => [s.table, Number(s.bytes)])),
      databaseBytes: dbBytes,
      budgetMb: args.budgetMb,
      warnings,
    };
    if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 2));
    if (sizeMb(dbBytes) > args.budgetMb) {
      console.error(`Database is ${sizeMb(dbBytes)} MB, over the ${args.budgetMb} MB budget.`);
      exitCode = 2;
    }
  } catch (e) {
    await client
      .query(`UPDATE dataset_meta SET status = 'failed', finished_at = now(), error = $2, changes = $3 WHERE id = $1`, [
        metaId,
        String(e?.stack ?? e).slice(0, 4000),
        JSON.stringify(changes.t),
      ])
      .catch(() => {});
    throw e;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end();
  }
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`import failed: ${e?.message ?? e}`);
    process.exit(1);
  },
);
