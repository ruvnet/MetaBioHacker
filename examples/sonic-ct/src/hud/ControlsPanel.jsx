import React, { useState } from "react";
import { useStore } from "../store.js";

const PRESETS = [
  { label: "Standard",  seed: 1,  n: 56,  elements: 140, fan: 72, iters: 5,  nz: 28 },
  { label: "Athletic",  seed: 7,  n: 64,  elements: 180, fan: 80, iters: 8,  nz: 32 },
  { label: "Pediatric", seed: 42, n: 48,  elements: 96,  fan: 64, iters: 5,  nz: 20 },
  { label: "High-res",  seed: 99, n: 96,  elements: 256, fan: 90, iters: 12, nz: 48 },
  { label: "Fast",      seed: 3,  n: 32,  elements: 64,  fan: 48, iters: 2,  nz: 12 },
];

const METHODS = [
  { label: "Backprojection", iters: 1,  desc: "Delay-and-sum (1 SART pass). Fast baseline." },
  { label: "SART ×5",        iters: 5,  desc: "5 algebraic iterations. Default balance." },
  { label: "SART ×8",        iters: 8,  desc: "8 iterations. Better tissue boundary." },
  { label: "SART ×12",       iters: 12, desc: "12 iterations. Highest fidelity, slowest." },
];

const PARAMS = [
  { key: "n",        label: "Grid resolution", min: 24, max: 128, step: 8, unit: "px",     desc: "Side length of the reconstruction grid" },
  { key: "nz",       label: "Axial slices",    min: 8,  max: 64,  step: 4, unit: "slices", desc: "Number of cranio-caudal slices" },
  { key: "elements", label: "Ring elements",   min: 32, max: 256, step: 8, unit: "tx",     desc: "Transducer count in the ring" },
  { key: "fan",      label: "Fan angle",       min: 32, max: 120, step: 4, unit: "°",      desc: "Active receive aperture" },
  { key: "iters",    label: "SART iterations", min: 1,  max: 20,  step: 1, unit: "×",      desc: "More → lower MAE, slower" },
  { key: "seed",     label: "Phantom seed",    min: 1,  max: 999, step: 1, unit: "",       desc: "Deterministic phantom identity" },
];

const DSP_OPTIONS = [
  { key: "bandpass", label: "Bandpass filter",  desc: "2nd-order Butterworth 2–5 MHz" },
  { key: "tgc",      label: "Time-gain comp.",  desc: "Compensate depth attenuation" },
  { key: "matched",  label: "Matched filter",   desc: "Ricker wavelet pulse compression" },
  { key: "envelope", label: "Hilbert envelope", desc: "Amplitude envelope for display" },
];

function closestMethodIdx(iters) {
  return METHODS.reduce((best, m, i) =>
    Math.abs(m.iters - iters) < Math.abs(METHODS[best].iters - iters) ? i : best, 0);
}

export default function ControlsPanel() {
  const params    = useStore((s) => s.params);
  const setParam  = useStore((s) => s.setParam);
  const applyParams = useStore((s) => s.applyParams);
  const rescan    = useStore((s) => s.rescan);
  const building  = useStore((s) => s.building);

  // Open on desktop (≥641px), collapsed on mobile
  const [open, setOpen] = useState(typeof window !== 'undefined' && window.innerWidth > 640);
  const [dsp,  setDsp]  = useState({ bandpass: true, tgc: true, matched: false, envelope: true });
  const [method, setMethod] = useState(closestMethodIdx(params.iters));

  // Apply a preset: bulk-set all params + auto-rescan
  const handlePreset = (p) => {
    const { label: _label, ...updates } = p;
    setMethod(closestMethodIdx(p.iters));
    applyParams(updates);
  };

  // Select a reconstruction method: set iters + auto-rescan
  const handleMethod = (i) => {
    setMethod(i);
    applyParams({ iters: METHODS[i].iters });
  };

  const toggleDsp = (k) => setDsp((d) => ({ ...d, [k]: !d[k] }));

  return (
    <div className={`controls-panel ${open ? "open" : "collapsed"}`}>
      <button
        className="controls-toggle"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Collapse controls" : "Expand controls"}
        aria-label="Toggle controls"
      >
        <span className="controls-icon">⚙</span>
        <span className="controls-label">Controls</span>
        <span className="controls-chevron">{open ? "›" : "‹"}</span>
      </button>

      {open && (
        <div className="controls-body">

          <section className="ctrl-section">
            <div className="ctrl-heading">Phantom preset</div>
            <div className="preset-grid">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`preset-btn ${params.seed === p.seed && params.n === p.n ? "active" : ""}`}
                  onClick={() => handlePreset(p)}
                  disabled={building}
                  title={`n=${p.n} el=${p.elements} nz=${p.nz} iters=${p.iters} seed=${p.seed}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <section className="ctrl-section">
            <div className="ctrl-heading">Reconstruction method</div>
            <div className="method-list">
              {METHODS.map((m, i) => (
                <button
                  key={m.label}
                  className={`method-btn ${method === i ? "active" : ""}`}
                  onClick={() => handleMethod(i)}
                  disabled={building}
                  title={m.desc}
                >
                  <span className="method-name">{m.label}</span>
                  <span className="method-desc">{m.desc}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="ctrl-section">
            <div className="ctrl-heading">Parameters</div>
            {PARAMS.map(({ key, label, min, max, step, unit, desc }) => (
              <div key={key} className="param-row" title={desc}>
                <div className="param-label">
                  <span>{label}</span>
                  <span className="param-val">{params[key]}{unit}</span>
                </div>
                <input
                  type="range" min={min} max={max} step={step} value={params[key]}
                  disabled={building}
                  onChange={(e) => {
                    setParam(key, e.target.value);
                    if (key === "iters") setMethod(closestMethodIdx(Number(e.target.value)));
                  }}
                />
              </div>
            ))}
          </section>

          <section className="ctrl-section">
            <div className="ctrl-heading">DSP pipeline</div>
            <div className="dsp-note">Signal conditioning on raw RF traces</div>
            {DSP_OPTIONS.map(({ key, label, desc }) => (
              <label key={key} className="dsp-row" title={desc}>
                <input type="checkbox" checked={dsp[key]} onChange={() => toggleDsp(key)} />
                <span className="dsp-label">{label}</span>
                <span className="dsp-desc">{desc}</span>
              </label>
            ))}
          </section>

          <button className="ctrl-run" onClick={rescan} disabled={building}>
            {building ? "Scanning…" : "▶ Run Simulation"}
          </button>

          <div className="ctrl-footer">
            <a href="https://github.com/ruvnet/SonicChamber" target="_blank" rel="noopener noreferrer">ruvnet/SonicChamber</a>
            {" · "}Research only
          </div>
        </div>
      )}
    </div>
  );
}
