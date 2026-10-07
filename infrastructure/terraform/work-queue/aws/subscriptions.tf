resource "aws_sqs_queue" "dead_letter" {
  for_each = local.subscriptions

  name                      = local.dead_letter_queue_names[each.key]
  fifo_queue                = each.value.is_fifo
  message_retention_seconds = 1209600
  max_message_size          = 262144
  kms_master_key_id         = local.kms_key_arn
  sqs_managed_sse_enabled   = local.kms_key_arn == null ? true : null
  tags                      = local.common_tags

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [terraform_data.name_uniqueness, terraform_data.kms_key_policy]
}

# SNS -> SQS delivery failures (queue policy or KMS problems). Without it SNS drops what it cannot deliver.
resource "aws_sqs_queue" "delivery_failure" {
  for_each = local.subscriptions

  name                      = local.delivery_failure_queue_names[each.key]
  fifo_queue                = each.value.is_fifo
  message_retention_seconds = 1209600
  max_message_size          = 262144
  kms_master_key_id         = local.kms_key_arn
  sqs_managed_sse_enabled   = local.kms_key_arn == null ? true : null
  tags                      = local.common_tags

  depends_on = [terraform_data.name_uniqueness, terraform_data.kms_key_policy]
}

resource "aws_sqs_queue" "subscription" {
  for_each = local.subscriptions

  name                       = local.queue_names[each.key]
  fifo_queue                 = each.value.is_fifo
  deduplication_scope        = each.value.is_fifo && var.fifo_high_throughput ? "messageGroup" : null
  fifo_throughput_limit      = each.value.is_fifo && var.fifo_high_throughput ? "perMessageGroupId" : null
  visibility_timeout_seconds = local.visibility_timeout_seconds[each.key]
  message_retention_seconds  = var.message_retention_seconds
  max_message_size           = 262144
  receive_wait_time_seconds  = 20
  kms_master_key_id          = local.kms_key_arn
  sqs_managed_sse_enabled    = local.kms_key_arn == null ? true : null
  tags                       = local.common_tags

  # Crash-loop backstop only: the runtime dead-letters at MaxAttempts and the consumer's receive-time guard at
  # MaxAttempts + 2 (plan 03 section 5.1). Release on shutdown and Lambda throttling consume receives too.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[each.key].arn
    maxReceiveCount     = local.max_receive_count[each.key]
  })

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = each.value.partition_mode != "Ordered"
      error_message = "Subscription '${each.key}' is Ordered. Ordered requires the Database transport: move its topic to the Database transport in MJ and re-export the manifest (plan 11, S2)."
    }
  }

  depends_on = [terraform_data.name_uniqueness, terraform_data.kms_key_policy]
}

resource "aws_sqs_queue_redrive_allow_policy" "dead_letter" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.dead_letter[each.key].id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.subscription[each.key].arn]
  })
}

data "aws_iam_policy_document" "queue" {
  for_each = local.subscriptions

  statement {
    sid       = "AllowOwnTopic"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.subscription[each.key].arn]

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.this[each.value.topic].arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.subscription[each.key].arn]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "subscription" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.subscription[each.key].id
  policy    = data.aws_iam_policy_document.queue[each.key].json
}

data "aws_iam_policy_document" "delivery_failure_queue" {
  for_each = local.subscriptions

  statement {
    sid       = "AllowOwnTopicDeliveryFailures"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.delivery_failure[each.key].arn]

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.this[each.value.topic].arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.delivery_failure[each.key].arn]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "delivery_failure" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.delivery_failure[each.key].id
  policy    = data.aws_iam_policy_document.delivery_failure_queue[each.key].json
}

data "aws_iam_policy_document" "dead_letter_queue" {
  for_each = local.subscriptions

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.dead_letter[each.key].arn]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "dead_letter" {
  for_each = local.subscriptions

  queue_url = aws_sqs_queue.dead_letter[each.key].id
  policy    = data.aws_iam_policy_document.dead_letter_queue[each.key].json
}

resource "aws_sns_topic_subscription" "this" {
  for_each = local.subscriptions

  topic_arn            = aws_sns_topic.this[each.value.topic].arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.subscription[each.key].arn
  raw_message_delivery = true
  filter_policy        = each.value.sns_filter_policy
  filter_policy_scope  = each.value.sns_filter_policy == null ? null : "MessageAttributes"
  redrive_policy       = jsonencode({ deadLetterTargetArn = aws_sqs_queue.delivery_failure[each.key].arn })

  depends_on = [aws_sqs_queue_policy.subscription, aws_sqs_queue_policy.delivery_failure]

  lifecycle {
    precondition {
      condition     = each.value.filter_json == null || each.value.sns_filter_policy != null
      error_message = "Subscription '${each.key}' has a Filter but the manifest carries no DriverArtifacts.SnsFilterPolicy; re-export the manifest with 'mj queue export-topology' so the subscription does not receive every message."
    }
  }
}

locals {
  # The Config half of SubscriptionBinding (plan 07 Task 1 AwsSubscriptionConfig).
  subscription_config = {
    for k, s in local.subscriptions : k => {
      Region             = var.region
      QueueUrl           = aws_sqs_queue.subscription[k].url
      QueueArn           = aws_sqs_queue.subscription[k].arn
      DeadLetterQueueUrl = aws_sqs_queue.dead_letter[k].url
      DeadLetterQueueArn = aws_sqs_queue.dead_letter[k].arn
      IsFifo             = s.is_fifo
      SnsSubscriptionArn = aws_sns_topic_subscription.this[k].arn
    }
  }
}
