data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

resource "terraform_data" "kms_key_policy" {
  input = var.kms_key_arn

  lifecycle {
    precondition {
      condition     = !(var.create_kms_key && var.kms_key_arn != null)
      error_message = "Set create_kms_key or kms_key_arn, not both."
    }
    precondition {
      condition     = var.kms_key_arn == null || var.kms_key_policy_confirmed
      error_message = "kms_key_arn is set but kms_key_policy_confirmed is false. The key policy must allow (1) sns.amazonaws.com: kms:GenerateDataKey* and kms:Decrypt, or SNS accepts publishes and delivers nothing to the encrypted queues; and (2) logs.${var.region}.amazonaws.com: kms:Encrypt*, kms:Decrypt*, kms:ReEncrypt*, kms:GenerateDataKey*, kms:Describe* for the /aws/lambda/${var.name_prefix}-${var.environment}-* log groups, or log-group creation fails. Add them (see the module README), then set kms_key_policy_confirmed = true — or use create_kms_key = true."
    }
  }
}

data "aws_iam_policy_document" "kms" {
  count = var.create_kms_key ? 1 : 0

  statement {
    sid       = "AccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "AllowSnsToDeliverToEncryptedQueues"
    actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
  }

  statement {
    sid       = "AllowCloudWatchLogsForConsumerLogGroups"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${data.aws_partition.current.partition}:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.base}-*"]
    }
  }
}

resource "aws_kms_key" "this" {
  count = var.create_kms_key ? 1 : 0

  description         = "MJ work queue ${local.base}: SNS topics, SQS queues, consumer functions and log groups"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.kms[0].json
  tags                = local.common_tags
}

resource "aws_kms_alias" "this" {
  count = var.create_kms_key ? 1 : 0

  name          = "alias/${local.base}-work-queue"
  target_key_id = aws_kms_key.this[0].key_id
}
