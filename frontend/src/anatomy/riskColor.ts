/** Probability (0..1) -> risk colour: green -> amber -> red. Used by the 3D view and the legend. */

export const RISK_STOPS: { p: number; color: string; label: string }[] = [
  { p: 0.0, color: "#22c55e", label: "Low" },
  { p: 0.5, color: "#f59e0b", label: "Moderate" },
  { p: 1.0, color: "#dc2626", label: "High" },
];

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function riskColor(p: number): string {
  const x = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  for (let i = 0; i < RISK_STOPS.length - 1; i++) {
    const a = RISK_STOPS[i], b = RISK_STOPS[i + 1];
    if (x <= b.p) {
      const u = (x - a.p) / (b.p - a.p);
      const ca = hexToRgb(a.color), cb = hexToRgb(b.color);
      return rgbToHex(ca.map((v, k) => v + (cb[k] - v) * u));
    }
  }
  return RISK_STOPS[RISK_STOPS.length - 1].color;
}

export function riskLabel(p: number): string {
  return p < 0.33 ? "Low" : p < 0.66 ? "Moderate" : "High";
}

/** CSS gradient for legends, generated from the same stops. */
export const riskGradientCss = () =>
  `linear-gradient(to right, ${RISK_STOPS.map((s) => `${s.color} ${s.p * 100}%`).join(", ")})`;
