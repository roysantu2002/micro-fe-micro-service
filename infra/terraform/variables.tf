variable "subscription_id" {
  description = "Azure Subscription ID"
  type        = string
  default     = "ac91a2b4-4d65-4c8d-9e4f-db410eef92a0"
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus"
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
  default     = "rg-yt-planner"
}

variable "environment" {
  description = "Environment tag (dev / uat / prod)"
  type        = string
  default     = "dev"
}

variable "ghcr_username" {
  description = "GitHub username — used by Container Apps to pull images from GHCR"
  type        = string
  default     = "santuroy"
}

variable "ghcr_pat" {
  description = "GitHub PAT with read:packages scope — Container Apps pull secret for GHCR"
  type        = string
  sensitive   = true
  # Set via: export TF_VAR_ghcr_pat="ghp_xxxx"
}

variable "entra_tenant_id" {
  description = "Azure Entra ID Tenant ID (run: az account show --query tenantId -o tsv)"
  type        = string
  # Set via: export TF_VAR_entra_tenant_id="xxxx-xxxx"
}

variable "entra_client_id" {
  description = "Azure Entra ID App Registration Client ID (from portal.azure.com)"
  type        = string
  # Set via: export TF_VAR_entra_client_id="xxxx-xxxx"
}

variable "openai_api_key" {
  description = "OpenAI API Key — passed to content-service backend if deployed"
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

  ghcr_registry = "ghcr.io"
  image_prefix  = "ghcr.io/santuroy/micro-fe-micro-service"
}
