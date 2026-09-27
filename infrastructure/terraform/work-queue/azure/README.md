# MJ Work Queue — Azure Terraform module

Creates a Service Bus namespace (or uses yours), one topic per MJ topic, one subscription with its single SQL rule per
MJ subscription, role assignments for MJAPI, MJ workers and Functions consumers, and Monitor alerts, from a
MemberJunction topology manifest. MJ never creates cloud resources itself; this module is the only supported way to
provision them. The full change process is in [GOVERNANCE.md](GOVERNANCE.md).

## Usage

```hcl
module "work_queue" {
  source              = "../../infrastructure/terraform/work-queue/azure"
  manifest_path       = "${path.module}/manifest.json"   # mj queue export-topology --transport Azure-prod > manifest.json
  name_prefix         = "mj-wq"
  environment         = "prod"
  resource_group_name = "rg-mj-wq-prod"
  location            = "eastus2"                        # or servicebus_namespace_id = <existing namespace>
  mjapi_principal_id  = azurerm_user_assigned_identity.mjapi.principal_id
  mj_worker_principal_ids = [azurerm_user_assigned_identity.worker.principal_id]
  alert_action_group_ids  = [azurerm_monitor_action_group.ops.id]

  function_consumers = {
    "email.unsubscribe" = { principal_id = azurerm_linux_function_app.suppression.identity[0].principal_id }
  }
}
```

After `terraform apply`:

```bash
terraform output -json binding_import > bindings.json
mj queue import-bindings bindings.json
mj queue validate-bindings --transport Azure-prod
```

Set the Azure transport's `Configuration` in MJ to `{ "FullyQualifiedNamespace": "<output fully_qualified_namespace>" }`.
For each Functions consumer, put `output consumer_app_settings[<subscription>]` on the function app:
`MJ_WQ_SUBSCRIPTION` (the frozen policy, filter and entity names) and `SERVICEBUS__fullyQualifiedNamespace` (the
trigger's identity-based connection), and set the trigger's `topicName`, `subscriptionName` and
`isSessionsEnabled` from the same output. **The function app is deployed by your own configuration**, not by this
module: Functions hosting (plan, storage, runtime, deployment slots) varies too much per organisation to fix here.

## Identity

Managed identity everywhere; the namespace this module creates has SAS keys disabled (`local_auth_enabled = false`).

| Principal | Roles |
| --- | --- |
| MJAPI (`mjapi_principal_id`) | Data Sender on every topic; Data Owner on every subscription (replay reads the dead-letter subqueue and re-sends) |
| MJ workers (`mj_worker_principal_ids`) | Data Receiver on MJWorker subscriptions; Data Sender on their topics (retry copies) |
| Functions consumers (`function_consumers[*].principal_id`) | Data Receiver on their subscription; Data Sender on its topic |

Binding validation (`mj queue validate-bindings`) reads entities through the management plane, which the Data Owner
role covers for MJAPI.

## Rules the module enforces

| Rule | Where |
| --- | --- |
| A topic with an `Exclusive` subscription is `IsFifo` (partitioned, `support_ordering`) | `azurerm_servicebus_topic.this` precondition |
| `Ordered` subscriptions are refused — Ordered requires the Database transport | `azurerm_servicebus_subscription.this` precondition |
| `RequiresSession` in the manifest agrees with `PartitionMode` | `azurerm_servicebus_subscription.this` precondition |
| `LeaseSeconds ≤ 300` (the Service Bus lock maximum) | `azurerm_servicebus_subscription.this` precondition |
| No two topics, or two subscriptions of one topic, resolve to the same entity name | `terraform_data.name_uniqueness` precondition |
| `function_consumers` keys are `External` subscriptions | `terraform_data.function_consumer_keys` precondition |
| `maxDeliveryCount = MaxAttempts + 5` (runtime dead-letters at `MaxAttempts`, receive-time guard at `+ 2`) | `azurerm_servicebus_subscription.this` |
| Exactly one rule per subscription: MJ's targeting clause + filter, written as `$Default` | `azurerm_servicebus_subscription_rule.this` (precondition requires `DriverArtifacts.ServiceBusRuleSql`) |
| A `Paused`/`Disabled` subscription has receiving disabled (`status = ReceiveDisabled`) | `subscriptions.tf` |
| Duplicate detection on `MessageId` (silent; the MJ ledger reports `Duplicate`) | `azurerm_servicebus_topic.this` |
| Namespace, topics and subscriptions cannot be destroyed by a plan | `prevent_destroy` |

Entity names follow `AzureEntityName` in `@memberjunction/work-queue-azure`; renaming or removing a subscription would
replace it, which `prevent_destroy` blocks — follow GOVERNANCE.md ("Destructive changes"). `requires_session` and
duplicate detection are immutable after creation: changing `PartitionMode` between `None` and `Exclusive` is a
replacement (drain first).

## Alerts

Service Bus namespace metrics carry the topic in the `EntityName` dimension and not the subscription, so the
dead-letter and backlog alerts are **per topic**; `mj queue stats` and `mj queue dead-letters --subscription <name>`
narrow to the subscription.
