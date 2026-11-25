# Master Plan: rsbuild MFE + Azure Container Apps Deployment

> **Status**: Planning document — review and confirm before executing any section.
> **Subscription**: `ac91a2b4-4d65-4c8d-9e4f-db410eef92a0`
> **GitHub**: `github.com/santuroy/micro-fe-micro-service`
> **Registry**: `ghcr.io/santuroy/micro-fe-micro-service`
> **Azure Region**: `eastus`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Part 1 — rsbuild MFE Migration](#part-1--rsbuild-mfe-migration)
3. [Part 2 — Containerization](#part-2--containerization)
4. [Part 3 — GitHub Actions CI/CD](#part-3--github-actions-cicd)
5. [Part 4 — Azure Terraform Infrastructure](#part-4--azure-terraform-infrastructure)
6. [Part 5 — Azure Entra ID Auth (MSAL)](#part-5--azure-entra-id-auth-msal)
7. [Part 6 — Secrets Checklist](#part-6--secrets-checklist)
8. [Part 7 — Deployment Sequence](#part-7--deployment-sequence)

---

## 1. Architecture Overview

### What Changes: Next.js → rsbuild

| Concern | Before (Next.js) | After (rsbuild) |
|---|---|---|
| Build tool | Webpack via Next.js | Rspack via rsbuild (10–20× faster) |
| MFE plugin | `@module-federation/nextjs-mf` | `@module-federation/rsbuild-plugin` |
| Output | Node.js server (`.next/`) | Static files (`dist/`) |
| Container | Node.js runtime (`npm start`) | nginx serving static HTML/JS/CSS |
| Image size | ~300 MB (node runtime) | ~25 MB (nginx alpine only) |
| remoteEntry | `remoteEntry.js` | `mf-manifest.json` (MF 2.0) |

### Production Architecture on Azure

```
                           Browser
                              │
                              │ HTTPS
                              ▼
                   ┌──────────────────────┐
                   │  Azure Container App  │
                   │      host-app         │  ← External (public HTTPS URL)
                   │   nginx + React SPA   │
                   │   MSAL Auth Guard     │
                   └──────────┬───────────┘
                              │  Internal VNet DNS
              ┌───────────────┴────────────────┐
              │                                │
              ▼                                ▼
 ┌────────────────────────┐    ┌──────────────────────────┐
 │   Azure Container App  │    │    Azure Container App   │
 │   topic-manager-mfe    │    │    content-writer-mfe    │
 │   nginx (internal)     │    │    nginx (internal)      │
 └────────────────────────┘    └──────────────────────────┘

   All 3 apps live in the same Container Apps Environment (VNet)
   host-app nginx reverse-proxies /mfe/* to sub-apps → single public URL
   Browser fetches MFE chunks via same-origin proxy → no CORS issues
```

### Directory Structure After Migration

```
micro-fe-micro-service/
├── .github/
│   └── workflows/
│       └── build-and-push.yml
├── frontend/
│   ├── host-app/                  ← renamed from shell-app
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── index.tsx
│   │   │   ├── auth/
│   │   │   │   ├── msalConfig.ts
│   │   │   │   └── AuthGuard.tsx
│   │   │   └── components/
│   │   ├── nginx/
│   │   │   └── nginx.conf
│   │   ├── .env.development
│   │   ├── .env.production
│   │   ├── Containerfile
│   │   ├── mfe-config.ts
│   │   ├── rsbuild.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── topic-manager-mfe/
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── index.tsx
│   │   │   └── components/
│   │   │       └── TopicManager.tsx
│   │   ├── nginx/
│   │   │   └── nginx.conf
│   │   ├── .env.development
│   │   ├── Containerfile
│   │   ├── mfe-config.ts
│   │   ├── rsbuild.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── content-writer-mfe/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── index.tsx
│       │   └── components/
│       │       └── ContentWriter.tsx
│       ├── nginx/
│       │   └── nginx.conf
│       ├── .env.development
│       ├── Containerfile
│       ├── mfe-config.ts
│       ├── rsbuild.config.ts
│       ├── tsconfig.json
│       └── package.json
├── infra/
│   └── terraform/
│       ├── providers.tf
│       ├── variables.tf
│       ├── network.tf
│       ├── identity.tf
│       ├── container-apps.tf
│       ├── outputs.tf
│       └── terraform.tfvars
└── docs/
    └── MASTER-RSBUILD-AZURE-PLAN.md   ← this file
```

---

## Part 1 — rsbuild MFE Migration

### 1.1 host-app (was shell-app)

**`frontend/host-app/package.json`**
```json
{
  "name": "host-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "rsbuild dev",
    "build": "rsbuild build",
    "preview": "rsbuild preview",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@azure/msal-browser": "^3.28.0",
    "@azure/msal-react": "^2.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@module-federation/rsbuild-plugin": "^0.6.16",
    "@rsbuild/core": "^1.3.0",
    "@rsbuild/plugin-react": "^1.1.0",
    "@rsbuild/plugin-type-check": "^1.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.7.0"
  }
}
```

**`frontend/host-app/mfe-config.ts`**
```ts
export const MFE_CONFIG = {
  name: 'hostApp',
  remotes: {
    topicManager: {
      name: 'topicManager',
      // Dev: direct URL to running sub-app
      // Prod: same-origin path (proxied by nginx in the container)
      entry: process.env.PUBLIC_TOPIC_MANAGER_REMOTE
        ?? 'http://localhost:3001/mf-manifest.json',
    },
    contentWriter: {
      name: 'contentWriter',
      entry: process.env.PUBLIC_CONTENT_WRITER_REMOTE
        ?? 'http://localhost:3002/mf-manifest.json',
    },
  },
} as const;
```

**`frontend/host-app/rsbuild.config.ts`**
```ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { MFE_CONFIG } from './mfe-config';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginTypeCheck(),
    pluginModuleFederation({
      name: MFE_CONFIG.name,
      remotes: {
        topicManager: MFE_CONFIG.remotes.topicManager.entry,
        contentWriter: MFE_CONFIG.remotes.contentWriter.entry,
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        'react-router-dom': { singleton: true },
      },
    }),
  ],
  source: {
    entry: { index: './src/index.tsx' },
  },
  html: {
    title: 'YouTube Content Planner',
    template: './public/index.html',
  },
  server: {
    port: 3000,
    proxy: {
      // Local dev: proxy to running sub-apps
      '/mfe/topic-manager': {
        target: 'http://localhost:3001',
        pathRewrite: { '^/mfe/topic-manager': '' },
        changeOrigin: true,
      },
      '/mfe/content-writer': {
        target: 'http://localhost:3002',
        pathRewrite: { '^/mfe/content-writer': '' },
        changeOrigin: true,
      },
    },
  },
  output: {
    distPath: { root: 'dist' },
  },
});
```

**`frontend/host-app/.env.development`**
```
PUBLIC_TOPIC_MANAGER_REMOTE=http://localhost:3001/mf-manifest.json
PUBLIC_CONTENT_WRITER_REMOTE=http://localhost:3002/mf-manifest.json
PUBLIC_ENTRA_CLIENT_ID=<your-client-id-after-app-registration>
PUBLIC_ENTRA_TENANT_ID=<your-tenant-id>
```

**`frontend/host-app/.env.production`**
```
# Same-origin paths: nginx in the container reverse-proxies to internal sub-apps
PUBLIC_TOPIC_MANAGER_REMOTE=/mfe/topic-manager/mf-manifest.json
PUBLIC_CONTENT_WRITER_REMOTE=/mfe/content-writer/mf-manifest.json
PUBLIC_ENTRA_CLIENT_ID=<injected-at-build-time-via-github-actions-vars>
PUBLIC_ENTRA_TENANT_ID=<injected-at-build-time-via-github-actions-vars>
```

**`frontend/host-app/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src", "mfe-config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**`frontend/host-app/src/auth/msalConfig.ts`**
```ts
import { Configuration, LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.PUBLIC_ENTRA_CLIENT_ID ?? '',
    authority: `https://login.microsoftonline.com/${process.env.PUBLIC_ENTRA_TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error('[MSAL]', message);
      },
    },
  },
};

export const loginRequest = {
  scopes: ['openid', 'profile', 'User.Read'],
};
```

**`frontend/host-app/src/auth/AuthGuard.tsx`**
```tsx
import { useIsAuthenticated, useMsal, MsalAuthenticationTemplate } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';
import type { ReactNode } from 'react';

function LoginFallback() {
  const { instance } = useMsal();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '20vh' }}>
      <h1>YouTube Content Planner</h1>
      <p>Please sign in to continue.</p>
      <button onClick={() => instance.loginPopup(loginRequest)}>
        Sign in with Microsoft
      </button>
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  return (
    <MsalAuthenticationTemplate
      interactionType={InteractionType.Redirect}
      authenticationRequest={loginRequest}
      errorComponent={() => <p>Authentication error.</p>}
      loadingComponent={() => <p>Signing in...</p>}
    >
      {children}
    </MsalAuthenticationTemplate>
  );
}
```

**`frontend/host-app/src/index.tsx`**
```tsx
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './auth/msalConfig';
import App from './App';

const msalInstance = new PublicClientApplication(msalConfig);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </StrictMode>
);
```

**`frontend/host-app/src/App.tsx`**
```tsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthGuard } from './auth/AuthGuard';
import { useMsal } from '@azure/msal-react';

// Lazy-load remote MFE components
const TopicManagerApp = lazy(() => import('topicManager/App'));
const ContentWriterApp = lazy(() => import('contentWriter/App'));

function NavBar() {
  const { instance, accounts } = useMsal();
  const user = accounts[0]?.name ?? accounts[0]?.username;
  return (
    <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem', alignItems: 'center' }}>
      <strong>YT Content Planner</strong>
      <Link to="/">Home</Link>
      <Link to="/topics">Topics</Link>
      <Link to="/content">Content Writer</Link>
      <span style={{ marginLeft: 'auto' }}>{user}</span>
      <button onClick={() => instance.logoutPopup()}>Sign out</button>
    </nav>
  );
}

export default function App() {
  return (
    <AuthGuard>
      <BrowserRouter>
        <NavBar />
        <main style={{ padding: '2rem' }}>
          <Suspense fallback={<p>Loading…</p>}>
            <Routes>
              <Route path="/" element={<h2>Welcome to YouTube Content Planner</h2>} />
              <Route path="/topics/*" element={<TopicManagerApp />} />
              <Route path="/content/*" element={<ContentWriterApp />} />
            </Routes>
          </Suspense>
        </main>
      </BrowserRouter>
    </AuthGuard>
  );
}
```

**`frontend/host-app/public/index.html`**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>YouTube Content Planner</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

---

### 1.2 topic-manager-mfe

**`frontend/topic-manager-mfe/package.json`**
```json
{
  "name": "topic-manager-mfe",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "rsbuild dev",
    "build": "rsbuild build",
    "preview": "rsbuild preview",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@module-federation/rsbuild-plugin": "^0.6.16",
    "@rsbuild/core": "^1.3.0",
    "@rsbuild/plugin-react": "^1.1.0",
    "@rsbuild/plugin-type-check": "^1.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.7.0"
  }
}
```

**`frontend/topic-manager-mfe/mfe-config.ts`**
```ts
export const MFE_CONFIG = {
  name: 'topicManager',
  exposes: {
    './App': './src/App',
    './TopicManager': './src/components/TopicManager',
  },
} as const;
```

**`frontend/topic-manager-mfe/rsbuild.config.ts`**
```ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { MFE_CONFIG } from './mfe-config';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginTypeCheck(),
    pluginModuleFederation({
      name: MFE_CONFIG.name,
      exposes: MFE_CONFIG.exposes,
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
      },
    }),
  ],
  source: {
    entry: { index: './src/index.tsx' },
  },
  html: { title: 'Topic Manager' },
  server: { port: 3001 },
  output: { distPath: { root: 'dist' } },
});
```

**`frontend/topic-manager-mfe/src/index.tsx`** (standalone dev entry)
```tsx
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
```

**`frontend/topic-manager-mfe/src/App.tsx`**
```tsx
import { useState, useEffect } from 'react';

const API_BASE = process.env.PUBLIC_API_URL ?? 'http://localhost:8080';

export default function App() {
  const [topics, setTopics] = useState<{ id: number; title: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/topics`)
      .then((r) => r.json())
      .then((data) => setTopics(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading topics…</p>;
  return (
    <div>
      <h2>Topics</h2>
      <ul>
        {topics.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

**`frontend/topic-manager-mfe/src/components/TopicManager.tsx`**
```tsx
export { default } from '../App';
```

---

### 1.3 content-writer-mfe

**`frontend/content-writer-mfe/package.json`**
```json
{
  "name": "content-writer-mfe",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "rsbuild dev",
    "build": "rsbuild build",
    "preview": "rsbuild preview",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@module-federation/rsbuild-plugin": "^0.6.16",
    "@rsbuild/core": "^1.3.0",
    "@rsbuild/plugin-react": "^1.1.0",
    "@rsbuild/plugin-type-check": "^1.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.7.0"
  }
}
```

**`frontend/content-writer-mfe/mfe-config.ts`**
```ts
export const MFE_CONFIG = {
  name: 'contentWriter',
  exposes: {
    './App': './src/App',
    './ContentWriter': './src/components/ContentWriter',
  },
} as const;
```

**`frontend/content-writer-mfe/rsbuild.config.ts`**
```ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { MFE_CONFIG } from './mfe-config';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginTypeCheck(),
    pluginModuleFederation({
      name: MFE_CONFIG.name,
      exposes: MFE_CONFIG.exposes,
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
      },
    }),
  ],
  source: {
    entry: { index: './src/index.tsx' },
  },
  html: { title: 'Content Writer' },
  server: { port: 3002 },
  output: { distPath: { root: 'dist' } },
});
```

**`frontend/content-writer-mfe/src/index.tsx`**
```tsx
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
```

**`frontend/content-writer-mfe/src/App.tsx`**
```tsx
import { useState } from 'react';

const API_BASE = process.env.PUBLIC_API_URL ?? 'http://localhost:8080';

export default function App() {
  const [topicId, setTopicId] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/content/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId }),
      });
      const data = await res.json();
      setContent(data.content ?? '');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Content Writer</h2>
      <input
        value={topicId}
        onChange={(e) => setTopicId(e.target.value)}
        placeholder="Topic ID"
      />
      <button onClick={generate} disabled={loading || !topicId}>
        {loading ? 'Generating…' : 'Generate Content'}
      </button>
      {content && <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>}
    </div>
  );
}
```

**`frontend/content-writer-mfe/src/components/ContentWriter.tsx`**
```tsx
export { default } from '../App';
```

---

## Part 2 — Containerization

> **Key design**: rsbuild outputs static files to `dist/`. The production image is nginx-only (no Node.js runtime). The host-app nginx reverse-proxies `/mfe/topic-manager/*` and `/mfe/content-writer/*` to the internal Container App services, so sub-apps stay private (no external ingress) and the browser uses a single origin.

### 2.1 Containerfile — host-app

**`frontend/host-app/Containerfile`**
```dockerfile
# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

COPY . .

# These are injected by GitHub Actions as build args
ARG PUBLIC_TOPIC_MANAGER_REMOTE=/mfe/topic-manager/mf-manifest.json
ARG PUBLIC_CONTENT_WRITER_REMOTE=/mfe/content-writer/mf-manifest.json
ARG PUBLIC_ENTRA_CLIENT_ID
ARG PUBLIC_ENTRA_TENANT_ID

ENV PUBLIC_TOPIC_MANAGER_REMOTE=$PUBLIC_TOPIC_MANAGER_REMOTE
ENV PUBLIC_CONTENT_WRITER_REMOTE=$PUBLIC_CONTENT_WRITER_REMOTE
ENV PUBLIC_ENTRA_CLIENT_ID=$PUBLIC_ENTRA_CLIENT_ID
ENV PUBLIC_ENTRA_TENANT_ID=$PUBLIC_ENTRA_TENANT_ID
ENV NODE_ENV=production

RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

### 2.2 Containerfile — sub-apps (topic-manager-mfe & content-writer-mfe)

The same template for both sub-apps:

**`frontend/topic-manager-mfe/Containerfile`** (and identical for `content-writer-mfe/Containerfile`):
```dockerfile
# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

COPY . .

ARG PUBLIC_API_URL=http://nginx
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV NODE_ENV=production

RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

### 2.3 nginx.conf — host-app (with reverse proxy to sub-apps)

**`frontend/host-app/nginx/nginx.conf`**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Cache immutable JS/CSS assets from rsbuild (they have content-hash in filename)
    location ~* \.(js|css|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy MFE assets from internal Container Apps
    # In prod: http://topic-manager-mfe resolves via Container Apps internal DNS
    location /mfe/topic-manager/ {
        proxy_pass http://topic-manager-mfe/;
        proxy_set_header Host topic-manager-mfe;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_pragma;
        proxy_no_cache $http_pragma;
    }

    location /mfe/content-writer/ {
        proxy_pass http://content-writer-mfe/;
        proxy_set_header Host content-writer-mfe;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_pragma;
        proxy_no_cache $http_pragma;
    }

    # Backend API proxy (also internal)
    location /api/ {
        proxy_pass http://nginx-gateway/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health endpoint (for Container Apps liveness probe)
    location /health {
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }
}
```

### 2.4 nginx.conf — sub-apps

**`frontend/topic-manager-mfe/nginx/nginx.conf`** (identical for `content-writer-mfe`):
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # MFE assets are fetched cross-origin in standalone dev mode;
    # in production they're proxied by host-app so CORS is same-origin.
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type" always;

    location ~* \.(js|css|json|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /health {
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }
}
```

### 2.5 .dockerignore (all three apps)

```
node_modules
dist
coverage
.env.local
*.log
.DS_Store
```

### 2.6 Updated docker-compose.yml (local dev + test)

Add to the existing `docker-compose.yml` to replace the Next.js frontend services:

```yaml
  # ── rsbuild MFE Frontend Services ──────────────────────────

  host-app:
    build:
      context: ./frontend/host-app
      dockerfile: Containerfile
      args:
        PUBLIC_TOPIC_MANAGER_REMOTE: /mfe/topic-manager/mf-manifest.json
        PUBLIC_CONTENT_WRITER_REMOTE: /mfe/content-writer/mf-manifest.json
        PUBLIC_ENTRA_CLIENT_ID: ${PUBLIC_ENTRA_CLIENT_ID:-dummy-client-id}
        PUBLIC_ENTRA_TENANT_ID: ${PUBLIC_ENTRA_TENANT_ID:-dummy-tenant-id}
    container_name: yt-planner-host-app
    ports:
      - "3000:80"
    depends_on:
      - topic-manager-mfe
      - content-writer-mfe
    networks:
      - yt-planner-network

  topic-manager-mfe:
    build:
      context: ./frontend/topic-manager-mfe
      dockerfile: Containerfile
      args:
        PUBLIC_API_URL: http://nginx
    container_name: yt-planner-topic-manager
    networks:
      - yt-planner-network

  content-writer-mfe:
    build:
      context: ./frontend/content-writer-mfe
      dockerfile: Containerfile
      args:
        PUBLIC_API_URL: http://nginx
    container_name: yt-planner-content-writer
    networks:
      - yt-planner-network
```

> Note: Sub-apps have no `ports:` exposed externally — only host-app serves the browser. nginx in host-app routes to sub-apps using Docker network DNS (`topic-manager-mfe` hostname).

---

## Part 3 — GitHub Actions CI/CD

**`.github/workflows/build-and-push.yml`**
```yaml
name: Build & Push MFE Images

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  OWNER: santuroy
  REPO: micro-fe-micro-service

jobs:
  # ── Build topic-manager-mfe ────────────────────────────────
  build-topic-manager:
    name: Build topic-manager-mfe
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.meta.outputs.version }}

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ env.OWNER }}/${{ env.REPO }}/topic-manager-mfe
          tags: |
            type=sha,prefix=sha-
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./frontend/topic-manager-mfe
          file: ./frontend/topic-manager-mfe/Containerfile
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            PUBLIC_API_URL=${{ vars.PUBLIC_API_URL || 'http://nginx' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── Build content-writer-mfe ───────────────────────────────
  build-content-writer:
    name: Build content-writer-mfe
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.meta.outputs.version }}

    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ env.OWNER }}/${{ env.REPO }}/content-writer-mfe
          tags: |
            type=sha,prefix=sha-
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
      - uses: docker/build-push-action@v5
        with:
          context: ./frontend/content-writer-mfe
          file: ./frontend/content-writer-mfe/Containerfile
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            PUBLIC_API_URL=${{ vars.PUBLIC_API_URL || 'http://nginx' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── Build host-app ─────────────────────────────────────────
  build-host-app:
    name: Build host-app
    runs-on: ubuntu-latest
    needs: [build-topic-manager, build-content-writer]
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.meta.outputs.version }}

    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ env.OWNER }}/${{ env.REPO }}/host-app
          tags: |
            type=sha,prefix=sha-
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
      - uses: docker/build-push-action@v5
        with:
          context: ./frontend/host-app
          file: ./frontend/host-app/Containerfile
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            PUBLIC_TOPIC_MANAGER_REMOTE=/mfe/topic-manager/mf-manifest.json
            PUBLIC_CONTENT_WRITER_REMOTE=/mfe/content-writer/mf-manifest.json
            PUBLIC_ENTRA_CLIENT_ID=${{ vars.PUBLIC_ENTRA_CLIENT_ID }}
            PUBLIC_ENTRA_TENANT_ID=${{ vars.PUBLIC_ENTRA_TENANT_ID }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── Deploy to Azure Container Apps (main only) ─────────────
  deploy:
    name: Deploy to Azure
    runs-on: ubuntu-latest
    needs: [build-host-app]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: production

    steps:
      - name: Azure Login
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Deploy topic-manager-mfe
        uses: azure/container-apps-deploy-action@v1
        with:
          resourceGroup: rg-yt-planner
          containerAppName: topic-manager-mfe
          imageToDeploy: ghcr.io/${{ env.OWNER }}/${{ env.REPO }}/topic-manager-mfe:sha-${{ github.sha }}
          registryUrl: ghcr.io
          registryUsername: ${{ github.actor }}
          registryPassword: ${{ secrets.GHCR_PAT_DEPLOY }}

      - name: Deploy content-writer-mfe
        uses: azure/container-apps-deploy-action@v1
        with:
          resourceGroup: rg-yt-planner
          containerAppName: content-writer-mfe
          imageToDeploy: ghcr.io/${{ env.OWNER }}/${{ env.REPO }}/content-writer-mfe:sha-${{ github.sha }}
          registryUrl: ghcr.io
          registryUsername: ${{ github.actor }}
          registryPassword: ${{ secrets.GHCR_PAT_DEPLOY }}

      - name: Deploy host-app
        uses: azure/container-apps-deploy-action@v1
        with:
          resourceGroup: rg-yt-planner
          containerAppName: host-app
          imageToDeploy: ghcr.io/${{ env.OWNER }}/${{ env.REPO }}/host-app:sha-${{ github.sha }}
          registryUrl: ghcr.io
          registryUsername: ${{ github.actor }}
          registryPassword: ${{ secrets.GHCR_PAT_DEPLOY }}
```

### 3.1 GitHub Repository Variables & Secrets to Configure

Go to `github.com/santuroy/micro-fe-micro-service` → Settings → Secrets and Variables → Actions.

**Secrets** (encrypted, never shown in logs):
| Secret Name | Value | Where to Get |
|---|---|---|
| `AZURE_CREDENTIALS` | Service Principal JSON | Step 1 of Part 7 |
| `GHCR_PAT_DEPLOY` | GitHub PAT with `read:packages` | GitHub → Settings → Developer settings → PATs |

**Variables** (plain text, shown in logs):
| Variable Name | Value | Notes |
|---|---|---|
| `PUBLIC_ENTRA_CLIENT_ID` | App Registration Client ID | From Part 5 |
| `PUBLIC_ENTRA_TENANT_ID` | Your Azure Tenant ID | From `az account show` |
| `PUBLIC_API_URL` | `http://nginx-gateway` | Internal gateway URL |

---

## Part 4 — Azure Terraform Infrastructure

**Directory**: `infra/terraform/`

### 4.1 providers.tf

```hcl
terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.53"
    }
  }

  # Recommended: store state in Azure Blob (uncomment after first apply)
  # backend "azurerm" {
  #   resource_group_name  = "rg-yt-planner-tfstate"
  #   storage_account_name = "ytplannertfstate"
  #   container_name       = "tfstate"
  #   key                  = "mfe.tfstate"
  # }
}

provider "azurerm" {
  subscription_id = var.subscription_id
  features {}
}

provider "azuread" {}
```

### 4.2 variables.tf

```hcl
variable "subscription_id" {
  description = "Azure Subscription ID"
  type        = string
  default     = "ac91a2b4-4d65-4c8d-9e4f-db410eef92a0"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
  default     = "rg-yt-planner"
}

variable "environment" {
  description = "Environment tag (dev/uat/prod)"
  type        = string
  default     = "dev"
}

variable "ghcr_username" {
  description = "GitHub username for GHCR pull access"
  type        = string
  default     = "santuroy"
}

variable "ghcr_pat" {
  description = "GitHub PAT with read:packages scope (for Container Apps to pull images)"
  type        = string
  sensitive   = true
}

variable "entra_tenant_id" {
  description = "Azure Entra ID Tenant ID (from: az account show --query tenantId -o tsv)"
  type        = string
}

variable "entra_client_id" {
  description = "Azure Entra ID App Registration Client ID"
  type        = string
}

variable "openai_api_key" {
  description = "OpenAI API Key for content-service"
  type        = string
  sensitive   = true
  default     = ""
}

locals {
  common_tags = {
    environment = var.environment
    project     = "yt-planner-mfe"
    managed_by  = "terraform"
  }
  ghcr_registry  = "ghcr.io"
  image_prefix   = "ghcr.io/santuroy/micro-fe-micro-service"
}
```

### 4.3 network.tf

```hcl
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.common_tags
}

resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-yt-planner"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  address_space       = ["10.0.0.0/16"]
  tags                = local.common_tags
}

# /23 is the minimum size for Azure Container Apps Environment with VNet injection
resource "azurerm_subnet" "container_apps" {
  name                 = "snet-container-apps"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.0.0/23"]

  delegation {
    name = "Microsoft.App.environments"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_network_security_group" "nsg" {
  name                = "nsg-yt-planner"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  # Allow HTTPS from Internet to host-app (Azure manages the LB, this NSG is belt-and-suspenders)
  security_rule {
    name                       = "allow-https-inbound"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-http-inbound"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }

  # Allow intra-VNet traffic (sub-apps communicate via internal DNS)
  security_rule {
    name                       = "allow-vnet-inbound"
    priority                   = 200
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "VirtualNetwork"
  }

  # Allow Azure infrastructure (required for Container Apps health probes)
  security_rule {
    name                       = "allow-azure-lb"
    priority                   = 300
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "AzureLoadBalancer"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "deny-all-inbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = local.common_tags
}

resource "azurerm_subnet_network_security_group_association" "nsg_assoc" {
  subnet_id                 = azurerm_subnet.container_apps.id
  network_security_group_id = azurerm_network_security_group.nsg.id
}
```

### 4.4 identity.tf

```hcl
# User-Assigned Managed Identity — for future use with ACR or Key Vault
# Not strictly needed for GHCR pull (uses PAT) but good practice to provision now
resource "azurerm_user_assigned_identity" "mfe_identity" {
  name                = "id-yt-planner-mfe"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = local.common_tags
}
```

### 4.5 container-apps.tf

```hcl
# ── Log Analytics Workspace (required for Container Apps Environment) ──
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "log-yt-planner"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

# ── Container Apps Environment (shared by all 3 MFE apps) ──
resource "azurerm_container_app_environment" "cae" {
  name                       = "cae-yt-planner"
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  infrastructure_subnet_id   = azurerm_subnet.container_apps.id

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
    minimum_count         = 0
    maximum_count         = 10
  }

  tags = local.common_tags
}

# ── topic-manager-mfe (INTERNAL — not publicly accessible) ──
resource "azurerm_container_app" "topic_manager_mfe" {
  name                         = "topic-manager-mfe"
  container_app_environment_id = azurerm_container_app_environment.cae.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  registry {
    server               = local.ghcr_registry
    username             = var.ghcr_username
    password_secret_name = "ghcr-pat"
  }

  secret {
    name  = "ghcr-pat"
    value = var.ghcr_pat
  }

  ingress {
    external_enabled = false
    target_port      = 80
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "topic-manager-mfe"
      image  = "nginx:alpine"       # placeholder; GitHub Actions will update this
      cpu    = 0.25
      memory = "0.5Gi"

      liveness_probe {
        path      = "/health"
        port      = 80
        transport = "HTTP"
        initial_delay = 10
        period_seconds = 30
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]  # owned by GitHub Actions
  }

  tags = local.common_tags
}

# ── content-writer-mfe (INTERNAL) ──
resource "azurerm_container_app" "content_writer_mfe" {
  name                         = "content-writer-mfe"
  container_app_environment_id = azurerm_container_app_environment.cae.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  registry {
    server               = local.ghcr_registry
    username             = var.ghcr_username
    password_secret_name = "ghcr-pat"
  }

  secret {
    name  = "ghcr-pat"
    value = var.ghcr_pat
  }

  ingress {
    external_enabled = false
    target_port      = 80
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "content-writer-mfe"
      image  = "nginx:alpine"
      cpu    = 0.25
      memory = "0.5Gi"

      liveness_probe {
        path      = "/health"
        port      = 80
        transport = "HTTP"
        initial_delay = 10
        period_seconds = 30
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = local.common_tags
}

# ── host-app (EXTERNAL — public HTTPS URL) ──
resource "azurerm_container_app" "host_app" {
  name                         = "host-app"
  container_app_environment_id = azurerm_container_app_environment.cae.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.mfe_identity.id]
  }

  registry {
    server               = local.ghcr_registry
    username             = var.ghcr_username
    password_secret_name = "ghcr-pat"
  }

  secret {
    name  = "ghcr-pat"
    value = var.ghcr_pat
  }

  ingress {
    external_enabled = true        # PUBLIC — this is the browser-facing URL
    target_port      = 80
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 5

    container {
      name   = "host-app"
      image  = "nginx:alpine"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "PUBLIC_ENTRA_CLIENT_ID"
        value = var.entra_client_id
      }
      env {
        name  = "PUBLIC_ENTRA_TENANT_ID"
        value = var.entra_tenant_id
      }

      liveness_probe {
        path          = "/health"
        port          = 80
        transport     = "HTTP"
        initial_delay = 10
        period_seconds = 30
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = local.common_tags
}
```

### 4.6 outputs.tf

```hcl
output "host_app_url" {
  description = "Public HTTPS URL for the host application (open this in your browser)"
  value       = "https://${azurerm_container_app.host_app.latest_revision_fqdn}"
}

output "topic_manager_internal_fqdn" {
  description = "Internal FQDN for topic-manager-mfe (accessible only within the Container Apps Environment)"
  value       = azurerm_container_app.topic_manager_mfe.latest_revision_fqdn
}

output "content_writer_internal_fqdn" {
  description = "Internal FQDN for content-writer-mfe"
  value       = azurerm_container_app.content_writer_mfe.latest_revision_fqdn
}

output "managed_identity_client_id" {
  description = "Client ID of the Managed Identity (for future ACR or Key Vault integration)"
  value       = azurerm_user_assigned_identity.mfe_identity.client_id
}

output "container_apps_environment_name" {
  value = azurerm_container_app_environment.cae.name
}

output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}
```

### 4.7 terraform.tfvars

> **IMPORTANT**: Add `terraform.tfvars` to `.gitignore`. Never commit this file. It contains your GHCR PAT.

```hcl
subscription_id     = "ac91a2b4-4d65-4c8d-9e4f-db410eef92a0"
location            = "eastus"
resource_group_name = "rg-yt-planner"
environment         = "dev"
ghcr_username       = "santuroy"

# Set these via environment variables instead (safer):
# export TF_VAR_ghcr_pat="ghp_xxxxxxxxxxxx"
# export TF_VAR_entra_tenant_id="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
# export TF_VAR_entra_client_id="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
# export TF_VAR_openai_api_key="sk-proj-xxxx"
```

Add to `.gitignore`:
```
infra/terraform/terraform.tfvars
infra/terraform/.terraform/
infra/terraform/*.tfstate
infra/terraform/*.tfstate.backup
infra/terraform/.terraform.lock.hcl
```

---

## Part 5 — Azure Entra ID Auth (MSAL)

MSAL is integrated directly into the host-app (see Part 1 code). What you must configure manually in the Azure Portal:

### 5.1 Create App Registration

1. Go to [portal.azure.com](https://portal.azure.com) → **Entra ID** → **App registrations** → **New registration**
2. Fill in:
   - **Name**: `yt-planner-mfe`
   - **Supported account types**: "Accounts in this organizational directory only (Single tenant)"
   - **Redirect URI**: Platform = `Single-page application (SPA)`, URI = `http://localhost:3000` (add more after deploy)
3. Click **Register**
4. Note the **Application (client) ID** → goes into `PUBLIC_ENTRA_CLIENT_ID`
5. Note the **Directory (tenant) ID** → goes into `PUBLIC_ENTRA_TENANT_ID`

### 5.2 Configure Redirect URIs

After Terraform creates the Container App and you have the host-app URL, add it:

1. App Registration → **Authentication**
2. Under **Single-page application**, add:
   - `http://localhost:3000` (local dev)
   - `https://<host-app-fqdn-from-terraform-output>` (production)
3. Enable **Access tokens** and **ID tokens** under Implicit grant (optional, only needed for certain flows)
4. Save

### 5.3 API Permissions

1. App Registration → **API permissions** → **Add a permission** → **Microsoft Graph**
2. Delegated permissions: add `User.Read`, `openid`, `profile`
3. Click **Grant admin consent** (requires admin role)

### 5.4 How Auth Works in the App

```
Browser loads host-app
    │
    ▼ (unauthenticated)
MsalProvider detects no session
    │
    ▼
AuthGuard redirects to login.microsoftonline.com
    │
    ▼ (user signs in with Microsoft account)
Redirect back to host-app with auth code
    │
    ▼
MsalProvider exchanges code for tokens
    │
    ▼
App renders — user identity available via useMsal() hook
    │
    ▼
Sub-apps (TopicManager, ContentWriter) load inside AuthGuard
  → Sub-apps are trust-shielded: they're never exposed to the internet
  → If sub-apps need the user token, share via Module Federation's shared singleton
```

### 5.5 Sharing Auth Token with Sub-Apps (optional advanced)

In host-app, expose the MSAL instance as a shared module:

```ts
// host-app rsbuild.config.ts (additional expose)
pluginModuleFederation({
  name: 'hostApp',
  exposes: {
    './auth': './src/auth/msalConfig',  // expose msalConfig + loginRequest
  },
  ...
})
```

Sub-apps can then import the shared auth:
```ts
import { msalConfig } from 'hostApp/auth';
```

---

## Part 6 — Secrets Checklist

Before starting the deployment sequence, gather these values:

| # | What | Where to Get | Used In |
|---|---|---|---|
| 1 | **GitHub PAT** (`read:packages`, `write:packages`) | github.com → Settings → Developer settings → PATs → Fine-grained | `GHCR_PAT_DEPLOY` GitHub secret; `TF_VAR_ghcr_pat` |
| 2 | **Azure Service Principal JSON** | `az ad sp create-for-rbac ...` (see Step 3 below) | `AZURE_CREDENTIALS` GitHub secret |
| 3 | **Entra App Client ID** | Azure Portal → App registrations → yt-planner-mfe | `PUBLIC_ENTRA_CLIENT_ID` GitHub var; `TF_VAR_entra_client_id` |
| 4 | **Entra Tenant ID** | `az account show --query tenantId -o tsv` | `PUBLIC_ENTRA_TENANT_ID` GitHub var; `TF_VAR_entra_tenant_id` |
| 5 | **OpenAI API Key** | From your `.env` file (already have it) | `TF_VAR_openai_api_key` |

### Create Azure Service Principal (run this once)

```bash
az login
az account set --subscription ac91a2b4-4d65-4c8d-9e4f-db410eef92a0

az ad sp create-for-rbac \
  --name "sp-yt-planner-github-actions" \
  --role "Contributor" \
  --scopes "/subscriptions/ac91a2b4-4d65-4c8d-9e4f-db410eef92a0" \
  --json-auth
```

Copy the entire JSON output → paste as `AZURE_CREDENTIALS` secret in GitHub.

### Create GitHub PAT

1. github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
2. Repository access: `micro-fe-micro-service` only
3. Permissions: **Packages** → Read and write (for push from Actions), plus Read (for Azure pull)
4. Copy token → save as `GHCR_PAT_DEPLOY` GitHub secret
5. Same token → use as `TF_VAR_ghcr_pat` when running Terraform

---

## Part 7 — Deployment Sequence

Execute in this exact order. Do **not** skip steps.

### Step 1: Migrate frontend code (do first, local)

```bash
# 1a. Create new host-app directory structure
mv frontend/shell-app frontend/host-app

# 1b. Replace all files with rsbuild versions from this plan
# (Part 1 code blocks above)

# 1c. Update topic-manager-mfe and content-writer-mfe
# Replace Next.js files with rsbuild versions from Part 1

# 1d. Verify local dev works
cd frontend/host-app && npm install && npm run dev    # :3000
cd frontend/topic-manager-mfe && npm install && npm run dev  # :3001
cd frontend/content-writer-mfe && npm install && npm run dev # :3002
```

### Step 2: Create .github/workflows directory and add workflow

```bash
mkdir -p .github/workflows
# Add build-and-push.yml from Part 3
```

### Step 3: Create Terraform files

```bash
mkdir -p infra/terraform
# Add all .tf files from Part 4
```

### Step 4: Set GitHub Secrets and Variables

```
GitHub repo → Settings → Secrets and Variables → Actions
Add secrets: AZURE_CREDENTIALS, GHCR_PAT_DEPLOY
Add variables: PUBLIC_ENTRA_CLIENT_ID, PUBLIC_ENTRA_TENANT_ID, PUBLIC_API_URL
```

### Step 5: Commit and push to GitHub (triggers image builds)

```bash
git add .
git commit -m "migrate to rsbuild MFE with Azure Container Apps deployment"
git push origin main
```

Watch Actions tab: images will be built and pushed to GHCR (`ghcr.io/santuroy/micro-fe-micro-service/*`).

> The deploy step will fail on first push (Azure infrastructure doesn't exist yet). That's expected. Proceed to Step 6.

### Step 6: Run Terraform (provision Azure infrastructure)

```bash
cd infra/terraform

# Install Terraform if needed: brew install terraform

terraform init

# Set sensitive vars via environment variables (never in tfvars)
export TF_VAR_ghcr_pat="ghp_xxxxxxxxxxxxxxxxxxxx"
export TF_VAR_entra_tenant_id="$(az account show --query tenantId -o tsv)"
export TF_VAR_entra_client_id="<from-app-registration>"

terraform plan -out=tfplan
terraform apply tfplan

# Note the outputs:
# host_app_url = "https://host-app.xxxxxxx.eastus.azurecontainerapps.io"
```

### Step 7: Configure Entra redirect URI

Add `https://host-app.xxxxxxx.eastus.azurecontainerapps.io` to the App Registration's redirect URIs (Part 5.2).

### Step 8: Trigger deploy

```bash
# Push an empty commit to trigger the full workflow including deploy step
git commit --allow-empty -m "trigger deploy to Azure"
git push origin main
```

The GitHub Actions deploy job will now update the Container Apps with the actual MFE images.

### Step 9: Open in browser

```
https://host-app.xxxxxxx.eastus.azurecontainerapps.io
```

You will be redirected to Microsoft login. After signing in with any Microsoft account in your tenant, you will see the YouTube Content Planner with Topics and Content Writer loaded from the internal sub-apps.

---

## Notes & FAQs

**Q: Why is `nginx:alpine` used as placeholder in Terraform?**
A: Terraform creates the Container App with a known-good image so the resource can be provisioned without waiting for GitHub Actions to build images first. The `lifecycle.ignore_changes` block ensures Terraform never overwrites the image that GitHub Actions deploys.

**Q: How does the browser reach topic-manager-mfe if it has no external ingress?**
A: The browser only talks to `host-app`. The host-app's nginx container proxies `/mfe/topic-manager/*` to `http://topic-manager-mfe` using the Container Apps Environment's internal DNS. So from the browser's perspective, everything comes from the same HTTPS origin — no CORS.

**Q: When do I need Managed Identity?**
A: If you later switch from GHCR to Azure Container Registry (ACR), the Managed Identity can be granted `AcrPull` role, eliminating the need for a PAT secret. For now with GHCR it's provisioned but unused.

**Q: How to add more environments (UAT, prod)?**
A: Add `terraform.tfvars.uat` and `terraform.tfvars.prod` with different resource names. Use Terraform workspaces or separate state files. GitHub Actions can be extended with environment-specific jobs.

**Q: What about the backend services (topic-service, content-service)?**
A: They're not part of this plan. They remain on docker-compose locally. Refer to `docs/10-AZURE-AKS-DEPLOYMENT.md` for backend AKS strategy. The `PUBLIC_API_URL` environment variable in the MFE apps points to wherever the backend is running.
