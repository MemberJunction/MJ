# @memberjunction/work-queue-azure

Azure Service Bus transport for the MemberJunction work queue: Service Bus topics, per-subscription queues with built-in `$DeadLetterQueue` subqueues, session-backed `Exclusive` partition isolation, and an Azure Functions adapter for thin serverless workers. **No MemberJunction runtime dependencies** — only `@memberjunction/work-queue-core`, `@azure/service-bus`, and `@azure/identity`.

MJ servers load this package through the engine's **`@memberjunction/work-queue-engine/azure`** subpath (`AzureTransportDriverFactory`), which `ServerBootstrap` and the `mj queue` CLI commands import — the engine's main entry, `ServerBootstrapLite`, CodeGen, and data providers never load Azure Service Bus clients.

**What runs here:** `None` and `Exclusive` subscriptions. **`Ordered` requires the Database transport** — validation rejects it on an Azure topic. `Exclusive` uses Service Bus sessions (`RequiresSession = true`, mapped from `PartitionKey` -> `SessionId`), guaranteeing one in-flight message per key at a time while keeping different keys concurrent.

## Entry points

| Import | Use |
| --- | --- |
| `@memberjunction/work-queue-azure` | `AzureTransportDriver`, `ServiceBusTransportConsumer`, `ServiceBusMessagePump`, `AzureTransportOperator`, SQL filter translation, binding validation |
| `@memberjunction/work-queue-azure/functions` | `CreateServiceBusFunctionHandler` for single and batch Azure Functions Service Bus trigger consumers. Never imports `ServiceBusAdministrationClient` |
| `@memberjunction/work-queue-azure/testing` | In-memory `FakeServiceBusGateway`, `AzureConformanceHarness`, and fixtures for deterministic tests |

## Write an Azure Functions consumer

```typescript
import { Outcome, type WorkContext, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateServiceBusFunctionHandler } from '@memberjunction/work-queue-azure/functions';

class ArchiveEmailEvent implements WorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        await writeToArchive(message.MessageID, message.Payload, context.Signal);
        return Outcome.Complete();
    }
}

export const handler = CreateServiceBusFunctionHandler(() => new ArchiveEmailEvent());
```

- Set `MJ_WQ_SUBSCRIPTION` (the JSON `SubscriptionBinding` policy, filter, and Service Bus topic/subscription config) in the Function App configuration.
- Supports both single-message triggers (`serviceBusTopic` with `cardinality: 'one'`) and batch triggers (`cardinality: 'many'`, returning `{ batchItemFailures }` for partial-batch retries).
- Return `Outcome.Retry(reason, delaySeconds)` or throw `TransientWorkError` to retry; return `Outcome.DeadLetter(reason)` or throw `FatalWorkError` to dead-letter immediately into `$DeadLetterQueue`.

## Authentication & Configuration

`MJ: Work Queue Transports` row with `DriverClass = 'Azure'`:

```json
{
  "Namespace": "my-org-wq.servicebus.windows.net",
  "Endpoint": null,
  "UseEmulator": false
}
```

| `CredentialID` | Credentials MJAPI uses |
| --- | --- |
| `null` | `DefaultAzureCredential` (Managed Identity in Azure Container Apps / AKS / App Service, or `az login` / environment credentials locally). |
| An `MJ: Credentials` row | Decrypted `{ "ConnectionString": "..." }` or Service Principal `{ "TenantId", "ClientId", "ClientSecret" }`. |

## Dead letters & Operator actions

- Every subscription has a built-in `$DeadLetterQueue` subqueue managed by Service Bus.
- `ListDeadLetters` peeks `$DeadLetterQueue` non-destructively via `peekMessages`.
- `Replay` re-publishes the envelope to the topic marked with `mj_replay = '1'` and completes the dead-letter entry.
- `Discard` removes the dead-letter entry from `$DeadLetterQueue`.
- `maxDeliveryCount` is validated against `MaxAttempts + 5` (`REDRIVE_MARGIN`).

## Limits (Azure Service Bus Standard tier)

| Limit | Value |
| --- | --- |
| Envelope + properties (Standard tier) | 262,144 bytes (256 KB) |
| Topic name length | 260 characters |
| Subscription name length | 50 characters |
| SessionId length | 128 characters |
| Lock duration | up to 5 minutes (auto-renewed via `ExtendLease` / `Heartbeat`) |

## Testing

- `pnpm test` — deterministic unit and full WorkQueue transport conformance suite against `FakeServiceBusGateway`; never calls Azure.
- `pnpm run check:functions-bundle` — fails if `./functions` reaches `ServiceBusAdministrationClient` or an MJ runtime package, or exceeds 150 KB.
- `MJ_TEST_LIVE_AZURE_SERVICE_BUS=1` with `AZURE_SERVICE_BUS_CONNECTION_STRING` (or `AZURE_SERVICE_BUS_NAMESPACE` + `DefaultAzureCredential`) — runs `pnpm run test:live` against a live Azure Service Bus namespace (or emulator) with bounded timeouts and automatic topic/subscription cleanup.
