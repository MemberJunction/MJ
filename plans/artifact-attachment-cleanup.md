# Artifact / Attachment Cleanup — Finish the Unification

**Status:** plan, not yet implemented
**Predecessor:** [`artifact-attachment-unification.md`](./artifact-attachment-unification.md) — the design doc
**Predecessor PR:** [#2569 "implement: artifact / attachment unification"](https://github.com/MemberJunction/MJ/pull/2569) (merged 2026-05-20)
**Triggering signal:** MJAPI console (2026-05-25) is logging deprecation warnings on every run.

## TL;DR

PR #2569 deprecated `MJ: Conversation Detail Attachments` (the entity) and four fields on adjacent entities, but **left every runtime code path that uses them in place**. The deprecation marker was metadata-only. The framework's standard deprecation behavior now produces a console warning each time those paths fire, which on MJAPI is "every agent run + every conversation load."

This plan finishes the migration: remove (or quarantine) the remaining runtime users so the attachments path is genuinely retired and the warnings stop. It is **not** a redesign — the architecture in `artifact-attachment-unification.md` stands. The work is purely "complete what was merged."

## What was actually deprecated in #2569

Recorded in [`metadata/entities/.conversation-detail-attachments-deprecation.json`](../metadata/entities/.conversation-detail-attachments-deprecation.json):

| Item | Kind | Notes |
|---|---|---|
| `MJ: Conversation Detail Attachments` | Entity | Status set to `Deprecated`. Table, generated classes, GraphQL types, procs all still functional. |
| `MJ: AI Agent Runs.AgentState` | Field | Marked deprecated. |
| `MJ: Conversation Details.ArtifactID` | Field | Marked deprecated. |
| `MJ: Conversation Details.ArtifactVersionID` | Field | Marked deprecated. |
| `MJ: Conversation Details.SuggestedResponses` | Field | Marked deprecated. |

These are exactly what MJAPI is now warning about. The warning text:

```
📦 DEPRECATED ENTITIES:
  • "MJ: Conversation Detail Attachments" (called from: PreRunViews)

📋 DEPRECATED ENTITY FIELDS:
  ├─ "MJ: AI Agent Runs"
  │  └─ AgentState (called from: EntityField.Value setter)
  └─ "MJ: Conversation Details"
     ├─ ArtifactID (called from: EntityField.Value setter)
     ├─ ArtifactVersionID (called from: EntityField.Value setter)
     └─ SuggestedResponses (called from: EntityField.Value setter)
```

## Inventory of remaining runtime users

### A. `MJ: Conversation Detail Attachments` entity — 9 call sites in 5 files

| File | Line | Direction | Purpose | Disposition |
|---|---|---|---|---|
| [`AI/Engine/src/services/ConversationAttachmentService.ts`](../packages/AI/Engine/src/services/ConversationAttachmentService.ts#L523) | 523 | Read | `getDetailAttachments()` — fetch attachments for one detail | **Migrate** — read from `ConversationDetailArtifact` junction → `ArtifactVersion` instead. Service contract should return artifact-shaped data; callers in conversations UI consume it. |
| [`AI/Engine/src/services/ConversationAttachmentService.ts`](../packages/AI/Engine/src/services/ConversationAttachmentService.ts#L556) | 556 | Read | Batch fetch by detail-IDs (for context loading) | **Migrate** — same as above, batched. |
| [`AI/Engine/src/services/ConversationAttachmentService.ts`](../packages/AI/Engine/src/services/ConversationAttachmentService.ts#L590) | 590 | Write | Create attachment row | **Stop writing attachments at all.** New path: write `Artifact` + `ArtifactVersion` + `ConversationDetailArtifact` junction directly. The server entity hook that backfills the artifact from a new attachment becomes a no-op once nothing creates attachments. |
| [`AI/Engine/src/services/ConversationAttachmentService.ts`](../packages/AI/Engine/src/services/ConversationAttachmentService.ts#L818) | 818 | Write | Update / set `ArtifactVersionID` back-link | **Delete** — once we stop creating attachments, there is no back-link to set. |
| [`AI/Engine/src/services/ConversationAttachmentService.ts`](../packages/AI/Engine/src/services/ConversationAttachmentService.ts#L301) | 301 | Write | `attachment.ArtifactVersionID = versionId` (back-link after artifact creation) | Same as above. Removed when caller is removed. |
| [`AI/Agents/src/AgentRunner.ts`](../packages/AI/Agents/src/AgentRunner.ts#L1168) | 1168 | Write | `saveAgentMediaAsAttachments()` — agent-produced media (images/audio/video the agent generated) saved as attachments | **Migrate** — agent media outputs should be saved as `Artifact` + `ArtifactVersion` (and modality is already known from `MediaOutput.modality`). The junction table still ties them to the conversation detail. |
| [`AI/Agents/src/AgentRunner.ts`](../packages/AI/Agents/src/AgentRunner.ts#L1663) | 1663 | Read | **Back-compat path** for pre-unification attachments — explicit `ArtifactVersionID IS NULL` filter, with a comment saying so | **Decision required** (see §"Back-compat read path" below). Either keep it indefinitely as the explicit legacy reader, or run a one-shot migration to artifact-ify the legacy rows and delete the branch. |
| [`Angular/Generic/conversations/.../conversation-attachment.service.ts`](../packages/Angular/Generic/conversations/src/lib/services/conversation-attachment.service.ts#L63) | 63 | Read | Client-side attachment fetch for display | **Migrate** — replace with artifact query. The Angular service is the canonical place to surface "what got attached to this message" to the message-item component. |
| [`Angular/Generic/conversations/.../conversation-attachment.service.ts`](../packages/Angular/Generic/conversations/src/lib/services/conversation-attachment.service.ts#L199) | 199 | Write | Create attachment row from client | **Replace** — client should call a server mutation that creates the artifact, not the attachment. Or, simpler, defer this work to the server unified path so the client never touches the attachments entity. |
| [`Angular/Generic/conversations/.../conversation-agent.service.ts`](../packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts#L444) | 444 | Read | `loadAttachmentsForMessages()` — preload attachments for a batch of messages so agent context-loading has them | **Migrate** — same artifact-junction read pattern. Likely consolidates with the Engine-side change. |

### B. Field setters — `ArtifactVersionID` on Conversation Details / Attachments

| File | Line | Purpose | Disposition |
|---|---|---|---|
| [`AI/Engine/src/services/ConversationAttachmentService.ts`](../packages/AI/Engine/src/services/ConversationAttachmentService.ts#L301) | 301 | Set back-link after creating paired artifact | Deletes when §A row 5 deletes. |
| [`MJCoreEntitiesServer/src/custom/MJConversationDetailAttachmentEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJConversationDetailAttachmentEntityServer.server.ts#L62) | 62, 66, 164 | Server entity hook — Save() creates paired artifact and sets back-link FK | **Remove the hook entirely** once nothing creates attachments. The hook exists exclusively to do dual-write during the transition; once the unified path is the only path, it has no job. |
| [`Angular/Generic/conversations/.../conversation-attachment.service.ts`](../packages/Angular/Generic/conversations/src/lib/services/conversation-attachment.service.ts#L78) | 78 | Read-side guard (`if (attachment.ArtifactVersionID) continue;` — skips already-paired rows) | Deletes when §A row 8 deletes. |

### C. Field setters — `ArtifactID`, `AgentState`, `SuggestedResponses`

Static source-tree search (TypeScript, non-generated) finds **no direct setter call sites** for any of these three fields. That tells us the warnings are firing through one of these paths instead:

1. **GraphQL CreateXxx / UpdateXxx mutations** receive these fields in their input objects from the client, and the generated resolver calls `LoadFromData(input)` (or per-field assignment) on the entity instance. Each field assignment goes through the generated `set` accessor, which is where MJ's deprecation check fires.
2. **Server-side `LoadFromData()` / `SetMany()` calls** populating an entity from a row of cached/external data that happens to include the deprecated columns.

To confirm and locate, we need a small spike — see §"Investigation Phase" below.

The most plausible client culprits:
- `AgentState` on `MJ: AI Agent Runs` — Sage / AgentRunner persistence has historically written `AgentState` (a JSON snapshot of the agent's reasoning state per turn). PR #2569 didn't touch this; the field was deprecated as part of the same metadata sweep but the writers weren't migrated. Replacement is whatever the new agent-run state mechanism is (likely the `MJ: AI Agent Run Steps` table — which already exists and stores per-step state — making `AgentState` a duplicate of step-level data).
- `ArtifactID` and `ArtifactVersionID` on `MJ: Conversation Details` — these are the direct columns on the conversation-detail row that pre-date the junction table. PR #2569 introduced the junction; the columns were left in place + deprecated. Anything that still sets them is dual-writing to a column that's no longer the source of truth.
- `SuggestedResponses` on `MJ: Conversation Details` — a JSON list of follow-up prompts the assistant offers. There IS still a reader at [`message-item.component.ts:1128`](../packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.ts#L1128). If the reader is alive, something must be the writer — probably an agent-run epilogue or a chat resolver. Unclear where this should move to in the new model; needs investigation (it may have a new home in an artifact or in step output).

## Decisions required from the team

These are the genuinely open questions. Each blocks a specific batch of the implementation work.

### D1. Back-compat read path for pre-unification attachments

[`AgentRunner.ts:1654-1669`](../packages/AI/Agents/src/AgentRunner.ts#L1654) explicitly reads attachments with `ArtifactVersionID IS NULL` — i.e., the rows that existed before the unification migration ran, and which weren't backfilled.

Options:

- **D1a. Keep the read path.** Cost: one deprecation warning per agent run that touches a legacy conversation. Benefit: zero data migration. Suits an open-source platform where every install has different vintage data.
- **D1b. One-shot backfill.** Write an idempotent migration / `mj-cli` task that walks every `ConversationDetailAttachment` with `ArtifactVersionID IS NULL` and creates the paired artifact (same logic the server hook uses today). Then delete the back-compat branch. Suits a controlled deployment where you can run a maintenance task. PR #2569 already shipped `mj-cli artifacts reclassify` — extending or pairing it with `artifacts backfill-from-attachments` is small.
- **D1c. Drop legacy rows from agent context.** Decide that conversations with un-migrated attachments simply don't carry those attachments into the agent any longer. Cheapest for code; lossy for users.

**Recommendation: D1b.** It's the only option that lets us actually remove the attachments entity from the codebase eventually. D1a is the path-of-least-resistance answer that keeps the deprecation warning permanent. The cleanup task is small (≤1 day) and the resulting code is dramatically simpler.

### D2. Should attachments be physically removed, or only deprecated?

Two end-states:

- **D2a. Soft-deprecation (current direction).** Table + entity + procs stay. No code references them. They sit in the schema as dead weight that future installs still create. New developers might rediscover them and reintroduce usage.
- **D2b. Hard removal.** Drop the table once the back-compat path is gone (post-D1b). Remove generated entity class, GraphQL types, server hook, the entire `ConversationAttachmentService` (or rewrite it as a thin wrapper around the artifact path with a new name).

**Recommendation: D2b, but staged.** First land the code migration (no callers). Then in a subsequent release, run the schema drop. This gives one full release cycle of "deprecated but still queryable" for any downstream installs that might be writing the table directly. This is consistent with the Publish-Then-No-Breaking-Changes Policy: the entity is part of the published schema, so dropping it is a breaking change that needs a major version bump.

### D3. What replaces `AgentState`?

Read the PR #2569 description again — it says nothing about agent state. The deprecation of `AgentState` happened in the same metadata sweep but isn't a unification concern; it's a separate piece of cleanup that hitched a ride.

We need to figure out:
1. Where is `AgentState` currently being written? (See investigation step below.)
2. What's the intended replacement? The hypothesis is `MJ: AI Agent Run Steps` already carries per-step state in `OutputData` / `InputData` / per-step rows, making `AgentState` redundant. Confirm with whoever owns the agent framework (likely Amith / agent-team).
3. If no replacement is needed, the writer is dead code and should just be deleted.

This decision is independent of D1/D2 and could be its own small PR.

### D4. What replaces `SuggestedResponses`?

Same situation as D3 but for follow-up suggestions. The reader at [`message-item.component.ts:1128`](../packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.ts#L1128) is still parsing JSON out of the field. So either:

- There's a writer somewhere that needs to migrate (investigation finds it).
- The field is the new home, and the deprecation was premature — un-deprecate it.
- The functionality is dead and the reader is also dead code — delete both.

The most likely truth, given the artifact unification narrative, is that suggested responses should be stored as a small artifact or as a step output, not as a column on the message row.

### D5. What replaces `ConversationDetails.ArtifactID` / `ArtifactVersionID`?

These columns pre-date the `ConversationDetailArtifact` junction table that PR #2569 introduced. After #2569, the junction is the source of truth. Any writer of the column-level FKs is dual-writing. Replacement is straightforward: write to the junction, leave the columns null.

**The investigation step needs to find these writers** — they're not in the source tree under direct setter syntax, so they're arriving via GraphQL mutation input.

## Plan of work

### Phase 0 — Investigation (½ day)

Spike to nail down §C — find the actual call paths producing the field-setter warnings. Concrete steps:

1. Add a temporary log line in the deprecation-warning path that captures a stack trace (or just `new Error().stack`) on the first occurrence per field. Run MJAPI through a normal Sage conversation. Read stacks.
2. Grep the GraphQL input types for the four entities; identify which mutation inputs still expose `AgentState` / `ArtifactID` / `ArtifactVersionID` / `SuggestedResponses` as input fields. The client is almost certainly sending them.
3. For each writer found, decide: migrate, delete, or escalate to D3/D4.

Output: a short addendum to this plan listing the exact files/lines that write each field.

### Phase 1 — Stop new attachments from being created (1–2 days)

Migrate all **write** paths so nothing new is inserted into `ConversationDetailAttachment`. Each upload becomes Artifact + ArtifactVersion + Junction directly, no attachment row.

Files to touch:
- `ConversationAttachmentService.ts` — flip the implementation so the service writes the artifact pair as primary, no longer creating attachment rows. Public method signatures can stay the same; the return type may need to switch from `MJConversationDetailAttachmentEntity` to a thin DTO or to `MJArtifactVersionEntity`.
- `AgentRunner.ts:1168` — `saveAgentMediaAsAttachments()` becomes `saveAgentMediaAsArtifacts()` (or just inlines into the artifact path).
- `Angular/.../conversation-attachment.service.ts:199` — client-side upload writes through the artifact mutation, not the attachment mutation. May or may not need a new GraphQL mutation depending on what exists.

Once these land, the server entity hook ([`MJConversationDetailAttachmentEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJConversationDetailAttachmentEntityServer.server.ts)) is unreachable from production code and can be removed in the same phase.

### Phase 2 — Migrate read paths (1 day)

All four read sites query through `ConversationDetailArtifact` → `ArtifactVersion` instead of the attachments entity:

- `ConversationAttachmentService.ts` lines 523, 556 — server-side detail/batch read.
- `Angular/.../conversation-attachment.service.ts:63` — client-side display read.
- `Angular/.../conversation-agent.service.ts:444` — agent context preload.

After Phase 1 + 2, the attachments entity has **one** reader left: the back-compat path in `AgentRunner.ts:1654` for pre-unification rows.

### Phase 3 — Resolve D1 (½ day if D1b)

If D1b is chosen, add `mj-cli artifacts backfill-from-attachments`:
- Walks all `ConversationDetailAttachment` rows with `ArtifactVersionID IS NULL`.
- For each, runs the same artifact-creation logic the entity hook used to run.
- Updates the back-link.
- Logs counts.

Document in release notes that this should be run once after upgrading. Then delete the back-compat branch in `AgentRunner.ts`.

### Phase 4 — Field-setter cleanups (1–2 days, blocked on Phase 0 findings)

Per Phase 0 output:
- Remove `AgentState` writers (D3).
- Remove `SuggestedResponses` writers OR un-deprecate the field (D4).
- Remove `ConversationDetails.ArtifactID` / `ArtifactVersionID` writers, write to junction only (D5).
- In each case, strip the deprecated field from the GraphQL mutation input type so the client can't send it. (`MJServer` generated resolvers will need a CodeGen pass.)

### Phase 5 — Verification (½ day)

- Restart MJAPI clean.
- Run a fresh Sage conversation, upload an image, upload a PDF, upload a JSON.
- Run an agent that produces media output.
- Open an older conversation that pre-dates the unification (one with `ArtifactVersionID IS NULL` attachment rows) — after Phase 3 backfill, ensure no warnings.
- Confirm zero deprecation warnings in MJAPI console for any of the five deprecated items.
- Confirm UI parity: attachments still display in conversation history, agent context still includes them, agent-generated media still appears in the response message.

### Phase 6 (deferred to next major) — Schema removal per D2b

Out of scope for this plan. Track as a follow-up.

## Open question for the team

PR #2569's description claimed "✅" on every plan section, but in practice the migration left every existing runtime user in place — only the metadata was marked deprecated. Worth a short retro on why the deprecation-only approach was chosen and whether we want the next big metadata migration to do the same (deprecate first, migrate callers later) or to atomically migrate-and-deprecate. The deprecation-first approach has the benefit that the warning surfaces real call sites the original author may not have known about; the cost is the ongoing "warning noise floor" we're now hearing in MJAPI logs.

## Estimated effort

| Phase | Effort | Blocking |
|---|---|---|
| 0. Investigation | ½ day | — |
| 1. Stop new attachments | 1–2 days | Phase 0 |
| 2. Migrate read paths | 1 day | Phase 1 (for entity hook removal coordination) |
| 3. Backfill + remove back-compat | ½ day | D1 decision |
| 4. Field-setter cleanups | 1–2 days | Phase 0 + D3/D4/D5 decisions |
| 5. Verification | ½ day | All above |

**Total: ~4–6 dev-days,** assuming D1b/D2b are accepted and Phase 0 doesn't uncover anything ugly.

## Files referenced in this plan

- Predecessor plan: [`plans/artifact-attachment-unification.md`](./artifact-attachment-unification.md)
- Deprecation metadata: [`metadata/entities/.conversation-detail-attachments-deprecation.json`](../metadata/entities/.conversation-detail-attachments-deprecation.json)
- Server entity hook: [`packages/MJCoreEntitiesServer/src/custom/MJConversationDetailAttachmentEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJConversationDetailAttachmentEntityServer.server.ts)
- Server attachment service: [`packages/AI/Engine/src/services/ConversationAttachmentService.ts`](../packages/AI/Engine/src/services/ConversationAttachmentService.ts)
- Agent media save + back-compat read: [`packages/AI/Agents/src/AgentRunner.ts`](../packages/AI/Agents/src/AgentRunner.ts)
- Client attachment service: [`packages/Angular/Generic/conversations/src/lib/services/conversation-attachment.service.ts`](../packages/Angular/Generic/conversations/src/lib/services/conversation-attachment.service.ts)
- Client agent context preload: [`packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts`](../packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts)
- `SuggestedResponses` reader: [`packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.ts`](../packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.ts#L1128)
