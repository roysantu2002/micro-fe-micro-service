# Environment Setup

## Prerequisites

### Local Machine

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20.x LTS | Next.js micro-frontends |
| Java | 21 (LTS) | Spring Boot topic service |
| Python | 3.12+ | FastAPI content service |
| Docker Desktop | Latest | Container runtime |
| Docker Compose | v2+ (bundled) | Local orchestration |
| kubectl | Latest | Kubernetes CLI |
| Azure CLI (`az`) | Latest | AKS management |
| Helm | 3.x | Kubernetes package manager |
| Maven | 3.9+ | Spring Boot build tool |
| Git | Latest | Version control |

### Accounts Required

| Account | Purpose |
|---------|---------|
| OpenAI API | Content generation (API key needed) |
| Azure | AKS cluster, ACR registry |

## Environment Variables

### Shared `.env` file (root level, git-ignored)

```env
# OpenAI
OPENAI_API_KEY=sk-your-key-here

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=youtube_planner
POSTGRES_USER=planner
POSTGRES_PASSWORD=planner_secret

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Kafka
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Azure (for deployment phase)
AZURE_SUBSCRIPTION_ID=
AZURE_RESOURCE_GROUP=rg-yt-planner
AZURE_ACR_NAME=ytplanneracr
AZURE_AKS_CLUSTER=aks-yt-planner
AZURE_LOCATION=eastus
```

### Service-Specific Config

**Topic Service (Spring Boot)** - `application.yml`
```yaml
spring:
  datasource:
    url: jdbc:postgresql://${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
    username: ${POSTGRES_USER}
    password: ${POSTGRES_PASSWORD}
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS}
    consumer:
      group-id: topic-service
server:
  port: 8081
```

**Content Service (FastAPI)** - environment variables
```
OPENAI_API_KEY
REDIS_HOST
REDIS_PORT
KAFKA_BOOTSTRAP_SERVERS
```

## Local Development Ports

| Service | Port |
|---------|------|
| Shell App (Host) | 3000 |
| Topic Manager MFE | 3001 |
| Content Writer MFE | 3002 |
| API Gateway (Nginx) | 8080 |
| Topic Service (Spring Boot) | 8081 |
| Content Service (FastAPI) | 8082 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Kafka | 9092 |
| Zookeeper | 2181 |
| Kafka UI (optional) | 9090 |

## Quick Start Commands

```bash
# 1. Clone and setup
cd micro-fe-micro-service
cp .env.example .env
# Edit .env with your OpenAI API key

# 2. Start infrastructure (Postgres, Redis, Kafka)
docker compose up -d postgres redis kafka zookeeper

# 3. Start backend services
docker compose up -d topic-service content-service

# 4. Start frontends (for development, run outside Docker)
cd frontend/shell-app && npm install && npm run dev
cd frontend/topic-manager-mfe && npm install && npm run dev
cd frontend/content-writer-mfe && npm install && npm run dev

# 5. Or start everything at once
docker compose up -d
```

## IDE Recommendations

- **VS Code** with extensions: Docker, Kubernetes, Java Extension Pack, Python, ESLint, Prettier
- **IntelliJ IDEA** for Spring Boot service (optional)