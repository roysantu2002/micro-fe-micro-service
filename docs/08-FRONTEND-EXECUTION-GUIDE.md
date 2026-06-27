# 08 - Frontend Execution Guide

Step-by-step guide for running, developing, and modifying the frontend micro-frontend applications.

---

## Prerequisites

| Tool | Required Version | Check Command |
|------|-----------------|---------------|
| Node.js | 18.x or 20.x (not 23.x) | `node -v` |
| npm | 9.x+ | `npm -v` |
| Docker | 24.x+ (for containerized mode) | `docker -v` |
| Docker Compose | 2.x+ | `docker compose version` |

> **Node.js version note**: Node.js 23 has compatibility issues with the `enhanced-resolve` package used by webpack. Use Node.js 18 or 20 via `nvm use 18` if needed.

---

## Project Structure

```
frontend/
├── shell-app/                    Port 3000  (Host - loads other MFEs)
│   ├── package.json
│   ├── next.config.js            Module Federation host config
│   ├── pages/
│   │   ├── _app.js               Wraps all pages with Layout
│   │   ├── _document.js          HTML document skeleton
│   │   ├── index.js              Dashboard page
│   │   ├── topics.js             Loads TopicManager from remote MFE
│   │   └── content/
│   │       └── [topicId].js      Loads ContentWriter from remote MFE
│   ├── components/
│   │   ├── Layout.js             Navbar + content container
│   │   └── Navbar.js             Top navigation bar
│   └── styles/globals.css        Tailwind CSS directives
│
├── topic-manager-mfe/            Port 3001  (Remote - exposes TopicManager)
│   ├── package.json
│   ├── next.config.js            Module Federation remote config
│   ├── pages/
│   │   ├── _app.js
│   │   ├── _document.js
│   │   └── index.js              Standalone dev page
│   ├── components/
│   │   ├── TopicManager.js       Main component (exposed via MF)
│   │   ├── TopicList.js          Grid of topic cards
│   │   ├── TopicCard.js          Individual topic with actions
│   │   └── TopicForm.js          Create/edit topic form
│   ├── lib/
│   │   └── api.js                API client functions
│   └── styles/globals.css
│
└── content-writer-mfe/           Port 3002  (Remote - exposes ContentWriter)
    ├── package.json
    ├── next.config.js            Module Federation remote config
    ├── pages/
    │   ├── _app.js
    │   ├── _document.js
    │   └── index.js              Standalone dev page
    ├── components/
    │   ├── ContentWriter.js      Main component (exposed via MF)
    │   ├── ContentViewer.js      Read-only content display
    │   └── ContentEditor.js      Editable textarea per section
    ├── lib/
    │   └── api.js                API client functions
    └── styles/globals.css
```

---

## Quick Start

### Option 1: Run All Three Locally (Development)

Open three terminal windows:

**Terminal 1 - Topic Manager MFE:**
```bash
cd frontend/topic-manager-mfe
npm install
npm run dev
# Running at http://localhost:3001
```

**Terminal 2 - Content Writer MFE:**
```bash
cd frontend/content-writer-mfe
npm install
npm run dev
# Running at http://localhost:3002
```

**Terminal 3 - Shell App (start this last):**
```bash
cd frontend/shell-app
npm install
npm run dev
# Running at http://localhost:3000
```

Open `http://localhost:3000` in your browser.

> **Important**: The remote MFEs (ports 3001, 3002) must be running before the shell app can load their components. The shell app will show "Loading Topic Manager..." or "Loading Content Writer..." indefinitely if the remotes are down.

### Option 2: Run a Single MFE Standalone

Each MFE has its own `pages/index.js` for standalone development:

```bash
cd frontend/topic-manager-mfe
npm install
npm run dev
# Open http://localhost:3001
```

The standalone page provides mock callbacks so you can develop without the shell app.

### Option 3: Docker Compose (Full Stack)

From the project root:
```bash
# Build and start everything (backend + frontend)
docker compose up --build

# Or just the frontend services
docker compose up shell-app topic-manager-mfe content-writer-mfe
```

Ports:
- Shell App: http://localhost:3000
- Topic Manager: http://localhost:3001
- Content Writer: http://localhost:3002
- API Gateway: http://localhost:8080

---

## Environment Variables

### All Frontend Apps

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Nginx API gateway URL |

### Shell App Only

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_TOPIC_MANAGER_URL` | `http://localhost:3001` | Topic Manager MFE base URL |
| `NEXT_PUBLIC_CONTENT_WRITER_URL` | `http://localhost:3002` | Content Writer MFE base URL |

### Setting Environment Variables

**Local development** - create a `.env.local` file:
```bash
# frontend/shell-app/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_TOPIC_MANAGER_URL=http://localhost:3001
NEXT_PUBLIC_CONTENT_WRITER_URL=http://localhost:3002
```

**Docker** - set in `docker-compose.yml`:
```yaml
shell-app:
  environment:
    NEXT_PUBLIC_API_URL: http://nginx
    NEXT_PUBLIC_TOPIC_MANAGER_URL: http://topic-manager-mfe:3001
    NEXT_PUBLIC_CONTENT_WRITER_URL: http://content-writer-mfe:3002
```

---

## Development Workflows

### Making Changes to a Remote MFE Component

Example: Adding a "priority" field to the TopicForm.

**1. Edit the component:**
```bash
# Edit frontend/topic-manager-mfe/components/TopicForm.js
```

Add the new field to the form JSX and include it in the `onSubmit` data.

**2. If the API payload changed, update `lib/api.js`:**

The API client in `frontend/topic-manager-mfe/lib/api.js` just passes through the data object, so usually no change is needed unless you're calling a new endpoint.

**3. Test standalone:**
```bash
cd frontend/topic-manager-mfe
npm run dev
# Open http://localhost:3001 and test the form
```

**4. Test in shell app:**

Restart the topic-manager-mfe dev server (or it will hot-reload), then check `http://localhost:3000/topics`.

### Adding a New Page to the Shell App

**1. Create the page file:**
```javascript
// frontend/shell-app/pages/settings.js
export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>
      {/* page content */}
    </div>
  );
}
```

**2. Add navigation link:**
```javascript
// frontend/shell-app/components/Navbar.js
const links = [
  { href: "/", label: "Dashboard" },
  { href: "/topics", label: "Topics" },
  { href: "/settings", label: "Settings" },  // Add this
];
```

The page automatically gets the shared Layout (Navbar + container) via `pages/_app.js`.

### Adding a New API Endpoint Call

**1. Add the function to the relevant `lib/api.js`:**

```javascript
// frontend/topic-manager-mfe/lib/api.js
export async function archiveTopic(id) {
  const res = await fetch(`${API_BASE}/api/topics/${id}/archive`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to archive topic");
  return res.json();
}
```

**2. Import and use in the component:**

```javascript
import { archiveTopic } from "../lib/api";

const handleArchive = async (id) => {
  await archiveTopic(id);
  await loadTopics();
};
```

### Exposing a New Component from a Remote MFE

**1. Create the component:**
```javascript
// frontend/topic-manager-mfe/components/TopicStats.js
export default function TopicStats({ topics }) {
  return <div>Total: {topics.length}</div>;
}
```

**2. Add to `exposes` in `next.config.js`:**
```javascript
exposes: {
  "./TopicManager": "./components/TopicManager",
  "./TopicStats": "./components/TopicStats",   // Add this
},
```

**3. Restart the MFE dev server** (config changes require restart).

**4. Import in the Shell App:**
```javascript
const TopicStats = dynamic(() => import("topicManager/TopicStats"), {
  ssr: false,
});
```

---

## Build and Production

### Building All Apps

```bash
# Build each app
cd frontend/topic-manager-mfe && npm run build
cd frontend/content-writer-mfe && npm run build
cd frontend/shell-app && npm run build
```

### Running Production Builds Locally

```bash
# In separate terminals
cd frontend/topic-manager-mfe && npm start    # Port 3001
cd frontend/content-writer-mfe && npm start   # Port 3002
cd frontend/shell-app && npm start            # Port 3000
```

### Docker Build

```bash
# Build a single frontend image
cd frontend/topic-manager-mfe
docker build -t yt-planner-topic-manager .

# Build all via compose
docker compose build shell-app topic-manager-mfe content-writer-mfe
```

---

## Styling Guide

### Tailwind CSS

All three MFEs use Tailwind CSS 3.4 with the same configuration pattern. Tailwind is configured independently in each MFE.

**tailwind.config.js** scans:
```javascript
content: [
  "./pages/**/*.{js,jsx}",
  "./components/**/*.{js,jsx}",
]
```

**globals.css** imports:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Design Conventions Used

| Element | Classes |
|---|---|
| Page title | `text-2xl font-bold text-gray-900` or `text-xl font-bold text-gray-900` |
| Card | `bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow` |
| Primary button | `px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700` |
| Secondary button | `px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300` |
| Danger button | `px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded` |
| Text input | `w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500` |
| Error alert | `bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded` |
| Status badge | `px-2 py-1 text-xs font-medium rounded-full` + status color |
| Tag pill | `px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded` |

### Status Badge Colors

| Status | Classes |
|---|---|
| draft | `bg-gray-100 text-gray-700` |
| generating | `bg-yellow-100 text-yellow-800 animate-pulse` |
| completed | `bg-green-100 text-green-800` |
| failed | `bg-red-100 text-red-800` |

---

## File-by-File Reference

### Shell App

| File | Purpose | When to Modify |
|---|---|---|
| `next.config.js` | Module Federation host config, remote URLs | Adding a new remote MFE |
| `pages/_app.js` | Wraps all pages with Layout | Changing global page wrapper |
| `pages/index.js` | Dashboard with links | Changing the dashboard |
| `pages/topics.js` | Loads TopicManager remote | Changing how TopicManager is loaded/configured |
| `pages/content/[topicId].js` | Loads ContentWriter remote | Changing how ContentWriter is loaded |
| `components/Layout.js` | Navbar + max-width container | Changing page layout structure |
| `components/Navbar.js` | Top nav with links | Adding/removing nav items |

### Topic Manager MFE

| File | Purpose | When to Modify |
|---|---|---|
| `next.config.js` | Module Federation remote config, exposes | Exposing new components |
| `components/TopicManager.js` | Main orchestrator, state management | Changing topic management logic |
| `components/TopicList.js` | Grid layout for topic cards | Changing list layout |
| `components/TopicCard.js` | Individual topic display, action buttons | Changing card design or actions |
| `components/TopicForm.js` | Create/edit form fields | Adding/removing form fields |
| `lib/api.js` | All API calls to topic endpoints | Adding new API calls |
| `pages/index.js` | Standalone dev page | Changing standalone dev experience |

### Content Writer MFE

| File | Purpose | When to Modify |
|---|---|---|
| `next.config.js` | Module Federation remote config, exposes | Exposing new components |
| `components/ContentWriter.js` | Main orchestrator, fetch + state | Changing content management logic |
| `components/ContentViewer.js` | Read-only section display | Changing content display layout |
| `components/ContentEditor.js` | Textarea editor per section | Changing edit experience |
| `lib/api.js` | API calls for content endpoints | Adding new API calls |
| `pages/index.js` | Standalone dev page with topicId input | Changing standalone dev experience |

---

## Troubleshooting

### Installation Issues

**Problem: `npm install` fails with peer dependency conflicts**
```bash
npm install --legacy-peer-deps
```

**Problem: Build fails with "Cannot find module 'webpack/lib/util/identifier'"**

Ensure `webpack` is listed as a direct dependency in `package.json`:
```json
"webpack": "5.88.0"
```

**Problem: Build fails with "_resolveContext_stack.delete is not a function"**

Ensure the `overrides` section exists in `package.json`:
```json
"overrides": {
  "enhanced-resolve": "5.17.1"
}
```
Then delete `node_modules` and `package-lock.json` and reinstall.

### Runtime Issues

**Problem: "Loading Topic Manager..." never resolves**

The remote MFE is not running. Start it:
```bash
cd frontend/topic-manager-mfe && npm run dev
```

**Problem: API calls fail with CORS errors**

The backend services need CORS headers. The Topic Service has `CorsConfig.java` that allows all origins. For the Content Service, FastAPI's CORS middleware is configured in `main.py`. If adding new backend services, configure CORS similarly.

**Problem: API calls fail with network errors**

Check that:
1. The API gateway (Nginx) is running on port 8080
2. The backend services are running (ports 8081, 8082)
3. `NEXT_PUBLIC_API_URL` is set correctly

**Problem: Changes not appearing after code edit**

- Component changes: Hot reload should pick them up. If not, refresh the browser.
- `next.config.js` changes: Restart the dev server.
- `package.json` changes: Run `npm install`, then restart.
- `tailwind.config.js` changes: Restart the dev server.

**Problem: Docker build fails**

Ensure `.dockerignore` excludes `node_modules` and `.next`:
```
node_modules
.next
.git
```

---

## Key Dependency Versions

These versions are tested and known to work together:

| Package | Version | Notes |
|---|---|---|
| `next` | `^14.2.29` | Pages Router required (not App Router) |
| `react` | `^18.3.1` | Must match across all MFEs |
| `react-dom` | `^18.3.1` | Must match across all MFEs |
| `@module-federation/nextjs-mf` | `^8.7.0` | v8 supports Next.js 14 |
| `webpack` | `5.88.0` | Pinned for compatibility |
| `enhanced-resolve` | `5.17.1` | Overridden to avoid stack API break |
| `tailwindcss` | `^3.4.17` | Utility-first CSS |

> **Do not** upgrade `webpack` beyond 5.88.0 or remove the `enhanced-resolve` override without testing the build first.
