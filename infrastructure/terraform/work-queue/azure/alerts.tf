# Service Bus namespace metrics carry the topic in the EntityName dimension; subscriptions are not a dimension, so
# these alerts are per topic. 'mj queue dead-letters --subscription <name>' narrows to the subscription.
resource "azurerm_monitor_metric_alert" "dead_letters" {
  for_each = local.topics

  name                = "${local.topic_names[each.key]}-dead-letters"
  resource_group_name = var.resource_group_name
  scopes              = [local.namespace_id]
  description         = "Dead letters waiting on a subscription of topic '${each.key}'. List with 'mj queue dead-letters --subscription <name>' (reason 'RedrivePolicy' means a crash loop), then 'mj queue replay' or 'mj queue discard'."
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT5M"
  tags                = local.common_tags

  criteria {
    metric_namespace = "Microsoft.ServiceBus/namespaces"
    metric_name      = "DeadletteredMessages"
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 0

    dimension {
      name     = "EntityName"
      operator = "Include"
      values   = [local.topic_names[each.key]]
    }
  }

  dynamic "action" {
    for_each = var.alert_action_group_ids

    content {
      action_group_id = action.value
    }
  }
}

resource "azurerm_monitor_metric_alert" "backlog" {
  for_each = local.topics

  name                = "${local.topic_names[each.key]}-backlog"
  resource_group_name = var.resource_group_name
  scopes              = [local.namespace_id]
  description         = "Active messages on topic '${each.key}' keep growing. Check 'mj queue stats --subscription <name>', the consumers' errors, and whether a subscription is Paused (its receivers are then disabled)."
  severity            = 3
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = local.common_tags

  criteria {
    metric_namespace = "Microsoft.ServiceBus/namespaces"
    metric_name      = "ActiveMessages"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 1000

    dimension {
      name     = "EntityName"
      operator = "Include"
      values   = [local.topic_names[each.key]]
    }
  }

  dynamic "action" {
    for_each = var.alert_action_group_ids

    content {
      action_group_id = action.value
    }
  }
}
