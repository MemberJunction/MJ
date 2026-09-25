mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }
}

variables {
  manifest_path = "tests/fixtures/manifest.json"
  name_prefix   = "mj-wq"
  environment   = "prod"
  region        = "us-east-1"
  lambda_consumers = {
    "email.archive" = {
      s3_bucket       = "mj-artifacts"
      s3_key          = "work-queue/email-archive/3f2a9c1d.zip"
      timeout_seconds = 60
    }
    "email.subscriber-update" = {
      s3_bucket           = "mj-artifacts"
      s3_key              = "work-queue/email-subscriber-update/7be1d2aa.zip"
      timeout_seconds     = 30
      maximum_concurrency = 50
    }
  }
}

run "names_flags_and_margins" {
  command = plan
  # The fixture leaves email.unsubscribe without a Lambda on purpose (its consumer lives elsewhere).
  expect_failures = [check.external_subscriptions_have_a_consumer]

  assert {
    condition     = aws_sns_topic.this["email.events"].name == "mj-wq-prod-email-events"
    error_message = "Standard topic name does not follow the naming rule."
  }
  assert {
    condition     = aws_sns_topic.this["email.subscriber"].name == "mj-wq-prod-email-subscriber.fifo" && aws_sns_topic.this["email.subscriber"].fifo_topic
    error_message = "FIFO topic name or flag is wrong."
  }
  assert {
    condition     = aws_sqs_queue.subscription["email.unsubscribe"].name == "mj-wq-prod-email-unsubscribe"
    error_message = "Standard queue name does not match AwsResourceName."
  }
  assert {
    condition     = aws_sqs_queue.dead_letter["email.subscriber-update"].name == "mj-wq-prod-email-subscriber-update-dlq.fifo"
    error_message = "FIFO dead-letter queue name does not match AwsResourceName."
  }
  assert {
    condition     = aws_sqs_queue.subscription["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].name == "mj-wq-prod-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ec270642.fifo"
    error_message = "Shortened queue name does not match AwsResourceName."
  }
  assert {
    condition     = local.max_receive_count["email.unsubscribe"] == 10 && local.max_receive_count["email.subscriber-update"] == 8
    error_message = "Redrive must be MaxAttempts + 5 for every queue."
  }
  assert {
    condition     = aws_sqs_queue.subscription["email.archive"].visibility_timeout_seconds == 360 && aws_sqs_queue.subscription["email.dashboard"].visibility_timeout_seconds == 60
    error_message = "Visibility timeout must be 6x the Lambda timeout for Lambda consumers, else max(LeaseSeconds, 30)."
  }
  assert {
    condition     = aws_sns_topic_subscription.this["email.dashboard"].filter_policy == "{\"eventType\":[\"click\",\"open\"]}" && aws_sns_topic_subscription.this["email.dashboard"].filter_policy_scope == "MessageAttributes"
    error_message = "Filter policy must be the manifest's pre-rendered policy with MessageAttributes scope."
  }
  assert {
    condition     = alltrue([for s in aws_sns_topic_subscription.this : s.raw_message_delivery])
    error_message = "Every SNS subscription must use raw message delivery."
  }
  assert {
    condition     = length(aws_sqs_queue.delivery_failure) == 5 && aws_sqs_queue.delivery_failure["email.subscriber-update"].fifo_queue
    error_message = "Every SNS subscription needs a delivery-failure queue of the same type as its topic."
  }
  assert {
    condition     = length(output.binding_import.Topics) == 2 && length(output.binding_import.Subscriptions) == 5 && output.binding_import.ManifestVersion == 1
    error_message = "binding_import must list every topic and subscription."
  }
}

run "lambda_consumers_are_fifo_safe_and_pausable" {
  command = plan
  # The fixture leaves email.unsubscribe without a Lambda on purpose (its consumer lives elsewhere).
  expect_failures = [check.external_subscriptions_have_a_consumer]

  assert {
    condition     = length(aws_lambda_function.consumer) == 2 && alltrue([for f in aws_lambda_function.consumer : f.publish])
    error_message = "Only External subscriptions listed in lambda_consumers get a function, and every function publishes versions."
  }
  assert {
    condition     = aws_lambda_event_source_mapping.consumer["email.subscriber-update"].batch_size == 1 && aws_lambda_event_source_mapping.consumer["email.archive"].batch_size == 10
    error_message = "FIFO event sources default to batch_size 1; standard queues to 10."
  }
  assert {
    condition     = aws_lambda_event_source_mapping.consumer["email.archive"].enabled && !aws_lambda_event_source_mapping.consumer["email.subscriber-update"].enabled
    error_message = "A Paused or Disabled subscription must disable its event source mapping."
  }
  assert {
    condition     = contains(tolist(aws_lambda_event_source_mapping.consumer["email.archive"].function_response_types), "ReportBatchItemFailures")
    error_message = "The event source mapping must report batch item failures."
  }
  assert {
    condition     = aws_lambda_alias.live["email.archive"].name == "live"
    error_message = "Each consumer needs a 'live' alias for the event source and for rollback."
  }
  assert {
    condition     = jsondecode(local.subscriptions["email.archive"].policy_json).SubscriptionName == "email.archive"
    error_message = "MJ_WQ_SUBSCRIPTION must carry the subscription's policy."
  }
}

run "rejects_exclusive_subscription_on_standard_topic" {
  command = plan
  variables {
    manifest_path    = "tests/fixtures/invalid-standard-exclusive.json"
    lambda_consumers = {}
  }
  expect_failures = [aws_sns_topic.this]
}

run "rejects_ordered_subscriptions" {
  command = plan
  variables {
    manifest_path    = "tests/fixtures/invalid-ordered.json"
    lambda_consumers = {}
  }
  expect_failures = [aws_sqs_queue.subscription]
}

run "rejects_colliding_queue_names" {
  command = plan
  variables {
    manifest_path    = "tests/fixtures/invalid-name-collision.json"
    lambda_consumers = {}
  }
  expect_failures = [terraform_data.name_uniqueness]
}

run "rejects_batching_on_a_fifo_event_source" {
  command = plan
  variables {
    lambda_consumers = {
      "email.subscriber-update" = {
        s3_bucket  = "mj-artifacts"
        s3_key     = "work-queue/email-subscriber-update/7be1d2aa.zip"
        batch_size = 10
      }
    }
  }
  expect_failures = [aws_lambda_event_source_mapping.consumer, check.external_subscriptions_have_a_consumer]
}

run "rejects_lambda_consumer_for_mj_worker_subscription" {
  command = plan
  variables {
    lambda_consumers = {
      "email.dashboard" = {
        s3_bucket = "mj-artifacts"
        s3_key    = "work-queue/email-dashboard/1.zip"
      }
    }
  }
  expect_failures = [terraform_data.lambda_consumer_keys, check.external_subscriptions_have_a_consumer]
}

run "rejects_an_unconfirmed_customer_key" {
  command = plan
  variables {
    kms_key_arn = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  }
  expect_failures = [terraform_data.kms_key_policy, check.external_subscriptions_have_a_consumer]
}

run "creates_a_key_with_the_service_statements" {
  command = plan
  # The fixture leaves email.unsubscribe without a Lambda on purpose (its consumer lives elsewhere).
  expect_failures = [check.external_subscriptions_have_a_consumer]
  variables {
    create_kms_key = true
  }
  assert {
    condition     = length(aws_kms_key.this) == 1 && aws_kms_key.this[0].enable_key_rotation
    error_message = "create_kms_key must create one rotating key."
  }
}
