import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, CatmullRomCurve3, Color, MeshStandardMaterial, TubeGeometry, Vector3 } from "three";
import type { VesselGeometry, VesselSegment } from "../anatomy/anatomy";
import { riskColor } from "../anatomy/riskColor";

export function segmentTube(seg: VesselSegment, radiusScale = 1): TubeGeometry {
  const curve = new CatmullRomCurve3(seg.path.map((p) => new Vector3(...p)), false, "centripetal");
  return new TubeGeometry(curve, Math.max(24, seg.path.length * 2), seg.radius * radiusScale, 10, false);
}

interface Props {
  vessel: VesselGeometry;
  probability: number;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/** One coronary artery: tube segments + risk-coloured nodes, all coloured by one probability. */
export function Vessel({ vessel, probability, selected, hovered, onSelect, onHover }: Props) {
  const id = vessel.info.id;
  const color = riskColor(probability);
  const tubes = useMemo(() => vessel.segments.map((s) => segmentTube(s)), [vessel]);
  const outlines = useMemo(() => vessel.segments.map((s) => segmentTube(s, 1.75)), [vessel]);
  // invisible, fatter tubes so thin arteries are easy to hover/click
  const hitTubes = useMemo(() => vessel.segments.map((s) => segmentTube(s, 3)), [vessel]);
  const mainRadius = vessel.segments.find((s) => s.main)?.radius ?? 0.05;
  const glow = selected ? 0.75 : hovered ? 0.5 : 0.22;

  // One shared material for the tubes and one for the nodes; the colour fades smoothly towards
  // the new risk colour when the probability changes (renders only while the fade runs).
  const tubeMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }), []);
  const nodeMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.25 }), []);
  const current = useRef<Color | null>(null);
  const target = useMemo(() => new Color(color), [color]);
  const invalidate = useThree((st) => st.invalidate);

  useEffect(() => {
    if (!current.current) {
      current.current = target.clone();
      for (const m of [tubeMat, nodeMat]) {
        m.color.copy(target);
        m.emissive.copy(target);
      }
    }
    invalidate();
  }, [target, tubeMat, nodeMat, invalidate]);

  useEffect(() => {
    tubeMat.emissiveIntensity = glow;
    nodeMat.emissiveIntensity = glow + 0.25;
    invalidate();
  }, [glow, tubeMat, nodeMat, invalidate]);

  useEffect(() => () => [tubeMat, nodeMat].forEach((m) => m.dispose()), [tubeMat, nodeMat]);

  useFrame((_, dt) => {
    const c = current.current;
    if (!c || c.equals(target)) return;
    c.lerp(target, 1 - Math.exp(-dt * 7));
    if (Math.abs(c.r - target.r) + Math.abs(c.g - target.g) + Math.abs(c.b - target.b) < 0.003) c.copy(target);
    for (const m of [tubeMat, nodeMat]) {
      m.color.copy(c);
      m.emissive.copy(c);
    }
    invalidate();
  });

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

  return (
    <group name={`vessel-${id}`} userData={{ vesselId: id }}>
      {hitTubes.map((g, i) => (
        <mesh key={`h${i}`} geometry={g} {...handlers}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      ))}
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={tubeMat} {...handlers} />
      ))}
      {(selected || hovered) &&
        outlines.map((g, i) => (
          <mesh key={`o${i}`} geometry={g}>
            <meshBasicMaterial color="#ffffff" side={BackSide} transparent opacity={selected ? 0.55 : 0.3} depthWrite={false} />
          </mesh>
        ))}
      {vessel.nodes.map((p, i) => (
        <mesh key={`n${i}`} position={p} scale={mainRadius * (selected ? 1.9 : 1.55)} material={nodeMat} {...handlers}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
      ))}
    </group>
  );
}
