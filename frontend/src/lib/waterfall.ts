/**
 * SHAP waterfall maths. Contributions are additive in log-odds, so the chart is drawn in
 * log-odds (bars add up exactly) with the axis labelled in probability for readability.
 */
import type { TargetExplanation } from "../api/types";

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const logit = (p: number) => {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
};

export interface WaterfallRow {
  key: string;
  label: string; // feature label
  valueText: string; // the patient's value, e.g. "Yes" or "250 mg/dL"
  shap: number; // log-odds contribution
  start: number; // cumulative log-odds before this step
  end: number; // ... and after
  range: [number, number]; // [min, max] for a floating bar
  pBefore: number;
  pAfter: number;
  isOther: boolean;
}

/** Steps from the average patient (base) to this patient, largest effects first. */
export function buildWaterfall(e: TargetExplanation, topN = 10): WaterfallRow[] {
  const sorted = [...e.contributions].sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otherShap = rest.reduce((s, c) => s + c.shap, 0) + e.other_contribution;

  const steps = top.map((c) => ({ key: c.feature, label: c.label, valueText: c.display_value, shap: c.shap, isOther: false }));
  if (rest.length || Math.abs(e.other_contribution) > 0) {
    steps.push({
      key: "__other",
      label: `${rest.length} other feature${rest.length === 1 ? "" : "s"}`,
      valueText: "combined",
      shap: otherShap,
      isOther: true,
    });
  }

  let cum = e.base_value;
  return steps.map((s) => {
    const start = cum;
    cum += s.shap;
    return {
      ...s,
      start,
      end: cum,
      range: [Math.min(start, cum), Math.max(start, cum)] as [number, number],
      pBefore: sigmoid(start),
      pAfter: sigmoid(cum),
    };
  });
}

const COARSE_P = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.98, 0.99, 0.995, 0.999];
const FINE_P = [0.01, 0.02, ...Array.from({ length: 19 }, (_, i) => (i + 1) * 0.05), 0.98, 0.99];

/** Axis domain (log-odds) covering base, all steps and the final value, with padding. */
export function waterfallDomain(e: TargetExplanation, rows: WaterfallRow[]): [number, number] {
  const xs = [e.base_value, e.log_odds, ...rows.flatMap((r) => [r.start, r.end])];
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const pad = Math.max(0.3, (hi - lo) * 0.08);
  return [lo - pad, hi + pad];
}

/** Tick positions (log-odds) at round probabilities inside the domain (coarse steps, or 5% steps
 * when the domain is narrow), thinned to at most `maxTicks`. */
export function probabilityTicks([lo, hi]: [number, number], maxTicks = 7): number[] {
  const inside = (ps: number[]) => ps.map(logit).filter((z) => z >= lo && z <= hi);
  let ticks = inside(COARSE_P);
  if (ticks.length < 3) ticks = inside(FINE_P);
  while (ticks.length > maxTicks) {
    // thin symmetrically around the tick nearest 50% so that one is always kept
    const centre = ticks.reduce((best, z, i) => (Math.abs(z) < Math.abs(ticks[best]) ? i : best), 0);
    ticks = ticks.filter((_, i) => (i - centre) % 2 === 0);
  }
  return ticks;
}

/** Axis-tick label: keeps one decimal at the extremes (0.5%, 99.9%) so ticks stay distinct. */
export const formatTickPct = (p: number) => {
  const v = p * 100;
  return v < 1 || v > 99 ? `${Number(v.toFixed(1))}%` : `${Math.round(v)}%`;
};

export const formatPct = (p: number) => {
  const v = p * 100;
  if (v > 0 && v < 1) return "<1%";
  if (v < 100 && v > 99) return ">99%";
  return `${Math.round(v)}%`;
};
