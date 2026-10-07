/**
 * Plain-language summary of one prediction: the overall result, the main factors pushing the CAD
 * risk up and down (SHAP), the highest-risk vessel, how reliable each model is in validation, and
 * measurements outside their normal range. Pure function so it can be unit-tested.
 */
import type { Contribution, ExplainResponse, PredictResponse, Schema, TargetPrediction } from "../api/types";
import { formatPct } from "./waterfall";

export type Reliability = "high" | "good" | "moderate";

/** Validation AUC -> a plain word. Cut-offs follow the usual reading of ROC-AUC. */
export function reliabilityOf(auc: number | undefined): Reliability | null {
  if (auc === undefined || !Number.isFinite(auc)) return null;
  return auc >= 0.9 ? "high" : auc >= 0.8 ? "good" : "moderate";
}

const pct = formatPct; // same wording as the gauge and bars (e.g. ">99%")

/** Lower-case the first letter for use mid-sentence, but keep acronyms such as "ST elevation". */
const midSentence = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function factor(c: Contribution): string {
  const v = c.display_value && c.display_value !== "—" ? ` (${c.display_value})` : "";
  return `${midSentence(c.label)}${v}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface SummaryLine {
  kind: "overall" | "up" | "down" | "vessel" | "reliability" | "range";
  text: string;
}

export function buildSummary(prediction: PredictResponse, explanation: ExplainResponse | null, schema: Schema, topN = 3): SummaryLine[] {
  const lines: SummaryLine[] = [];
  const cad = prediction.cad;
  lines.push({
    kind: "overall",
    text: `Estimated probability of coronary artery disease: ${pct(cad.probability)} (${cad.risk_level} risk), ${
      cad.predicted_positive ? "above" : "below"
    } the decision threshold of ${pct(cad.threshold)}.`,
  });

  const cadExpl = explanation?.explanations.find((e) => e.target_id === cad.target_id);
  if (cadExpl) {
    const sorted = [...cadExpl.contributions].sort((a, b) => b.shap - a.shap);
    const up = sorted.filter((c) => c.shap > 0.05).slice(0, topN);
    const down = sorted.filter((c) => c.shap < -0.05).reverse().slice(0, topN);
    if (up.length) lines.push({ kind: "up", text: `Main factors raising the risk: ${list(up.map(factor))}.` });
    if (down.length) lines.push({ kind: "down", text: `Main factors lowering the risk: ${list(down.map(factor))}.` });
    const abnormal = cadExpl.contributions.filter((c) => c.status === "low" || c.status === "high").slice(0, 4);
    if (abnormal.length)
      lines.push({ kind: "range", text: `Outside the normal range: ${list(abnormal.map((c) => `${factor(c)} is ${c.status}`))}.` });
  }

  const top = [...prediction.vessels].sort((a, b) => b.probability - a.probability)[0] as TargetPrediction | undefined;
  if (top) {
    const above = prediction.vessels.filter((v) => v.predicted_positive).map((v) => v.vessel_id);
    lines.push({
      kind: "vessel",
      text: `Highest-risk artery: ${top.vessel_id} at ${pct(top.probability)}. ${
        above.length ? `Above the threshold: ${list(above)}.` : "No artery is above its decision threshold."
      }`,
    });
  }

  const weak = schema.targets
    .filter((t) => reliabilityOf(t.cv_roc_auc?.mean) === "moderate")
    .map((t) => t.vessel_id ?? t.label);
  if (weak.length)
    lines.push({
      kind: "reliability",
      text: `The ${list(weak)} predictions are less reliable (validation AUC about ${schema.targets
        .filter((t) => reliabilityOf(t.cv_roc_auc?.mean) === "moderate")
        .map((t) => t.cv_roc_auc!.mean.toFixed(2))
        .join(" / ")}), so treat them as a rough guide.`,
    });
  return lines;
}
