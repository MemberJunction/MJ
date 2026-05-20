# Artifact Tools Guide

How file uploads, generated artifacts, and the artifact tool dispatch path
reach an AI agent's context. Covers storage vs. rendering, the Artifact Type
registry, delivery modes, MIME resolution, and authoring custom tool
libraries.

## Storage vs. rendering: two different decisions

Every file that an agent needs to see (uploaded by a user, attached to a
message, or produced by an upstream agent) lives in MemberJunction as a
**`ConversationArtifactVersion`** row. That row carries the bytes (inline in
`Content` or by reference via `FileID` to MJStorage), the MIME type, a
filename, a size, a SHA hash, and a foreign key to the registered
**`ArtifactType`** that describes what kind of thing it is.

How the bytes actually reach the LLM is a separate decision, made per
agent-turn by the resolver:

| Path | What the LLM sees |
|---|---|
| **Inline** | A native multimodal content block on the user message: `image_url`, `audio_url`, `video_url`, or `file_url`. Vision-capable models "see" the content directly. |
| **Tools** | An entry on the artifact manifest plus a registered tool library (`get_full`, `json_path`, `get_text`, …). The agent reads the bytes lazily, only when it decides it needs them. |

The decision is driven by **artifact-type metadata, model driver capability,
and an explicit per-instance override** — never by a hardcoded MIME list
inside the resolver.

## Artifact Type registry

Each registered Artifact Type carries:

| Field | Meaning |
|---|---|
| `Name` | Human-readable label ("JSON", "PDF", "Image", …) |
| `ContentType` | MIME pattern. Exact (`application/pdf`) or subtype wildcard (`image/*`, `text/*`). |
| `ToolLibraryClass` | Class name of the `BaseArtifactToolLibrary` subclass that provides type-specific tools. `null` for inline-only types (Image, Audio, Video). |
| `DefaultDeliveryMode` | `Inline` or `ToolsOnly`. Two states only — `Auto` was considered and rejected because it collapses to one of the existing values. |
| `Priority` | Higher wins within a specificity tier. Use to disambiguate when multiple types claim the same MIME. |
| `SystemSupplied` | `true` for MJ-shipped defaults, `false` for org customizations. User customizations win over shipped defaults at equal priority. |

Default-registered types cover the long tail: JSON, XML, CSV, PDF, Office
variants, `image/*`, `audio/*`, `video/*`, `text/*` (catchall: logs, YAML,
TOML, Markdown, source code), and a minimal `application/octet-stream` Generic
Binary fallback. Anything outside the registry is rejected at upload time —
see *Unknown file types* below.

## Routing — when each path fires

Pseudocode (the real implementation is the pure `RouteArtifact()` function in
`packages/MJServer/src/resolvers/artifact-routing.ts`, fully unit-tested):

```
typeDefault = artifactType.DefaultDeliveryMode      // 'Inline' | 'ToolsOnly'
forceTools  = artifactVersion.ForceToolsOnly        // bool, default false

if typeDefault == 'ToolsOnly' OR forceTools:
    register with ArtifactToolManager
    return

// typeDefault == 'Inline' and no instance opt-out

if NOT modelDriver.SupportsModality(mimeType):
    throw — name the type, model, and three remediation paths

if sizeBytes >= INLINE_SIZE_CAP (100 KB):
    register with ArtifactToolManager + visible manifest annotation + WARN log
    return

emit inline content block
```

Two behaviors worth calling out:

- **Modality mismatch is a hard error.** Configuring an `image/*` type as
  `Inline` and pointing it at a non-vision model is a config bug. There is
  no defensible runtime fix, so we surface a remediable message rather than
  silently falling back to tools.
- **Size cap fallback is explicit, not silent.** When an Inline-default
  artifact exceeds the inline cap, it still gets routed to tools, but the
  manifest entry the agent sees carries a visible note ("…configured for
  Inline but exceeds inline size cap; delivered via tools") and the server
  logs at WARN. Both the LLM and the operator can tell that the configured
  intent didn't take effect.

## The per-instance override is one-way

`ConversationArtifactVersion.ForceToolsOnly: bool` (default `false`) lets a
specific artifact opt out of inline delivery. **There is no inverse.** An
instance whose type default is `ToolsOnly` cannot be widened to `Inline`.

Why one-way: going to tools-only always succeeds, so this override can never
silently fail. A two-way override would re-introduce the exact silent-config
antipattern this whole design exists to remove — set `Inline`, model doesn't
support the modality, resolver quietly falls back to tools, user has no idea
why their override didn't take effect. If a deployment legitimately needs an
instance to be `Inline` when its type default is `ToolsOnly`, the answer is
to change the type or pick a different one.

## MIME resolution — wildcards, priority, tiebreakers

`ArtifactMetadataEngine.GetArtifactTypeByMimeType(mimeType, fileExtension?)`
walks the registry as follows (see
`packages/MJCoreEntities/src/engines/artifact-mime-resolver.ts`):

```
1. Filter to types whose ContentType pattern matches the upload's MIME
   (after stripping any "; charset=..." parameter, case-insensitive)
2. Bucket by specificity: exact > subtype wildcard
3. Within the highest-specificity bucket, sort by Priority desc
4. Tiebreaker if priorities are equal:
   a. SystemSupplied = false beats SystemSupplied = true
      (user customizations win over shipped defaults)
   b. otherwise lowest ID wins (deterministic)
5. application/octet-stream + extension hint: also consult any type whose
   fileExtensions list contains the hint
```

At engine boot, `LogArtifactTypeRegistryConflicts()` walks the registry and
emits WARN for any pair of types that share an identical
`(ContentType, Priority, SystemSupplied)` triple — almost always a config
mistake that the deterministic-ID tiebreaker would otherwise hide.

## Unknown / unregistered file types

Default policy: **reject at upload time.** The user sees a clear error
naming the supported types before any bytes hit storage. No silent
JSON-fallback, no base64-stuffing of random binaries into prompts. The
`text/*` catchall already covers anything text-like, and the registry covers
common binary formats.

Per-agent escape hatch: **`AIAgent.AcceptUnregisteredFiles: bool`**
(default `false`). Set `true` for a specific agent — a research agent
investigating unknown formats — and unrecognized uploads resolve to the
Generic Binary artifact type, exposing only `get_full` (base64 bytes) and
`get_metadata` (size + sha256). There is no system-wide flag;
permissiveness is always scoped to an agent that has explicitly opted in.

## INLINE_SIZE_CAP

`100 KB` per artifact, by default. Single source of truth in
`packages/MJServer/src/resolvers/artifact-routing.ts`. Configurable via
environment variable / `mj.config.cjs` (TODO). This is defense-in-depth
against future configuration drift — no MIME-list oversight or registry
change can silently 6× the prompt because the cap is enforced regardless of
the configured delivery mode.

## Authoring a tool library

The base class — `BaseArtifactToolLibrary` in
`packages/AI/CorePlus/src/artifact-tool-library.ts` — provides `get_full`
for free. Subclasses implement two methods:

```typescript
@RegisterClass(BaseArtifactToolLibrary, 'MyToolLibrary')
export class MyToolLibrary extends BaseArtifactToolLibrary {
    protected GetSubclassToolList(): ArtifactToolDefinition[] {
        return [
            // ...your subclass-specific tools...
        ];
    }

    protected async InvokeSubclassTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        // ...dispatch on toolName...
    }
}
```

The default `get_full` returns utf-8 passthrough for string content and
base64 for `Buffer`. Override `GetFull()` (and optionally
`GetFullToolDefinition()`) only when "the full content" needs domain
transformation. The canonical example is `PDFToolLibrary`, which overrides
`GetFull` to return extracted text rather than the raw PDF bytes — far more
useful to an agent than a base64 blob.

Then wire it through metadata:

1. Add a `.your-type-artifact-type.json` file under `/metadata/artifact-types/`
2. Set `ToolLibraryClass` to the registered class name
3. Pick a `DefaultDeliveryMode` (`ToolsOnly` for non-multimodal content)
4. `mj sync push --dir=metadata --include="artifact-types"`

## Deprecated: ConversationDetailAttachment

The `MJ: Conversation Detail Attachments` entity is `Status='Deprecated'`
as of v5.35.x. The table, generated entity class, GraphQL types, and stored
procedures all remain functional — runtime use produces the framework's
standard console warning. New code should write to
`ConversationArtifactVersion` directly. The attachment path will be removed
in a future major version once known consumers have migrated.
