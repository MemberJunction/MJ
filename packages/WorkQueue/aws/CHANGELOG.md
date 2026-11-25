# @memberjunction/work-queue-aws

## 6.3.0-edge.2

### Patch Changes

- @memberjunction/work-queue-core@6.3.0-edge.2

## 6.3.0-edge.1

### Minor Changes

- 13a71da: Actions, scheduling, notifications and work-queue fixes (minor because HubSpot and LearnWorlds actions gain a `CompanyIntegrationID` param in metadata).
  - Business Central posts to the connection's `ExternalSystemID` only, reads its Credential through `CredentialEngine`, and takes `AuthorityHost` from the Credential within an Entra ID allow list. A connection that kept its company only on the Credential must now set `ExternalSystemID`. QuickBooks `GetGLEntries` filters by `DocumentNumber`.
  - Dropbox `ListObjects` returns every page and `SearchFiles` pages with a real cursor (`FileSearchOptions.pageToken`); Apollo retries a 429 with `Retry-After` up to 120 s.
  - MS Graph `ForwardMessage` reads the mailbox from `ContextData.Email`; received messages carry `Direction` and `BCCRecipients`.
  - Notification email/SMS go through `NOTIFICATION_EMAIL_PROVIDER` / `NOTIFICATION_SMS_PROVIDER` or `notifications.emailProvider` / `smsProvider` in `mj.config.cjs`; malformed `SecondaryScopes` rows are skipped and refused at save; uncached recipients get their roles read.
  - Engine-made action outcomes record `INPUT_VALIDATION_FAILED`, `PREVENTED_BY_FILTER`, `TIMEOUT` or `ABORTED`; Twitter delete checks ownership; Twitter and Instagram schedule actions return `NOT_SUPPORTED`; CRM, FormBuilders and LMS resolve their connection through `ResolveCompanyIntegration`.
  - The scheduler reloads jobs written without a cache event; scheduled actions receive `Context.ScheduledJobRunID` and `Context.Heartbeat`; Feature Pipelines refuse lookup settings on a non-FK target. The Record Set Processing guide now uses the PascalCase option names (`Source`, `Processor`, `ContextUser`, `BatchSize`, `MaxConcurrency`, `TriggeredBy`, `DryRun`, `Scope`).
  - `mj queue work` mints a provider per delivery above `--concurrency 1` and sweeps/reconciles when long-running; new `mj queue sweep`; SQS dead-letter copies carry `mj_source_message_id`.
  - Workflow breakpoints can be remembered per user and workflow: steps carry a stable `Configuration.stepId`, `taskGraphDebug.breakpointStepIDs` seeds them on a Debug run, and the debugger's step menu offers Remember / Stop Remembering where the host stores them (the AI test harness does).

### Patch Changes

- @memberjunction/work-queue-core@6.3.0-edge.1

## 6.3.0-edge.0

### Patch Changes

- @memberjunction/work-queue-core@6.3.0-edge.0

## 6.2.0

### Minor Changes

- 49e0bd8: Add the MemberJunction Durable Work Queue and Messaging Framework:
  - **Core & Data Layer**: Transport-neutral queue contracts, database schema and entities for transports, topics, subscriptions, messages, deliveries, and deduplication ledger, backed by guarded-write stored procedures (`spWorkQueue*`) with SQL Server and PostgreSQL support.
  - **Transports**: Native Database transport driver, consumer, and operator; AWS transport (`@memberjunction/work-queue-aws` with SNS topic publishing, SQS FIFO consumer, visibility-timeout leases, dead-letter redrive, binding validation, and LocalStack conformance); and in-memory reference transport.
  - **Runtime & Host**: Competing-consumer `WorkQueueHost` (supporting continuous daemon and one-shot `RunOnce` container modes), `WorkQueueSweeper` (handling lease expiry and retention purging under a distributed sweep lock), REST publish endpoint (`POST /work-queue/topics/{topic}/messages` with API-key and scope authorization), and seven Remote Operations for operator control (`WorkQueue.GetSubscriptionStats`, `ReplayDeadLetter`, `DiscardDelivery`, `ValidateBindings`, etc.).
  - **Operator Surface**: Explorer `WorkQueueDashboard` with Overview, Dead Letters (envelope/payload inspection and replay/discard), Partitions (blocked, in-flight, and idle keys), and Bindings validation tabs, plus a new "Work Queue" application record.
  - **Tooling & Samples**: `mj queue` CLI commands (stats, dead-letters, partitions, replay, discard, backlog, work, export-topology, import-bindings, validate-bindings) and `@memberjunction/work-queue-samples` (`HelloWorldHandler` with sample topologies).

### Patch Changes

- Updated dependencies [f65fec7]
- Updated dependencies [49e0bd8]
  - @memberjunction/work-queue-core@6.2.0

## 6.2.0-edge.8

### Patch Changes

- @memberjunction/work-queue-core@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- Updated dependencies [f65fec7]
  - @memberjunction/work-queue-core@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- @memberjunction/work-queue-core@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- @memberjunction/work-queue-core@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- @memberjunction/work-queue-core@6.2.0-edge.4

## 6.2.0-edge.3

### Minor Changes

- 49e0bd8: Add the MemberJunction Durable Work Queue and Messaging Framework:
  - **Core & Data Layer**: Transport-neutral queue contracts, database schema and entities for transports, topics, subscriptions, messages, deliveries, and deduplication ledger, backed by guarded-write stored procedures (`spWorkQueue*`) with SQL Server and PostgreSQL support.
  - **Transports**: Native Database transport driver, consumer, and operator; AWS transport (`@memberjunction/work-queue-aws` with SNS topic publishing, SQS FIFO consumer, visibility-timeout leases, dead-letter redrive, binding validation, and LocalStack conformance); and in-memory reference transport.
  - **Runtime & Host**: Competing-consumer `WorkQueueHost` (supporting continuous daemon and one-shot `RunOnce` container modes), `WorkQueueSweeper` (handling lease expiry and retention purging under a distributed sweep lock), REST publish endpoint (`POST /work-queue/topics/{topic}/messages` with API-key and scope authorization), and seven Remote Operations for operator control (`WorkQueue.GetSubscriptionStats`, `ReplayDeadLetter`, `DiscardDelivery`, `ValidateBindings`, etc.).
  - **Operator Surface**: Explorer `WorkQueueDashboard` with Overview, Dead Letters (envelope/payload inspection and replay/discard), Partitions (blocked, in-flight, and idle keys), and Bindings validation tabs, plus a new "Work Queue" application record.
  - **Tooling & Samples**: `mj queue` CLI commands (stats, dead-letters, partitions, replay, discard, backlog, work, export-topology, import-bindings, validate-bindings) and `@memberjunction/work-queue-samples` (`HelloWorldHandler` with sample topologies).

### Patch Changes

- Updated dependencies [49e0bd8]
  - @memberjunction/work-queue-core@6.2.0-edge.3
