# MFE Infrastructure Setup — yt-planner

## Overview

This project is a **Micro-Frontend (MFE) architecture** built with **rsbuild** (Rspack-based), deployed to **Azure Container Apps** using **GitHub Container Registry (GHCR)** for images and **Azure OIDC** for zero-secret CI/CD authentication.

---

## Architecture

```
Internet
   │
   ▼
┌─────────────────────────────────────────────────────────┐
│  Azure Container Apps Environment (cae-yt-planner)      │
│                                                         │
│  ┌────────────────────────────────────────────────┐     │
│  │  host-app  (EXTERNAL — public HTTPS)           │◀─── browser
│  │  nginx serves React SPA + MSAL auth            │     │
│  │  proxies /mfe/topic-manager/* ──────────┐      │     │
│  │  proxies /mfe/content-writer/* ──────┐  │      │     │
│  └────────────────────────────────────────────────┘  │  │
│                                          │   │        │  │
│  ┌────────────────────────────────────┐  │   │        │  │
│  │  topic-manager-mfe (INTERNAL only) │◀─┘   │        │  │
│  └────────────────────────────────────┘      │        │  │
│                                              │        │  │
│  ┌────────────────────────────────────┐      │        │  │
│  │  content-writer-mfe (INTERNAL only)│◀─────┘        │  │
│  └────────────────────────────────────┘               │  │
└─────────────────────────────────────────────────────────┘
```

### Container Summary

| Container | Public | CPU | Memory | Purpose |
|---|---|---|---|---|
| `host-app` | ✅ HTTPS | 0.5 | 1Gi | React SPA shell, MSAL auth, nginx reverse proxy |
| `topic-manager-mfe` | ❌ Internal | 0.25 | 0.5Gi | Topic Manager MFE assets |
| `content-writer-mfe` | ❌ Internal | 0.25 | 0.5Gi | Content Writer MFE assets |

> The browser only ever talks to `host-app`. Sub-apps have no public URL — nginx proxies MFE asset requests internally, eliminating all CORS issues.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Build tool | rsbuild (Rspack-based, 10-20× faster than webpack) |
| Module Federation | `@module-federation/rsbuild-plugin` v0.6+ |
| Auth | Azure Entra ID / MSAL (`@azure/msal-browser`, `@azure/msal-react`) |
| Container runtime | nginx:1.27-alpine (~25 MB image) |
| Image registry | GitHub Container Registry (GHCR) — free, no Azure registry needed |
| Cloud hosting | Azure Container Apps (serverless, built-in HTTPS) |
| IaC | Terraform (azurerm ~4.0, azuread ~2.53) |
| CI/CD auth | Azure OIDC / Workload Identity Federation — zero secrets |
| CSS | Tailwind CSS v3 |

---

## Repository Structure

```
micro-fe-micro-service/
├── frontend/
│   ├── host-app/                  ← React SPA shell (replaces shell-app)
│   │   ├── src/
│   │   │   ├── App.tsx            ← Router + lazy MFE loading
│   │   │   ├── auth/
│   │   │   │   ├── msalConfig.ts  ← Entra ID config
│   │   │   │   └── AuthGuard.tsx  ← MSAL auth wrapper
│   │   │   ├── declarations.d.ts  ← TypeScript module declarations for remotes
│   │   │   └── index.tsx
│   │   ├── nginx/nginx.conf       ← Reverse proxies MFE paths internally
│   │   ├── rsbuild.config.ts      ← MF host config + dev proxy
│   │   ├── mfe-config.ts          ← Remote entry URLs (dev vs prod)
│   │   ├── Containerfile          ← Multi-stage: node builder → nginx runner
│   │   ├── .env.development
│   │   └── .env.production
│   │
│   ├── topic-manager-mfe/         ← Topic Manager remote
│   │   ├── src/
│   │   │   ├── components/TopicManager.tsx
│   │   │   ├── lib/api.ts
│   │   │   └── index.tsx
│   │   ├── rsbuild.config.ts      ← MF remote, exposes ./TopicManager, port 3001
│   │   ├── mfe-config.ts
│   │   └── Containerfile
│   │
│   └── content-writer-mfe/        ← Content Writer remote
│       ├── src/
│       │   ├── components/ContentWriter.tsx
│       │   ├── lib/api.ts
│       │   └── index.tsx
│       ├── rsbuild.config.ts      ← MF remote, exposes ./ContentWriter, port 3002
│       ├── mfe-config.ts
│       └── Containerfile
│
├── infra/terraform/
│   ├── providers.tf               ← azurerm + azuread providers
│   ├── variables.tf               ← Input variables + locals
│   ├── network.tf                 ← Resource Group, VNet, Subnet, NSG
│   ├── identity.tf                ← User-Assigned Managed Identity
│   ├── oidc.tf                    ← OIDC App Registration + Federated Credentials
│   ├── container-apps.tf          ← Log Analytics, CAE, 3 Container Apps
│   ├── outputs.tf                 ← URLs, client IDs, image prefix
│   └── terraform.tfvars.example   ← Copy to terraform.tfvars (gitignored)
│
├── .github/workflows/
│   └── build-and-push.yml         ← Build → GHCR → Deploy to Container Apps
│
└── docs/
    ├── MASTER-RSBUILD-AZURE-PLAN.md
    ├── azure-entra-app-registration.md
    └── mfe-infra-setup.md         ← this file
```

---

## Module Federation Setup

### How it works

- **host-app** is the **Host** — it consumes remote modules from sub-apps
- **topic-manager-mfe** and **content-writer-mfe** are **Remotes** — they expose components
- In production, host-app nginx proxies `/mfe/*` paths to internal Container Apps
- In development, rsbuild dev server proxies the same paths to `localhost:3001/3002`

### Remote manifest

rsbuild Module Federation 2.0 outputs `mf-manifest.json` (not `remoteEntry.js`):

```
topic-manager-mfe/mf-manifest.json    ← remote entry point
content-writer-mfe/mf-manifest.json
```

### Shared singletons

```ts
shared: {
  react:            { singleton: true, requiredVersion: '^18.0.0' },
  'react-dom':      { singleton: true, requiredVersion: '^18.0.0' },
  'react-router-dom': { singleton: true, requiredVersion: '^6.0.0' },
}
```

> Singletons ensure only one instance of React runs across host + all remotes — prevents hook errors.

---

## nginx Reverse Proxy (host-app)

The host-app nginx config is the key to zero-CORS MFE routing:

```nginx
# Routes MFE asset requests to internal Container Apps
location /mfe/topic-manager/ {
    proxy_pass http://topic-manager-mfe/;    # internal DNS
    proxy_http_version 1.1;
    proxy_set_header Host topic-manager-mfe;
}

location /mfe/content-writer/ {
    proxy_pass http://content-writer-mfe/;
    proxy_http_version 1.1;
    proxy_set_header Host content-writer-mfe;
}

# React SPA fallback
location / {
    try_files $uri $uri/ /index.html;
}

# Health check endpoint
location /health {
    return 200 '{"status":"ok"}';
    add_header Content-Type application/json;
}
```

**Why this works:** The browser makes same-origin requests to `host-app`. nginx routes internally to sub-apps. No CORS headers needed anywhere.

---

## Container Images

Images are stored in **GitHub Container Registry (GHCR)** — free for public packages.

| Image | Tag pattern |
|---|---|
| `ghcr.io/roysantu2002/micro-fe-micro-service/host-app` | `sha-<git-sha>`, `latest` |
| `ghcr.io/roysantu2002/micro-fe-micro-service/topic-manager-mfe` | `sha-<git-sha>`, `latest` |
| `ghcr.io/roysantu2002/micro-fe-micro-service/content-writer-mfe` | `sha-<git-sha>`, `latest` |

### Containerfile (multi-stage)

```dockerfile
# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

# Stage 2 — serve (~25 MB image)
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Making GHCR packages public (required after first push)

After the first CI run pushes images:

1. Go to `github.com/santuroy` → **Packages**
2. Open each package (`host-app`, `topic-manager-mfe`, `content-writer-mfe`)
3. **Package settings** → **Change visibility** → **Public**

> Azure Container Apps pulls images without credentials when packages are public.

---

## Azure Infrastructure (Terraform)

### Resources created

| Resource | Name | Purpose |
|---|---|---|
| Resource Group | `rg-yt-planner` | Container for all resources |
| Virtual Network | `vnet-yt-planner` | `10.0.0.0/16` |
| Subnet | `snet-container-apps` | `10.0.0.0/23` (min for Container Apps) |
| NSG | `nsg-yt-planner` | Allow HTTPS/HTTP/VNet, deny all else |
| User-Assigned Identity | `id-yt-planner-mfe` | Managed identity for containers |
| Log Analytics | `log-yt-planner` | Container Apps logging |
| Container Apps Environment | `cae-yt-planner` | Hosts all 3 Container Apps |
| Container App | `host-app` | External — public HTTPS |
| Container App | `topic-manager-mfe` | Internal only |
| Container App | `content-writer-mfe` | Internal only |
| Entra App Registration | `sp-yt-planner-github-actions` | OIDC identity for GitHub Actions |
| Federated Identity Credential | — | Links GitHub branch → Azure |
| Role Assignment | Contributor on RG | GitHub Actions deploy permission |

### Running Terraform

```bash
cd infra/terraform

# Set sensitive values as env vars (never write to tfvars)
export TF_VAR_entra_tenant_id="7e626a1e-dd27-4d19-a481-834ea79cd15b"
export TF_VAR_entra_client_id="<app-registration-client-id>"

# Copy and review tfvars
cp terraform.tfvars.example terraform.tfvars

terraform init
terraform plan
terraform apply
```

### After apply — get outputs

```bash
terraform output
```

Key outputs:

| Output | Save as |
|---|---|
| `host_app_url` | Add to Entra redirect URIs |
| `github_actions_client_id` | GitHub Variable: `AZURE_CLIENT_ID` |
| `github_actions_tenant_id` | GitHub Variable: `AZURE_TENANT_ID` |

---

## CI/CD Pipeline

### Zero-secrets architecture

| Operation | Auth method | Setup needed |
|---|---|---|
| Push to GHCR | `GITHUB_TOKEN` (auto) | None |
| Pull from GHCR | Public packages | Make packages public after first push |
| Deploy to Azure | OIDC Workload Identity | 3 plain variable IDs in GitHub |

### Client ID Confusion — Two Different App Registrations

These look similar but are completely different:

| Variable | App Registration | What it does | Used by |
|---|---|---|---|
| `PUBLIC_ENTRA_CLIENT_ID` | `yt-planner-mfe` | Lets **users log in** to the React app via MSAL | Browser — baked into the React bundle at build time |
| `AZURE_CLIENT_ID` | `sp-yt-planner-github-actions` | Lets **GitHub Actions deploy** to Azure via OIDC | CI/CD pipeline only — never touches the browser |

```
User login flow:
  Browser → PUBLIC_ENTRA_CLIENT_ID → "sign in to yt-planner-mfe" → gets user id_token

GitHub Actions deploy flow:
  CI → AZURE_CLIENT_ID → "deploy containers to Azure" → gets Azure management token
```

Same tenant (`7e626a1e-...`), two separate identities, different permissions.

---

### GitHub Actions Variables (Settings → Secrets and variables → Actions → Variables)

| Variable | Value | When to set |
|---|---|---|
| `AZURE_SUBSCRIPTION_ID` | `ac91a2b4-4d65-4c8d-9e4f-db410eef92a0` | Before Terraform |
| `PUBLIC_ENTRA_CLIENT_ID` | `<msal-app-client-id>` | Before Terraform |
| `PUBLIC_ENTRA_TENANT_ID` | `7e626a1e-dd27-4d19-a481-834ea79cd15b` | Before Terraform |
| `PUBLIC_API_URL` | `http://nginx-gateway` | Before Terraform (update later) |
| `AZURE_CLIENT_ID` | from `terraform output` | After Terraform |
| `AZURE_TENANT_ID` | from `terraform output` | After Terraform |

### Workflow triggers

```yaml
on:
  push:
    branches: [main, feature/rsbuild-azure-container-apps]
  pull_request:
    branches: [main]
  workflow_dispatch:
```

- **PRs** — builds images but does not push or deploy
- **Feature branch push** — builds and pushes images to GHCR, no deploy
- **Main branch push** — builds, pushes, and deploys to Azure

---

## Authentication (MSAL)

### Flow

```
Browser → Redirect to login.microsoftonline.com (Auth Code + PKCE)
        ← Auth code returned to redirectUri
        → POST /token (code + PKCE verifier)
        ← id_token + access_token
        → App renders (tokens in sessionStorage)
```

### App Registration: `yt-planner-mfe`

| Setting | Value |
|---|---|
| Account type | Single tenant |
| Platform | Single-page application (SPA) |
| Redirect URIs | `http://localhost:3000`, `https://<host_app_url>` |
| Permissions | `openid`, `profile`, `User.Read` (Delegated) |
| Admin consent | Granted |

### Skipping auth in local dev

```
PUBLIC_DEV_SKIP_AUTH=true   ← in .env.development
```

Set to `false` to test real MSAL login locally.

---

## Deployment Sequence (Full)

| Step | Action | Status |
|---|---|---|
| 1 | Push branch to GitHub | ✅ Done |
| 2 | Azure CLI login | ✅ Done |
| 3 | Create Entra App Registration | ✅ Done |
| 4 | Set GitHub Actions Variables (4 of 6) | ✅ Done |
| 5 | Enable workflow write permissions | ✅ Done |
| 6 | Run `terraform apply` | ⏳ In progress |
| 7 | Add `AZURE_CLIENT_ID` + `AZURE_TENANT_ID` from Terraform output | ⬜ After step 6 |
| 8 | Make GHCR packages public (after first CI push) | ⬜ After step 6 |
| 9 | Add production redirect URI to Entra App Registration | ⬜ After step 6 |
| 10 | Merge to main → triggers full deploy | ⬜ Last step |

---

## Environment Variables Reference

### `frontend/host-app/.env.development`

```
PUBLIC_TOPIC_MANAGER_REMOTE=http://localhost:3001/mf-manifest.json
PUBLIC_CONTENT_WRITER_REMOTE=http://localhost:3002/mf-manifest.json
PUBLIC_ENTRA_CLIENT_ID=<your-client-id>
PUBLIC_ENTRA_TENANT_ID=7e626a1e-dd27-4d19-a481-834ea79cd15b
PUBLIC_DEV_SKIP_AUTH=true
```

### `frontend/host-app/.env.production`

```
PUBLIC_TOPIC_MANAGER_REMOTE=/mfe/topic-manager/mf-manifest.json
PUBLIC_CONTENT_WRITER_REMOTE=/mfe/content-writer/mf-manifest.json
PUBLIC_ENTRA_CLIENT_ID=REPLACE_ME
PUBLIC_ENTRA_TENANT_ID=REPLACE_ME
PUBLIC_DEV_SKIP_AUTH=false
```

> Production values are injected as Docker build-args in the CI workflow — the `.env.production` values are overridden at build time.

---

## Known Values

```
Subscription ID           : ac91a2b4-4d65-4c8d-9e4f-db410eef92a0
Tenant ID                 : 7e626a1e-dd27-4d19-a481-834ea79cd15b
Resource Group            : rg-yt-planner
Location                  : eastus
GHCR prefix               : ghcr.io/roysantu2002/micro-fe-micro-service
GitHub repo               : github.com/roysantu2002/micro-fe-micro-service

# From terraform output
host_app_url              : https://host-app--19fq8ep.mangosea-5338e7ad.eastus.azurecontainerapps.io
topic_manager_internal    : topic-manager-mfe--5za286d.internal.mangosea-5338e7ad.eastus.azurecontainerapps.io
content_writer_internal   : content-writer-mfe--ys92zm9.internal.mangosea-5338e7ad.eastus.azurecontainerapps.io
AZURE_CLIENT_ID           : 87d9e028-868f-41b9-ac1e-2615a52788cc   ← GitHub Actions OIDC (not MSAL)
managed_identity_client_id: 39b55e50-be43-4424-9ae8-a1f813dee7b0
CAE name                  : cae-yt-planner
```
