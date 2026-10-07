output "binding_import" {
  description = "BindingImport (plan 03 section 10). Save with 'terraform output -json binding_import > bindings.json' and run 'mj queue import-bindings bindings.json'."
  value = {
    ManifestVersion = 1
    Topics = [
      for k, t in local.topics : {
        Name          = k
        BindingConfig = { SnsTopicArn = aws_sns_topic.this[k].arn }
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

output "mjapi_policy_json" {
  description = "IAM policy JSON for the MJAPI role: publish, validation and dead-letter operations."
  value       = data.aws_iam_policy_document.mjapi.json
}

output "mj_worker_policy_json" {
  description = "IAM policy JSON for MJ worker roles consuming MJWorker subscriptions. Null when the manifest has none (IAM rejects statements with no resources)."
  value       = length(local.mj_worker_subscriptions) > 0 ? data.aws_iam_policy_document.mj_worker[0].json : null
}

output "lambda_function_arns" {
  description = "Consumer functions by subscription name."
  value       = { for k, f in aws_lambda_function.consumer : k => f.arn }
}

output "lambda_alias_arns" {
  description = "The 'live' alias each event source invokes, by subscription name."
  value       = { for k, a in aws_lambda_alias.live : k => a.arn }
}

output "kms_key_arn" {
  description = "The key in use: the module-created key, the bring-your-own key, or null."
  value       = local.kms_key_arn
}

output "external_subscriptions_without_lambda" {
  description = "External subscriptions whose consumer is not deployed by this module (review: deployed elsewhere, or missing?)."
  value       = sort([for k, s in local.subscriptions : k if s.host_type == "External" && !contains(keys(var.lambda_consumers), k)])
}
