// Temporal context window: which observations are recent enough (relative to a
// scan's anchor time) to influence its reconstruction.

import type { MedicalObservation } from "../ingest/types.ts";

export function selectContextWindow(input: {
  observations: MedicalObservation[];
  anchorTime: string;
  maxAgeDays: number;
}): MedicalObservation[] {
  const anchor = new Date(input.anchorTime).getTime();
  const maxAgeMs = input.maxAgeDays * 24 * 60 * 60 * 1000;
  return input.observations.filter((o) => {
    const event = new Date(o.eventTime).getTime();
    if (!Number.isFinite(event) || !Number.isFinite(anchor)) return true; // keep when time unparseable
    return Math.abs(anchor - event) <= maxAgeMs;
  });
}
