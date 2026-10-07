# Phase 2: Model results

Produced by `python -m cardioscope_ml.train` (about 5 min on 16 cores under Linux/WSL; seed 42; two
runs give identical results). All numbers come from `models/metrics.json`, and figures are in
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
| References | A **clinical baseline** (LR on 10 bedside items) and a **pre-specified ensemble** of all four families, both evaluated on the same outer splits (sections 5–6), plus **decision-curve analysis** (section 7). |
| Final model | For each target, the family with the best CV ROC-AUC is retuned on all 303 patients by the *same* procedure (search → refit → Platt → threshold) and saved. |

Model families: Logistic Regression (elastic-net), Random Forest, XGBoost and CatBoost.
*Note:* Windows Smart App Control on the development machine blocks scikit-learn's native modules
and the `shap` package, so training runs under Linux (WSL; the deployed API also runs on Linux).
Random Forest is built as XGBoost's random-forest mode: one round of 300 bagged, random-subspace
trees with learning rate 1, which is a standard random forest. SHAP values are computed with the
exact TreeSHAP built into XGBoost and CatBoost, and with exact linear SHAP for LR
(`ml/cardioscope_ml/explain.py`).

## 2. Results: selected model per target (nested CV, mean [95% CI])

| Target | Model | ROC-AUC | Recall | Precision | Specificity | F1 | Accuracy | Brier |
|---|---|---|---|---|---|---|---|---|
| **CAD** | Logistic Regression | **0.929** [0.899–0.955] | 0.889 [0.849–0.928] | 0.923 [0.888–0.955] | 0.816 [0.73–0.88] | 0.906 [0.876–0.933] | 0.868 [0.831–0.903] | 0.095 |
| **LAD** | Random Forest | **0.842** [0.796–0.884] | 0.798 [0.746–0.851] | 0.805 [0.745–0.860] | 0.728 [0.65–0.80] | 0.801 [0.756–0.840] | 0.769 [0.725–0.810] | 0.157 |
| **LCX** | Random Forest | **0.729** [0.674–0.782] | 0.773 [0.702–0.836] | 0.532 [0.460–0.604] | 0.560 [0.50–0.62] | 0.630 [0.565–0.690] | 0.644 [0.597–0.691] | 0.204 |
| **RCA** | Logistic Regression | **0.731** [0.677–0.783] | 0.769 [0.699–0.835] | 0.515 [0.437–0.591] | 0.563 [0.50–0.63] | 0.617 [0.551–0.676] | 0.640 [0.590–0.688] | 0.200 |

ROC-AUC of all families (the full table with every metric is in `metrics.json`):

| Target | LogReg | Random Forest | XGBoost | CatBoost |
|---|---|---|---|---|
| CAD | **0.929** | 0.916 | 0.915 | 0.919 |
| LAD | 0.834 | **0.842** | 0.836 | 0.841 |
| LCX | 0.705 | **0.729** | 0.728 | 0.726 |
| RCA | **0.731** | 0.720 | 0.711 | 0.683 |

How to read this:
- **Overall CAD is predicted well** (AUC 0.93). **LAD is good** (0.84). **LCX and RCA are only
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
| LAD | ≥ 0.80 | 0.615 | 0.54–0.62 | 0.798 |
| LCX | ≥ 0.80 | 0.352 | 0.30–0.36 | 0.773 |
| RCA | ≥ 0.80 | 0.319 | 0.30–0.35 | 0.769 |

Each threshold is set on training data. On unseen folds, recall lands close to the goal but
slightly below it, which is the honest behaviour expected on new patients. For LCX and RCA,
meeting a recall of about 0.8 costs many false alarms (specificity ≈ 0.56).
**The dashboard therefore shows the probability itself, not only a yes/no label.**
Thresholds are config values (`min_recall`) and can be changed without code changes.

## 4. Calibration
Platt scaling lowered the Brier score for every selected model (CAD 0.131 → 0.095,
LAD 0.173 → 0.157, LCX 0.207 → 0.204, RCA 0.207 → 0.200). After calibration the reliability
curves lie close to the diagonal (`phase2_calibration.png`). A displayed "70 %" therefore means
roughly 70 % of similar patients had the disease in cross-validation.

*Solver fix (2026-10-07):* the Platt fit uses Newton's method. Without a line search it could
diverge when the input scores are very spread out (e.g. an ensemble or a chain link), giving a
nonsensical calibrator on that fold. We added a backtracking line search (Lin, Lin & Weng 2007)
and a regression test. Where the old solver converged, results are identical: CAD and RCA reproduce
the earlier numbers exactly, and LAD and LCX (random forests) differ only slightly, because
training moved from Windows to Linux (section 10). Some chain and RCA/CatBoost comparison numbers
did change (section 8).

## 5. Does the model beat a simple bedside assessment?
The **clinical baseline** is a logistic regression on 10 items a clinician knows at the bedside:
age, sex, chest-pain type (typical / atypical / non-anginal), diabetes, hypertension, current
smoking, family history and dyslipidaemia. It goes through the identical nested CV. Below: paired
AUC gain of the selected model over the baseline (bootstrap 95% CI).

| Target | Baseline AUC | Selected AUC | Gain [95% CI] | Reading |
|---|---|---|---|---|
| CAD | 0.909 | 0.929 | +0.020 [−0.001, +0.043] | small gain, borderline |
| LAD | 0.777 | 0.842 | **+0.064 [+0.031, +0.102]** | clear gain |
| LCX | 0.738 | 0.729 | −0.010 [−0.052, +0.033] | no gain |
| RCA | 0.738 | 0.731 | −0.006 [−0.045, +0.028] | no gain |

**The full ECG, lab and echo data add most for LAD**, through wall-motion abnormality and ejection
fraction, which reflect the large territory LAD supplies. For overall CAD, chest-pain type and risk
factors already carry most of the signal. For LCX and RCA, the extra measurements add nothing
detectable: their (moderate) signal comes from the same basic risk factors. We keep the selected
models (they are pre-specified by the selection rule, and their SHAP explanations show the full
physiological picture), but we report this honestly.

## 6. Ensemble
A pre-specified ensemble averages the calibrated log-odds of all four families, then re-calibrates
and re-thresholds on each outer-training part. The members were fixed in advance, not chosen from
the results. Paired AUC difference vs the selected model:

| Target | Ensemble AUC | Difference [95% CI] |
|---|---|---|
| CAD | 0.929 | −0.000 [−0.011, +0.012] |
| LAD | 0.849 | +0.008 [−0.001, +0.017] |
| LCX | 0.739 | +0.010 [−0.003, +0.023] |
| RCA | 0.728 | −0.004 [−0.025, +0.019] |

No difference is significant, so the ensemble is not deployed: four models would cost four times
the computation and make the explanations harder to read, for no measurable gain.

## 7. Decision-curve analysis
Net benefit (Vickers & Elkin 2006) asks: if a clinician acted on the model at a given risk
threshold, would that do more good than treating everyone or no one? `phase2_decision_curves.png`
plots it from the out-of-fold predictions.

| Target | Model beats "treat all" and "treat none" for thresholds |
|---|---|
| CAD | 5 % – 70 % (the whole range tested) |
| LAD | 8 % – 70 % |
| LCX | 5 % – 61 % |
| RCA | 5 % – 70 % |

All four models are clinically useful across the range where a referral decision would plausibly
be made. For CAD and LAD the gain over "treat all" is large; for LCX and RCA it is smaller, matching
their moderate AUC. The clinical baseline's curve is close to the selected model's except for LAD,
where the full model is clearly better at thresholds above 30 % (consistent with section 5).

## 8. Vessels: independent models vs classifier chain
Chain order: LAD → LCX → RCA. Each link gets the earlier vessels' *predicted* probabilities
(out-of-fold on training data, never the true labels). We report the paired difference in AUC
(chain − independent) with a bootstrap 95% CI:

| Family | LCX | RCA |
|---|---|---|
| LogReg | +0.011 [−0.006, +0.026] | −0.010 [−0.026, +0.004] |
| Random Forest | −0.003 [−0.023, +0.015] | +0.010 [−0.010, +0.031] |
| XGBoost | +0.012 [−0.007, +0.029] | +0.008 [−0.011, +0.026] |
| CatBoost | +0.011 [−0.007, +0.030] | +0.017 [−0.005, +0.038] |

**Decision: independent models.** No family shows a significant gain from the chain, and for the
selected models the changes are −0.003 (LCX) and −0.010 (RCA). Independent models are also
simpler to explain, because each vessel's SHAP values refer only to clinical features. (An earlier
run reported a significant −0.041 for the LogReg RCA chain; that was partly the Platt solver issue
in section 4.) The setting is `vessels.final_strategy` in `models.yaml`.

## 9. What drives the predictions (mean |SHAP|, final models)
| Target | Top features |
|---|---|
| CAD | typical chest pain, regional wall-motion abnormality, age, T-wave inversion, diabetes, hypertension, triglycerides |
| LAD | typical chest pain, wall-motion abnormality, low ejection fraction, age, atypical chest pain (protective), ESR, neutrophil % |
| LCX | age, typical chest pain, creatinine, platelets, triglycerides, fasting glucose |
| RCA | diabetes, typical chest pain, sex (male), age, neutrophil %, ESR, functional class |

These agree with known cardiology. SHAP values are in calibrated log-odds and add up exactly to
each patient's predicted probability: base + Σ contributions = logit(p). This is checked at
training time and in pytest. Beeswarm plots: `phase2_shap_<target>.png`.

## 10. Limitations (stated honestly in the UI and the docs)
- 303 patients from a single centre, with no external validation set. The CIs are wide, especially
  for LCX and RCA.
- For LCX and RCA the full feature set does not beat a 10-item bedside baseline (section 5).
- The models predict *per-vessel stenosis status*, not lesion location or severity within a
  vessel. Region RWMA is a clinical feature, not an anatomical coordinate.
- The CAD and vessel models are trained separately, so a patient can receive a low CAD probability
  together with a moderate vessel probability. The UI presents them side by side, not as strictly
  consistent.
- One patient (row 93) has LAD stenosis but Cath = Normal. The label was kept as provided.
- Tree models give very slightly different results on different operating systems (LAD AUC 0.848
  on Windows vs 0.842 on Linux); the shipped models and numbers are the Linux ones, matching the
  deployed API.

## 11. Saved artefacts
- `models/{cad,lad,lcx,rca}.joblib`: a `CardioModel` containing the preprocessing and classifier
  pipeline, Platt calibrator, threshold, tuned parameters and SHAP explainer. Load it with
  `cardioscope_ml.predictor.load_model(target)`, which provides `.predict_proba`, `.predict` and
  `.explain`.
- `models/metrics.json`: all CV metrics with CIs, the baseline and ensemble comparisons, decision
  curves, the chain comparison, thresholds, global SHAP importance and package versions.
