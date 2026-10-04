# Phase 4: Backend API

FastAPI app in `backend/app/`. It loads the four saved `CardioModel`s once at startup and serves
them over HTTP. Interactive docs are at `/docs`.

```powershell
uvicorn app.main:app --app-dir backend --port 8000     # from the repo root, venv active
cd backend; python -m pytest -q; cd ..                 # 31 tests
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Status, loaded models, package versions |
| GET | `/schema` | Everything the UI needs to build the input form and the result views (below) |
| POST | `/predict` | `{patient}` → CAD and LAD/LCX/RCA calibrated probabilities, thresholds, flags, risk level |
| POST | `/explain` | `{patient, targets?, top_k?}` → SHAP contribution of every feature per target |
| GET | `/patients/sample` | Real patients from the dataset: `normal`, `single_vessel`, `multi_vessel` (`?kind=` filters) |

`/schema` contains:
- **Feature groups**, and for each feature:
  - label, unit, meaning, type, normal range and allowed input range
  - option labels (e.g. Female/Male, None/Mild/Moderate/Severe)
  - a default value (the training median or most common value)
  - a `derived` flag
- **Targets**, with each one's model family, decision threshold, recall goal and cross-validated AUC.
- **The vessel list** from `shared/vessels.json`.
- **Risk bands** (low < 0.33 ≤ moderate < 0.66 ≤ high), the same bands as the 3D legend.
- **The disclaimer.**

## Design decisions

- **The input model is generated from config.** At startup a Pydantic `PatientInput` is built
  from `features.yaml`:
  - numeric features get `ge`/`le` bounds from `valid_range`;
  - binary and ordinal features accept only their allowed codes;
  - categorical features accept only their categories.

  Adding a feature to the YAML adds it to the API, the docs and `/schema`, with no code change.
- **Leakage protection.** Unknown fields are rejected (`extra="forbid"`), so a client can never
  send `LAD`, `LCX`, `RCA` or `Cath` as inputs. The service also asserts that every loaded model's
  feature list is leakage-free.
- **Derived inputs are computed by the server.** Phase 1 showed that BMI = weight / height² and the
  dataset's "Obesity" flag = BMI ≥ 25 exactly. Both are marked `derived` in `features.yaml`,
  computed by `cardioscope_ml/derived.py`, and rejected if a client sends them. Inputs therefore
  can never contradict each other. The client sends 52 fields; the models see 54.
- **The response uses vessel IDs** from `shared/vessels.json` (`vessel_id: "LAD"`, ...), the same
  IDs the 3D view uses.
- **Explanations add up exactly.** Each target returns its base value, every contribution (in
  calibrated log-odds) and `log_odds`, with base + Σ contributions = logit(probability). With
  `top_k`, the remaining contributions are summed into `other_contribution`, so a waterfall chart
  still adds up. Each contribution also carries:
  - the patient's value and its display text (e.g. "Yes", "250 mg/dL");
  - the normal range;
  - a `low`/`normal`/`high` status, for the physiological panel.
- **Sample patients are honest.** For each kind, the service picks the real patient whose
  predictions best match their angiography labels. The choice is deterministic. These patients are
  in the training data, and the response says so (`"source": ... in-sample (optimistic)`).
- **Speed:** about 15–30 ms per `/predict` or `/explain` request on a laptop. That's well inside the
  ~1-second live-update budget for Phase 6.
- **Configuration (environment variables):**
  - `CARDIOSCOPE_CORS_ORIGINS`: comma-separated allowed origins (default: localhost 5173 and 4173).
  - `CARDIOSCOPE_MODELS_DIR`: where the models live (default `models/`).

## Example

```json
POST /predict
{"patient": {"age": 66, "sex": 1, "weight": 76, "height": 168, "dm": 1, "...": "..."}}

200 OK
{"cad": {"target_id": "cad", "probability": 0.99, "threshold": 0.557, "predicted_positive": true,
         "risk_level": "high", "model": "logreg", "label": "Coronary artery disease (overall)"},
 "vessels": [{"vessel_id": "LAD", "target_id": "lad", "probability": 0.96, ...},
             {"vessel_id": "LCX", ...}, {"vessel_id": "RCA", ...}],
 "derived_inputs": {"bmi": 26.9, "obesity": 1.0},
 "disclaimer": "For decision support and educational purposes only. ..."}
```

## Tests (`backend/tests/test_api.py`, 31)

| Area | What the tests check |
|---|---|
| `/health` | Status is ok and all four models are loaded |
| `/schema` | Content and groups; targets never offered as inputs; derived flags and option labels; schema defaults are themselves a valid patient |
| `/predict` | Output structure and ranges; flag = probability ≥ threshold; derived BMI; deterministic; responds to input changes; rejects out-of-range values, bad codes, unknown categories, missing fields, and target, derived or unknown fields |
| `/explain` | Contributions add up exactly to each target's predicted probability; `top_k` and target filter; value and normal-range status; unknown target rejected |
| `/patients/sample` | Three kinds with true labels and an in-sample note; samples pass through `/predict`; risk ordering normal < single < multi; filter by kind and 404 |
| CORS | The local frontend origin is allowed |
