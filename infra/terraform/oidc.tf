# ── OIDC / Workload Identity Federation ──────────────────────────────────────
#
# This file sets up the trust between GitHub Actions and Azure using OIDC.
# How it works:
#   1. Azure creates an App Registration for GitHub Actions CI/CD
#   2. A Federated Credential is added — it says "trust tokens issued by GitHub
#      for the repo santuroy/micro-fe-micro-service on branch main"
#   3. GitHub Actions requests a short-lived OIDC token from GitHub itself
#   4. It presents that token to Azure AD — Azure trusts it because of the
#      Federated Credential and issues a short-lived Azure access token
#   5. GitHub Actions uses that Azure token to push to ACR and deploy Container Apps
#
# Result: NO passwords, NO long-lived secrets, NO AZURE_CREDENTIALS JSON.
# You only store 3 plain IDs (not secrets) in GitHub repository variables.

data "azuread_client_config" "current" {}

# App Registration specifically for GitHub Actions CI/CD (separate from MSAL app)
resource "azuread_application" "github_actions" {
  display_name = "sp-yt-planner-github-actions"
  owners       = [data.azuread_client_config.current.object_id]
}

resource "azuread_service_principal" "github_actions" {
  client_id = azuread_application.github_actions.client_id
  owners    = [data.azuread_client_config.current.object_id]
}

# Federated Identity Credential — trusts GitHub Actions on the main branch
resource "azuread_application_federated_identity_credential" "github_main" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-actions-main"
  description    = "Trust GitHub Actions OIDC tokens for main branch deployments"

  # These values tell Azure: "accept OIDC tokens that come from..."
  issuer  = "https://token.actions.githubusercontent.com"
  subject = "repo:santuroy/micro-fe-micro-service:ref:refs/heads/main"
  audiences = ["api://AzureADTokenExchange"]
}

# Also trust the feature branch during initial setup
resource "azuread_application_federated_identity_credential" "github_feature" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-actions-feature-branch"
  description    = "Trust GitHub Actions OIDC tokens for feature branch"

  issuer  = "https://token.actions.githubusercontent.com"
  subject = "repo:santuroy/micro-fe-micro-service:ref:refs/heads/feature/rsbuild-azure-container-apps"
  audiences = ["api://AzureADTokenExchange"]
}
