# Phase 2: Model results

Produced by `python -m cardioscope_ml.train` (about 7.5 min on 16 cores; seed 42; two runs give
identical results). All numbers come from `models/metrics.json`, and figures are in
`reports/figures/phase2_*.png`.

## 1. Method

| Step | What we did |
|---|---|
| Inputs | 54 features from `features.yaml` (Phase 1). `Cath`, `LAD`, `LCX` and `RCA` are never inputs. This is enforced by `assert_no_leakage` and by pytest checks on the training matrix and the saved models. |
| Preprocessing | `Pipeline(ColumnTransformer → classifier)`: median imputation, one-hot encoding for BBB, and a standard scaler for LR only. Each pipeline is refit inside every fold. |
| Outer CV | Repeated stratified 5-fold × 3 repeats = 15 test folds. All targets and models share the same splits, so comparisons are paired. Splits are stratified on the joint LAD/LCX/RCA pattern. |
| Inner CV (tuning) | Randomized search (15 candidates) with stratified 3-fold CV on the outer-training part only. The objective is ROC-AUC. |
| Calibration | Platt scaling fitted on 5-fold out-of-fold predictions of the outer-training part. Kept only if it lowers the Brier score; it did for all four targets. |
| Threshold | The highest threshold whose out-of-fold recall is ≥ `min_recall` (0.90 for CAD, 0.80 per vessel; set in `targets.yaml`). It is chosen on training data and then applied to the unseen test fold. |
| Metrics | Accuracy, precision, recall, specificity, F1, ROC-AUC and Brier. Point estimate = metric on the pooled out-of-fold predictions, averaged over the 3 repeats. 95% CI = 1000-sample bootstrap over patients. |
| Final model | For each target, the family with the best CV ROC-AUC is retuned on all 303 patients by the *same* procedure (search → refit → Platt → threshold) and saved. |

Model families: Logistic Regression (elastic-net), Random Forest, XGBoost and CatBoost.
*Note:* Windows Smart App Control on the development machine blocks scikit-learn's tree modules
and the `shap` package. Random Forest is therefore built as XGBoost's random-forest mode: one round
of 300 bagged, random-subspace trees with learning rate 1, which is a standard random forest. SHAP
values are computed with the exact TreeSHAP built into XGBoost and CatBoost, and with exact linear
SHAP for LR (`ml/cardioscope_ml/explain.py`).

## 2. Results: selected model per target (nested CV, mean [95% CI])

| Target | Model | ROC-AUC | Recall | Precision | Specificity | F1 | Accuracy | Brier |
|---|---|---|---|---|---|---|---|---|
| **CAD** | Logistic Regression | **0.929** [0.899–0.955] | 0.889 [0.849–0.928] | 0.923 [0.888–0.955] | 0.816 [0.73–0.88] | 0.906 [0.876–0.933] | 0.868 [0.831–0.903] | 0.095 |
| **LAD** | Random Forest | **0.848** [0.802–0.890] | 0.819 [0.771–0.867] | 0.824 [0.767–0.876] | 0.754 [0.68–0.83] | 0.822 [0.781–0.859] | 0.792 [0.750–0.833] | 0.155 |
| **LCX** | Random Forest | **0.729** [0.672–0.780] | 0.787 [0.723–0.847] | 0.527 [0.453–0.598] | 0.543 [0.48–0.61] | 0.631 [0.570–0.689] | 0.639 [0.594–0.689] | 0.205 |
| **RCA** | Logistic Regression | **0.731** [0.677–0.783] | 0.769 [0.699–0.835] | 0.515 [0.437–0.591] | 0.563 [0.50–0.63] | 0.617 [0.551–0.676] | 0.640 [0.590–0.688] | 0.200 |

ROC-AUC of all families (the full table with every metric is in `metrics.json`):

| Target | LogReg | Random Forest | XGBoost | CatBoost |
|---|---|---|---|---|
| CAD | **0.929** | 0.916 | 0.915 | 0.919 |
| LAD | 0.834 | **0.848** | 0.839 | 0.836 |
| LCX | 0.705 | **0.729** | 0.717 | 0.713 |
| RCA | **0.731** | 0.719 | 0.697 | 0.655 |

How to read this:
- **Overall CAD is predicted well** (AUC 0.93). **LAD is good** (0.85). **LCX and RCA are only
  moderate** (≈ 0.73), as Phase 1 suggested: no routine clinical feature carries much
  vessel-specific signal for them.
- The four families are within each other's confidence intervals for CAD, LAD and LCX. No family
  is clearly superior, so simple, well-regularised models are fully competitive on 303 patients.
- Selecting the best of 4 families using the same outer CV makes the reported winner AUC slightly
  optimistic (by about 0.01, judging by the spread between families).

## 3. Thresholds (recall-first)

| Target | Recall goal | Final threshold | CV threshold range | CV recall achieved |
|---|---|---|---|---|
| CAD | ≥ 0.90 | 0.557 | 0.51–0.65 | 0.889 |
| LAD | ≥ 0.80 | 0.621 | 0.53–0.63 | 0.819 |
| LCX | ≥ 0.80 | 0.338 | 0.31–0.38 | 0.787 |
| RCA | ≥ 0.80 | 0.319 | 0.30–0.35 | 0.769 |

Each threshold is set on training data. On unseen folds, recall lands close to the goal but
slightly below it for CAD, LCX and RCA, which is the honest behaviour expected on new patients. For
LCX and RCA, meeting a recall of about 0.8 costs many false alarms (specificity ≈ 0.55).
**The dashboard should therefore show the probability itself, not only a yes/no label.**
Thresholds are config values (`min_recall`) and can be changed without code changes.

## 4. Calibration
Platt scaling lowered the Brier score for every selected model (CAD 0.131 → 0.095,
LAD 0.173 → 0.155, LCX 0.207 → 0.205, RCA 0.207 → 0.200). After calibration the reliability
curves lie close to the diagonal (`phase2_calibration.png`). A displayed "70 %" therefore means
roughly 70 % of similar patients had the disease in cross-validation.

## 5. Vessels: independent models vs classifier chain
Chain order: LAD → LCX → RCA. Each link gets the earlier vessels' *predicted* probabilities
(out-of-fold on training data, never the true labels). We report the paired difference in AUC
(chain − independent) with a bootstrap 95% CI:

| Family | LCX | RCA |
|---|---|---|
| LogReg | +0.011 [−0.006, +0.026] | **−0.041** [−0.069, −0.014] |
| Random Forest | +0.003 [−0.015, +0.021] | +0.018 [−0.002, +0.039] |
| XGBoost | −0.034 [−0.069, +0.002] | **+0.026** [+0.002, +0.050] |
| CatBoost | −0.018 [−0.049, +0.015] | +0.015 [−0.022, +0.052] |

**Decision: independent models.** The chain gives no consistent benefit. For the selected models
it changes LCX by +0.003 (not significant) and makes RCA *worse* by 0.041 (significant). The one
significant gain (XGBoost RCA, +0.026) only lifts XGBoost to 0.723, which is still below the
independent LR's 0.731. Independent models are also simpler to explain, because each vessel's
SHAP values refer only to clinical features. The setting is `vessels.final_strategy` in
`models.yaml`.

## 6. What drives the predictions (mean |SHAP|, final models)
| Target | Top features |
|---|---|
| CAD | typical chest pain, regional wall-motion abnormality, age, T-wave inversion, diabetes, hypertension, triglycerides |
| LAD | typical chest pain, atypical chest pain (protective), wall-motion abnormality, low ejection fraction, age, ESR |
| LCX | age, typical chest pain, creatinine, platelets, triglycerides, fasting glucose |
| RCA | diabetes, typical chest pain, sex (male), age, neutrophil %, ESR, functional class |

These agree with known cardiology. SHAP values are in calibrated log-odds and add up exactly to
each patient's predicted probability: base + Σ contributions = logit(p). This is checked at
training time and in pytest. Beeswarm plots: `phase2_shap_<target>.png`.

## 7. Limitations (stated honestly in the UI and the docs)
- 303 patients from a single centre, with no external validation set. The CIs are wide, especially
  for LCX and RCA.
- The models predict *per-vessel stenosis status*, not lesion location or severity within a
  vessel. Region RWMA is a clinical feature, not an anatomical coordinate.
- The CAD and vessel models are trained separately, so a patient can receive a low CAD probability
  together with a moderate vessel probability. The UI should present them side by side, not as
  strictly consistent.
- One patient (row 93) has LAD stenosis but Cath = Normal. The label was kept as provided.

## 8. Saved artefacts
- `models/{cad,lad,lcx,rca}.joblib`: a `CardioModel` containing the preprocessing and classifier
  pipeline, Platt calibrator, threshold, tuned parameters and SHAP explainer. Load it with
  `cardioscope_ml.predictor.load_model(target)`, which provides `.predict_proba`, `.predict` and
  `.explain`.
- `models/metrics.json`: all CV metrics with CIs, the chain comparison, thresholds, global SHAP
  importance and package versions.
