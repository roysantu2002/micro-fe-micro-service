# How Our YouTube Content Planner Gets Deployed on Azure Kubernetes

## A Plain-Language Guide — No Commands, Just Concepts

---

## What Are We Deploying?

Our project is a **YouTube Content Planner** — a web application where users can create video topic ideas and get AI-generated content (hooks, scripts, outlines) for those topics. It is built using two modern software architecture patterns:

- **Micro-Frontends**: The user interface is split into three separate small apps that work together as one
- **Microservices**: The backend logic is split into independent services that communicate through events

Here is every piece of our application:

### The Frontend (What Users See)

| App | What It Does |
|-----|-------------|
| **Shell App** | The main container app. It loads the other two micro-frontends inside itself. Think of it as the "frame" that holds everything together — the navigation bar, the layout, the routing between pages. |
| **Topic Manager MFE** | A small self-contained app for creating, editing, listing, and deleting YouTube video topics. It gets loaded inside the Shell App when the user visits the topics page. |
| **Content Writer MFE** | A small self-contained app that displays the AI-generated content for a topic — the hook, script outline, key points, and call to action. It also gets loaded inside the Shell App. |

All three are built with **Next.js** (a React framework) and connected using **Module Federation** (a Webpack feature that lets one app load components from another app at runtime).

### The Backend (What Does the Work)

| Service | What It Does |
|---------|-------------|
| **Topic Service** | A Java/Spring Boot API that handles all topic operations — create, read, update, delete. It stores topics in the database. When a user asks to generate content for a topic, this service sends a message to Kafka saying "please generate content for this topic." It also listens for messages back from the Content Service saying "here is the generated content" and saves that content to the database. |
| **Content Service** | A Python/FastAPI service that generates content using OpenAI's API. It listens for "generate content" messages on Kafka. When it receives one, it first checks Redis to see if content was already generated for that topic. If yes, it returns the cached version. If no, it calls the OpenAI API, caches the result in Redis, and sends a message back to Kafka saying "content is ready." |

### The Infrastructure (What Keeps Everything Running)

| Component | What It Does |
|-----------|-------------|
| **PostgreSQL** | The database. Stores all topic data and generated content permanently. |
| **Redis** | The cache. Stores recently generated content so we do not call the OpenAI API repeatedly for the same topic. Content stays cached for 24 hours. |
| **Kafka** | The message broker. Enables the Topic Service and Content Service to communicate without directly calling each other. One service publishes a message, the other picks it up when it is ready. |
| **Zookeeper** | Kafka's coordinator. Kafka needs Zookeeper to manage its internal state — which messages have been delivered, which consumers are active, etc. |

---

## What Is Kubernetes and Why Do We Use It?

### The Problem Without Kubernetes

In our local development, we use Docker Compose. It starts all 10+ containers on a single machine with one command. That works fine on a laptop, but it has limitations:

- If the machine goes down, everything goes down
- If one service gets overloaded, there is no automatic way to add more copies
- There is no built-in way to do zero-downtime deployments
- You cannot easily distribute the load across multiple machines

### What Kubernetes Does

Kubernetes (often abbreviated as K8s) is a **container orchestration platform**. In simple terms, it takes your Docker containers and runs them across a cluster of machines, handling all the operational complexity for you:

- **Self-healing**: If a container crashes, Kubernetes automatically restarts it
- **Scaling**: You can tell Kubernetes "run 2 copies of this service" or even "automatically add more copies when CPU usage goes above 70%"
- **Rolling updates**: When you deploy a new version, Kubernetes gradually replaces old containers with new ones, so there is zero downtime
- **Service discovery**: Every service gets a stable internal DNS name, so services can find each other without hardcoding IP addresses
- **Load balancing**: Traffic gets distributed across all copies of a service automatically

### What Is AKS?

**Azure Kubernetes Service (AKS)** is Microsoft Azure's managed Kubernetes offering. "Managed" means Azure handles the Kubernetes control plane (the brain of the cluster) for you — you do not need to install, configure, or maintain Kubernetes itself. You just tell Azure "give me a Kubernetes cluster with 2 machines" and it provisions everything. You then focus on deploying your application into it.

---

## The Azure Resources We Create

Before deploying anything to Kubernetes, we need to set up a few Azure resources. Think of these as the foundation:

### Resource Group

A **resource group** is simply a folder in Azure that holds related resources together. We create one called `rg-yt-planner`. Everything else goes inside it. When we are done learning, we can delete this one folder and everything inside gets cleaned up.

### Azure Container Registry (ACR)

Our application is packaged as Docker images. We need a place to store those images so that Kubernetes can pull them. ACR is Azure's private Docker image storage. Think of it like a private version of Docker Hub.

We build each of our 5 application services into a Docker image:
- `topic-service` image
- `content-service` image
- `shell-app` image
- `topic-manager-mfe` image
- `content-writer-mfe` image

We push all five images to ACR. The infrastructure services (PostgreSQL, Redis, Kafka, Zookeeper) use public images from Docker Hub, so we do not need to build or push those.

### AKS Cluster

The Kubernetes cluster itself. We create it with 2 worker nodes (virtual machines). Each node has 2 CPU cores and 8 GB of RAM. These are the actual machines where our containers will run. Azure manages the master/control plane nodes behind the scenes at no extra cost (on the free tier).

### How ACR and AKS Connect

We link ACR to AKS so that the cluster can pull our private images without needing any username or password configuration. Azure handles this through a "managed identity" — essentially, the cluster has a built-in identity that Azure automatically grants permission to read images from our registry.

---

## How Docker Compose Concepts Map to Kubernetes

If you understand Docker Compose, this table bridges the gap:

| Docker Compose | Kubernetes | What It Means |
|---------------|-----------|--------------|
| A `service` in docker-compose.yml | A **Deployment** (for stateless apps) or **StatefulSet** (for databases) | Defines what container to run, how many copies, and how to configure it |
| The `image:` field | Same `image:` field, but pointing to ACR | Where to pull the container image from |
| The `ports:` field | A **Service** resource | How to expose a container's port so other containers or the outside world can reach it |
| The `environment:` fields | **ConfigMap** (non-sensitive) and **Secret** (sensitive) | Configuration values injected into containers |
| Named `volumes:` | **PersistentVolumeClaim (PVC)** | Storage that survives container restarts, backed by Azure Managed Disks |
| The `depends_on:` field | No direct equivalent — handled by health checks and retry logic | Kubernetes does not guarantee startup order; services must handle dependencies gracefully |
| The shared `network:` | **Namespace** + internal DNS | All services in the same namespace can find each other by name |
| The `healthcheck:` field | **Liveness Probe** and **Readiness Probe** | How Kubernetes knows if a container is healthy and ready to receive traffic |
| `docker-compose up` | `kubectl apply` | The command that makes everything happen |

---

## Kubernetes Resources We Use — Explained

### Namespace

A namespace is a virtual boundary within the cluster. All of our resources live in a namespace called `yt-planner`. This keeps our application isolated from anything else that might run on the same cluster. It is like having a dedicated room in a shared building.

### Deployments (For Stateless Services)

A Deployment tells Kubernetes: "run this container image, keep this many copies running at all times, and if any copy fails, replace it." We use Deployments for our 5 application services because they do not store any data locally — they are stateless:

| Deployment | Replicas | Why Stateless |
|-----------|----------|--------------|
| topic-service | 2 | All data lives in PostgreSQL, not in the container |
| content-service | 2 | All cache lives in Redis, not in the container |
| shell-app | 2 | Just serves HTML/JS/CSS files |
| topic-manager-mfe | 2 | Just serves HTML/JS/CSS files |
| content-writer-mfe | 2 | Just serves HTML/JS/CSS files |

Having 2 replicas means if one copy crashes, the other keeps serving traffic while Kubernetes brings up a replacement. It also means traffic is load-balanced across both copies.

### StatefulSets (For Databases and Brokers)

A StatefulSet is like a Deployment but designed for services that store data. It guarantees:
- Each pod gets a stable name (e.g., `postgres-0`, `kafka-0`) that does not change across restarts
- Each pod gets its own dedicated storage that persists even if the pod restarts
- Pods are started and stopped in a predictable order

We use StatefulSets for our 4 infrastructure services:

| StatefulSet | Replicas | Why StatefulSet |
|------------|----------|----------------|
| PostgreSQL | 1 | Database files must survive restarts |
| Redis | 1 | Cache data persists across restarts (append-only file) |
| Kafka | 1 | Message log data must survive restarts |
| Zookeeper | 1 | Coordination state must survive restarts |

### Services (How Containers Find Each Other)

In Docker Compose, you use the service name to connect to another container (e.g., `postgres:5432`). In Kubernetes, a **Service** resource creates a stable internal DNS name for a group of pods.

Our services:

| Service Name | What It Points To | Port | How Other Pods Reach It |
|-------------|------------------|------|----------------------|
| `postgres-svc` | The PostgreSQL pod | 5432 | `postgres-svc:5432` |
| `redis-svc` | The Redis pod | 6379 | `redis-svc:6379` |
| `kafka-svc` | The Kafka pod | 9092 | `kafka-svc:9092` |
| `zookeeper-svc` | The Zookeeper pod | 2181 | `zookeeper-svc:2181` |
| `topic-service-svc` | The 2 topic-service pods | 8081 | `topic-service-svc:8081` |
| `content-service-svc` | The 2 content-service pods | 8082 | `content-service-svc:8082` |
| `shell-app-svc` | The 2 shell-app pods | 3000 | `shell-app-svc:3000` |
| `topic-manager-mfe-svc` | The 2 topic-manager pods | 3001 | `topic-manager-mfe-svc:3001` |
| `content-writer-mfe-svc` | The 2 content-writer pods | 3002 | `content-writer-mfe-svc:3002` |

When topic-service needs to connect to the database, it uses `postgres-svc:5432`. Kubernetes resolves that name to the actual pod IP automatically. If there are multiple pods behind a service (like 2 replicas of topic-service), Kubernetes load-balances traffic across them.

### ConfigMaps (Non-Sensitive Configuration)

A ConfigMap stores configuration values that get injected into containers as environment variables. We have three:

**Topic Service Config** — tells the Spring Boot app where to find Kafka, how to connect to the database driver, which management endpoints to expose for health checks.

**Content Service Config** — tells the FastAPI app which OpenAI model to use, where Redis is, where Kafka is, which Kafka topics to read from and write to.

**Frontend Config** — tells the Shell App where to find the MFE services for server-side rendering (internal cluster URLs) and what base URL the browser should use for API calls.

### Secrets (Sensitive Configuration)

Secrets are like ConfigMaps but for sensitive values — passwords, API keys, connection strings. Kubernetes stores them encoded and restricts access. We have two:

**db-credentials** — the PostgreSQL database name, username, password, and the full JDBC connection string that Spring Boot uses.

**openai-api-key** — the API key for calling OpenAI to generate content.

### Persistent Volume Claims (Storage)

When a database pod restarts, it needs its data to still be there. A PersistentVolumeClaim (PVC) is a request for storage that Kubernetes fulfills by provisioning an Azure Managed Disk. This disk is independent of the pod — even if the pod is deleted and recreated, the disk and its data remain.

| PVC | Size | Attached To | What It Stores |
|-----|------|------------|---------------|
| postgres-storage | 5 GB | PostgreSQL pod | Topic and content database tables |
| redis-storage | 2 GB | Redis pod | Cached AI-generated content |
| kafka-storage | 5 GB | Kafka pod | Event message logs |
| zk-storage | 2 GB | Zookeeper pod | Kafka coordination state |

### Ingress (How the Outside World Reaches Our App)

All the Services described above are internal — they can only be accessed from within the cluster. To make our application accessible from a web browser, we need an **Ingress**.

An Ingress is a set of routing rules that maps external URLs to internal services. It works together with an **Ingress Controller** — a specialized pod that runs NGINX and acts as a reverse proxy.

Here is how traffic flows:

```
User's Browser
      │
      ▼
Azure Load Balancer (automatically created by AKS)
      │
      ▼
NGINX Ingress Controller Pod (runs inside the cluster)
      │
      ├── http://<IP>/                  → shell-app-svc        (port 3000)
      ├── http://<IP>/topic-manager     → topic-manager-mfe-svc (port 3001)
      ├── http://<IP>/content-writer    → content-writer-mfe-svc (port 3002)
      ├── http://<IP>/api/topics        → topic-service-svc      (port 8081)
      └── http://<IP>/api/content       → content-service-svc    (port 8082)
```

When we install the Ingress Controller, Azure automatically creates a public Load Balancer and assigns it an external IP address. That IP is how we access everything — the frontend in the browser and the backend APIs.

### Network Policy (Traffic Rules)

A Network Policy controls which pods are allowed to talk to which other pods. For our learning setup, we use a simple policy:

- All pods within the `yt-planner` namespace can communicate with each other freely
- The Ingress Controller (which lives in a different namespace) is allowed to send traffic into our namespace
- Pods are allowed to make outbound HTTPS calls to the internet (needed for the Content Service to call the OpenAI API)
- Pods are allowed to make DNS queries (needed for service name resolution)

In a production environment, you would lock this down further — for example, only allowing the Content Service to reach Redis, not allowing the Shell App to directly access PostgreSQL, etc.

### Health Checks (Probes)

Kubernetes does not just start a container and hope for the best. It continuously monitors each container using probes:

**Liveness Probe** — "Is this container still alive?" Kubernetes periodically hits a health endpoint. If it fails several times in a row, Kubernetes kills the container and starts a fresh one. For our Topic Service, it hits `/actuator/health/liveness` every 15 seconds.

**Readiness Probe** — "Is this container ready to handle requests?" When a new pod starts, it takes time to initialize (load the Java runtime, connect to the database, etc.). The readiness probe tells Kubernetes "do not send traffic to this pod yet, it is still warming up." Only when the probe succeeds does the pod start receiving traffic.

**Startup Probe** — "Has this container finished its initial startup?" This is specifically for slow-starting applications like our Spring Boot Topic Service. The JVM, Spring framework, and database connection pool all take time to initialize. The startup probe gives the container up to 150 seconds (30 attempts × 5 seconds each) to complete startup before Kubernetes considers it failed.

For each of our services:

| Service | What Gets Checked | Why |
|---------|------------------|-----|
| Topic Service | `/actuator/health` endpoints | Spring Boot Actuator provides detailed health info including database connectivity |
| Content Service | `/health` endpoint | FastAPI custom health check |
| Shell App | `/` (home page) | If the page loads, Next.js is running |
| Topic Manager MFE | `/` (home page) | Same — checks Next.js is serving |
| Content Writer MFE | `/` (home page) | Same |
| PostgreSQL | `pg_isready` command | Built-in Postgres utility that checks if the database is accepting connections |
| Redis | `redis-cli ping` command | Built-in Redis utility — responds with PONG if Redis is healthy |
| Kafka | TCP connection on port 9092 | If the port is accepting connections, Kafka is running |
| Zookeeper | TCP connection on port 2181 | Same approach |

---

## The Deployment Flow — Step by Step

Here is exactly what happens when we deploy our project to AKS, from start to finish:

### Phase 1: Prepare the Foundation

1. **Create an Azure Resource Group** — a container to hold all our Azure resources
2. **Create the ACR** — our private image storage
3. **Create the AKS Cluster** — 2 virtual machines joined together as a Kubernetes cluster
4. **Link ACR to AKS** — so the cluster can pull our images

### Phase 2: Build and Store Container Images

5. **Build Docker images** for each of our 5 application services using their Dockerfiles:
   - Topic Service: Maven builds the Java code, produces a JAR file, packages it with a minimal JRE
   - Content Service: Installs Python dependencies, copies the application code
   - Shell App, Topic Manager MFE, Content Writer MFE: Installs Node.js dependencies, runs `npm run build` for optimized production output
6. **Push all 5 images to ACR** — now they are stored in the cloud and accessible to our cluster

### Phase 3: Install the Ingress Controller

7. **Install the NGINX Ingress Controller** using Helm (a Kubernetes package manager). This creates:
   - Ingress Controller pods that run NGINX inside the cluster
   - An Azure Load Balancer with a public IP address
   - This is the single entry point for all external traffic

### Phase 4: Deploy Everything to Kubernetes

8. **Apply all Kubernetes manifests** — this is done with a single command using Kustomize (a tool that combines multiple YAML files). Here is what Kubernetes does when it receives our manifests:

   **First, the namespace is created** — `yt-planner` — giving us an isolated space.

   **Then, secrets and config maps are created** — these are stored in the cluster and will be injected into pods.

   **Then, infrastructure StatefulSets start up in sequence:**
   - PostgreSQL starts → creates the database, runs the init SQL to create tables
   - Redis starts → ready to accept cache operations
   - Zookeeper starts → ready to coordinate Kafka
   - Kafka starts → connects to Zookeeper, ready to handle messages

   **Then, application Deployments start:**
   - Topic Service pods start (2 replicas) → each connects to PostgreSQL and Kafka
   - Content Service pods start (2 replicas) → each connects to Redis and Kafka, holds the OpenAI API key
   - Shell App pods start (2 replicas) → ready to serve the frontend
   - Topic Manager MFE pods start (2 replicas) → ready to serve topic management components
   - Content Writer MFE pods start (2 replicas) → ready to serve content writer components

   **Finally, the Ingress is created** — routing rules are registered with the NGINX Ingress Controller.

### Phase 5: Everything Is Running

9. **The application is accessible** via the Load Balancer's public IP address:
   - Opening the IP in a browser loads the Shell App
   - The Shell App uses Module Federation to load components from the Topic Manager MFE and Content Writer MFE
   - When the user creates a topic and clicks "Generate Content":
     - The browser calls `/api/topics/{id}/generate`
     - The Ingress Controller routes it to the Topic Service
     - Topic Service publishes a `topic-created` event to Kafka
     - Content Service picks up the event, calls OpenAI, caches in Redis, publishes `content-generated` event
     - Topic Service picks up that event, saves the content to PostgreSQL
     - The browser polls for the result and displays the generated content

---

## How Traffic Flows Through the System

### External Traffic (Browser to App)

```
User types http://<IP>/api/topics in the browser
      │
      ▼
Azure Load Balancer (public IP, managed by Azure)
      │
      ▼
NGINX Ingress Controller (matches path /api/topics)
      │
      ▼
topic-service-svc (Kubernetes Service, port 8081)
      │
      ▼
One of the 2 topic-service pods (load balanced)
      │
      ▼
Response travels back the same path to the browser
```

### Internal Traffic (Service to Service via Kafka)

```
Topic Service pod                        Content Service pod
      │                                        │
      │  1. Publish "topic-created"            │
      ├──────────► Kafka ──────────────────────►│
      │            (kafka-svc:9092)             │
      │                                        │  2. Call OpenAI API
      │                                        │     (external HTTPS)
      │                                        │
      │                                        │  3. Cache result in Redis
      │                                        │     (redis-svc:6379)
      │                                        │
      │  5. Save content to PostgreSQL         │  4. Publish "content-generated"
      │◄────────── Kafka ◄──────────────────────│
      │            (kafka-svc:9092)             │
      │
      ▼
PostgreSQL (postgres-svc:5432)
```

### Module Federation (MFE Loading)

```
Browser loads http://<IP>/
      │
      ▼
Shell App HTML is returned
      │
      ▼
Shell App JavaScript runs in the browser
      │
      ├── Fetches http://<IP>/topic-manager/_next/static/chunks/remoteEntry.js
      │   (Ingress routes to topic-manager-mfe-svc → returns MFE bundle)
      │
      └── Fetches http://<IP>/content-writer/_next/static/chunks/remoteEntry.js
          (Ingress routes to content-writer-mfe-svc → returns MFE bundle)
      │
      ▼
All three apps are now running together in the browser as one unified UI
```

---

## What Kubernetes Does Automatically

Once deployed, Kubernetes continuously manages our application without any manual intervention:

### Self-Healing

If a content-service pod crashes (out of memory, unhandled exception, etc.), Kubernetes detects the failure through the liveness probe and automatically starts a replacement pod. The other content-service replica continues serving traffic during this process. Users do not notice any downtime.

### Rolling Updates

When we push a new version of the topic-service image to ACR and update the deployment, Kubernetes does not stop all old pods and start new ones. Instead:

1. It starts one new pod with the updated image
2. Waits for the new pod to pass its readiness probe
3. Starts routing traffic to the new pod
4. Terminates one old pod
5. Repeats until all pods are running the new version

At no point are zero pods available. Users experience zero downtime.

### Load Balancing

When 2 replicas of the shell-app are running, the Kubernetes Service automatically distributes incoming requests across both pods. If one pod is slower (maybe it is running garbage collection), more requests go to the healthier pod.

### Resource Management

Each pod declaration includes resource requests and limits:
- **Requests**: The minimum CPU and memory guaranteed to the pod. Kubernetes uses this to decide which node to place the pod on.
- **Limits**: The maximum CPU and memory the pod is allowed to use. If it exceeds the memory limit, Kubernetes kills it (out-of-memory). If it exceeds the CPU limit, it gets throttled.

This prevents one misbehaving service from consuming all resources on a node and affecting other services.

---

## The File Structure Explained

All Kubernetes manifests live under `infra/k8s/`:

```
infra/k8s/
├── base/                              Everything our app needs
│   ├── kustomization.yaml             Master file that lists all resources
│   ├── namespace.yaml                 Creates the yt-planner namespace
│   ├── network-policy.yaml            Traffic rules between pods
│   ├── ingress.yaml                   URL routing rules
│   │
│   ├── secrets/
│   │   └── secrets.yaml               Database passwords, API keys
│   │
│   ├── postgres/
│   │   └── statefulset.yaml           Database pod + service + init SQL
│   ├── redis/
│   │   └── statefulset.yaml           Cache pod + service
│   ├── kafka/
│   │   ├── zookeeper-statefulset.yaml Zookeeper pod + service
│   │   └── kafka-statefulset.yaml     Kafka pod + service
│   │
│   ├── topic-service/
│   │   ├── deployment.yaml            API pods + service
│   │   └── configmap.yaml             Spring Boot configuration
│   ├── content-service/
│   │   ├── deployment.yaml            API pods + service
│   │   └── configmap.yaml             FastAPI configuration
│   │
│   ├── frontend/
│   │   └── configmap.yaml             Shared frontend configuration
│   ├── shell-app/
│   │   └── deployment.yaml            Host app pods + service
│   ├── topic-manager-mfe/
│   │   └── deployment.yaml            MFE pods + service
│   └── content-writer-mfe/
│       └── deployment.yaml            MFE pods + service
│
└── overlays/
    ├── azure/
    │   └── kustomization.yaml         Azure-specific overrides (image tags)
    └── local/
        └── kustomization.yaml         Local/minikube overrides
```

The **base** folder contains everything the application needs. The **overlays** folder contains environment-specific tweaks. For Azure, the overlay currently just specifies which image tags to use. This pattern (called Kustomize) lets us reuse the same base manifests for different environments without duplicating files.

---

## How This Differs from Docker Compose

| Aspect | Docker Compose (Local) | Kubernetes on AKS (Cloud) |
|--------|----------------------|--------------------------|
| **Where it runs** | Your laptop, single machine | 2+ Azure virtual machines in the cloud |
| **Starting up** | `docker-compose up` — starts all services on one machine | `kubectl apply` — distributes services across multiple nodes |
| **If a container crashes** | It restarts (if `restart: always`), but no health awareness | Kubernetes detects via probes, restarts intelligently, routes traffic away from unhealthy pods |
| **Updating a service** | Stop all, pull new image, restart all — brief downtime | Rolling update — zero downtime, gradual replacement |
| **Scaling** | Cannot run 2 copies of a service easily | Change `replicas: 2` to `replicas: 5` and Kubernetes handles it |
| **Storage** | Docker volumes on local disk | Azure Managed Disks — durable, backed up, survives node failures |
| **Networking** | All containers on one Docker network, access by service name | Kubernetes DNS, Services with load balancing, Ingress for external access |
| **Configuration** | `.env` file and `environment:` in compose | ConfigMaps and Secrets — versioned, auditable, injected into pods |
| **Accessing the app** | `http://localhost:3000` | `http://<Azure-Load-Balancer-IP>/` — accessible from anywhere on the internet |
| **Cost** | Free (your laptop) | ~$146/month for the Azure resources (can be stopped when not in use) |

---

## Key Takeaways

1. **Kubernetes does not replace Docker** — it builds on top of it. We still use Dockerfiles to build images. Kubernetes orchestrates where and how those images run.

2. **Everything is declarative** — we write YAML files that describe the desired state ("I want 2 copies of topic-service running"). Kubernetes continuously works to make reality match that desired state.

3. **Services are the glue** — in Kubernetes, a Service gives a stable name and IP to a set of pods. Without Services, pods would have random IPs that change every time they restart.

4. **The Ingress is the front door** — it is the single point where external traffic enters the cluster and gets routed to the right service based on the URL path.

5. **StatefulSets are for data, Deployments are for logic** — anything that stores data on disk uses a StatefulSet with persistent storage. Anything that is stateless (our APIs, our frontends) uses a Deployment.

6. **Health probes are critical** — without them, Kubernetes would send traffic to broken containers. With them, Kubernetes knows exactly when a pod is alive, ready, and healthy.

7. **The cluster is self-managing** — once deployed, Kubernetes handles crashes, restarts, load balancing, and scaling automatically. You intervene only when you want to change something (new version, more replicas, different configuration).
