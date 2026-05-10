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

### 3. Standardize `get_full` across all tool libraries

Every `BaseArtifactToolLibrary` exposes a uniform tool:

```
get_full(artifactId): { content: string | base64; encoding: 'utf8' | 'base64'; mimeType; sizeBytes }
```

Current state:

| Library | Has `get_full`? |
|---|---|
| DataSnapshot | ✅ |
| PDF | ✅ |
| Docx | ❌ (has `get_text`/`get_html` separately) |
| Excel | ❌ |
| JSON | ❌ |
| Text | ❌ |
| SearchResultSet | ❌ |

Add `get_full` to the missing libraries. For binary artifacts (images, audio, video) `get_full` returns base64 with `encoding: 'base64'` — letting the LLM choose to fetch the bytes when it decides it needs to "see" the image despite `ToolsOnly` / `Auto` having delivered only the manifest.

This becomes the primitive that makes "tools-only" actually viable for image/audio artifacts: the LLM has a defined escape hatch.

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

### Phase 4 — Deprecate the parallel attachment path

- Mark `ConversationDetailAttachment` deprecated; redirect all reads through artifacts
- Schedule eventual table removal in a major version

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
