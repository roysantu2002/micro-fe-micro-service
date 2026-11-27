# ── mfe-sample-complete Container Apps ───────────────────────────────────────
# These reuse the existing cae-yt-planner environment and rg-yt-planner group.
# Architecture:
#   sample-host-app (external/public)
#     ├── /mfe/items/  → sample-items-mfe  (internal nginx)
#     └── /api/        → sample-items-service (internal Spring Boot)

# ── sample-items-mfe — INTERNAL ──────────────────────────────────────────────
resource "azurerm_container_app" "sample_items_mfe" {
  name                         = "sample-items-mfe"
  container_app_environment_id = azurerm_container_app_environment.cae.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.mfe_identity.id]
  }

  ingress {
    external_enabled = false
    target_port      = 80
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "sample-items-mfe"
      image  = "nginx:1.27-alpine"
      cpu    = 0.25
      memory = "0.5Gi"

      liveness_probe {
        path             = "/health"
        port             = 80
        transport        = "HTTP"
        initial_delay    = 10
        interval_seconds = 30
      }

      readiness_probe {
        path             = "/health"
        port             = 80
        transport        = "HTTP"
        interval_seconds = 10
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = local.common_tags
}

# ── sample-items-service — INTERNAL (Spring Boot) ────────────────────────────
resource "azurerm_container_app" "sample_items_service" {
  name                         = "sample-items-service"
  container_app_environment_id = azurerm_container_app_environment.cae.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.mfe_identity.id]
  }

  ingress {
    external_enabled = false
    target_port      = 8080
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "sample-items-service"
      image  = "nginx:1.27-alpine"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "AZURE_TENANT_ID"
        value = var.entra_tenant_id
      }

      env {
        name  = "MOCK_AUTH"
        value = "false"
      }

      liveness_probe {
        path             = "/actuator/health"
        port             = 8080
        transport        = "HTTP"
        initial_delay    = 30
        interval_seconds = 30
      }

      readiness_probe {
        path             = "/actuator/health"
        port             = 8080
        transport        = "HTTP"
        interval_seconds = 15
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = local.common_tags
}

# ── sample-host-app — EXTERNAL ───────────────────────────────────────────────
resource "azurerm_container_app" "sample_host_app" {
  name                         = "sample-host-app"
  container_app_environment_id = azurerm_container_app_environment.cae.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.mfe_identity.id]
  }

  ingress {
    external_enabled = true
    target_port      = 80
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 5

    container {
      name   = "sample-host-app"
      image  = "nginx:1.27-alpine"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "PUBLIC_ENTRA_CLIENT_ID"
        value = var.entra_client_id
      }

      env {
        name  = "PUBLIC_ENTRA_TENANT_ID"
        value = var.entra_tenant_id
      }

      liveness_probe {
        path             = "/health"
        port             = 80
        transport        = "HTTP"
        initial_delay    = 10
        interval_seconds = 30
      }

      readiness_probe {
        path             = "/health"
        port             = 80
        transport        = "HTTP"
        interval_seconds = 10
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = local.common_tags
}

output "sample_host_app_url" {
  description = "Public URL — add this to Entra SPA redirect URIs after first deploy"
  value       = "https://${azurerm_container_app.sample_host_app.latest_revision_fqdn}"
}
