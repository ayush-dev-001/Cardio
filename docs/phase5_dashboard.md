# Phase 5: Clinical dashboard

React dashboard in `frontend/src/`, connected to the Phase 4 API (`VITE_API_URL`, default
`http://localhost:8000`).

## Layout
| Screen width | Layout |
|---|---|
| ≥ 1280 px | Three columns: **patient form** · **3D heart** · **results** |
| 1024–1279 px | Form on the left; 3D view above the results on the right |
| < 1024 px (phones, tablets) | One column: 3D view, results, form |

The clinical disclaimer banner sits permanently under the header and cannot be dismissed.

## Components
| Component | What it shows |
|---|---|
| `PatientForm` | Generated entirely from `/schema`, as collapsible sections per feature group, with these field types: number inputs with unit, allowed range and normal range (out-of-normal values flagged ▲/▼); Yes/No (or Female/Male) toggles; dropdowns for ordinal and categorical features; derived values (BMI, obesity flag) shown read-only from the server. One-click real example patients (normal, single-vessel, multi-vessel), labelled as in-sample training records. Client-side validation mirrors the API limits. *Predict* stays disabled while any field is invalid, and an "inputs changed" note appears until the next prediction. |
| `CadStatusCard` | CAD probability, risk chip (icon + label), verdict relative to the recall-tuned threshold, probability track with a threshold tick, and the model's cross-validated AUC with 95% CI |
| `VesselBars` | LAD/LCX/RCA probability tracks in the same colour scale as the 3D view, with a threshold tick; clicking one selects the vessel |
| `ShapWaterfall` | The selected target's path from the average patient to this patient: top 10 factors plus "N other features" |
| `PhysiologyPanel` | Every input: value, a ▲High/▼Low/✓Normal chip, and a marker on a normal-range bar, beside its SHAP contribution to the selected target (same red/blue scale). Sortable by impact or by group. |
| `VesselInfo` | Opened by clicking an artery in 3D (or its bar): probability vs threshold, model, top factors raising and lowering risk, what the artery supplies, and a link to the full explanation |

**Waterfall details.** Bars are drawn in log-odds, where SHAP values add up exactly. The axis is
labelled in probability, with one decimal near the extremes (e.g. 99.9%). Red = raises risk,
blue = lowers it. Hovering a bar shows its probability before → after.

Selecting a vessel anywhere syncs the 3D camera, the detail card and the explained target.
Charts are colour-checked (see below) and never rely on colour alone: they also use arrows, text
labels and bar direction.

## Chart colour checks
The red/blue diverging pair (`#e34948` / `#2a78d6`) was run through the palette validator against
the dark panel surface `#0f172a`. Every check passed: lightness, colourfulness, colour-blind
separation ΔE 21.6, normal-vision separation ΔE 32.3, and contrast ≥ 3:1. Probability bars reuse
the 3D risk scale, so the 2D and 3D views always agree.

## Error handling
If the API can't be reached, the dashboard shows:
- an "API offline" indicator and an error banner with **Retry**;
- the 3D view on demo sliders.

Errors returned by the API (e.g. a 422 validation error) appear in the banner.

## Tests
`npm test` runs 23 Vitest tests.

| Area | What the tests check |
|---|---|
| Form | Defaults exclude derived fields; values parse to typed API payloads; required, number, range and option errors; normal-range flags; range text formatting |
| Waterfall | Steps start at the base value and end exactly at the patient's log-odds; "other" folding; ordering by size; axis ticks are round, labelled, unique and include extreme probabilities |
| Range bars | Marker and normal-band geometry, including open-ended ranges |
| Phase 3 | The anatomy and 3D tests still pass |

Manual browser checks against the running API covered:
- offline mode and Retry;
- loading each example patient;
- validation, and the stale-inputs indicator;
- prediction updates after edits;
- the waterfall and the Physiology tab;
- the vessel detail panel and camera focus;
- 1024 px and phone layouts, with no horizontal overflow.
