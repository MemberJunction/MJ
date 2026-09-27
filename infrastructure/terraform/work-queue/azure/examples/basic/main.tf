terraform {
  required_version = ">= 1.7.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

module "work_queue" {
  source = "../.."
  # Produce with: mj queue export-topology --transport Azure-dev > manifest.json
  # (the export renders DriverArtifacts.ServiceBusRuleSql / RequiresSession and Status; never hand-edit rules here)
  manifest_path       = "${path.module}/manifest.json"
  name_prefix         = "mj-wq"
  environment         = "dev"
  resource_group_name = "rg-mj-wq-dev"
  location            = "eastus2"
  mjapi_principal_id  = "replace-with-the-mjapi-managed-identity-object-id"

  function_consumers = {
    "email.archive" = {
      principal_id = "replace-with-the-function-app-identity-object-id"
    }
  }
}

output "binding_import" {
  value = module.work_queue.binding_import
}

output "consumer_app_settings" {
  value     = module.work_queue.consumer_app_settings
  sensitive = false
}
