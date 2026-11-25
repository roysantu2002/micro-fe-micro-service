terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.53"
    }
  }

  # Recommended after first apply: uncomment to store state in Azure Blob
  # backend "azurerm" {
  #   resource_group_name  = "rg-yt-planner-tfstate"
  #   storage_account_name = "ytplannertfstate"
  #   container_name       = "tfstate"
  #   key                  = "mfe.tfstate"
  # }
}

provider "azurerm" {
  subscription_id = var.subscription_id
  features {}
}

provider "azuread" {}
