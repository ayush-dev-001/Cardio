/** Geometry for "value vs normal range" bars in the physiological panel. */

export interface RangeBar {
  domain: [number, number];
  normal: [number, number]; // shaded band (open ends extended to the domain edge)
  marker: number; // patient's value, clamped to the domain
  // all as fractions 0..1 of the bar width
  normalFrom: number;
  normalTo: number;
  markerAt: number;
}

/**
 * Pick a display domain wide enough to show the normal band and the patient's value with some
 * margin - not the (very wide) plausibility range, which would squash the normal band.
 */
export function rangeBar(normal: [number | null, number | null], value: number, valid?: [number, number] | null): RangeBar {
  const [nlo, nhi] = normal;
  const lo0 = nlo ?? Math.min(value, nhi ?? value) * 0.5;
  const hi0 = nhi ?? Math.max(value, nlo ?? value) * 1.5;
  const span = Math.max(hi0 - lo0, 1e-9);
  let lo = Math.min(lo0, value) - span * 0.35;
  let hi = Math.max(hi0, value) + span * 0.35;
  if (valid) {
    lo = Math.max(lo, valid[0]);
    hi = Math.min(hi, valid[1]);
  }
  const frac = (x: number) => (Math.min(hi, Math.max(lo, x)) - lo) / (hi - lo || 1);
  const band: [number, number] = [nlo ?? lo, nhi ?? hi];
  return {
    domain: [lo, hi],
    normal: band,
    marker: Math.min(hi, Math.max(lo, value)),
    normalFrom: frac(band[0]),
    normalTo: frac(band[1]),
    markerAt: frac(value),
  };
}
