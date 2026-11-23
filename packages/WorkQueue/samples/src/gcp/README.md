# Google Cloud Pub/Sub WorkQueue Samples

Complete producer, pull consumer pump, and Cloud Run HTTP Push serverless worker samples using `@memberjunction/work-queue-gcp`.

## Included Samples

| File | Pattern | Description |
| :--- | :--- | :--- |
| `GcpPubSubProducerSample.ts` | Producer | Publishes single and batched invoices with `PartitionKey` -> Pub/Sub `orderingKey`, envelope attributes, and correlation IDs. |
| `GcpPubSubConsumerSample.ts` | Standalone Pull Consumer Pump | Runs `PubSubMessagePump` with bounded concurrency, `modifyAckDeadline` heartbeats, retry backoff, and graceful drain. |
| `GcpCloudRunWorkerSample.ts` | Cloud Run HTTP Push Worker | Uses `@memberjunction/work-queue-gcp/cloudrun` (`CreateCloudRunPushHandler`) with bearer/OIDC auth verification and exact HTTP status mapping (`200`/`204` ACK vs `503` NACK). |

## Local Emulator & Live Google Cloud Pub/Sub Configuration

### 1. Deterministic In-Memory Harness (CI / Offline)
Use `FakePubSubGateway` from `@memberjunction/work-queue-gcp/testing` to exercise topic fan-out, ordering-key isolation, ack-deadline expiry, retries, and dead-letter topic flows with zero cloud resources.

### 2. Google Cloud Pub/Sub Emulator (Local Docker / `gcloud`)
When running the official Pub/Sub emulator locally:
```bash
gcloud beta emulators pubsub start --host-port=localhost:8085
export PUBSUB_EMULATOR_HOST=localhost:8085
```
Configure the transport row with:
```json
{
  "ProjectId": "mj-wq-local",
  "ApiEndpoint": "localhost:8085",
  "UseEmulator": true
}
```

### 3. Live Google Cloud Pub/Sub Project
Store a Service Account JSON key (`CredentialsJson` or `ClientEmail` + `PrivateKey`) in `MJ: Credentials`, or leave `CredentialID = null` to use Application Default Credentials (Workload Identity / GCE metadata / `gcloud auth application-default login`):
```json
{
  "ProjectId": "my-gcp-project",
  "ApiEndpoint": null,
  "UseEmulator": false
}
```

To run the opt-in live integration suite:
```bash
MJ_TEST_LIVE_GCP_PUBSUB=1 \
GCP_PUBSUB_PROJECT_ID="my-gcp-project" \
pnpm --filter @memberjunction/work-queue-gcp run test:live
```
