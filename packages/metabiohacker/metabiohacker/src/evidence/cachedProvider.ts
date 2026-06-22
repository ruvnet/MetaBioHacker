// Deterministic evidence provider backed by a committed cache. Powers tests and
// offline runs; refreshed asynchronously by the ruvn CLI provider.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { EvidenceProvider, RuvnEvidenceDossier } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadEvidenceCache(path?: string): Record<string, RuvnEvidenceDossier> {
  const file = path ?? join(__dirname, "cache.json");
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return parsed.dossiers as Record<string, RuvnEvidenceDossier>;
}

export class CachedEvidenceProvider implements EvidenceProvider {
  name = "cached";
  private cache: Record<string, RuvnEvidenceDossier>;

  constructor(cache?: Record<string, RuvnEvidenceDossier>) {
    this.cache = cache ?? loadEvidenceCache();
  }

  async gradeModality(modality: string, question?: string): Promise<RuvnEvidenceDossier> {
    const hit = this.cache[modality];
    if (hit) return hit;
    // Unknown modality => grade D (discarded), no citations => gate blocks it.
    return {
      question: question ?? `Evidence for ${modality}?`,
      modality,
      allowedClaims: [],
      blockedClaims: ["any claim"],
      evidenceGrade: "D",
      citations: [],
      humanReviewRequired: true,
    };
  }
}
