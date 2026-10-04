import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import { VESSEL_GEOMETRY, heartMatrix } from "../anatomy/anatomy";
import { riskColor } from "../anatomy/riskColor";

/**
 * Screen-space vessel labels in two parts:
 *  - <LabelLayer> renders plain DOM labels next to the canvas;
 *  - <LabelTracker> (inside the Canvas) projects the 3D anchors each rendered frame and
 *    moves those DOM elements. This avoids per-label React roots (drei <Html>), which race
 *    with React 19 StrictMode remounts.
 */
export type LabelRefs = Record<string, HTMLDivElement | null>;

const ANCHORS = (() => {
  const m = heartMatrix();
  return VESSEL_GEOMETRY.map((v) => ({ id: v.info.id, world: new Vector3(...v.labelAt).applyMatrix4(m) }));
})();

export function LabelTracker({ refs, visibleIds }: { refs: LabelRefs; visibleIds: Set<string> }) {
  const tmp = useMemo(() => new Vector3(), []);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [visibleIds, invalidate]);

  useFrame(({ camera, size }) => {
    for (const a of ANCHORS) {
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
  probabilities: Record<string, number>;
  onSelect: (id: string) => void;
}

export function LabelLayer({ refs, probabilities, onSelect }: LayerProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {ANCHORS.map(({ id }) => {
        const p = probabilities[id] ?? 0;
        const color = riskColor(p);
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
            {id} <span style={{ color }}>{Math.round(p * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}
