# 09b — Explorer Operator Dashboard — Fast Follow

## Summary

An MJ Explorer dashboard for operating the work queue. It gives the same capabilities as the Phase 1
`mj queue` CLI:
- topology overview with live stats
- dead-letter browser with replay/discard
- blocked and awaiting partitions with sequence skip
- binding validation status

It's built to [`guides/UI_LAYERING_GUIDE.md`](../../../guides/UI_LAYERING_GUIDE.md) (L0→L3) and to the
dashboard conventions in [`packages/Angular/Explorer/dashboards/CLAUDE.md`](../../../packages/Angular/Explorer/dashboards/CLAUDE.md):
chrome trio, `NotifyLoadComplete()`, agent context + tools.

## Motivation

- `Ordered` subscriptions block keys until an operator acts (D7). A CLI-only surface makes that operator a
  developer. Support staff need a UI.
- One screen showing backlog, dead letters and blocked keys across transports is the main day-2 tool.

## Scope / Non-goals

**In scope:** read and operate views, topic/subscription CRUD via standard entity forms (linked, not rebuilt),
agent context/tools, permissions.

**Non-goals:**
- Editing payloads before replay (09i).
- Charts of historical throughput. Cloud transports keep no ledger (D11); a link out to CloudWatch / Azure
  Monitor is provided instead.
- Publishing test messages from the UI (possible later; see Open questions).

## Design

### Data access: the Phase 1 remote operations

Phase 1 already ships the operator surface as **Remote Operations** (03 §8; `guides/REMOTE_OPERATIONS_GUIDE.md`)
— there are no REST operator routes (REST is publish-only). The dashboard calls the CodeGen-emitted operation
classes through `this.ProviderToUse`, the same code path the `mj queue` CLI uses server-side. Topology (topics,
subscriptions, transports) is read with `RunView.FromMetadataProvider(this.ProviderToUse)` over the generated
entities; no operation is needed for it.

| Remote Operation key (03 §8) | Used by | Side effect |
|---|---|---|
| `WorkQueue.GetSubscriptionStats` | Overview, stats strips | none |
| `WorkQueue.ListDeadLetters` | Dead Letters | none |
| `WorkQueue.ReplayDeadLetter` | Dead Letters (replay) | yes |
| `WorkQueue.DiscardDelivery` | Dead Letters (discard); pending-item cancel where `CancelPending` | yes |
| `WorkQueue.ListPartitions` | Partitions | none |
| `WorkQueue.SkipSequence` | Partitions | yes |
| `WorkQueue.ValidateBindings` | Bindings | none |

Phase 1 operations are single-item; bulk replay/discard loops client-side with per-item results (a batch variant
is a candidate addition if loops prove slow). Every operation can answer `supported: false` (e.g. `ListPartitions`
on a non-staged AWS subscription); the UI hides the corresponding section for that subscription rather than
showing an error. `Discard` on a blocking `Ordered` head shows an explicit confirmation naming how many waiting
items will be released.

### Layers and packages

```
L0  @memberjunction/work-queue-core (types, already exists)
    view-model helpers (condition → badge variant, age formatting, "blocks N items" text) as pure
    functions in @memberjunction/ng-work-queue-widgets/src/lib/models (no Angular imports; vitest-tested).
    A separate L0 package isn't warranted for a handful of helpers.

L1  @memberjunction/ng-work-queue-widgets   (NO router, NO ng-shared, zero data access)
    mj-wq-stats-strip          (SubscriptionStats → counters; Pending/InFlight/DeadLettered/BlockedKeys/OldestAge)
    mj-wq-dead-letter-table    (DeadLetterRecord[] in; SelectionChange, ReplayRequested, DiscardRequested out)
    mj-wq-partition-table      (PartitionStateRecord[] in; SkipSequenceRequested, ViewBlockingRequested out)
    mj-wq-envelope-viewer      (WorkMessage in; attributes + JSON payload/PayloadRef, copy buttons)
    mj-wq-binding-issues-list  (BindingValidationIssue[] in)

L2  same package, composites extending BaseAngularComponent (ProviderToUse only)
    mj-wq-subscription-panel   (input: SubscriptionID or loaded entity; owns GetSubscriptionStats/ListDeadLetters/
                                ListPartitions/ReplayDeadLetter/DiscardDelivery/SkipSequence calls; emits RecordOpenRequested)
    mj-wq-topology-overview    (loads topics+subscriptions via RunView, one GetSubscriptionStats call; emits
                                SubscriptionSelected, RecordOpenRequested)

L3  packages/Angular/Explorer/dashboards/src/WorkQueue/
    work-queue-dashboard.component.ts   extends BaseDashboard, @RegisterClass(BaseDashboard, 'WorkQueueDashboard')
    handles RecordOpenRequested → NavigationService (entity forms for topics/subscriptions/transports)
    query-param round-trip: ?section=&subscription=&condition=
```

### Surface (L3)

Chrome trio (`<mj-page-layout>` / `<mj-page-header>` / `<mj-page-body>`) with a `<mj-left-nav>` section rail:

| Section | Content | Header `[meta]` (signal only) | `[actions]` |
|---|---|---|---|
| **Overview** | `mj-wq-topology-overview`: topics grouped by transport, with subscription rows and stats strips; rows with DeadLettered>0 or BlockedKeys>0 sort first | status pill "N subscriptions need attention" (variant `warning`) when non-zero | Refresh |
| **Dead Letters** | subscription picker + `mj-wq-subscription-panel` in dead-letter mode | X-of-Y selected | Refresh · Replay selected · Discard selected (primary = Replay) |
| **Partitions** | panel in partitions mode, condition filter (`Blocked`, `AwaitingSequence`, `GapStalled`, `InFlight`) behind the one Filter popover | count of blocked keys (variant `danger`) | Refresh |
| **Bindings** | `WorkQueue.ValidateBindings` results per topic/transport | "N errors" pill | Re-validate |

- Refresh: manual, plus a 15 s auto-refresh while the tab is visible (paused when hidden). No realtime push
  in this spec.
- `NotifyLoadComplete()` is called after the first Overview stats load (or error).
- Styling uses design tokens only (`.claude/rules/design-tokens.md`); buttons use `mjButton`.

### Agent context & client tools (required by dashboards CLAUDE.md)

- **Context:** active section; per-section bounded (cap 25) lists: subscriptions needing attention (name,
  DeadLettered, BlockedKeys, OldestPendingAgeSeconds), selected subscription, filter state, and validation
  error count. Detail is published only once loaded, never as fabricated zeros.
- **Tools** (mode-scoped per section):
  - Read-only: `RefreshWorkQueue`, `SelectSubscription` (id or name, tolerant resolver), `FilterPartitions`,
    `OpenSubscriptionRecord`.
  - Mutating: `ReplayDeadLetters` and `DiscardDeadLetters` must **require user confirmation** in the UI and
    never auto-execute. They open the confirmation dialog pre-filled.

### Permissions

| Capability | Check |
|---|---|
| View dashboard + read operations | MJ Authorization `WorkQueue.Read` (new authorization metadata), enforced in each operation's `Authorize` hook (server) and used to hide the nav item |
| Replay / Discard / SkipSequence | `WorkQueue.Operate`, enforced in the operation's `Authorize` hook. UI disables actions without it. |
| Edit topology | normal entity permissions on the `MJ: Work Queue *` entities |

API-key callers are additionally gated by the operations' `RequiredScope` (`workqueue:read` /
`workqueue:operate`, 03 §8); interactive users are gated by the authorizations above. Each mutating operation
records its actor (`ResolvedByUserID` on Database/staged deliveries; `actorUserID` passed to cloud operators).

### Application placement

A nav item under the existing Admin application (metadata in `metadata/applications/`, declarative JSON with
`uuidgen` IDs per `metadata/CLAUDE.md`). A dedicated "Operations" application is out of scope.

## Interfaces / schema changes

- None to the operations themselves (they ship in Phase 1). Adds `Authorize(input, user)` checks for the new
  authorization metadata `WorkQueue.Read`, `WorkQueue.Operate` to the Phase 1 server subclasses.
- No table changes.

## Dependencies on Phase 1

- The `WorkQueue.*` remote operations and their `ITransportOperator` implementations (Database, AWS; Azure
  once 09a ships), `ValidateBindings` (plans 06 and 07).
- Generated entities for topology.

## Testing

| Tier | What |
|---|---|
| Unit (vitest) | L0 view-model helpers; agent-context builders and tolerant resolvers; L1 widgets rendered from object literals |
| Remote Ops | server subclasses against the DB transport with authorization denied/allowed |
| Playwright (`playwright-cli` skill) | seed a DB subscription with a dead-lettered `Ordered` head plus 3 waiting items → Partitions shows Blocked → Replay → key clears; Discard confirmation text; query-param deep link restores section + subscription |
| CI gates | `npm run check:ui` (tokens/buttons) |

## Work breakdown

| Item | Size |
|---|---|
| Authorizations + `Authorize` hooks on the Phase 1 operations | S |
| L1 widgets (5) + models | M |
| L2 composites (2) | M |
| L3 dashboard, routing, query params, NotifyLoadComplete | S |
| Agent context + tools | M |
| Metadata (app nav, authorizations) | S |
| Playwright scenarios | S |

## Open questions

1. Should the Overview offer a "publish test message" action for DB-transport topics (useful in dev, risky in prod; could be gated on an environment flag)?
2. Should CloudWatch / Azure Monitor deep links be generated from binding ARNs, or configured per transport?
3. Is a 15 s auto-refresh acceptable load for cloud stats calls (SQS `GetQueueAttributes` / Service Bus admin) with many subscriptions, or should stats be cached server-side for ~10 s?
