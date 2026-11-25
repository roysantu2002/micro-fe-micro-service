# Troubleshooting Guide — rsbuild MFE + Azure Container Apps + MSAL

A record of every issue hit during the migration from Next.js/webpack to rsbuild,
containerising with nginx, pushing to GHCR, and deploying to Azure Container Apps
with Azure Entra ID (MSAL) authentication.

---

## Table of Contents

1. [Terraform: `period_seconds` invalid](#1-terraform-period_seconds-invalid)
2. [Terraform: Container App Environment VNet provisioning timeout](#2-terraform-container-app-environment-vnet-provisioning-timeout)
3. [Terraform: Resources already exist after failed apply](#3-terraform-resources-already-exist-after-failed-apply)
4. [GitHub Actions: GHCR push denied](#4-github-actions-ghcr-push-denied)
5. [GitHub Actions: `npm ci` lockfile mismatch](#5-github-actions-npm-ci-lockfile-mismatch)
6. [Module Federation: `getRemoteInfos` TypeError](#6-module-federation-getremoteinfos-typeerror)
7. [Module Federation: Relative manifest path at build time](#7-module-federation-relative-manifest-path-at-build-time)
8. [GitHub Actions: OIDC AADSTS700016](#8-github-actions-oidc-aadsts700016)
9. [Browser: MFE chunk 404s after deploy](#9-browser-mfe-chunk-404s-after-deploy)
10. [Browser: `loadShareSync` MF2 error (blank page)](#10-browser-loadsharesync-mf2-error-blank-page)
11. [MSAL: AADSTS50011 redirect URI mismatch](#11-msal-aadsts50011-redirect-uri-mismatch)
12. [MSAL: AADSTS9002326 cross-origin token redemption](#12-msal-aadsts9002326-cross-origin-token-redemption)

---

## 1. Terraform: `period_seconds` invalid

**Error**
```
Error: Unsupported argument — An argument named "period_seconds" is not expected here.
```

**Cause**  
`azurerm` provider v4 renamed the health probe field from `period_seconds` to `interval_seconds`.

**Fix** — `infra/terraform/container-apps.tf`
```hcl
# Wrong (v3)
period_seconds = 10

# Correct (v4)
interval_seconds = 10
```

---

## 2. Terraform: Container App Environment VNet provisioning timeout

**Error**
```
Error: waiting for creation of Container App Environment … context deadline exceeded (20m0s)
```

**Cause**  
Attaching a VNet subnet (`infrastructure_subnet_id`) and a custom `workload_profile` causes
the Container App Environment to stall during provisioning in the East US region.

**Fix**  
Remove both from the Container App Environment resource and use the default consumption plan:
```hcl
resource "azurerm_container_app_environment" "cae" {
  name                = "cae-yt-planner"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  # No infrastructure_subnet_id
  # No workload_profile block
}
```

---

## 3. Terraform: Resources already exist after failed apply

**Error**
```
Error: A resource with the ID "…/containerApps/host-app" already exists
```

**Cause**  
A previous failed `terraform apply` created the Azure resource but Terraform state doesn't
track it.

**Fix — two steps:**

```bash
# 1. Import the existing resource into state
terraform import azurerm_container_app.host_app \
  "/subscriptions/<SUB>/resourceGroups/rg-yt-planner/providers/Microsoft.App/containerApps/host-app"

# 2. If the resource is in a broken state, delete it via CLI then re-apply
az containerapp delete --name host-app --resource-group rg-yt-planner --yes
terraform apply
```

---

## 4. GitHub Actions: GHCR push denied

**Error**
```
denied: permission_denied: write_package
```

**Cause**  
Image prefix used the wrong GitHub username (`ghcr.io/santuroy/…`).
The correct username is `roysantu2002`.

**Fix** — `.github/workflows/build-and-push.yml`
```yaml
env:
  IMAGE_PREFIX: ghcr.io/roysantu2002/micro-fe-micro-service
```

Also make sure all three packages are set to **Public** in
`github.com/roysantu2002 → Packages` so Container Apps can pull without credentials.

---

## 5. GitHub Actions: `npm ci` lockfile mismatch

**Error**
```
npm ci can only install packages when your package.json and package-lock.json
are in sync
```

**Cause**  
Migrating from Next.js to rsbuild changed `package.json` but the old `package-lock.json`
was committed. `npm ci --frozen-lockfile` refuses to install when they differ.

**Fix** — all three Containerfiles  
Change the install command:
```dockerfile
# Wrong
RUN npm ci --frozen-lockfile

# Correct
RUN npm install
```

> After install, commit the regenerated `package-lock.json` files so future `npm ci` works.

---

## 6. Module Federation: `getRemoteInfos` TypeError

**Error** (browser console)
```
TypeError: Cannot read properties of undefined (reading 'getRemoteInfos')
```

**Cause**  
Module Federation 2.0 (`@module-federation/rsbuild-plugin` v0.6+) requires the `name@url`
format for remotes. Passing a plain URL string breaks the runtime.

**Fix** — `frontend/host-app/rsbuild.config.ts`
```ts
// Wrong
remotes: {
  topicManager: topicManagerEntry,          // plain URL
}

// Correct
remotes: {
  topicManager: `topicManager@${topicManagerEntry}`,   // name@url
}
```

---

## 7. Module Federation: Relative manifest path at build time

**Error** (Rspack build warning / runtime 404)
```
Cannot resolve remote entry — invalid URL: /mfe/topic-manager/mf-manifest.json
```

**Cause**  
rsbuild bakes the remote URL into the bundle at build time. A relative path
(`/mfe/topic-manager/mf-manifest.json`) is not a valid URL for Rspack to parse.
A fully qualified URL is required.

**Fix** — pass the full production URL as a GitHub Actions Variable (`HOST_APP_URL`)
and inject it at build time:

`.github/workflows/build-and-push.yml`
```yaml
build-args: |
  PUBLIC_TOPIC_MANAGER_REMOTE=${{ vars.HOST_APP_URL }}/mfe/topic-manager/mf-manifest.json
  PUBLIC_CONTENT_WRITER_REMOTE=${{ vars.HOST_APP_URL }}/mfe/content-writer/mf-manifest.json
```

GitHub Actions → Repository Variables:
```
HOST_APP_URL = https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io
```

---

## 8. GitHub Actions: OIDC AADSTS700016

**Error**
```
AADSTS700016: Application with identifier '…' was not found in the directory
```
or
```
AADSTS70011: The provided request must include a 'scope' input parameter.
```

**Two root causes:**

**a) Wrong GitHub username in the federated credential subject**
```hcl
# Wrong
subject = "repo:santuroy/micro-fe-micro-service:environment:production"

# Correct
subject = "repo:roysantu2002/micro-fe-micro-service:environment:production"
```

**b) Workflow uses `environment: production` but subject was `ref:refs/heads/main`**  
When a GitHub Actions job specifies `environment: production`, the OIDC token's subject
changes to `…:environment:production` — not `…:ref:refs/heads/main`.
The federated credential subject must match exactly.

**Fix** — `infra/terraform/oidc.tf`
```hcl
# For jobs with environment: production
resource "azuread_application_federated_identity_credential" "github_main" {
  subject = "repo:roysantu2002/micro-fe-micro-service:environment:production"
}

# For jobs without environment block (branch-based)
resource "azuread_application_federated_identity_credential" "github_main_ref" {
  subject = "repo:roysantu2002/micro-fe-micro-service:ref:refs/heads/main"
}
```

Also verify **GitHub Actions → Repository Variables** (not Secrets):
```
AZURE_CLIENT_ID       = <client_id from terraform output>
AZURE_TENANT_ID       = 7e626a1e-dd27-4d19-a481-834ea79cd15b
AZURE_SUBSCRIPTION_ID = ac91a2b4-4d65-4c8d-9e4f-db410eef92a0
```

---

## 9. Browser: MFE chunk 404s after deploy

**Error** (nginx access log)
```
"GET /static/js/topicManager.86c97516.js" 404
```

**Cause**  
rsbuild sub-apps (topic-manager-mfe, content-writer-mfe) generated chunk URLs without
a path prefix. The browser requested `/static/js/xxx.js` but the host-app nginx serves
those MFE chunks under `/mfe/topic-manager/static/js/xxx.js`.

**Fix** — add `assetPrefix` to each sub-app's rsbuild config:

`frontend/topic-manager-mfe/rsbuild.config.ts`
```ts
output: {
  assetPrefix: '/mfe/topic-manager/',
  distPath: { root: 'dist' },
},
```

`frontend/content-writer-mfe/rsbuild.config.ts`
```ts
output: {
  assetPrefix: '/mfe/content-writer/',
  distPath: { root: 'dist' },
},
```

The `mf-manifest.json` will now contain chunk paths like
`/mfe/topic-manager/static/js/xxx.js` which host-app nginx intercepts and proxies to
the internal MFE container.

---

## 10. Browser: `loadShareSync` MF2 error (blank page)

**Error** (browser console)
```
loadShareSync failed! Invalid loadShareSync function call from runtime.
Cannot find react in shared scope default.
```

**Cause**  
Module Federation 2.0 requires shared modules (React, ReactDOM) to be loaded
**asynchronously** before the app renders. Having `ReactDOM.createRoot(…)` directly
in `index.tsx` (the MF entry point) causes the shared scope to not be initialised yet.

**Fix** — async boundary pattern. Split `index.tsx` into two files:

`frontend/host-app/src/index.tsx` (entry — dynamic import only)
```ts
import('./bootstrap');
```

`frontend/host-app/src/bootstrap.tsx` (actual app render)
```tsx
// Skip-auth and mock modes render <App> without MsalProvider.
// Real Azure AD mode dynamically imports MSAL and wraps the tree.
const skipAuth = process.env.PUBLIC_DEV_SKIP_AUTH === 'true';
const isMock   = process.env.PUBLIC_MOCK_AUTH === 'true';

if (skipAuth || isMock) {
  ReactDOM.createRoot(rootEl).render(<StrictMode><App /></StrictMode>);
} else {
  Promise.all([
    import('@azure/msal-browser'),
    import('@azure/msal-react'),
    import('./auth/msalConfig'),
  ]).then(([{ PublicClientApplication }, { MsalProvider }, { msalConfig }]) => {
    const msalInstance = new PublicClientApplication(msalConfig);
    ReactDOM.createRoot(rootEl).render(
      <StrictMode><MsalProvider instance={msalInstance}><App /></MsalProvider></StrictMode>
    );
  });
}
```

---

## 11. MSAL: AADSTS50011 redirect URI mismatch

**Error**
```
AADSTS50011: The redirect URI 'https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io'
does not match the redirect URIs configured for application 'd53a7e1b-…'.
```

**Cause**  
The Container App URL was not registered as a redirect URI in the Azure App Registration.
`msalConfig.ts` uses `window.location.origin` as the redirect URI at runtime — whatever
URL the browser is on must be pre-registered.

**Fix** — Azure Portal → Entra ID → App registrations → `d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9`
→ Authentication → **Single-page application** → Add URI:

```
https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io
```

> **Important:** If the host-app Container App URL ever changes (after destroy + re-apply),
> update this redirect URI. The old URL will cause AADSTS50011 again.

For local development also add:
```
http://localhost:3000
```

---

## 12. MSAL: AADSTS9002326 cross-origin token redemption

**Error**
```
AADSTS9002326: Cross-origin token redemption is permitted only for the
'Single-Page Application' client-type.
```

**Cause**  
The redirect URI was added under the **Web** platform instead of the
**Single-page application** platform. MSAL.js v2+ uses Authorization Code Flow
with PKCE which requires the **SPA** platform type.

**Fix** — in the App Registration → Authentication:
1. Remove the URI from the **Web** section
2. Add it under **Single-page application** section
3. Save

The SPA platform is required because MSAL handles the token exchange in the browser
(cross-origin), which is only allowed for SPA-type redirect URIs.

---

## Local Development Quick Reference

### Mode 1 — Skip auth (fastest, no login screen)
```bash
# .env
PUBLIC_DEV_SKIP_AUTH=true
PUBLIC_MOCK_AUTH=false

docker compose -f docker-compose.local.yml up --build
# → http://localhost:3000  (straight to app, navbar shows "Dev Mode")
```

### Mode 2 — Mock login screen (no Azure account needed)
```bash
# .env
PUBLIC_DEV_SKIP_AUTH=false
PUBLIC_MOCK_AUTH=true

docker compose -f docker-compose.local.yml up --build
# → http://localhost:3000  shows an in-app mock login form
# Type any name, press Enter — app loads as that user
# No external server, no redirect, no HTTPS needed
```

### Mode 3 — Real Azure AD login
```bash
# 1. Add http://localhost:3000 as SPA redirect URI in Entra ID App Registration
# 2. In .env:
PUBLIC_DEV_SKIP_AUTH=false
PUBLIC_MOCK_AUTH=false

docker compose -f docker-compose.local.yml up --build
# → http://localhost:3000  redirects to real Microsoft login
```

### Key URLs
| Resource | URL |
|---|---|
| Local app | `http://localhost:3000` |
| Production app | `https://host-app.mangosea-5338e7ad.eastus.azurecontainerapps.io` |
| App Registration | Azure Portal → Entra ID → App registrations → `d53a7e1b-47d9-477d-ba37-f9f0c9ea7be9` |
| GHCR packages | `github.com/roysantu2002 → Packages` |
