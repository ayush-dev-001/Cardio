import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";
import { ANATOMY, NEUTRAL_SEGMENTS, VESSEL_GEOMETRY } from "../anatomy/anatomy";
import { heartGeometry } from "../anatomy/heartMesh";
import { Vessel, segmentTube } from "./Vessel";

const DEG = Math.PI / 180;

/** Stops pointer events so vessels hidden behind the heart cannot be hovered/clicked through it. */
const block = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();

interface Props {
  probabilities: Record<string, number>;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function Heart({ probabilities, selectedId, hoveredId, onSelect, onHover }: Props) {
  const heart = useMemo(heartGeometry, []);
  const great = useMemo(
    () =>
      ANATOMY.greatVessels.map((v) => ({
        ...v,
        geometry: new TubeGeometry(new CatmullRomCurve3(v.points.map((p) => new Vector3(p[0], p[1], p[2]))), 48, v.radius, 16, false),
      })),
    [],
  );
  const neutral = useMemo(() => NEUTRAL_SEGMENTS.map((s) => segmentTube(s)), []);
  const { position, rotationDeg, scale } = ANATOMY.heart;

  return (
    <group
      position={position as [number, number, number]}
      rotation={rotationDeg.map((d) => d * DEG) as [number, number, number]}
      scale={scale}
    >
      <mesh geometry={heart} onPointerOver={block} onPointerMove={block} onClick={block}>
        <meshPhysicalMaterial color="#b98579" roughness={0.55} clearcoat={0.35} clearcoatRoughness={0.4} sheen={0.4} sheenColor="#f0c4b8" />
      </mesh>
      {great.map((v) => (
        <mesh key={v.id} geometry={v.geometry} onPointerOver={block} onPointerMove={block} onClick={block}>
          <meshStandardMaterial color={v.color} roughness={0.6} />
        </mesh>
      ))}
      {neutral.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>
      ))}
      {VESSEL_GEOMETRY.map((v) => (
        <Vessel
          key={v.info.id}
          vessel={v}
          probability={probabilities[v.info.id] ?? 0}
          selected={selectedId === v.info.id}
          hovered={hoveredId === v.info.id}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
}
