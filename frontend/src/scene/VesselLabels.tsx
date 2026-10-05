import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import type { SceneVessel } from "../anatomy/sceneAnatomy";
import { riskColor } from "../anatomy/riskColor";

/**
 * Screen-space vessel labels in two parts:
 *  - <LabelLayer> renders plain DOM labels next to the canvas;
 *  - <LabelTracker> (inside the Canvas) projects the 3D anchors each rendered frame and
 *    moves those DOM elements. This avoids per-label React roots (drei <Html>), which race
 *    with React 19 StrictMode remounts.
 */
export type LabelRefs = Record<string, HTMLDivElement | null>;

export function LabelTracker({ refs, visibleIds, vessels }: { refs: LabelRefs; visibleIds: Set<string>; vessels: SceneVessel[] }) {
  const anchors = useMemo(() => vessels.map((v) => ({ id: v.info.id, world: v.labelAt })), [vessels]);
  const tmp = useMemo(() => new Vector3(), []);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [visibleIds, anchors, invalidate]);

  useFrame(({ camera, size }) => {
    for (const a of anchors) {
      const el = refs[a.id];
      if (!el) continue;
      tmp.copy(a.world).project(camera);
      const x = ((tmp.x + 1) / 2) * size.width;
      const y = ((1 - tmp.y) / 2) * size.height;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.style.display = tmp.z > 1 || !visibleIds.has(a.id) ? "none" : "block";
    }
  });
  return null;
}

interface LayerProps {
  refs: LabelRefs;
  vessels: SceneVessel[];
  probabilities: Record<string, number>;
  onSelect: (id: string) => void;
}

export function LabelLayer({ refs, vessels, probabilities, onSelect }: LayerProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {vessels.map(({ info: { id } }) => {
        const p = probabilities[id];
        const color = p === undefined ? "#8b8698" : riskColor(p);
        return (
          <div
            key={id}
            ref={(el) => {
              refs[id] = el;
            }}
            data-vessel-label={id}
            onClick={() => onSelect(id)}
            title={`Focus ${id}`}
            className="pointer-events-auto absolute left-0 top-0 cursor-pointer whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold text-white shadow-lg"
            style={{ background: "rgba(15,23,42,0.85)", borderColor: color, display: "none" }}
          >
            {id} <span style={{ color }}>{p === undefined ? "—" : `${Math.round(p * 100)}%`}</span>
          </div>
        );
      })}
    </div>
  );
}
