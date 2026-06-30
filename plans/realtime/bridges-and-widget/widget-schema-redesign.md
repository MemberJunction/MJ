# Widget + Returning-Visitor — schema redesign (reuse existing columns; rename entity)

**Part of:** [Agent Bridges & Public Widget program](./README.md)
**Status:** planned (pre-merge revision of the committed widget + returning-visitor schema)

## Context

The public web-widget hardening work is being folded into a single consolidated migration. A schema
review of the committed returning-visitor + widget migration
(`V202606291200__…Widget_And_Returning_Visitor_Memory.sql`) surfaced two issues to fix before it merges:

1. **Redundant columns.** The migration added a *second* polymorphic `(entity, record)` pair to
   `Conversation` (`ResolvedEntityID` / `ResolvedRecordID`) that duplicates the long-standing
   `LinkedEntityID` / `LinkedRecordID` pair.
2. **Weak entity name.** `WidgetInstance` is generic and breaks MJ's domain-prefix naming convention
   (`ConversationX` → `MJ: Conversation Xs`, `AIAgentX` → `MJ: AI Agent Xs`).

MJ schema quality is treated as critical — no DB bloat, naming consistent with convention. Ground truth
for every column decision is `packages/MJCoreEntities/src/generated/entity_subclasses.ts` (search
`class MJ<Name>Entity ` with a trailing space).

## Decisions

1. **Rename** `WidgetInstance` → **`ConversationWidgetInstance`** — entity `MJ: Conversation Widget
   Instances`, class `MJConversationWidgetInstanceEntity`, table `ConversationWidgetInstance`, view
   `vwConversationWidgetInstances`. Aligns with the domain-prefix convention.

2. **Conversation** — **drop** `ResolvedEntityID` + `ResolvedRecordID` (and `FK_Conversation_ResolvedEntity`);
   store the resolved counterparty identity in the existing **`LinkedEntityID` / `LinkedRecordID`** pair
   (the generic polymorphic "linked record" pair already used elsewhere). **Keep**:
   - `VisitorKey` — the durable, opaque, cross-session cookie anchor (the *same* value across all of a
     visitor's conversations). It is **not** redundant with `ExternalID`: `ExternalID` is a fresh
     *per-session* value already used as the per-session RLS scope discriminator, so it cannot also carry
     a durable cross-session anchor.
   - `LastConversationID` — the self-FK conversation chain the anonymous-visitor memory injection
     relies on. Named to mirror the existing `AIAgentSession.LastSessionID` convention (shorter,
     consistent) rather than the original `PreviousConversationID`.

3. **AIAgentSession** — **add** `LinkedEntityID` + `LinkedRecordID` (+ FK to `Entity` +
   `CK_AIAgentSession_LinkBinding` both-or-neither check), mirroring the polymorphic pair on `Conversation`
   so a session can carry its counterparty identity directly.

4. **AIAgentNote** — **no change.** The returning-visitor recap already scopes through the existing
   `PrimaryScopeEntityID` / `PrimaryScopeRecordID` (with `SecondaryScopes` left null) and the existing
   memory-injection scope filter. No new note columns are needed.

5. Carry forward the already-designed widget-hardening schema: `ConversationWidgetInstance.EnabledChannels`
   + `HostPublicKey`, and the `Widget Guest: Own Agent Runs` RLS filter.

## Schema delta (single consolidated migration — hand-DDL)

- `CREATE TABLE ConversationWidgetInstance` (renamed) with all current columns **plus**
  `EnabledChannels NVARCHAR(MAX) NULL` and `HostPublicKey NVARCHAR(MAX) NULL`; rename all
  `*_WidgetInstance` constraints → `*_ConversationWidgetInstance`.
- `ALTER TABLE Conversation ADD VisitorKey NVARCHAR(255) NULL, LastConversationID UNIQUEIDENTIFIER NULL`
  (+ `FK_Conversation_LastConversation`). **No** `ResolvedEntityID` / `ResolvedRecordID`. The resolved
  identity reuses the existing `LinkedEntityID` / `LinkedRecordID` (already present from baseline).
- `ALTER TABLE AIAgentSession ADD LinkedEntityID UNIQUEIDENTIFIER NULL, LinkedRecordID NVARCHAR(500) NULL`
  (+ `FK_AIAgentSession_LinkedEntity` + `CK_AIAgentSession_LinkBinding`).
- RLS filters: `Widget Guest: Widget-Pinned Agents` filter text references `vwWidgetInstances` →
  `vwConversationWidgetInstances`; add `Widget Guest: Own Agent Runs`.
- Extended properties for every new/renamed column.

## Code changes (swap `Resolved*` → `Linked*`; entity rename; session stamping)

Pattern (per file: replace `ResolvedEntityID` / `ResolvedRecordID` reads & writes with
`LinkedEntityID` / `LinkedRecordID`; replace `MJWidgetInstanceEntity` / `'MJ: Widget Instances'` with the
renamed entity):

- `packages/MJServer/src/agentSessions/ReturningVisitorRecap.ts` — recap scope resolver (resolved branch).
- `packages/AI/Agents/src/AgentRunner.ts` — returning-visitor memory-scope derivation.
- `packages/MJServer/src/widget/visitorIdentity.ts` — identity merge (write/compare the linked pair).
- `packages/MJServer/src/agentSessions/SessionManager.ts` — stamp `Conversation.LinkedEntityID/RecordID`
  and the new `AIAgentSession.LinkedEntityID/RecordID` from the visitor context.
- `packages/MJServer/src/context.ts` + `packages/MJCore/src/generic/securityInfo.ts` — visitor-context
  field names + token claim names.
- `packages/MJServer/src/widget/{widgetCore,WidgetSessionService,widgetGuestElevation}.ts` — entity-name
  constant + entity type.
- `packages/Web/Widget/src/{types.ts, transport/runtime-widget-transport.ts, session/widget-session-client.ts}`
  — `resolvedEntityId/recordId` → `linkedEntityId/recordId`.
- Metadata: rename `metadata/widget-instances/` → `metadata/conversation-widget-instances/`; update its
  `.mj-sync.json` entity name + the seed.

## Execution sequence

1. Rewrite the single consolidated migration's hand-DDL to the schema delta above (one migration file;
   no separately-checked-in CodeGen output remaining before regeneration).
2. Apply against a clean database (`mj migrate`).
3. **Seed all metadata (`mj sync push --dir=metadata`) BEFORE running CodeGen** — CodeGen reads
   metadata-driven definitions, so the full seed must precede it.
4. Run CodeGen (`mj codegen`) to regenerate the entity classes, forms, server artifacts, and registrations
   for the renamed entity + the new `Conversation` / `AIAgentSession` columns.
5. Fold the emitted CodeGen migration output back into the single consolidated migration (separated by
   whitespace), leaving exactly one migration file for this work.
6. Rebuild the affected packages and fix the renamed-entity / `Linked*` references until clean.

## Verification

- Affected packages build clean; the Web/Widget and MJServer widget/elevation/host-identity/session test
  suites pass.
- Schema sanity: `ConversationWidgetInstance` table + view exist; `Conversation` has `VisitorKey` +
  `LastConversationID` and **no** `ResolvedEntityID/RecordID`; `AIAgentSession` has
  `LinkedEntityID/LinkedRecordID`; the `Widget Guest: Own Agent Runs` RLS filter is present.
- Generated-code diff is scoped to the widget / session / conversation changes only (no unrelated churn).
- Exactly one migration file for this work; no stray CodeGen-run file left checked in.
