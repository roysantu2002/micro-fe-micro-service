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
cp .env.example .env   # if .env.example exists, otherwise create .env manually
```

Minimum required content in `.env`:
```env
# Azure Entra ID — only needed for Mode 3 (real Azure AD login)
PUBLIC_ENTRA_CLIENT_ID=d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9
PUBLIC_ENTRA_TENANT_ID=7e626a1e-dd27-4d19-a481-834ea79cd15b

# Auth mode — see sections below
PUBLIC_DEV_SKIP_AUTH=true
PUBLIC_MOCK_AUTH=false
```

---

## Auth Modes Overview

| Mode | `PUBLIC_DEV_SKIP_AUTH` | `PUBLIC_MOCK_AUTH` | Login screen? | Azure needed? |
|---|---|---|---|---|
| 1 — Skip auth | `true` | `false` | No | No |
| 2 — Mock login | `false` | `true` | Yes (fake) | No |
| 3 — Real Azure AD | `false` | `false` | Yes (Microsoft) | Yes |

**After changing `.env` always rebuild:**
```bash
docker compose -f docker-compose.local.yml [--profile mock] up --build
```

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

The app renders immediately with no authentication step. The `AuthGuard` component
detects `PUBLIC_DEV_SKIP_AUTH=true` at build time and bypasses MSAL entirely.

---

## Mode 2 — Mock Login Screen

Shows a real login screen backed by a local mock OIDC server.
No Azure account or App Registration needed.
Best for: testing the full auth flow, sign-in UI, token handling — without touching Azure.

**`.env`**
```env
PUBLIC_DEV_SKIP_AUTH=false
PUBLIC_MOCK_AUTH=true
```

**Start** (note the `--profile mock` flag — this starts the mock server too)
```bash
docker compose -f docker-compose.local.yml --profile mock up --build
```

**Running containers:**
| Container | Purpose | Port |
|---|---|---|
| `local-host-app` | nginx + React shell | `localhost:3000` |
| `local-mock-auth` | Mock OIDC server | `localhost:8787` |
| `local-topic-manager` | Topic Manager MFE | internal |
| `local-content-writer` | Content Writer MFE | internal |

**Sign in:**
1. Open `http://localhost:3000` — redirects to the mock login page
2. Enter any value in the **sub** field (e.g. `testuser` or your name)
3. Click **Sign in**
4. Redirected back to `http://localhost:3000` — signed in with a fake token

**How it works:**
- MSAL is configured to use `http://localhost:8787/default` as the authority instead of `login.microsoftonline.com`
- `protocolMode: OIDC` tells MSAL to use standard OIDC (not Azure-specific)
- `knownAuthorities: ['localhost:8787']` bypasses the HTTPS requirement for the local server
- The mock server accepts any `sub` (user identifier) and issues a valid JWT

**Mock server debugger UI:** `http://localhost:8787/default/debugger`
Shows all issued tokens and active sessions.

---

## Mode 3 — Real Azure AD (Local + Azure)

Shows the real Microsoft login screen. Signs in with an actual Entra ID account.
Best for: testing real auth flows, verifying token claims, testing permissions.

### One-time Azure setup

You need to register `http://localhost:3000` as a redirect URI in your App Registration.

1. Go to **Azure Portal → Microsoft Entra ID → App registrations**
2. Open the app: `d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9`
3. Left menu → **Authentication**
4. Under **Single-page application** → **Add URI:**
   ```
   http://localhost:3000
   ```
5. Click **Save**

> This is a one-time step. The production URL
> (`https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io`) stays registered too —
> you can have multiple redirect URIs.

### `.env`
```env
PUBLIC_DEV_SKIP_AUTH=false
PUBLIC_MOCK_AUTH=false

# Must match your App Registration
PUBLIC_ENTRA_CLIENT_ID=d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9
PUBLIC_ENTRA_TENANT_ID=7e626a1e-dd27-4d19-a481-834ea79cd15b
```

### Start
```bash
docker compose -f docker-compose.local.yml up --build
```

### Sign in
1. Open `http://localhost:3000` — redirects to `login.microsoftonline.com`
2. Sign in with any account in your Entra ID tenant
3. Redirected back to `http://localhost:3000` — signed in with a real Microsoft token

### Create a test user (optional)

If you don't want to use your own account:

1. **Azure Portal → Entra ID → Users → + New user → Create new user**
2. Username: `testuser@<yourtenant>.onmicrosoft.com`
3. Auto-generate password → copy it
4. Sign in — Microsoft will ask you to change the password on first login

---

## Switching Between Modes

Just edit `.env` and restart with `--build`. Only the host-app rebuilds
(MFE containers are cached and unchanged).

```bash
# Stop everything
docker compose -f docker-compose.local.yml --profile mock down

# Edit .env to the mode you want, then:

# Mode 1 or 3
docker compose -f docker-compose.local.yml up --build

# Mode 2
docker compose -f docker-compose.local.yml --profile mock up --build
```

Rebuild time after the first build: ~30 seconds (npm install is cached by Docker layer).

---

## Architecture (Local)

```
Browser
  │
  │  http://localhost:3000
  ▼
┌─────────────────────────────────┐
│  local-host-app (nginx :80)     │
│                                  │
│  /           → React SPA         │
│  /mfe/topic-manager/*  ──────────┼──► local-topic-manager (nginx :80)
│  /mfe/content-writer/* ──────────┼──► local-content-writer (nginx :80)
│  /health     → 200 OK            │
└─────────────────────────────────┘

MSAL auth (browser-side):
  Mode 1 → skipped entirely
  Mode 2 → http://localhost:8787/default  (local-mock-auth)
  Mode 3 → https://login.microsoftonline.com/<tenant>  (Azure)
```

The host-app nginx uses `^~` prefix on the proxy locations so they always win
over the static-asset cache rule (`.js`, `.css`) — otherwise MFE chunks return 404.

Module Federation flow:
1. Browser loads `http://localhost:3000`
2. MSAL auth (or skip)
3. MF runtime fetches `http://localhost:3000/mfe/topic-manager/mf-manifest.json`
4. nginx proxies it to `http://topic-manager-mfe/mf-manifest.json` (Docker DNS)
5. Manifest lists chunks with paths like `/mfe/topic-manager/static/js/xxx.js`
6. Browser fetches those — nginx proxies each one to the topic-manager container

---

## Common Issues

### App loads but MFE components show "Loading…" forever
Chunks are probably 404ing. Open browser DevTools → Network tab.
If you see requests to `/mfe/topic-manager/static/js/*.js` returning 404:
```bash
# Verify nginx proxy is working
curl -I http://localhost:3000/mfe/topic-manager/mf-manifest.json
# Should return: HTTP/1.1 200 OK
```
If 404, the host-app nginx config may be missing the `^~` modifier on proxy locations.

### `process is not defined` in console
MSAL browser uses `process` at runtime. The host-app bundle injects a polyfill
via an inline `<script>` in `<head>`. If you see this error, make sure you rebuilt
after the fix (`--build` flag).

### Mode 2: Redirected to mock server but login fails
The mock server is not running. Make sure you used `--profile mock`:
```bash
docker compose -f docker-compose.local.yml --profile mock up --build
```
Check it's running: `docker ps | grep mock-auth`

### Mode 3: `AADSTS50011` redirect URI mismatch
`http://localhost:3000` is not registered as a SPA redirect URI in the App Registration.
See the one-time Azure setup steps in the Mode 3 section above.

### Mode 3: `AADSTS9002326` cross-origin token redemption
The redirect URI was added under **Web** instead of **Single-page application**.
Remove it from Web and add it under SPA in the App Registration Authentication page.

### Container is `unhealthy` in `docker ps`
The healthcheck polls every 30 seconds with a 10-second start period.
"Unhealthy" in the first minute is normal — nginx is serving fine.
Verify with: `curl http://localhost:3000/health`

### Port 3000 already in use
```bash
lsof -i :3000          # find what's using it
kill -9 <PID>          # stop it
# or change the port in docker-compose.local.yml: "3001:80"
```

---

## Key URLs

| Resource | URL |
|---|---|
| Local app | `http://localhost:3000` |
| Mock OIDC server | `http://localhost:8787/default/debugger` |
| Local health check | `http://localhost:3000/health` |
| Production app | `https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io` |
| App Registration (Azure Portal) | Entra ID → App registrations → `d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9` |

---

## Environment Variable Reference

| Variable | Values | Used in |
|---|---|---|
| `PUBLIC_DEV_SKIP_AUTH` | `true` / `false` | `AuthGuard.tsx` — skips MSAL entirely |
| `PUBLIC_MOCK_AUTH` | `true` / `false` | `msalConfig.ts` — switches authority to mock server |
| `PUBLIC_ENTRA_CLIENT_ID` | Azure App Registration client ID | `msalConfig.ts` (Mode 3 only) |
| `PUBLIC_ENTRA_TENANT_ID` | Azure tenant ID | `msalConfig.ts` (Mode 3 only) |
| `PUBLIC_TOPIC_MANAGER_REMOTE` | Manifest URL | `rsbuild.config.ts` — MF remote entry |
| `PUBLIC_CONTENT_WRITER_REMOTE` | Manifest URL | `rsbuild.config.ts` — MF remote entry |
