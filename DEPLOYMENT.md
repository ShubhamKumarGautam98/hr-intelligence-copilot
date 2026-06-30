# Deploying HR Intelligence Copilot

This bundle packages the backend and frontend as a single Docker service —
FastAPI serves the built React app directly, so there's one URL, no CORS
headaches in production, and one place to deploy.

## What's in this folder

```
deployment/
├── Dockerfile              ← multi-stage build: Node builds the frontend, Python runs it
├── .dockerignore
├── main.py                 ← replaces your root main.py — serves the built frontend
├── requirements.txt
├── render.yaml              ← Render Blueprint config
├── railway.json              ← Railway build config
└── app/
    ├── core/
    │   ├── database.py      ← patched: storage path now configurable via DATA_DIR
    │   └── rag_engine.py    ← patched: ChromaDB path now configurable via DATA_DIR
    └── api/
        ├── documents.py     ← patched: upload path now configurable via DATA_DIR
        └── chat.py
```

## Step 1 — Merge these files into your project

Copy everything in this `deployment/` folder into your project root,
overwriting `main.py`, `app/core/database.py`, `app/core/rag_engine.py`,
and `app/api/documents.py` / `chat.py`. Your `frontend/` folder stays
exactly where it already is.

Your final structure should look like:

```
hr-intelligence-copilot/
├── main.py
├── Dockerfile
├── .dockerignore
├── requirements.txt
├── render.yaml
├── railway.json
├── app/
│   ├── core/
│   │   ├── database.py
│   │   └── rag_engine.py
│   └── api/
│       ├── documents.py
│       └── chat.py
└── frontend/
    ├── package.json
    ├── src/
    └── ...
```

## Step 2 — Why `DATA_DIR` matters

The three patched files (`database.py`, `rag_engine.py`, `documents.py`)
now read a `DATA_DIR` environment variable to decide where to write the
SQLite database, the ChromaDB index, and uploaded files. Locally this
defaults to the current directory, so nothing changes for you. In
production it points at a persistent disk — **this is the difference
between your data surviving a redeploy and being wiped every time you
push a change.** Free-tier hosts use ephemeral filesystems by default.

## Step 3 — Get a GROQ_API_KEY ready

You'll set this as an environment variable in the host's dashboard — never
commit it to a `.env` file inside this repo.

---

## Option A — Deploy to Render

1. Push this project to a GitHub repository.
2. In the Render dashboard: **New → Blueprint**, and point it at your repo.
   Render reads `render.yaml` automatically and provisions the service
   with a 1GB persistent disk mounted at `/app/data`.
3. When prompted, paste your `GROQ_API_KEY` into the environment variable field.
4. Deploy. First build takes 5–10 minutes (downloading the embedding model
   and ML dependencies). Subsequent deploys are faster thanks to Docker
   layer caching.
5. Your app is live at `https://<your-service-name>.onrender.com`.

**Free tier note:** Render's free web services spin down after 15 minutes
of inactivity and take ~30–60 seconds to wake on the next request. This is
expected — not a bug in your app.

---

## Option B — Deploy to Railway

1. Push this project to a GitHub repository.
2. In the Railway dashboard: **New Project → Deploy from GitHub repo**.
   Railway detects the `Dockerfile` automatically.
3. Go to your service's **Variables** tab and add:
   - `GROQ_API_KEY` = your key
   - `DATA_DIR` = `/app/data`
4. Go to the **Settings → Volumes** tab and attach a volume mounted at
   `/app/data`. Without this step your data will not persist across deploys.
5. Deploy. Railway assigns a public URL automatically under **Settings → Networking**.

---

## Verifying the deployment

Once live, check these in order:

1. `https://your-app-url/health` → should return `{"status": "healthy"}`
2. The root URL should load the React app, not a JSON response.
3. Upload a document through the Knowledge base panel.
4. Ask a question in Chat and confirm you get a cited answer back.

If step 2 shows the fallback JSON message instead of the app, it means the
frontend `dist/` folder wasn't found at build time — check that
`frontend/package.json` and `frontend/src/` were committed to your repo.

## Local development is unaffected

Running `uvicorn main:app --reload` and `npm run dev` separately on your
machine continues to work exactly as before — `DATA_DIR` simply falls back
to the current directory when unset, and the Vite dev server's proxy still
routes `/api` calls to `localhost:8000`.
