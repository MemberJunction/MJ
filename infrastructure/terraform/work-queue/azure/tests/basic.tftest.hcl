mock_provider "azurerm" {}

variables {
  manifest_path           = "tests/fixtures/manifest.json"
  name_prefix             = "mj-wq"
  environment             = "prod"
  resource_group_name     = "rg-mj-wq-prod"
  location                = "eastus2"
  mjapi_principal_id      = "11111111-1111-1111-1111-111111111111"
  mj_worker_principal_ids = ["22222222-2222-2222-2222-222222222222"]
  function_consumers = {
    "email.archive" = { principal_id = "33333333-3333-3333-3333-333333333333" }
  }
}

run "names_flags_and_margins" {
  command = plan
  # The fixture leaves email.unsubscribe and email.subscriber-update without a function on purpose.
  expect_failures = [check.external_subscriptions_have_a_consumer]

  assert {
    condition     = azurerm_servicebus_topic.this["email.events"].name == "mj-wq-prod-email-events" && !azurerm_servicebus_topic.this["email.events"].support_ordering
    error_message = "Standard topic name or ordering flag is wrong."
  }
  assert {
    condition     = azurerm_servicebus_topic.this["email.subscriber"].support_ordering && azurerm_servicebus_topic.this["email.subscriber"].requires_duplicate_detection
    error_message = "Partitioned topics must support ordering and detect duplicates."
  }
  assert {
    condition     = azurerm_servicebus_subscription.this["email.unsubscribe"].name == "email-unsubscribe"
    error_message = "Subscription name does not match AzureEntityName."
  }
  assert {
    condition     = azurerm_servicebus_subscription.this["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].name == "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ec270642"
    error_message = "Shortened subscription name does not match AzureEntityName."
  }
  assert {
    condition     = azurerm_servicebus_subscription.this["email.subscriber-update"].requires_session && !azurerm_servicebus_subscription.this["email.archive"].requires_session
    error_message = "Exclusive subscriptions require sessions; None subscriptions must not."
  }
  assert {
    condition     = azurerm_servicebus_subscription.this["email.subscriber-update"].max_delivery_count == 8 && azurerm_servicebus_subscription.this["email.archive"].max_delivery_count == 10
    error_message = "MaxDeliveryCount must be MaxAttempts + 5."
  }
  assert {
    condition     = azurerm_servicebus_subscription.this["email.archive"].lock_duration == "PT60S"
    error_message = "Lock duration must follow LeaseSeconds."
  }
  assert {
    condition     = azurerm_servicebus_subscription.this["email.subscriber-update"].status == "ReceiveDisabled" && azurerm_servicebus_subscription.this["email.archive"].status == "Active"
    error_message = "A Paused subscription must have receiving disabled."
  }
  assert {
    condition     = azurerm_servicebus_subscription_rule.this["email.dashboard"].sql_filter == "(NOT EXISTS(mj_target) OR mj_target = 'email.dashboard') AND (eventType IN ('click', 'open'))" && azurerm_servicebus_subscription_rule.this["email.dashboard"].name == "$Default"
    error_message = "The rule must be the manifest's pre-rendered SQL, replacing $Default."
  }
  assert {
    condition     = length(output.binding_import.Topics) == 2 && length(output.binding_import.Subscriptions) == 5 && output.binding_import.ManifestVersion == 1
    error_message = "binding_import must list every topic and subscription."
  }
  assert {
    condition     = output.binding_import.Subscriptions[0].BindingConfig.FullyQualifiedNamespace == "mj-wq-prod.servicebus.windows.net"
    error_message = "Bindings must carry the namespace of the created namespace."
  }
}

run "roles_and_consumers" {
  command         = plan
  expect_failures = [check.external_subscriptions_have_a_consumer]

  assert {
    condition     = length(azurerm_role_assignment.mjapi_topic_sender) == 2 && length(azurerm_role_assignment.mjapi_subscription_owner) == 5
    error_message = "MJAPI needs Data Sender on every topic and Data Owner on every subscription."
  }
  assert {
    condition     = length(azurerm_role_assignment.worker_receiver) == 2 && length(azurerm_role_assignment.worker_sender) == 2
    error_message = "Workers need Data Receiver on MJWorker subscriptions and Data Sender on their topics."
  }
  assert {
    condition     = length(azurerm_role_assignment.function_receiver) == 1 && length(azurerm_role_assignment.function_sender) == 1
    error_message = "A function consumer with a principal gets its own receiver and sender assignments."
  }
  assert {
    condition     = jsondecode(output.consumer_app_settings["email.archive"].MJ_WQ_SUBSCRIPTION).Policy.SubscriptionName == "email.archive" && !output.consumer_app_settings["email.archive"].IsSessionsEnabled
    error_message = "MJ_WQ_SUBSCRIPTION must carry the subscription's policy."
  }
  assert {
    condition     = output.external_subscriptions_without_consumer == tolist(["email.subscriber-update", "email.unsubscribe"])
    error_message = "External subscriptions without a consumer must be listed."
  }
}

run "uses_an_existing_namespace" {
  command         = plan
  expect_failures = [check.external_subscriptions_have_a_consumer]
  variables {
    servicebus_namespace_id = "/subscriptions/0000/resourceGroups/rg-shared/providers/Microsoft.ServiceBus/namespaces/shared-bus"
    location                = null
  }

  assert {
    condition     = length(azurerm_servicebus_namespace.this) == 0 && output.fully_qualified_namespace == "shared-bus.servicebus.windows.net"
    error_message = "A bring-your-own namespace must not be created and must name the bindings."
  }
}

run "rejects_exclusive_subscription_on_standard_topic" {
  command = plan
  variables {
    manifest_path      = "tests/fixtures/invalid-standard-exclusive.json"
    function_consumers = {}
  }
  expect_failures = [azurerm_servicebus_topic.this]
}

run "rejects_ordered_subscriptions" {
  command = plan
  variables {
    manifest_path      = "tests/fixtures/invalid-ordered.json"
    function_consumers = {}
  }
  expect_failures = [azurerm_servicebus_subscription.this]
}

run "rejects_a_lease_above_the_lock_maximum" {
  command = plan
  variables {
    manifest_path      = "tests/fixtures/invalid-long-lease.json"
    function_consumers = {}
  }
  expect_failures = [azurerm_servicebus_subscription.this]
}

run "rejects_colliding_entity_names" {
  command = plan
  variables {
    manifest_path      = "tests/fixtures/invalid-name-collision.json"
    function_consumers = {}
  }
  expect_failures = [terraform_data.name_uniqueness]
}

run "rejects_a_consumer_for_an_mj_worker_subscription" {
  command = plan
  variables {
    function_consumers = {
      "email.dashboard" = { principal_id = null }
    }
  }
  expect_failures = [terraform_data.function_consumer_keys, check.external_subscriptions_have_a_consumer]
}
