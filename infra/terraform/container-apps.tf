# ── Log Analytics Workspace ───────────────────────────────────────────────────
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "log-yt-planner"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

# ── Container Apps Environment ────────────────────────────────────────────────
resource "azurerm_container_app_environment" "cae" {
  name                       = "cae-yt-planner"
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  infrastructure_subnet_id   = azurerm_subnet.container_apps.id

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
    minimum_count         = 0
    maximum_count         = 10
  }

  tags = local.common_tags
}

# ── topic-manager-mfe — INTERNAL ─────────────────────────────────────────────
# No registry block needed — GHCR packages are public, no credentials required.
# host-app nginx proxies /mfe/topic-manager/* to this app via internal DNS.
resource "azurerm_container_app" "topic_manager_mfe" {
  name                         = "topic-manager-mfe"
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
      name   = "topic-manager-mfe"
      image  = "${local.ghcr_image_prefix}/topic-manager-mfe:latest"
      cpu    = 0.25
      memory = "0.5Gi"

      liveness_probe {
        path           = "/health"
        port           = 80
        transport      = "HTTP"
        initial_delay  = 10
        period_seconds = 30
      }

      readiness_probe {
        path           = "/health"
        port           = 80
        transport      = "HTTP"
        period_seconds = 10
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = local.common_tags
}

# ── content-writer-mfe — INTERNAL ────────────────────────────────────────────
resource "azurerm_container_app" "content_writer_mfe" {
  name                         = "content-writer-mfe"
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
      name   = "content-writer-mfe"
      image  = "${local.ghcr_image_prefix}/content-writer-mfe:latest"
      cpu    = 0.25
      memory = "0.5Gi"

      liveness_probe {
        path           = "/health"
        port           = 80
        transport      = "HTTP"
        initial_delay  = 10
        period_seconds = 30
      }

      readiness_probe {
        path           = "/health"
        port           = 80
        transport      = "HTTP"
        period_seconds = 10
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = local.common_tags
}

# ── host-app — EXTERNAL (the only public-facing app) ─────────────────────────
resource "azurerm_container_app" "host_app" {
  name                         = "host-app"
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
      name   = "host-app"
      image  = "${local.ghcr_image_prefix}/host-app:latest"
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
        path           = "/health"
        port           = 80
        transport      = "HTTP"
        initial_delay  = 10
        period_seconds = 30
      }

      readiness_probe {
        path           = "/health"
        port           = 80
        transport      = "HTTP"
        period_seconds = 10
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  tags = local.common_tags
}
