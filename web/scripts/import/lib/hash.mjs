// Content hashes that drive the incremental import (docs/ARCHITECTURE.md §3.2):
// sha1 of stable-stringified JSON, with object keys sorted at every level.
import { createHash } from "node:crypto";

/** JSON.stringify with object keys sorted recursively; undefined members are dropped. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    const s = JSON.stringify(value);
    return s === undefined ? "null" : s;
  }
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString("base64"));
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function sha1(value) {
  return createHash("sha1").update(stableStringify(value)).digest("hex");
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
