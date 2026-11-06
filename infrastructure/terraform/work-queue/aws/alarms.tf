resource "aws_cloudwatch_metric_alarm" "dead_letters" {
  for_each = local.subscriptions

  alarm_name          = "${local.dead_letter_queue_names[each.key]}-has-messages"
  alarm_description   = "Dead letters waiting for subscription '${each.key}'. List with 'mj queue dead-letters --subscription ${each.key}' (scans up to 100; reason 'RedrivePolicy' means a crash loop). Replay one with 'mj queue replay'; for a bulk redrive use 'aws sqs start-message-move-task' on ${local.dead_letter_queue_names[each.key]}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.dead_letter[each.key].name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "delivery_failures" {
  for_each = local.subscriptions

  alarm_name          = "${local.delivery_failure_queue_names[each.key]}-has-messages"
  alarm_description   = "SNS could not deliver to the queue of subscription '${each.key}' (queue policy or KMS key policy). MemberJunction cannot see this queue: inspect it in the SQS console or with 'aws sqs receive-message', fix the policy, then move the messages back with 'aws sqs start-message-move-task'."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.delivery_failure[each.key].name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "oldest_message" {
  for_each = local.subscriptions

  alarm_name          = "${local.queue_names[each.key]}-backlog-age"
  alarm_description   = "Oldest message for subscription '${each.key}' is older than ${var.oldest_message_age_alarm_seconds} seconds. Check 'mj queue stats --subscription ${each.key}', the consumer's errors/throttles alarms, and whether the subscription is Paused (its Lambda event source is then disabled)."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = aws_sqs_queue.subscription[each.key].name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.oldest_message_age_alarm_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.lambda_subscriptions

  alarm_name          = "${local.function_names[each.key]}-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.consumer[each.key].function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each = local.lambda_subscriptions

  alarm_name          = "${local.function_names[each.key]}-throttles"
  alarm_description   = "Consumer of '${each.key}' is being throttled. Every throttled invocation burns a receive of its messages; raise account concurrency or lower maximum_concurrency on the event source, and remove reserved_concurrency."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.consumer[each.key].function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  tags                = local.common_tags
}
