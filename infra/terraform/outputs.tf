output "host_app_url" {
  description = "Public HTTPS URL — open this in your browser after deployment"
  value       = "https://${azurerm_container_app.host_app.latest_revision_fqdn}"
}

output "topic_manager_internal_fqdn" {
  description = "Internal FQDN for topic-manager-mfe (accessible only within the Container Apps Environment)"
  value       = azurerm_container_app.topic_manager_mfe.latest_revision_fqdn
}

output "content_writer_internal_fqdn" {
  description = "Internal FQDN for content-writer-mfe"
  value       = azurerm_container_app.content_writer_mfe.latest_revision_fqdn
}

output "managed_identity_client_id" {
  description = "Client ID of the User-Assigned Managed Identity"
  value       = azurerm_user_assigned_identity.mfe_identity.client_id
}

output "managed_identity_principal_id" {
  description = "Principal ID — use this when granting RBAC roles to the identity"
  value       = azurerm_user_assigned_identity.mfe_identity.principal_id
}

output "container_apps_environment_name" {
  value = azurerm_container_app_environment.cae.name
}

output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}

output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.logs.id
}
