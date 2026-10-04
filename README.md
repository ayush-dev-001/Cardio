# CardioScope

Interactive 3D cardiovascular risk visualisation — Multimodal AI Hackathon 2026, Track A.

CardioScope predicts overall coronary artery disease (CAD) and the stenosis status of the three
main coronary arteries (LAD, LCX, RCA) from routine clinical data, maps those probabilities onto an
interactive 3D heart, and explains each prediction with SHAP.

> ⚠️ **Clinical disclaimer:** predictions are for decision support / educational purposes only and
> are not a substitute for formal diagnostic imaging (e.g. coronary angiography).

## Status
Phases 1–5 complete: data findings in `docs/phase1_data_findings.md`, model results in
`docs/phase2_model_results.md`, 3D viewer in `docs/phase3_3d_anatomy.md`, API in
`docs/phase4_backend_api.md`, dashboard in `docs/phase5_dashboard.md`.

## Live demo
- Dashboard: _to be added after deployment (Vercel)_
- API docs: _to be added after deployment (Hugging Face Space)_ `/docs`

Deployment guide: `docs/deployment.md`.

## Setup (Windows, PowerShell)
Requires Python 3.10+ (developed on 3.14).

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -e ml                     # installs the cardioscope_ml package
python -m ipykernel install --user --name cardioscope --display-name "Python (cardioscope)"
```

macOS / Linux: `python3 -m venv .venv && source .venv/bin/activate`, then the same `pip` lines.

## Common commands
```powershell
python -m cardioscope_ml.data         # raw Excel -> data/processed/cardioscope_clean.csv
python -m cardioscope_ml.train        # nested CV + final models -> models/, reports/figures/ (~8 min)
python -m cardioscope_ml.train --fast # quick smoke test (~1 min) -> models/_fast/
cd ml; python -m pytest -q; cd ..     # config, data and leakage tests
jupyter lab notebooks/01_exploration.ipynb
```

Backend API (from the repo root; with the venv active, or replace `python` with `.venv\Scripts\python`):
```powershell
python -m uvicorn app.main:app --app-dir backend --port 8000   # docs at http://localhost:8000/docs
cd backend; python -m pytest -q; cd ..               # API tests
```

Frontend (Node 20+; developed on Node 24):
```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173 (dashboard; start the backend API first)
npm test           # Vitest unit tests
npm run build      # type-check + production build -> frontend/dist
```

## Layout
```
data/raw/            original dataset (read-only)
data/processed/      cleaned data (generated)
notebooks/           exploration notebooks
ml/cardioscope_ml/   pipeline code
ml/configs/          features.yaml (feature dictionary), targets.yaml
ml/tests/            pytest suite (incl. target-leakage checks)
models/              trained models + SHAP explainers (Phase 2)
reports/figures/     plots
backend/app/         FastAPI app (Phase 4)
frontend/            React + Three Fiber app (Phases 3, 5)
shared/vessels.json  vessel IDs shared by backend and frontend
assets/3d/           anatomy meshes
docs/                problem statement and documentation
```

## Data
Extension of Z-Alizadeh Sani dataset, UCI Machine Learning Repository (303 patients).
