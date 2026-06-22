import React, { useMemo, useRef, useLayoutEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../store.js";
import { theme } from "../theme.js";
import { TISSUE_COLORS } from "../theme.js";
import BodyModel from "./BodyModel.jsx";
import { TORSO_PROFILE, SX, SZ, torsoRadius, sliceY } from "./anatomy.js";

const RING_R = 0.92;
const TILE_COUNT = 110;

export default function Scene() {
  const vol = useStore((s) => s.vol);
  const builtCount = useStore((s) => s.builtCount);
  const currentZ = useStore((s) => s.currentZ);
  const building = useStore((s) => s.building);
  const channel = useStore((s) => s.channel);

  const nz = vol?.nz || 1;
  const spacing = 0.08 * (28 / Math.max(nz, 1));
  const bodyH = nz * spacing;

  // Dominant acoustic-class colour per slice (for the contour rings).
  const sliceColors = useMemo(() => {
    if (!vol) return [];
    const { n, nz, reconLabels } = vol;
    const cells = n * n;
    const out = [];
    for (let z = 0; z < nz; z++) {
      const counts = [0, 0, 0, 0, 0];
      const base = z * cells;
      for (let i = 0; i < cells; i++) counts[reconLabels[base + i]]++;
      let best = 1, bv = -1;
      for (let c = 1; c < 5; c++) if (counts[c] > bv) { bv = counts[c]; best = c; }
      const rgb = TISSUE_COLORS[best];
      out.push(new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255));
    }
    return out;
  }, [vol]);

  const ringY = sliceY(Math.min(currentZ, nz - 1), nz, spacing);

  return (
    <group>
      <Lights />
      <Chamber bodyH={bodyH} />
      <WaterParticles bodyH={bodyH} />
      <BodyModel bodyH={bodyH} />
      <ContourRings nz={nz} spacing={spacing} bodyH={bodyH} builtCount={builtCount} currentZ={currentZ} colors={sliceColors} />
      <ActiveSlice y={ringY} t={Math.min(currentZ, nz - 1) / Math.max(nz - 1, 1)} />
      <TransducerRing y={ringY} bright />
      <TransducerRing y={sliceY(nz * 0.5, nz, spacing)} />
      {building && <AcousticWaves y={ringY} />}
      <BaseGlow y={-bodyH / 2 - 0.32} />
    </group>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 8, 4]} intensity={1.0} color={theme.medicalWhite} />
      <directionalLight position={[-5, 2, -3]} intensity={0.5} color={theme.blue} />
      <pointLight position={[0, 0, 0.5]} intensity={1.0} color={theme.cyan} distance={6} />
    </>
  );
}

function Chamber({ bodyH }) {
  const height = bodyH + 1.0;
  const topY = height / 2;
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[1.32, 1.32, height, 64, 1, true]} />
        <meshBasicMaterial color={theme.chamberGlass} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[1.18, 1.18, height - 0.2, 48, 1, true]} />
        <meshBasicMaterial color={theme.chamberTint} transparent opacity={0.04} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, topY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.32, 0.014, 16, 96]} />
        <meshBasicMaterial color={theme.cyan} transparent opacity={0.55} toneMapped={false} />
      </mesh>
    </group>
  );
}

function WaterParticles({ bodyH }) {
  const ref = useRef();
  const count = 260;
  const h = bodyH + 0.9;
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * 1.12;
      const t = Math.random() * Math.PI * 2;
      a[i * 3] = Math.cos(t) * r;
      a[i * 3 + 1] = (Math.random() - 0.5) * h;
      a[i * 3 + 2] = Math.sin(t) * r;
    }
    return a;
  }, [count, h]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const arr = g.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += dt * 0.05;
      if (arr[i] > h / 2) arr[i] = -h / 2;
    }
    g.geometry.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color={theme.cyan} size={0.011} transparent opacity={0.35} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// Horizontal contour rings — one per reconstructed slice, tinted by class.
function ContourRings({ nz, spacing, bodyH, builtCount, currentZ, colors }) {
  const rings = [];
  for (let z = 0; z < Math.min(builtCount, nz); z++) {
    const t = z / Math.max(nz - 1, 1);
    const r = torsoRadius(t);
    const isCur = z === currentZ;
    const col = colors[z] || new THREE.Color(theme.cyan);
    rings.push(
      <mesh key={z} position={[0, sliceY(z, nz, spacing), 0]} rotation={[Math.PI / 2, 0, 0]} scale={[SX, SZ, 1]}>
        <torusGeometry args={[r, isCur ? 0.012 : 0.004, 8, 80]} />
        <meshBasicMaterial color={isCur ? new THREE.Color(theme.cyan) : col} transparent opacity={isCur ? 1.0 : 0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    );
  }
  return <group>{rings}</group>;
}

// Bright cyan active-slice disc cutting through the torso.
function ActiveSlice({ y, t }) {
  const r = torsoRadius(t) * 1.02;
  return (
    <group position={[0, y, 0]} scale={[SX, SZ, 1]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[r, 72]} />
        <meshBasicMaterial color={theme.cyan} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh>
        <ringGeometry args={[r - 0.012, r + 0.012, 72]} />
        <meshBasicMaterial color={theme.cyan} transparent opacity={0.95} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Instanced transducer ring with a sweeping active flash.
function TransducerRing({ y, bright }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const base = useMemo(() => new THREE.Color(bright ? theme.cyan : theme.titanium), [bright]);
  const hot = useMemo(() => new THREE.Color("#ffffff"), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const R = RING_R * SX;

  useLayoutEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < TILE_COUNT; i++) {
      const a = (i / TILE_COUNT) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * RING_R * SX, 0, Math.sin(a) * RING_R * SZ);
      dummy.rotation.set(0, -a, 0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, base);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [dummy, base]);

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m || !bright) return;
    const sweep = (clock.elapsedTime * 0.25) % 1;
    for (let i = 0; i < TILE_COUNT; i++) {
      const phase = i / TILE_COUNT;
      let d = Math.abs(phase - sweep);
      d = Math.min(d, 1 - d);
      tmp.copy(base).lerp(hot, Math.max(0, 1 - d * 14));
      m.setColorAt(i, tmp);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={[SX, SZ, 1]}>
        <torusGeometry args={[RING_R, 0.012, 16, 128]} />
        <meshStandardMaterial color={theme.titanium} metalness={0.8} roughness={0.25} />
      </mesh>
      <instancedMesh ref={ref} args={[null, null, TILE_COUNT]}>
        <boxGeometry args={[0.03, 0.05, 0.012]} />
        <meshStandardMaterial color={theme.chamberGlass} emissive={bright ? theme.cyan : theme.titanium} emissiveIntensity={bright ? 1.0 : 0.3} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function AcousticWaves({ y }) {
  const group = useRef();
  const rings = useMemo(() => Array.from({ length: 7 }, (_, i) => i / 7), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    group.current?.children.forEach((child, i) => {
      const p = (t * 0.6 + rings[i]) % 1;
      const s = 0.1 + p * RING_R * 2.0;
      child.scale.set(s * SX, s * SZ, s);
      child.material.opacity = (1 - p) * 0.4;
    });
  });
  return (
    <group ref={group} position={[0, y, 0]}>
      {rings.map((r) => (
        <mesh key={r} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.5, 0.005, 8, 80]} />
          <meshBasicMaterial color={theme.cyan} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// Glowing base with concentric rings.
function BaseGlow({ y }) {
  return (
    <group position={[0, y, 0]}>
      {[0.5, 0.85, 1.15].map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.01, r + 0.01, 80]} />
          <meshBasicMaterial color={theme.cyan} transparent opacity={0.3 - i * 0.07} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.1, 64]} />
        <meshBasicMaterial color={theme.deepNavy} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
