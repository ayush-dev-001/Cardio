/** Types mirroring the backend responses (backend/app/schemas.py). */

export type FeatureType = "numeric" | "binary" | "ordinal" | "categorical";
export type FeatureValue = number | string;
export type Patient = Record<string, FeatureValue>;
export type RiskLevel = "low" | "moderate" | "high";
export type RangeStatus = "low" | "normal" | "high" | null;

export interface FeatureOption {
  value: FeatureValue;
  label: string;
}

export interface FeatureSchema {
  id: string;
  label: string;
  group: string;
  type: FeatureType;
  unit: string | null;
  description: string;
  normal_range: [number | null, number | null] | null;
  valid_range: [number, number] | null;
  note: string | null;
  derived: boolean;
  input: boolean;
  default: FeatureValue | null;
  options?: FeatureOption[];
}

export interface TargetSchema {
  id: string;
  label: string;
  kind: "overall" | "vessel";
  vessel_id: string | null;
  model: string;
  threshold: number;
  min_recall: number | null;
  cv_roc_auc: { mean: number; ci_low: number; ci_high: number } | null;
}

export interface VesselSchema {
  id: string;
  name: string;
  target_id: string;
  supplies: string;
}

export interface Schema {
  groups: { id: string; label: string }[];
  features: FeatureSchema[];
  targets: TargetSchema[];
  vessels: VesselSchema[];
  risk_bands: { upper: number; label: RiskLevel }[];
  disclaimer: string;
}

export interface TargetPrediction {
  target_id: string;
  label: string;
  probability: number;
  threshold: number;
  predicted_positive: boolean;
  risk_level: RiskLevel;
  model: string;
  vessel_id?: string;
}

export interface PredictResponse {
  cad: TargetPrediction;
  vessels: (TargetPrediction & { vessel_id: string })[];
  derived_inputs: Record<string, number>;
  disclaimer: string;
}

export interface Contribution {
  feature: string;
  label: string;
  group: string;
  unit: string | null;
  value: FeatureValue | null;
  display_value: string;
  shap: number;
  normal_range: [number | null, number | null] | null;
  status: RangeStatus;
}

export interface TargetExplanation {
  target_id: string;
  label: string;
  vessel_id: string | null;
  model: string;
  probability: number;
  base_value: number;
  base_probability: number;
  log_odds: number;
  contributions: Contribution[];
  other_contribution: number;
}

export interface ExplainResponse {
  explanations: TargetExplanation[];
  units: string;
  disclaimer: string;
}

export interface SamplePatient {
  kind: "normal" | "single_vessel" | "multi_vessel";
  title: string;
  description: string;
  patient_id: number;
  patient: Patient;
  true_labels: Record<string, number>;
  source: string;
}
