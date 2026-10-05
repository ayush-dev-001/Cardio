# Deployment: Render (API) + Vercel (frontend)

Both are free and deploy straight from the GitHub repo `ayush-dev-001/Cardio`.
The API cannot run on Vercel: its Python functions are limited to ~250 MB, and the model stack
(XGBoost, CatBoost, scikit-learn, SciPy, pandas) is well above that. Hugging Face Docker Spaces
now need a paid plan.

## 1. API on Render (~10 min, first build)
1. Sign in at https://render.com with GitHub.
2. **New → Blueprint**, pick the `Cardio` repo. Render reads `render.yaml`: one free Docker web
   service, `cardioscope-api`, built from `deploy/Dockerfile`.
3. It asks for `CARDIOSCOPE_CORS_ORIGINS`. Leave it empty for now (filled in step 3) and click
   **Apply**.
4. The first build takes ~5–10 min. When the service shows **Live**, open
   `https://cardioscope-api.onrender.com/health` (use the URL shown on the service page). It should
   return `{"status":"ok", ...}`.

## 2. Frontend on Vercel (~3 min)
1. https://vercel.com/new → sign in with GitHub → import `Cardio`.
2. **Root Directory:** `frontend`. The framework is detected as Vite; `vercel.json` sets the build.
   Keep "Include files outside the Root Directory" enabled (the default): the app imports
   `shared/vessels.json` and `models/metrics.json`.
3. **Environment Variables:** `VITE_API_URL` = the Render URL, e.g.
   `https://cardioscope-api.onrender.com` (no trailing slash).
4. **Deploy**, then copy the site URL, e.g. `https://cardio.vercel.app`.

## 3. Connect them
Render → `cardioscope-api` → **Environment** → set `CARDIOSCOPE_CORS_ORIGINS` to the Vercel URL
(no trailing slash) → **Save, rebuild and deploy**. `render.yaml` already allows Vercel preview
URLs (`https://cardio*.vercel.app`) through `CARDIOSCOPE_CORS_ORIGIN_REGEX`.

Open the Vercel URL → `/app`: the header shows a green dot and **Model online**.

## Updating later
- Every `git push` to `main` redeploys both the frontend (Vercel) and the API (Render).

## Notes
- **The free API sleeps after 15 min without requests.** The next visit wakes it in ~30–60 s;
  the dashboard shows "Waking up the model server…" and retries for up to two minutes. Open the
  site once before a demo.
- **The container matches local:** Python 3.14 and the versions pinned in `requirements-api.txt`
  (the same as training), so the saved models load identically.
- `deploy/build_hf_space.py` still builds a Hugging Face Space bundle, for use with a paid plan.
