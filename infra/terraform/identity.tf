# User-Assigned Managed Identity
# Used now: assigned to host-app Container App for future ACR or Key Vault access
# If you switch from GHCR → ACR later, grant this identity AcrPull role to remove PAT dependency
resource "azurerm_user_assigned_identity" "mfe_identity" {
  name                = "id-yt-planner-mfe"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = local.common_tags
}
