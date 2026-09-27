resource "azurerm_servicebus_namespace" "this" {
  count = var.servicebus_namespace_id == null ? 1 : 0

  name                = local.base
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = var.namespace_sku
  capacity            = var.namespace_sku == "Premium" ? var.namespace_capacity : 0
  # Managed identity only: no SAS keys for MJ, workers or consumers.
  local_auth_enabled = false
  tags               = local.common_tags

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [terraform_data.namespace_inputs]
}
