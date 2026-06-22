import React, { Suspense, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { theme } from "../theme.js";
import { TORSO_PROFILE, SX, SZ } from "./anatomy.js";
import manifest from "../organ_manifest.json";

// Open-source human body shell: CesiumMan (Khronos glTF Sample Assets, CC-BY 4.0).
// Set to "" to force the procedural fallback. The GLB is a VISUAL prior only —
// the Rust phantom remains the physics ground truth.
export const GLB_URL = "/models/human.glb";

// ---------------------------------------------------------------------------
// Ghost material override + organ colouring (applied to a loaded GLB)
// ---------------------------------------------------------------------------

function ghostMaterial(color) {
  const g = manifest.ghostMaterial || {};
  return new THREE.MeshPhysicalMaterial({
    color: color || g.color || theme.cyan,
    emissive: new THREE.Color(g.emissive || theme.cyan),
    emissiveIntensity: g.emissiveIntensity ?? 0.4,
    transparent: true,
    opacity: g.opacity ?? 0.28,
    roughness: 0.18,
    metalness: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function organColorFor(name) {
  const lname = (name || "").toLowerCase();
  for (const spec of Object.values(manifest.organs || {})) {
    if (spec.names.some((n) => lname.includes(n.toLowerCase()))) return spec.color;
  }
  return null;
}

export function applyGhostMaterials(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.material = ghostMaterial(organColorFor(obj.name));
      obj.renderOrder = 8;
      obj.frustumCulled = false; // skinned bind-pose bbox can be wrong
    }
  });
}

function LoadedGlbBody({ url, bodyH }) {
  const { scene } = useGLTF(url);
  const { fitScale, center } = useMemo(() => {
    applyGhostMaterials(scene);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const c = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(c);
    const s = size.y > 0 ? (bodyH * 1.02) / size.y : 1;
    return { fitScale: s, center: c };
  }, [scene, bodyH]);

  return (
    <group scale={fitScale}>
      <group position={[-center.x, -center.y, -center.z]}>
        <primitive object={scene} />
      </group>
    </group>
  );
}
useGLTF.preload(GLB_URL);

// ---------------------------------------------------------------------------
// Internal organ glows (procedural — always rendered, GLB has no organs)
// ---------------------------------------------------------------------------

export function InternalOrgans({ bodyH }) {
  const y = (t) => (t - 0.5) * bodyH;
  const organs = [
    { p: [-0.04, y(0.78), 0.06], r: 0.15, c: theme.danger, n: "heart" },
    { p: [-0.3, y(0.8), -0.02], r: 0.17, c: theme.blue, n: "lungL" },
    { p: [0.3, y(0.8), -0.02], r: 0.17, c: theme.blue, n: "lungR" },
    { p: [0.22, y(0.64), 0.04], r: 0.2, c: theme.amber, n: "liver" },
    { p: [-0.24, y(0.6), -0.04], r: 0.12, c: theme.violet, n: "spleen" },
    { p: [0.17, y(0.46), -0.12], r: 0.11, c: theme.success, n: "kidneyR" },
    { p: [-0.17, y(0.46), -0.12], r: 0.11, c: theme.success, n: "kidneyL" },
    { p: [0.0, y(0.3), 0.02], r: 0.2, c: theme.violet, n: "bowel" },
  ];
  return (
    <group scale={[SX, 1, SZ]}>
      <mesh position={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.05, 0.06, bodyH * 0.9, 12]} />
        <meshBasicMaterial color={theme.medicalWhite} transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {organs.map((o) => (
        <mesh key={o.n} position={o.p} scale={[1, 1.25, 0.8]}>
          <sphereGeometry args={[o.r, 20, 20]} />
          <meshBasicMaterial color={o.c} transparent opacity={0.42} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Procedural torso shell fallback
// ---------------------------------------------------------------------------

export function ProceduralShell({ bodyH }) {
  const geom = useMemo(() => {
    const pts = TORSO_PROFILE.map(([t, r]) => new THREE.Vector2(r, (t - 0.5) * bodyH));
    return new THREE.LatheGeometry(pts, 72);
  }, [bodyH]);
  return (
    <group scale={[SX, 1, SZ]}>
      <mesh geometry={geom}>
        <meshBasicMaterial color={theme.violet} transparent opacity={0.3} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={geom} scale={[0.88, 1, 0.88]}>
        <meshBasicMaterial color={theme.blue} transparent opacity={0.18} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Error boundary so a missing/broken GLB cleanly falls back to procedural
// ---------------------------------------------------------------------------

class GlbBoundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function BodyModel({ bodyH }) {
  const shellFallback = <ProceduralShell bodyH={bodyH} />;
  const shell = !GLB_URL ? (
    shellFallback
  ) : (
    <GlbBoundary fallback={shellFallback}>
      <Suspense fallback={shellFallback}>
        <LoadedGlbBody url={GLB_URL} bodyH={bodyH} />
      </Suspense>
    </GlbBoundary>
  );
  return (
    <group>
      {shell}
      <InternalOrgans bodyH={bodyH} />
    </group>
  );
}
