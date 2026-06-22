// Deterministic content hash over a value with stably-sorted object keys, so a
// reconstruction run can be verified end-to-end regardless of field order.

import { createHash } from "node:crypto";

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortObject(value))).digest("hex");
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObject(record[key]);
        return acc;
      }, {});
  }
  return value;
}
