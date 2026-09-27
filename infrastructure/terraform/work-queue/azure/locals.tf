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
        name             = s.Name
        topic            = t.Name
        is_fifo          = t.IsFifo
        host_type        = s.HostType
        status           = try(s.Status, "Active")
        partition_mode   = s.Policy.PartitionMode
        max_attempts     = s.Policy.MaxAttempts
        lease_seconds    = s.Policy.LeaseSeconds
        policy_json      = jsonencode(s.Policy)
        filter_json      = s.Filter == null ? null : jsonencode(s.Filter)
        rule_sql         = try(s.DriverArtifacts.ServiceBusRuleSql, null)
        requires_session = try(s.DriverArtifacts.RequiresSession, s.Policy.PartitionMode == "Exclusive")
        slug             = trim(replace(replace(lower(s.Name), "/[^a-z0-9_-]/", "-"), "/-+/", "-"), "-")
      }
    }
  ]...)

  # Naming mirrors AzureEntityName in @memberjunction/work-queue-azure: topics carry the prefix (≤ 260 chars);
  # subscriptions are the bare slug (≤ 50 chars), shortened with '-' + the first 8 hex chars of SHA-1(logicalName).
  topic_names = {
    for k, t in local.topics : k => (
      length("${local.base}-${t.slug}") <= 260
      ? "${local.base}-${t.slug}"
      : "${substr("${local.base}-${t.slug}", 0, 260 - 9)}-${substr(sha1(t.name), 0, 8)}"
    )
  }
  subscription_names = {
    for k, s in local.subscriptions : k => (
      length(s.slug) <= 50 ? s.slug : "${substr(s.slug, 0, 50 - 9)}-${substr(sha1(s.name), 0, 8)}"
    )
  }

  # Distinct MJ names can slug to one entity name ('a.b' and 'a-b'); Service Bus would then hold one entity for two.
  subscription_name_keys = [for k, s in local.subscriptions : "${s.topic}|${local.subscription_names[k]}"]
  all_topic_names        = values(local.topic_names)

  function_subscriptions  = { for k, s in local.subscriptions : k => s if s.host_type == "External" && contains(keys(var.function_consumers), k) }
  mj_worker_subscriptions = { for k, s in local.subscriptions : k => s if s.host_type == "MJWorker" }

  # 03 section 5.1: the runtime dead-letters at MaxAttempts, the consumer's receive-time guard at MaxAttempts + 2, and
  # the subscription's MaxDeliveryCount is the crash-loop backstop behind both (ExpectedMaxDeliveryCount).
  max_delivery_count = { for k, s in local.subscriptions : k => s.max_attempts + 5 }
  # Service Bus caps a lock at five minutes; the driver's binding validation reports a LeaseSeconds above it as an Error.
  lock_duration = { for k, s in local.subscriptions : k => "PT${min(300, max(5, s.lease_seconds))}S" }

  namespace_id   = var.servicebus_namespace_id != null ? var.servicebus_namespace_id : azurerm_servicebus_namespace.this[0].id
  namespace_name = var.servicebus_namespace_id != null ? element(split("/", var.servicebus_namespace_id), length(split("/", var.servicebus_namespace_id)) - 1) : local.base
  common_tags    = merge(var.tags, { "mj-work-queue-environment" = var.environment })
}

resource "terraform_data" "name_uniqueness" {
  input = length(local.subscription_name_keys)

  lifecycle {
    precondition {
      condition     = length(distinct(local.subscription_name_keys)) == length(local.subscription_name_keys) && length(distinct(local.all_topic_names)) == length(local.all_topic_names)
      error_message = "Two topics or two subscriptions of one topic resolve to the same Service Bus entity name (names differing only in '.', '-' or case). Rename one in MJ."
    }
  }
}

resource "terraform_data" "function_consumer_keys" {
  input = sort(keys(var.function_consumers))

  lifecycle {
    precondition {
      condition = alltrue([
        for k in keys(var.function_consumers) : contains(keys(local.subscriptions), k) && try(local.subscriptions[k].host_type, "") == "External"
      ])
      error_message = "Every function_consumers key must name a subscription in the manifest with HostType External."
    }
  }
}

resource "terraform_data" "namespace_inputs" {
  input = var.servicebus_namespace_id

  lifecycle {
    precondition {
      condition     = var.servicebus_namespace_id != null || var.location != null
      error_message = "Set location to create a namespace, or servicebus_namespace_id to use an existing one."
    }
  }
}
