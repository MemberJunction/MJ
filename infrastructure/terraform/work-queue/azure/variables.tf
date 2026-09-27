variable "manifest_path" {
  description = "Path to the topology manifest written by 'mj queue export-topology' (plan 03 section 10) for an Azure transport."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for every topic name. Must match the prefix MJ uses when naming entities (AzureEntityName)."
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

variable "resource_group_name" {
  description = "Resource group that holds the namespace (existing or created here)."
  type        = string
}

variable "location" {
  description = "Azure region for a namespace created by this module, e.g. eastus2. Ignored when servicebus_namespace_id is set."
  type        = string
  default     = null
}

variable "servicebus_namespace_id" {
  description = "Bring-your-own Service Bus namespace (resource ID). Null creates one named '<name_prefix>-<environment>' in the resource group."
  type        = string
  default     = null
}

variable "namespace_sku" {
  description = "SKU of a namespace created by this module. Standard suffices; Premium gives larger messages and predictable latency."
  type        = string
  default     = "Standard"

  validation {
    condition     = contains(["Standard", "Premium"], var.namespace_sku)
    error_message = "namespace_sku must be Standard or Premium (Basic has no topics)."
  }
}

variable "namespace_capacity" {
  description = "Messaging units for a Premium namespace created by this module (1, 2, 4, 8, 16). Ignored for Standard."
  type        = number
  default     = 1
}

variable "mjapi_principal_id" {
  description = "Object ID of the MJAPI identity (managed identity or service principal): Data Sender on every topic, Data Owner on every subscription (replay reads the dead-letter subqueue and re-sends). Null skips the assignment."
  type        = string
  default     = null
}

variable "mj_worker_principal_ids" {
  description = "Object IDs of MJ worker identities: Data Receiver on MJWorker subscriptions and Data Sender on their topics (retry copies)."
  type        = list(string)
  default     = []
}

variable "function_consumers" {
  description = "Azure Functions consumers keyed by External subscription name. The module renders each function's MJ_WQ_SUBSCRIPTION app setting (output consumer_app_settings) and, when principal_id is set, assigns Data Receiver on the subscription and Data Sender on the topic. The function app itself is deployed by your own configuration."
  type = map(object({
    principal_id = optional(string)
  }))
  default = {}
}

variable "message_retention" {
  description = "Default time-to-live of messages on subscription queues (ISO-8601 duration)."
  type        = string
  default     = "P14D"
}

variable "duplicate_detection_window" {
  description = "Topic duplicate-detection window on MessageId (ISO-8601 duration). Set at topic creation only."
  type        = string
  default     = "PT10M"
}

variable "alert_action_group_ids" {
  description = "Monitor action group IDs notified by the module's metric alerts."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to every taggable resource."
  type        = map(string)
  default     = {}
}
