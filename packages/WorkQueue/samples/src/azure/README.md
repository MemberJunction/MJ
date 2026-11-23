# Azure Service Bus WorkQueue Samples

Complete producer, consumer pump, and Azure Functions serverless worker samples using `@memberjunction/work-queue-azure`.

## Included Samples

| File | Pattern | Description |
| :--- | :--- | :--- |
| `AzureServiceBusProducerSample.ts` | Producer | Publishes single and batched invoices with `PartitionKey` -> Service Bus `SessionId`, envelope attributes, and correlation IDs. |
| `AzureServiceBusConsumerSample.ts` | Standalone Consumer Pump | Runs `ServiceBusMessagePump` with bounded concurrency, lock renewal heartbeats, retry backoff, and graceful drain. |
| `AzureFunctionsWorkerSample.ts` | Azure Functions Trigger | Uses `@memberjunction/work-queue-azure/functions` (`CreateServiceBusFunctionHandler`) for single and batch Service Bus trigger invocations. |

## Local Emulator & Live Azure Service Bus Configuration

### 1. Deterministic In-Memory Harness (CI / Offline)
Use `FakeServiceBusGateway` from `@memberjunction/work-queue-azure/testing` to exercise full topic fan-out, session locking, lock expiry, retries, and `$DeadLetterQueue` flows with zero cloud resources.

### 2. Azure Service Bus Emulator (Local Docker)
When running the official Azure Service Bus Emulator locally:
```bash
export AZURE_SERVICE_BUS_CONNECTION_STRING="Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;"
```
Configure the transport row with:
```json
{
  "Namespace": "localhost",
  "Endpoint": "sb://localhost",
  "UseEmulator": true
}
```

### 3. Live Azure Service Bus Namespace
Store a connection string or Service Principal (`TenantId`, `ClientId`, `ClientSecret`) in `MJ: Credentials`, or leave `CredentialID = null` to use `DefaultAzureCredential` (Managed Identity / `az login` / workload identity):
```json
{
  "Namespace": "my-org-wq.servicebus.windows.net",
  "Endpoint": null,
  "UseEmulator": false
}
```

To run the opt-in live integration suite:
```bash
MJ_TEST_LIVE_AZURE_SERVICE_BUS=1 \
AZURE_SERVICE_BUS_CONNECTION_STRING="Endpoint=sb://..." \
pnpm --filter @memberjunction/work-queue-azure run test:live
```
