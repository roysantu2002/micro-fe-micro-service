# Infrastructure Plan

## 1. Local Development (Docker Compose)

### Docker Compose Services

```
docker-compose.yml
├── postgres          (image: postgres:16-alpine)
├── redis             (image: redis:7-alpine)
├── zookeeper         (image: confluentinc/cp-zookeeper:7.6.0)
├── kafka             (image: confluentinc/cp-kafka:7.6.0)
├── kafka-ui          (image: provectuslabs/kafka-ui:latest)  [optional]
├── nginx             (custom config, API gateway)
├── topic-service     (custom Dockerfile, Spring Boot)
├── content-service   (custom Dockerfile, FastAPI)
├── shell-app         (custom Dockerfile, Next.js)
├── topic-manager-mfe (custom Dockerfile, Next.js)
└── content-writer-mfe(custom Dockerfile, Next.js)
```

### Docker Network

All services on a single bridge network `yt-planner-network` for local development.

### Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| postgres-data | /var/lib/postgresql/data | Persist database |
| redis-data | /data | Persist cache |

## 2. Dockerfiles

### Spring Boot (Topic Service)

```dockerfile
# Multi-stage build
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### FastAPI (Content Service)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8082
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082"]
```

### Next.js (Each MFE)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

## 3. Azure Kubernetes Service (AKS) Deployment

### Azure Resources to Create

```
Resource Group: rg-yt-planner
├── AKS Cluster: aks-yt-planner
│   ├── Node Pool: 2x Standard_B2s (cost-effective for learning)
│   └── Managed Identity (for ACR pull)
├── ACR: ytplanneracr (Azure Container Registry)
├── Azure Database for PostgreSQL - Flexible Server (optional, can run in-cluster)
└── Azure Cache for Redis (optional, can run in-cluster)
```

### AKS Setup Commands

```bash
# Login to Azure
az login

# Create resource group
az group create --name rg-yt-planner --location eastus

# Create ACR
az acr create --resource-group rg-yt-planner --name ytplanneracr --sku Basic

# Create AKS cluster
az aks create \
  --resource-group rg-yt-planner \
  --name aks-yt-planner \
  --node-count 2 \
  --node-vm-size Standard_B2s \
  --generate-ssh-keys \
  --attach-acr ytplanneracr \
  --enable-managed-identity

# Get credentials
az aks get-credentials --resource-group rg-yt-planner --name aks-yt-planner

# Verify
kubectl get nodes
```

### Kubernetes Manifests Structure

```
infra/k8s/
├── base/
│   ├── namespace.yaml              # yt-planner namespace
│   ├── postgres/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── pvc.yaml                # PersistentVolumeClaim
│   │   └── configmap.yaml
│   ├── redis/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── kafka/
│   │   ├── zookeeper-deployment.yaml
│   │   ├── zookeeper-service.yaml
│   │   ├── kafka-deployment.yaml
│   │   └── kafka-service.yaml
│   ├── topic-service/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── configmap.yaml
│   ├── content-service/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── configmap.yaml
│   ├── shell-app/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── topic-manager-mfe/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── content-writer-mfe/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── ingress.yaml                # Nginx Ingress Controller
│   └── secrets.yaml                # Template (actual values via kubectl or Azure Key Vault)
└── overlays/
    ├── local/
    │   └── kustomization.yaml      # Local overrides (minikube)
    └── azure/
        └── kustomization.yaml      # AKS overrides (ACR images, managed services)
```

### Key Kubernetes Concepts Covered

| Concept | Where Used |
|---------|-----------|
| **Deployment** | All services (replicas, rolling updates) |
| **Service** (ClusterIP) | Internal service discovery |
| **Service** (LoadBalancer) | Expose Nginx Ingress externally |
| **Ingress** | Route external traffic to frontend/API |
| **ConfigMap** | Non-sensitive configuration |
| **Secret** | DB passwords, API keys |
| **PersistentVolumeClaim** | PostgreSQL data persistence |
| **Namespace** | Isolate workloads |
| **HPA** | Horizontal Pod Autoscaler (stretch goal) |
| **Kustomize** | Environment-specific overlays |
| **Liveness/Readiness Probes** | Health checks for all services |

### Ingress Routing

```yaml
# Ingress rules
rules:
  - host: ytplanner.local  # or Azure-assigned domain
    http:
      paths:
        - path: /
          backend: shell-app (port 3000)
        - path: /topic-manager
          backend: topic-manager-mfe (port 3001)
        - path: /content-writer
          backend: content-writer-mfe (port 3002)
        - path: /api/topics
          backend: topic-service (port 8081)
        - path: /api/content
          backend: content-service (port 8082)
```

### CI/CD Pipeline (Stretch Goal)

```
GitHub Actions:
  on push to main:
    1. Build Docker images
    2. Push to ACR
    3. Update K8s deployments (kubectl set image)
```

### Cost Optimization for Learning

- Use `Standard_B2s` nodes (cheapest viable option)
- Run PostgreSQL and Redis inside the cluster (skip managed services)
- Scale down to 0 nodes when not in use: `az aks stop --name aks-yt-planner --resource-group rg-yt-planner`
- Delete the cluster when done learning