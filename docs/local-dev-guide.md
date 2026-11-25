# Local Development Guide

Run the full Micro-Frontend stack (host-app + topic-manager-mfe + content-writer-mfe)
locally using Docker. Three auth modes are supported — switch with two lines in `.env`.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Docker Desktop | 4.x+ | `docker --version` |
| Docker Compose | v2 (bundled with Desktop) | `docker compose version` |

No Node.js required locally — builds happen inside containers.

---

## First-time setup

**1. Clone and enter the repo**
```bash
git clone https://github.com/roysantu2002/micro-fe-micro-service.git
cd micro-fe-micro-service
```

**2. Create your `.env` file**
```bash
cp .env.example .env
```

Then open `.env` and choose an auth mode (see sections below).

---

## Auth Modes Overview

| Mode | `PUBLIC_DEV_SKIP_AUTH` | `PUBLIC_MOCK_AUTH` | Login screen? | Azure needed? |
|---|---|---|---|---|
| 1 — Skip auth | `true` | `false` | No | No |
| 2 — Mock login | `false` | `true` | Yes (in-app form) | No |
| 3 — Real Azure AD | `false` | `false` | Yes (Microsoft) | Yes |

> These are **build-time** flags — they are baked into the JS bundle by rsbuild.
> After changing `.env` you must always rebuild: `docker compose ... up --build`

---

## Mode 1 — Skip Auth (fastest)

No login screen. App loads directly. Navbar shows **"Dev Mode"**.
Best for: developing UI features, testing MFE components, quick iteration.

**`.env`**
```env
PUBLIC_DEV_SKIP_AUTH=true
PUBLIC_MOCK_AUTH=false
```

**Start**
```bash
docker compose -f docker-compose.local.yml up --build
```

**Open:** `http://localhost:3000`

The app renders immediately with no authentication step.

---

## Mode 2 — Mock Login (in-app, no Azure needed)

Shows a simple in-app login form — no redirect, no external server.
Enter any name, click Sign in, and the app loads as that user.
Best for: testing the auth guard / sign-in flow, without any Azure account.

> **Why not a real mock OIDC server?** MSAL browser v3 hardcodes HTTPS enforcement
> for authority URLs with no config override. Rather than adding TLS complexity,
> mock mode bypasses MSAL entirely and renders its own login form.

**`.env`**
```env
PUBLIC_DEV_SKIP_AUTH=false
PUBLIC_MOCK_AUTH=true
```

**Start**
```bash
docker compose -f docker-compose.local.yml up --build
```

**Running containers:**
| Container | Purpose | Port |
|---|---|---|
| `local-host-app` | nginx + React shell | `localhost:3000` |
| `local-topic-manager` | Topic Manager MFE | internal |
| `local-content-writer` | Content Writer MFE | internal |

**Sign in:**
1. Open `http://localhost:3000`
2. An in-app mock login form appears:
   ```
   🧪 Mock Sign-in
   ───────────────
   [ Your name (e.g. testuser) ]
   [        Sign in            ]
   ```
3. Type any name (e.g. `testuser`) and press **Enter** or click **Sign in**
4. App loads — navbar shows `🧪 testuser` with a **Sign out** button
5. Session is stored in `sessionStorage` — clears on tab close

**How it works:**
- When `PUBLIC_MOCK_AUTH=true`, `bootstrap.tsx` skips `MsalProvider` entirely
- `AuthGuard` renders a local React login form instead of `MsalAuthenticationTemplate`
- The username is stored in `sessionStorage` and read by the NavBar
- Sign out clears `sessionStorage` and reloads the page

---

## Mode 3 — Real Azure AD (Local + Azure)

Shows the real Microsoft login screen. Signs in with an actual Entra ID account.
Best for: testing real auth flows, verifying token claims, testing permissions.

### One-time Azure setup

Register `http://localhost:3000` as a redirect URI in your App Registration:

1. Go to **Azure Portal → Microsoft Entra ID → App registrations**
2. Open the app: `d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9`
3. Left menu → **Authentication**
4. Under **Single-page application** → **Add URI:**
   ```
   http://localhost:3000
   ```
5. Click **Save**

> This is a one-time step. The production URL stays registered too — you can have multiple redirect URIs.

### `.env`
```env
PUBLIC_DEV_SKIP_AUTH=false
PUBLIC_MOCK_AUTH=false

PUBLIC_ENTRA_CLIENT_ID=d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9
PUBLIC_ENTRA_TENANT_ID=7e626a1e-dd27-4d19-a481-834ea79cd15b
```

### Start
```bash
docker compose -f docker-compose.local.yml up --build
```

### Sign in
1. Open `http://localhost:3000` → redirects to `login.microsoftonline.com`
2. Sign in with any account in your Entra ID tenant
3. Redirected back to `http://localhost:3000` signed in

### Create a test user (optional)

1. **Azure Portal → Entra ID → Users → + New user → Create new user**
2. Username: `testuser@<yourtenant>.onmicrosoft.com`
3. Auto-generate password → copy it
4. First sign-in: Microsoft asks you to change the password

---

## Switching Between Modes

Edit `.env`, then rebuild. Only the host-app rebuilds (MFE containers are Docker-cached).

```bash
# Stop everything
docker compose -f docker-compose.local.yml down

# Edit .env, then restart
docker compose -f docker-compose.local.yml up --build
```

Rebuild after first build: ~30 seconds (npm install layer is cached).

---

## Architecture (Local)

```
Browser
  │
  │  http://localhost:3000
  ▼
┌──────────────────────────────────┐
│  local-host-app (nginx :80)      │
│                                  │
│  /           → React SPA         │
│  /mfe/topic-manager/* ───────────┼──► local-topic-manager (nginx :80)
│  /mfe/content-writer/* ──────────┼──► local-content-writer (nginx :80)
│  /health     → 200 OK            │
└──────────────────────────────────┘

Auth (browser-side, determined at build time):
  Mode 1 → skipped — renders app directly
  Mode 2 → in-app mock login form (no redirect, no external server)
  Mode 3 → https://login.microsoftonline.com/<tenant>  (real Azure AD)
```

**How Module Federation works locally:**
1. Browser loads `http://localhost:3000`
2. Auth check (skip / mock form / Azure redirect)
3. MF runtime fetches `http://localhost:3000/mfe/topic-manager/mf-manifest.json`
4. host-app nginx (`^~` prefix location) proxies to `http://topic-manager-mfe/mf-manifest.json` (Docker DNS)
5. Manifest lists chunks: `/mfe/topic-manager/static/js/xxx.js`
6. Browser fetches each chunk — nginx proxies to the topic-manager container

> The `^~` modifier on nginx proxy locations is critical — without it, the
> `.js` cache rule (a regex location) intercepts MFE chunk requests and returns 404.

---

## Cloud Deployment (Azure Container Apps)

The same code runs on Azure. Key differences from local:

| Concern | Local | Cloud |
|---|---|---|
| Auth | Skip / Mock / Real (env flag) | Always real Azure AD |
| MFE routing | nginx proxy to Docker containers | nginx proxy to Container App internal DNS |
| Images | Built locally by Docker Compose | Built by GitHub Actions, pushed to GHCR |
| Env vars | `.env` file | GitHub Actions Variables (not Secrets) |
| Auth mode | `PUBLIC_DEV_SKIP_AUTH` / `PUBLIC_MOCK_AUTH` | Both must be `false` |

**GitHub Actions Variables required:**
```
AZURE_CLIENT_ID         → from terraform output (CI/CD service principal)
AZURE_TENANT_ID         → 7e626a1e-dd27-4d19-a481-834ea79cd15b
AZURE_SUBSCRIPTION_ID   → ac91a2b4-4d65-4c8d-9e4f-db410eef92a0
PUBLIC_ENTRA_CLIENT_ID  → d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9
PUBLIC_ENTRA_TENANT_ID  → 7e626a1e-dd27-4d19-a481-834ea79cd15b
HOST_APP_URL            → https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io
```

**After every deploy**, verify the Container Apps are running the new GHCR image
(not the `nginx:1.27-alpine` placeholder). Check in Azure Portal → Container Apps
→ host-app → Containers → Image.

**Production redirect URI** registered in Entra ID App Registration (SPA type):
```
https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io
```

> If the host-app Container App URL ever changes (terraform destroy + apply creates
> a new random hostname), update this redirect URI or login will break with AADSTS50011.

---

## Common Issues

### App loads but MFE components show "Loading…" forever
MFE chunks are 404ing. Check the nginx proxy:
```bash
curl -I http://localhost:3000/mfe/topic-manager/mf-manifest.json
# Should return: HTTP/1.1 200 OK
curl -I http://localhost:3000/mfe/topic-manager/static/js/topicManager.*.js
# Should return: HTTP/1.1 200 OK
```
If the manifest is 200 but chunks are 404, the nginx `^~` modifier is missing on the
proxy locations in `frontend/host-app/nginx/nginx.conf`.

### `process is not defined` in browser console
The host-app injects a `window.process` polyfill via an inline `<script>` in `<head>`.
If you see this error, make sure you rebuilt with `--build` after the fix was applied.

### Mode 3: `AADSTS50011` redirect URI mismatch
`http://localhost:3000` is not registered as a SPA redirect URI.
See the one-time Azure setup in the Mode 3 section.

### Mode 3: `AADSTS9002326` cross-origin token redemption
The redirect URI was added under **Web** instead of **Single-page application**.
Remove it from Web and add it under SPA.

### Container shows `unhealthy` in `docker ps`
Normal for the first ~60 seconds — the healthcheck runs every 30s with a 10s start period.
Verify nginx is serving: `curl http://localhost:3000/health`

### Port 3000 already in use
```bash
lsof -i :3000
kill -9 <PID>
```

---

## Example `.env`

See `.env.example` in the repo root for a fully-commented template.
Minimum for local development:

```env
# Mode 1 — no login (default for local dev)
PUBLIC_DEV_SKIP_AUTH=true
PUBLIC_MOCK_AUTH=false

# Needed for Mode 3 (real Azure AD) only
PUBLIC_ENTRA_CLIENT_ID=d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9
PUBLIC_ENTRA_TENANT_ID=7e626a1e-dd27-4d19-a481-834ea79cd15b
```

---

## Key URLs

| Resource | URL |
|---|---|
| Local app | `http://localhost:3000` |
| Local health check | `http://localhost:3000/health` |
| Production app | `https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io` |
| App Registration | Azure Portal → Entra ID → App registrations → `d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9` |
| GHCR packages | `github.com/roysantu2002 → Packages` |

---

## Environment Variable Reference

| Variable | Values | Purpose |
|---|---|---|
| `PUBLIC_DEV_SKIP_AUTH` | `true` / `false` | Skip auth entirely — renders app without any login |
| `PUBLIC_MOCK_AUTH` | `true` / `false` | Show in-app mock login form (bypasses MSAL) |
| `PUBLIC_ENTRA_CLIENT_ID` | App Registration client ID | MSAL client ID (Mode 3 + production) |
| `PUBLIC_ENTRA_TENANT_ID` | Azure tenant ID | MSAL authority tenant (Mode 3 + production) |
| `PUBLIC_TOPIC_MANAGER_REMOTE` | Full URL to `mf-manifest.json` | MF remote entry — set by CI for production |
| `PUBLIC_CONTENT_WRITER_REMOTE` | Full URL to `mf-manifest.json` | MF remote entry — set by CI for production |
