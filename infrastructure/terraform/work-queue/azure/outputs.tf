output "binding_import" {
  description = "BindingImport (plan 03 section 10). Save with 'terraform output -json binding_import > bindings.json' and run 'mj queue import-bindings bindings.json'."
  value = {
    ManifestVersion = 1
    Topics = [
      for k, t in local.topics : {
        Name          = k
        BindingConfig = { TopicName = azurerm_servicebus_topic.this[k].name }
      }
    ]
    Subscriptions = [
      for k, s in local.subscriptions : {
        Name          = k
        BindingConfig = local.subscription_config[k]
      }
    ]
  }
}

output "namespace_id" {
  description = "The Service Bus namespace in use (created or bring-your-own)."
  value       = local.namespace_id
}

output "fully_qualified_namespace" {
  description = "Value for the Azure transport's Configuration in MJ: { \"FullyQualifiedNamespace\": ... }."
  value       = "${local.namespace_name}.servicebus.windows.net"
}

output "consumer_app_settings" {
  description = "Per Functions consumer (by subscription name), the app settings to put on the function app: MJ_WQ_SUBSCRIPTION and the namespace for the trigger's connection."
  value = {
    for k, s in local.function_subscriptions : k => {
      MJ_WQ_SUBSCRIPTION                  = local.subscription_binding_json[k]
      SERVICEBUS__fullyQualifiedNamespace = "${local.namespace_name}.servicebus.windows.net"
      TopicName                           = local.topic_names[s.topic]
      SubscriptionName                    = local.subscription_names[k]
      IsSessionsEnabled                   = s.requires_session
    }
  }
}

output "external_subscriptions_without_consumer" {
  description = "External subscriptions with no function_consumers entry (review: deployed elsewhere, or missing?)."
  value       = sort([for k, s in local.subscriptions : k if s.host_type == "External" && !contains(keys(var.function_consumers), k)])
}
