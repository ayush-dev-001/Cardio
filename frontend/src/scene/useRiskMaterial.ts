import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, MeshStandardMaterial } from "three";
import { riskColor } from "../anatomy/riskColor";

/**
 * A material coloured by stenosis probability (green -> amber -> red). When the probability
 * changes, the colour fades smoothly to the new value; frames are requested only while fading,
 * so it stays cheap with frameloop="demand".
 */
export function useRiskMaterial(probability: number, glow: number, roughness = 0.35): MeshStandardMaterial {
  const material = useMemo(() => new MeshStandardMaterial({ roughness, metalness: 0.05 }), [roughness]);
  // no prediction yet (NaN): neutral grey, so an unknown risk never looks like "low risk"
  const target = useMemo(() => new Color(Number.isFinite(probability) ? riskColor(probability) : "#8b8698"), [probability]);
  const current = useRef<Color | null>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!current.current) {
      current.current = target.clone();
      material.color.copy(target);
      material.emissive.copy(target);
    }
    invalidate();
  }, [target, material, invalidate]);

  useEffect(() => {
    material.emissiveIntensity = glow;
    invalidate();
  }, [glow, material, invalidate]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    const c = current.current;
    if (!c || c.equals(target)) return;
    c.lerp(target, 1 - Math.exp(-dt * 7));
    if (Math.abs(c.r - target.r) + Math.abs(c.g - target.g) + Math.abs(c.b - target.b) < 0.003) c.copy(target);
    material.color.copy(c);
    material.emissive.copy(c);
    invalidate();
  });

  return material;
}
