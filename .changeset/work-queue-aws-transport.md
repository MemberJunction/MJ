---
"@memberjunction/work-queue-aws": patch
"@memberjunction/work-queue-core": patch
"@memberjunction/work-queue-engine": patch
"@memberjunction/cli": patch
"@memberjunction/server-bootstrap": patch
---

Add the AWS transport for the durable work queue: `@memberjunction/work-queue-aws` (SNS publish with FIFO-safe batching, an SQS consumer that receives one message per FIFO receive, visibility-timeout leases, a dead-letter writer and best-effort dead-letter operator, binding validation, canonical SNS filter-policy translation, in-memory fakes under `./testing`, and a `./lambda` entry with `CreateSqsLambdaHandler` that never bundles the SNS client), the engine's `@memberjunction/work-queue-engine/aws` subpath (driver factory, MJ credential resolution, manifest filter policies) imported by ServerBootstrap and the four cloud `mj queue` commands, a manifest-driven Terraform module with a destructive-plan gate and governance runbook under `infrastructure/terraform/work-queue/aws`, and an opt-in LocalStack conformance suite. The core conformance kit gains `ConformanceTraits.EnvironmentSkips` for emulator divergences.
