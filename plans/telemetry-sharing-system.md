# MJ Telemetry Sharing System ("Phone Home")

## Technical Architecture Document

**Version**: 0.1 — initial proposal for team review
**Date**: April 2026
**Status**: Proposal — not yet scheduled
**Branch**: `claude/telemetry-sharing-system-egbjx`

---

## Executive Summary

An **opt-in** system where MemberJunction install administrators can share operational metadata with the MJ project to inform performance improvements, default-model selection, agent design, memory-management heuristics, and roadmap prioritization. The system is generic: any first-party MJ service (AI Agents, AI Prompts, Actions, MJServer, Skip, future services) can register a telemetry provider and contribute metrics through a single pipeline.

**Privacy is the product.** The system makes hard guarantees:

- No conversation/prompt/response/action-input/action-output content — ever
- No user PII — no user IDs, names, emails, IPs
- No conversation IDs, message IDs, or any identifier that could correlate back to specific user activity
- Only metadata-class identifiers (Agent ID, Prompt ID, Model ID, Vendor ID, Action ID) plus counts, durations, token totals, ratings, and pre-defined enum classifications
- Source-org identification is **install-level only** (a per-install UUID minted at first run); the install's friendly name is never sent unless the admin explicitly opts in to that one specific field

**Two modes**, both separate opt-ins:

1. **Aggregated** (primary) — pre-rolled per-bucket summaries (e.g. daily counts, latency p50/p95/p99, token totals per agent/prompt/model)
2. **Raw events** (secondary, more prominent toggle) — per-event records using the **same metadata-only field allowlist**; not pre-rolled, so the cloud side can do its own slicing

**Trust model is enforced at CI/publish time, not runtime.** Providers are first-party MJ code. A schema-as-code DSL constrains what fields a provider can declare; a CI test walks every registered provider and fails the build if anything escapes the allowlist. Runtime validation is deterministic Zod/AJV schema-matching — no LLM calls, no heuristics.

**Deliverables:**

- `@memberjunction/telemetry` — provider registry, schema DSL, payload pipeline, transport, admin services
- v1 providers: `AIPrompts`, `AIAgents`
- Admin UX — install-time wizard + dashboard with per-category opt-in, raw-mode toggle, "preview next payload" tool, schema viewer, audit log
- Cloud endpoint — separate repo (or stubbed in v1 with a noop transport)
- CI gate — static analysis preventing unsafe fields from ever shipping in a provider

---

## Goals / Non-Goals

### Goals

- Generic, extensible provider framework — any MJ service drops in via `@RegisterClass`
- Defensible privacy story — the architecture, not just policy, prevents content/PII leakage
- Admin transparency — exhaustive schema viewer + per-category opt-in + "preview next payload"
- Aggregated mode is sufficient for the primary use cases (model/agent usage, performance, error rates, memory tuning)
- Raw mode is available for installs willing to share more, with the same field allowlist
- Self-hosted/air-gapped friendly — endpoint URL configurable, can be disabled or point at a customer-internal collector

### Non-Goals (v1)

- Third-party (non-MJ) telemetry providers — out of scope; framework refuses to ship payloads from unregistered/unaudited providers
- Real-time streaming — batched delivery is sufficient
- Cloud-side analytics product — this plan covers the client side and the receiver contract; analytics is a separate effort
- Replacing local observability (logs, traces, metrics) — telemetry sharing is for *MJ-the-project* to learn from installs, not for *the install* to observe itself
- Customer-facing benchmarking ("how do I compare?") — possible v3 feedback loop, not in scope now

---

## Privacy Guarantees

These are stated as guarantees the *architecture* makes, not just promises in policy text. Each guarantee maps to an enforcement mechanism.

| Guarantee | Enforcement |
|---|---|
| No free-text fields anywhere in a payload | Schema DSL has no `string` shape; CI test rejects any provider that tries to escape the DSL |
| No conversation/prompt/response/action content | Same — content has nowhere to live in a typed payload |
| No user-class identifiers (User ID, email, IP) | DSL `metadata_uuid` shape requires a `SafeEntityType`; `User`, `Conversation`, `ConversationDetail`, `AIAgentRun`, `AIPromptRun` are **not** in the allowlist |
| No correlation back to specific records | Raw events generate fresh per-payload `EventID` UUIDs; never echo the source `AIAgentRun.ID` / `AIPromptRun.ID` |
| Bucketed timestamps only | DSL `date_bucket` shape — no `kind: 'timestamp'` exists; coarsest meaningful granularity per use case (minute for raw, hour/day for aggregated) |
| Error details, not error messages | DSL `histogram` with bucket key `error_class` (a pre-defined enum) — no message text |
| Install identity is opaque | Install ID is a UUID minted at first run, not derived from any tenant attribute |
| Admin always sees what would ship | "Preview next payload" runs the actual collection pipeline and renders the JSON before any send |
| Defense in depth at the receiver | Cloud endpoint re-validates every payload against the declared schema; rejects mismatches |

### What "metadata-class" means concretely

The `SafeEntityType` allowlist contains only entities whose IDs identify *configuration* artifacts that exist independently of any user activity:

- `AIAgent`, `AIAgentType`, `AIPrompt`, `AIModel`, `AIVendor`, `AIConfiguration`, `Action`

Excluded by deliberate omission (and the omission is itself the guarantee):

- Anything user-related: `User`, `UserRole`, `UserView`, etc.
- Anything conversation-related: `Conversation`, `ConversationDetail`, `ConversationArtifact`
- Anything run-instance-related: `AIAgentRun`, `AIPromptRun`, `ActionExecutionLog`
- Anything record-data-related: arbitrary entity records, queries, reports

Adding an entity to `SafeEntityType` is itself a code review — it's a tiny, easily-audited change in one file, gated by the same review process as any other architectural change.

---

## Trust Model — CI-Time, Not Runtime

We deliberately do **not** use runtime LLM checking on telemetry payloads. Reasons:

- Providers are first-party MJ code we publish, so we can verify them statically once at build time rather than every request at runtime
- Static checks are deterministic, free, fast, and visible to reviewers
- LLM checks would add cost, latency, and a non-deterministic failure mode to every install's telemetry pipeline

### Three layers

**1. Schema-as-code DSL** (compile-time)

The DSL is the single source of truth for what a provider can declare. It has no `string`, no `unknown`, no `any` shape. The TypeScript type system itself rejects unsafe declarations at compile time. See the DSL section below for the full type.

**2. CI gate** (publish-time)

A unit test in `@memberjunction/telemetry`:

- Walks every `@RegisterClass(BaseTelemetryProvider, ...)`-registered provider
- Validates each provider's schema against the DSL allowlist
- Rejects forbidden field-name patterns (`Content`, `Text`, `Message`, `Body`, `*UserID`, `ConversationID`, `MessageID`, `Email`, `IP`, etc.) as defense-in-depth even though the DSL already prevents the underlying types
- Verifies every `metadata_uuid` field references an entity in `SafeEntityType`
- Verifies every `enum` shape's values are declared statically (no runtime injection)
- Fails the build (and blocks publish) on any violation

The CI gate is also runnable locally via `npm test` in the telemetry package, so a developer adding a provider gets immediate feedback without waiting for CI.

**3. Runtime validation** (per-payload)

Before any payload leaves the box:

- Zod (or AJV) schema generated from the same DSL declaration validates the actual values
- Mismatches are dropped with a local audit-log entry (never silently shipped, never crash the host service)
- The cloud endpoint re-validates with the same generated schema as defense in depth

### Third-party providers

If a non-MJ package ever registers a telemetry provider, the framework refuses to ship its payloads unless the admin has explicitly whitelisted that `ProviderKey` (out of scope for v1; design hook only — `IsFirstParty` flag derived from package name).

---

## The Schema DSL

The DSL is the single most important safety mechanism. It defines the closed set of field shapes a provider may declare. New shapes require a code change to `@memberjunction/telemetry` — visible to reviewers, gated by the same review as any other architectural change.

```typescript
// @memberjunction/telemetry/src/schema.ts

export type TelemetryFieldType =
  | { kind: 'count' }                                       // non-negative integer
  | { kind: 'duration_ms' }                                 // non-negative number
  | { kind: 'tokens' }                                      // non-negative integer
  | { kind: 'rating'; min: number; max: number }            // bounded numeric
  | { kind: 'percentile'; buckets: readonly number[] }      // e.g. [50, 95, 99]
  | { kind: 'enum'; values: readonly string[] }             // values declared at compile time
  | { kind: 'metadata_uuid'; entity: SafeEntityType }       // whitelisted entities only
  | { kind: 'histogram'; bucketKey: SafeBucketKey }         // pre-defined bucket keys
  | { kind: 'date_bucket'; granularity: 'minute' | 'hour' | 'day' }
  | { kind: 'boolean' }                                     // for simple feature-on/off counts
  | { kind: 'version_string' };                             // restricted to /^\d+\.\d+\.\d+/ via regex

// The whitelist — only metadata-class entities. Adding here is a deliberate code review.
export type SafeEntityType =
  | 'AIAgent' | 'AIAgentType'
  | 'AIPrompt'
  | 'AIModel' | 'AIVendor'
  | 'AIConfiguration'
  | 'Action';

// Pre-defined bucket keys — adding one is a code review.
export type SafeBucketKey =
  | 'error_class'
  | 'status_code'
  | 'model_family'
  | 'agent_type';

export type TelemetrySchema<T> = {
  readonly [K in keyof T]: TelemetryFieldType;
};
```

### Key design notes

- **There is no `string` shape.** Free text cannot exist in a payload. `enum` values must be declared at compile time; `version_string` is regex-constrained.
- **There is no `timestamp` shape.** Time only lives in `date_bucket`, which forces a granularity choice. The minimum granularity is one minute, which is intentionally too coarse for fingerprinting individual user sessions.
- **There is no generic `uuid` shape.** Only `metadata_uuid` with a `SafeEntityType` constraint, which prevents accidentally including a user/conversation/run ID.
- **`percentile` and `histogram` shapes** force aggregation thinking — providers describe distributions, not raw samples.
- **The DSL itself is data, not behavior.** The CI gate parses DSL declarations; the runtime validator generates Zod schemas from them. Same source of truth for both.

---

## Provider Interface

```typescript
// @memberjunction/telemetry/src/provider.ts

export interface ITelemetryProvider<TAggregated, TRaw = never> {
  readonly ProviderKey: string;                         // 'AIAgents', 'AIPrompts', 'Actions', ...
  readonly SchemaVersion: number;                       // bump on schema change
  readonly Categories: readonly TelemetryCategory[];    // for admin opt-in granularity
  readonly AggregatedSchema: TelemetrySchema<TAggregated>;
  readonly RawSchema?: TelemetrySchema<TRaw>;
  readonly SupportsRaw: boolean;
  readonly DescriptionForAdmin: string;                 // shown in the admin UI

  CollectAggregated(window: TimeWindow, ctx: TelemetryContext): Promise<TAggregated[]>;
  CollectRaw?(window: TimeWindow, ctx: TelemetryContext): Promise<TRaw[]>;
}

export type TelemetryCategory =
  | 'agent_usage' | 'agent_performance'
  | 'prompt_usage' | 'prompt_performance'
  | 'action_usage' | 'action_performance'
  | 'server_health' | 'server_errors'
  | 'model_economics';

export interface TimeWindow {
  startUtc: Date;
  endUtc: Date;
}

export interface TelemetryContext {
  installId: string;        // opaque per-install UUID
  schemaVersion: number;
  contextUser: UserInfo;    // for server-side BaseEntity / RunView calls only — NOT shipped
}
```

### Example: `AIAgentTelemetryProvider`

```typescript
@RegisterClass(BaseTelemetryProvider, 'AIAgents')
export class AIAgentTelemetryProvider extends BaseTelemetryProvider {
  ProviderKey = 'AIAgents';
  SchemaVersion = 1;
  Categories = ['agent_usage', 'agent_performance'] as const;
  SupportsRaw = true;
  DescriptionForAdmin =
    'Per-agent run counts, success rates, latency percentiles, token totals, ' +
    'and average user ratings. No conversation content, no user IDs.';

  AggregatedSchema = TelemetrySchema.define({
    AgentID:       { kind: 'metadata_uuid', entity: 'AIAgent' },
    AgentTypeID:   { kind: 'metadata_uuid', entity: 'AIAgentType' },
    DayUTC:        { kind: 'date_bucket', granularity: 'day' },
    RunCount:      { kind: 'count' },
    SuccessCount:  { kind: 'count' },
    FailureCount:  { kind: 'count' },
    LatencyP50Ms:  { kind: 'duration_ms' },
    LatencyP95Ms:  { kind: 'duration_ms' },
    LatencyP99Ms:  { kind: 'duration_ms' },
    InputTokens:   { kind: 'tokens' },
    OutputTokens:  { kind: 'tokens' },
    AverageRating: { kind: 'rating', min: 1, max: 5 },
    ErrorsByClass: { kind: 'histogram', bucketKey: 'error_class' },
  });

  RawSchema = TelemetrySchema.define({
    EventID:         { kind: 'metadata_uuid', entity: 'AIAgent' }, // freshly minted per payload
    AgentID:         { kind: 'metadata_uuid', entity: 'AIAgent' },
    AgentTypeID:     { kind: 'metadata_uuid', entity: 'AIAgentType' },
    StartedAtBucket: { kind: 'date_bucket', granularity: 'minute' },
    LatencyMs:       { kind: 'duration_ms' },
    InputTokens:     { kind: 'tokens' },
    OutputTokens:    { kind: 'tokens' },
    Status:          { kind: 'enum', values: ['success', 'failure', 'timeout'] as const },
    ErrorClass:      { kind: 'enum', values: ERROR_CLASSES },
    Rating:          { kind: 'rating', min: 1, max: 5 },
  });

  async CollectAggregated(window, ctx) {
    // SQL rollup against MJ: AI Agent Runs filtered to [window.startUtc, window.endUtc)
    // Returns one row per (AgentID, AgentTypeID, DayUTC).
  }

  async CollectRaw(window, ctx) {
    // Per-run metadata projection; never reads conversation/message content.
    // EventID is generated fresh per payload — NOT echoed from AIAgentRun.ID.
  }
}
```

Adding a new provider for `Actions`, `MJServer`, or anything else is just dropping in a registered class — same pattern as Actions, entity subclasses, and resource components elsewhere in MJ. No central code edits required.

---

## Aggregated Mode

**Default mode** when an admin opts into a category. The provider returns pre-rolled summary rows for the time window. Each row is keyed by a tuple of metadata IDs plus a `date_bucket`.

### Characteristics

- Small payload size — bounded by `(metadata-ID combinations) × (time buckets)`, not by run count
- Privacy-friendly — distributions, not samples
- Sufficient for: model usage rankings, agent latency comparisons, error-class trending, token-cost analysis, rating-by-model insights, memory-tuning signal
- Default cadence: daily roll-up, hourly send (sends accumulated unsent buckets each cycle)

### Example payload row (AI Agents, aggregated)

```json
{
  "AgentID": "8a3f...e2c1",
  "AgentTypeID": "11b4...09aa",
  "DayUTC": "2026-04-27",
  "RunCount": 142,
  "SuccessCount": 138,
  "FailureCount": 4,
  "LatencyP50Ms": 2410,
  "LatencyP95Ms": 8120,
  "LatencyP99Ms": 14300,
  "InputTokens": 487211,
  "OutputTokens": 92140,
  "AverageRating": 4.3,
  "ErrorsByClass": { "model_timeout": 2, "tool_validation": 1, "rate_limit": 1 }
}
```

No user IDs. No conversation IDs. No prompt text. No response text. No error messages — only error *classes* from a pre-defined enum.

---

## Raw Events Mode

**Secondary, separately-toggled mode.** Raw mode is *not* "send everything." It uses the **exact same metadata-only field allowlist** as aggregated mode — the only difference is rows are not pre-rolled, so the cloud side can do its own grouping and analysis.

### What raw exposes that aggregated doesn't

- Per-event timing at minute granularity (vs. day/hour buckets)
- Per-event correlation between metadata IDs (e.g. "this run used Agent X with Model Y on Action Z")

### What raw still does NOT expose

- Actual `AIAgentRun.ID` / `AIPromptRun.ID` — `EventID` is freshly minted per payload, never echoed
- User IDs, conversation IDs, message IDs — not in `SafeEntityType`, so the schema cannot reference them
- Any text — content, prompts, responses, parameter values, error messages
- Sub-minute timing — the DSL minimum granularity is one minute

### Privacy framing for the admin UX

The raw-mode toggle copy will say something like:

> **Share individual event metadata.** Same fields as aggregated mode — no conversation content, no user IDs, no run IDs that link back to specific records, no error messages. The only difference: events ship un-rolled so MJ engineering can do their own grouping. Recommended only if you're comfortable with the install's metadata-ID combinations being visible per-event.

### Raw event ID strategy

Every raw payload row carries a freshly-minted `EventID` UUID generated at collection time and discarded after send. This means:

- The cloud database cannot be cross-referenced back to the install's `AIAgentRun` / `AIPromptRun` records, even if it leaked
- Admins can re-send an entire day's batch (e.g. after a network failure) without creating duplicate cloud-side records *for the same source run* — the cloud uses `(install_id, EventID)` as its dedupe key, and the install's `OutboundQueue` retains the same `EventID` until the row is acknowledged

### Raw-mode opt-in granularity

**Recommended**: per-provider raw opt-in. An admin can enable raw for `AIAgents` (the most useful for memory-tuning insight) while leaving `AIPrompts` aggregated-only. Implementation cost is small and it gives admins a meaningful gradient. (See open questions — flagging this for confirmation.)

---

## Install Identity

A new `__mj.TelemetryConfig` table (single-row by convention) holds:

| Column | Type | Purpose |
|---|---|---|
| `InstallID` | `UNIQUEIDENTIFIER` | Minted once at first run; opaque, never derived from any tenant attribute |
| `FriendlyLabel` | `NVARCHAR(200)` NULL | Optional admin-set label (e.g. "Acme prod"); used only in the local admin UI |
| `ShareFriendlyLabel` | `BIT` | If true, ship the label with payloads; default false |
| `SigningKey` | `VARBINARY(64)` | Per-install HMAC key for payload authentication |
| `Enabled` | `BIT` | Global kill switch; default false |
| `RawModeEnabled` | `BIT` | Secondary opt-in; default false |
| `EnabledCategoriesJson` | `NVARCHAR(MAX)` | JSON array of `TelemetryCategory` keys |
| `EnabledRawProvidersJson` | `NVARCHAR(MAX)` | JSON array of `ProviderKey`s opted into raw |
| `EndpointURL` | `NVARCHAR(500)` | Configurable; defaults to MJ cloud endpoint |
| `BatchCadenceMinutes` | `INT` | Default 60 |
| `LastSentAt` | `DATETIMEOFFSET` NULL | For per-provider watermarking, see also `__mj.TelemetryWatermark` |

A separate `__mj.TelemetryWatermark` table tracks per-provider `(ProviderKey, Mode, LastBucketSentUtc)` so a provider's collection is idempotent and resumable.

A separate `__mj.TelemetryOutboundQueue` table holds payloads pending ACK from the cloud, with retry counters and dead-letter handling.

A separate `__mj.TelemetryAuditLog` table retains the last N sent payload manifests (manifest only — payload sizes, checksums, send timestamps, provider keys, modes — not the payload bodies, which are large and already in the queue table until ACK).

> **Open question**: should we store this as one table or split? Leaning toward separate tables because their lifecycles, write rates, and access patterns are different (config rarely changes, watermark updates per send, queue is high-churn, audit log is append-only).

---

## Admin UX

Three pieces, all in MJExplorer.

### 1. Install-time wizard card

After initial DB setup, a card appears asking "Help improve MJ?". Default state: everything off. Shows:

- One-line description per category (3–6 categories)
- Two-step opt-in for raw mode: a separate "Advanced" section with stronger copy
- Link to the schema viewer ("See exactly what would be sent")
- "Skip for now" option that leaves everything off but doesn't dismiss the wizard permanently — admin can revisit from settings

Decision is stored in `__mj.TelemetryConfig`. Can be changed at any time.

### 2. Telemetry dashboard (new admin page)

Built as a `BaseDashboard` subclass, registered as a resource component on the admin/settings application:

- **Category toggles** — checkboxes for each `TelemetryCategory`, grouped by provider
- **Raw mode panel** — separate section with prominent copy; per-provider raw opt-in if we go that direction
- **Preview next payload** button — runs `CollectAggregated` (and `CollectRaw` if enabled) for the current open window and renders the JSON in a syntax-highlighted view; nothing is shipped
- **Audit log** — table of last N sent payload manifests with timestamps, sizes, provider keys, modes, ACK status
- **Endpoint URL** field with the default MJ cloud URL; can be cleared to disable, or pointed at a self-hosted collector
- **Friendly label** field with the "share label" toggle
- **Global kill switch** — top-of-page toggle, immediate effect
- **Send now** button for ad-hoc batch send

### 3. Schema viewer

Auto-rendered from the DSL declarations of every registered provider. This is the **definitive** "what could ever be sent" view. For each provider:

- Provider key, schema version, supported modes, categories
- Per-field name, kind, and constraints
- For `enum` fields, the full enum value list
- For `metadata_uuid` fields, which `SafeEntityType` it references
- Provider's `DescriptionForAdmin` text

This is the page an admin (or their security team) reviews before opting in. It's generated, not hand-written, so it cannot drift from what providers actually emit.

---

## Transport

- Batched POST to `${EndpointURL}/v1/telemetry/ingest`
- Body: `{ installId, schemaVersion, providerKey, mode: 'aggregated' | 'raw', payloads: [...], generatedAt, manifestId }`
- HMAC-SHA256 signature header keyed by the install's `SigningKey`
- Hourly cadence (configurable); also triggered on-demand from the admin dashboard
- Retry with exponential backoff (per the global git-operation pattern in `CLAUDE.md` — 2s, 4s, 8s, 16s)
- On persistent failure, payloads stay in `__mj.TelemetryOutboundQueue` with a retry counter; after N retries they move to a dead-letter state visible in the dashboard
- Cloud responds with `{ accepted: [manifestId], rejected: [{manifestId, reason}] }` so the install knows which to clear from the queue
- Endpoint URL configurable per install, including blank (= disabled) for air-gapped environments

### Self-hosted collectors

Customers concerned about data egress can point `EndpointURL` at an internal collector that implements the same contract. We publish the OpenAPI spec for `/v1/telemetry/ingest` alongside the schema viewer, so a customer can build a compliant collector for compliance/audit purposes (e.g. ship to their own warehouse, never to MJ).

---

## Cloud Endpoint

Lean spec — full design is a separate effort. The contract is what matters for v1 client work.

### Recommended deployment

- **Separate repository** — different security boundary, different deployment cadence, different review process
- Stateless ingest service in front of a columnar warehouse
- Auth: install ID + HMAC signature; no shared secret beyond per-install signing keys
- Re-validates every payload against the declared schema (defense in depth — never trust the client even though we wrote it)
- Stores in a columnar warehouse (BigQuery / Snowflake / ClickHouse) keyed by `(install_id, provider_key, schema_version, mode, time_bucket)`
- Cloud-side retention TBD (open question); leaning toward 90-day raw, 2-year aggregated

### Contract

```
POST /v1/telemetry/ingest
Headers:
  X-MJ-Install-ID: <uuid>
  X-MJ-Signature: <hex hmac-sha256>
  Content-Type: application/json

Body:
{
  "installId": "<uuid>",
  "schemaVersion": 1,
  "providerKey": "AIAgents",
  "mode": "aggregated" | "raw",
  "generatedAt": "<iso8601>",
  "manifestId": "<uuid>",
  "payloads": [ { ... }, { ... } ]
}

Response:
{
  "accepted": ["<manifestId>", ...],
  "rejected": [{ "manifestId": "<uuid>", "reason": "schema_mismatch" | "auth_failed" | "rate_limit" }]
}
```

### v1 stub

For the v1 client work, the cloud endpoint can be a **noop transport** that drops payloads to a local file or just logs the manifest IDs. This unblocks shipping the client side independently of the cloud build-out and gives us a way to test end-to-end locally. The real cloud receiver lands in a separate repo on its own timeline.

---

## Data Model Summary

Local tables (added in a single migration):

| Table | Purpose |
|---|---|
| `__mj.TelemetryConfig` | Single-row install config: opt-in state, signing key, endpoint URL |
| `__mj.TelemetryWatermark` | Per-`(ProviderKey, Mode)` last-bucket-sent for idempotent resume |
| `__mj.TelemetryOutboundQueue` | Pending payloads awaiting ACK; retry counters; dead-letter |
| `__mj.TelemetryAuditLog` | Append-only manifest history (no payload bodies) |

These are exposed through standard MJ entities with full CodeGen — admins can `RunView` the audit log and queue from the admin UI like any other entity.

> **Note**: All `__mj.*` system tables here exist alongside the existing core schema. A migration in `migrations/v5/` adds them with the standard `${flyway:defaultSchema}` placeholder pattern. CodeGen handles `__mj_CreatedAt` / `__mj_UpdatedAt` and FK indexes.

---

## Phasing

### v1 — Foundation

- `@memberjunction/telemetry` package: schema DSL, base provider class, registry, runtime validator (Zod), CI gate (unit test that walks all registered providers)
- Migration adding `__mj.TelemetryConfig`, `__mj.TelemetryWatermark`, `__mj.TelemetryOutboundQueue`, `__mj.TelemetryAuditLog`
- Two providers: `AIPromptTelemetryProvider`, `AIAgentTelemetryProvider`
- Aggregated mode only
- Admin UX: install-time wizard card, telemetry dashboard with category toggles, "preview next payload", audit log, schema viewer
- Transport: HMAC-signed batched POST, retry with backoff, queue/dead-letter handling
- Cloud endpoint: noop/stub transport for local testing; real receiver tracked separately

### v2 — More providers + raw mode

- Additional providers: `ActionTelemetryProvider`, `MJServerTelemetryProvider` (request rates, GraphQL latencies, error classes), `SkipTelemetryProvider`
- Raw events mode (per-provider opt-in)
- Cloud receiver in a separate repo, replacing the v1 stub

### v3 — Feedback loop

- "How your install compares to the median" view inside the admin dashboard — gives admins something back for participating
- Admin-side analytics view ("here's what you've shared in the last 30 days")
- Cohort-aware feedback (e.g. "installs running similar workload show better latency with model X")

---

## Open Questions

These need team discussion before implementation.

1. **Cloud endpoint location** — separate repo (recommended), new package in this monorepo, or cloud-only? Affects v1 sequencing. *My lean*: separate repo, with a noop stub in v1 client work so the two efforts decouple cleanly.
2. **Storage layout** — single `__mj.TelemetryConfig` table vs. four separate tables (config, watermark, queue, audit log). *My lean*: four separate tables, different lifecycles.
3. **Raw mode granularity** — per-provider opt-in vs. all-or-nothing. *My lean*: per-provider; small implementation cost, meaningful gradient for admins.
4. **Default batch cadence** — hourly, daily, or admin-only. *My lean*: hourly default, admin-configurable.
5. **Cloud-side retention** — 90 days raw / 2 years aggregated? Needs alignment with whatever data-retention policy applies on the MJ-cloud side.
6. **Friendly label policy** — should the field even exist if 99% of admins won't share it? *My lean*: yes, because admins need it locally to identify their install in the dashboard, separate from whether to ship it.
7. **Cadence of CI gate runs** — unit test on every PR (recommended) vs. a separate publish-time check. *My lean*: both — unit test on every PR for fast feedback, plus a release-time check that fails the publish if any provider drifted.
8. **Skip telemetry** — Skip is a remote service; does the existing Skip ↔ MJAPI callback channel carry telemetry, or does Skip ship its own telemetry directly to the cloud? *Defer to v2.*
9. **PostgreSQL parity** — all migrations must run on both SQL Server and PostgreSQL. Confirm `VARBINARY(64)` ↔ `BYTEA` and other type mappings are clean for the new tables.
10. **OAuth/MCP scope interactions** — does the active 601-mcp-oauth work introduce any auth provider that should be visible to telemetry (as a count, not a token)? *Defer; check during v1 implementation.*

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **A provider slips an unsafe field past review** | DSL has no `string` shape; CI gate fails the build; runtime validator drops mismatched payloads; cloud receiver re-validates. Four independent layers. |
| **Install ID becomes a fingerprint that correlates to a tenant** | Install ID is opaque, never derived from any tenant attribute, and is not joined with any external identity. Friendly label is admin-set and off by default. |
| **Aggregation hides a high-cardinality leak** (e.g. one user's behavior dominates a small install's metrics) | Aggregations are bucketed by metadata IDs — there's no cardinality explosion possible because user/conversation/run IDs aren't in the schema. Worst case: small installs reveal that *the install* uses Agent X often, which is an install-level fact. |
| **Admin opts in, then forgets and is surprised later** | Telemetry dashboard is a first-class admin page, not buried; "preview next payload" makes the actual data visible at any time; audit log shows recent sends; install-level kill switch on the dashboard's main view. |
| **Cloud endpoint gets compromised** | Per-install HMAC keys mean a leak doesn't enable forging payloads from other installs. Cloud-side schema validation prevents injection of unsafe data. No content / no PII means a compromise leaks metadata only. |
| **Raw mode enables timing-correlation attacks** (e.g. "this install ran X at the same time as a public event") | Minute-granularity timestamps, no second/millisecond resolution; aggregated is the default; raw mode is a deliberate, separately-toggled choice with explicit copy. |
| **Self-hosted customers feel "watched"** | Endpoint URL is configurable (including blank = disabled); OpenAPI for the receiver published so customers can self-host a compliant collector and ship to their own warehouse. |
| **Schema-version drift between client and cloud** | `schemaVersion` is included in every payload; cloud receiver supports the last N versions; mismatched payloads are rejected, not silently coerced. |
| **Telemetry collection itself becomes a performance issue on the install** | Collection runs in a background job, not in the request path; SQL aggregations are watermark-bounded; collection failures are non-fatal and logged. |

---

## Summary

This plan describes a generic, opt-in, privacy-first telemetry sharing system for MemberJunction. The architecture's central design choice is to enforce privacy guarantees through a constrained schema DSL and a CI-time gate, rather than relying on policy or runtime LLM checks. Two opt-in modes (aggregated and raw) are both bound by the same metadata-only field allowlist, so adding raw mode does not relax privacy guarantees — it just leaves rows un-rolled.

The system is generic so any current or future MJ service can register a provider with no central code edits, and self-hosted-friendly so customers can either disable telemetry, point at an internal collector, or contribute to the MJ project's improvement feedback loop.

Next step is team discussion of the open questions, after which we can scope and schedule v1.

