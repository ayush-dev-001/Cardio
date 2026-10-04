/** Validation numbers for the landing page, read from the training pipeline's metrics.json. */
import metricsJson from "@models/metrics.json";

interface Stat {
  mean: number;
  ci_low: number;
  ci_high: number;
}
interface TargetMetrics {
  selected_model: string;
  final: { threshold: number; min_recall: number };
  cv: Record<string, Record<string, Stat>>;
}
interface Metrics {
  n_patients: number;
  features: string[];
  validation: { outer_folds: number; outer_repeats: number; inner_folds: number; bootstrap: number };
  targets: Record<string, TargetMetrics>;
}

const m = metricsJson as unknown as Metrics;

export const TARGET_ORDER = ["cad", "lad", "lcx", "rca"] as const;
export const TARGET_LABEL: Record<string, string> = {
  cad: "Overall CAD",
  lad: "LAD stenosis",
  lcx: "LCX stenosis",
  rca: "RCA stenosis",
};
export const MODEL_LABEL: Record<string, string> = {
  logreg: "Logistic regression",
  random_forest: "Random forest",
  xgboost: "XGBoost",
  catboost: "CatBoost",
};

export const METRICS = {
  patients: m.n_patients,
  features: m.features.length,
  outerFolds: m.validation.outer_folds,
  repeats: m.validation.outer_repeats,
  bootstrap: m.validation.bootstrap,
  families: Object.keys(m.targets.cad.cv).length,
  rows: TARGET_ORDER.map((t) => {
    const tm = m.targets[t];
    const s = tm.cv[tm.selected_model];
    return {
      id: t,
      label: TARGET_LABEL[t],
      model: MODEL_LABEL[tm.selected_model] ?? tm.selected_model,
      auc: s.roc_auc,
      sensitivity: s.recall,
      specificity: s.specificity,
      minRecall: tm.final.min_recall,
    };
  }),
};
