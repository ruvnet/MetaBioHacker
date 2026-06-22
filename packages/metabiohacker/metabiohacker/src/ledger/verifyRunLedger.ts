import { stableHash } from "./stableHash.ts";
import type { ReconstructionLedger } from "./types.ts";

export type LedgerVerification = { passed: boolean; errors: string[] };

export function verifyRunLedger(ledger: ReconstructionLedger): LedgerVerification {
  const errors: string[] = [];
  if (!ledger.acousticEngine.frozen) errors.push("Acoustic engine must be frozen");
  if (!ledger.safety.diagnosticLanguageBlocked) errors.push("Diagnostic language must be blocked");
  if (!ledger.safety.uncertaintyOverlayRequired) errors.push("Uncertainty overlay is required");

  if (stableHash(ledger.observations) !== ledger.hashes.observationHash) errors.push("Observation hash mismatch");
  if (stableHash(ledger.prior) !== ledger.hashes.priorHash) errors.push("Prior hash mismatch");
  if (stableHash(ledger.graph) !== ledger.hashes.graphHash) errors.push("Graph hash mismatch");
  if (stableHash(ledger.score) !== ledger.hashes.scoreHash) errors.push("Score hash mismatch");

  const ledgerHash = stableHash({
    ...ledger,
    hashes: {
      observationHash: ledger.hashes.observationHash,
      priorHash: ledger.hashes.priorHash,
      graphHash: ledger.hashes.graphHash,
      scoreHash: ledger.hashes.scoreHash,
    },
  });
  if (ledgerHash !== ledger.hashes.ledgerHash) errors.push("Ledger hash mismatch");

  return { passed: errors.length === 0, errors };
}
