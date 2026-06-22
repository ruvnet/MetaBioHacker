// Build an auditable patient state graph from canonical observations.

import type { MedicalObservation } from "../ingest/types.ts";
import type { PatientStateEdge, PatientStateGraph, PatientStateNode } from "./types.ts";

export function buildPatientStateGraph(
  patientId: string,
  observations: MedicalObservation[]
): PatientStateGraph {
  const nodes: PatientStateNode[] = [
    { id: `patient_${patientId}`, type: "patient", label: "Synthetic patient", properties: { patientId } },
  ];
  const edges: PatientStateEdge[] = [];

  for (const o of observations) {
    const obsNodeId = `observation_${o.id}`;
    nodes.push({
      id: obsNodeId,
      type: "observation",
      label: o.name,
      properties: {
        modality: o.modality,
        sourceFormat: o.sourceFormat,
        eventTime: o.eventTime,
        qualityScore: o.qualityScore,
        uncertainty: o.uncertainty,
        humanReviewRequired: o.humanReviewRequired,
      },
    });
    edges.push({
      id: `edge_patient_${o.id}`,
      from: `patient_${patientId}`,
      to: obsNodeId,
      type: "has_observation",
      weight: o.qualityScore,
      evidenceObservationIds: [o.id],
    });

    if (o.bodySite) {
      const siteId = `site_${safeId(o.bodySite)}`;
      if (!nodes.some((n) => n.id === siteId)) {
        nodes.push({ id: siteId, type: "body_site", label: o.bodySite, properties: {} });
      }
      edges.push({
        id: `edge_site_${o.id}`,
        from: obsNodeId,
        to: siteId,
        type: "measures_site",
        weight: o.qualityScore,
        evidenceObservationIds: [o.id],
      });
    }

    if (o.specimenType) {
      const specId = `specimen_${safeId(o.specimenType)}`;
      if (!nodes.some((n) => n.id === specId)) {
        nodes.push({ id: specId, type: "specimen", label: o.specimenType, properties: {} });
      }
      edges.push({
        id: `edge_specimen_${o.id}`,
        from: obsNodeId,
        to: specId,
        type: "from_specimen",
        weight: o.qualityScore,
        evidenceObservationIds: [o.id],
      });
    }

    if (o.humanReviewRequired) {
      edges.push({
        id: `edge_review_${o.id}`,
        from: obsNodeId,
        to: `patient_${patientId}`,
        type: "requires_review",
        weight: 1,
        evidenceObservationIds: [o.id],
      });
    }
  }

  return { patientId, nodes, edges, observations };
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}
