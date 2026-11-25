# Azure Entra ID App Registration — yt-planner-mfe

## Purpose

This App Registration enables Azure Entra ID (formerly Azure AD) authentication for the `host-app` micro-frontend. It issues OIDC tokens so the app can:

- Authenticate users via Microsoft login (OAuth2 Authorization Code + PKCE)
- Read the signed-in user's profile (`User.Read`)
- Pass the identity token downstream to backend services if needed

> The sub-apps (`topic-manager-mfe`, `content-writer-mfe`) do **not** have their own App Registrations. Auth is handled entirely by `host-app`; sub-apps receive the user context via React props/context from the host.

---

## Step-by-Step: Create the App Registration

### 1 — Navigate to App Registrations

```
portal.azure.com → search "App registrations" → + New registration
```

### 2 — Basic Settings

| Field | Value |
|---|---|
| **Name** | `yt-planner-mfe` |
| **Supported account types** | `Single tenant only – Default Directory` ← pick this option |
| **Redirect URI — Platform** | `Single-page application (SPA)` |
| **Redirect URI — URL** | `http://localhost:3000` |

> **Why Single-page application (SPA)?**  
> SPA platform type uses the **Authorization Code + PKCE** flow with no client secret. The token is exchanged in the browser — correct for React / rsbuild apps. Never choose "Web" (that requires a server-side secret) or "Public client/native" for a web SPA.

Click **Register**.

---

### 3 — Copy the IDs (you will need both)

On the **Overview** page after registration:

| Value | Where to find it | Save as |
|---|---|---|
| **Application (client) ID** | Overview → "Application (client) ID" | `PUBLIC_ENTRA_CLIENT_ID` |
| **Directory (tenant) ID** | Overview → "Directory (tenant) ID" | `PUBLIC_ENTRA_TENANT_ID` |

> Tenant ID should already be `7e626a1e-dd27-4d19-a481-834ea79cd15b` — confirm it matches.

---

### 4 — Add Redirect URIs

Go to **Authentication** tab → under "Single-page application" → **+ Add URI**

| Environment | URI |
|---|---|
| Local dev | `http://localhost:3000` ← added during registration |
| Production | `https://<host_app_url>` ← add this **after** Terraform gives you the FQDN |

**Additional settings on the Authentication tab:**

| Setting | Value |
|---|---|
| Access tokens (implicit flow) | ☐ unchecked (not needed for PKCE) |
| ID tokens (implicit flow) | ☐ unchecked (not needed for PKCE) |
| Allow public client flows | No |

> Leave implicit flow **off** — PKCE is more secure and is what `@azure/msal-browser` uses by default.

---

### 5 — API Permissions (Scopes)

Go to **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**

Search and tick the following:

| Permission | Type | Reason |
|---|---|---|
| `openid` | Delegated | Issues an ID token (proves who the user is) |
| `profile` | Delegated | Returns name, username, photo |
| `User.Read` | Delegated | Reads the signed-in user's full profile from `/me` |

Click **Add permissions**.

Then click **Grant admin consent for Default Directory** → **Yes**.

> **Why admin consent?**  
> `User.Read` is a low-privilege scope but admin consent marks it as pre-approved so users are not prompted with a consent screen on first login — cleaner UX for internal/org apps.

After granting, all three permissions should show a green ✅ under "Status".

---

### 6 — Token Configuration (Optional but Recommended)

Go to **Token configuration** → **+ Add optional claim** → Token type: **ID**

Add these optional claims so the ID token carries richer user info:

| Claim | Included in | Reason |
|---|---|---|
| `email` | ID token | User's email address |
| `family_name` | ID token | Last name |
| `given_name` | ID token | First name |
| `preferred_username` | ID token | UPN / login hint |

When prompted "Turn on the Microsoft Graph email, profile permission?" → click **Add** (it adds the `profile` scope if not already present).

---

### 7 — App Roles (Optional — for future RBAC)

Go to **App roles** → **+ Create app role** if you later need role-based access control.

Example roles for this project:

| Display name | Value | Allowed types | Description |
|---|---|---|---|
| `ContentCreator` | `ContentCreator` | Users/Groups | Can create and edit topics and content |
| `Viewer` | `Viewer` | Users/Groups | Read-only access to topics |
| `Admin` | `Admin` | Users/Groups | Full access including user management |

> App roles are **not required for initial deployment** — skip for now. Add them when you need to gate features by role. When added, the role claim appears in the token as `roles: ["ContentCreator"]` and can be read via `useAccount()` from `@azure/msal-react`.

---

### 8 — Expose an API (Optional — for backend auth)

Skip for the initial deployment. Only needed if the React app needs to call **your own backend APIs** using delegated tokens (not just Microsoft Graph).

If added later:
- **Application ID URI**: `api://<client-id>`
- **Scope**: `api://<client-id>/access_as_user`
- Backend validates this token using `jwks_uri` from the Entra OIDC discovery document

---

## Summary of IDs to Record

After completing the steps above, you should have:

```
Application (client) ID  =  <copy from Overview>
Directory (tenant) ID    =  7e626a1e-dd27-4d19-a481-834ea79cd15b
```

---

## Where These Values Are Used

### In code — `frontend/host-app/src/auth/msalConfig.ts`
```ts
export const msalConfig: Configuration = {
  auth: {
    clientId:    process.env.PUBLIC_ENTRA_CLIENT_ID ?? '',
    authority:   `https://login.microsoftonline.com/${process.env.PUBLIC_ENTRA_TENANT_ID ?? 'common'}`,
    redirectUri: window.location.origin,
  },
};
```

### In local dev — `frontend/host-app/.env.development`
```
PUBLIC_ENTRA_CLIENT_ID=<your-client-id>
PUBLIC_ENTRA_TENANT_ID=7e626a1e-dd27-4d19-a481-834ea79cd15b
PUBLIC_DEV_SKIP_AUTH=true   ← set false to test real MSAL login locally
```

### In GitHub Actions Variables (not secrets — just IDs)
```
PUBLIC_ENTRA_CLIENT_ID   = <your-client-id>
PUBLIC_ENTRA_TENANT_ID   = 7e626a1e-dd27-4d19-a481-834ea79cd15b
```
These are injected as Docker build-args at CI time and baked into the host-app bundle.

### In Terraform — passed as env vars
```bash
export TF_VAR_entra_tenant_id="7e626a1e-dd27-4d19-a481-834ea79cd15b"
export TF_VAR_entra_client_id="<your-client-id>"
```
Terraform passes these as environment variables to the host-app Container App at runtime (secondary source — the build-time bake is the primary).

---

## MSAL Flow Diagram

```
Browser                     Entra ID                  host-app nginx
  │                              │                          │
  │── Load http://localhost:3000 ──────────────────────────▶│
  │◀── React SPA (index.html) ─────────────────────────────│
  │                              │                          │
  │  [MsalProvider initialises, checks cache — no token]    │
  │                              │                          │
  │── Redirect to login.microsoftonline.com ───────────────▶│
  │          (Authorization Code + PKCE)                    │
  │                              │
  │◀── Auth code returned to redirectUri (localhost:3000) ──│
  │                              │
  │── POST /token (code + PKCE verifier) ──────────────────▶│
  │◀── id_token + access_token ────────────────────────────│
  │                              │
  │  [MSAL stores tokens in sessionStorage]                  │
  │  [AuthGuard passes, app renders]                         │
```

---

## Checklist Before Terraform

- [ ] App Registration created: `yt-planner-mfe`
- [ ] Account type: Single tenant
- [ ] Redirect URI: `http://localhost:3000` (SPA platform)
- [ ] API permissions: `openid`, `profile`, `User.Read` — all Delegated
- [ ] Admin consent granted (green ✅ for all three)
- [ ] Application (client) ID copied
- [ ] Directory (tenant) ID confirmed: `7e626a1e-dd27-4d19-a481-834ea79cd15b`

---

## Post-Terraform Addition

After `terraform apply` outputs `host_app_url` (e.g. `https://host-app.gentlewave-abc123.eastus.azurecontainerapps.io`):

1. Portal → App registrations → `yt-planner-mfe` → **Authentication**
2. Under "Single-page application" → **+ Add URI**
3. Add: `https://<host_app_url>`
4. Save

This allows production logins to redirect back to the live Container App.
