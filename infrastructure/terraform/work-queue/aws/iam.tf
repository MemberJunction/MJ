locals {
  topic_arns                  = [for t in aws_sns_topic.this : t.arn]
  all_queue_arns              = [for q in aws_sqs_queue.subscription : q.arn]
  all_dlq_arns                = [for q in aws_sqs_queue.dead_letter : q.arn]
  subscription_arns           = [for s in aws_sns_topic_subscription.this : s.arn]
  mj_worker_queue_arns        = [for k, s in local.mj_worker_subscriptions : aws_sqs_queue.subscription[k].arn]
  mj_worker_dlq_arns          = [for k, s in local.mj_worker_subscriptions : aws_sqs_queue.dead_letter[k].arn]
  mj_worker_topic_arns        = distinct([for k, s in local.mj_worker_subscriptions : aws_sns_topic.this[s.topic].arn])
  mj_worker_subscription_arns = [for k, s in local.mj_worker_subscriptions : aws_sns_topic_subscription.this[k].arn]
}

# MJAPI: publish (REST + in-process), binding validation, and the operator remote operations
# (stats, dead-letter scan/replay/discard).
data "aws_iam_policy_document" "mjapi" {
  statement {
    sid       = "PublishTopics"
    actions   = ["sns:Publish", "sns:GetTopicAttributes"]
    resources = local.topic_arns
  }

  statement {
    sid       = "ValidateSubscriptions"
    actions   = ["sns:GetSubscriptionAttributes"]
    resources = local.subscription_arns
  }

  statement {
    sid       = "InspectQueues"
    actions   = ["sqs:GetQueueAttributes"]
    resources = concat(local.all_queue_arns, local.all_dlq_arns)
  }

  statement {
    sid       = "OperateDeadLetters"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility"]
    resources = local.all_dlq_arns
  }

  statement {
    sid       = "ReplayToSubscriptionQueues"
    actions   = ["sqs:SendMessage"]
    resources = local.all_queue_arns
  }

  dynamic "statement" {
    for_each = local.kms_key_arn == null ? [] : [local.kms_key_arn]

    content {
      sid       = "UseQueueKey"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [statement.value]
    }
  }
}

# MJ workers: consume MJWorker subscription queues, write their dead letters, and run the read-only binding
# validation the host performs at start (sns:Get* on their own topics and subscriptions, sqs:GetQueueAttributes).
data "aws_iam_policy_document" "mj_worker" {
  count = length(local.mj_worker_subscriptions) > 0 ? 1 : 0

  statement {
    sid       = "ConsumeWorkerQueues"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
    resources = local.mj_worker_queue_arns
  }

  statement {
    sid       = "WriteAndInspectWorkerDeadLetters"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = local.mj_worker_dlq_arns
  }

  statement {
    sid       = "ValidateWorkerTopics"
    actions   = ["sns:GetTopicAttributes"]
    resources = local.mj_worker_topic_arns
  }

  statement {
    sid       = "ValidateWorkerSubscriptions"
    actions   = ["sns:GetSubscriptionAttributes"]
    resources = local.mj_worker_subscription_arns
  }

  dynamic "statement" {
    for_each = local.kms_key_arn == null ? [] : [local.kms_key_arn]

    content {
      sid       = "UseQueueKey"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
      resources = [statement.value]
    }
  }
}
