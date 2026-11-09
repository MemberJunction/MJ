locals {
  # Function and role names are limited to 64 characters; shortened names end with a hash of the subscription name.
  function_names = {
    for k, s in local.lambda_subscriptions : k => (
      length("${local.base}-${s.slug}") <= 64 ? "${local.base}-${s.slug}" : "${substr("${local.base}-${s.slug}", 0, 55)}-${substr(sha1(k), 0, 8)}"
    )
  }

  # MJ_WQ_SUBSCRIPTION freezes the subscription's policy at apply time. Changing MaxAttempts, backoff or the filter in
  # MJ without a new export + apply is drift (GOVERNANCE.md); 'mj queue validate-bindings' warns about it.
  subscription_binding_json = {
    for k, s in local.lambda_subscriptions : k => jsonencode({
      Policy   = jsondecode(s.policy_json)
      Filter   = s.filter_json == null ? null : jsondecode(s.filter_json)
      HostType = s.host_type
      Config   = local.subscription_config[k]
    })
  }
}

resource "terraform_data" "lambda_consumer_keys" {
  input = sort(keys(var.lambda_consumers))

  lifecycle {
    precondition {
      condition = alltrue([
        for k in keys(var.lambda_consumers) : contains(keys(local.subscriptions), k) && try(local.subscriptions[k].host_type, "") == "External"
      ])
      error_message = "Every lambda_consumers key must name a subscription in the manifest with HostType External."
    }
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "consumer" {
  for_each = local.lambda_subscriptions

  name               = local.function_names[each.key]
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.common_tags
}

resource "aws_cloudwatch_log_group" "consumer" {
  for_each = local.lambda_subscriptions

  name              = "/aws/lambda/${local.function_names[each.key]}"
  retention_in_days = 30
  # Needs the CloudWatch Logs statement in the key policy (kms.tf creates it; bring-your-own keys must confirm it).
  kms_key_id = local.kms_key_arn
  tags       = local.common_tags

  depends_on = [terraform_data.kms_key_policy]
}

data "aws_iam_policy_document" "consumer" {
  for_each = local.lambda_subscriptions

  statement {
    sid       = "ConsumeOwnQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.subscription[each.key].arn]
  }

  statement {
    sid       = "WriteOwnDeadLetters"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dead_letter[each.key].arn]
  }

  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.consumer[each.key].arn}:*"]
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

resource "aws_iam_role_policy" "consumer" {
  for_each = local.lambda_subscriptions

  name   = "work-queue-consumer"
  role   = aws_iam_role.consumer[each.key].id
  policy = data.aws_iam_policy_document.consumer[each.key].json
}

resource "aws_iam_role_policy" "consumer_extra" {
  for_each = { for k, s in local.lambda_subscriptions : k => s if var.lambda_consumers[k].extra_policy_json != null }

  name   = "consumer-extra"
  role   = aws_iam_role.consumer[each.key].id
  policy = var.lambda_consumers[each.key].extra_policy_json
}

resource "aws_lambda_function" "consumer" {
  for_each = local.lambda_subscriptions

  function_name                  = local.function_names[each.key]
  role                           = aws_iam_role.consumer[each.key].arn
  package_type                   = var.lambda_consumers[each.key].image_uri == null ? "Zip" : "Image"
  image_uri                      = var.lambda_consumers[each.key].image_uri
  s3_bucket                      = var.lambda_consumers[each.key].s3_bucket
  s3_key                         = var.lambda_consumers[each.key].s3_key
  handler                        = var.lambda_consumers[each.key].image_uri == null ? var.lambda_consumers[each.key].handler : null
  runtime                        = var.lambda_consumers[each.key].image_uri == null ? var.lambda_consumers[each.key].runtime : null
  memory_size                    = var.lambda_consumers[each.key].memory_size
  timeout                        = var.lambda_consumers[each.key].timeout_seconds
  reserved_concurrent_executions = coalesce(var.lambda_consumers[each.key].reserved_concurrency, -1)
  publish                        = true # every apply that changes code or configuration publishes an immutable version
  kms_key_arn                    = local.kms_key_arn
  tags                           = local.common_tags

  environment {
    variables = merge(var.lambda_consumers[each.key].environment, {
      MJ_WQ_SUBSCRIPTION = local.subscription_binding_json[each.key]
      NODE_OPTIONS       = "--enable-source-maps"
    })
  }

  depends_on = [aws_cloudwatch_log_group.consumer, aws_iam_role_policy.consumer]
}

# The event source targets this alias, never $LATEST: a rollback is moving the alias (alias_version), not a redeploy.
resource "aws_lambda_alias" "live" {
  for_each = local.lambda_subscriptions

  name             = "live"
  function_name    = aws_lambda_function.consumer[each.key].function_name
  function_version = coalesce(var.lambda_consumers[each.key].alias_version, aws_lambda_function.consumer[each.key].version)
}

resource "aws_lambda_event_source_mapping" "consumer" {
  for_each = local.lambda_subscriptions

  event_source_arn        = aws_sqs_queue.subscription[each.key].arn
  function_name           = aws_lambda_alias.live[each.key].arn
  batch_size              = local.esm_batch_size[each.key]
  function_response_types = ["ReportBatchItemFailures"]
  # Pausing or disabling a subscription in MJ pauses its Lambda: the manifest carries Status (plan 03 section 10).
  enabled = each.value.status == "Active"

  dynamic "scaling_config" {
    for_each = var.lambda_consumers[each.key].maximum_concurrency == null ? [] : [var.lambda_consumers[each.key].maximum_concurrency]

    content {
      maximum_concurrency = scaling_config.value
    }
  }

  lifecycle {
    precondition {
      condition     = !each.value.is_fifo || local.esm_batch_size[each.key] == 1
      error_message = "Subscription '${each.key}' is on a FIFO queue, so its event source must use batch_size = 1 (plan 03 section 5.1): a larger batch hands the function several messages of one key, and followers released after a head failure burn receives they never used. Scale with maximum_concurrency instead."
    }
  }
}

check "reserved_concurrency_is_discouraged" {
  assert {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.reserved_concurrency == null])
    error_message = "A lambda consumer sets reserved_concurrency. Throttled invocations return their messages to the queue with the receive already counted, which can dead-letter messages that never ran. Throttle with maximum_concurrency (event source scaling) instead."
  }
}

check "external_subscriptions_have_a_consumer" {
  assert {
    condition     = length([for k, s in local.subscriptions : k if s.host_type == "External" && !contains(keys(var.lambda_consumers), k)]) == 0
    error_message = "At least one External subscription has no lambda_consumers entry (see output external_subscriptions_without_lambda). That is fine when its consumer is deployed elsewhere; otherwise its queue will only fill."
  }
}
