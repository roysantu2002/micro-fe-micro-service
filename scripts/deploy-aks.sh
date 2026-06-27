#!/bin/bash
# ============================================================================
# AKS Deployment Script - YouTube Content Planner
# For learning/development use
# ============================================================================
set -e

# Configuration
RESOURCE_GROUP="rg-yt-planner"
AKS_CLUSTER="aks-yt-planner"
ACR_NAME="ytplanneracr"
ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
NAMESPACE="yt-planner"
IMAGE_TAG="v1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "\n${BLUE}==== $1 ====${NC}\n"
}

print_success() {
    echo -e "${GREEN}[OK] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# ============================================================================
# Step 1: Verify prerequisites
# ============================================================================
print_step "Step 1: Verifying prerequisites"

for cmd in az kubectl docker helm; do
    if command -v $cmd &> /dev/null; then
        print_success "$cmd is installed"
    else
        print_error "$cmd is not installed. Please install it first."
        exit 1
    fi
done

# Check Azure login
if az account show &> /dev/null; then
    SUBSCRIPTION=$(az account show --query name -o tsv)
    print_success "Logged in to Azure (subscription: $SUBSCRIPTION)"
else
    print_warning "Not logged in to Azure. Running 'az login'..."
    az login
fi

# ============================================================================
# Step 2: Connect to AKS cluster
# ============================================================================
print_step "Step 2: Connecting to AKS cluster"

if az aks show --name $AKS_CLUSTER --resource-group $RESOURCE_GROUP &> /dev/null; then
    az aks get-credentials --resource-group $RESOURCE_GROUP --name $AKS_CLUSTER --overwrite-existing
    print_success "Connected to AKS cluster: $AKS_CLUSTER"
    kubectl get nodes
else
    print_error "AKS cluster '$AKS_CLUSTER' not found in resource group '$RESOURCE_GROUP'"
    echo "Create it first with the commands in docs/10-AZURE-AKS-DEPLOYMENT.md Section 3"
    exit 1
fi

# ============================================================================
# Step 3: Build and push Docker images
# ============================================================================
print_step "Step 3: Building and pushing Docker images to ACR"

# Login to ACR
echo "Logging in to ACR..."
az acr login --name $ACR_NAME 2>/dev/null || {
    print_warning "az acr login failed, trying token-based login..."
    docker login ${ACR_LOGIN_SERVER} \
        -u 00000000-0000-0000-0000-000000000000 \
        -p $(az acr login --name $ACR_NAME --expose-token --output tsv --query accessToken)
}
print_success "Logged in to ACR: $ACR_LOGIN_SERVER"

# Navigate to project root
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Build and push each service
build_and_push() {
    local SERVICE=$1
    local CONTEXT=$2
    echo ""
    echo "Building ${SERVICE} from ${CONTEXT}..."
    docker build -t ${ACR_LOGIN_SERVER}/${SERVICE}:${IMAGE_TAG} ./${CONTEXT}/
    docker push ${ACR_LOGIN_SERVER}/${SERVICE}:${IMAGE_TAG}
    print_success "Pushed ${ACR_LOGIN_SERVER}/${SERVICE}:${IMAGE_TAG}"
}

build_and_push "topic-service"       "backend/topic-service"
build_and_push "content-service"     "backend/content-service"
build_and_push "shell-app"           "frontend/shell-app"
build_and_push "topic-manager-mfe"   "frontend/topic-manager-mfe"
build_and_push "content-writer-mfe"  "frontend/content-writer-mfe"

# ============================================================================
# Step 4: Install NGINX Ingress Controller
# ============================================================================
print_step "Step 4: Installing NGINX Ingress Controller"

if kubectl get namespace ingress-nginx &> /dev/null; then
    print_success "NGINX Ingress Controller namespace already exists"
else
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    helm install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.replicaCount=2 \
        --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
    print_success "NGINX Ingress Controller installed"
fi

# ============================================================================
# Step 5: Deploy Kubernetes manifests
# ============================================================================
print_step "Step 5: Deploying Kubernetes manifests"

# Apply using kustomize (azure overlay)
kubectl apply -k infra/k8s/overlays/azure/
print_success "All manifests applied"

# ============================================================================
# Step 6: Wait for rollouts
# ============================================================================
print_step "Step 6: Waiting for deployments to be ready"

echo "Waiting for infrastructure pods..."
kubectl wait --for=condition=ready pod -l app=postgres -n $NAMESPACE --timeout=120s 2>/dev/null || print_warning "Postgres not ready yet"
kubectl wait --for=condition=ready pod -l app=redis -n $NAMESPACE --timeout=120s 2>/dev/null || print_warning "Redis not ready yet"
kubectl wait --for=condition=ready pod -l app=zookeeper -n $NAMESPACE --timeout=120s 2>/dev/null || print_warning "Zookeeper not ready yet"
kubectl wait --for=condition=ready pod -l app=kafka -n $NAMESPACE --timeout=120s 2>/dev/null || print_warning "Kafka not ready yet"

echo ""
echo "Waiting for application pods..."
kubectl wait --for=condition=ready pod -l app=topic-service -n $NAMESPACE --timeout=180s 2>/dev/null || print_warning "Topic service not ready yet"
kubectl wait --for=condition=ready pod -l app=content-service -n $NAMESPACE --timeout=120s 2>/dev/null || print_warning "Content service not ready yet"
kubectl wait --for=condition=ready pod -l app=shell-app -n $NAMESPACE --timeout=120s 2>/dev/null || print_warning "Shell app not ready yet"
kubectl wait --for=condition=ready pod -l app=topic-manager-mfe -n $NAMESPACE --timeout=120s 2>/dev/null || print_warning "Topic manager MFE not ready yet"
kubectl wait --for=condition=ready pod -l app=content-writer-mfe -n $NAMESPACE --timeout=120s 2>/dev/null || print_warning "Content writer MFE not ready yet"

# ============================================================================
# Step 7: Show status and access info
# ============================================================================
print_step "Step 7: Deployment Status"

echo "--- Pods ---"
kubectl get pods -n $NAMESPACE -o wide
echo ""
echo "--- Services ---"
kubectl get svc -n $NAMESPACE
echo ""
echo "--- Ingress ---"
kubectl get ingress -n $NAMESPACE
echo ""
echo "--- Ingress Controller External IP ---"
EXTERNAL_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)

if [ -n "$EXTERNAL_IP" ]; then
    echo ""
    print_success "Deployment complete!"
    echo ""
    echo -e "${GREEN}Access your application:${NC}"
    echo "  Frontend (Shell App):  http://${EXTERNAL_IP}/"
    echo "  Topic Manager MFE:    http://${EXTERNAL_IP}/topic-manager"
    echo "  Content Writer MFE:   http://${EXTERNAL_IP}/content-writer"
    echo "  Topics API:           http://${EXTERNAL_IP}/api/topics"
    echo "  Content API:          http://${EXTERNAL_IP}/api/content/health"
    echo ""
    echo "Quick test:"
    echo "  curl http://${EXTERNAL_IP}/api/topics"
    echo "  curl http://${EXTERNAL_IP}/api/content/health"
else
    print_warning "External IP not assigned yet. Run this to check:"
    echo "  kubectl get svc -n ingress-nginx ingress-nginx-controller --watch"
    echo ""
    echo "Or use port-forward for immediate access:"
    echo "  kubectl port-forward svc/shell-app-svc 3000:3000 -n $NAMESPACE"
    echo "  kubectl port-forward svc/topic-service-svc 8081:8081 -n $NAMESPACE"
    echo "  kubectl port-forward svc/content-service-svc 8082:8082 -n $NAMESPACE"
fi
