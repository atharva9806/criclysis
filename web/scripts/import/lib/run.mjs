// Change accounting for an import run. Each transaction counts into its own
// Changes and merges into the run's total only after COMMIT, so a failed run
// reports exactly the rows it left in the database.

export class Changes {
  constructor() {
    this.t = {};
  }

  add(table, kind, n) {
    if (!n) return;
    this.t[table] ??= { inserted: 0, updated: 0, deleted: 0 };
    this.t[table][kind] += n;
  }

  /** Count rows returned by an upsert's RETURNING (xmax = 0) AS inserted. */
  upserted(table, returned) {
    for (const r of returned) this.add(table, r.inserted ? "inserted" : "updated", 1);
  }

  merge(other) {
    for (const [table, c] of Object.entries(other.t)) for (const kind of ["inserted", "updated", "deleted"]) this.add(table, kind, c[kind]);
  }

  get total() {
    return Object.values(this.t).reduce((s, c) => s + c.inserted + c.updated + c.deleted, 0);
  }
}

/**
 * Run `fn(local)` in a transaction. `local` collects this transaction's
 * changes; they are merged into `changes` only once COMMIT has succeeded.
 */
export async function tx(client, changes, fn) {
  const local = new Changes();
  await client.query("BEGIN");
  try {
    const result = await fn(local);
    await client.query("COMMIT");
    changes.merge(local);
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
