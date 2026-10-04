# Phase 1 — Data findings

Source: `data/raw/extention of Z-Alizadeh sani   dataset.xlsx` (sheet `Sheet 1 - Table 1`).
Full analysis: `notebooks/01_exploration.ipynb`. Figures: `reports/figures/phase1_*.png`.

## 1. Shape and quality
- **303 patients × 59 columns**: 55 input features + 4 targets (`Cath`, `LAD`, `LCX`, `RCA`).
- **No missing values, no duplicate rows.** The workbook's second sheet (`Sheet1`) is empty.
- After cleaning: **54 model features** (21 numeric, 29 binary, 3 ordinal, 1 categorical).
  `Exertional CP` is dropped because it is "N" for every patient.

## 2. Encoding quirks (all handled in `ml/configs/features.yaml`)
| Issue | Handling |
|---|---|
| Binary flags use both `0/1` and `Y/N` | mapped to 0/1 |
| `Sex` = `Male` / `Fmale` (typo) | `sex`: 1 = male, 0 = female |
| `VHD` = N / mild / Moderate / Severe | ordinal 0–3 |
| `BBB` = N / LBBB / RBBB | kept categorical; one-hot inside CV folds (Phase 2) |
| `Length` is height in cm | renamed `height` |
| Targets `Stenotic`/`Normal`, `CAD`/`Normal` | 1 / 0 |

Cleaning is a fixed mapping with no fitted steps, so it cannot leak information between CV folds. The
script fails loudly if an unexpected value appears.

## 3. Outliers
1.5×IQR outliers exist in most lab values (e.g. TG up to 1050 mg/dL, FBS up to 400 mg/dL, PLT down
to 25 ×10³/µL, WBC up to 18 000/µL). All are **clinically possible** and inside the plausibility
bounds (`valid_range`). They are real patients, so **none were removed**. Many patients are outside
normal ranges: e.g. EF < 55 % in 65 %, BMI ≥ 25 in 71 %, BP > 120 mmHg in 60 %. That is expected for
a cohort referred for angiography.

## 4. Class balance
| Target | Positive | Negative | % positive |
|---|---|---|---|
| CAD (Cath) | 216 | 87 | 71.3 % |
| LAD | 177 | 126 | 58.4 % |
| LCX | 119 | 184 | 39.3 % |
| RCA | 114 | 189 | 37.6 % |

CAD is imbalanced toward disease (≈ 2.5 : 1). The vessels are moderately balanced. Stratified CV plus
ROC-AUC/F1/recall (not accuracy alone) will be used in Phase 2.

## 5. Overall CAD vs. vessel labels
- **CAD = "at least one stenotic vessel" for 302 of 303 patients.**
- **One exception, row 93** (65-year-old male, typical chest pain): LAD = Stenotic but Cath = Normal.
  This is probably a labelling inconsistency or a borderline (< 50 %) LAD lesion. We **keep the labels
  as given** and document it. We do not relabel ground truth.
- Disease extent among CAD patients: 1 vessel 86, 2 vessels 67, 3 vessels 63.
- LAD is the most often affected vessel (81.5 % of CAD patients; LCX 55 %, RCA 53 %).
- Vessel labels are positively correlated (phi 0.28–0.39), so multi-vessel disease is common. This
  motivates trying a **classifier chain** against independent per-vessel models in Phase 2.
- Implication: overall CAD is almost the logical OR of the three vessels. The app should show the
  vessel probabilities and the CAD probability side by side. A low CAD probability with a high vessel
  probability is possible from separate models, and the docs should explain this.

## 6. Redundant / derived / rare features
- `BMI` = Weight / Height² exactly. `Obesity` = (BMI ≥ 25) in all 303 rows, which matches the
  "overweight" threshold despite its name. Both are fully derived from other columns.
- `Neut` and `Lymph` are strongly anti-correlated (ρ = −0.91), because they are percentages of the same
  white-cell count.
- Chest-pain type is mutually exclusive: typical 164, atypical 93, non-anginal 16, none 30.
- Current smoker and ex-smoker never overlap.
- **Very rare features** (minority class < 15 patients): CHF (1), LowTH Ang (2), CVA (5), Weak
  Peripheral Pulse (5), CRF (6), Thyroid (7), BBB (8 RBBB / 13 LBBB), Diastolic Murmur (9), Poor R
  Progression (9), Ex-smoker (10), Lung rales (11), Airway disease (11), Edema (12), ST Elevation (14),
  and `Function Class` = 1 (one patient). These carry little signal and can make models unstable. We
  keep them in the dictionary; Phase 2 will test regularisation and in-fold feature selection rather
  than dropping them by hand.

## 7. Which features relate to which target (descriptive only)
Univariate ROC-AUC (0.5 = no signal; below 0.5 = lower value means more risk). **This was not used
for feature selection**, which happens inside CV in Phase 2.

| Target | Strongest single features |
|---|---|
| CAD | Typical chest pain (0.80), Age (0.72), Atypical pain (0.29 → protective), EF (0.31 → low EF = risk), Region RWMA (0.67), BP (0.66), HTN (0.66) |
| LAD | Typical chest pain (0.73), EF (0.29), Age (0.68), Region RWMA (0.68), ESR (0.62) |
| LCX | Age (0.68), Typical chest pain (0.65), BP (0.62), PLT (0.40), FBS (0.59), TG (0.59) |
| RCA | Typical chest pain (0.65), Neutrophil % (0.64), Age (0.63), DM (0.63), ESR (0.61) |

Takeaways:
- **CAD and LAD are the easiest targets.** Chest-pain type, age, low EF and wall-motion abnormality
  carry clear signal.
- **LCX and RCA signals are weak**: no single feature exceeds AUC ≈ 0.68. Expect lower vessel-level
  performance there, and say so honestly.
- EF and Region RWMA relate more to LAD than to LCX/RCA. This fits the LAD supplying a large part of
  the left ventricle. These remain *clinical features*: RWMA codes in this dataset are **not** mapped
  to anatomical locations.

## 8. Decisions carried into Phase 2
1. Model inputs = the 54 features with `use_in_model != false` in `features.yaml`. The leakage guard
   (`assert_no_leakage` + pytest) blocks `Cath`/`LAD`/`LCX`/`RCA`.
2. One-hot (BBB), scaling and any feature selection are fit **inside** CV folds only.
3. Use stratified repeated CV, and report AUC, recall, precision and F1 with CIs. Accuracy alone is
   misleading at 71 % CAD prevalence.
4. Keep the row-93 label exception and all outliers. Revisit only with justification.
5. Compare independent vessel classifiers with a classifier chain (vessels are correlated).
