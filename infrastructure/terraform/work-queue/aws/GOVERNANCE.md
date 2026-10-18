# Work Queue on AWS — Deployment Governance

MemberJunction metadata is the source of truth for work-queue topology. AWS resources are created **only** by this
Terraform module, from a manifest exported from that metadata, through a gated pipeline. MJ binds to what exists
and validates it; it never creates, changes or deletes cloud resources.

## Roles

| Role | Owns |
| --- | --- |
| Application developer | Topics, subscriptions and handlers in MJ metadata; Lambda consumer code |
| Platform engineer | The infrastructure repository, Terraform state, IAM attachments, environment promotion, out-of-band queue deletion |
| Approver (per environment) | Approving the saved plan at the environment gate; `prod` requires a second approver. Only an approver may add the `work-queue-destructive-approved` label |

## Normal change lifecycle

```
 1. Developer changes topology       metadata/work-queue-topics/*.json (system topics) or MJ: Work Queue entities
 2. Export the manifest              mj queue export-topology --transport AWS-dev > manifest.json
                                     (renders DriverArtifacts.SnsFilterPolicy and Status; refuses Ordered subscriptions)
 3. Open an infrastructure PR        manifest.json diff + lambda_consumers changes (artifact keys) in the env folder
 4. CI on the PR                     fmt / validate / tflint / test, terraform plan, DESTRUCTIVE-CHANGE GATE, plan posted
 5. Merge                            only with a green gate (or the approver's label, after the procedure below)
 6. Deploy run, per environment      plan -out=tfplan → gate → upload tfplan → ENVIRONMENT APPROVAL (plan shown)
                                     → download the same tfplan → terraform apply tfplan   (never a fresh plan)
 7. Bind MJ                          terraform output -json binding_import > bindings.json   (kept as a run artifact)
                                     mj queue import-bindings bindings.json
 8. Verify                           mj queue validate-bindings --transport AWS-dev   → no Errors, no drift Warnings
                                     MJAPI startup logs no binding errors for the transport
 9. Promote                          dev → staging → prod, each from that environment's own manifest export
```

Rules:

- **One manifest per environment**, exported from that environment's MJ database. Never apply a dev manifest to prod.
- **Metadata first, infrastructure second, bindings last.** A topic whose binding is not yet imported rejects publishes
  with the retryable `TopicUnbound`; producers retry and nothing is lost.
- **Removing** a topic or subscription is infrastructure first (after draining — below), metadata second.
- **State**: remote backend (S3 + DynamoDB lock table, or Terraform Cloud) with versioning and encryption; one state
  per environment; no local state outside development.
- **Accounts**: one AWS account per environment is recommended; at minimum, separate `environment` values and IAM
  boundaries. Give the pipeline's apply role an explicit **Deny** on `sqs:DeleteQueue` and `sns:DeleteTopic`; queue
  deletion uses a separate break-glass role.

### What is frozen at apply time

A Lambda consumer reads its subscription's **policy and filter from `MJ_WQ_SUBSCRIPTION`**, which Terraform writes when
it applies. The queue's redrive count and visibility timeout are set at the same moment. Changing `MaxAttempts`,
backoff, `LeaseSeconds`, the filter or `Status` in MJ therefore changes **nothing** on AWS until the manifest is
re-exported and applied. `mj queue validate-bindings` compares the queue's redrive count and visibility timeout with
the current policy and reports a **Warning** ("policy drift — re-apply Terraform"); the scheduled drift job below
catches the rest. MJ-worker subscriptions read their policy from MJ directly, but their queue attributes are frozen
the same way.

### Pausing a subscription

| Host | Effect of `Status = 'Paused'` in MJ |
| --- | --- |
| MJ worker | Immediate: the host stops receiving from the queue at its next reconcile |
| Lambda | **Only after export + apply**: the manifest carries `Status`, and the module sets the event source mapping's `enabled = false`. Until then the function keeps consuming |

Pausing never stops fan-out: SNS keeps delivering to the queue, and messages older than the queue's retention
(14 days by default) are lost.

### Adding a subscription

An SNS subscription receives only what is published **after** it exists. A subscription added to a live topic starts
empty and misses everything published before its apply; there is no backfill on this transport. If the new consumer
needs history, replay it from the system of record.

## Change classes

| Change | Class | What Terraform does | Procedure |
| --- | --- | --- | --- |
| Add topic or subscription | Safe | Creates resources | Normal lifecycle |
| Change filter (`DriverArtifacts.SnsFilterPolicy`) | Safe | Updates the SNS subscription in place | Normal; messages published during the update may be filtered by either policy |
| Change `MaxAttempts`, `LeaseSeconds`, Lambda timeout, `Status` | Safe | Updates queue attributes, function environment, event-source `enabled` in place | Normal; in-flight messages keep their old visibility |
| Add or update a Lambda consumer artifact | Safe | Updates function code, publishes a version, moves the `live` alias | Normal (see Lambda pipeline) |
| Roll a consumer back | Safe | Moves the `live` alias | Set `alias_version`, apply |
| Flip a topic between standard and FIFO (including adding the first `Exclusive` subscription to a standard topic) | **Destructive** | Would replace the topic and every queue on it — blocked by `prevent_destroy` | Migration procedure below |
| Rename a topic or subscription | **Destructive** | Would replace resources — queues blocked by `prevent_destroy` | Create the new one, move producers/consumers, drain, then remove the old one |
| Delete a topic or subscription | **Destructive** | Deletes the SNS subscription, policies, consumer and alarms; the queues need the out-of-band step | Removal procedure below |
| Change `name_prefix` or `environment` | **Destructive** | Would replace everything | Treat as a new deployment |
| Change a subscription to `Ordered` | **Refused** | Plan fails | Ordered requires the Database transport: move the topic there in MJ |

## Destructive changes

The gate blocks any plan that deletes or replaces an SNS topic, SNS subscription, SQS queue, queue policy, redrive-allow
policy, event source mapping, function, alias or KMS key. To proceed, complete the matching procedure, link the
evidence in the PR, and have an approver add `work-queue-destructive-approved`.

### Removal procedure (delete, or the old half of a rename)

1. Stop what feeds it: stop the producers when a whole topic is going away. A single subscription cannot be starved
   while its topic is live — anything still queued when it is removed is discarded, by design.
2. Let the consumer catch up: `mj queue stats --subscription <name>` shows `Pending = 0` and `InFlight = 0`.
3. Settle the dead letters: `mj queue dead-letters --subscription <name>`; `mj queue replay` or `mj queue discard` each
   one, or export the dead-letter queue (`aws sqs receive-message`) if they must be kept. Check the SNS
   delivery-failure queue (`…-snsdlq`) in the console as well — MJ cannot see it.
4. **Release the queues from Terraform** (platform engineer; paste the commands and output into the PR):
   `terraform state rm 'module.work_queue.aws_sqs_queue.subscription["<name>"]' 'module.work_queue.aws_sqs_queue.dead_letter["<name>"]'`
   Without this the plan fails on `prevent_destroy` — that failure is the control working.
5. Open the PR that removes the subscription from the manifest. The plan deletes the SNS subscription, policies,
   consumer and alarms; the gate needs the approver's label.
6. After the apply, re-check that both queues are empty, then delete them with the break-glass role:
   `aws sqs delete-queue --queue-url <url>` (twice).
7. Remove the metadata in MJ.

**Rollback.** Before step 6 nothing irreversible has happened: re-add the subscription to the manifest,
`terraform import` the two queues back into state, and apply — the SNS subscription is recreated and starts receiving
again (messages published in between are missed). After step 6 the messages are gone; that is why steps 2–3 come
first. State versioning on the backend lets a bad `state rm` be undone by restoring the previous state object.

### Standard ↔ FIFO migration

1. Create a **new** topic in metadata (for example `email.events.v2`) with the new `IsFifo`, and its subscriptions.
2. Apply infrastructure and import bindings for the new topic.
3. Deploy consumers for the new subscriptions (they are idle).
4. Switch producers to the new topic name.
5. Remove the old topic's subscriptions with the removal procedure, then the old topic.

Prefer the **two-topic pattern** to flipping a busy topic to FIFO: keep the standard topic for the firehose
subscriptions, and publish to a second FIFO topic for the per-key work (plan 11 §4).

### Rolling back a bindings import

Every deploy run keeps its `bindings.json` as an artifact. To roll back, re-import the previous run's file
(`mj queue import-bindings <previous>/bindings.json`) and run `mj queue validate-bindings`. Import only rewrites
`BindingConfig` on topics and subscriptions; it never touches AWS.

## Lambda consumer pipeline

```
consumer source ─► pnpm build ─► esbuild bundle (platform node, format esm, @aws-sdk/* external, sourcemap)
                ─► zip ─► sha256 of zip = content hash
                ─► upload s3://<artifact-bucket>/work-queue/<subscription-slug>/<content-hash>.zip (never overwritten)
                ─► PR: set lambda_consumers["<subscription>"].s3_key to the new key
                ─► plan/apply: a new immutable version is published and the 'live' alias moves to it
```

- **Immutable artifacts**: the key is the content hash; a rebuild of the same code produces no change.
- **The event source invokes the `live` alias**, never `$LATEST`.
- **Rollback**: set `lambda_consumers["<subscription>"].alias_version = "<previous version number>"` and apply — the
  alias moves, nothing is rebuilt. Remove `alias_version` with the next forward release. (Reverting `s3_key` also
  works, but publishes yet another version.)
- **Canary (optional)**: deploy to `staging` first and watch the `MJ/WorkQueue` EMF metrics (`Failed`, `Retried`,
  `DeadLettered`) and the module's alarms for one full traffic cycle before promoting.
- **Throttle with `maximum_concurrency`**, not reserved concurrency: a throttled invocation returns its messages to the
  queue with the receive already counted, and enough of those dead-letter a message that never ran.
- **Idempotency is required** of every consumer; redeliveries happen during deploys.

## Operating

| Signal | Alarm / source | Action |
| --- | --- | --- |
| Dead letters present | `<dlq>-has-messages` | `mj queue dead-letters --subscription <name>` (scans up to 100); fix, then `mj queue replay` or `mj queue discard`. Reason `RedrivePolicy` = crash loop. Bulk: `aws sqs start-message-move-task` from the DLQ to the queue after fixing the cause |
| SNS could not deliver | `<snsdlq>-has-messages` | Not visible to MJ. Inspect the queue in the SQS console; the cause is almost always the queue policy or the KMS key policy. Fix, then `aws sqs start-message-move-task` |
| Backlog age | `<queue>-backlog-age` | Check consumer errors/throttles and whether the subscription is `Paused`; for Lambda raise `maximum_concurrency`; for MJ workers raise `workQueue` concurrency |
| Lambda errors / throttles | `<function>-errors`, `<function>-throttles` | Inspect logs; throttles burn receives — raise concurrency limits or lower `maximum_concurrency`, and remove reserved concurrency |
| Binding or policy drift | `mj queue validate-bindings` Errors / Warnings; the drift job | Re-export the manifest and apply, then import bindings |

## Required CI checks for infrastructure PRs

1. `terraform fmt -check -recursive`
2. `terraform validate`
3. `tflint`
4. `terraform test` (module repository)
5. `terraform plan` for the target environment, posted to the PR
6. `check-destructive-plan.mjs` on that plan — **a failing gate, not a warning**
7. Scheduled drift detection per environment (`plan -detailed-exitcode`)
