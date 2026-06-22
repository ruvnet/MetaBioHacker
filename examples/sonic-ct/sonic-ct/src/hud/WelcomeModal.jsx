import React, { useState } from "react";
import { useStore } from "../store.js";

const STEPS = [
  { n: "Simulate", d: "Generate a procedural torso phantom inside a water-coupling chamber." },
  { n: "Reconstruct", d: "Reconstruct 3D anatomy slice by slice from simulated acoustic paths." },
  { n: "Analyze", d: "Segment acoustic classes and infer organ hypotheses with confidence." },
  { n: "Validate", d: "Compare against known phantom ground truth — Dice, error, and fidelity." },
];

const CARDS = [
  { t: "New Scan", d: "Start a fresh acoustic reconstruction sweep." },
  { t: "Open Project", d: "Load a previous reconstruction session." },
  { t: "Tutorial", d: "Learn the chamber, classes, and workflow." },
];

export default function WelcomeModal() {
  const open = useStore((s) => s.welcomeOpen);
  const close = useStore((s) => s.closeWelcome);
  const rescan = useStore((s) => s.rescan);
  const [hide, setHide] = useState(false);
  if (!open) return null;

  const start = (card) => {
    close(hide);
    if (card === "New Scan") rescan();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <button className="modal-close" onClick={() => close(hide)} aria-label="Close">×</button>
        <div className="modal-head">
          <div className="modal-kicker">Welcome to</div>
          <h2 className="modal-title">
            Meta<span className="accent">BioHacker</span>
          </h2>
          <div className="modal-sub">Acoustic Digital Human Workbench · Sonic Chamber</div>
          <p className="modal-desc">
            MetaBioHacker is a research platform for simulating full-body underwater acoustic
            imaging, reconstructing 3D anatomy, and evaluating results against known ground truth.
          </p>
        </div>

        <div className="modal-steps">
          {STEPS.map((s, i) => (
            <div className="modal-step" key={s.n}>
              <div className="step-num">{i + 1}</div>
              <div>
                <div className="step-name">{s.n}</div>
                <div className="step-desc">{s.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-getstarted">Get Started — choose a starting point</div>
        <div className="modal-cards">
          {CARDS.map((c) => (
            <button className="modal-card" key={c.t} onClick={() => start(c.t)}>
              <div className="card-title">{c.t}</div>
              <div className="card-desc">{c.d}</div>
            </button>
          ))}
        </div>

        <div className="modal-foot">
          <label className="modal-checkbox">
            <input type="checkbox" checked={!hide} onChange={(e) => setHide(!e.target.checked)} />
            Show this welcome screen on startup
          </label>
          <div className="modal-foot-right">
            <span className="research-tag">Research use only · not diagnostic</span>
            <button className="modal-continue" onClick={() => close(hide)}>
              Continue →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
