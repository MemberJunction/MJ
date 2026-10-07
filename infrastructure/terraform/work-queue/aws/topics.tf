resource "aws_sns_topic" "this" {
  for_each = local.topics

  name                        = local.topic_names[each.key]
  fifo_topic                  = each.value.is_fifo
  content_based_deduplication = false
  # High-throughput FIFO: throughput quota per message group rather than per topic (verify the attribute name
  # against the pinned provider version; it pairs with the queues' perMessageGroupId limit below).
  fifo_throughput_scope = each.value.is_fifo && var.fifo_high_throughput ? "MessageGroup" : null
  kms_master_key_id     = local.kms_key_arn
  tags                  = local.common_tags

  lifecycle {
    precondition {
      condition     = each.value.is_fifo || length([for s in values(local.subscriptions) : s.name if s.topic == each.key && s.partition_mode == "Exclusive"]) == 0
      error_message = "Topic '${each.key}' must be FIFO (IsFifo = true): it has an Exclusive subscription (plan 03 W7). A FIFO topic makes every queue on it FIFO; use the two-topic pattern for firehoses (plan 11 section 4)."
    }
  }
}
