resource "azurerm_servicebus_topic" "this" {
  for_each = local.topics

  name         = local.topic_names[each.key]
  namespace_id = local.namespace_id
  # Partitioned (IsFifo) topics publish with a SessionId; supportOrdering keeps a session's messages in publish order.
  support_ordering = each.value.is_fifo
  # Duplicate detection on MessageId = MessageID is silent (09a); the MJ ledger reports Duplicate, this only prevents a double enqueue.
  requires_duplicate_detection            = true
  duplicate_detection_history_time_window = var.duplicate_detection_window
  default_message_ttl                     = var.message_retention

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = each.value.is_fifo || length([for s in values(local.subscriptions) : s.name if s.topic == each.key && s.partition_mode == "Exclusive"]) == 0
      error_message = "Topic '${each.key}' must be IsFifo = true: it has an Exclusive subscription (plan 03 W7), and only partitioned topics publish with a SessionId. Use the two-topic pattern for firehoses (plan 11 section 4)."
    }
  }

  depends_on = [terraform_data.name_uniqueness]
}
