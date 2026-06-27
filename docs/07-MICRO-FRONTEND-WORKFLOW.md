# 07 - Micro-Frontend Workflow

This document explains how the micro-frontend (MFE) architecture works in the YouTube Content Planner project. It covers the runtime loading mechanism, inter-MFE communication, data flow, and how each piece connects to the backend microservices.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Browser (User's Machine)                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Shell App (Port 3000) - HOST                  │  │
│  │  ┌─────────────────┐     ┌──────────────────────────────┐ │  │
│  │  │   Navbar         │     │  Layout (shared wrapper)     │ │  │
│  │  └─────────────────┘     └──────────────────────────────┘ │  │
│  │                                                            │  │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐ │  │
│  │  │  /topics            │  │  /content/[topicId]          │ │  │
│  │  │  ┌───────────────┐  │  │  ┌───────────────────────┐  │ │  │
│  │  │  │ TopicManager  │  │  │  │ ContentWriter         │  │ │  │
│  │  │  │ (Remote MFE)  │  │  │  │ (Remote MFE)          │  │ │  │
│  │  │  └───────────────┘  │  │  └───────────────────────┘  │ │  │
│  │  └─────────────────────┘  └─────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│           │                              │                       │
│   ┌───────┘                              └───────┐               │
│   │ Loaded at runtime                            │               │
│   │ from Port 3001                    from Port 3002             │
│   ▼                                              ▼               │
│  Topic Manager MFE                    Content Writer MFE         │
│  (Standalone Next.js app)             (Standalone Next.js app)   │
└──────────────────────────────────────────────────────────────────┘
                              │
                   All API calls go to
                              │
                              ▼
                    Nginx Gateway (:8080)
                     ┌────────┴────────┐
                     ▼                 ▼
              Topic Service      Content Service
              (Spring Boot)        (FastAPI)
               Port 8081           Port 8082
```

---

## How Module Federation Works

### The Problem It Solves

Without Module Federation, you would need to either:
- Build one giant monolithic frontend (hard to maintain, slow builds)
- Use iframes (poor UX, no shared state, styling issues)
- Deploy separate apps and link between them (not a unified experience)

Module Federation lets separate webpack builds share code at **runtime**. Each MFE is a fully independent Next.js app that can run alone, but when loaded by the shell app, its components appear as if they were part of the shell app itself.

### How It Works Step by Step

**1. Remote MFEs expose components at build time**

Each MFE (topic-manager, content-writer) configures what it shares via `next.config.js`:

```javascript
// frontend/topic-manager-mfe/next.config.js
new NextFederationPlugin({
  name: "topicManager",                              // Unique identifier
  filename: "static/chunks/remoteEntry.js",           // Entry file URL
  exposes: {
    "./TopicManager": "./components/TopicManager",    // What to share
  },
})
```

When you run `npm run build` or `npm run dev`, this creates a `remoteEntry.js` file at:
```
http://localhost:3001/_next/static/chunks/remoteEntry.js
```

This file is a manifest that tells the shell app: "I have a component called `TopicManager`, here's how to load it."

**2. Shell App declares which remotes to consume**

```javascript
// frontend/shell-app/next.config.js
new NextFederationPlugin({
  name: "shellApp",
  remotes: {
    topicManager: `topicManager@http://localhost:3001/_next/static/${
      isServer ? "ssr" : "chunks"
    }/remoteEntry.js`,
    contentWriter: `contentWriter@http://localhost:3002/_next/static/${
      isServer ? "ssr" : "chunks"
    }/remoteEntry.js`,
  },
})
```

The `isServer` check uses different entry points for server-side rendering (SSR) vs client-side rendering. In this project, we use `ssr: false` for dynamic imports, so the `chunks` path is what matters.

**3. Shell App loads remote components with `next/dynamic`**

```javascript
// frontend/shell-app/pages/topics.js
import dynamic from "next/dynamic";

const TopicManager = dynamic(() => import("topicManager/TopicManager"), {
  ssr: false,  // Load client-side only (required for Module Federation)
  loading: () => <div>Loading Topic Manager...</div>,
});
```

When the user visits `/topics`:
1. Next.js renders the page shell (Navbar, Layout)
2. The browser fetches `remoteEntry.js` from `http://localhost:3001`
3. The remote entry tells the browser which JS chunks to load
4. Those chunks are fetched and executed
5. The `TopicManager` component renders inside the shell app

**4. The result**

The user sees a single unified app at `http://localhost:3000`. They don't know that the Topics page is actually served from port 3001 and the Content page from port 3002. The navigation, layout, and styling are consistent.

### The `NEXT_PRIVATE_LOCAL_WEBPACK` Flag

Next.js bundles its own copy of webpack internally. Module Federation needs access to the actual webpack instance to create federation containers. Setting `NEXT_PRIVATE_LOCAL_WEBPACK=true` tells Next.js to use the locally installed webpack package instead of its bundled copy.

This is why each `package.json` has webpack as a direct dependency:
```json
"webpack": "5.88.0"
```

And each npm script sets the flag:
```json
"dev": "NEXT_PRIVATE_LOCAL_WEBPACK=true next dev -p 3001"
```

### The `enhanced-resolve` Override

webpack 5.88+ ships with `enhanced-resolve@5.24.x` which changed its internal `stack` data structure. This breaks Next.js 14's `OptionalPeerDependencyResolvePlugin`. The override in `package.json` pins it to a compatible version:

```json
"overrides": {
  "enhanced-resolve": "5.17.1"
}
```

---

## Communication Between MFEs

### Pattern: Callback Props via Shell App

The shell app is the orchestrator. MFEs don't talk to each other directly. Instead:

```
TopicManager MFE  ──callback──▶  Shell App  ──prop──▶  ContentWriter MFE
     (Port 3001)                  (Port 3000)              (Port 3002)
```

**Step 1: Shell passes a callback to TopicManager**

```javascript
// frontend/shell-app/pages/topics.js
export default function TopicsPage() {
  const router = useRouter();

  const handleViewContent = (topicId) => {
    router.push(`/content/${topicId}`);   // Navigate to content page
  };

  return <TopicManager onViewContent={handleViewContent} />;
}
```

**Step 2: TopicManager calls the callback when user clicks "View Content"**

```javascript
// frontend/topic-manager-mfe/components/TopicCard.js
{topic.status === "completed" && onViewContent && (
  <button onClick={() => onViewContent(topic.id)}>
    View Content
  </button>
)}
```

**Step 3: Shell renders ContentWriter with the topicId**

```javascript
// frontend/shell-app/pages/content/[topicId].js
export default function ContentPage() {
  const { topicId } = useRouter().query;
  return <ContentWriter topicId={topicId} />;
}
```

**Step 4: ContentWriter fetches content for that topicId**

```javascript
// frontend/content-writer-mfe/components/ContentWriter.js
useEffect(() => {
  fetchContent(topicId).then(setContent);
}, [topicId]);
```

### Why This Pattern

- **No coupling**: TopicManager doesn't know about ContentWriter or Next.js routing
- **Testable**: Each MFE can run standalone with mock callbacks
- **Replaceable**: You can swap TopicManager with a different implementation as long as it calls `onViewContent(topicId)`

---

## Data Flow: End to End

### Creating a Topic

```
User fills form in TopicManager MFE
       │
       ▼
TopicForm.js calls onSubmit({ title, description, tags })
       │
       ▼
TopicManager.js calls createTopic(data) from lib/api.js
       │
       ▼
POST http://localhost:8080/api/topics  (Nginx gateway)
       │
       ▼
Nginx proxies to topic-service:8081
       │
       ▼
TopicController.createTopic() → TopicService.createTopic()
       │
       ▼
Saves to PostgreSQL (topics table, status="draft")
       │
       ▼
Returns TopicResponse JSON
       │
       ▼
TopicManager.js calls loadTopics() to refresh the list
       │
       ▼
User sees the new topic card with status "draft"
```

### Generating Content

```
User clicks "Generate Content" on a TopicCard
       │
       ▼
POST /api/topics/{id}/generate → Topic Service
       │
       ▼
Topic Service:
  1. Updates topic status to "generating" in PostgreSQL
  2. Publishes TopicCreatedEvent to Kafka topic "topic-created"
  3. Returns response with status="generating"
       │
       ▼
Frontend: TopicManager starts polling every 3 seconds
       │                                              │
       ▼                                              ▼
Content Service (Kafka consumer):              Frontend polls:
  1. Receives TopicCreatedEvent                GET /api/topics
  2. Checks Redis cache                       every 3 seconds
  3. If miss: calls OpenAI API                waiting for status
  4. Caches result in Redis (24h TTL)         change
  5. Publishes ContentGeneratedEvent
     to Kafka "content-generated"
       │
       ▼
Topic Service (Kafka consumer):
  1. Receives ContentGeneratedEvent
  2. Saves TopicContent to PostgreSQL
  3. Updates topic status to "completed"
       │
       ▼
Frontend polling detects status="completed"
  → Stops polling
  → "View Content" button appears on the card
```

### Viewing and Editing Content

```
User clicks "View Content" on a completed topic
       │
       ▼
onViewContent(topicId) callback fires
       │
       ▼
Shell App navigates to /content/{topicId}
       │
       ▼
ContentWriter MFE loads (dynamic import from port 3002)
       │
       ▼
GET /api/topics/{topicId}/content → Topic Service
       │
       ▼
Returns: { hook, scriptOutline, keyPoints, callToAction }
       │
       ▼
ContentViewer displays each section as a card
       │
       ▼
User clicks "Edit" on a section → ContentEditor opens
       │
       ▼
User modifies text → clicks "Save"
       │
       ▼
PUT /api/topics/{topicId}/content → Topic Service
       │
       ▼
Content saved to PostgreSQL → ContentViewer updates
```

---

## Polling Mechanism

Both MFEs use polling to handle the asynchronous content generation:

### TopicManager Polling

```javascript
// frontend/topic-manager-mfe/components/TopicManager.js

useEffect(() => {
  const hasGenerating = topics.some((t) => t.status === "generating");
  if (hasGenerating) {
    pollingRef.current = setInterval(loadTopics, 3000);  // Poll every 3s
  } else if (pollingRef.current) {
    clearInterval(pollingRef.current);                    // Stop when done
  }
  return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
}, [topics, loadTopics]);
```

- Triggers when any topic has `status === "generating"`
- Polls `GET /api/topics` every 3 seconds
- Stops automatically when all topics leave "generating" state
- Cleanup on unmount

### ContentWriter Polling (Regeneration)

```javascript
// frontend/content-writer-mfe/components/ContentWriter.js

const handleRegenerate = async () => {
  await regenerateContent(topicId);
  const poll = setInterval(async () => {
    const data = await fetchContent(topicId);
    if (data && data.hook) {
      setContent(data);
      clearInterval(poll);
    }
  }, 3000);
  setTimeout(() => clearInterval(poll), 60000);  // 60s timeout
};
```

- Triggers on "Regenerate Content" click
- Polls every 3 seconds for new content
- Stops when content has a `hook` field (indicating generation is complete)
- Hard timeout of 60 seconds

---

## API Routing

All frontend apps make API calls to the same gateway:

```
NEXT_PUBLIC_API_URL = http://localhost:8080  (default, configurable)
```

Nginx routes based on URL path:

| Frontend Request | Nginx Route | Backend Service |
|---|---|---|
| `GET /api/topics` | `/api/topics` | topic-service:8081 |
| `POST /api/topics` | `/api/topics` | topic-service:8081 |
| `PUT /api/topics/{id}` | `/api/topics` | topic-service:8081 |
| `DELETE /api/topics/{id}` | `/api/topics` | topic-service:8081 |
| `POST /api/topics/{id}/generate` | `/api/topics` | topic-service:8081 |
| `GET /api/topics/{id}/content` | `/api/topics` | topic-service:8081 |

All topic-related endpoints (including content retrieval) go through the Topic Service. The Content Service is only reached via Kafka events for content generation.

---

## Standalone Mode vs Federated Mode

Each MFE can run in two modes:

### Standalone Mode (for development)

Run the MFE directly:
```bash
cd frontend/topic-manager-mfe && npm run dev
# Open http://localhost:3001
```

The `pages/index.js` provides a standalone page with a mock callback:
```javascript
<TopicManager
  onViewContent={(topicId) => {
    alert(`View content for topic ${topicId} (standalone mode)`);
  }}
/>
```

### Federated Mode (production use)

Run via the shell app:
```bash
# Start all three
cd frontend/topic-manager-mfe && npm run dev &
cd frontend/content-writer-mfe && npm run dev &
cd frontend/shell-app && npm run dev &
# Open http://localhost:3000
```

The shell app loads the component via Module Federation. The `onViewContent` callback navigates within the shell app.

---

## Adding a New Micro-Frontend

To add a third MFE (e.g., an Analytics Dashboard):

### 1. Create the MFE app

```bash
mkdir -p frontend/analytics-mfe/{pages,components,lib,styles}
```

Copy `package.json`, `next.config.js`, `tailwind.config.js`, `postcss.config.js`, `styles/globals.css`, `pages/_app.js`, `pages/_document.js` from an existing MFE.

### 2. Update the MFE's next.config.js

```javascript
new NextFederationPlugin({
  name: "analytics",                              // Must be unique
  filename: "static/chunks/remoteEntry.js",
  exposes: {
    "./AnalyticsDashboard": "./components/AnalyticsDashboard",
  },
})
```

### 3. Set the port in package.json

```json
"dev": "NEXT_PRIVATE_LOCAL_WEBPACK=true next dev -p 3003"
```

### 4. Register in the Shell App's next.config.js

```javascript
remotes: {
  topicManager: `topicManager@...`,
  contentWriter: `contentWriter@...`,
  analytics: `analytics@http://localhost:3003/_next/static/${
    isServer ? "ssr" : "chunks"
  }/remoteEntry.js`,
},
```

### 5. Create a page in the Shell App

```javascript
// frontend/shell-app/pages/analytics.js
import dynamic from "next/dynamic";

const AnalyticsDashboard = dynamic(
  () => import("analytics/AnalyticsDashboard"),
  { ssr: false, loading: () => <div>Loading...</div> }
);

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
```

### 6. Add to Navbar

```javascript
// frontend/shell-app/components/Navbar.js
const links = [
  { href: "/", label: "Dashboard" },
  { href: "/topics", label: "Topics" },
  { href: "/analytics", label: "Analytics" },  // Add this
];
```

### 7. Add Docker service

Add to `docker-compose.yml`:
```yaml
analytics-mfe:
  build:
    context: ./frontend/analytics-mfe
  ports:
    - "3003:3003"
  environment:
    NEXT_PUBLIC_API_URL: http://nginx
  networks:
    - yt-planner-network
```

---

## Common Issues and Debugging

### "Failed to load remote" error

The remote MFE is not running. Start it:
```bash
cd frontend/topic-manager-mfe && npm run dev
```

### Component renders but has no styling

Tailwind CSS is scoped to each MFE. If the remote component uses Tailwind classes, the remote MFE must have its own Tailwind setup with the classes in its `content` paths.

### "Module not found: topicManager/TopicManager"

Check that:
1. The remote MFE's `next.config.js` has the correct `exposes` key
2. The shell app's `next.config.js` has the correct `remotes` entry
3. The `name` in the remote matches the key in `remotes`

### Changes in remote MFE not reflected

In development, restart the remote MFE dev server. Module Federation caches the remote entry. In production, rebuild and redeploy the remote MFE.

### Build fails with "NEXT_PRIVATE_LOCAL_WEBPACK is not set"

Run via npm scripts (`npm run dev` / `npm run build`) which set this flag automatically. Don't run `next dev` or `next build` directly.
