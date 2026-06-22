// Global app state (zustand). Owns the WASM engine, the progressive scan loop,
// and the volume snapshot the scene + HUD render from.
import { create } from "zustand";
import { SonicCT } from "./engine.js";

export const CHANNELS = [
  { id: "recon", label: "Reconstruction" },
  { id: "truth", label: "Anatomy truth" },
  { id: "error", label: "Error map" },
  { id: "confidence", label: "Confidence" },
  { id: "speed", label: "Speed of sound" },
];

export const useStore = create((set, get) => ({
  engine: null,
  ready: false,
  error: null,
  building: false,
  builtCount: 0,
  version: 0,
  vol: null,
  runId: 0,

  channel: "recon",
  currentZ: 0,
  exploded: false,
  welcomeOpen:
    typeof localStorage !== "undefined" ? localStorage.getItem("sonic_welcome_hidden") !== "1" : true,

  closeWelcome: (dontShowAgain) => {
    if (dontShowAgain && typeof localStorage !== "undefined") {
      localStorage.setItem("sonic_welcome_hidden", "1");
    }
    set({ welcomeOpen: false });
  },

  params: { nz: 28, n: 56, elements: 140, fan: 72, iters: 5, seed: 1 },

  setChannel: (channel) => set({ channel }),
  setCurrentZ: (currentZ) => set({ currentZ }),
  setExploded: (exploded) => set({ exploded }),
  setParam: (k, v) =>
    set((s) => ({ params: { ...s.params, [k]: Number(v) } })),

  init: async () => {
    try {
      const engine = await SonicCT.load("sonic_ct.wasm");
      set({ engine, ready: true });
      get().rescan();
    } catch (e) {
      set({ error: String(e.message || e) });
    }
  },

  // Run a progressive cranio-caudal sweep, revealing slices as they resolve.
  rescan: () => {
    const { engine, params } = get();
    if (!engine) return;
    // A fresh run token supersedes any in-flight scan (e.g. StrictMode double
    // mount, or a rescan triggered mid-sweep).
    const runId = get().runId + 1;
    engine.volBegin(params);
    set({ building: true, builtCount: 0, runId });

    const total = params.nz;
    const tick = () => {
      if (get().runId !== runId) return; // superseded
      let cursor = get().builtCount;
      // Build a couple of slices per tick to keep the UI responsive.
      for (let k = 0; k < 2 && cursor < total; k++) {
        cursor = engine.volStep();
      }
      // Refresh the snapshot + textures every few slices and at the end.
      const done = cursor >= total;
      if (done || cursor % 3 === 0) {
        const vol = engine.volSnapshot();
        set((s) => ({
          builtCount: cursor,
          vol,
          version: s.version + 1,
          currentZ: s.building && !done ? cursor - 1 : s.currentZ,
        }));
      } else {
        set({ builtCount: cursor });
      }
      if (done) {
        set({ building: false, currentZ: Math.floor(total / 2) });
        return;
      }
      setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  },
}));
