import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { type DirectionalLight, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface Props {
  /** Where the camera should fly to. A new object (even with equal values) re-triggers the move. */
  goal: { position: Vector3; target: Vector3 };
  zoom?: boolean;
}

/**
 * Orbit/zoom controls plus a smooth fly-to animation. Works with frameloop="demand":
 * frames are only rendered while the camera is moving or the user interacts.
 */
export function CameraRig({ goal, zoom = true }: Props) {
  const controls = useRef<OrbitControlsImpl>(null);
  // orbit target starts at the first goal (the anatomy's home view); later goals are animated to
  const [initialTarget] = useState(() => goal.target.clone());
  const animating = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  // portrait screens (phones) show less width: pull the camera back so the heart still fits
  const fitted = useMemo(() => {
    const k = aspect < 1.1 ? Math.min(2.2, Math.pow(1.1 / aspect, 0.85)) : 1;
    return { target: goal.target, position: goal.target.clone().add(goal.position.clone().sub(goal.target).multiplyScalar(k)) };
  }, [goal, aspect]);

  useEffect(() => {
    animating.current = true;
    invalidate();
  }, [fitted, invalidate]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => (animating.current = false); // user takes over
    c.addEventListener("start", stop);
    return () => c.removeEventListener("start", stop);
  }, []);

  // "headlight": a light that follows the camera so any side of the heart the user turns to is lit
  const headlight = useRef<DirectionalLight>(null);

  useFrame(({ camera }, dt) => {
    const c = controls.current;
    // marks the first rendered frame (used for load-time checks and end-to-end tests)
    if (!document.body.dataset.sceneReadyMs) document.body.dataset.sceneReadyMs = String(Math.round(performance.now()));
    if (headlight.current && c) {
      headlight.current.position.copy(camera.position);
      headlight.current.target.position.copy(c.target);
      headlight.current.target.updateMatrixWorld();
    }
    if (!animating.current || !c) return;
    const k = 1 - Math.exp(-dt * 4.5);
    camera.position.lerp(fitted.position, k);
    c.target.lerp(fitted.target, k);
    c.update();
    if (camera.position.distanceTo(fitted.position) < 0.01 && c.target.distanceTo(fitted.target) < 0.01) {
      animating.current = false;
    } else {
      invalidate();
    }
  });

  return (
    <>
    <directionalLight ref={headlight} intensity={1.1} color="#fff7ed" />
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      enableZoom={zoom}
      dampingFactor={0.12}
      minDistance={1.2}
      maxDistance={16}
      target={initialTarget}
    />
    </>
  );
}
