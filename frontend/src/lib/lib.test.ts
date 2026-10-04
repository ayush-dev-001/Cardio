import { describe, expect, it } from "vitest";
import type { Schema, TargetExplanation } from "../api/types";
import { formatRange, outsideNormal, toFormValues, validate } from "./form";
import { rangeBar } from "./physiology";
import { buildWaterfall, formatPct, formatTickPct, logit, probabilityTicks, sigmoid, waterfallDomain } from "./waterfall";

const schema = {
  groups: [{ id: "demographic", label: "Demographics" }],
  targets: [],
  vessels: [],
  risk_bands: [],
  disclaimer: "",
  features: [
    { id: "age", label: "Age", group: "demographic", type: "numeric", unit: "years", description: "", normal_range: null, valid_range: [18, 110], note: null, derived: false, input: true, default: 58 },
    { id: "fbs", label: "FBS", group: "lab", type: "numeric", unit: "mg/dL", description: "", normal_range: [70, 99], valid_range: [30, 700], note: null, derived: false, input: true, default: 98 },
    { id: "sex", label: "Sex", group: "demographic", type: "binary", unit: null, description: "", normal_range: null, valid_range: null, note: null, derived: false, input: true, default: 1, options: [{ value: 0, label: "Female" }, { value: 1, label: "Male" }] },
    { id: "bbb", label: "BBB", group: "ecg", type: "categorical", unit: null, description: "", normal_range: null, valid_range: null, note: null, derived: false, input: true, default: "N", options: [{ value: "N", label: "None" }, { value: "LBBB", label: "Left" }] },
    { id: "bmi", label: "BMI", group: "demographic", type: "numeric", unit: "kg/m²", description: "", normal_range: [18.5, 24.9], valid_range: [12, 70], note: null, derived: true, input: false, default: null },
  ],
} as Schema;

describe("patient form", () => {
  it("builds defaults for input features only (derived excluded)", () => {
    expect(toFormValues(schema)).toEqual({ age: "58", fbs: "98", sex: "1", bbb: "N" });
  });

  it("validates and converts to the API payload with proper types", () => {
    const { patient, errors } = validate(schema, { age: "61", fbs: "120.5", sex: "0", bbb: "LBBB" });
    expect(errors).toEqual({});
    expect(patient).toEqual({ age: 61, fbs: 120.5, sex: 0, bbb: "LBBB" });
  });

  it("reports missing, non-numeric, out-of-range and unknown-option errors", () => {
    const { patient, errors } = validate(schema, { age: "", fbs: "abc", sex: "2", bbb: "X" });
    expect(patient).toBeNull();
    expect(errors.age).toBe("Required");
    expect(errors.fbs).toBe("Enter a number");
    expect(errors.sex).toBe("Choose an option");
    expect(validate(schema, { age: "150", fbs: "90", sex: "1", bbb: "N" }).errors.age).toBe("Must be 18–110");
  });

  it("flags values outside the normal range", () => {
    const fbs = schema.features[1];
    expect(outsideNormal(fbs, "130")).toBe("high");
    expect(outsideNormal(fbs, "60")).toBe("low");
    expect(outsideNormal(fbs, "85")).toBeNull();
    expect(outsideNormal(schema.features[0], "90")).toBeNull(); // no normal range
    expect(formatRange([null, 150], "mg/dL")).toBe("< 150 mg/dL");
    expect(formatRange([40, null], null)).toBe("≥ 40");
  });
});

const explanation: TargetExplanation = {
  target_id: "cad", label: "CAD", vessel_id: null, model: "logreg", probability: sigmoid(1.5),
  base_value: 0.5, base_probability: sigmoid(0.5), log_odds: 1.5, other_contribution: 0.05,
  contributions: [
    { feature: "a", label: "A", group: "g", unit: null, value: 1, display_value: "Yes", shap: 1.2, normal_range: null, status: null },
    { feature: "b", label: "B", group: "g", unit: null, value: 2, display_value: "2", shap: -0.6, normal_range: null, status: null },
    { feature: "c", label: "C", group: "g", unit: null, value: 3, display_value: "3", shap: 0.25, normal_range: null, status: null },
    { feature: "d", label: "D", group: "g", unit: null, value: 4, display_value: "4", shap: 0.1, normal_range: null, status: null },
  ],
};

describe("SHAP waterfall", () => {
  it("steps start at the base value and end exactly at the patient's log-odds", () => {
    const rows = buildWaterfall(explanation, 2);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "__other"]);
    expect(rows[0].start).toBe(0.5);
    expect(rows[rows.length - 1].end).toBeCloseTo(explanation.log_odds, 10);
    expect(rows[2].shap).toBeCloseTo(0.25 + 0.1 + 0.05, 10); // rest + other_contribution
    expect(rows[2].label).toBe("2 other features");
    for (const r of rows) {
      expect(r.range[0]).toBeLessThanOrEqual(r.range[1]);
      expect(r.pAfter).toBeCloseTo(sigmoid(r.end), 10);
    }
  });

  it("orders by absolute effect and keeps every row when topN is large", () => {
    const rows = buildWaterfall(explanation, 50);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "c", "d", "__other"]);
  });

  it("labels the log-odds axis with round probabilities inside the domain", () => {
    const rows = buildWaterfall(explanation, 10);
    const [lo, hi] = waterfallDomain(explanation, rows);
    expect(lo).toBeLessThan(0.5); // below the base value (lowest point)
    expect(hi).toBeGreaterThan(1.7); // above the highest cumulative step (0.5 + 1.2)
    const ticks = probabilityTicks([lo, hi]);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.every((z) => z >= lo && z <= hi)).toBe(true);
    // every tick sits on a round percentage (multiple of 5%)
    for (const z of ticks) expect(Math.abs(sigmoid(z) * 20 - Math.round(sigmoid(z) * 20))).toBeLessThan(1e-9);
    // very confident predictions still get labelled ticks near the end of the axis
    const extreme = probabilityTicks([logit(0.9), logit(0.9995)]).map((z) => formatTickPct(sigmoid(z)));
    expect(extreme).toContain("99.9%");
    expect(new Set(extreme).size).toBe(extreme.length); // no duplicate labels
    expect(probabilityTicks([-6, 6]).map((z) => formatPct(sigmoid(z)))).toContain("50%");
    expect(probabilityTicks([-6, 6]).length).toBeLessThanOrEqual(7);
    expect(logit(0.5)).toBeCloseTo(0, 10);
    expect([formatPct(0.004), formatPct(0.996), formatPct(0.42)]).toEqual(["<1%", ">99%", "42%"]);
  });
});

describe("normal-range bars", () => {
  it("places the marker and the shaded normal band proportionally", () => {
    const b = rangeBar([70, 99], 250, [30, 700]);
    expect(b.normalFrom).toBeLessThan(b.normalTo);
    expect(b.markerAt).toBeGreaterThan(b.normalTo); // high value right of the band
    expect(b.domain[0]).toBeGreaterThanOrEqual(30);
  });

  it("handles open-ended ranges and values inside the band", () => {
    const tg = rangeBar([null, 150], 120, [10, 3000]);
    expect(tg.normalFrom).toBe(0);
    expect(tg.markerAt).toBeLessThan(tg.normalTo);
    const hdl = rangeBar([40, null], 30, [5, 150]);
    expect(hdl.normalTo).toBe(1);
    expect(hdl.markerAt).toBeLessThan(hdl.normalFrom); // low HDL left of the band
  });
});
