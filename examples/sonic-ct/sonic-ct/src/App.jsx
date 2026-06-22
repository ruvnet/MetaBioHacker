import React, { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import Scene from "./scene/Scene.jsx";
import Hud from "./hud/Hud.jsx";
import WelcomeModal from "./hud/WelcomeModal.jsx";
import { useStore } from "./store.js";
import { theme } from "./theme.js";

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const error = useStore((s) => s.error);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="app">
      <Canvas
        camera={{ position: [0.6, 0.5, 4.7], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={[theme.background]} />
        <fog attach="fog" args={[theme.background, 7, 13]} />
        <Scene />
        <OrbitControls
          enableDamping
          target={[0, 0, 0]}
          minDistance={2.6}
          maxDistance={9}
          maxPolarAngle={Math.PI / 1.9}
          autoRotate
          autoRotateSpeed={0.18}
        />
        <EffectComposer disableNormalPass>
          <Bloom intensity={0.5} luminanceThreshold={0.72} luminanceSmoothing={0.25} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.8} />
        </EffectComposer>
      </Canvas>

      <Hud />
      <WelcomeModal />

      {!ready && !error && <div className="overlay">Booting acoustic engine…</div>}
      {error && <div className="overlay error">⚠ {error}</div>}
    </div>
  );
}
