resource "azurerm_servicebus_subscription" "this" {
  for_each = local.subscriptions

  name     = local.subscription_names[each.key]
  topic_id = azurerm_servicebus_topic.this[each.value.topic].id
  # Exclusive = sessions (SessionId = PartitionKey): one receiver per key at a time (09a). Immutable after creation.
  requires_session = each.value.requires_session
  lock_duration    = local.lock_duration[each.key]
  # Crash-loop backstop only: the runtime dead-letters at MaxAttempts, the receive-time guard at MaxAttempts + 2.
  max_delivery_count                   = local.max_delivery_count[each.key]
  dead_lettering_on_message_expiration = true
  default_message_ttl                  = var.message_retention
  # Pausing or disabling a subscription in MJ stops delivery to receivers (the manifest carries Status, plan 03 section 10);
  # publishes still land on the subscription and wait.
  status = each.value.status == "Active" ? "Active" : "ReceiveDisabled"

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = each.value.partition_mode != "Ordered"
      error_message = "Subscription '${each.key}' is Ordered. Ordered requires the Database transport: move its topic to the Database transport in MJ and re-export the manifest (plan 11, S2)."
    }
    precondition {
      condition     = each.value.requires_session == (each.value.partition_mode == "Exclusive")
      error_message = "Subscription '${each.key}': DriverArtifacts.RequiresSession disagrees with PartitionMode; re-export the manifest with 'mj queue export-topology'."
    }
    precondition {
      condition     = each.value.lease_seconds <= 300
      error_message = "Subscription '${each.key}' has LeaseSeconds ${each.value.lease_seconds}; Service Bus caps a lock at 300 seconds. Lower LeaseSeconds in MJ (heartbeats renew the lock while a handler runs)."
    }
  }

  depends_on = [terraform_data.name_uniqueness]
}

# One rule per subscription: the service's catch-all $Default rule is replaced by MJ's targeting clause + filter. Rules
# OR together, so any second rule would widen delivery; binding validation reports extra rules as an Error.
resource "azurerm_servicebus_subscription_rule" "this" {
  for_each = local.subscriptions

  name            = "$Default"
  subscription_id = azurerm_servicebus_subscription.this[each.key].id
  filter_type     = "SqlFilter"
  sql_filter      = each.value.rule_sql

  lifecycle {
    precondition {
      condition     = each.value.rule_sql != null
      error_message = "Subscription '${each.key}' has no DriverArtifacts.ServiceBusRuleSql; re-export the manifest with 'mj queue export-topology' so the rule carries the targeting clause and the filter."
    }
  }
}

locals {
  # The Config half of SubscriptionBinding (AzureSubscriptionConfig in @memberjunction/work-queue-azure).
  subscription_config = {
    for k, s in local.subscriptions : k => {
      FullyQualifiedNamespace = "${local.namespace_name}.servicebus.windows.net"
      TopicName               = local.topic_names[s.topic]
      SubscriptionName        = local.subscription_names[k]
      RequiresSession         = s.requires_session
    }
  }

  # MJ_WQ_SUBSCRIPTION freezes the subscription's policy at apply time. Changing MaxAttempts, backoff or the filter in
  # MJ without a new export + apply is drift (GOVERNANCE.md); 'mj queue validate-bindings' warns about it.
  subscription_binding_json = {
    for k, s in local.function_subscriptions : k => jsonencode({
      Policy   = jsondecode(s.policy_json)
      Filter   = s.filter_json == null ? null : jsondecode(s.filter_json)
      HostType = s.host_type
      Config   = local.subscription_config[k]
    })
  }
}
