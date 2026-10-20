locals {
  manifest = jsondecode(file(var.manifest_path))
  base     = "${var.name_prefix}-${var.environment}"

  topics = {
    for t in local.manifest.Topics : t.Name => {
      name    = t.Name
      is_fifo = t.IsFifo
      slug    = trim(replace(replace(lower(t.Name), "/[^a-z0-9_-]/", "-"), "/-+/", "-"), "-")
    }
  }

  # Every value is a scalar or a JSON string so the map has one element type.
  subscriptions = merge([
    for t in local.manifest.Topics : {
      for s in t.Subscriptions : s.Name => {
        name              = s.Name
        topic             = t.Name
        is_fifo           = t.IsFifo
        host_type         = s.HostType
        status            = try(s.Status, "Active")
        partition_mode    = s.Policy.PartitionMode
        max_attempts      = s.Policy.MaxAttempts
        lease_seconds     = s.Policy.LeaseSeconds
        policy_json       = jsonencode(s.Policy)
        filter_json       = s.Filter == null ? null : jsonencode(s.Filter)
        sns_filter_policy = try(s.DriverArtifacts.SnsFilterPolicy, null)
        slug              = trim(replace(replace(lower(s.Name), "/[^a-z0-9_-]/", "-"), "/-+/", "-"), "-")
      }
    }
  ]...)

  # Naming mirrors AwsResourceName in @memberjunction/work-queue-aws (plan 07 Task 1).
  topic_fifo_suffix = { for k, t in local.topics : k => t.is_fifo ? ".fifo" : "" }
  topic_names = {
    for k, t in local.topics : k => (
      length("${local.base}-${t.slug}${local.topic_fifo_suffix[k]}") <= 256
      ? "${local.base}-${t.slug}${local.topic_fifo_suffix[k]}"
      : "${substr("${local.base}-${t.slug}", 0, 256 - length(local.topic_fifo_suffix[k]) - 9)}-${substr(sha1(t.name), 0, 8)}${local.topic_fifo_suffix[k]}"
    )
  }

  fifo_suffix = { for k, s in local.subscriptions : k => s.is_fifo ? ".fifo" : "" }
  queue_names = {
    for k, s in local.subscriptions : k => (
      length("${local.base}-${s.slug}${local.fifo_suffix[k]}") <= 80
      ? "${local.base}-${s.slug}${local.fifo_suffix[k]}"
      : "${substr("${local.base}-${s.slug}", 0, 80 - length(local.fifo_suffix[k]) - 9)}-${substr(sha1(s.name), 0, 8)}${local.fifo_suffix[k]}"
    )
  }
  dead_letter_queue_names = {
    for k, s in local.subscriptions : k => (
      length("${local.base}-${s.slug}-dlq${local.fifo_suffix[k]}") <= 80
      ? "${local.base}-${s.slug}-dlq${local.fifo_suffix[k]}"
      : "${substr("${local.base}-${s.slug}", 0, 80 - 4 - length(local.fifo_suffix[k]) - 9)}-${substr(sha1(s.name), 0, 8)}-dlq${local.fifo_suffix[k]}"
    )
  }
  # SNS -> SQS delivery failures (not an MJ dead-letter queue; MJ never reads it).
  delivery_failure_queue_names = {
    for k, s in local.subscriptions : k => (
      length("${local.base}-${s.slug}-snsdlq${local.fifo_suffix[k]}") <= 80
      ? "${local.base}-${s.slug}-snsdlq${local.fifo_suffix[k]}"
      : "${substr("${local.base}-${s.slug}", 0, 80 - 7 - length(local.fifo_suffix[k]) - 9)}-${substr(sha1(s.name), 0, 8)}-snsdlq${local.fifo_suffix[k]}"
    )
  }

  # Distinct names can slug to one queue name ('a.b' and 'a-b', or 'x-dlq' and the DLQ of 'x'). SQS CreateQueue with
  # identical attributes returns the existing queue, so two Terraform resources would silently own one queue.
  all_queue_names = concat(values(local.queue_names), values(local.dead_letter_queue_names), values(local.delivery_failure_queue_names))

  lambda_subscriptions = {
    for k, s in local.subscriptions : k => s if s.host_type == "External" && contains(keys(var.lambda_consumers), k)
  }
  mj_worker_subscriptions = { for k, s in local.subscriptions : k => s if s.host_type == "MJWorker" }

  # 03 section 5.1 (F5): the runtime dead-letters at MaxAttempts, the consumer's receive-time guard at MaxAttempts + 2,
  # and this redrive policy is the crash-loop backstop behind both. Same value as ExpectedMaxReceiveCount (Task 4).
  max_receive_count = { for k, s in local.subscriptions : k => s.max_attempts + 5 }
  visibility_timeout_seconds = {
    for k, s in local.subscriptions : k => min(43200, (
      contains(keys(local.lambda_subscriptions), k)
      ? max(s.lease_seconds, 6 * var.lambda_consumers[k].timeout_seconds)
      : max(s.lease_seconds, 30)
    ))
  }
  # One message per invocation on FIFO queues: a larger batch hands the function several messages of one key, and
  # every follower released after a head failure burns a receive it never used.
  esm_batch_size = {
    for k, s in local.lambda_subscriptions : k => coalesce(var.lambda_consumers[k].batch_size, s.is_fifo ? 1 : 10)
  }

  kms_key_arn = var.create_kms_key ? aws_kms_key.this[0].arn : var.kms_key_arn
  common_tags = merge(var.tags, { "mj-work-queue-environment" = var.environment })
}

resource "terraform_data" "name_uniqueness" {
  input = length(local.all_queue_names)

  lifecycle {
    precondition {
      condition     = length(distinct(local.all_queue_names)) == length(local.all_queue_names)
      error_message = "Two subscriptions resolve to the same SQS queue name (names differing only in '.', '-' or case, or a name ending in '-dlq'/'-snsdlq' that shadows another subscription's queue). Rename one subscription in MJ."
    }
  }
}
