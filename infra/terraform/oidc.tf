# ── OIDC / Workload Identity Federation ──────────────────────────────────────
#
# How it works (zero long-lived secrets):
#
#   1. This file creates an Azure App Registration for GitHub Actions CI/CD.
#   2. A Federated Identity Credential is attached — it tells Azure:
#      "Trust OIDC tokens issued by GitHub for repo santuroy/micro-fe-micro-service"
#   3. When GitHub Actions runs, it requests a short-lived OIDC token from GitHub.
#   4. It sends that token to Azure AD → Azure verifies the Federated Credential
#      and issues a short-lived (5-min) Azure access token.
#   5. GitHub Actions uses that token to deploy Container Apps.
#
# Images live in GHCR (not ACR) — GitHub Actions pushes with the automatic
# GITHUB_TOKEN, no manual PAT needed. Packages are made public so Container
# Apps can pull without any credentials.
#
# What you save to GitHub (plain Variables, NOT secrets):
#   AZURE_CLIENT_ID       → azuread_application.github_actions.client_id
#   AZURE_TENANT_ID       → data.azuread_client_config.current.tenant_id
#   AZURE_SUBSCRIPTION_ID → ac91a2b4-4d65-4c8d-9e4f-db410eef92a0

data "azuread_client_config" "current" {}

# App Registration for GitHub Actions CI/CD (separate from the MSAL app for auth)
resource "azuread_application" "github_actions" {
  display_name = "sp-yt-planner-github-actions"
  owners       = [data.azuread_client_config.current.object_id]
}

resource "azuread_service_principal" "github_actions" {
  client_id = azuread_application.github_actions.client_id
  owners    = [data.azuread_client_config.current.object_id]
}

# Federated credential for the main branch deploy (environment: production)
resource "azuread_application_federated_identity_credential" "github_main" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-actions-main"
  description    = "Trust GitHub Actions OIDC tokens for main branch production environment"

  issuer    = "https://token.actions.githubusercontent.com"
  subject   = "repo:roysantu2002/micro-fe-micro-service:environment:production"
  audiences = ["api://AzureADTokenExchange"]
}

# Federated credential for main branch ref (non-environment deploys)
resource "azuread_application_federated_identity_credential" "github_main_ref" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-actions-main-ref"
  description    = "Trust GitHub Actions OIDC tokens for main branch ref"

  issuer    = "https://token.actions.githubusercontent.com"
  subject   = "repo:roysantu2002/micro-fe-micro-service:ref:refs/heads/main"
  audiences = ["api://AzureADTokenExchange"]
}

# Allow GitHub Actions to deploy / update Container Apps in the resource group
resource "azurerm_role_assignment" "github_actions_contributor" {
  scope                = azurerm_resource_group.rg.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.github_actions.object_id
}
