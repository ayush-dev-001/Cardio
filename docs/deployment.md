# Deployment: Hugging Face Space (API) + Vercel (frontend)

The steps marked **(you)** need your accounts. Everything else is prepared in the repo.

## 1. Push the latest code to GitHub (you)
```powershell
git push origin main
```

## 2. API on Hugging Face Spaces (you, ~5 min)
1. Build the Space folder (from the repo root, venv active or using `.venv\Scripts\python`):
   ```powershell
   python deploy/build_hf_space.py
   ```
   This creates `deploy/hf-space/`: Dockerfile, README (Space config), code, configs, models and
   cleaned data, about 0.4 MB in total.
2. Go to https://huggingface.co/new-space:
   - **Owner:** your account. **Space name:** `cardioscope-api`.
   - **SDK:** Docker → *Blank*. **Hardware:** CPU basic (free). **Visibility:** Public.
3. In the new Space open **Files → Add file → Upload files**, then drag in **everything inside**
   `deploy/hf-space/`, keeping the folder structure. Commit.
4. The Space builds the container, which takes ~3–6 min the first time. When it says *Running*,
   open `https://<your-username>-cardioscope-api.hf.space/health`. It should return
   `{"status":"ok", ...}`.
5. Leave the Space page open. After step 3 you will add the frontend URL under
   **Settings → Variables and secrets**.

## 3. Frontend on Vercel (you, ~3 min)
1. Go to https://vercel.com/new and import the GitHub repo `ayush-dev-001/Cardio`.
2. Set **Root Directory** to `frontend`. The framework is detected as Vite, and `vercel.json`
   sets the build commands.
3. Keep **"Include files outside the Root Directory"** enabled (the default). The app imports the
   shared vessel IDs from `shared/vessels.json`.
4. Under **Environment Variables** add
   `VITE_API_URL` = `https://<your-username>-cardioscope-api.hf.space` (no trailing slash).
5. Click **Deploy**. Note the URL, e.g. `https://cardioscope.vercel.app`.

## 4. Connect them (you)
In the Hugging Face Space go to **Settings → Variables**:
- `CARDIOSCOPE_CORS_ORIGINS` = your Vercel URL, e.g. `https://cardioscope.vercel.app`
- Optional, to also allow Vercel preview deployments:
  `CARDIOSCOPE_CORS_ORIGIN_REGEX` = `https://cardioscope(-[a-z0-9-]+)?\.vercel\.app`

The Space restarts automatically. Open the Vercel URL: the header should show **API connected**.

## Updating later
- **Frontend:** every `git push` redeploys on Vercel automatically.
- **API:** after retraining or backend changes, re-run `python deploy/build_hf_space.py` and
  upload the changed files to the Space.

## Notes
- **The Space can sleep.** A free Space sleeps after ~48 h without visits. The dashboard then
  shows "Waking up the model server…" and keeps retrying for about a minute.
- **The container matches local:** Python 3.14, and package versions pinned in
  `requirements-api.txt` (the same as training), so the saved models load identically.
- **What was tested locally:** the bundle was run from a copy outside the repo, in a fresh
  virtual environment with only `requirements-api.txt` installed. All endpoints, identical
  predictions and CORS were verified. Docker itself is not installed on the dev machine, so the
  first real container build happens on Hugging Face.
