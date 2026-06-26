# Project Plan: YouTube Content Planner (Micro-Frontend + Microservices)

## Goal

Build a simple YouTube content planning tool to learn industry-standard patterns:
- Micro-frontends with Next.js (Module Federation)
- Microservices with Spring Boot and FastAPI
- Event-driven architecture with Kafka
- Caching with Redis
- Containerization with Docker
- Orchestration with Azure Kubernetes Service (AKS)

## Architecture Overview

```
                    ┌─────────────────────────────────┐
                    │        Shell / Host App          │
                    │         (Next.js - Port 3000)    │
                    ├────────────────┬────────────────┤
                    │  MFE 1         │  MFE 2         │
                    │  Topic Manager │  Content Writer │
                    │  (Next.js)     │  (Next.js)     │
                    │  Port 3001     │  Port 3002     │
                    └───────┬────────┴───────┬────────┘
                            │                │
                            ▼                ▼
                    ┌────────────────────────────────┐
                    │       API Gateway (Nginx)       │
                    │         Port 8080               │
                    └───────┬────────────────┬───────┘
                            │                │
                    ┌───────▼──────┐  ┌──────▼───────┐
                    │ Topic Service│  │Content Service│
                    │ (Spring Boot)│  │  (FastAPI)    │
                    │  Port 8081   │  │  Port 8082    │
                    └──┬───┬───┬──┘  └──┬────┬───────┘
                       │   │   │        │    │
                  ┌────┘   │   └────┐   │    └──────┐
                  ▼        ▼        ▼   ▼           ▼
              ┌──────┐ ┌──────┐ ┌──────────┐  ┌──────────┐
              │Postgr│ │Redis │ │  Kafka   │  │ OpenAI   │
              │  es  │ │      │ │          │  │   API    │
              └──────┘ └──────┘ └──────────┘  └──────────┘
```

## Services Breakdown

### Micro-Frontends

| Service | Tech | Responsibility |
|---------|------|----------------|
| Shell App | Next.js | Host application, routing, shared layout |
| Topic Manager MFE | Next.js | CRUD operations for YouTube video topics |
| Content Writer MFE | Next.js | Display/edit AI-generated content for a topic |

### Microservices

| Service | Tech | Responsibility |
|---------|------|----------------|
| Topic Service | Spring Boot + PostgreSQL | Topic CRUD, stores topics and content |
| Content Service | FastAPI + OpenAI | Generates content using prompt templates |

### Infrastructure

| Component | Purpose |
|-----------|---------|
| PostgreSQL | Persistent storage for topics and generated content |
| Redis | Cache generated content, reduce OpenAI API calls |
| Kafka | Async communication: topic-created -> content-generation |
| Nginx | API Gateway / reverse proxy |
| Docker Compose | Local development orchestration |
| AKS | Production deployment target |

## Data Flow

1. User creates a topic in **Topic Manager MFE**
2. **Topic Service** saves topic to PostgreSQL
3. **Topic Service** publishes `topic-created` event to **Kafka**
4. **Content Service** consumes the event
5. **Content Service** checks **Redis** cache, if miss -> calls **OpenAI API**
6. **Content Service** sends generated content back via Kafka (`content-generated`)
7. **Topic Service** consumes event, stores content in PostgreSQL
8. User views generated content in **Content Writer MFE**

## Development Phases

### Phase 1: Local Development with Docker Compose
- Set up all services locally
- Docker Compose for PostgreSQL, Redis, Kafka, Zookeeper
- Build and test all micro-frontends and microservices

### Phase 2: Containerize Application Services
- Dockerfile for each service (Shell App, MFE 1, MFE 2, Topic Service, Content Service)
- Full Docker Compose with all services

### Phase 3: Azure Kubernetes Deployment
- Create AKS cluster
- Write Kubernetes manifests (Deployments, Services, Ingress, ConfigMaps, Secrets)
- Set up Azure Container Registry (ACR)
- Deploy and test on AKS

## Mono-Repo Structure

```
micro-fe-micro-service/
├── docs/                          # Planning documents
├── frontend/
│   ├── shell-app/                 # Host Next.js app
│   ├── topic-manager-mfe/         # MFE 1 - Topic CRUD
│   └── content-writer-mfe/        # MFE 2 - Content display
├── backend/
│   ├── topic-service/             # Spring Boot service
│   └── content-service/           # FastAPI service
├── infra/
│   ├── docker/                    # Dockerfiles
│   ├── docker-compose.yml         # Local orchestration
│   ├── nginx/                     # API gateway config
│   └── k8s/                       # Kubernetes manifests
│       ├── base/                  # Base manifests
│       └── overlays/
│           ├── local/             # Local minikube overrides
│           └── azure/             # AKS overrides
└── scripts/                       # Helper scripts
```