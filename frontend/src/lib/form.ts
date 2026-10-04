/** Patient-form logic driven entirely by the /schema response. */
import type { FeatureSchema, FeatureValue, Patient, Schema } from "../api/types";

export type FormValues = Record<string, string>; // raw text as typed, keyed by feature id
export type FormErrors = Record<string, string>;

export const inputFeatures = (schema: Schema) => schema.features.filter((f) => f.input);

/** Form state from a patient record (or the schema defaults). */
export function toFormValues(schema: Schema, patient?: Patient): FormValues {
  return Object.fromEntries(
    inputFeatures(schema).map((f) => [f.id, String(patient?.[f.id] ?? f.default ?? "")]),
  );
}

function parseValue(f: FeatureSchema, raw: string): { value?: FeatureValue; error?: string } {
  const text = raw.trim();
  if (text === "") return { error: "Required" };
  if (f.type === "numeric") {
    const v = Number(text);
    if (!Number.isFinite(v)) return { error: "Enter a number" };
    if (f.valid_range && (v < f.valid_range[0] || v > f.valid_range[1]))
      return { error: `Must be ${f.valid_range[0]}–${f.valid_range[1]}` };
    return { value: v };
  }
  const option = f.options?.find((o) => String(o.value) === text);
  if (!option) return { error: "Choose an option" };
  return { value: option.value };
}

/** Validate the form; returns the API payload when valid. */
export function validate(schema: Schema, values: FormValues): { patient: Patient | null; errors: FormErrors } {
  const patient: Patient = {};
  const errors: FormErrors = {};
  for (const f of inputFeatures(schema)) {
    const { value, error } = parseValue(f, values[f.id] ?? "");
    if (error) errors[f.id] = error;
    else patient[f.id] = value!;
  }
  return { patient: Object.keys(errors).length ? null : patient, errors };
}

/** "low" / "high" if a numeric value lies outside its normal range, else null. */
export function outsideNormal(f: FeatureSchema, raw: string): "low" | "high" | null {
  if (f.type !== "numeric" || !f.normal_range || raw.trim() === "") return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  const [lo, hi] = f.normal_range;
  if (lo !== null && v < lo) return "low";
  if (hi !== null && v > hi) return "high";
  return null;
}

export function formatRange(range: [number | null, number | null] | null, unit?: string | null): string {
  if (!range) return "";
  const [lo, hi] = range;
  const u = unit ? ` ${unit}` : "";
  if (lo !== null && hi !== null) return `${lo}–${hi}${u}`;
  if (lo !== null) return `≥ ${lo}${u}`;
  if (hi !== null) return `< ${hi}${u}`;
  return "";
}
