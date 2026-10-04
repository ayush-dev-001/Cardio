import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { VESSEL_GEOMETRY, vesselCameraPose } from "../anatomy/anatomy";
import { CameraRig, DEFAULT_VIEW } from "./CameraRig";
import { Heart } from "./Heart";
import { Torso } from "./Torso";
import { LabelLayer, LabelTracker, type LabelRefs } from "./VesselLabels";

export interface HeartViewerProps {
  /** Stenosis probability per vessel id (0..1), keyed by shared/vessels.json ids. */
  probabilities: Record<string, number>;
  selectedId: string | null;
  /** Fired when a vessel is clicked (selection event for the dashboard). */
  onSelect: (id: string | null) => void;
  showLabels?: boolean;
  /** Increment to fly the camera back to the overview. */
  resetToken?: number;
}

/**
 * Interactive torso + heart. GPU-friendly: renders on demand (only while something changes),
 * adapts pixel ratio under load, no shadows or post-processing.
 */
export function HeartViewer({ probabilities, selectedId, onSelect, showLabels = true, resetToken = 0 }: HeartViewerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dprMax, setDprMax] = useState(1.75);
  const labelRefs = useRef<LabelRefs>({}).current;
  const visibleLabels = useMemo(
    // while a vessel is focused only its own (and the hovered) label is shown, to avoid clutter
    () =>
      new Set(
        VESSEL_GEOMETRY.map((g) => g.info.id).filter(
          (id) => id === hoveredId || id === selectedId || (showLabels && selectedId === null),
        ),
      ),
    [showLabels, hoveredId, selectedId],
  );

  const goal = useMemo(() => {
    const v = VESSEL_GEOMETRY.find((g) => g.info.id === selectedId);
    return v ? vesselCameraPose(v) : { position: DEFAULT_VIEW.position.clone(), target: DEFAULT_VIEW.target.clone() };
    // resetToken forces a new goal object even if the selection is unchanged
  }, [selectedId, resetToken]);

  return (
    <div className="relative h-full w-full">
    <Canvas
      frameloop="demand"
      dpr={[1, dprMax]}
      camera={{ position: DEFAULT_VIEW.position.toArray(), fov: 38, near: 0.05, far: 100 }}
      gl={{ antialias: true, powerPreference: "default" }}
      onCreated={({ gl }) => gl.setClearColor("#020617")}
    >
      <PerformanceMonitor onDecline={() => setDprMax(1)} />
      <AdaptiveDpr pixelated />
      <hemisphereLight args={["#dbeafe", "#1e293b", 0.9]} />
      <directionalLight position={[3, 5, 6]} intensity={1.6} />
      <directionalLight position={[-4, 2, -3]} intensity={0.7} color="#93c5fd" />
      <Heart
        probabilities={probabilities}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onSelect={(id) => onSelect(id)}
        onHover={setHoveredId}
      />
      <Torso />
      <CameraRig goal={goal} />
      <LabelTracker refs={labelRefs} visibleIds={visibleLabels} />
    </Canvas>
    <LabelLayer refs={labelRefs} probabilities={probabilities} onSelect={onSelect} />
    </div>
  );
}
