# MemberJunction Work Queue & Messaging Framework

A unified, high-performance messaging and durable work queue substrate for MemberJunction. Engineered to handle high-throughput event fan-out, strict FIFO partitioned workflows, and long-running distributed batch processing.

The framework supports both a **zero-dependency Database transport** (built natively into Microsoft SQL Server and PostgreSQL) and **cloud-native transports** (AWS SNS/SQS FIFO and thin Lambda handlers).

---

## Packages

| Package | npm | Description |
| :--- | :--- | :--- |
| **[core](./core/README.md)** | `@memberjunction/work-queue-core` | Transport-neutral contracts, message envelope, attribute filter evaluator, consumer runtime, and REST publisher client. Zero MJ runtime dependencies. |
| **[base](./base/)** | `@memberjunction/work-queue-base` | Browser-safe metadata tier (`WorkQueueEngineBase`), topology models, binding validators, and manifest export. |
| **[engine](./engine/README.md)** | `@memberjunction/work-queue-engine` | Server engine, Database transport driver, SQL stored-procedure builders, `WorkQueueHost`, `WorkQueueSweeper`, and Remote Operations. |
| **[server](./server/README.md)** | `@memberjunction/work-queue-server` | MJServer REST publish endpoint extension (`POST /work-queue/topics/{topic}/messages`) with API-key and scope authentication. |
| **[aws](./aws/README.md)** | `@memberjunction/work-queue-aws` | AWS SNS/SQS transport driver, SQS consumer, and `@memberjunction/work-queue-aws/lambda` adapter for thin serverless workers. |
| **[samples](./samples/README.md)** | `@memberjunction/work-queue-samples` | `HelloWorldHandler` and walkthrough topologies demonstrating publish, retry, dead-letter, replay, and cancellation. |

---

## Key Architecture Concepts

- **Topics & Subscriptions**: Producers publish messages to a `Topic`. Each topic fans out deliveries to one or more `Subscriptions`.
- **Stateless Competing Consumers**: Containers and workers do not need pre-registration. Workers dynamically lease deliveries using atomic claims and ephemeral instance IDs.
- **Partition Modes**:
  - `None`: High-concurrency parallel delivery. No ordering or single-thread constraints.
  - `Exclusive`: At most one message per `PartitionKey` in-flight at a time. Other keys process in parallel.
  - `Ordered`: Strict FIFO head-of-line ordering per `PartitionKey`. If an item fails or retries, subsequent items for that key wait.
- **Claim Check Pattern**: The envelope (payload plus attributes) is capped at 256 KB on every transport (`MAX_ENVELOPE_BYTES` in core; a topic's `MaxPayloadBytes` can lower it). Large datasets or files live in staging tables or blob storage (`s3://...`); `PayloadRef` carries the pointer envelope.

---

## 1. Built-in Queueing (Database Transport)

The Database transport requires no external brokers or cloud services. It uses 32 guarded-write stored procedures (`spWorkQueue*`) with database application locks and snapshot isolation (`READ_COMMITTED_SNAPSHOT ON` on SQL Server).

### Enabling the Host in `mj.config.cjs`

Add the `workQueue` configuration section to your server configuration:

```javascript
// mj.config.cjs
module.exports = {
  // ... other MJ configuration
  workQueue: {
    enabled: true,
    systemUserEmail: 'admin@example.org', // Existing MJ user that handlers run as
    subscriptions: [
      { name: '*', concurrency: 4 }      // Run all active subscriptions, up to 4 concurrent deliveries each
      // or specify explicit subscriptions:
      // { name: 'documents.process', concurrency: 2 }
    ],
    idlePollMinMs: 250,
    idlePollMaxMs: 5000,
    shutdownDrainMs: 8000,
    sweeperEnabled: true,               // Runs lease expiry and retention cleanup
    sweeperIntervalMs: 60000,
  }
};
```

---

## 2. Publishing Messages (Producers)

Producers can publish messages from server code, or externally via REST.

### In-Process Server Publishing (TypeScript)

Use `WorkQueueEngine.Instance.Publish` (or `PublishAs` to specify caller context):

```typescript
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';

interface DocumentProcessPayload {
  batchId: string;
  documentCount: number;
}

// Publish to a topic
const results = await WorkQueueEngine.Instance.Publish<DocumentProcessPayload>(
  'documents.process',
  [
    {
      PartitionKey: 'tenant-acme', // Enforces per-tenant isolation / ordering
      Payload: {
        batchId: 'batch-2026-001',
        documentCount: 42
      },
      // Optional: Sliding deduplication ledger (suppresses duplicates within TTL)
      DeduplicationKey: 'doc-batch-2026-001',
      DeduplicationTTLSeconds: 300
    }
  ]
);

for (const res of results) {
  if (res.Status === 'Accepted') {
    console.log(`Published message ${res.MessageID}`);
  } else if (res.Status === 'Duplicate') {
    console.warn(`Duplicate publish ignored (existing: ${res.MessageID})`);
  } else {
    console.error(`Publish rejected: ${res.Error?.Message}`);
  }
}
```

### External REST Publishing

External clients can publish over HTTP using an MJ API Key:

```bash
curl -X POST https://your-mj-server/work-queue/topics/documents.process/messages \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "PartitionKey": "tenant-acme",
      "Payload": {
        "batchId": "batch-2026-001",
        "documentCount": 42
      }
    }
  ]'
```

---

## 3. Writing Consumers (Handlers)

Handlers process messages pulled from subscriptions. Handlers must be **idempotent** because distributed lease queues guarantee at-least-once delivery.

### Writing an In-Process Handler

Extend `BaseWorkHandler` and register it with `@RegisterClass`:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';
// Contracts live in core; the engine does not re-export them.
import { Outcome, FatalWorkError, type WorkMessage, type WorkContext, type WorkOutcome } from '@memberjunction/work-queue-core';

interface DocumentProcessPayload {
  batchId: string;
  documentCount: number;
}

@RegisterClass(BaseWorkHandler, 'documents.process.handler')
export class DocumentProcessHandler extends BaseWorkHandler<DocumentProcessPayload> {
  public async Handle(
    message: WorkMessage<DocumentProcessPayload>, 
    context: WorkContext
  ): Promise<WorkOutcome> {
    const { batchId, documentCount } = message.Payload;

    console.log(`Processing batch ${batchId} for partition ${message.PartitionKey}`);

    for (let i = 0; i < documentCount; i++) {
      // Abort immediately if the lease was lost or server is shutting down
      if (context.Signal.aborted) {
        return Outcome.Retry('Worker aborted or lease lost', 10);
      }

      await processDocument(batchId, i);

      // Periodically extend the lease during long-running work (Percent 0..100, Message ≤ 500 chars)
      if (i % 10 === 0) {
        await context.Heartbeat({ Percent: Math.round((i / documentCount) * 100), Message: `document ${i} of ${documentCount}` });
      }
    }

    // Success outcome
    return Outcome.Complete();
  }
}
```

### Handler Outcomes

- `Outcome.Complete()`: Delivery marked finished and purged according to retention policy.
- `Outcome.Retry(reason, delaySeconds)`: Increments attempt count and schedules redelivery after exponential backoff.
- `Outcome.DeadLetter(reason)`: Moves delivery immediately to the Dead Letter Queue.
- Throwing `FatalWorkError`: Automatically dead-letters the message.
- Throwing any other error: Automatically retries with jittered exponential backoff until `MaxAttempts` is reached.

---

## 4. AWS Transport (SNS + SQS)

The AWS transport routes topic publishes to **Amazon SNS** and subscription deliveries to one **Amazon SQS queue per
subscription** (plus a dead-letter queue), with visibility timeouts managing leases. A topic with `IsFifo = true`
becomes an SNS FIFO topic with FIFO queues (required for `Exclusive` subscriptions); other topics are standard.
`Ordered` is not supported on AWS — it needs the Database transport.

Cloud resources are created **only** by the Terraform module in `infrastructure/terraform/work-queue/aws`, from a
manifest exported from MJ metadata. MJ never creates, changes or deletes AWS resources itself; it binds to what the
module created and validates it. The full change process (roles, gates, destructive changes) is in that folder's
`GOVERNANCE.md`.

### 4.1 Define the transport in MJ

An `MJ: Work Queue Transports` row with `DriverClass = 'AWS'`. `Configuration` names the region (and an optional
custom endpoint, e.g. LocalStack). Add it under `metadata/work-queue-transports/` and push with
`mj sync push --dir=metadata --include=work-queue-transports`, or create it in Explorer:

```json
{
  "fields": {
    "Name": "AWS-prod",
    "DriverClass": "AWS",
    "Configuration": { "Region": "us-east-1", "Endpoint": null },
    "CredentialID": null,
    "Status": "Active"
  },
  "primaryKey": { "ID": "<uuidgen>" }
}
```

**How MJAPI authenticates to AWS** is decided by `CredentialID`:

| `CredentialID` | Credentials MJAPI uses |
| :--- | :--- |
| `null` | The AWS SDK **default chain**: the instance/task/pod role in AWS, or on a developer machine `AWS_PROFILE` / `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (+ `AWS_SESSION_TOKEN`) from the environment or `~/.aws/credentials`. Recommended in AWS: attach the module's `mjapi_policy_json` output to the role. |
| An `MJ: Credentials` row | Its decrypted values, either static keys — `AccessKeyId`, `SecretAccessKey`, optional `SessionToken` — or an assumed role — `RoleArn`, optional `ExternalId` (MJAPI assumes it with STS in the transport's region). Use this when MJAPI runs outside AWS. |

The region never comes from the environment for MJ: it is always the transport's `Configuration.Region`.

Then define the topics (`TransportID` pointing at the AWS transport) and subscriptions in metadata or Explorer, exactly
as for the Database transport. Leave `BindingConfig` empty — the bindings import (4.3) fills it.

### 4.2 Provision with Terraform

Export the manifest for **that transport** (the export renders the SNS filter policy for every subscription and
refuses `Ordered`):

```bash
mj queue export-topology --transport AWS-prod --output infra/work-queue/prod/manifest.json
```

Terraform authenticates with the standard AWS provider inputs — nothing MJ-specific. Locally that is a profile or
keys in the environment; in CI it is an OIDC role (the examples in the module folder use `aws-actions/configure-aws-credentials`):

```bash
export AWS_PROFILE=mj-prod          # or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN
export AWS_REGION=us-east-1
```

Call the module from your infrastructure repository (never apply from inside this repo's module folder):

```hcl
module "work_queue" {
  source         = "git::https://github.com/MemberJunction/MJ.git//infrastructure/terraform/work-queue/aws?ref=<tag>"
  manifest_path  = "${path.module}/manifest.json"
  name_prefix    = "mj-wq"           # must match the prefix MJ uses to name resources
  environment    = "prod"
  region         = "us-east-1"       # must equal the transport's Configuration.Region
  create_kms_key = true              # or kms_key_arn + kms_key_policy_confirmed; see the module README
  alarm_actions  = [aws_sns_topic.ops_alerts.arn]

  lambda_consumers = {               # one entry per External subscription served by Lambda
    "documents.archive" = {
      s3_bucket           = "acme-artifacts"
      s3_key              = "work-queue/documents-archive/<content-hash>.zip"
      timeout_seconds     = 60
      maximum_concurrency = 50
    }
  }
}

output "binding_import" { value = module.work_queue.binding_import }
```

```bash
terraform init
terraform plan -out=tfplan
node <module>/scripts/check-destructive-plan.mjs <(terraform show -json tfplan)   # the destructive-change gate
terraform apply tfplan
```

The module creates the SNS topics, the subscription and dead-letter queues, the SNS subscriptions with raw delivery
and filter policies, optional Lambda consumers, CloudWatch alarms, and outputs `mjapi_policy_json` (attach to the
MJAPI role) and `mj_worker_policy_json` (attach to MJ worker roles).

### 4.3 Bind MJ to the resources

```bash
terraform output -json binding_import > bindings.json
mj queue import-bindings bindings.json            # writes BindingConfig (ARNs, queue URLs) onto topics and subscriptions
mj queue validate-bindings --transport AWS-prod   # read-only: existence, FIFO flags, redrive, raw delivery, filter policy
```

A topic whose binding is not yet imported rejects publishes with the retryable `TopicUnbound`, so producers can be
deployed first. Re-export, apply and re-import after every topology change; `validate-bindings` reports drift.

### 4.4 Writing a Serverless Lambda Consumer

Use `@memberjunction/work-queue-aws/lambda` for lightweight Lambda workers without importing the full server engine.
Terraform sets `MJ_WQ_SUBSCRIPTION` (policy, filter and queue URLs) on the function; the function's role is created by
the module with access to its own queue, dead-letter queue and log group only.

```typescript
import { Outcome, type WorkHandler, type WorkMessage, type WorkContext, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateSqsLambdaHandler } from '@memberjunction/work-queue-aws/lambda';

class LambdaDocumentHandler implements WorkHandler {
  public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
    await processDocument(message.Payload, context.Signal);
    return Outcome.Complete();
  }
}

// Exports AWS Lambda SQS event entrypoint
export const handler = CreateSqsLambdaHandler(() => new LambdaDocumentHandler());
```

#### Packaging and deploying the function

The function's build lives in **your consumer project**, not in this repository. The line between the two:

| Lives in this repository | Lives in your consumer / infrastructure repository |
|---|---|
| `@memberjunction/work-queue-aws/lambda` (`CreateSqsLambdaHandler`), `@memberjunction/work-queue-core` types, the `examples/thin-consumer` reference | The handler class and its `index.ts` entrypoint |
| The Terraform module (function, `live` alias, SQS event source mapping, role, log group, alarms) | Bundling that entrypoint, zipping it, uploading the zip to S3 (or pushing an image to ECR) |
| `mj queue export-topology` / `import-bindings` / `validate-bindings` | The `terraform apply` that points the function at that artifact |

There is no `mj` command that builds or uploads a function. The module only *references* an artifact you have
already uploaded, so a deploy is three steps: build, upload, apply.

**1. Build and upload** (in the consumer project, which depends on `@memberjunction/work-queue-aws` and
`@memberjunction/work-queue-core`):

```bash
npx esbuild src/index.ts --bundle --platform=node --format=esm --target=node22 \
  --outfile=dist/index.mjs --external:@aws-sdk/*
(cd dist && zip -q ../documents-archive.zip index.mjs)
HASH=$(shasum -a 256 documents-archive.zip | cut -c1-12)
aws s3 cp documents-archive.zip "s3://acme-artifacts/work-queue/documents-archive/${HASH}.zip"
```

`--bundle` folds the MJ packages and your code into one file, so the zip carries no `node_modules`.
`--external:@aws-sdk/*` leaves the SDK out because the Lambda Node.js runtimes (`nodejs22.x` is the module's
default) already ship AWS SDK v3. The content hash in the key is what makes Terraform see a new build — reusing
one key would leave the function on the old code. A container image is the alternative: the same esbuild step in a
Dockerfile on the AWS Lambda Node base image, pushed to ECR and passed as `image_uri` instead of `s3_bucket` + `s3_key`.

**2. Point Terraform at the artifact.** In the `lambda_consumers` entry for the subscription (4.2), set `s3_key` to
the key you just uploaded. The key of the map must equal a subscription whose `HostType` is `External`; the
module refuses an entry for an `MJWorker` subscription, and its `external_subscriptions_without_lambda` output lists
any `External` subscription with no entry (deployed some other way, or forgotten). `handler` defaults to
`index.handler`, so the file must be `index.mjs` exporting `handler` — or set `handler` to match your entrypoint.

**3. Apply.** `terraform apply` creates or updates the function, moves the `live` alias that the SQS event source
invokes, and sets `MJ_WQ_SUBSCRIPTION` on it from the manifest. Then run the bindings import (4.3) if the topology
changed. A later code change is the same loop: new hash, new `s3_key`, apply. The function's policy
(`MaxAttempts`, backoff, filter) is frozen in `MJ_WQ_SUBSCRIPTION` at apply time, so a policy change in MJ also
needs a re-export and apply.

**`ExternalRef` on the subscription** is informational: MJ never reads it, and nothing above sets it. Its purpose is
to let an operator looking at the subscription in Explorer see which function serves it. After the apply, copy the
ARN from the module's `lambda_function_arns` output (keyed by subscription name) into the subscription's
`ExternalRef` — on the Explorer record, or in the subscription's metadata JSON if the topology is seeded with
`mj sync push`. `BindingConfig` is different: `import-bindings` writes it, it holds the queue URLs and ARNs the
transport needs at runtime, and it must not be hand-edited.

The consumer stays thin by design: `pnpm run check:lambda-bundle` in the `aws` package fails if the `./lambda`
entry ever reaches the SNS client or an MJ runtime package, which is what keeps the bundle small.

---

## 5. Horizontally Scaled Container Workers

A worker is any process that loads your handler classes and runs `mj queue work`. Run it in a container and scale the
container count on the queue's backlog; each new replica starts claiming deliveries the moment it comes up, with no
registration step. The queue's atomic claims make competing consumers safe: two replicas never run the same delivery,
and `Exclusive` / `Ordered` keys are honoured across every replica.

### The handler

The same class as in section 3. Nothing in it knows whether it runs inside MJAPI or in a scaled container.

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';
import { Outcome, type WorkMessage, type WorkContext, type WorkOutcome } from '@memberjunction/work-queue-core';

interface DocumentBatchPayload {
  BatchID: string;
  DocumentCount: number;
  ManifestStorageUri: string;   // claim check: the manifest lives in blob storage, not in the message
}

@RegisterClass(BaseWorkHandler, 'documents.process.handler')
export class DocumentProcessingHandler extends BaseWorkHandler<DocumentBatchPayload> {
  public async Handle(message: WorkMessage<DocumentBatchPayload>, context: WorkContext): Promise<WorkOutcome> {
    const { BatchID, DocumentCount, ManifestStorageUri } = message.Payload;
    context.Log.Info(`Processing batch ${BatchID} (${DocumentCount} documents)`);

    const manifest = await downloadManifest(ManifestStorageUri);
    for (let i = 0; i < manifest.documents.length; i++) {
      if (context.Signal.aborted) {
        // Lease lost, cancelled, or the container is being drained: stop; the queue redelivers to another replica.
        return Outcome.Retry(`aborted: ${String(context.Signal.reason)}`);
      }
      await processSingleDocument(manifest.documents[i]);
      await context.Heartbeat({ Percent: Math.round(((i + 1) / DocumentCount) * 100), Message: `${i + 1} of ${DocumentCount}` });
    }
    return Outcome.Complete();
  }
}
```

The handler's package must be **loaded in the worker process**: MJ resolves the subscription's `HandlerKey` through
the ClassFactory, so either add the package to the class manifest (`mj codegen manifest`) of the image you run, or
import it from your own entrypoint. A key that resolves to nothing plans as `HandlerNotRegistered` and the worker
exits non-zero, so a mis-built image fails loudly rather than idling.

### The container

Two shapes, chosen by how the platform scales:

**Long-running replicas** (Kubernetes `Deployment`, ECS service, Azure Container Apps with a scale rule). Each
replica runs the host until it is told to stop; add replicas when the backlog grows, remove them when it shrinks.

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY . .                              # your MJ app with the handler package in its class manifest
RUN pnpm install --frozen-lockfile && pnpm run build
# mj.config.cjs / environment provide the database connection and workQueue.systemUserEmail
CMD ["pnpm", "mj", "queue", "work", "--subscription", "documents.process", "--concurrency", "1", "--shutdown-drain-ms", "10000"]
```

`SIGTERM` drains the host: running handlers get `--shutdown-drain-ms` to finish (the drain can take twice that, so
set the platform's grace period above `2 × shutdown-drain-ms`), and anything still running is aborted with
`Signal.reason === 'Shutdown'` and redelivered elsewhere.

**One-shot jobs** (KEDA `ScaledJob`, Azure Container Apps jobs): each job claims a bounded amount of work, drains and
exits `0`, so the platform can scale to zero.

```bash
mj queue work --subscription documents.process --once                    # claim 1 delivery, run it, exit
mj queue work --subscription documents.process --once --max 5 --concurrency 2 --max-duration-ms 3300000
```

### The scale signal

Scale on **claimable pending plus in-flight** deliveries for the subscription, not on pending alone: schedulers
subtract running replicas from the metric, and a pending-only count scales to zero while work is still running.

- Where the scaler can call an API: `mj queue backlog --subscription documents.process` or the `WorkQueue.GetBacklog`
  remote operation (exact, and it applies single flight per key).
- Where it must query the database (KEDA `mssql`/`postgresql` triggers, Container Apps `custom` rules): the scaler
  query in `engine/README.md` ("Container-job workers"), run as a SELECT-only login
  (`scripts/work-queue-scaler-login.sql`).

Useful parallelism is bounded by the topology: an `Exclusive` or `Ordered` subscription runs at most one delivery per
partition key at a time, so more replicas than active keys sit idle. Size `LeaseSeconds` for the worst heartbeat
outage, not the handler's runtime, and keep the job's `--max-duration-ms` below the scheduler's deadline.

---

## 6. Feeding a Record Set Processor from the Queue

The Record Set Processor (`@memberjunction/record-set-processor`) runs one piece of work — a Field Rules pass, an
Action, an Agent or an Infer prompt — over a set of records, in batches, with per-record tracking in
`MJ: Process Runs`. The queue is a good way to hand it work: a producer decides *which* records need processing and
publishes them in chunks; scaled workers (section 5) pick the chunks up and run the process over each one. The queue
gives the hand-off durability, retries and per-key single flight; the processor gives the run its batching, error
threshold and audit trail.

A handler receives **one message at a time**, so batching is done at publish time: each message carries one chunk of
record IDs, and the host runs as many messages concurrently as `concurrency` allows. That is the "poll several
messages, then process them together" shape — one message is one batch.

### The producer: publish chunks of record IDs

```typescript
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';

interface RecordChunkPayload {
  RecordProcessID: string;   // the MJ: Record Processes definition to run
  RecordIDs: string[];       // primary keys of the records in this chunk
}

const CHUNK = 500;           // keep the envelope well under 256 KB
for (let i = 0; i < recordIDs.length; i += CHUNK) {
  await WorkQueueEngine.Instance.Publish<RecordChunkPayload>('records.process', [{
    PartitionKey: recordProcessID,                       // Exclusive subscription: one chunk of a process at a time per worker fleet
    Payload: { RecordProcessID: recordProcessID, RecordIDs: recordIDs.slice(i, i + CHUNK) },
    DeduplicationKey: `${recordProcessID}:${i}:${runStamp}`,
    DeduplicationTTLSeconds: 3600,
  }]);
}
```

For very large sets, put the ID list in blob storage and send a `PayloadRef` instead; the handler downloads it.

### The handler: one message, one processor run

The handler hands the chunk to `RecordProcessExecutor` as a **records scope override**, so the stored Record Process
definition (work type, mappings, batch size, concurrency, skip-unchanged) applies unchanged and every run is
persisted like a scheduled or on-demand one.

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';
import { Outcome, FatalWorkError, type WorkMessage, type WorkContext, type WorkOutcome } from '@memberjunction/work-queue-core';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';

@RegisterClass(BaseWorkHandler, 'records.process.handler')
export class RecordChunkHandler extends BaseWorkHandler<RecordChunkPayload> {
  public async Handle(message: WorkMessage<RecordChunkPayload>, context: WorkContext): Promise<WorkOutcome> {
    const { RecordProcessID, RecordIDs } = message.Payload;
    if (RecordIDs.length === 0) {
      throw new FatalWorkError('Chunk carries no record IDs');        // nothing to retry: dead-letter it
    }

    const result = await new RecordProcessExecutor().RunByID(RecordProcessID, {
      contextUser: this.ContextUser,                                  // the host's system user
      provider: this.Provider,                                        // the delivery's provider, never a global one
      triggeredBy: 'OnDemand',
      scope: { Kind: 'records', RecordIDs },                          // this chunk, instead of the stored scope
      onProgress: (progress) => {
        // Renew the lease while the processor works through the chunk; stop if the lease is lost or the host drains.
        void context.Heartbeat({
          Percent: progress.Total ? Math.round((progress.Processed / progress.Total) * 100) : undefined,
          Message: `${progress.Processed} processed, ${progress.Error} failed`,
        });
      },
    });

    // Per-record failures are recorded on the run's MJ: Process Run Details and do not fail the delivery.
    // A run that failed as a whole (error threshold, circuit breaker, cancelled) is retried with backoff.
    if (result.Status === 'Failed') {
      return Outcome.Retry(`Process run ${result.ProcessRunID} failed: ${result.ErrorMessage ?? 'error threshold reached'}`);
    }
    return Outcome.Complete();
  }
}
```

The subscription for `records.process` names this handler (`HandlerKey = 'records.process.handler'`) and runs on
the container workers of section 5, so a growing backlog of chunks scales the fleet, and each worker turns one chunk
into one processor run.

### Rules that make the pairing safe

- **The processor must be idempotent per record.** A redelivered chunk re-runs the process over the same records:
  Field Rules and Infer with `SkipUnchanged` are naturally idempotent; an Action that sends an email is not — give it
  its own idempotency key (the `MessageID` is stable across redeliveries and replays).
- **Honour the lease.** Long chunks need the `Heartbeat` above; if the lease is lost, `context.Signal` aborts and
  the processor's next `onAfterBatch` / progress step should stop. Size `LeaseSeconds` for one batch, not the chunk.
- **Do not put record data in the message.** The processor loads records itself; the message carries keys (or a
  `PayloadRef`), which keeps envelopes small and the audit trail on the Process Run.
- **Substrate alternative.** When there is no Record Process definition, call the substrate directly with an
  `ArraySource` of `RecordRef`s and a `FunctionRecordProcessor`: `RecordSetProcessor.Instance.Process({ source, processor, contextUser, provider })`.
  The queue side is identical.

---

## 7. CLI & Operational Commands

The MemberJunction CLI (`mj queue`) provides comprehensive management and diagnostic commands:

```bash
# View live topology, pending counts, and in-flight throughput
mj queue stats

# Inspect messages in dead-letter queues
mj queue dead-letters --subscription "documents.process"

# View partition states (Blocked, InFlight, Idle)
mj queue partitions --subscription "documents.process"

# Replay one dead-lettered delivery back to Pending (DeliveryID from `mj queue dead-letters`)
mj queue replay --subscription "documents.process" --delivery "D1ED3F08-..." --note "fixed upstream"

# Discard a dead letter with an audit reason
mj queue discard --subscription "documents.process" --delivery "D1ED3F08-..." --reason "Manual operator skip"

# Export the topology manifest for one transport (input to the Terraform module)
mj queue export-topology --transport AWS-prod --output manifest.json

# Validate cloud transport bindings (all transports, or one)
mj queue validate-bindings --transport AWS-prod
```

---

## 8. Testing & Conformance

- **Hermetic Unit Tests**: Run `npm test` inside each package directory.
- **Live Database Conformance**:
  ```bash
  MJ_WORKQUEUE_LIVE_DB=1 pnpm --filter @memberjunction/work-queue-engine test
  ```
- **LocalStack AWS Conformance** (start LocalStack first: `docker compose -f packages/WorkQueue/aws/localstack/docker-compose.yml up -d --wait`):
  ```bash
  pnpm --filter @memberjunction/work-queue-aws run test:localstack
  ```
  Two cases (C07, C09: stale-lease fencing) are skipped there because LocalStack never expires receipt handles; confirm them against a real AWS account.
