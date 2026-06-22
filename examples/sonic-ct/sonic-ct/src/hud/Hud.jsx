import React from "react";
import { useStore, CHANNELS } from "../store.js";
import { TISSUE_NAMES, EVIDENCE } from "../engine.js";
import { TISSUE_COLORS } from "../theme.js";

const SEVERITY = ["Low", "Moderate", "High"];
const QF_LABELS = ["Bone shadowing", "Sparse path coverage", "Boundary uncertainty", "Gas artifact"];

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// Honest acoustic-class labels (speed of sound can't separate organs).
const CLASS_LABELS = ["Water", "Fat", "Muscle", "Soft tissue", "Bone"];
// Body span used to annotate the scrubber in millimetres.
const BODY_SPAN_MM = 480;

function regionFor(z01) {
  if (z01 < 0.2) return "pelvis";
  if (z01 < 0.4) return "lower abdomen";
  if (z01 < 0.65) return "mid abdomen";
  return "upper abdomen";
}

export default function Hud() {
  return (
    <div className="hud">
      <TopLeft />
      <TopRight />
      <OrganPanel />
      <Legend />
      <Bottom />
      <Badge />
    </div>
  );
}

function TopLeft() {
  const channel = useStore((s) => s.channel);
  const setChannel = useStore((s) => s.setChannel);
  return (
    <div className="panel top-left">
      <div className="brand">
        <span className="dot" />
        Meta<b>BioHacker</b>
      </div>
      <div className="brand-sub">Acoustic digital human workbench · Sonic Chamber</div>
      <div className="modes">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            className={`mode ${channel === c.id ? "active" : ""}`}
            onClick={() => setChannel(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TopRight() {
  const vol = useStore((s) => s.vol);
  const building = useStore((s) => s.building);
  const builtCount = useStore((s) => s.builtCount);
  const params = useStore((s) => s.params);
  const progress = params.nz ? Math.min(1, builtCount / params.nz) : 0;
  return (
    <div className="panel top-right">
      <div className="metric-row">
        <Metric label="Acoustic paths" value={(vol?.measurements || 0).toLocaleString()} />
        <Metric label="Phantom fidelity" value={vol ? pct(vol.meanDice) : "—"} />
      </div>
      <div className="metric-row">
        <Metric label="Confidence" value={vol ? pct(vol.confidence) : "—"} />
        <Metric label="Worst slice" value={vol ? `#${vol.worstSlice}` : "—"} />
      </div>
      <div className="progress">
        <div className="progress-label">
          <span>{building ? "Scanning…" : "Scan complete"}</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function OrganPanel() {
  const vol = useStore((s) => s.vol);
  const organs = (vol?.organs || []).filter((o) => o.confidence > 0.01);
  const flags = vol?.qualityFlags;
  return (
    <div className="panel organ-panel">
      <div className="legend-title">Organ hypotheses</div>
      {organs.length === 0 && <div className="organ-empty">Scanning… inference pending</div>}
      {organs.map((o) => (
        <div key={o.id} className="organ-row" title={evidenceText(o.evidence)}>
          <span className="organ-name">{o.name}</span>
          <span className="organ-bar">
            <span className="organ-fill" style={{ width: `${o.confidence * 100}%` }} />
          </span>
          <span className="organ-val">{Math.round(o.confidence * 100)}%</span>
        </div>
      ))}
      <div className="organ-note">
        Identity inferred from shape, z-position, adjacency, landmarks — <b>not from speed alone</b>.
      </div>

      {flags && (
        <>
          <div className="legend-title qf-title">Quality flags</div>
          {QF_LABELS.map((label, i) => (
            <div key={label} className="qf-row">
              <span className="qf-name">{label}</span>
              <span className={`qf-badge sev-${flags[i]}`}>{SEVERITY[flags[i]]}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function evidenceText(mask) {
  return EVIDENCE.filter(([bit]) => mask & bit)
    .map(([, label]) => `✓ ${label}`)
    .join("\n") || "no supporting evidence";
}

function Legend() {
  const vol = useStore((s) => s.vol);
  const channel = useStore((s) => s.channel);
  const fractions = vol?.fractions;
  return (
    <div className="panel legend">
      <div className="legend-title">Acoustic class map</div>
      {CLASS_LABELS.map((name, i) => (
        <div key={name} className="legend-row">
          <span className="swatch" style={{ background: rgb(TISSUE_COLORS[i]) }} />
          <span className="legend-name">{name}</span>
          {fractions && i > 0 && (
            <span className="legend-bar">
              <span className="legend-fill" style={{ width: `${fractions[i] * 100}%` }} />
            </span>
          )}
          {fractions && i > 0 && <span className="legend-val">{pct(fractions[i])}</span>}
        </div>
      ))}
      <div className="legend-note">
        {channel === "error"
          ? "Error rises around bone (ribs / spine / pelvis) — straight-ray blur."
          : channel === "confidence"
          ? "Confidence falls near tissue boundaries."
          : "Acoustic classes from speed of sound — organ identity is inferred separately."}
      </div>
    </div>
  );
}

function Bottom() {
  const vol = useStore((s) => s.vol);
  const currentZ = useStore((s) => s.currentZ);
  const setCurrentZ = useStore((s) => s.setCurrentZ);
  const exploded = useStore((s) => s.exploded);
  const setExploded = useStore((s) => s.setExploded);
  const rescan = useStore((s) => s.rescan);
  const building = useStore((s) => s.building);
  const nz = vol?.nz || 1;
  return (
    <div className="panel bottom">
      <button className="action" onClick={rescan} disabled={building}>
        {building ? "Scanning…" : "↻ Rescan"}
      </button>
      <div className="scrubber">
        <div className="scrubber-label">
          <span>
            Slice <b>{currentZ}</b> / {nz - 1} · z {Math.round((currentZ / Math.max(nz - 1, 1)) * BODY_SPAN_MM)} mm
          </span>
          <span className="region">
            {regionFor(currentZ / Math.max(nz - 1, 1))}
            {vol && ` · score ${(vol.sliceDice?.[currentZ] ?? 0).toFixed(2)}`}
          </span>
        </div>
        <div className="scrubber-track">
          <input
            type="range"
            min={0}
            max={Math.max(0, nz - 1)}
            value={Math.min(currentZ, nz - 1)}
            onChange={(e) => setCurrentZ(Number(e.target.value))}
          />
          {vol && nz > 1 && (
            <span
              className="worst-marker"
              title={`worst slice #${vol.worstSlice}`}
              style={{ left: `${(vol.worstSlice / (nz - 1)) * 100}%` }}
            />
          )}
        </div>
      </div>
      <button className={`action ${exploded ? "active" : ""}`} onClick={() => setExploded(!exploded)}>
        {exploded ? "Collapse" : "⤢ Explode"}
      </button>
    </div>
  );
}

function Badge() {
  return (
    <div className="badge">
      Mode: body composition · <b>research only — not diagnostic</b>
    </div>
  );
}
