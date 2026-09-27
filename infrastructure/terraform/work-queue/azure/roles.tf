# MJAPI: publish (REST + in-process), binding validation, and the operator remote operations (stats, dead-letter
# peek/replay/discard). Replay receives from the dead-letter subqueue and re-sends to the topic, so it needs Data Owner
# on subscriptions and Data Sender on topics.
resource "azurerm_role_assignment" "mjapi_topic_sender" {
  for_each = var.mjapi_principal_id == null ? {} : local.topics

  scope                = azurerm_servicebus_topic.this[each.key].id
  role_definition_name = "Azure Service Bus Data Sender"
  principal_id         = var.mjapi_principal_id
}

resource "azurerm_role_assignment" "mjapi_subscription_owner" {
  for_each = var.mjapi_principal_id == null ? {} : local.subscriptions

  scope                = azurerm_servicebus_subscription.this[each.key].id
  role_definition_name = "Azure Service Bus Data Owner"
  principal_id         = var.mjapi_principal_id
}

# MJ workers: receive from MJWorker subscriptions and write their dead letters (Data Receiver covers settlement and
# dead-lettering); retry copies are sent to the topic (Data Sender).
locals {
  worker_subscription_assignments = merge([
    for principal in var.mj_worker_principal_ids : {
      for k, s in local.mj_worker_subscriptions : "${principal}|${k}" => { principal = principal, subscription = k, topic = s.topic }
    }
  ]...)
  worker_topic_assignments = merge([
    for principal in var.mj_worker_principal_ids : {
      for t in distinct([for s in values(local.mj_worker_subscriptions) : s.topic]) : "${principal}|${t}" => { principal = principal, topic = t }
    }
  ]...)
  function_assignments = {
    for k, c in var.function_consumers : k => { principal = c.principal_id, subscription = k, topic = local.subscriptions[k].topic } if c.principal_id != null
  }
}

resource "azurerm_role_assignment" "worker_receiver" {
  for_each = local.worker_subscription_assignments

  scope                = azurerm_servicebus_subscription.this[each.value.subscription].id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = each.value.principal
}

resource "azurerm_role_assignment" "worker_sender" {
  for_each = local.worker_topic_assignments

  scope                = azurerm_servicebus_topic.this[each.value.topic].id
  role_definition_name = "Azure Service Bus Data Sender"
  principal_id         = each.value.principal
}

# Functions consumers: their own subscription and topic only.
resource "azurerm_role_assignment" "function_receiver" {
  for_each = local.function_assignments

  scope                = azurerm_servicebus_subscription.this[each.value.subscription].id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = each.value.principal
}

resource "azurerm_role_assignment" "function_sender" {
  for_each = local.function_assignments

  scope                = azurerm_servicebus_topic.this[each.value.topic].id
  role_definition_name = "Azure Service Bus Data Sender"
  principal_id         = each.value.principal
}
