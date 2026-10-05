import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState } from "react";
import { CONFIGURED_RENDERER, SCENE_ANATOMY, cameraPoseFor, type Renderer } from "../anatomy/sceneAnatomy";
import { CameraRig } from "./CameraRig";
import { Heart } from "./Heart";
import { ModelBoundary, ModelHeart, ModelTorso } from "./ModelScene";
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
  /** Let the page background show through (landing hero). */
  transparent?: boolean;
  /** Scroll-wheel zoom; off where the canvas sits inside a scrolling page. */
  zoom?: boolean;
}

/**
 * Interactive torso + heart. Uses the realistic glTF anatomy (config: anatomy.json "renderer"),
 * falling back to the procedural heart if the model cannot load. GPU-friendly: renders on
 * demand, adapts pixel ratio under load, no shadows or post-processing.
 */
export function HeartViewer({
  probabilities,
  selectedId,
  onSelect,
  showLabels = true,
  resetToken = 0,
  transparent = false,
  zoom = true,
}: HeartViewerProps) {
  const [renderer, setRenderer] = useState<Renderer>(CONFIGURED_RENDERER);
  const anatomy = SCENE_ANATOMY[renderer];
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dprMax, setDprMax] = useState(1.75);
  const labelRefs = useRef<LabelRefs>({}).current;
  const visibleLabels = useMemo(
    // while a vessel is focused only its own (and the hovered) label is shown, to avoid clutter
    () =>
      new Set(
        anatomy.vessels
          .map((v) => v.info.id)
          .filter((id) => id === hoveredId || id === selectedId || (showLabels && selectedId === null)),
      ),
    [anatomy, showLabels, hoveredId, selectedId],
  );

  const goal = useMemo(() => {
    const v = anatomy.vessels.find((g) => g.info.id === selectedId);
    return v ? cameraPoseFor(v) : { position: anatomy.home.position.clone(), target: anatomy.home.target.clone() };
    // resetToken forces a new goal object even if the selection is unchanged
  }, [anatomy, selectedId, resetToken]);

  const select = (id: string) => onSelect(id);

  return (
    <div className="relative h-full w-full">
      <Canvas
        frameloop="demand"
        dpr={[1, dprMax]}
        camera={{ position: anatomy.home.position.toArray(), fov: 38, near: 0.05, far: 100 }}
        gl={{ antialias: true, powerPreference: "default", alpha: transparent }}
        onCreated={({ gl }) => (transparent ? gl.setClearAlpha(0) : gl.setClearColor("#020617"))}
      >
        <PerformanceMonitor onDecline={() => setDprMax(1)} />
        <AdaptiveDpr pixelated />
        <hemisphereLight args={["#e0e7ff", "#1e1b2e", 0.95]} />
        <directionalLight position={[3, 5, 6]} intensity={1.7} />
        <directionalLight position={[-4, 2, -3]} intensity={0.75} color="#c4b5fd" />
        {renderer === "model" ? (
          <ModelBoundary onError={() => setRenderer("procedural")}>
            <Suspense fallback={null}>
              <ModelHeart
                vessels={anatomy.vessels}
                probabilities={probabilities}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={select}
                onHover={setHoveredId}
              />
              <ModelTorso />
            </Suspense>
          </ModelBoundary>
        ) : (
          <>
            <Heart probabilities={probabilities} selectedId={selectedId} hoveredId={hoveredId} onSelect={select} onHover={setHoveredId} />
            <Torso />
          </>
        )}
        <CameraRig goal={goal} zoom={zoom} />
        <LabelTracker refs={labelRefs} visibleIds={visibleLabels} vessels={anatomy.vessels} />
      </Canvas>
      <LabelLayer refs={labelRefs} vessels={anatomy.vessels} probabilities={probabilities} onSelect={onSelect} />
    </div>
  );
}
