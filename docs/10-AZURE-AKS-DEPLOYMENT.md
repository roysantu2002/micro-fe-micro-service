# Azure AKS Deployment Guide

## YouTube Content Planner - Complete Kubernetes Deployment on Azure

This document provides a comprehensive, end-to-end guide for deploying the YouTube Content Planner (micro-frontend + microservices) project to **Azure Kubernetes Service (AKS)**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Azure Resource Provisioning](#3-azure-resource-provisioning)
4. [Azure Container Registry (ACR) Setup](#4-azure-container-registry-acr-setup)
5. [Building and Pushing Docker Images](#5-building-and-pushing-docker-images)
6. [Kubernetes Namespace and RBAC](#6-kubernetes-namespace-and-rbac)
7. [Secrets Management](#7-secrets-management)
8. [Infrastructure Services (StatefulSets)](#8-infrastructure-services-statefulsets)
9. [Application Services (Deployments)](#9-application-services-deployments)
10. [Service Discovery and Networking](#10-service-discovery-and-networking)
11. [Ingress Controller and TLS](#11-ingress-controller-and-tls)
12. [ConfigMaps and Environment Configuration](#12-configmaps-and-environment-configuration)
13. [Health Checks and Probes](#13-health-checks-and-probes)
14. [Horizontal Pod Autoscaling (HPA)](#14-horizontal-pod-autoscaling-hpa)
15. [Persistent Storage](#15-persistent-storage)
16. [Microsoft Entra ID (Azure AD) Integration](#16-microsoft-entra-id-azure-ad-integration)
17. [CI/CD Pipeline with GitHub Actions](#17-cicd-pipeline-with-github-actions)
18. [Monitoring and Observability](#18-monitoring-and-observability)
19. [Cost Optimization](#19-cost-optimization)
20. [Troubleshooting](#20-troubleshooting)
21. [Complete Manifest Reference](#21-complete-manifest-reference)
22. [Deployment Checklist](#22-deployment-checklist)

---

## 1. Architecture Overview

### Project Services Inventory

| Service | Technology | Container Port | Role |
|---------|-----------|---------------|------|
| **shell-app** | Next.js 14 | 3000 | Host application, MFE orchestrator |
| **topic-manager-mfe** | Next.js 14 | 3001 | Topic CRUD micro-frontend |
| **content-writer-mfe** | Next.js 14 | 3002 | Content display micro-frontend |
| **topic-service** | Spring Boot 3.3 / Java 21 | 8081 | Topic REST API, Kafka producer |
| **content-service** | FastAPI / Python 3.12 | 8082 | AI content generation, OpenAI integration |
| **nginx** | Nginx Alpine | 8080 | API Gateway / reverse proxy |
| **postgres** | PostgreSQL 16 | 5432 | Primary database |
| **redis** | Redis 7 | 6379 | Content cache (24h TTL) |
| **kafka** | Confluent Kafka 7.6 | 9092 | Event streaming |
| **zookeeper** | Confluent Zookeeper 7.6 | 2181 | Kafka coordination |

### Data Flow on AKS

```
Internet
    │
    ▼
Azure Load Balancer
    │
    ▼
NGINX Ingress Controller (K8s)
    │
    ├── / ──────────────────► shell-app (port 3000)
    ├── /topic-manager ─────► topic-manager-mfe (port 3001)
    ├── /content-writer ────► content-writer-mfe (port 3002)
    ├── /api/topics/* ──────► topic-service (port 8081)
    └── /api/content/* ─────► content-service (port 8082)

Internal Communication:
    topic-service ──[Kafka: topic-created]──► content-service
    content-service ──[Kafka: content-generated]──► topic-service
    topic-service ──► PostgreSQL
    content-service ──► Redis (cache)
    content-service ──► OpenAI API (external)
```

### Kubernetes Resource Mapping

```
Namespace: yt-planner
│
├── Deployments (stateless)
│   ├── shell-app              (2 replicas)
│   ├── topic-manager-mfe      (2 replicas)
│   ├── content-writer-mfe     (2 replicas)
│   ├── topic-service          (2 replicas)
│   ├── content-service        (2 replicas)
│   └── nginx-gateway          (2 replicas)
│
├── StatefulSets (stateful)
│   ├── postgres               (1 replica, PVC)
│   ├── redis                  (1 replica, PVC)
│   ├── kafka                  (1 replica, PVC)
│   └── zookeeper              (1 replica, PVC)
│
├── Services (ClusterIP)
│   ├── shell-app-svc
│   ├── topic-manager-mfe-svc
│   ├── content-writer-mfe-svc
│   ├── topic-service-svc
│   ├── content-service-svc
│   ├── nginx-gateway-svc
│   ├── postgres-svc
│   ├── redis-svc
│   ├── kafka-svc
│   └── zookeeper-svc
│
├── Ingress
│   └── yt-planner-ingress     (NGINX Ingress Controller)
│
├── ConfigMaps
│   ├── topic-service-config
│   ├── content-service-config
│   ├── nginx-config
│   └── frontend-config
│
├── Secrets
│   ├── db-credentials
│   ├── openai-api-key
│   └── redis-credentials
│
├── PersistentVolumeClaims
│   ├── postgres-pvc           (Azure Managed Disk)
│   ├── redis-pvc              (Azure Managed Disk)
│   └── kafka-pvc              (Azure Managed Disk)
│
└── HPA (Horizontal Pod Autoscaler)
    ├── topic-service-hpa
    └── content-service-hpa
```

---

## 2. Prerequisites

### Tools Required

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| Azure CLI | >= 2.50 | Azure resource management | `brew install azure-cli` |
| kubectl | >= 1.28 | Kubernetes cluster management | `brew install kubectl` |
| Docker | >= 24.0 | Container image building | Docker Desktop |
| Helm | >= 3.12 | Kubernetes package manager | `brew install helm` |
| kubelogin | latest | Azure AD auth for kubectl | `brew install Azure/kubelogin/kubelogin` |

### Azure Subscription Requirements

- An active Azure subscription
- Permissions to create:
  - Resource Groups
  - AKS Clusters
  - Azure Container Registry
  - Managed Identities
  - (Optional) Azure Database for PostgreSQL Flexible Server
  - (Optional) Azure Cache for Redis

### Verify Tools

```bash
az version
kubectl version --client
docker --version
helm version
```

---

## 3. Azure Resource Provisioning

### 3.1 Login and Set Subscription

```bash
# Login to Azure
az login

# List subscriptions
az account list --output table

# Set the target subscription
az account set --subscription "<your-subscription-id>"
```

### 3.2 Create Resource Group

```bash
az group create \
  --name rg-yt-planner \
  --location canadacentral
```

### 3.3 Create AKS Cluster

```bash
az vm list-skus \
  --location eastus \
  --size Standard_D2 \
  --output table
```

```bash
az aks create \
  --resource-group rg-yt-planner \
  --name aks-yt-planner \
  --node-count 2 \
  --node-vm-size Standard_D2pds_v5 \
  --generate-ssh-keys \
  --enable-managed-identity \
  --network-plugin azure \
  --network-policy azure \
  --enable-addons monitoring \
  --os-sku AzureLinux \
  --tier free
```

**Parameter Breakdown:**

| Parameter | Value | Why |
|-----------|-------|-----|
| `--node-count 2` | 2 nodes | Minimum for HA; sufficient for this project |
| `--node-vm-size Standard_D2pds_v5` | 2 vCPU, 8 GB RAM | Good balance of cost and performance |
| `--enable-managed-identity` | Managed Identity | Secure ACR pull without service principal secrets |
| `--network-plugin azure` | Azure CNI | Pod-level networking, required for network policies |
| `--network-policy azure` | Azure Network Policy | Enable pod-to-pod traffic control |
| `--enable-addons monitoring` | Container Insights | Built-in monitoring and logging |
| `--os-sku AzureLinux` | Azure Linux | Smaller, faster, more secure than Ubuntu |
| `--tier free` | Free tier | No SLA but sufficient for dev/learning |

### 3.4 Get Cluster Credentials

```bash
az aks get-credentials \
  --resource-group rg-yt-planner \
  --name aks-yt-planner

# Verify connectivity
kubectl get nodes
kubectl cluster-info
```

### 3.5 (Production) Add a Separate Node Pool for Infra Services

For production deployments, isolate infrastructure workloads:

```bash
az aks nodepool add \
  --resource-group rg-yt-planner \
  --cluster-name aks-yt-planner \
  --name infrapool \
  --node-count 2 \
  --node-vm-size Standard_B2ms \
  --labels workload=infrastructure \
  --node-taints workload=infrastructure:NoSchedule
```

---

## 4. Azure Container Registry (ACR) Setup

### 4.1 Create ACR

```bash
az acr create \
  --resource-group rg-yt-planner \
  --name ytplanneracr \
  --sku Basic
```

> **Naming Rule**: ACR names must be globally unique, alphanumeric, 5-50 chars. If `ytplanneracr` is taken, choose another name and replace it throughout this guide.

### 4.2 Attach ACR to AKS

This allows the AKS cluster's managed identity to pull images from ACR without credentials:

```bash
az aks update \
  --resource-group rg-yt-planner \
  --name aks-yt-planner \
  --attach-acr ytplanneracr
```

### 4.3 Verify ACR Access

```bash
az acr login --name ytplanneracr --expose-token

```

```bash
# Login to ACR (for local Docker push)
az acr login --name ytplanneracr

# Verify AKS can pull from ACR
az aks check-acr \
  --resource-group rg-yt-planner \
  --name aks-yt-planner \
  --acr ytplanneracr.azurecr.io
```

---

## 5. Building and Pushing Docker Images

### 5.1 Image Naming Convention

All images follow the pattern: `ytplanneracr.azurecr.io/<service-name>:<tag>`

| Service | Image Name | Dockerfile Path |
|---------|-----------|----------------|
| topic-service | `ytplanneracr.azurecr.io/topic-service:v1` | `backend/topic-service/Dockerfile` |
| content-service | `ytplanneracr.azurecr.io/content-service:v1` | `backend/content-service/Dockerfile` |
| shell-app | `ytplanneracr.azurecr.io/shell-app:v1` | `frontend/shell-app/Dockerfile` |
| topic-manager-mfe | `ytplanneracr.azurecr.io/topic-manager-mfe:v1` | `frontend/topic-manager-mfe/Dockerfile` |
| content-writer-mfe | `ytplanneracr.azurecr.io/content-writer-mfe:v1` | `frontend/content-writer-mfe/Dockerfile` |
| nginx-gateway | `ytplanneracr.azurecr.io/nginx-gateway:v1` | Custom (uses `infra/nginx/nginx.conf`) |

### 5.2 Build and Push All Images

```bash
# Set ACR name variable
ACR_NAME=ytplanneracr
ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"

# Login to ACR (expose token for environments without Docker credential helpers)
az acr login --name $ACR_NAME --expose-token

# Login Docker to ACR using the access token
docker login ytplanneracr.azurecr.io \
  -u 00000000-0000-0000-0000-000000000000 \
  -p $(az acr login --name ytplanneracr --expose-token --output tsv --query accessToken)

# --- Backend Services ---

# Topic Service (Spring Boot)
docker build -t ${ACR_LOGIN_SERVER}/topic-service:v1 \
  ./backend/topic-service/
docker push ${ACR_LOGIN_SERVER}/topic-service:v1

# Content Service (FastAPI)
docker build -t ${ACR_LOGIN_SERVER}/content-service:v1 \
  ./backend/content-service/
docker push ${ACR_LOGIN_SERVER}/content-service:v1

# --- Frontend Services ---

# Shell App (Host)
docker build -t ${ACR_LOGIN_SERVER}/shell-app:v1 \
  ./frontend/shell-app/
docker push ${ACR_LOGIN_SERVER}/shell-app:v1

# Topic Manager MFE
docker build -t ${ACR_LOGIN_SERVER}/topic-manager-mfe:v1 \
  ./frontend/topic-manager-mfe/
docker push ${ACR_LOGIN_SERVER}/topic-manager-mfe:v1

# Content Writer MFE
docker build -t ${ACR_LOGIN_SERVER}/content-writer-mfe:v1 \
  ./frontend/content-writer-mfe/
docker push ${ACR_LOGIN_SERVER}/content-writer-mfe:v1

# --- Nginx Gateway (custom config baked in) ---
# Create a temporary Dockerfile for nginx
cat > /tmp/nginx-gateway.Dockerfile <<'DOCKERFILE'
FROM nginx:alpine
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
DOCKERFILE

docker build -t ${ACR_LOGIN_SERVER}/nginx-gateway:v1 \
  -f /tmp/nginx-gateway.Dockerfile .
docker push ${ACR_LOGIN_SERVER}/nginx-gateway:v1
```

### 5.3 Alternative: Build on ACR (No Local Docker Required)

ACR Tasks can build images remotely:

```bash
az acr build \
  --registry ytplanneracr \
  --image topic-service:v1 \
  ./backend/topic-service/

az acr build \
  --registry ytplanneracr \
  --image content-service:v1 \
  ./backend/content-service/

az acr build \
  --registry ytplanneracr \
  --image shell-app:v1 \
  ./frontend/shell-app/

az acr build \
  --registry ytplanneracr \
  --image topic-manager-mfe:v1 \
  ./frontend/topic-manager-mfe/

az acr build \
  --registry ytplanneracr \
  --image content-writer-mfe:v1 \
  ./frontend/content-writer-mfe/
```

### 5.4 Verify Pushed Images

```bash
az acr repository list --name ytplanneracr --output table

# Check tags for a specific image
az acr repository show-tags --name ytplanneracr --repository topic-service --output table
```

---

## 6. Kubernetes Namespace and RBAC

### 6.1 Namespace

```yaml
# infra/k8s/base/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: yt-planner
  labels:
    app.kubernetes.io/part-of: yt-planner
    environment: production
```

```bash
kubectl apply -f infra/k8s/base/namespace.yaml

# Set as default namespace for this context
kubectl config set-context --current --namespace=yt-planner
```

### 6.2 Network Policy (Restrict Traffic Between Pods)

```yaml
# infra/k8s/base/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: yt-planner
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
---
# Allow DNS resolution for all pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: yt-planner
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - to: []
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
---
# Allow ingress controller to reach frontend and API services
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-to-services
  namespace: yt-planner
spec:
  podSelector:
    matchLabels:
      tier: frontend
  policyTypes:
    - Ingress
  ingress:
    - from: []
      ports:
        - port: 3000
        - port: 3001
        - port: 3002
---
# Allow topic-service to access postgres and kafka
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-topic-service-egress
  namespace: yt-planner
spec:
  podSelector:
    matchLabels:
      app: topic-service
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: kafka
      ports:
        - port: 9092
---
# Allow content-service to access redis, kafka, and external OpenAI API
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-content-service-egress
  namespace: yt-planner
spec:
  podSelector:
    matchLabels:
      app: content-service
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - port: 6379
    - to:
        - podSelector:
            matchLabels:
              app: kafka
      ports:
        - port: 9092
    - to:  # Allow external HTTPS (OpenAI API)
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - port: 443
          protocol: TCP
```

---

## 7. Secrets Management

### 7.1 Option A: kubectl Secrets (Development)

```bash
# Database credentials
kubectl create secret generic db-credentials \
  --namespace yt-planner \
  --from-literal=POSTGRES_DB=youtube_planner \
  --from-literal=POSTGRES_USER=planner \
  --from-literal=POSTGRES_PASSWORD='<strong-password-here>' \
  --from-literal=SPRING_DATASOURCE_URL='jdbc:postgresql://postgres-svc:5432/youtube_planner' \
  --from-literal=SPRING_DATASOURCE_USERNAME=planner \
  --from-literal=SPRING_DATASOURCE_PASSWORD='<strong-password-here>'

# OpenAI API key
kubectl create secret generic openai-api-key \
  --namespace yt-planner \
  --from-literal=OPENAI_API_KEY='<your-openai-api-key>'

# Redis credentials (if using auth)
kubectl create secret generic redis-credentials \
  --namespace yt-planner \
  --from-literal=REDIS_PASSWORD='<redis-password>'
```

### 7.2 Option B: Azure Key Vault Integration (Production)

```bash
# Create Key Vault
az keyvault create \
  --name kv-yt-planner \
  --resource-group rg-yt-planner \
  --location eastus

# Add secrets
az keyvault secret set --vault-name kv-yt-planner --name postgres-password --value '<strong-password>'
az keyvault secret set --vault-name kv-yt-planner --name openai-api-key --value '<your-key>'
az keyvault secret set --vault-name kv-yt-planner --name redis-password --value '<redis-password>'

# Enable AKS Key Vault addon
az aks enable-addons \
  --resource-group rg-yt-planner \
  --name aks-yt-planner \
  --addons azure-keyvault-secrets-provider

# Get the managed identity for the secrets provider
IDENTITY_CLIENT_ID=$(az aks show \
  --resource-group rg-yt-planner \
  --name aks-yt-planner \
  --query addonProfiles.azureKeyvaultSecretsProvider.identity.clientId -o tsv)

# Grant access to Key Vault
az keyvault set-policy \
  --name kv-yt-planner \
  --spn $IDENTITY_CLIENT_ID \
  --secret-permissions get list
```

**SecretProviderClass manifest:**

```yaml
# infra/k8s/base/secrets/secret-provider.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: azure-kv-secrets
  namespace: yt-planner
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    useVMManagedIdentity: "true"
    userAssignedIdentityID: "<IDENTITY_CLIENT_ID>"
    keyvaultName: "kv-yt-planner"
    objects: |
      array:
        - |
          objectName: postgres-password
          objectType: secret
        - |
          objectName: openai-api-key
          objectType: secret
        - |
          objectName: redis-password
          objectType: secret
    tenantId: "<your-azure-tenant-id>"
  secretObjects:
    - secretName: db-credentials
      type: Opaque
      data:
        - objectName: postgres-password
          key: POSTGRES_PASSWORD
    - secretName: openai-api-key
      type: Opaque
      data:
        - objectName: openai-api-key
          key: OPENAI_API_KEY
```

---

## 8. Infrastructure Services (StatefulSets)

Infrastructure services use **StatefulSets** instead of Deployments because they require stable network identities and persistent storage.

### 8.1 PostgreSQL

```yaml
# infra/k8s/base/postgres/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: yt-planner
  labels:
    app: postgres
spec:
  serviceName: postgres-svc
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: POSTGRES_DB
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: POSTGRES_USER
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: POSTGRES_PASSWORD
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
            - name: init-sql
              mountPath: /docker-entrypoint-initdb.d
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "planner", "-d", "youtube_planner"]
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "planner", "-d", "youtube_planner"]
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: init-sql
          configMap:
            name: postgres-init
  volumeClaimTemplates:
    - metadata:
        name: postgres-storage
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: managed-csi
        resources:
          requests:
            storage: 5Gi
---
# infra/k8s/base/postgres/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-svc
  namespace: yt-planner
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
  clusterIP: None  # Headless service for StatefulSet
---
# infra/k8s/base/postgres/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-init
  namespace: yt-planner
data:
  init.sql: |
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS topics (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        tags TEXT[],
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'completed', 'failed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS topic_content (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
        hook TEXT,
        script_outline TEXT,
        key_points TEXT,
        call_to_action TEXT,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_topic_content_topic_id ON topic_content(topic_id);
```

### 8.2 Redis

```yaml
# infra/k8s/base/redis/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: yt-planner
  labels:
    app: redis
spec:
  serviceName: redis-svc
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          command: ["redis-server", "--appendonly", "yes"]
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: redis-storage
              mountPath: /data
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 250m
              memory: 256Mi
          livenessProbe:
            exec:
              command: ["redis-cli", "ping"]
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["redis-cli", "ping"]
            initialDelaySeconds: 5
            periodSeconds: 5
  volumeClaimTemplates:
    - metadata:
        name: redis-storage
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: managed-csi
        resources:
          requests:
            storage: 2Gi
---
# infra/k8s/base/redis/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: redis-svc
  namespace: yt-planner
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
  clusterIP: None
```

### 8.3 Zookeeper

```yaml
# infra/k8s/base/kafka/zookeeper-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: zookeeper
  namespace: yt-planner
  labels:
    app: zookeeper
spec:
  serviceName: zookeeper-svc
  replicas: 1
  selector:
    matchLabels:
      app: zookeeper
  template:
    metadata:
      labels:
        app: zookeeper
    spec:
      containers:
        - name: zookeeper
          image: confluentinc/cp-zookeeper:7.6.0
          ports:
            - containerPort: 2181
          env:
            - name: ZOOKEEPER_CLIENT_PORT
              value: "2181"
            - name: ZOOKEEPER_TICK_TIME
              value: "2000"
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 250m
              memory: 512Mi
          volumeMounts:
            - name: zk-storage
              mountPath: /var/lib/zookeeper/data
          livenessProbe:
            tcpSocket:
              port: 2181
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            tcpSocket:
              port: 2181
            initialDelaySeconds: 10
            periodSeconds: 5
  volumeClaimTemplates:
    - metadata:
        name: zk-storage
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: managed-csi
        resources:
          requests:
            storage: 2Gi
---
# infra/k8s/base/kafka/zookeeper-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: zookeeper-svc
  namespace: yt-planner
spec:
  selector:
    app: zookeeper
  ports:
    - port: 2181
      targetPort: 2181
  clusterIP: None
```

### 8.4 Kafka

```yaml
# infra/k8s/base/kafka/kafka-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: yt-planner
  labels:
    app: kafka
spec:
  serviceName: kafka-svc
  replicas: 1
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
        - name: kafka
          image: confluentinc/cp-kafka:7.6.0
          ports:
            - containerPort: 9092
              name: internal
            - containerPort: 29092
              name: external
          env:
            - name: KAFKA_BROKER_ID
              value: "1"
            - name: KAFKA_ZOOKEEPER_CONNECT
              value: "zookeeper-svc:2181"
            - name: KAFKA_LISTENER_SECURITY_PROTOCOL_MAP
              value: "PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT"
            - name: KAFKA_ADVERTISED_LISTENERS
              value: "PLAINTEXT://kafka-svc:29092,PLAINTEXT_HOST://kafka-svc:9092"
            - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
              value: "1"
            - name: KAFKA_AUTO_CREATE_TOPICS_ENABLE
              value: "true"
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 500m
              memory: 1Gi
          volumeMounts:
            - name: kafka-storage
              mountPath: /var/lib/kafka/data
          livenessProbe:
            tcpSocket:
              port: 9092
            initialDelaySeconds: 60
            periodSeconds: 15
          readinessProbe:
            tcpSocket:
              port: 9092
            initialDelaySeconds: 30
            periodSeconds: 10
  volumeClaimTemplates:
    - metadata:
        name: kafka-storage
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: managed-csi
        resources:
          requests:
            storage: 5Gi
---
# infra/k8s/base/kafka/kafka-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: kafka-svc
  namespace: yt-planner
spec:
  selector:
    app: kafka
  ports:
    - name: internal
      port: 29092
      targetPort: 29092
    - name: external
      port: 9092
      targetPort: 9092
  clusterIP: None
```

---

## 9. Application Services (Deployments)

### 9.1 Topic Service (Spring Boot)

```yaml
# infra/k8s/base/topic-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: topic-service
  namespace: yt-planner
  labels:
    app: topic-service
    tier: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: topic-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: topic-service
        tier: backend
    spec:
      containers:
        - name: topic-service
          image: ytplanneracr.azurecr.io/topic-service:v1
          ports:
            - containerPort: 8081
          envFrom:
            - configMapRef:
                name: topic-service-config
          env:
            - name: SPRING_DATASOURCE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: SPRING_DATASOURCE_URL
            - name: SPRING_DATASOURCE_USERNAME
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: SPRING_DATASOURCE_USERNAME
            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: SPRING_DATASOURCE_PASSWORD
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 500m
              memory: 768Mi
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8081
            initialDelaySeconds: 60
            periodSeconds: 15
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8081
            initialDelaySeconds: 30
            periodSeconds: 10
          startupProbe:
            httpGet:
              path: /actuator/health
              port: 8081
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 30
---
# infra/k8s/base/topic-service/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: topic-service-svc
  namespace: yt-planner
spec:
  selector:
    app: topic-service
  ports:
    - port: 8081
      targetPort: 8081
```

### 9.2 Content Service (FastAPI)

```yaml
# infra/k8s/base/content-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: content-service
  namespace: yt-planner
  labels:
    app: content-service
    tier: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: content-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: content-service
        tier: backend
    spec:
      containers:
        - name: content-service
          image: ytplanneracr.azurecr.io/content-service:v1
          ports:
            - containerPort: 8082
          envFrom:
            - configMapRef:
                name: content-service-config
          env:
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: openai-api-key
                  key: OPENAI_API_KEY
          resources:
            requests:
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health
              port: 8082
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8082
            initialDelaySeconds: 10
            periodSeconds: 5
---
# infra/k8s/base/content-service/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: content-service-svc
  namespace: yt-planner
spec:
  selector:
    app: content-service
  ports:
    - port: 8082
      targetPort: 8082
```

### 9.3 Shell App (Next.js Host)

```yaml
# infra/k8s/base/shell-app/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shell-app
  namespace: yt-planner
  labels:
    app: shell-app
    tier: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shell-app
  template:
    metadata:
      labels:
        app: shell-app
        tier: frontend
    spec:
      containers:
        - name: shell-app
          image: ytplanneracr.azurecr.io/shell-app:v1
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: frontend-config
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 250m
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
# infra/k8s/base/shell-app/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: shell-app-svc
  namespace: yt-planner
spec:
  selector:
    app: shell-app
  ports:
    - port: 3000
      targetPort: 3000
```

### 9.4 Topic Manager MFE

```yaml
# infra/k8s/base/topic-manager-mfe/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: topic-manager-mfe
  namespace: yt-planner
  labels:
    app: topic-manager-mfe
    tier: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: topic-manager-mfe
  template:
    metadata:
      labels:
        app: topic-manager-mfe
        tier: frontend
    spec:
      containers:
        - name: topic-manager-mfe
          image: ytplanneracr.azurecr.io/topic-manager-mfe:v1
          ports:
            - containerPort: 3001
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 250m
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /
              port: 3001
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 5
---
# infra/k8s/base/topic-manager-mfe/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: topic-manager-mfe-svc
  namespace: yt-planner
spec:
  selector:
    app: topic-manager-mfe
  ports:
    - port: 3001
      targetPort: 3001
```

### 9.5 Content Writer MFE

```yaml
# infra/k8s/base/content-writer-mfe/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: content-writer-mfe
  namespace: yt-planner
  labels:
    app: content-writer-mfe
    tier: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: content-writer-mfe
  template:
    metadata:
      labels:
        app: content-writer-mfe
        tier: frontend
    spec:
      containers:
        - name: content-writer-mfe
          image: ytplanneracr.azurecr.io/content-writer-mfe:v1
          ports:
            - containerPort: 3002
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 250m
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /
              port: 3002
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3002
            initialDelaySeconds: 5
            periodSeconds: 5
---
# infra/k8s/base/content-writer-mfe/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: content-writer-mfe-svc
  namespace: yt-planner
spec:
  selector:
    app: content-writer-mfe
  ports:
    - port: 3002
      targetPort: 3002
```

---

## 10. Service Discovery and Networking

### How Services Find Each Other in Kubernetes

In Docker Compose, services communicate using container names (e.g., `postgres:5432`). In Kubernetes, services use **DNS-based service discovery**.

| Docker Compose Name | Kubernetes Service DNS | Port |
|---------------------|----------------------|------|
| `postgres` | `postgres-svc.yt-planner.svc.cluster.local` | 5432 |
| `redis` | `redis-svc.yt-planner.svc.cluster.local` | 6379 |
| `kafka` | `kafka-svc.yt-planner.svc.cluster.local` | 9092 |
| `zookeeper` | `zookeeper-svc.yt-planner.svc.cluster.local` | 2181 |
| `topic-service` | `topic-service-svc.yt-planner.svc.cluster.local` | 8081 |
| `content-service` | `content-service-svc.yt-planner.svc.cluster.local` | 8082 |
| `shell-app` | `shell-app-svc.yt-planner.svc.cluster.local` | 3000 |
| `topic-manager-mfe` | `topic-manager-mfe-svc.yt-planner.svc.cluster.local` | 3001 |
| `content-writer-mfe` | `content-writer-mfe-svc.yt-planner.svc.cluster.local` | 3002 |

Within the same namespace, you can use the short name: `postgres-svc:5432`, `kafka-svc:9092`, etc.

### Module Federation URL Changes

The Module Federation remote entry URLs must be updated for Kubernetes:

| Environment | Topic Manager Remote URL | Content Writer Remote URL |
|-------------|------------------------|--------------------------|
| Local Dev | `http://localhost:3001/_next/static/chunks/remoteEntry.js` | `http://localhost:3002/_next/static/chunks/remoteEntry.js` |
| Docker Compose | `http://topic-manager-mfe:3001/_next/static/chunks/remoteEntry.js` | `http://content-writer-mfe:3002/_next/static/chunks/remoteEntry.js` |
| AKS (SSR) | `http://topic-manager-mfe-svc:3001/_next/static/chunks/remoteEntry.js` | `http://content-writer-mfe-svc:3002/_next/static/chunks/remoteEntry.js` |
| AKS (Browser) | `https://<your-domain>/topic-manager/_next/static/chunks/remoteEntry.js` | `https://<your-domain>/content-writer/_next/static/chunks/remoteEntry.js` |

This is handled via environment variables in the frontend ConfigMap (see Section 12).

---

## 11. Ingress Controller and TLS

### 11.1 Install NGINX Ingress Controller

```bash
# Add the Helm repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install NGINX Ingress Controller
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=2 \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
```

### 11.2 Get the External IP

```bash
# Wait for the LoadBalancer to get an external IP
kubectl get svc -n ingress-nginx ingress-nginx-controller --watch

# Output example:
# NAME                       TYPE           CLUSTER-IP     EXTERNAL-IP    PORT(S)
# ingress-nginx-controller   LoadBalancer   10.0.x.x       20.x.x.x      80:3xxxx/TCP,443:3xxxx/TCP
```

### 11.3 Ingress Resource

```yaml
# infra/k8s/base/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: yt-planner-ingress
  namespace: yt-planner
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "120"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "120"
    # Enable CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, DELETE, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-headers: "Content-Type, Authorization"
spec:
  ingressClassName: nginx
  rules:
    - host: ytplanner.example.com  # Replace with your domain or use the IP
      http:
        paths:
          # Frontend - Shell App (catch-all)
          - path: /
            pathType: Prefix
            backend:
              service:
                name: shell-app-svc
                port:
                  number: 3000
          # Topic Manager MFE assets
          - path: /topic-manager
            pathType: Prefix
            backend:
              service:
                name: topic-manager-mfe-svc
                port:
                  number: 3001
          # Content Writer MFE assets
          - path: /content-writer
            pathType: Prefix
            backend:
              service:
                name: content-writer-mfe-svc
                port:
                  number: 3002
          # Backend API - Topics
          - path: /api/topics
            pathType: Prefix
            backend:
              service:
                name: topic-service-svc
                port:
                  number: 8081
          # Backend API - Content
          - path: /api/content
            pathType: Prefix
            backend:
              service:
                name: content-service-svc
                port:
                  number: 8082
```

### 11.4 TLS with cert-manager (Production)

```bash
# Install cert-manager
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true
```

```yaml
# infra/k8s/base/tls/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

Then add TLS to the Ingress:

```yaml
# Add to ingress annotations:
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod

# Add TLS section:
spec:
  tls:
    - hosts:
        - ytplanner.example.com
      secretName: ytplanner-tls
```

### 11.5 Using Azure DNS with a Custom Domain

```bash
# Create DNS zone
az network dns zone create \
  --resource-group rg-yt-planner \
  --name ytplanner.example.com

# Get the Ingress external IP
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Create A record
az network dns record-set a add-record \
  --resource-group rg-yt-planner \
  --zone-name ytplanner.example.com \
  --record-set-name "@" \
  --ipv4-address $INGRESS_IP
```

---

## 12. ConfigMaps and Environment Configuration

### 12.1 Topic Service ConfigMap

```yaml
# infra/k8s/base/topic-service/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: topic-service-config
  namespace: yt-planner
data:
  SERVER_PORT: "8081"
  SPRING_KAFKA_BOOTSTRAP_SERVERS: "kafka-svc:9092"
  SPRING_JPA_HIBERNATE_DDL_AUTO: "validate"
  SPRING_JPA_PROPERTIES_HIBERNATE_DIALECT: "org.hibernate.dialect.PostgreSQLDialect"
  MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE: "health,info"
```

### 12.2 Content Service ConfigMap

```yaml
# infra/k8s/base/content-service/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: content-service-config
  namespace: yt-planner
data:
  OPENAI_MODEL: "gpt-4o-mini"
  REDIS_HOST: "redis-svc"
  REDIS_PORT: "6379"
  REDIS_TTL: "86400"
  KAFKA_BOOTSTRAP_SERVERS: "kafka-svc:9092"
  KAFKA_CONSUMER_GROUP: "content-service"
  KAFKA_TOPIC_CONSUME: "topic-created"
  KAFKA_TOPIC_PRODUCE: "content-generated"
```

### 12.3 Frontend ConfigMap

```yaml
# infra/k8s/base/frontend/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: frontend-config
  namespace: yt-planner
data:
  # API URL as seen by the browser (external)
  NEXT_PUBLIC_API_URL: "https://ytplanner.example.com"
  # MFE URLs for server-side rendering (internal cluster DNS)
  NEXT_PUBLIC_TOPIC_MANAGER_URL: "http://topic-manager-mfe-svc:3001"
  NEXT_PUBLIC_CONTENT_WRITER_URL: "http://content-writer-mfe-svc:3002"
```

### 12.4 Nginx Gateway ConfigMap

If using the nginx gateway pod instead of the Kubernetes Ingress for API routing:

```yaml
# infra/k8s/base/nginx/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
  namespace: yt-planner
data:
  nginx.conf: |
    events {
        worker_connections 1024;
    }

    http {
        upstream topic_service {
            server topic-service-svc:8081;
        }

        upstream content_service {
            server content-service-svc:8082;
        }

        server {
            listen 8080;

            location /api/topics {
                proxy_pass http://topic_service;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
            }

            location /api/content {
                proxy_pass http://content_service;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
            }

            location /health {
                return 200 '{"status":"ok"}';
                add_header Content-Type application/json;
            }
        }
    }
```

---

## 13. Health Checks and Probes

### Probe Summary for All Services

| Service | Liveness Path | Readiness Path | Startup Probe | Initial Delay |
|---------|--------------|----------------|---------------|---------------|
| topic-service | `/actuator/health/liveness` | `/actuator/health/readiness` | `/actuator/health` | 60s (JVM warmup) |
| content-service | `/health` | `/health` | N/A | 15s |
| shell-app | `/` | `/` | N/A | 15s |
| topic-manager-mfe | `/` | `/` | N/A | 15s |
| content-writer-mfe | `/` | `/` | N/A | 15s |
| postgres | `pg_isready` (exec) | `pg_isready` (exec) | N/A | 30s |
| redis | `redis-cli ping` (exec) | `redis-cli ping` (exec) | N/A | 10s |
| kafka | TCP :9092 | TCP :9092 | N/A | 60s |
| zookeeper | TCP :2181 | TCP :2181 | N/A | 30s |

### Probe Types Explained

- **Liveness**: Is the container alive? If it fails, Kubernetes restarts the container.
- **Readiness**: Is the container ready to receive traffic? If it fails, the pod is removed from the Service endpoints.
- **Startup**: Has the container started successfully? Important for slow-starting apps (like Spring Boot with JVM warmup). Prevents liveness probe from killing the container before it's ready.

---

## 14. Horizontal Pod Autoscaling (HPA)

### 14.1 Install Metrics Server (if not already present)

AKS with the monitoring addon includes metrics. Verify:

```bash
kubectl top nodes
kubectl top pods -n yt-planner
```

### 14.2 HPA for Backend Services

```yaml
# infra/k8s/base/topic-service/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: topic-service-hpa
  namespace: yt-planner
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: topic-service
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
---
# infra/k8s/base/content-service/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: content-service-hpa
  namespace: yt-planner
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: content-service
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

---

## 15. Persistent Storage

### Storage Classes Available on AKS

| Storage Class | Backing | Use Case |
|--------------|---------|----------|
| `managed-csi` (default) | Azure Managed Disk (SSD) | Databases, Kafka, general PVCs |
| `azurefile-csi` | Azure Files (SMB) | Shared storage (ReadWriteMany) |
| `managed-csi-premium` | Premium SSD | High-performance workloads |

### PVC Summary

| Service | Storage Class | Size | Access Mode | Mount Path |
|---------|--------------|------|-------------|------------|
| PostgreSQL | `managed-csi` | 5Gi | ReadWriteOnce | `/var/lib/postgresql/data` |
| Redis | `managed-csi` | 2Gi | ReadWriteOnce | `/data` |
| Kafka | `managed-csi` | 5Gi | ReadWriteOnce | `/var/lib/kafka/data` |
| Zookeeper | `managed-csi` | 2Gi | ReadWriteOnce | `/var/lib/zookeeper/data` |

### Backup Strategy

For PostgreSQL data protection:

```bash
# Manual backup using pg_dump from within the pod
kubectl exec -n yt-planner postgres-0 -- \
  pg_dump -U planner youtube_planner > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260627.sql | kubectl exec -i -n yt-planner postgres-0 -- \
  psql -U planner youtube_planner
```

---

## 16. Microsoft Entra ID (Azure AD) Integration

This project uses Microsoft Entra ID for authentication. Here's how it maps to AKS.

### 16.1 App Registration

```bash
# Create App Registration
az ad app create \
  --display-name "YT Content Planner" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "https://ytplanner.example.com/login" \
  --enable-access-token-issuance true \
  --enable-id-token-issuance true
```

### 16.2 Frontend MSAL Configuration

The shell-app needs these environment variables (added to the `frontend-config` ConfigMap):

```yaml
# Add to frontend-config ConfigMap
data:
  NEXT_PUBLIC_AZURE_AD_CLIENT_ID: "<your-app-client-id>"
  NEXT_PUBLIC_AZURE_AD_TENANT_ID: "<your-azure-tenant-id>"
  NEXT_PUBLIC_AZURE_AD_REDIRECT_URI: "https://ytplanner.example.com/login"
  NEXT_PUBLIC_AZURE_AD_SCOPE: "api://<client-id>/access_as_user"
```

### 16.3 Backend JWT Validation

Both backend services validate the JWT token from the `Authorization: Bearer <token>` header against Microsoft Entra ID's JWKS endpoint:

```
https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys
```

Add the tenant ID to the backend ConfigMaps:

```yaml
# Add to topic-service-config and content-service-config
data:
  AZURE_AD_TENANT_ID: "<your-azure-tenant-id>"
  AZURE_AD_CLIENT_ID: "<your-app-client-id>"
```

### 16.4 AKS Cluster AAD Integration (Optional)

Enable Azure AD for `kubectl` access:

```bash
az aks update \
  --resource-group rg-yt-planner \
  --name aks-yt-planner \
  --enable-aad \
  --aad-admin-group-object-ids "<your-admin-group-object-id>"
```

---

## 17. CI/CD Pipeline with GitHub Actions

### 17.1 Create Azure Service Principal for GitHub Actions

```bash
# Create service principal with ACR push and AKS contributor permissions
az ad sp create-for-rbac \
  --name "github-actions-yt-planner" \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/rg-yt-planner \
  --sdk-auth

# Save the JSON output as a GitHub secret named AZURE_CREDENTIALS
```

### 17.2 GitHub Secrets Required

| Secret Name | Value |
|------------|-------|
| `AZURE_CREDENTIALS` | Service principal JSON output |
| `ACR_LOGIN_SERVER` | `ytplanneracr.azurecr.io` |
| `ACR_USERNAME` | ACR admin username |
| `ACR_PASSWORD` | ACR admin password |
| `OPENAI_API_KEY` | OpenAI API key |

### 17.3 GitHub Actions Workflow

```yaml
# .github/workflows/deploy-aks.yml
name: Build and Deploy to AKS

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  ACR_NAME: ytplanneracr
  ACR_LOGIN_SERVER: ytplanneracr.azurecr.io
  AKS_CLUSTER: aks-yt-planner
  RESOURCE_GROUP: rg-yt-planner
  NAMESPACE: yt-planner

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - name: topic-service
            context: ./backend/topic-service
          - name: content-service
            context: ./backend/content-service
          - name: shell-app
            context: ./frontend/shell-app
          - name: topic-manager-mfe
            context: ./frontend/topic-manager-mfe
          - name: content-writer-mfe
            context: ./frontend/content-writer-mfe
    steps:
      - uses: actions/checkout@v4

      - name: Login to Azure
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Login to ACR
        run: az acr login --name ${{ env.ACR_NAME }}

      - name: Build and push image
        run: |
          IMAGE_TAG=${{ github.sha }}
          docker build \
            -t ${{ env.ACR_LOGIN_SERVER }}/${{ matrix.service.name }}:${IMAGE_TAG} \
            -t ${{ env.ACR_LOGIN_SERVER }}/${{ matrix.service.name }}:latest \
            ${{ matrix.service.context }}
          docker push ${{ env.ACR_LOGIN_SERVER }}/${{ matrix.service.name }}:${IMAGE_TAG}
          docker push ${{ env.ACR_LOGIN_SERVER }}/${{ matrix.service.name }}:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to Azure
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Get AKS credentials
        run: |
          az aks get-credentials \
            --resource-group ${{ env.RESOURCE_GROUP }} \
            --name ${{ env.AKS_CLUSTER }}

      - name: Update deployments with new image tag
        run: |
          IMAGE_TAG=${{ github.sha }}
          kubectl set image deployment/topic-service \
            topic-service=${{ env.ACR_LOGIN_SERVER }}/topic-service:${IMAGE_TAG} \
            -n ${{ env.NAMESPACE }}
          kubectl set image deployment/content-service \
            content-service=${{ env.ACR_LOGIN_SERVER }}/content-service:${IMAGE_TAG} \
            -n ${{ env.NAMESPACE }}
          kubectl set image deployment/shell-app \
            shell-app=${{ env.ACR_LOGIN_SERVER }}/shell-app:${IMAGE_TAG} \
            -n ${{ env.NAMESPACE }}
          kubectl set image deployment/topic-manager-mfe \
            topic-manager-mfe=${{ env.ACR_LOGIN_SERVER }}/topic-manager-mfe:${IMAGE_TAG} \
            -n ${{ env.NAMESPACE }}
          kubectl set image deployment/content-writer-mfe \
            content-writer-mfe=${{ env.ACR_LOGIN_SERVER }}/content-writer-mfe:${IMAGE_TAG} \
            -n ${{ env.NAMESPACE }}

      - name: Verify rollout
        run: |
          kubectl rollout status deployment/topic-service -n ${{ env.NAMESPACE }} --timeout=300s
          kubectl rollout status deployment/content-service -n ${{ env.NAMESPACE }} --timeout=300s
          kubectl rollout status deployment/shell-app -n ${{ env.NAMESPACE }} --timeout=300s
          kubectl rollout status deployment/topic-manager-mfe -n ${{ env.NAMESPACE }} --timeout=300s
          kubectl rollout status deployment/content-writer-mfe -n ${{ env.NAMESPACE }} --timeout=300s
```

---

## 18. Monitoring and Observability

### 18.1 Azure Monitor Container Insights (Enabled at Cluster Creation)

Already enabled with `--enable-addons monitoring`. View metrics in the Azure Portal:

```
Azure Portal → AKS Cluster → Monitoring → Insights
```

### 18.2 View Logs via kubectl

```bash
# Pod logs
kubectl logs -n yt-planner deployment/topic-service --tail=100 -f
kubectl logs -n yt-planner deployment/content-service --tail=100 -f

# All pods for a service
kubectl logs -n yt-planner -l app=topic-service --all-containers=true

# Previous container logs (after a crash)
kubectl logs -n yt-planner deployment/topic-service --previous
```

### 18.3 Log Analytics Queries (KQL)

Access via Azure Portal → AKS → Logs:

```kusto
// All container errors in the last hour
ContainerLogV2
| where TimeGenerated > ago(1h)
| where LogLevel == "ERROR" or LogMessage contains "Exception"
| project TimeGenerated, PodName, LogMessage
| order by TimeGenerated desc

// Pod restart count
KubePodInventory
| where Namespace == "yt-planner"
| summarize RestartCount=sum(PodRestartCount) by Name
| where RestartCount > 0
| order by RestartCount desc

// CPU and memory usage by pod
Perf
| where ObjectName == "K8SContainer"
| where InstanceName contains "yt-planner"
| summarize AvgCPU=avg(CounterValue) by InstanceName, CounterName
| order by AvgCPU desc
```

### 18.4 Prometheus + Grafana (Optional)

```bash
# Install Prometheus stack via Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword='your-grafana-password'

# Access Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3030:80
# Open http://localhost:3030 (admin / your-grafana-password)
```

### 18.5 Alerts

```yaml
# infra/k8s/base/monitoring/alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: yt-planner-alerts
  namespace: yt-planner
spec:
  groups:
    - name: yt-planner
      rules:
        - alert: HighPodRestartRate
          expr: rate(kube_pod_container_status_restarts_total{namespace="yt-planner"}[15m]) > 0
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.pod }} is restarting frequently"
        - alert: HighCPUUsage
          expr: rate(container_cpu_usage_seconds_total{namespace="yt-planner"}[5m]) > 0.8
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "High CPU usage on {{ $labels.pod }}"
```

---

## 19. Cost Optimization

### 19.1 Estimated Monthly Cost (Dev/Learning)

| Resource | SKU | Est. Cost/Month |
|----------|-----|----------------|
| AKS Cluster (Free tier) | Free | $0 |
| 2x Standard_D2pds_v5 Nodes | 2 vCPU, 8GB RAM each | ~$120 |
| ACR (Basic) | 10GB storage | ~$5 |
| Managed Disks (4x) | ~14GB total | ~$3 |
| Load Balancer | Standard | ~$18 |
| **Total** | | **~$146/month** |

### 19.2 Cost Saving Strategies

```bash
# Stop AKS cluster when not in use (nodes deallocated, no compute charges)
az aks stop \
  --resource-group rg-yt-planner \
  --name aks-yt-planner

# Start when needed
az aks start \
  --resource-group rg-yt-planner \
  --name aks-yt-planner

# Scale down to 1 node during off-hours
az aks scale \
  --resource-group rg-yt-planner \
  --name aks-yt-planner \
  --node-count 1

# Delete everything when done learning
az group delete --name rg-yt-planner --yes --no-wait
```

### 19.3 Production Considerations for Managed Services

| In-Cluster Service | Azure Managed Alternative | Benefit |
|-------------------|--------------------------|---------|
| PostgreSQL StatefulSet | Azure Database for PostgreSQL Flexible Server | Automated backups, HA, patching |
| Redis StatefulSet | Azure Cache for Redis | Built-in replication, monitoring |
| Kafka StatefulSet | Azure Event Hubs (Kafka-compatible) | Fully managed, auto-scale |

Using managed services removes the StatefulSets and their PVCs, simplifying the Kubernetes deployment significantly.

---

## 20. Troubleshooting

### Common Issues and Solutions

#### Pod stuck in `Pending`

```bash
kubectl describe pod <pod-name> -n yt-planner
# Look for: Insufficient cpu, Insufficient memory, No nodes available
# Fix: Scale up the node pool or reduce resource requests
```

#### Pod in `CrashLoopBackOff`

```bash
kubectl logs <pod-name> -n yt-planner --previous
# Common causes: missing env vars, wrong DB host, failed health checks
```

#### Image pull errors (`ErrImagePull` / `ImagePullBackOff`)

```bash
# Verify ACR attachment
az aks check-acr --name aks-yt-planner --resource-group rg-yt-planner --acr ytplanneracr.azurecr.io

# Verify image exists
az acr repository show-tags --name ytplanneracr --repository topic-service
```

#### Service cannot connect to database

```bash
# Verify the postgres pod is running
kubectl get pods -n yt-planner -l app=postgres

# Test DNS resolution from another pod
kubectl exec -it deployment/topic-service -n yt-planner -- nslookup postgres-svc

# Check postgres logs
kubectl logs -n yt-planner statefulset/postgres
```

#### Kafka consumer not receiving messages

```bash
# Check kafka pod
kubectl logs -n yt-planner kafka-0

# Verify topics exist
kubectl exec -it kafka-0 -n yt-planner -- \
  kafka-topics --bootstrap-server localhost:9092 --list

# Check consumer group lag
kubectl exec -it kafka-0 -n yt-planner -- \
  kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group content-service --describe
```

#### Ingress not routing traffic

```bash
# Check ingress status
kubectl describe ingress yt-planner-ingress -n yt-planner

# Verify ingress controller pods
kubectl get pods -n ingress-nginx

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx
```

### Useful Debugging Commands

```bash
# Overview of all resources in the namespace
kubectl get all -n yt-planner

# Detailed pod info
kubectl describe pod <pod-name> -n yt-planner

# Execute into a running pod
kubectl exec -it <pod-name> -n yt-planner -- /bin/sh

# Port-forward for local access to a service
kubectl port-forward svc/topic-service-svc 8081:8081 -n yt-planner

# View resource usage
kubectl top pods -n yt-planner
kubectl top nodes

# Events (sorted by time)
kubectl get events -n yt-planner --sort-by='.lastTimestamp'

# Check PVC status
kubectl get pvc -n yt-planner
```

---

## 21. Complete Manifest Reference

### Directory Structure (to create)

```
infra/k8s/
├── base/
│   ├── namespace.yaml
│   ├── network-policy.yaml
│   ├── ingress.yaml
│   ├── kustomization.yaml
│   ├── postgres/
│   │   ├── statefulset.yaml
│   │   ├── service.yaml
│   │   └── configmap.yaml
│   ├── redis/
│   │   ├── statefulset.yaml
│   │   └── service.yaml
│   ├── kafka/
│   │   ├── zookeeper-statefulset.yaml
│   │   ├── zookeeper-service.yaml
│   │   ├── kafka-statefulset.yaml
│   │   └── kafka-service.yaml
│   ├── topic-service/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   └── hpa.yaml
│   ├── content-service/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   └── hpa.yaml
│   ├── shell-app/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── topic-manager-mfe/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── content-writer-mfe/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── nginx/
│   │   └── configmap.yaml
│   └── frontend/
│       └── configmap.yaml
└── overlays/
    ├── local/
    │   └── kustomization.yaml
    └── azure/
        └── kustomization.yaml
```

### Kustomization Files

```yaml
# infra/k8s/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: yt-planner

resources:
  - namespace.yaml
  - network-policy.yaml
  - ingress.yaml
  # Infrastructure
  - postgres/statefulset.yaml
  - postgres/service.yaml
  - postgres/configmap.yaml
  - redis/statefulset.yaml
  - redis/service.yaml
  - kafka/zookeeper-statefulset.yaml
  - kafka/zookeeper-service.yaml
  - kafka/kafka-statefulset.yaml
  - kafka/kafka-service.yaml
  # Backend
  - topic-service/deployment.yaml
  - topic-service/service.yaml
  - topic-service/configmap.yaml
  - topic-service/hpa.yaml
  - content-service/deployment.yaml
  - content-service/service.yaml
  - content-service/configmap.yaml
  - content-service/hpa.yaml
  # Frontend
  - shell-app/deployment.yaml
  - shell-app/service.yaml
  - topic-manager-mfe/deployment.yaml
  - topic-manager-mfe/service.yaml
  - content-writer-mfe/deployment.yaml
  - content-writer-mfe/service.yaml
  # Config
  - frontend/configmap.yaml
```

```yaml
# infra/k8s/overlays/azure/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: yt-planner

resources:
  - ../../base

images:
  - name: ytplanneracr.azurecr.io/topic-service
    newTag: latest
  - name: ytplanneracr.azurecr.io/content-service
    newTag: latest
  - name: ytplanneracr.azurecr.io/shell-app
    newTag: latest
  - name: ytplanneracr.azurecr.io/topic-manager-mfe
    newTag: latest
  - name: ytplanneracr.azurecr.io/content-writer-mfe
    newTag: latest

patchesStrategicMerge: []
```

---

## 22. Deployment Checklist

### Phase 1: Azure Infrastructure

- [ ] Azure CLI installed and logged in (`az login`)
- [ ] Resource group created (`rg-yt-planner`)
- [ ] ACR created (`ytplanneracr`)
- [ ] AKS cluster created and running
- [ ] ACR attached to AKS cluster
- [ ] `kubectl` connected to AKS (`az aks get-credentials`)
- [ ] Nodes visible (`kubectl get nodes`)

### Phase 2: Container Images

- [ ] All 5 Docker images built successfully
- [ ] All images pushed to ACR
- [ ] Images verified in ACR (`az acr repository list`)

### Phase 3: Kubernetes Foundation

- [ ] Namespace `yt-planner` created
- [ ] Secrets created (db-credentials, openai-api-key)
- [ ] ConfigMaps created for all services
- [ ] Network policies applied

### Phase 4: Infrastructure Services (Deploy in Order)

- [ ] PostgreSQL StatefulSet running, PVC bound
- [ ] Database initialized (init.sql applied)
- [ ] Redis StatefulSet running, PVC bound
- [ ] Zookeeper StatefulSet running
- [ ] Kafka StatefulSet running, connected to Zookeeper

### Phase 5: Application Services

- [ ] topic-service Deployment running (2 replicas)
- [ ] topic-service connected to PostgreSQL and Kafka
- [ ] content-service Deployment running (2 replicas)
- [ ] content-service connected to Redis, Kafka, and OpenAI
- [ ] topic-manager-mfe Deployment running
- [ ] content-writer-mfe Deployment running
- [ ] shell-app Deployment running, Module Federation remotes resolved

### Phase 6: Networking and Access

- [ ] NGINX Ingress Controller installed
- [ ] External IP assigned to LoadBalancer
- [ ] Ingress resource created with routing rules
- [ ] (Optional) Custom domain DNS configured
- [ ] (Optional) TLS certificate provisioned via cert-manager
- [ ] Application accessible via browser

### Phase 7: Production Hardening

- [ ] HPA configured for backend services
- [ ] Resource requests and limits set for all pods
- [ ] Liveness and readiness probes working
- [ ] Azure Monitor / Container Insights dashboard reviewed
- [ ] Backup strategy for PostgreSQL tested
- [ ] Microsoft Entra ID authentication working end-to-end

### Quick Deploy Commands (After All Manifests Are Ready)

```bash
# 1. Apply all manifests
kubectl apply -k infra/k8s/overlays/azure/

# 2. Watch rollout
kubectl get pods -n yt-planner -w

# 3. Verify all services
kubectl get all -n yt-planner

# 4. Get external access URL
kubectl get ingress -n yt-planner
```

---

## Appendix: Docker Compose to Kubernetes Translation Reference

| Docker Compose Concept | Kubernetes Equivalent |
|----------------------|---------------------|
| `services:` | `Deployment` or `StatefulSet` |
| `image:` | `spec.containers[].image` |
| `ports:` | `Service` + `containerPort` |
| `environment:` | `ConfigMap` + `Secret` + `env:` |
| `volumes:` (named) | `PersistentVolumeClaim` |
| `volumes:` (bind mount) | `ConfigMap` or `hostPath` |
| `depends_on:` | `initContainers` or startup ordering |
| `networks:` | `Namespace` + `Service` + `NetworkPolicy` |
| `healthcheck:` | `livenessProbe` + `readinessProbe` |
| `restart: always` | Default behavior in Kubernetes |
| `deploy.replicas:` | `spec.replicas:` |
| Docker Compose DNS (service name) | Kubernetes DNS (`<svc-name>.<namespace>.svc.cluster.local`) |