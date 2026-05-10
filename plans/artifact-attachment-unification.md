# Artifact / Attachment Unification

## Background

Today MJ has **two parallel paths** for getting file content into an AI agent's context, and the routing decision between them is a hardcoded MIME allowlist in `RunAIAgentResolver.ts`.

### The two paths

1. **`ConversationDetailAttachment`** — older system. A file uploaded with a message becomes an attachment row. At agent-run time the resolver inlines the attachment's bytes as an `image_url` / `file_url` / `audio_url` / `video_url` content block on the user `ChatMessage`. Multimodal-native, simple, stateless. Built for "look at this image and answer."

2. **`ConversationArtifact` / `ConversationArtifactVersion`** — newer system. First-class versioned content with a registered Artifact Type carrying a `ToolLibraryClass`. The agent gets a manifest plus tools (e.g. `JSON.json_path`, `PDF.get_text`) injected into the prompt and reads content lazily. Built for "this report has identity across turns and tools to operate on it."

### The seam

`packages/MJServer/src/resolvers/RunAIAgentResolver.ts:1319-1324` decides which path each upload takes:

```typescript
const ARTIFACT_TOOL_MIME_PREFIXES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument', // .docx, .xlsx, .pptx
    'application/vnd.ms-excel',
    'application/msword',
];
```

Anything matching this list is skipped from inline embedding and reaches the agent via the artifact-tool path. **Everything else** — JSON, XML, CSV, text, Markdown, code, YAML, audio, video, images — is base64-stuffed inline.

### The triggering bug

A user dropped a JSON file into the Sage conversation. `application/json` isn't on the allowlist, so the resolver inlined the file as a `file_url` content block:

```
USER  1,619,424 chars  (~400k tokens)
  [0] { type: "text", content: "tell me what is in this file" }
  [1] { type: "file_url", content: "data:application/json;base64,ewogIC..." }
```

Sage's model context window is 128k. The agent run blew up before the LLM saw a single token. `JSONToolLibrary` was sitting registered, ready to handle the file, and never got invoked because the file took the wrong path at the resolver fork.

## The core insight

**Storage and rendering are different decisions and the current code conflates them.**

- *Storage* = where the file lives, what identity it has, how it's versioned, who owns it
- *Rendering* = how its bytes get into a specific LLM call (inline content block vs. tool dispatch)

Today, the storage choice (attachment vs. artifact) silently determines the rendering choice (inline vs. tools), via a MIME allowlist that nobody updates when a new Artifact Type is added.

The unified design separates them:

> **Storage:** every file attached to a conversation is an artifact. Always.
>
> **Rendering:** per-message, per-artifact, the resolver asks "how should this artifact be delivered to the LLM for this turn?" Answer is driven by artifact-type metadata, model capabilities, size budget, and an explicit per-artifact override — not a hardcoded list.

## Proposed architecture

### 1. Single storage substrate — artifacts

`ConversationDetailAttachment` becomes a thin junction table at most: "this message references these artifact versions." The actual file bytes, MIME type, size, FileID, etc. live on `ConversationArtifactVersion`. Existing attachment-only consumers can continue reading via a compatibility shim while migration proceeds.

Net effect:
- Versioning, identity, permissions, tool dispatch — all available for every uploaded file
- New Artifact Types automatically cover their MIME range with no resolver edits
- "I uploaded that JSON in turn 3" is referenceable from turn 17

### 2. Rendering modes per artifact type

A new column on `MJ: Artifact Types` (e.g. `DefaultDeliveryMode`) with values:

| Mode | Meaning |
|---|---|
| `Inline` | Always deliver as inline content block (`image_url`, etc.) — appropriate for vision/audio-native types under size cap |
| `ToolsOnly` | Never inline — agent must call tools to read content |
| `Auto` | Inline if (a) modality is multimodal-native for the model and (b) size ≤ threshold; otherwise tools |

A per-artifact-instance override (e.g. `ConversationArtifactVersion.DeliveryMode`) lets a specific instance opt out of the default. This addresses the use case: "we have images we explicitly do *not* want inlined — let the LLM decide whether to fetch via tool."

### 3. Standardize `get_full` on the base class

Make `get_full` a **concrete, default-implemented** tool on `BaseArtifactToolLibrary` (`packages/AI/CorePlus/src/artifact-tool-library.ts:27`). It's truly generic — `InvokeTool` already receives `artifactContent: string | Buffer`, and "return the full content" is pure plumbing:

```
get_full(artifactId): { content: string; encoding: 'utf8' | 'base64'; mimeType; sizeBytes }
  - if artifactContent is a Buffer → encode base64
  - if string → return utf8 directly
```

Implementation: the base class registers `get_full` automatically and provides its `InvokeTool` handler. Subclasses get it for free. A subclass can override **only** when the default isn't appropriate (e.g. a PDF library might prefer extracted text over raw PDF bytes — though arguably "raw" should still be available alongside `get_text`).

Current state vs. proposed:

| Library | Today | After |
|---|---|---|
| DataSnapshot | ✅ custom impl | inherits base, custom impl removed |
| PDF | ✅ custom impl | inherits base, custom impl removed (or kept if extracted-text default is preferred) |
| Docx, Excel, JSON, Text, SearchResultSet | ❌ | inherits base — gets it for free |

This is the primitive that makes `ToolsOnly` delivery viable for **inlineable types like images**: the LLM has a defined escape hatch to fetch bytes on demand even when the resolver did not pre-attach them as `image_url`. (See open question #1 about how each model driver handles a tool-returned base64 image — it may need to be re-injected as an `image_url` block in the next turn.)

### 4. Routing logic moves out of the resolver

`RunAIAgentResolver` no longer makes type-by-type decisions. For each artifact attached to the conversation:

```
mode = artifactVersion.DeliveryMode ?? artifactType.DefaultDeliveryMode

if mode == Inline AND modelDriver.SupportsModality(mimeType) AND sizeBytes < cap:
    add inline content block to ChatMessage
else:
    register with ArtifactToolManager (manifest + tools)
```

The `ARTIFACT_TOOL_MIME_PREFIXES` constant is deleted. `cap` lives in one place (configurable; sane default e.g. 100KB inline / 25MB tool-eligible).

### 5. Hard size guard — defense in depth

Even when an artifact is on the inline path, enforce a server-side absolute cap. If exceeded, force-fall-back to tools and log a warning. No future MIME-list oversight should be able to silently 6x the prompt again.

### 6. Unknown / unregistered file-type handling — reject by default

Today, when a file's MIME doesn't match any registered Artifact Type, `AgentRunner.ts:1432-1434` silently falls back to the JSON artifact type ID:

```typescript
const artifactType = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(mimeType);
if (!artifactType) {
    LogStatus(`ProcessFileArtifacts: no ArtifactType found for MIME ${mimeType}, using JSON fallback`);
}
const artifactTypeId = artifactType?.ID ?? JSON_ARTIFACT_TYPE_ID;
```

This is wrong: a `.xyz` binary becomes a "JSON" artifact, and JSONToolLibrary then fails on first tool call when the bytes don't parse. Plus the `GetArtifactTypeByMimeType` lookup itself (`MJCoreEntities/src/engines/artifacts.ts:114-118`) is exact-match only — no wildcards, no extension hint, no pattern.

**Proposed policy: reject unknown file types at upload time, with a generous default registry and one opt-in safety valve.**

#### MIME resolution gets pattern matching

Extend `GetArtifactTypeByMimeType` to support wildcards in `ArtifactType.ContentType`, walking most-specific to least-specific:

```
exact match            (application/json)        — highest priority
subtype wildcard       (text/*, image/*)         — middle
```

File extension as a secondary tiebreaker when MIME is missing or `application/octet-stream` (browsers default to that constantly for unknown extensions).

#### Default-registered Artifact Types ship covering the long tail

| MIME | Artifact Type | Tools |
|---|---|---|
| `application/json` | JSON | existing |
| `application/xml`, `text/xml` | XML | reuse Text or dedicated |
| `text/csv`, `application/csv` | CSV | column-aware |
| `application/pdf` | PDF | existing |
| Office MIMEs | Excel / Word / PowerPoint | existing |
| `image/*` | Image | inline `image_url`, vision-native |
| `audio/*` | Audio | inline `audio_url` where supported |
| `video/*` | Video | inline `video_url` where supported |
| **`text/*` (catchall)** | **Generic Text** | `grep`, `get_lines`, `get_full` |

The single `text/*` catchall is intentionally kept because text is text — log files, YAML, TOML, source code, Markdown all use the same primitives. Low-risk, broadly useful, no garbage-in problem.

#### No binary catchall by default

If the upload's MIME is `application/octet-stream` or anything else not matching the registry above, the **server rejects the upload** with a clear error before any bytes hit storage:

```
This file type (.xyz, application/octet-stream) is not supported by 
this agent. Supported types: PDF, Word, Excel, JSON, CSV, XML, text 
files, images, audio, video. Contact your administrator to register 
additional types.
```

Rationale:
- Forces intentionality — adding a new format means registering an artifact type with real tools, not silently base64-stuffing random bytes into prompts
- Fails at the right layer (upload validation) rather than at agent-run time when the user has no useful diagnostic
- Eliminates the worst failure mode — `get_full` on a random binary blob returns base64 garbage that LLMs can't usefully act on
- Aligns with the broader theme of removing silent fallbacks throughout this plan

#### Per-agent opt-in only

A new boolean field on `AIAgent`, e.g. `AcceptUnregisteredFiles` (default `false`). When `true` for a specific agent, an upload to a conversation targeting that agent with an unrecognized MIME resolves to a `Generic Binary` artifact type exposing only `get_full` (base64) and `get_metadata` (filename, size, MIME, sha256). Every use is logged so admins can audit which agents are accepting unregistered content.

No system-wide global flag. Permissiveness is always scoped to a specific agent that has explicitly opted in — a research agent investigating unknown formats can be permissive while Sage stays strict, and there's no environment-level config that can silently re-open the rejection path for every agent at once.

#### Deletion of the JSON fallback

`AgentRunner.ts:1432-1434`'s "use JSON when nothing matches" fallback is deleted. With pattern matching + the default registry + reject-by-default, there is never a legitimate path that lands on JSON for non-JSON content.

## Migration plan

### Phase 1 — Stop the bleeding (small PR, ship now)

- Add `application/json`, `application/xml`, `text/xml`, `text/csv`, `application/csv`, `text/` to `ARTIFACT_TOOL_MIME_PREFIXES`
- Add an absolute inline-size cap (e.g. 100KB) with fallback-to-skip when exceeded
- Standardize `get_full` across all existing tool libraries
- Targets the immediate Sage bug; no schema changes

### Phase 2 — Unify storage

- Migration: `ConversationDetailAttachment` writes also create a `ConversationArtifactVersion`
- Backfill existing attachments to artifacts where MIME is recognized
- Resolver reads both, dedupes on `SourceConversationDetailID`
- Compatibility shim keeps old attachment-only consumers working

### Phase 3 — Move routing out of the resolver

- Add `DefaultDeliveryMode` to `MJ: Artifact Types`
- Add `DeliveryMode` override to `ConversationArtifactVersion`
- Resolver delegates to artifact-type metadata + model-driver capability check
- Delete `ARTIFACT_TOOL_MIME_PREFIXES`
- Document in new `packages/AI/Agents/docs/ARTIFACT_TOOLS_GUIDE.md`

### Phase 4 — Deprecate the parallel attachment path (no code-breaking changes)

The `MJ: Entities.Status` field already supports `'Active' | 'Deprecated' | 'Disabled'`. Per the field's own description: *"Deprecated: functional but generates console warnings when used; Disabled: not available for use even though metadata and physical table remain."*

Steps:

- Add a new metadata file under `/metadata/entities/` (e.g. `.conversation-detail-attachments-deprecation.json`) that updates the `MJ: Conversation Detail Attachments` entity record with:
  - `Status: "Deprecated"`
  - Optionally an updated `Description` pointing readers to artifacts as the supported path
- On `mj sync push`, this propagates through the normal entity-metadata pipeline. CodeGen then emits the deprecation marker into the generated `ConversationDetailAttachmentEntity` JSDoc on the next CodeGen run, and any runtime use of the entity logs a console warning (per the framework's existing handling of `Status === 'Deprecated'`).
- Critically, **nothing is removed**: the table, the entity, the generated class, the GraphQL types all remain. Existing consumers keep working. They just see a deprecation warning, and IDE tooling surfaces the JSDoc tag.
- Schedule eventual table removal in a future major version once all known consumers are migrated.

This is the safest possible deprecation — pure metadata change, no schema migration, no code change in the entity package itself, full backwards compatibility, and the warning surfaces in both runtime logs and developer IDEs.

## Open questions

1. **Image identity for multimodal models.** When a model API receives an image inline as `image_url`, the model "sees" it natively. If we instead deliver only a manifest entry and force the LLM to call `get_full` to fetch base64, the LLM still has to put that base64 *somewhere* the vision pipeline reads it — typically by including the result in a follow-up turn as an `image_url` block. Need to verify each driver (Anthropic, OpenAI, Gemini, etc.) handles "tool returned base64 image, agent then references it" cleanly. Worst case: tools-only mode for images requires the agent harness to detect base64-image returns and re-route them as `image_url` blocks on the next turn.

2. **Token budget for the manifest itself.** Today the manifest includes a preview snippet for each artifact. With many artifacts in a long conversation, the manifest itself can grow. Need a per-artifact preview cap and possibly a manifest summarization step.

3. **Backwards compatibility for agents reading raw attachment content.** Any custom agent code that reaches into `ConversationDetailAttachment` directly (rather than going through artifact tools) needs an audit. Search for direct attachment access in agent prompt templates.

4. **MJStorage for artifacts that originate as attachments.** Today inline attachments may store base64 directly on the row. Artifact storage prefers `FileID` references to MJStorage. Need a size threshold for promotion to MJStorage during the Phase 2 backfill.

5. **Per-artifact override UX.** If `DeliveryMode` is configurable per artifact instance, where does a user set it? Conversation UI? Agent configuration? Default-off and only set programmatically? Needs UX design.

## Triggering bug — confirmation

Concrete reference: `packages/MJServer/src/resolvers/RunAIAgentResolver.ts:1319-1351` and `:1357-1384`. A JSON upload falls through both code paths' MIME allowlist into the inline-embed branch, producing the 1.6MB `file_url` content block observed in the Sage agent run.

## Out of scope

- Changes to how agents *produce* artifacts (already covered by `ArtifactCreationMode` and `DefaultArtifactTypeID` on the agent)
- Client Tools (separate concept — see `packages/AI/Agents/docs/CLIENT_TOOLS_GUIDE.md`)
- Artifact permissions and sharing model
- Artifact rendering in the conversation UI (this plan is about agent/LLM delivery only)
