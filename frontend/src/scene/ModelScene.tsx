import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { Component, useEffect, useMemo, type ReactNode } from "react";
import { BufferGeometry, Mesh, MeshPhysicalMaterial, type Object3D } from "three";
import { MODEL, type SceneVessel } from "../anatomy/sceneAnatomy";
import { makeShellMaterial } from "./Torso";
import { useRiskMaterial } from "./useRiskMaterial";

/**
 * Realistic anatomy from glTF (built by assets/3d/pipeline + frontend/scripts/build-anatomy.mjs):
 * a sculpted heart whose coronary arteries are separate meshes, inside a glass "x-ray" torso.
 * Meshopt-compressed; smooth normals are computed once on load.
 */

/** Meshes of a loaded glTF by node name, with their node transforms (dequantisation lives there). */
function useNodes(url: string) {
  const gltf = useGLTF(url, false, true); // no Draco; Meshopt decoder is bundled
  return useMemo(() => {
    const out: Record<string, Mesh> = {};
    gltf.scene.traverse((o: Object3D) => {
      if ((o as Mesh).isMesh) {
        const mesh = o as Mesh;
        const geom = mesh.geometry as BufferGeometry;
        if (!geom.getAttribute("normal")) geom.computeVertexNormals();
        out[mesh.name || mesh.parent?.name || ""] = mesh;
        if (mesh.parent?.name) out[mesh.parent.name] = mesh;
      }
    });
    return out;
  }, [gltf]);
}

function MeshFrom({ src, ...props }: { src: Mesh } & Record<string, unknown>) {
  return (
    <mesh
      geometry={src.geometry}
      position={src.position}
      quaternion={src.quaternion}
      scale={src.scale}
      {...props}
    />
  );
}

/** Stops pointer events so vessels behind the heart cannot be hovered/clicked through it. */
const block = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();

function ModelVessel({
  vessel,
  meshes,
  probability,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  vessel: SceneVessel;
  meshes: Mesh[];
  probability: number;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const id = vessel.info.id;
  const glow = selected ? 0.8 : hovered ? 0.55 : 0.28;
  const mat = useRiskMaterial(probability, glow, 0.3);
  const nodeMat = useRiskMaterial(probability, glow + 0.35, 0.2);
  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(id);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      onHover(null);
      document.body.style.cursor = "";
    },
  };
  const r = MODEL.nodeRadius * (selected ? 1.45 : hovered ? 1.2 : 1);
  return (
    <group name={`vessel-${id}`} userData={{ vesselId: id }}>
      {meshes.map((m) => (
        <MeshFrom key={m.uuid} src={m} material={mat} {...handlers} />
      ))}
      {vessel.nodes.map((p, i) => (
        <mesh key={i} position={p} scale={r} material={nodeMat} {...handlers}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
      ))}
    </group>
  );
}

export function ModelHeart({
  vessels,
  probabilities,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: {
  vessels: SceneVessel[];
  probabilities: Record<string, number>;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const nodes = useNodes(MODEL.heart);
  const materials = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(MODEL.parts).map(([name, p]) => [
          name,
          new MeshPhysicalMaterial({
            color: p.color,
            roughness: p.roughness,
            clearcoat: p.clearcoat,
            clearcoatRoughness: 0.35,
            sheen: p.sheen,
            sheenColor: "#f4c7bb",
          }),
        ]),
      ),
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  const vesselMeshes = MODEL.vesselMeshes as Record<string, string[]>;
  const missing = Object.values(vesselMeshes).flat().filter((n) => !nodes[n]);
  if (missing.length) throw new Error(`heart.glb is missing vessel meshes: ${missing.join(", ")}`);

  return (
    <group>
      {Object.keys(MODEL.parts).map((name) =>
        nodes[name] ? (
          <MeshFrom
            key={name}
            src={nodes[name]}
            material={materials[name]}
            onPointerOver={block}
            onPointerMove={block}
            onClick={block}
          />
        ) : null,
      )}
      {vessels.map((v) => (
        <ModelVessel
          key={v.info.id}
          vessel={v}
          meshes={(vesselMeshes[v.info.id] ?? []).map((n) => nodes[n])}
          probability={probabilities[v.info.id] ?? Number.NaN}
          selected={selectedId === v.info.id}
          hovered={hoveredId === v.info.id}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
}

export function ModelTorso() {
  const nodes = useNodes(MODEL.torso);
  const shell = useMemo(() => makeShellMaterial("#b9c3d3", 0.01, 0.42), []);
  const lungMat = useMemo(() => makeShellMaterial("#cbd3df", 0.006, 0.14), []);
  const torso = nodes.torso ?? Object.values(nodes)[0];
  const lungs = MODEL.lungs;
  return (
    <group>
      {torso && <MeshFrom src={torso} material={shell} renderOrder={10} />}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * lungs.position[0] + 0.05, lungs.position[1], lungs.position[2]]}
          scale={lungs.scale as [number, number, number]}
          material={lungMat}
          renderOrder={5}
        >
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
      ))}
    </group>
  );
}

/** Falls back (via onError) to the procedural anatomy if the model fails to load or decode. */
export class ModelBoundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("3D model unavailable, using procedural anatomy:", error.message);
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

useGLTF.preload(MODEL.heart, false, true);
useGLTF.preload(MODEL.torso, false, true);
