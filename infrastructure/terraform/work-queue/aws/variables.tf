variable "manifest_path" {
  description = "Path to the topology manifest written by 'mj queue export-topology' (plan 03 section 10)."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for every resource name. Must match the prefix MJ uses when naming resources."
  type        = string
  default     = "mj-wq"

  validation {
    condition     = can(regex("^[a-z0-9-]{1,20}$", var.name_prefix))
    error_message = "name_prefix must be 1-20 characters of a-z, 0-9 and '-'."
  }
}

variable "environment" {
  description = "Environment name, e.g. dev, staging, prod."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{1,16}$", var.environment))
    error_message = "environment must be 1-16 characters of a-z, 0-9 and '-'."
  }
}

variable "region" {
  description = "AWS region the provider deploys into; written into each subscription binding and the KMS key policy."
  type        = string
}

variable "create_kms_key" {
  description = "Create a customer managed key whose policy already allows SNS delivery and CloudWatch Logs. Mutually exclusive with kms_key_arn."
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  description = "Bring-your-own customer managed key for SNS, SQS, Lambda and log encryption. Null (and create_kms_key = false) uses SQS-managed SSE and no SNS encryption."
  type        = string
  default     = null
}

variable "kms_key_policy_confirmed" {
  description = "Set true only after confirming the bring-your-own key's policy carries the two service statements listed in the module README. Without them SNS accepts publishes and delivers nothing, and log-group creation fails."
  type        = bool
  default     = false
}

variable "lambda_consumers" {
  description = "Lambda consumers keyed by External subscription name. Provide either image_uri or s3_bucket + s3_key."
  type = map(object({
    s3_bucket            = optional(string)
    s3_key               = optional(string)
    image_uri            = optional(string)
    handler              = optional(string, "index.handler")
    runtime              = optional(string, "nodejs22.x")
    memory_size          = optional(number, 512)
    timeout_seconds      = optional(number, 60)
    batch_size           = optional(number) # default: 1 on FIFO queues, 10 on standard queues
    maximum_concurrency  = optional(number) # event-source concurrency: the supported way to throttle
    reserved_concurrency = optional(number) # discouraged: throttled invocations burn receives (see README)
    alias_version        = optional(string) # pin the 'live' alias to an earlier version to roll back
    environment          = optional(map(string), {})
    extra_policy_json    = optional(string)
  }))
  default = {}

  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : (c.image_uri != null) != (c.s3_bucket != null && c.s3_key != null)])
    error_message = "Each lambda consumer needs exactly one artifact: image_uri, or s3_bucket and s3_key."
  }

  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.timeout_seconds >= 1 && c.timeout_seconds <= 900])
    error_message = "timeout_seconds must be between 1 and 900 (the Lambda maximum)."
  }

  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.batch_size == null ? true : (c.batch_size >= 1 && c.batch_size <= 10)])
    error_message = "batch_size must be between 1 and 10 (larger standard-queue batches need a batching window this module does not configure)."
  }

  validation {
    condition     = alltrue([for c in values(var.lambda_consumers) : c.maximum_concurrency == null ? true : c.maximum_concurrency >= 2])
    error_message = "maximum_concurrency must be at least 2 (the event source mapping minimum). Omit it for unbounded scaling."
  }
}

variable "fifo_high_throughput" {
  description = "Use per-message-group deduplication and throughput limits on FIFO queues and topics."
  type        = bool
  default     = true
}

variable "message_retention_seconds" {
  description = "Retention for subscription queues. Dead-letter and delivery-failure queues always keep messages for 14 days."
  type        = number
  default     = 1209600
}

variable "alarm_actions" {
  description = "SNS topic ARNs (or other alarm actions) notified by the module's CloudWatch alarms."
  type        = list(string)
  default     = []
}

variable "oldest_message_age_alarm_seconds" {
  description = "Alarm when a subscription queue's oldest message is older than this."
  type        = number
  default     = 900
}

variable "tags" {
  description = "Tags applied to every taggable resource."
  type        = map(string)
  default     = {}
}
