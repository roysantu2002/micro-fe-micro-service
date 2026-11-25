# Module Federation in Containers — How It Works

## What is Module Federation?

Module Federation lets multiple independently deployed JavaScript apps share code **at runtime in the browser** — without npm install, without rebuilding. One app (the **host**) loads components from other apps (the **remotes**) on demand, as if they were local imports.

```
// host-app thinks it's doing a local import
const TopicManager = lazy(() => import('topicManager/TopicManager'));

// but at runtime the browser fetches it from topic-manager-mfe's server
```

---

## The Two Roles

| Role | App | What it does |
|---|---|---|
| **Host** | `host-app` | Consumes remote components, owns the shell, router, auth |
| **Remote** | `topic-manager-mfe` | Exposes components for the host to load |
| **Remote** | `content-writer-mfe` | Exposes components for the host to load |

---

## How It Works — Step by Step

### 1. Build time — remotes declare what they expose

Each remote has an `exposes` block in `rsbuild.config.ts`:

```ts
// topic-manager-mfe/rsbuild.config.ts
pluginModuleFederation({
  name: 'topicManager',
  exposes: {
    './TopicManager': './src/components/TopicManager',
  },
})
```

rsbuild compiles this into a **manifest file**:
```
topic-manager-mfe/dist/mf-manifest.json
```

The manifest describes what modules are available and where the chunks live.

### 2. Build time — host declares where remotes are

```ts
// host-app/rsbuild.config.ts
pluginModuleFederation({
  name: 'hostApp',
  remotes: {
    topicManager: 'http://localhost:3001/mf-manifest.json',   // dev
    contentWriter: 'http://localhost:3002/mf-manifest.json',  // dev
  },
})
```

In production, relative paths are used instead (see below).

### 3. Runtime — browser loads the manifest, then the chunk

```
Browser                        host-app nginx
  │                                 │
  │── GET /mfe/topic-manager/mf-manifest.json ──▶│
  │                                 │── proxy_pass http://topic-manager-mfe/ ──▶ Container App
  │◀── mf-manifest.json ────────────│◀─────────────────────────────────────────│
  │                                 │
  │  [browser parses manifest, finds chunk URLs]
  │
  │── GET /mfe/topic-manager/static/js/TopicManager.chunk.js ──▶│
  │◀── TopicManager component (compiled JS) ────────────────────│
  │
  │  [React renders <TopicManager />]
```

---

## In Development (localhost)

Each app runs its own dev server:

```
host-app          → localhost:3000
topic-manager-mfe → localhost:3001
content-writer-mfe→ localhost:3002
```

The host rsbuild config proxies MFE paths:

```ts
server: {
  proxy: {
    '/mfe/topic-manager': {
      target: 'http://localhost:3001',
      pathRewrite: { '^/mfe/topic-manager': '' },
    },
    '/mfe/content-writer': {
      target: 'http://localhost:3002',
      pathRewrite: { '^/mfe/content-writer': '' },
    },
  },
}
```

Same-origin requests — no CORS issues even in dev.

---

## In Containers (Production)

### The problem without nginx

If each app were accessed directly:

```
host-app       → https://host-app.azurecontainerapps.io
topic-manager  → https://topic-manager-mfe.azurecontainerapps.io   ← CORS blocked
```

The browser would block the cross-origin JS chunk loads.

### The solution — nginx reverse proxy inside host-app container

```
                        host-app container
                   ┌────────────────────────────┐
Browser            │  nginx                     │
   │               │                            │
   │── GET /  ────▶│── serve /usr/share/nginx/  │  (React SPA)
   │               │   html/index.html          │
   │               │                            │
   │── GET /mfe/topic-manager/* ───────────────▶│
   │               │── proxy_pass ──────────────┼──▶ http://topic-manager-mfe/
   │               │   http://topic-manager-mfe/│    (internal Container App DNS)
   │◀── JS chunk ──│◀──────────────────────────-┼──◀ topic-manager-mfe container
   │               │                            │
   └───────────────┴────────────────────────────┘
```

**Key insight:** The browser only ever talks to `host-app`. All MFE requests go to `host-app:443`, nginx proxies them internally. From the browser's perspective it's same-origin — no CORS.

### nginx config (host-app/nginx/nginx.conf)

```nginx
location /mfe/topic-manager/ {
    proxy_pass http://topic-manager-mfe/;    ← internal DNS name
    proxy_http_version 1.1;
    proxy_set_header Host topic-manager-mfe;
}

location /mfe/content-writer/ {
    proxy_pass http://content-writer-mfe/;
    proxy_http_version 1.1;
    proxy_set_header Host content-writer-mfe;
}

location / {
    try_files $uri $uri/ /index.html;        ← SPA fallback
}
```

The internal DNS names (`topic-manager-mfe`, `content-writer-mfe`) are automatically available within the same **Container Apps Environment** — no service discovery configuration needed.

---

## Production Remote URLs

In `.env.production` (baked into the host-app bundle at build time):

```
PUBLIC_TOPIC_MANAGER_REMOTE=/mfe/topic-manager/mf-manifest.json
PUBLIC_CONTENT_WRITER_REMOTE=/mfe/content-writer/mf-manifest.json
```

These are **relative paths** — they work with any domain name. When host-app runs at `https://host-app.kindmeadow.eastus.azurecontainerapps.io`, the browser requests `/mfe/topic-manager/mf-manifest.json` from that same origin, and nginx routes it internally.

---

## Shared Singletons

```ts
shared: {
  react:            { singleton: true },
  'react-dom':      { singleton: true },
  'react-router-dom': { singleton: true },
}
```

**Why singletons matter:** Without this, the browser would load React twice — once from host-app's bundle and once from topic-manager's bundle. Two React instances break hooks (`Invalid hook call` error). Singletons ensure only one copy of React runs across all MFEs.

---

## Container Summary

| Container | nginx serves | nginx proxies |
|---|---|---|
| `host-app` | React SPA (`dist/`) | `/mfe/topic-manager/*` → topic-manager-mfe, `/mfe/content-writer/*` → content-writer-mfe |
| `topic-manager-mfe` | MFE assets (`dist/`) — `mf-manifest.json` + JS chunks | nothing |
| `content-writer-mfe` | MFE assets (`dist/`) — `mf-manifest.json` + JS chunks | nothing |

---

## What Gets Loaded at Runtime

When a user navigates to `/topics`:

```
1. Browser has host-app's index.html + main bundle already loaded
2. React Router renders <TopicsPage>
3. TopicsPage lazy-loads import('topicManager/TopicManager')
4. Module Federation intercepts → fetches /mfe/topic-manager/mf-manifest.json
5. Parses manifest → finds TopicManager chunk URL
6. Fetches /mfe/topic-manager/static/js/TopicManager.abc123.js
7. Executes chunk → TopicManager React component is now available
8. React renders <TopicManager /> inside the host-app shell
```

The user sees one page. Under the hood, the UI is assembled from two independently deployed containers.

---

## Why This Architecture

| Benefit | How |
|---|---|
| Independent deploys | Push topic-manager image → only that container updates |
| No CORS | nginx same-origin proxying |
| No shared state coupling | Each MFE is a self-contained React tree |
| Shared React | Singleton ensures one React instance — no hook errors |
| Small images | Each container is ~25 MB (nginx:alpine + static files) |
| Zero secrets for image pull | Packages public on GHCR — no registry credentials |
