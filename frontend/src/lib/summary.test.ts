import { describe, expect, it } from "vitest";
import type { Contribution, ExplainResponse, PredictResponse, Schema } from "../api/types";
import { buildSummary, reliabilityOf } from "./summary";

const target = (id: string, p: number, thr: number, vessel?: string) => ({
  target_id: id,
  label: id.toUpperCase(),
  probability: p,
  threshold: thr,
  predicted_positive: p >= thr,
  risk_level: (p < 0.33 ? "low" : p < 0.66 ? "moderate" : "high") as "low" | "moderate" | "high",
  model: "logreg",
  ...(vessel ? { vessel_id: vessel } : {}),
});

const prediction = {
  cad: target("cad", 0.82, 0.56),
  vessels: [target("lad", 0.76, 0.62, "LAD"), target("lcx", 0.2, 0.34, "LCX"), target("rca", 0.4, 0.32, "RCA")],
  derived_inputs: {},
  disclaimer: "",
} as PredictResponse;

const c = (label: string, shap: number, display_value: string, status: Contribution["status"] = null): Contribution => ({
  feature: label, label, group: "x", unit: null, value: null, display_value, shap, normal_range: null, status,
});

const explanation = {
  explanations: [{
    target_id: "cad", label: "CAD", vessel_id: null, model: "logreg", probability: 0.82, base_value: 0, base_probability: 0.7,
    log_odds: 1.5, other_contribution: 0,
    contributions: [c("Typical chest pain", 1.2, "Yes"), c("Diabetes", 0.4, "Yes"), c("Age", 0.3, "67 y"),
      c("Ejection fraction", -0.6, "60 %"), c("Triglycerides", 0.02, "250 mg/dL", "high"), c("Tiny", 0.01, "1")],
  }],
  units: "log-odds", disclaimer: "",
} as ExplainResponse;

const auc = (mean: number) => ({ mean, ci_low: mean - 0.05, ci_high: mean + 0.05 });
const schema = {
  targets: [
    { id: "cad", label: "CAD", kind: "overall", vessel_id: null, model: "logreg", threshold: 0.56, min_recall: 0.9, cv_roc_auc: auc(0.93) },
    { id: "lad", label: "LAD", kind: "vessel", vessel_id: "LAD", model: "rf", threshold: 0.62, min_recall: 0.8, cv_roc_auc: auc(0.85) },
    { id: "lcx", label: "LCX", kind: "vessel", vessel_id: "LCX", model: "rf", threshold: 0.34, min_recall: 0.8, cv_roc_auc: auc(0.73) },
    { id: "rca", label: "RCA", kind: "vessel", vessel_id: "RCA", model: "lr", threshold: 0.32, min_recall: 0.8, cv_roc_auc: auc(0.73) },
  ],
} as unknown as Schema;

describe("plain-language summary", () => {
  const lines = buildSummary(prediction, explanation, schema);
  const text = (k: string) => lines.find((l) => l.kind === k)?.text ?? "";

  it("states the overall probability, risk level and threshold", () => {
    expect(text("overall")).toContain("82%");
    expect(text("overall")).toContain("high risk");
    expect(text("overall")).toContain("above the decision threshold of 56%");
  });

  it("lists the strongest raising and lowering factors in order, skipping negligible ones", () => {
    expect(text("up")).toBe("Main factors raising the risk: typical chest pain (Yes), diabetes (Yes) and age (67 y).");
    expect(text("down")).toBe("Main factors lowering the risk: ejection fraction (60 %).");
    expect(text("up")).not.toContain("tiny");
  });

  it("mentions out-of-range measurements, the top vessel and weak models", () => {
    expect(text("range")).toContain("triglycerides (250 mg/dL) is high");
    expect(text("vessel")).toContain("LAD at 76%");
    expect(text("vessel")).toContain("LAD and RCA");
    expect(text("reliability")).toContain("LCX and RCA");
  });

  it("keeps acronyms intact mid-sentence", () => {
    const e = { ...explanation, explanations: [{ ...explanation.explanations[0], contributions: [c("ST elevation", 0.9, "Yes")] }] };
    expect(buildSummary(prediction, e, schema).find((l) => l.kind === "up")?.text).toContain("ST elevation (Yes)");
  });

  it("maps AUC to reliability words", () => {
    expect(reliabilityOf(0.93)).toBe("high");
    expect(reliabilityOf(0.85)).toBe("good");
    expect(reliabilityOf(0.73)).toBe("moderate");
    expect(reliabilityOf(undefined)).toBeNull();
  });

  it("works before the explanation has arrived", () => {
    const l = buildSummary(prediction, null, schema);
    expect(l.map((x) => x.kind)).toEqual(["overall", "vessel", "reliability"]);
  });
});
