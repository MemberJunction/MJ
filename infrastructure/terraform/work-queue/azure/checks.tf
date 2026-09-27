check "external_subscriptions_have_a_consumer" {
  assert {
    condition     = length([for k, s in local.subscriptions : k if s.host_type == "External" && !contains(keys(var.function_consumers), k)]) == 0
    error_message = "At least one External subscription has no function_consumers entry (see output external_subscriptions_without_consumer). That is fine when its consumer is deployed elsewhere; otherwise its subscription will only fill."
  }
}
