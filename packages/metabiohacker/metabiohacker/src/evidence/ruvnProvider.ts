// Optional live evidence provider: shells out to the `@ruvnet/ruvn` research
// harness CLI to produce a graded, cited dossier. Heavy (LLM + web), so it runs
// OFF the hot path (new-modality review, nightly refresh). Falls back to the
// cached provider when ruvn or OPENROUTER_API_KEY is unavailable — ruvn is
// optional and never a hard dependency (ADR-0023).

import { spawn } from "node:child_process";
import type { EvidenceProvider, RuvnEvidenceDossier } from "./types.ts";
import { CachedEvidenceProvider } from "./cachedProvider.ts";

export type RuvnOptions = {
  bin?: string; // default: npx -y @ruvnet/ruvn
  timeoutMs?: number;
  fallback?: EvidenceProvider;
};

export class RuvnEvidenceProvider implements EvidenceProvider {
  name = "ruvn";
  private opts: Required<Omit<RuvnOptions, "fallback">> & { fallback: EvidenceProvider };

  constructor(opts: RuvnOptions = {}) {
    this.opts = {
      bin: opts.bin ?? "ruvn",
      timeoutMs: opts.timeoutMs ?? 120_000,
      fallback: opts.fallback ?? new CachedEvidenceProvider(),
    };
  }

  async gradeModality(modality: string, question?: string): Promise<RuvnEvidenceDossier> {
    if (!process.env.OPENROUTER_API_KEY) return this.opts.fallback.gradeModality(modality, question);
    const q = question ?? `Grade the research evidence quality for ${modality} in body-composition / structural imaging context.`;
    try {
      const json = await this.run(["research", "--json", "--question", q]);
      const parsed = JSON.parse(json);
      return this.coerce(modality, q, parsed);
    } catch {
      // Any CLI/parse/network failure => deterministic cached fallback.
      return this.opts.fallback.gradeModality(modality, question);
    }
  }

  private coerce(modality: string, question: string, parsed: any): RuvnEvidenceDossier {
    const grade = ["A", "B", "C", "D"].includes(parsed?.grade) ? parsed.grade : "C";
    const citations = Array.isArray(parsed?.citations)
      ? parsed.citations.map((c: any) => ({ title: String(c.title ?? ""), url: String(c.url ?? ""), grade: c.grade ?? "C" }))
      : [];
    return {
      question,
      modality,
      allowedClaims: parsed?.allowedClaims ?? [],
      blockedClaims: parsed?.blockedClaims ?? ["diagnosis"],
      evidenceGrade: grade,
      citations,
      humanReviewRequired: !!parsed?.humanReviewRequired,
      generatedAt: new Date().toISOString(),
    };
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.opts.bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("ruvn timeout"));
      }, this.opts.timeoutMs);
      child.stdout.on("data", (c) => (out += c));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve(out) : reject(new Error(`ruvn exited ${code}`));
      });
    });
  }
}
