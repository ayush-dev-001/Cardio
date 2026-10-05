# CardioScope

Interactive 3D cardiovascular risk visualisation — Multimodal AI Hackathon 2026, Track A.

CardioScope predicts overall coronary artery disease (CAD) and the stenosis status of the three
main coronary arteries (LAD, LCX, RCA) from routine clinical data, maps those probabilities onto an
interactive 3D heart, and explains each prediction with SHAP.

> ⚠️ **Clinical disclaimer:** predictions are for decision support / educational purposes only and
> are not a substitute for formal diagnostic imaging (e.g. coronary angiography).

## Live demo
- **App:** https://frontend-psi-one-41.vercel.app (dashboard at `/app`)
- **API:** https://cardioscope-api.onrender.com (`/health`, `/docs` for the interactive API reference)

The API runs on Render's free plan and sleeps after 15 minutes without requests; the first visit
after that takes ~30–60 s while the dashboard shows "Waking up the model server…".

## Status
Phases 1–6 complete (Phase 6: live what-if updates, one-click sample patients, deployed online): data findings in `docs/phase1_data_findings.md`, model results in
`docs/phase2_model_results.md`, 3D viewer in `docs/phase3_3d_anatomy.md`, API in
`docs/phase4_backend_api.md`, dashboard in `docs/phase5_dashboard.md`.

## Deployment
Run locally with the commands below. The live demo runs the API on Render and the frontend on
Vercel; `docs/deployment.md` shows how to deploy your own copy.

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

## 3D asset credits
- Heart: adapted from ["Cardiac Anatomy: Coronary arteries of the heart"](https://sketchfab.com/3d-models/cardiac-anatomy-coronary-arteries-of-the-heart-00b5f4ec0b984325b453f8df07cd0cb5)
  by Hannah Newey, [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The adapted
  `heart.glb` is shared under the same licence (non-commercial).
- Torso: adapted from ["Low Poly Male Body Base"](https://sketchfab.com/3d-models/c6c3dd15792c4b768f087f0831ad249d)
  by Mesh-Base, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Details and rebuild steps: `assets/3d/CREDITS.md`.
