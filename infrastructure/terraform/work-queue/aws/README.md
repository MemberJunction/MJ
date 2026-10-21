# MJ Work Queue — AWS Terraform module

Creates SNS topics, SQS subscription queues, dead-letter queues, SNS subscriptions, optional Lambda consumers and
CloudWatch alarms from a MemberJunction topology manifest. MJ never creates cloud resources itself; this module is
the only supported way to provision them. The full change process is in [GOVERNANCE.md](GOVERNANCE.md).

## Usage

```hcl
module "work_queue" {
  source         = "../../infrastructure/terraform/work-queue/aws"
  manifest_path  = "${path.module}/manifest.json"   # mj queue export-topology --transport AWS-prod > manifest.json
  name_prefix    = "mj-wq"
  environment    = "prod"
  region         = "us-east-1"
  create_kms_key = true
  alarm_actions  = [aws_sns_topic.ops_alerts.arn]

  lambda_consumers = {
    "email.unsubscribe" = {
      s3_bucket           = "acme-artifacts"
      s3_key              = "work-queue/email-unsubscribe/3f2a9c1d.zip"
      timeout_seconds     = 60
      maximum_concurrency = 50
    }
  }
}
```

After `terraform apply`:

```bash
terraform output -json binding_import > bindings.json
mj queue import-bindings bindings.json
mj queue validate-bindings --transport AWS-prod
```

Attach `mjapi_policy_json` to the MJAPI role and `mj_worker_policy_json` (when not null) to MJ worker roles.

## Encryption

| Setting | Result |
| --- | --- |
| neither | SQS-managed SSE on queues; SNS topics unencrypted |
| `create_kms_key = true` | The module creates a rotating customer managed key whose policy already allows SNS delivery and CloudWatch Logs |
| `kms_key_arn` + `kms_key_policy_confirmed = true` | Your key. **Its policy must contain both statements below**, or SNS accepts publishes and delivers nothing, and log-group creation fails |

```json
{ "Sid": "AllowSnsToDeliverToEncryptedQueues", "Effect": "Allow", "Principal": { "Service": "sns.amazonaws.com" },
  "Action": ["kms:GenerateDataKey*", "kms:Decrypt"], "Resource": "*" }
{ "Sid": "AllowCloudWatchLogsForConsumerLogGroups", "Effect": "Allow", "Principal": { "Service": "logs.<region>.amazonaws.com" },
  "Action": ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"], "Resource": "*",
  "Condition": { "ArnLike": { "kms:EncryptionContext:aws:logs:arn": "arn:aws:logs:<region>:<account>:log-group:/aws/lambda/<name_prefix>-<environment>-*" } } }
```

## Rules the module enforces

| Rule | Where |
| --- | --- |
| A topic with an `Exclusive` subscription is FIFO | `aws_sns_topic.this` precondition |
| `Ordered` subscriptions are refused — Ordered requires the Database transport | `aws_sqs_queue.subscription` precondition |
| No two subscriptions resolve to the same queue name | `terraform_data.name_uniqueness` precondition |
| `lambda_consumers` keys are `External` subscriptions | `terraform_data.lambda_consumer_keys` precondition |
| A bring-your-own KMS key is confirmed to carry the service statements | `terraform_data.kms_key_policy` precondition |
| Redrive after `MaxAttempts + 5` receives (runtime dead-letters at `MaxAttempts`, receive-time guard at `+ 2`) | `aws_sqs_queue.subscription` |
| Raw message delivery, a `MessageAttributes` filter policy rendered by MJ, and an SNS delivery-failure queue | `aws_sns_topic_subscription.this` |
| FIFO event sources use `batch_size = 1`; scale with `maximum_concurrency` (≥ 2), not reserved concurrency | `aws_lambda_event_source_mapping.consumer` precondition; `check` warning |
| The event source invokes the `live` alias and is disabled when the subscription is `Paused`/`Disabled` | `lambda.tf` |
| Lambda visibility timeout ≥ 6 × function timeout | `locals.tf` |
| Queues cannot be destroyed by a plan | `prevent_destroy` on `aws_sqs_queue.subscription` and `.dead_letter` |
| TLS only | `DenyInsecureTransport` on every queue policy |

Resource names follow `AwsResourceName` in `@memberjunction/work-queue-aws`; renaming or removing a subscription would
replace its queues, which `prevent_destroy` blocks — follow GOVERNANCE.md ("Destructive changes").
