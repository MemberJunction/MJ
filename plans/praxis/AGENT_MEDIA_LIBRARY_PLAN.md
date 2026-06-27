# Agent Media Library — MJ-core Plan

> **Scope:** A small, additive MJ-core capability that lets a realtime agent draw on a **curated,
> governed media kit** during a conversation, by **reusing the existing Artifacts + Collections
> stack** instead of a bespoke media-resource entity. This is a follow-up to the Media channel (S1)
> shipped in [PR #2941](https://github.com/MemberJunction/MJ/pull/2941) and targets **MJ 5.44**.
>
> Origin: while standing up **Praxis** (`bizapps-praxis`), we found the planned `AIAgentResource`
> entity was descoped from PR #2941 — media is currently only ever supplied ad-hoc at call-time
> (`Media_ShowMedia({ url | fileId })`), with no persisted, model-reasoned catalog. Rather than
> reintroduce a parallel entity that would duplicate `MJ: Files` + Artifacts + Collections (storage,
> MIME, versioning, viewers, permissions, grouping), we add the **two missing fields** + a binding.

## Decision (locked)

- **Model:** a `MJ: Collections` of `MJ: Artifacts` **is** an agent's media kit. The artifact (+ its
  current version) describes the media (`FileID → MJ: Files`, `MimeType`, name, viewer, versioning,
  permissions). Nothing is duplicated; bytes stream via the existing authenticated `/media` route.
- **Agent-reasoning metadata lives on the membership** (`MJ: Collection Artifacts`), per-kit, so the
  same artifact can be framed differently in different kits. `Sequence` (priority/order) already
  exists; we add `ContextDescription` (agent "when to show it") + `Preload` (eager hint).
- **Binding:** `AIAgent.DefaultMediaCollectionID` (FK → `MJ: Collections`) is the agent's default
  kit. Per-session resolution is `runtime override > agent default > none`. The call-time
  `Media_ShowMedia` tool is unchanged and still works for ad-hoc media.
- **No new top-level entity.** `AIAgentResource` is **not** built — this decision supersedes it.

## What ships

### 1. Migration (additive) — `migrations/v5/V202606271600__v5.44.x__Agent_Media_Library.sql`
- `CollectionArtifact` ADD `ContextDescription NVARCHAR(MAX) NULL`, `Preload BIT NOT NULL DEFAULT 0`.
- `AIAgent` ADD `DefaultMediaCollectionID UNIQUEIDENTIFIER NULL` + FK → `Collection(ID)`.
- Extended properties on all three columns. CodeGen then regenerates the entity types.

### 2. Resolver (reusable, unit-tested) — `packages/AI/Agents/src/realtime/agent-media-library.ts`
- `mediaTypeFromMimeType(mime)` — MIME → `image|video|audio|pdf|web|null` (pure).
- `resolveAgentMediaCollectionID(provider, user, agentID, override?)` — `override > AIAgent default`.
- `resolveAgentMediaManifest(provider, user, collectionID)` — loads memberships (ordered by
  `Sequence`) + their artifact versions, drops items with no `FileID` or a non-media MIME, returns an
  ordered `AgentMediaManifestItem[]` (`{ ResourceID, FileID, MediaType, DisplayName,
  ContextDescription, Preload }`).
- `formatAgentMediaManifest(items)` — one background context note listing each item's `fileId`,
  type, display name, when-to-show + PRELOAD marker, instructing the agent to use `Media_ShowMedia`
  (pure).
- `buildAgentMediaContextNote(...)` — end-to-end orchestrator; best-effort (logs + returns `null`).

### 3. Channel wiring — server-side, no new client tool
- `realtime-channel-server-data-context.ts` — `IRealtimeChannelServerDataAware` + a type guard. The
  core-free base channel can't carry `UserInfo`/`IMetadataProvider`; a channel that needs DB access
  at start implements this and the host hands over the session's `contextUser` + `provider`.
- `RealtimeChannelServerHost.instantiateSessionPlugins(...)` — now threads `contextUser` + `provider`
  and calls `SetSessionDataContext(...)` on data-aware plugins between `Initialize` and
  `OnSessionStarted` (backward compatible; other channels are untouched).
- `MediaChannelServer` — implements `IRealtimeChannelServerDataAware`; `OnSessionStarted()` resolves
  the agent's kit → `SendContextNote(manifest)`. The agent then surfaces items with the **existing**
  `Media_ShowMedia({ fileId, mediaType, displayName })` client tool — no new tool, no client
  round-trips, no client changes.

### 4. Tests — `packages/AI/Agents/src/__tests__/agent-media-library.test.ts`
MIME mapping, manifest ordering/mapping/fallbacks, FileID/non-media filtering, override-vs-default
resolution, end-to-end note, and fail-closed behavior.

### 5. Docs
- This plan. A "Media Library" section appended to `guides/REALTIME_CO_AGENTS_GUIDE.md`.
- A `minor` changeset for `@memberjunction/ai-agents`.

## Tasks

- [x] **T1 — Migration** authored (additive; CollectionArtifact + AIAgent). <!-- @2026-06-27 -->
- [x] **T2 — Resolver/formatter** (`agent-media-library.ts`) written against post-CodeGen types. <!-- @2026-06-27 -->
- [x] **T3 — Channel wiring** (data-context capability + host handoff + `MediaChannelServer.OnSessionStarted`). <!-- @2026-06-27 -->
- [x] **T4 — Unit tests** for the resolver/formatter. <!-- @2026-06-27 -->
- [x] **T5 — Docs + changeset.** <!-- @2026-06-27 -->
- [ ] **T6 — Run migration + CodeGen locally, build `@memberjunction/ai-agents`, run its tests.** Done
  by a maintainer who can reach the DB (the code is written assuming CodeGen has produced
  `MJCollectionArtifactEntity.ContextDescription/.Preload` and `MJAIAgentEntity.DefaultMediaCollectionID`).
- [ ] **T7 — Per-session runtime override delivery (follow-up).** The resolver already accepts an
  `overrideCollectionID`; wiring the *source* of that override (the calling app — e.g. a Praxis
  Protocol — supplying a per-session collection at session start, likely via the Media channel's
  session config) is a thin follow-up. Until then, the agent default (`DefaultMediaCollectionID`)
  fully covers the common case (one kit per protocol-bound agent).

## Acceptance
- ☐ Migration applies cleanly; CodeGen regenerates the three new typed props.
- ☐ `@memberjunction/ai-agents` builds; `agent-media-library` tests pass.
- ☐ A realtime session whose agent has a `DefaultMediaCollectionID` receives a media-kit context note
  at start and can show kit items via `Media_ShowMedia`.
- ☐ An agent with no kit is unaffected (ad-hoc `Media_ShowMedia` still works).

## Notes
- **Why server-side resolution:** the client channel context has no `AgentID`; the server channel
  context does (`+UserID`, `+SendContextNote`). Resolving the kit where the agent + user are known,
  then injecting a manifest the model reasons over, is the minimal correct seam.
- **Security:** kit `fileId`s are deployment-curated; playback is still permission-gated at token
  mint (`CreateMediaAccessToken` checks the session user) and streamed via `/media`.
