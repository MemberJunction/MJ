---
"@memberjunction/work-queue-azure": patch
"@memberjunction/work-queue-engine": patch
"@memberjunction/cli": patch
"@memberjunction/server-bootstrap": patch
---

Add the Azure transport for the durable work queue: `@memberjunction/work-queue-azure` (Service Bus topics and subscriptions with sessions for `Exclusive`, peek-lock leases, retry with backoff via scheduled targeted copies, the subscription's dead-letter subqueue with non-destructive listing and replay, SQL-rule filter translation behind a targeting clause, binding validation, an in-memory `FakeServiceBus` that passes core's conformance suite under `./testing`, and a `./functions` entry with `CreateServiceBusFunctionHandler` for Service Bus-triggered Azure Functions), the engine's `@memberjunction/work-queue-engine/azure` subpath (driver factory, MJ credential resolution to a service principal, manifest enricher rendering `ServiceBusRuleSql` and `RequiresSession`) imported by ServerBootstrap and the four cloud `mj queue` commands, a manifest-driven Terraform module under `infrastructure/terraform/work-queue/azure`, and an opt-in real-namespace conformance run.
