# ── Azure Container Registry ──────────────────────────────────────────────────
# Replaces GHCR. GitHub Actions pushes here; Container Apps pull via Managed Identity.
# No PAT tokens needed anywhere.
resource "azurerm_container_registry" "acr" {
  name                = "ytplanneracr"           # must be globally unique, alphanumeric only
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"                  # Basic is enough for this setup
  admin_enabled       = false                    # disabled — we use Managed Identity, not admin creds

  tags = local.common_tags
}

# Grant the Managed Identity permission to PULL images from ACR
# Container Apps use this identity to authenticate to ACR without any secret
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.mfe_identity.principal_id
}

# Grant the GitHub Actions Service Principal permission to PUSH images to ACR
# The principal_id comes from the Entra App Registration created for CI/CD (see oidc.tf)
resource "azurerm_role_assignment" "acr_push" {
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPush"
  principal_id         = azurerm_service_principal.github_actions.object_id
}

# Grant the GitHub Actions Service Principal permission to deploy Container Apps
resource "azurerm_role_assignment" "container_apps_contributor" {
  scope                = azurerm_resource_group.rg.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_service_principal.github_actions.object_id
}
