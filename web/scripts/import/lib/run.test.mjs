import { describe, expect, it } from "vitest";
import { Changes, tx } from "./run.mjs";

/** A stand-in for pg.Client that records statements and can fail on one. */
function fakeClient(failOn = null) {
  return {
    sql: [],
    async query(text) {
      this.sql.push(text);
      if (text === failOn) throw new Error(`${text} failed`);
      return { rows: [], rowCount: 0 };
    },
  };
}

describe("Changes", () => {
  it("adds, counts upserts and merges per table", () => {
    const a = new Changes();
    a.add("innings", "inserted", 3);
    a.add("innings", "deleted", 0); // zero counts leave no entry
    a.upserted("players", [{ inserted: true }, { inserted: false }]);
    const b = new Changes();
    b.add("innings", "inserted", 2);
    b.add("teams", "deleted", 1);
    a.merge(b);
    expect(a.t).toEqual({
      innings: { inserted: 5, updated: 0, deleted: 0 },
      players: { inserted: 1, updated: 1, deleted: 0 },
      teams: { inserted: 0, updated: 0, deleted: 1 },
    });
    expect(a.total).toBe(8);
  });
});

describe("tx", () => {
  it("merges a transaction's counts after COMMIT", async () => {
    const client = fakeClient();
    const changes = new Changes();
    const out = await tx(client, changes, async (local) => {
      local.add("innings", "inserted", 10);
      expect(changes.total).toBe(0); // nothing counted before COMMIT
      return "ok";
    });
    expect(out).toBe("ok");
    expect(client.sql).toEqual(["BEGIN", "COMMIT"]);
    expect(changes.t).toEqual({ innings: { inserted: 10, updated: 0, deleted: 0 } });
  });

  it("counts nothing when the work fails and rolls back", async () => {
    const client = fakeClient();
    const changes = new Changes();
    changes.add("players", "inserted", 50); // an earlier, committed batch
    await expect(
      tx(client, changes, async (local) => {
        local.add("innings", "inserted", 10);
        throw new Error("value out of range for type smallint");
      }),
    ).rejects.toThrow(/smallint/);
    expect(client.sql).toEqual(["BEGIN", "ROLLBACK"]);
    expect(changes.t).toEqual({ players: { inserted: 50, updated: 0, deleted: 0 } });
  });

  it("counts nothing when COMMIT itself fails", async () => {
    const client = fakeClient("COMMIT");
    const changes = new Changes();
    await expect(tx(client, changes, async (local) => local.add("teams", "deleted", 7))).rejects.toThrow(/COMMIT failed/);
    expect(client.sql).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]);
    expect(changes.total).toBe(0);
  });
});
