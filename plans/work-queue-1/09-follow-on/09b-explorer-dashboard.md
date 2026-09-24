# 09b — Explorer Operator Dashboard — Fast Follow

## Summary

An MJ Explorer dashboard for operating the work queue. It gives the same capabilities as the Phase 1
`mj queue` CLI:
- topology overview with live stats
- dead-letter browser with replay/discard
- blocked `Ordered` partitions (a dead-lettered head halting its key), cleared by replay or discard
- subscription filter editing with the generic `mj-filter-builder`
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
subscriptions, transports) comes from **`WorkQueueEngineBase`** in the browser-safe
`@memberjunction/work-queue-base` package (03 §0, §11; R16) — the metadata tier that exists for exactly this:
`WorkQueueEngineBase.Instance.Config(false, user, this.ProviderToUse)`, then its cached `Transports`, `Topics`,
`Subscriptions`, `SubscriptionsForTopic` and `ValidateTopologyRows`. No ad-hoc `RunView` over the topology entities,
and no operation is needed for it. The dashboard never imports `@memberjunction/work-queue-engine` (server-only).

| Remote Operation key (03 §8) | Used by | Side effect |
|---|---|---|
| `WorkQueue.GetSubscriptionStats` | Overview, stats strips | none |
| `WorkQueue.ListDeadLetters` | Dead Letters | none |
| `WorkQueue.ReplayDeadLetter` | Dead Letters (replay) | yes |
| `WorkQueue.DiscardDelivery` | Dead Letters (discard); cancel a pending item where `CancelPending`, or a running one where `CancelInFlight` (03 §7, F2 — the result carries `cancelRequested: true`; the handler notices within one heartbeat, at most 30 s, and acknowledges, so the UI shows "cancelling…" until the row turns `Discarded`; if the worker is dead the row is discarded when its lease expires) | yes |
| `WorkQueue.ListPartitions` | Partitions | none |
| `WorkQueue.GetBacklog` | Overview (claimable / in-flight, the autoscaler metric; shows "1000+" when `capped`) | none |
| `WorkQueue.ValidateBindings` | Bindings | none |

These are the seven Phase 1 operations. There is no sequence-skip operation: explicit sequences were cut in
Revision 4 (11 §1, S1).

Phase 1 operations are single-item; bulk replay/discard loops client-side with per-item results (a batch variant
is a candidate addition if loops prove slow). Every operation can answer `supported: false` (e.g. `ListPartitions`
or an in-flight cancel on an AWS subscription); the UI hides the corresponding section for that subscription rather
than showing an error. AWS dead-letter lists are best-effort (a bounded DLQ scan, no cursor — 03 §5.2), and the UI
says so. `Discard` on a blocking `Ordered` head shows an explicit confirmation naming how many waiting
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
    mj-wq-partition-table      (PartitionStateRecord[] in; ViewBlockingRequested out)
    mj-wq-envelope-viewer      (WorkMessage in; attributes + JSON payload/PayloadRef, copy buttons)
    mj-wq-binding-issues-list  (BindingValidationIssue[] in)
    mj-wq-subscription-filter  (wraps the generic mj-filter-builder from @memberjunction/ng-filter-builder;
                                CompositeFilterDescriptor in/out — see "Filter editing" below)

L2  same package, composites extending BaseAngularComponent (ProviderToUse only)
    mj-wq-subscription-panel   (input: SubscriptionID or loaded entity; owns GetSubscriptionStats/ListDeadLetters/
                                ListPartitions/ReplayDeadLetter/DiscardDelivery calls; emits RecordOpenRequested)
    mj-wq-topology-overview    (reads topics+subscriptions from WorkQueueEngineBase, one GetSubscriptionStats call; emits
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
| **Partitions** | panel in partitions mode, condition filter (`Blocked`, `InFlight` — 03 §5.2's `PartitionCondition`) behind the one Filter popover | count of blocked keys (variant `danger`) | Refresh |
| **Bindings** | `WorkQueue.ValidateBindings` results per topic/transport | "N errors" pill | Re-validate |

- Refresh: manual, plus a 15 s auto-refresh while the tab is visible (paused when hidden). No realtime push
  in this spec.
- `NotifyLoadComplete()` is called after the first Overview stats load (or error).
- Styling uses design tokens only (`.claude/rules/design-tokens.md`); buttons use `mjButton`.

### Filter editing (R15)

A subscription's `Filter` is MJ's standard `CompositeFilterDescriptor` JSON, so the dashboard edits it with the
existing generic builder rather than a new control (03 §4.3):

- `fields: FilterFieldInfo[]` = the topic's known attribute names (type `string`), gathered from the topic's other
  subscriptions' filters plus free entry — attributes are free-form, so the list is a convenience, not a schema.
- `config`: `allowGroups` limited to a single-field OR of `eq`; the operator list restricted to the target
  transport's `FilterSupport.Operators` (`eq`, `neq`, `startswith`, `isnull`, `isnotnull`); depth ≤ 2.
- The builder can still produce shapes the queue rejects (a field constrained twice). Before saving, the widget
  calls `WorkQueueEngineBase.ParseFilter` and shows the returned reason; the server re-validates on save regardless.
- A note beside the builder states that matching is **case-sensitive** — the one deliberate divergence from MJ's
  usual filter comparison.

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

Phase 1 already authorizes every operation (03 §8, F7) — the dashboard adds no new authorization model, it
mirrors the existing one in the UI:

| Capability | Check (enforced server-side in each operation's `Authorize`) | UI |
|---|---|---|
| View dashboard + read operations | interactive user: **Read** on `MJ: Work Queue Deliveries` (restricted to administrative roles, because payloads may hold PII) | nav item hidden without it |
| Replay / Discard | interactive user: **Update** on `MJ: Work Queue Subscriptions` | actions disabled without it |
| Edit topology and filters | normal entity permissions on the `MJ: Work Queue *` entities | standard forms |

API-key callers are gated by the operations' `RequiredScope` (`workqueue:read` / `workqueue:operate`, with the
subscription name as the resource). Each mutating operation records its actor (`ResolvedByUserID` on Database
deliveries; `actorUserID` passed to cloud operators).

### Application placement

A nav item under the existing Admin application (metadata in `metadata/applications/`, declarative JSON with
`uuidgen` IDs per `metadata/CLAUDE.md`). A dedicated "Operations" application is out of scope.

## Interfaces / schema changes

- None to the operations or their authorization (both ship in Phase 1, 03 §8).
- New Angular dependency for the widgets package: `@memberjunction/work-queue-base` (browser-safe) and
  `@memberjunction/ng-filter-builder`.
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
| Filter editor widget over `mj-filter-builder` + `ParseFilter` pre-validation | S |
| L1 widgets (6) + models | M |
| L2 composites (2) | M |
| L3 dashboard, routing, query params, NotifyLoadComplete | S |
| Agent context + tools | M |
| Metadata (app nav) | S |
| Playwright scenarios | S |

## Open questions

1. Should the Overview offer a "publish test message" action for DB-transport topics (useful in dev, risky in prod; could be gated on an environment flag)?
2. Should CloudWatch / Azure Monitor deep links be generated from binding ARNs, or configured per transport?
3. Is a 15 s auto-refresh acceptable load for cloud stats calls (SQS `GetQueueAttributes` / Service Bus admin) with many subscriptions, or should stats be cached server-side for ~10 s?
