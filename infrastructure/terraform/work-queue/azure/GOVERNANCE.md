# Work Queue on Azure — Deployment Governance

MemberJunction metadata is the source of truth for work-queue topology. Azure resources are created **only** by this
Terraform module, from a manifest exported from that metadata, through a gated pipeline. MJ binds to what exists
and validates it; it never creates, changes or deletes cloud resources.

## Roles

| Role | Owns |
| --- | --- |
| Application developer | Topics, subscriptions and handlers in MJ metadata; Functions consumer code |
| Platform engineer | The infrastructure repository, Terraform state, identities and role assignments, environment promotion, out-of-band entity deletion |
| Approver (per environment) | Approving the saved plan at the environment gate; `prod` requires a second approver. Only an approver may add the `work-queue-destructive-approved` label |

## Normal change lifecycle

```
 1. Developer changes topology       metadata/work-queue-topics/*.json (system topics) or MJ: Work Queue entities
 2. Export the manifest              mj queue export-topology --transport Azure-dev > manifest.json
                                     (renders DriverArtifacts.ServiceBusRuleSql / RequiresSession and Status; refuses Ordered)
 3. Open an infrastructure PR        manifest.json diff + function_consumers changes in the env folder
 4. CI on the PR                     fmt / validate / tflint / test, terraform plan, DESTRUCTIVE-CHANGE GATE, plan posted
 5. Merge                            only with a green gate (or the approver's label, after the procedure below)
 6. Deploy run, per environment      plan -out=tfplan → gate → upload tfplan → ENVIRONMENT APPROVAL (plan shown)
                                     → download the same tfplan → terraform apply tfplan   (never a fresh plan)
 7. Bind MJ                          terraform output -json binding_import > bindings.json   (kept as a run artifact)
                                     mj queue import-bindings bindings.json
 8. Verify                           mj queue validate-bindings --transport Azure-dev   → no Errors, no drift Warnings
                                     MJAPI startup logs no binding errors for the transport
 9. Promote                          dev → staging → prod, each from that environment's own manifest export
```

Rules:

- **One manifest per environment**, exported from that environment's MJ database. Never apply a dev manifest to prod.
- **Metadata first, infrastructure second, bindings last.** A topic whose binding is not yet imported rejects publishes
  with the retryable `TopicUnbound`; producers retry and nothing is lost.
- **Removing** a topic or subscription is infrastructure first (after draining — below), metadata second.
- **State**: remote backend (Azure Storage with blob lease locking, or Terraform Cloud) with versioning; one state per
  environment; no local state outside development.
- **Subscriptions and identities**: one Azure subscription (or at least one resource group and one namespace) per
  environment. Give the pipeline's apply identity **no** `Microsoft.ServiceBus/namespaces/topics/delete` permission;
  entity deletion uses a separate break-glass role.

### What is frozen at apply time

A Functions consumer reads its subscription's **policy and filter from `MJ_WQ_SUBSCRIPTION`**, which the module renders
at apply and you copy onto the function app. The subscription's `maxDeliveryCount`, `lockDuration` and rule are set at
the same moment. Changing `MaxAttempts`, backoff, `LeaseSeconds`, the filter or `Status` in MJ therefore changes
**nothing** on Azure until the manifest is re-exported and applied. `mj queue validate-bindings` compares the
subscription's `maxDeliveryCount`, `lockDuration` and rule SQL with the current policy and reports drift; the
scheduled drift job catches the rest.

### Pausing a subscription

| Host | Effect of `Status = 'Paused'` in MJ |
| --- | --- |
| MJ worker | Immediate: the host stops receiving at its next reconcile |
| Functions | **Only after export + apply**: the module sets the subscription's `status = ReceiveDisabled`, which stops every receiver — including the function's trigger |

Pausing never stops fan-out: messages keep landing on the subscription and wait up to the message TTL (14 days by
default), then are dead-lettered (`dead_lettering_on_message_expiration`).

### Adding a subscription

A Service Bus subscription receives only what is published **after** it exists. A subscription added to a live topic
starts empty and misses everything published before its apply; there is no backfill on this transport.

## Change classes

| Change | Class | What Terraform does | Procedure |
| --- | --- | --- | --- |
| Add topic or subscription | Safe | Creates entities and role assignments | Normal lifecycle |
| Change filter (`DriverArtifacts.ServiceBusRuleSql`) | Safe | Updates the rule in place | Normal; messages published during the update may match either rule |
| Change `MaxAttempts`, `LeaseSeconds`, `Status` | Safe | Updates the subscription in place | Normal; locked messages keep their old lock |
| Change a consumer's identity | Safe | Replaces role assignments | Normal (a role assignment replacement trips the gate; it is harmless — approve it) |
| Change `PartitionMode` between `None` and `Exclusive` | **Destructive** | `requires_session` is immutable: the subscription would be replaced — blocked by `prevent_destroy` | Create the new subscription under a new name, move the consumer, drain, remove the old one |
| Flip a topic's `IsFifo` | **Destructive** | `support_ordering` updates in place, but every `Exclusive` subscription needs sessions — see above | Two-topic pattern (plan 11 §4) |
| Rename a topic or subscription | **Destructive** | Would replace entities — blocked by `prevent_destroy` | Create the new one, move producers/consumers, drain, then remove the old one |
| Delete a topic or subscription | **Destructive** | Deletes rules, role assignments and alerts; the entity needs the out-of-band step | Removal procedure below |
| Change `name_prefix` or `environment` | **Destructive** | Would replace everything | Treat as a new deployment |
| Change a subscription to `Ordered` | **Refused** | Plan fails | Ordered requires the Database transport: move the topic there in MJ |

## Destructive changes

The gate blocks any plan that deletes or replaces a namespace, topic, subscription, rule or role assignment. To
proceed, complete the matching procedure, link the evidence in the PR, and have an approver add
`work-queue-destructive-approved`.

### Removal procedure (delete, or the old half of a rename)

1. Stop what feeds it: stop the producers when a whole topic is going away. A single subscription cannot be starved
   while its topic is live — anything still queued when it is removed is discarded, by design.
2. Let the consumer catch up: `mj queue stats --subscription <name>` shows `Pending = 0`.
3. Settle the dead letters: `mj queue dead-letters --subscription <name>`; `mj queue replay` or `mj queue discard` each
   one, or export them (Service Bus Explorer peeks the dead-letter subqueue) if they must be kept.
4. **Release the entity from Terraform** (platform engineer; paste the commands and output into the PR):
   `terraform state rm 'module.work_queue.azurerm_servicebus_subscription.this["<name>"]'`
   (and the topic for a topic removal). Without this the plan fails on `prevent_destroy` — that failure is the
   control working.
5. Open the PR that removes the subscription from the manifest. The plan deletes the rule, role assignments and
   alerts; the gate needs the approver's label.
6. After the apply, re-check that the subscription is empty, then delete it with the break-glass role:
   `az servicebus topic subscription delete --namespace-name <ns> --topic-name <topic> --name <subscription>`.
7. Remove the metadata in MJ.

**Rollback.** Before step 6 nothing irreversible has happened: re-add the subscription to the manifest,
`terraform import` it back into state, and apply. After step 6 the messages are gone; that is why steps 2–3 come
first.

### Rolling back a bindings import

Every deploy run keeps its `bindings.json` as an artifact. To roll back, re-import the previous run's file
(`mj queue import-bindings <previous>/bindings.json`) and run `mj queue validate-bindings`. Import only rewrites
`BindingConfig` on topics and subscriptions; it never touches Azure.

## Functions consumer pipeline

```
consumer source ─► pnpm build ─► bundle (platform node, format esm, sourcemap)
                ─► zip ─► deploy to the function app's staging slot ─► swap
                ─► the app's MJ_WQ_SUBSCRIPTION setting comes from output consumer_app_settings (set once per apply)
```

- **The trigger settles nothing itself** (`autoCompleteMessages: false`); the adapter completes, abandons or
  dead-letters. An invocation that throws is abandoned by the host and redelivered.
- **Sessions**: `isSessionsEnabled` must equal the subscription's `RequiresSession` (both from `consumer_app_settings`).
- **Rollback**: swap the slots back. Nothing on the Service Bus side changes.
- **Idempotency is required** of every consumer; redeliveries happen during deploys.

## Operating

| Signal | Alarm / source | Action |
| --- | --- | --- |
| Dead letters present | `<topic>-dead-letters` | `mj queue dead-letters --subscription <name>` (peek, paged); fix, then `mj queue replay` or `mj queue discard`. Reason `RedrivePolicy` = crash loop (`maxDeliveryCount` reached) |
| Backlog | `<topic>-backlog` | Check consumer errors and whether the subscription is `Paused` (`ReceiveDisabled`); scale MJ workers or the function plan |
| Binding or policy drift | `mj queue validate-bindings` Errors / Warnings; the drift job | Re-export the manifest and apply, then import bindings |

## Required CI checks for infrastructure PRs

1. `terraform fmt -check -recursive`
2. `terraform validate`
3. `tflint`
4. `terraform test` (module repository)
5. `terraform plan` for the target environment, posted to the PR
6. `check-destructive-plan.mjs` on that plan — **a failing gate, not a warning**
7. Scheduled drift detection per environment (`plan -detailed-exitcode`)
