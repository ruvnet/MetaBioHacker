// Evidence refresh job (OFF the hot path). Uses the OpenRouter key to grade the
// research evidence behind each modality, producing human-readable dossiers and
// a CANDIDATE cache. Promotion to the curated src/evidence/cache.json is a
// reviewed step — refreshed evidence never auto-ships claims (ADR-0023).
//
// Run: OPENROUTER_API_KEY=... npm run evidence:refresh

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.EVIDENCE_MODEL || "openai/gpt-4o-mini";
const DOCS = path.join(__dirname, "..", "..", "..", "docs", "evidence");
const CANDIDATE = path.join(__dirname, "..", "evidence.refreshed.json");

const MODALITIES = [
  { key: "acoustic-usct", modality: "acoustic", question: "Evidence quality for ultrasound computed tomography (USCT) speed-of-sound reconstruction as a standalone clinical claim." },
  { key: "mri-prior", modality: "mri", question: "Evidence quality for MRI as an anatomical structural prior for soft tissue." },
  { key: "ekg-timing", modality: "ekg", question: "Evidence quality for EKG/ECG cardiac timing features." },
  { key: "eeg-timing", modality: "eeg", question: "Evidence quality for EEG neural timing / band-power features." },
  { key: "pathology-review", modality: "pathology", question: "Evidence quality and review requirements for pathology/biopsy findings." },
];

const SYS =
  "You are a conservative biomedical evidence grader (ruvn rubric). Grade A = primary sources / official guidance, " +
  "B = reputable secondary sources, C = context only, D = discard. Synthesis only from A or B. This is research tooling, " +
  "NOT medical advice. Reply ONLY JSON: {\"evidenceGrade\":\"A|B|C|D\",\"allowedClaims\":[],\"blockedClaims\":[]," +
  "\"citations\":[{\"title\":\"\",\"url\":\"\",\"grade\":\"A|B|C|D\"}],\"humanReviewRequired\":bool}. " +
  "Standalone acoustic USCT clinical claims should be graded no higher than C. Pathology/biopsy/Pap/HPV/cytology must set humanReviewRequired=true.";

async function grade(m) {
  if (!KEY) return null;
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYS }, { role: "user", content: m.question }],
      max_tokens: 500,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}`);
  const data = await resp.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const grade = ["A", "B", "C", "D"].includes(parsed.evidenceGrade) ? parsed.evidenceGrade : "C";
  return {
    question: m.question,
    modality: m.modality,
    allowedClaims: parsed.allowedClaims ?? [],
    blockedClaims: parsed.blockedClaims ?? ["diagnosis"],
    evidenceGrade: grade,
    citations: Array.isArray(parsed.citations) ? parsed.citations.slice(0, 6) : [],
    humanReviewRequired: ["pathology", "biopsy", "pap", "hpv", "cytology"].includes(m.modality) || !!parsed.humanReviewRequired,
    generatedAt: new Date().toISOString(),
  };
}

if (!KEY) {
  console.error("OPENROUTER_API_KEY not set — cannot refresh. (Cached evidence stays in effect.)");
  process.exit(1);
}
fs.mkdirSync(DOCS, { recursive: true });
const candidate = {};
for (const m of MODALITIES) {
  try {
    const d = await grade(m);
    candidate[m.modality] = d;
    const md =
      `# Evidence dossier — ${m.modality}\n\n` +
      `- Question: ${d.question}\n- Grade: **${d.evidenceGrade}** ${d.evidenceGrade <= "B" ? "(claim allowed with citations)" : "(research only / blocked)"}\n` +
      `- Human review required: ${d.humanReviewRequired}\n- Refreshed: ${d.generatedAt}\n\n` +
      `## Allowed claims\n${d.allowedClaims.map((c) => `- ${c}`).join("\n") || "- (none)"}\n\n` +
      `## Blocked claims\n${d.blockedClaims.map((c) => `- ${c}`).join("\n") || "- (none)"}\n\n` +
      `## Citations\n${d.citations.map((c) => `- [${c.grade}] ${c.title} — ${c.url}`).join("\n") || "- (none)"}\n\n` +
      `> Candidate evidence. Promotion to the curated cache is a reviewed step.\n`;
    fs.writeFileSync(path.join(DOCS, `${m.key}.md`), md);
    console.log(`graded ${m.modality}: ${d.evidenceGrade} (${d.citations.length} citations)`);
  } catch (e) {
    console.warn(`skip ${m.modality}: ${e.message}`);
  }
}
fs.writeFileSync(CANDIDATE, JSON.stringify({ note: "Candidate evidence from OpenRouter refresh — review before promoting to src/evidence/cache.json.", dossiers: candidate }, null, 2));
console.log(`\ncandidate cache -> ${CANDIDATE}\ndossiers -> ${DOCS}/`);
