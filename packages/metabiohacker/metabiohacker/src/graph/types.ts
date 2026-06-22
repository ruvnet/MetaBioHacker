// Patient state graph: an auditable graph where observations from every
// modality can support, conflict with, or sit near each other in time — without
// pretending to diagnose.

import type { MedicalObservation } from "../ingest/types.ts";

export type GraphNodeType =
  | "patient"
  | "observation"
  | "body_site"
  | "specimen"
  | "procedure"
  | "device"
  | "finding"
  | "time_window";

export type GraphEdgeType =
  | "has_observation"
  | "measures_site"
  | "from_specimen"
  | "supports"
  | "conflicts_with"
  | "temporally_near"
  | "requires_review"
  | "derived_from";

export type PatientStateNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  properties: Record<string, string | number | boolean>;
};

export type PatientStateEdge = {
  id: string;
  from: string;
  to: string;
  type: GraphEdgeType;
  weight: number;
  evidenceObservationIds: string[];
};

export type PatientStateGraph = {
  patientId: string;
  nodes: PatientStateNode[];
  edges: PatientStateEdge[];
  observations: MedicalObservation[];
};
