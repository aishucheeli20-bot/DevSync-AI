# DevSync AI

DevSync AI is a full-stack change-impact prototype. It includes a React + Vite + TypeScript dashboard, a FastAPI API, and a seeded e-commerce repository graph with working sample modules in [sample-repository/src](./sample-repository/src). No GitHub credentials, API keys, or external services are needed.

The dashboard and demo repository remain public. Optional sign-up and login use a local SQLite user store, salted PBKDF2 password hashes, and an HttpOnly, seven-day session cookie. The SQLite database is created automatically at `backend\devsync.db`; set `DEVSYNC_DB_PATH` to move it. For HTTPS deployments, set `DEVSYNC_COOKIE_SECURE=true`.

## Requirements

- Node.js 20 or newer and npm
- Python 3.10 or newer

## Run on Windows

Open two PowerShell terminals in the project folder.

### Terminal 1 — backend

```powershell
cd C:\Users\ASUS\OneDrive\Desktop\DEVSYNC-AI\backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks environment activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal and activate again. Alternatively, skip activation and use `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` followed by `.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`.

### Terminal 2 — frontend

```powershell
cd C:\Users\ASUS\OneDrive\Desktop\DEVSYNC-AI
npm.cmd install
npm.cmd run dev
```

Open **http://localhost:5173**. The API docs are available at **http://localhost:8000/docs**.

## Run checks

With the backend virtual environment activated:

```powershell
cd C:\Users\ASUS\OneDrive\Desktop\DEVSYNC-AI\backend
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

In the project root:

```powershell
npm.cmd run build
```

## Demo API

- `GET /api/health` — service status
- `GET /api/repository` — sample repository files and relationships
- `GET /api/graph` — React Flow nodes and directed dependency edges
- `POST /api/analyze` — impact, risk score, explanation, and unit/integration/regression tests for a changed file (`{"file":"src/utils/calculateTotal.js"}`)
- `POST /api/auth/signup` — create an account and sign in
- `POST /api/auth/login` — create a session (invalid credentials return a generic message)
- `POST /api/auth/logout` — invalidate the current session and clear its cookie
- `GET /api/auth/me` — return the current user or JSON `null` when signed out

The analysis traverses the seeded dependent-file graph, distinguishes direct from indirect impact, and returns file-specific test plans.

The backend initializes its SQLite tables automatically; no separate database server, migration, or secret configuration is required for local development. Authentication uses only the Python standard library for password hashing and session tokens.

## Production deployment

Deploy the frontend static site and FastAPI backend as separate services (or use a same-origin reverse proxy):

- **Frontend build command:** `npm ci && npm run build`
- **Frontend publish directory:** `dist`
- **Frontend build environment:** `VITE_API_BASE_URL=https://api.example.com` (replace with the public HTTPS origin of your backend; Vite embeds this value at build time)
- **Backend install command:** `python -m pip install -r backend/requirements.txt`
- **Backend start command:** `python -m backend.main`
- **Backend environment:** the host-provided `PORT` is used automatically; set `DEVSYNC_CORS_ORIGINS=https://app.example.com` to the exact frontend origin (comma-separated for multiple trusted origins).
- **Persistent storage:** mount a writable persistent volume and set `DEVSYNC_DB_PATH` to an absolute database path on it, such as `/var/data/devsync.db`. Without a persistent volume, SQLite account data can be lost when an instance is replaced or restarted.
- **HTTPS sessions:** set `DEVSYNC_COOKIE_SECURE=true`. For separate sites where the browser must send cookies cross-site, also set `DEVSYNC_COOKIE_SAMESITE=none`; this requires Secure/HTTPS. Prefer frontend and API hostnames on the same site with the default `lax` cookie policy when available.

Do not configure credentialed CORS with `*`; list only trusted frontend origins. No local `.env`, SQLite file, password, token, or API key needs to be committed. Copy `.env.example` to `.env` only for local frontend configuration.
