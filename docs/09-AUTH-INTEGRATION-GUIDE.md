# 09 - Authentication Integration Guide (Microsoft Entra ID)

This document provides a practical implementation guide for adding Microsoft Entra ID (formerly Azure AD) authentication to the YouTube Content Planner. It covers the full auth flow across the micro-frontend shell app, remote MFEs, backend microservices, and the API gateway.

---

## Auth Architecture Overview

```
                          Microsoft Entra ID
                          (Identity Provider)
                               │
                    ┌──────────┼──────────┐
                    │          │          │
                    ▼          ▼          ▼
              ┌──────────┐              ┌──────────────┐
              │ Frontend  │              │   Backend     │
              │ (MSAL.js) │              │ (JWT verify)  │
              └─────┬─────┘              └──────┬───────┘
                    │                           │
          ┌────────┴────────┐                   │
          │                 │                   │
    Shell App          Remote MFEs              │
   (Port 3000)      (3001, 3002)               │
          │                 │                   │
          └────────┬────────┘                   │
                   │                            │
                   ▼                            ▼
              Nginx Gateway (:8080)     Validates JWT token
              (passes Authorization     in each request
               header through)
```

### How the Flow Works

1. User opens `http://localhost:3000` (Shell App)
2. Shell App checks if user has a valid token (MSAL.js)
3. If no token → redirect to `/login` page → Microsoft login popup/redirect
4. Microsoft Entra ID returns an **ID token** (for user info) and an **access token** (for API calls)
5. Shell App stores tokens via MSAL.js (in-memory + session storage)
6. Every API call includes `Authorization: Bearer <access_token>` header
7. Nginx passes the header through to backend services
8. Backend services validate the JWT token against Microsoft Entra ID's public keys
9. If valid → process request. If invalid → return 401

### Why Auth Lives in the Shell App Only

- The Shell App is the **single entry point** for users
- Remote MFEs (TopicManager, ContentWriter) are loaded as components inside the Shell App
- They share the same browser context (same origin, same cookies, same MSAL instance)
- The API client (`lib/api.js`) in each MFE gets the token from a shared location
- No need for each MFE to implement its own login flow

---

## Step 1: Register Application in Microsoft Entra ID

### 1.1 Create App Registration

1. Go to [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations
2. Click **New registration**
3. Fill in:
   - **Name**: `YT Content Planner`
   - **Supported account types**: Choose based on your org (single tenant or multi-tenant)
   - **Redirect URI**: Select "Single-page application (SPA)" and add:
     - `http://localhost:3000/login` (development)
     - `https://your-domain.com/login` (production)
4. Click **Register**

### 1.2 Note These Values

From the app registration overview page, copy:

| Value | Where to Find | Used By |
|---|---|---|
| **Application (client) ID** | Overview page | Frontend (MSAL config) |
| **Directory (tenant) ID** | Overview page | Frontend + Backend |
| **API scope** | Expose an API → Add a scope | Frontend (token request) |

### 1.3 Expose an API

1. Go to **Expose an API**
2. Click **Set** next to Application ID URI → accept the default (`api://<client-id>`)
3. Click **Add a scope**:
   - **Scope name**: `access_as_user`
   - **Who can consent**: Admins and users
   - **Admin consent display name**: `Access YT Content Planner API`
   - **Admin consent description**: `Allows the app to access YT Content Planner API on behalf of the signed-in user`
4. Note the full scope: `api://<client-id>/access_as_user`

### 1.4 Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission** → **My APIs** → select your app → check `access_as_user`
3. Click **Add permissions**
4. Click **Grant admin consent** (if you have admin rights)

### 1.5 Configure Token

1. Go to **Token configuration**
2. Click **Add optional claim** → **Access token**
3. Select: `email`, `preferred_username`, `name`
4. Click **Add**

---

## Step 2: Frontend - Shell App Auth Implementation

### 2.1 Install MSAL Dependencies

```bash
cd frontend/shell-app
npm install @azure/msal-browser @azure/msal-react
```

### 2.2 Create Auth Configuration

Create `frontend/shell-app/lib/auth-config.js`:

```javascript
import { LogLevel } from "@azure/msal-browser";

// Replace these with your Entra ID app registration values
const CLIENT_ID = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID;
const TENANT_ID = process.env.NEXT_PUBLIC_AZURE_TENANT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI || "http://localhost:3000/login";

export const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: REDIRECT_URI,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "sessionStorage",  // Use sessionStorage for MFE isolation
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
      },
      logLevel: LogLevel.Error,
    },
  },
};

// Scopes for API access
export const apiScopes = {
  scopes: [`api://${CLIENT_ID}/access_as_user`],
};

// Scopes for login (user info)
export const loginRequest = {
  scopes: ["openid", "profile", "email"],
};
```

### 2.3 Create Auth Context Provider

Create `frontend/shell-app/lib/auth-provider.js`:

```javascript
import { createContext, useContext, useCallback, useMemo } from "react";
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";
import { MsalProvider, useMsal, useIsAuthenticated } from "@azure/msal-react";
import { msalConfig, apiScopes } from "./auth-config";

// Create MSAL instance (singleton)
export const msalInstance = new PublicClientApplication(msalConfig);

// Context for sharing getAccessToken across MFEs
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthContextProvider>{children}</AuthContextProvider>
    </MsalProvider>
  );
}

function AuthContextProvider({ children }) {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const getAccessToken = useCallback(async () => {
    if (accounts.length === 0) return null;

    try {
      // Try silent token acquisition first
      const response = await instance.acquireTokenSilent({
        ...apiScopes,
        account: accounts[0],
      });
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Token expired or needs interaction — redirect to login
        const response = await instance.acquireTokenPopup(apiScopes);
        return response.accessToken;
      }
      throw error;
    }
  }, [instance, accounts]);

  const user = useMemo(() => {
    if (accounts.length === 0) return null;
    return {
      name: accounts[0].name,
      email: accounts[0].username,
    };
  }, [accounts]);

  const value = useMemo(
    () => ({ getAccessToken, user, isAuthenticated }),
    [getAccessToken, user, isAuthenticated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

### 2.4 Update Shell App `_app.js`

Replace `frontend/shell-app/pages/_app.js`:

```javascript
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { AuthProvider, useAuth } from "../lib/auth-provider";
import "../styles/globals.css";

// Pages that don't require authentication
const PUBLIC_PAGES = ["/login"];

function AuthGuard({ children }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated && !PUBLIC_PAGES.includes(router.pathname)) {
      router.push("/login");
    }
  }, [isAuthenticated, router.pathname]);

  if (!isAuthenticated && !PUBLIC_PAGES.includes(router.pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Redirecting to login...</div>
      </div>
    );
  }

  return children;
}

function AppContent({ Component, pageProps }) {
  const router = useRouter();
  const isLoginPage = router.pathname === "/login";

  if (isLoginPage) {
    return <Component {...pageProps} />;
  }

  return (
    <AuthGuard>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </AuthGuard>
  );
}

export default function App(props) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // MSAL needs to be initialized on the client
    setIsReady(true);
  }, []);

  if (!isReady) return null;

  return (
    <AuthProvider>
      <AppContent {...props} />
    </AuthProvider>
  );
}
```

### 2.5 Create the Login Page

Create `frontend/shell-app/pages/login.js`:

```javascript
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest } from "../lib/auth-config";

export default function LoginPage() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();

  useEffect(() => {
    // If already logged in, redirect to dashboard
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  const handleLogin = async () => {
    try {
      await instance.loginPopup(loginRequest);
      router.push("/");
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLoginRedirect = async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      console.error("Login redirect failed:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            YT Content Planner
          </h1>
          <p className="text-gray-500 mt-2">
            Sign in with your Microsoft account to continue
          </p>
        </div>
        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Sign in with Microsoft
          </button>
          <button
            onClick={handleLoginRedirect}
            className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Sign in (full page redirect)
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 2.6 Add Logout to Navbar

Update `frontend/shell-app/components/Navbar.js` to include user info and logout:

```javascript
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../lib/auth-provider";
import { msalInstance } from "../lib/auth-provider";

export default function Navbar() {
  const router = useRouter();
  const { user } = useAuth();

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/topics", label: "Topics" },
  ];

  const handleLogout = () => {
    msalInstance.logoutPopup();
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-blue-600">
              YT Content Planner
            </Link>
            <div className="flex gap-4">
              {links.map((link) => {
                const isActive =
                  link.href === "/"
                    ? router.pathname === "/"
                    : router.pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.name}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
```

### 2.7 Add Environment Variables

Add to `frontend/shell-app/.env.local`:

```bash
NEXT_PUBLIC_AZURE_CLIENT_ID=your-client-id-here
NEXT_PUBLIC_AZURE_TENANT_ID=your-tenant-id-here
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/login
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## Step 3: Pass Auth Token to MFE API Calls

The remote MFEs need the access token to make authenticated API calls. Since they run as components inside the Shell App, they share the same React tree and browser context.

### 3.1 Pass `getAccessToken` as a Prop

The Shell App passes the token-getter to each MFE:

```javascript
// frontend/shell-app/pages/topics.js
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useAuth } from "../lib/auth-provider";

const TopicManager = dynamic(() => import("topicManager/TopicManager"), {
  ssr: false,
  loading: () => <div>Loading Topic Manager...</div>,
});

export default function TopicsPage() {
  const router = useRouter();
  const { getAccessToken } = useAuth();

  return (
    <TopicManager
      onViewContent={(topicId) => router.push(`/content/${topicId}`)}
      getAccessToken={getAccessToken}
    />
  );
}
```

```javascript
// frontend/shell-app/pages/content/[topicId].js
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useAuth } from "../lib/auth-provider";
import Link from "next/link";

const ContentWriter = dynamic(() => import("contentWriter/ContentWriter"), {
  ssr: false,
  loading: () => <div>Loading Content Writer...</div>,
});

export default function ContentPage() {
  const { topicId } = useRouter().query;
  const { getAccessToken } = useAuth();

  if (!topicId) return <div>Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <Link href="/topics" className="text-blue-600 hover:text-blue-800 text-sm">
          &larr; Back to Topics
        </Link>
      </div>
      <ContentWriter topicId={topicId} getAccessToken={getAccessToken} />
    </div>
  );
}
```

### 3.2 Update MFE API Clients to Use the Token

Update `frontend/topic-manager-mfe/lib/api.js`:

```javascript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function authFetch(url, options = {}, getAccessToken) {
  const headers = { ...options.headers };

  if (getAccessToken) {
    const token = await getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    throw new Error("Unauthorized - please sign in again");
  }
  if (!res.ok) {
    throw new Error(`Request failed: ${res.statusText}`);
  }
  return res;
}

export async function fetchTopics(getAccessToken) {
  const res = await authFetch(`${API_BASE}/api/topics`, {}, getAccessToken);
  return res.json();
}

export async function createTopic(data, getAccessToken) {
  const res = await authFetch(
    `${API_BASE}/api/topics`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    getAccessToken
  );
  return res.json();
}

export async function updateTopic(id, data, getAccessToken) {
  const res = await authFetch(
    `${API_BASE}/api/topics/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    getAccessToken
  );
  return res.json();
}

export async function deleteTopic(id, getAccessToken) {
  await authFetch(
    `${API_BASE}/api/topics/${id}`,
    { method: "DELETE" },
    getAccessToken
  );
}

export async function generateContent(topicId, getAccessToken) {
  const res = await authFetch(
    `${API_BASE}/api/topics/${topicId}/generate`,
    { method: "POST" },
    getAccessToken
  );
  return res.json();
}
```

Then update `TopicManager.js` to thread `getAccessToken` through all API calls:

```javascript
// frontend/topic-manager-mfe/components/TopicManager.js
export default function TopicManager({ onViewContent, getAccessToken }) {
  // ...
  const loadTopics = useCallback(async () => {
    try {
      const data = await fetchTopics(getAccessToken);
      setTopics(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [getAccessToken]);

  const handleCreate = async (data) => {
    await createTopic(data, getAccessToken);
    // ...
  };
  // Same pattern for handleUpdate, handleDelete, handleGenerate
}
```

Apply the same pattern to `frontend/content-writer-mfe/lib/api.js` and `ContentWriter.js`.

---

## Step 4: Backend - Topic Service (Spring Boot)

### 4.1 Add Spring Security + OAuth2 Dependencies

Add to `backend/topic-service/pom.xml`:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

### 4.2 Configure Entra ID in application.yml

Add to `backend/topic-service/src/main/resources/application.yml`:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0
          audiences: api://${AZURE_CLIENT_ID}
```

The `issuer-uri` tells Spring to fetch Entra ID's public keys from:
```
https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration
```

Spring will:
1. Download the JWKS (JSON Web Key Set) from Entra ID
2. Validate the JWT signature against those keys
3. Check `iss` (issuer), `aud` (audience), and `exp` (expiration)

### 4.3 Create Security Configuration

Create `backend/topic-service/src/main/java/com/ytplanner/topicservice/config/SecurityConfig.java`:

```java
package com.ytplanner.topicservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> {})  // Uses existing CorsConfig bean
            .csrf(csrf -> csrf.disable())  // Stateless API, no CSRF needed
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .authorizeHttpRequests(auth -> auth
                // Public endpoints (health checks, actuator)
                .requestMatchers("/actuator/**").permitAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // All API endpoints require authentication
                .requestMatchers("/api/**").authenticated()

                .anyRequest().denyAll()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt
                    .jwtAuthenticationConverter(jwtAuthenticationConverter())
                )
            );

        return http.build();
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter converter = new JwtGrantedAuthoritiesConverter();
        converter.setAuthoritiesClaimName("roles");
        converter.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter jwtConverter = new JwtAuthenticationConverter();
        jwtConverter.setJwtGrantedAuthoritiesConverter(converter);
        return jwtConverter;
    }
}
```

### 4.4 Access User Info in Controllers (Optional)

If you need the authenticated user's identity in controllers:

```java
// In any controller method
@GetMapping("/api/topics")
public List<TopicResponse> getAllTopics(
        @AuthenticationPrincipal Jwt jwt) {

    String userId = jwt.getSubject();                    // Unique user ID
    String email = jwt.getClaimAsString("preferred_username");
    String name = jwt.getClaimAsString("name");

    // Use for auditing, filtering by user, etc.
    return topicService.getAllTopics();
}
```

### 4.5 Set Environment Variables

Add to `docker-compose.yml` for the topic-service:

```yaml
topic-service:
  environment:
    AZURE_TENANT_ID: ${AZURE_TENANT_ID}
    AZURE_CLIENT_ID: ${AZURE_CLIENT_ID}
    # ... existing vars
```

---

## Step 5: Backend - Content Service (FastAPI)

### 5.1 Install Dependencies

Add to `backend/content-service/requirements.txt`:

```
python-jose[cryptography]==3.3.0
httpx==0.27.0
```

`python-jose` handles JWT decoding and verification. `httpx` is already present for async HTTP requests.

### 5.2 Create Auth Middleware

Create `backend/content-service/auth.py`:

```python
"""Microsoft Entra ID JWT validation for FastAPI."""

import logging
from functools import lru_cache

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer()

TENANT_ID = settings.azure_tenant_id
CLIENT_ID = settings.azure_client_id
AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
JWKS_URI = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"


async def get_signing_keys() -> dict:
    """Fetch Microsoft's public signing keys (JWKS)."""
    async with httpx.AsyncClient() as client:
        response = await client.get(JWKS_URI)
        response.raise_for_status()
        return response.json()


_jwks_cache: dict | None = None


async def get_jwks() -> dict:
    """Cache JWKS to avoid fetching on every request."""
    global _jwks_cache
    if _jwks_cache is None:
        _jwks_cache = await get_signing_keys()
    return _jwks_cache


async def validate_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate the JWT access token from the Authorization header.

    Returns the decoded token claims if valid, raises 401 otherwise.
    """
    token = credentials.credentials

    try:
        jwks = await get_jwks()

        # Decode without verification first to get the key ID
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        # Find the matching key
        rsa_key = None
        for key in jwks.get("keys", []):
            if key["kid"] == kid:
                rsa_key = key
                break

        if rsa_key is None:
            # Key not found — might be rotated. Refresh cache and retry.
            global _jwks_cache
            _jwks_cache = None
            jwks = await get_jwks()
            for key in jwks.get("keys", []):
                if key["kid"] == kid:
                    rsa_key = key
                    break

        if rsa_key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find signing key",
            )

        # Verify and decode the token
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=f"api://{CLIENT_ID}",
            issuer=f"https://login.microsoftonline.com/{TENANT_ID}/v2.0",
        )

        return payload

    except JWTError as e:
        logger.warning("JWT validation failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
```

### 5.3 Update Config

Add to `backend/content-service/config.py`:

```python
class Settings(BaseSettings):
    # ... existing fields ...
    azure_tenant_id: str = ""
    azure_client_id: str = ""
```

### 5.4 Protect Endpoints

Update `backend/content-service/main.py`:

```python
from auth import validate_token

@app.post("/api/content/generate", response_model=ContentGenerateResponse)
async def generate_content_endpoint(
    request: ContentGenerateRequest,
    token_claims: dict = Depends(validate_token),  # Add this
):
    # token_claims contains user info: sub, name, email, etc.
    # Rest of the function stays the same
    ...
```

### 5.5 Set Environment Variables

Add to `docker-compose.yml` for the content-service:

```yaml
content-service:
  environment:
    AZURE_TENANT_ID: ${AZURE_TENANT_ID}
    AZURE_CLIENT_ID: ${AZURE_CLIENT_ID}
    # ... existing vars
```

---

## Step 6: Nginx Gateway - Pass Auth Headers

Update `infra/nginx/nginx.conf` to pass the `Authorization` header through:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream topic-service {
        server topic-service:8081;
    }

    upstream content-service {
        server content-service:8082;
    }

    server {
        listen 80;

        # Topic Service API
        location /api/topics {
            proxy_pass http://topic-service;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Authorization $http_authorization;  # Pass JWT
        }

        # Content Service API
        location /api/content {
            proxy_pass http://content-service;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Authorization $http_authorization;  # Pass JWT
        }

        # Health check (no auth needed)
        location /health {
            return 200 '{"status":"ok"}';
            add_header Content-Type application/json;
        }
    }
}
```

> Nginx passes `Authorization` headers by default for most proxy configurations, but explicitly setting `proxy_set_header Authorization` makes the intent clear and avoids issues with certain Nginx versions.

---

## Step 7: Docker Compose Environment Variables

Create a `.env` file in the project root:

```bash
# .env (project root)
OPENAI_API_KEY=your-openai-key
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
```

These are referenced in `docker-compose.yml` as `${AZURE_TENANT_ID}` and `${AZURE_CLIENT_ID}`.

---

## Where Auth is Enforced (Summary)

```
Layer               What Happens                      File to Modify
─────────────────────────────────────────────────────────────────────────
Browser             MSAL.js acquires + stores tokens   shell-app/lib/auth-provider.js
Shell App           AuthGuard redirects to /login      shell-app/pages/_app.js
Login Page          Microsoft login popup/redirect     shell-app/pages/login.js
MFE API Clients     Attach Bearer token to requests    */lib/api.js (authFetch wrapper)
Nginx Gateway       Passes Authorization header        infra/nginx/nginx.conf
Topic Service       Spring Security validates JWT      config/SecurityConfig.java
Content Service     FastAPI dependency validates JWT    auth.py + main.py
```

---

## Auth Flow Sequence Diagram

```
User        Shell App       Entra ID        Nginx       Topic Svc     Content Svc
 │              │               │              │            │              │
 │──GET /───────▶               │              │            │              │
 │              │               │              │            │              │
 │  No token?  │               │              │            │              │
 │◀─redirect───│               │              │            │              │
 │  to /login  │               │              │            │              │
 │              │               │              │            │              │
 │──click──────▶               │              │            │              │
 │  "Sign in"  │               │              │            │              │
 │              │──loginPopup──▶              │            │              │
 │              │               │              │            │              │
 │              │    User enters credentials   │            │              │
 │              │               │              │            │              │
 │              │◀─id_token────│              │            │              │
 │              │  access_token │              │            │              │
 │              │               │              │            │              │
 │◀─redirect───│               │              │            │              │
 │  to /topics │               │              │            │              │
 │              │               │              │            │              │
 │              │──GET /api/topics──────────────▶           │              │
 │              │  Authorization: Bearer xxx   │            │              │
 │              │               │              │──proxy────▶│              │
 │              │               │              │ +Auth hdr  │              │
 │              │               │              │            │──verify JWT──▶
 │              │               │              │            │  (JWKS)      │
 │              │               │              │            │◀─valid───────│
 │              │               │              │◀─200 OK───│              │
 │              │◀─topics JSON─────────────────│            │              │
 │◀─render──────│               │              │            │              │
 │  TopicList  │               │              │            │              │
```

---

## Testing Auth Locally

### Without Entra ID (Development Bypass)

For local development without configuring Entra ID, you can add a bypass:

**Topic Service** - create a dev profile in `application-dev.yml`:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ""
  profiles:
    active: dev
```

And add a dev security config:

```java
@Configuration
@Profile("dev")
public class DevSecurityConfig {
    @Bean
    public SecurityFilterChain devSecurityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> {})
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
```

**Content Service** - make the dependency optional:

```python
# In main.py, conditionally apply auth
import os

if os.getenv("AZURE_TENANT_ID"):
    # Production: require auth
    @app.post("/api/content/generate", dependencies=[Depends(validate_token)])
    async def generate_content_endpoint(request: ContentGenerateRequest):
        ...
else:
    # Dev: no auth
    @app.post("/api/content/generate")
    async def generate_content_endpoint(request: ContentGenerateRequest):
        ...
```

### With Entra ID

1. Set up the app registration (Step 1)
2. Set environment variables in `.env.local` files and `.env`
3. Start all services
4. Open `http://localhost:3000` → redirected to `/login`
5. Click "Sign in with Microsoft" → Microsoft login popup
6. After login → redirected to dashboard
7. Navigate to Topics → API calls include Bearer token
8. Check backend logs to confirm JWT validation

---

## Role-Based Access Control (Future Enhancement)

Once basic auth works, you can add RBAC:

### 1. Define App Roles in Entra ID

Go to App registration → App roles → Create:
- `Admin`: Full access (create, delete, generate)
- `Editor`: Edit topics and content
- `Viewer`: Read-only access

### 2. Assign Roles to Users

Enterprise Applications → Your app → Users and groups → Add assignment

### 3. Check Roles in Backend

**Spring Boot:**
```java
@PreAuthorize("hasRole('Admin')")
@DeleteMapping("/api/topics/{id}")
public void deleteTopic(@PathVariable UUID id) { ... }
```

**FastAPI:**
```python
async def require_admin(claims: dict = Depends(validate_token)):
    roles = claims.get("roles", [])
    if "Admin" not in roles:
        raise HTTPException(403, "Admin role required")
    return claims
```

### 4. Check Roles in Frontend

```javascript
const { user } = useAuth();
// user.roles available from token claims
{user.roles?.includes("Admin") && (
  <button onClick={handleDelete}>Delete</button>
)}
```

---

## Checklist

- [ ] Create Entra ID app registration with SPA redirect URI
- [ ] Expose API scope (`access_as_user`)
- [ ] Install `@azure/msal-browser` and `@azure/msal-react` in shell-app
- [ ] Create `auth-config.js`, `auth-provider.js` in shell-app
- [ ] Create `/login` page in shell-app
- [ ] Add `AuthGuard` to `_app.js`
- [ ] Update Navbar with user info and logout
- [ ] Pass `getAccessToken` prop to remote MFEs
- [ ] Update MFE `lib/api.js` files with `authFetch` wrapper
- [ ] Add Spring Security + OAuth2 Resource Server to Topic Service
- [ ] Create `SecurityConfig.java` in Topic Service
- [ ] Add `python-jose` to Content Service requirements
- [ ] Create `auth.py` in Content Service
- [ ] Add `Depends(validate_token)` to Content Service endpoints
- [ ] Update `nginx.conf` to pass Authorization header
- [ ] Set `AZURE_TENANT_ID` and `AZURE_CLIENT_ID` in environment
- [ ] Test login flow end-to-end
