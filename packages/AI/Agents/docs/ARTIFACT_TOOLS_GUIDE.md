# Artifact Tools Guide

How file uploads, governed collaborative artifacts, and the artifact tool dispatch path reach an AI agent's context. Covers storage vs. rendering, the Artifact Type registry, delivery modes, MIME resolution, the 13 built-in tool libraries, always-on workspace tools, security guards, and authoring custom tool libraries.

## Storage vs. rendering: two different decisions

Every file or governed document an agent operates on (uploaded by a user, created mid-run via workspace tools, or produced as an agent output) lives in MemberJunction as an **`MJ: Artifacts`** (`MJArtifactEntity`) + **`MJ: Artifact Versions`** (`MJArtifactVersionEntity`) row pair. Each version row carries the content (`Content` JSON/text or `FileID` referencing MJStorage), MIME type (`ContentType`), filename, size, SHA hash, and a foreign key to the registered **`MJ: Artifact Types`** (`MJArtifactTypeEntity`) definition.

How the bytes actually reach the LLM is a separate decision made per agent turn by `RouteArtifact()` (`packages/MJServer/src/resolvers/artifact-routing.ts`):

| Path | What the LLM sees |
|---|---|
| **Inline** | A native multimodal content block on the user message: `image_url`, `audio_url`, `video_url`, or `file_url`. Vision-capable models inspect the content directly. |
| **Tools** | An entry on the artifact manifest (`ArtifactToolManager.ToManifestString`) plus registered `BaseArtifactToolLibrary` tools (`get_full`, `json_path`, `get_text`, `read_range`, …). The agent reads or mutates content lazily via `artifactToolCalls` (or native `artifact_tool`). |

Delivery routing is driven by **artifact-type metadata, model driver capability, and a one-way per-instance override** — never by a hardcoded MIME allowlist in the resolver.

## Artifact Type registry

Each registered `MJ: Artifact Types` record carries:

| Field | Meaning |
|---|---|
| `Name` | Human-readable label (`Markdown Document`, `Excel Spreadsheet`, `Presentation`, `Whiteboard`, `JSON`, `PDF`, `Image`, …) |
| `ContentType` | MIME pattern. Exact (`application/pdf`, `application/vnd.mj.spreadsheet+json`) or subtype wildcard (`image/*`, `text/*`). |
| `DriverClass` | Angular `@RegisterClass(BaseArtifactViewerPluginComponent, ...)` viewer plugin class name. |
| `ToolLibraryClass` | Class name of the `BaseArtifactToolLibrary` subclass providing server-side tools (`null` for inline-only media types such as Image, Audio, Video). |
| `DefaultDeliveryMode` | `Inline` or `ToolsOnly`. |
| `Priority` | Higher wins within a specificity tier to disambiguate overlapping MIME patterns. |
| `SystemSupplied` | `true` for MJ-shipped defaults, `false` for org customizations (customizations win over shipped defaults at equal priority). |

Anything outside the registry is rejected at upload time unless the target agent opts into `AcceptUnregisteredFiles`.

## Routing — when each path fires

`RouteArtifact(input: ArtifactRoutingInput)` in `packages/MJServer/src/resolvers/artifact-routing.ts` evaluates:

```
TypeDefault = artifactType.DefaultDeliveryMode      // 'Inline' | 'ToolsOnly'
ForceToolsOnly = artifactVersion.ForceToolsOnly     // boolean, default false

if TypeDefault == 'ToolsOnly' OR ForceToolsOnly:
    return { delivery: 'tools' }                    // registered with ArtifactToolManager

if NOT ModelSupportsModality(mimeType):
    return { delivery: 'error', message }           // explicit remediation error

if SizeBytes >= InlineSizeCap (100 KB default):
    return { delivery: 'tools', Annotation }        // manifest annotation + server WARN log

return { delivery: 'inline' }
```

Two key guarantees:
- **Modality mismatch is a hard error**, not a silent fallback — configuring an `image/*` artifact as `Inline` for a non-vision model surfaces a remediable error immediately.
- **Size cap fallback is explicit.** When an `Inline`-default artifact exceeds `InlineSizeCap` (`100 KB` default), it routes to `ArtifactToolManager` with a manifest note and a server WARN log.

## The per-instance override is one-way

`MJArtifactVersionEntity.ForceToolsOnly` (`boolean`, default `false`) lets a specific artifact opt out of inline delivery. **There is no inverse**: an instance whose type default is `ToolsOnly` cannot be forced `Inline`, avoiding silent modality failures.

## MIME resolution — wildcards, priority, tiebreakers

`ArtifactMetadataEngine.GetArtifactTypeByMimeType(mimeType, fileExtension?)` (`packages/MJCoreEntities/src/engines/artifact-mime-resolver.ts`) resolves MIME types deterministically:

1. Match `ContentType` patterns against the upload MIME (case-insensitive, stripping `; charset=...`).
2. Bucket by specificity: exact match > subtype wildcard.
3. Within the highest-specificity bucket, sort by `Priority` descending.
4. Tiebreak equal priority by `SystemSupplied === false` (custom) over `true` (shipped), then lowest ID.
5. For `application/octet-stream` with an extension hint, consult types matching the extension.

At boot, `LogArtifactTypeRegistryConflicts()` warns on any `(ContentType, Priority, SystemSupplied)` collisions.

## Unknown / unregistered file types

Default policy rejects unrecognized file types before storage. Per-agent opt-in `AIAgent.AcceptUnregisteredFiles` (default `false`) allows a specific agent (such as a research agent) to accept unknown uploads under `GenericBinaryToolLibrary` (`get_full`, `get_metadata`).

## Built-in Tool Libraries (`packages/AI/Agents/src/artifact-tools/`)

All 13 built-in subclasses extend `BaseArtifactToolLibrary` (`packages/AI/CorePlus/src/artifact-tool-library.ts`), which supplies `get_full` automatically (overridden where domain extraction is needed, such as `PDFToolLibrary`).

| Library Class | Target Artifact Type(s) | Total Tools | Tool Names |
|---|---|---|---|
| `DocumentToolLibrary` | `Markdown Document` (**MJ Docs**) | 26 | `get_full`, `get_outline`, `get_section`, `get_blocks`, `search_blocks`, `grep`, `get_lines`, `insert_block_after`, `replace_block`, `delete_block`, `upsert_table`, `insert_live_block`, `embed_artifact_block`, `move_block`, `duplicate_block`, `mutate_markdown_table`, `upsert_frontmatter`, `set_lock`, `release_lock`, plus shared NW-3 tools (`list_comments`, `add_comment`, `reply_comment`, `resolve_comment`, `propose_suggestion`, `review_suggestion`, `list_suggestions`) |
| `SlideDeckToolLibrary` | `Presentation` (**MJ Slides**) | 29 | `get_full`, `read_deck`, `get_deck_outline`, `get_slide`, `add_slide`, `update_slide`, `delete_slide`, `duplicate_slide`, `reorder_slides`, `upsert_slide_element`, `update_slide_region`, `delete_slide_element`, `update_speaker_notes`, `update_deck_metadata`, `apply_theme`, `generate_deck_from_markdown`, `duplicate_region`, `align_distribute_regions`, `upsert_speaker_notes`, `batch_mutate_slides`, `set_lock`, `release_lock`, plus shared NW-3 tools (`list_comments`, `add_comment`, `reply_comment`, `resolve_comment`, `propose_suggestion`, `review_suggestion`, `list_suggestions`) |
| `SpreadsheetToolLibrary` | `Excel Spreadsheet` (**MJ Sheets**) | 47 | `get_full`, `get_workbook_outline`, `read_workbook`, `read_range`, `write_cells`, `format_range`, `clear_range`, `insert_rows`, `delete_rows`, `insert_columns`, `delete_columns`, `add_sheet`, `rename_sheet`, `duplicate_sheet`, `reorder_sheets`, `delete_sheet`, `set_sheet_layout`, `upsert_live_table`, `refresh_live_tables`, `upsert_chart`, `delete_chart`, `delete_live_table`, `embed_artifact`, `delete_embedded_artifact`, `sort_and_filter`, `get_sheets`, `get_sheet_data`, `search_cells`, `aggregate_column`, `get_formulas`, `merge_cells`, `unmerge_cells`, `upsert_conditional_format`, `delete_conditional_format`, `upsert_validation_rule`, `delete_validation_rule`, `upsert_named_range`, `delete_named_range`, `set_lock`, `release_lock`, plus shared NW-3 tools (`list_comments`, `add_comment`, `reply_comment`, `resolve_comment`, `propose_suggestion`, `review_suggestion`, `list_suggestions`) |
| `WhiteboardToolLibrary` | `Whiteboard` | 8 | `get_full`, `get_board_summary`, `list_elements`, `upsert_nodes`, `connect_nodes`, `add_sticky_notes`, `delete_elements`, `auto_layout` |
| `DataSnapshotToolLibrary` | `Data Snapshot` | 9 | `get_full`, `get_tables`, `get_schema`, `get_rows`, `search_rows`, `aggregate`, `group_aggregate`, `compute`, `filter` |
| `DocxToolLibrary` | Word (`.docx`) | 6 | `get_full`, `get_text`, `get_html`, `search_text`, `get_lines`, `get_sections` |
| `ExcelToolLibrary` | Binary Excel (`.xlsx`) | 6 | `get_full`, `get_sheets`, `get_sheet_data`, `search_cells`, `aggregate_column`, `get_formulas` |
| `PDFToolLibrary` | `PDF` | 5 | `get_full` (overridden extracted text), `get_page_count`, `get_text`, `search_text`, `get_metadata` |
| `CSVToolLibrary` | `CSV` | 4 | `get_full`, `get_columns`, `get_rows`, `search` |
| `JSONToolLibrary` | `JSON` | 5 | `get_full`, `json_path`, `json_keys`, `json_search`, `json_iterate` |
| `SearchResultSetToolLibrary` | `Search Result Set` | 6 | `get_full`, `filterByScore`, `groupBySourceProvider`, `getMatchingChunks`, `followSourceLink` (also accepts `follow_source_link`), `rerankInline` (also accepts `rerank_results`) |
| `TextToolLibrary` | `text/*` | 3 | `get_full`, `grep`, `get_lines` |
| `GenericBinaryToolLibrary` | `application/octet-stream` | 2 | `get_full`, `get_metadata` |

### NW-3 Comment & Suggest-Mode Tool Schemas

`GetSharedCommentAndSuggestionToolDefinitions(domain)` (`packages/AI/Agents/src/artifact-tools/artifact-comment-suggestion-helper.ts`) injects 7 uniform tools into `DocumentToolLibrary`, `SlideDeckToolLibrary`, and `SpreadsheetToolLibrary`:

- **`list_comments`**: `{ status?: 'open' | 'resolved' | 'all', anchorFilter?: { heading?, blockId?, sheet?, range?, slideNumber?, slideId?, elementId? } }`
- **`add_comment`**: `{ anchor: object, body: string }` (required: `['anchor', 'body']`)
- **`reply_comment`**: `{ threadId: string, body: string }` (required: `['threadId', 'body']`)
- **`resolve_comment`**: `{ threadId: string, resolved?: boolean, resolutionNote?: string }` (required: `['threadId']`)
- **`propose_suggestion`**: `{ anchor: object, originalSlice: string, proposedReplacement: string, rationale: string, expectedRevisionHash?: string }` (required: `['anchor', 'originalSlice', 'proposedReplacement', 'rationale']`) — writes non-destructively to the Yjs `suggestions` map and `Configuration.suggestions` without mutating canonical artifact content.
- **`review_suggestion`**: `{ suggestionId: string, decision: 'accept' | 'reject', comment?: string, expectedRevisionHash?: string }` (required: `['suggestionId', 'decision']`) — enforcing lock checks and ACL edit permissions before applying accepted suggestions.
- **`list_suggestions`**: `{ status?: 'Pending' | 'Accepted' | 'Rejected' | 'All' }` — reads Suggest-Mode proposals across the active live Yjs collaboration room and persisted `MJ: Artifact Versions.Configuration.suggestions`.

### NW-4 Spreadsheet Structure & Formula Tool Schemas

`SpreadsheetToolLibrary` includes NW-4 workbook structural/analytics tools powered by `SpreadsheetEngine` (`packages/MJCoreEntities/src/custom/SpreadsheetEngine.ts`):

- **`merge_cells`** / **`unmerge_cells`**: `{ sheet?, range, expectedRevisionHash? }` (required: `['range']`; validates bounds and overlapping merges).
- **`upsert_conditional_format`**: `{ sheet?, ruleId?, range, operator ('gt' | 'lt' | 'eq' | 'between' | 'contains'), value1, value2?, highlightTone ('success' | 'warning' | 'danger' | 'info'), expectedRevisionHash? }` (required: `['range', 'operator', 'value1', 'highlightTone']`).
- **`delete_conditional_format`**: `{ sheet?, ruleId, expectedRevisionHash? }` (required: `['ruleId']`).
- **`upsert_validation_rule`**: `{ sheet?, ruleId?, range, ruleType ('list' | 'numberRange' | 'notEmpty'), allowedValues?, minValue?, maxValue?, errorMessage?, expectedRevisionHash? }` (required: `['range', 'ruleType']`).
- **`delete_validation_rule`**: `{ sheet?, ruleId, expectedRevisionHash? }` (required: `['ruleId']`).
- **`upsert_named_range`**: `{ name, sheet?, range, description?, expectedRevisionHash? }` (required: `['name', 'range']`).
- **`delete_named_range`**: `{ name, expectedRevisionHash? }` (required: `['name']`).

`SpreadsheetEngine` evaluates 100+ Excel formula functions, including NW-4 2D dynamic arrays (`FILTER`, `UNIQUE`, `SORT`, `SORTBY`, `SEQUENCE`, `LET`, `LAMBDA`) with automatic `#SPILL!` collision detection and live `=MJ.QUERY`, `=MJ.VIEW`, and `=MJ.AI` AST evaluation.

## Authoring a tool library

`BaseArtifactToolLibrary` (`packages/AI/CorePlus/src/artifact-tool-library.ts`) provides `GetToolList()` / `InvokeTool()` and the default `get_full` implementation. Subclasses override protected camelCase hooks using strictly typed `ArtifactToolArgs` (never `any` or `unknown`):

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
    BaseArtifactToolLibrary,
    type ArtifactToolArgs,
    type ArtifactToolDefinition,
    type ArtifactToolExecutionContext,
    type ArtifactToolResult
} from '@memberjunction/ai-core-plus';

@RegisterClass(BaseArtifactToolLibrary, 'MyToolLibrary')
export class MyToolLibrary extends BaseArtifactToolLibrary {
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            // ...your subclass-specific tools...
        ];
    }

    protected async invokeSubclassTool(
        toolName: string,
        args: ArtifactToolArgs,
        content: string | Buffer,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        // ...dispatch on toolName; use context.contextUser, context.provider, context.isEditor...
        return { success: false, data: null, errorMessage: `Unknown tool: ${toolName}` };
    }
}
```

Override `getFull(content: string | Buffer, context?: ArtifactToolExecutionContext)` and `getFullToolDefinition()` only when full-content retrieval needs domain transformation (for example, `PDFToolLibrary` extracts text instead of returning raw PDF bytes).

Then wire it through metadata:
1. Add or update the type in [`metadata/artifact-types/`](../../../../metadata/artifact-types/).
2. Set `ToolLibraryClass` to the registered class name (`'MyToolLibrary'`).
3. Set `DefaultDeliveryMode` (`'ToolsOnly'` for non-multimodal types).
4. Push with `mj sync push --dir=metadata --include="artifact-types"`.

## Always-On Workspace Tools & `ArtifactToolManager`

When `ArtifactToolManager` (`packages/AI/Agents/src/ArtifactToolManager.ts`) is initialized with `contextUser` and `provider` (`workspaceEnabled: true`), Loop agents expose six workspace-level tools even when zero artifacts were attached at the start of the turn and regardless of `ArtifactCreationMode`:

| Workspace Tool | Purpose |
|---|---|
| `create_artifact` | Create a new governed artifact (`Markdown Document`, `Presentation`, `Excel Spreadsheet`, `Whiteboard`) or materialize initial content, persisting v1 and attaching Yjs live state. |
| `open_artifact` | Register an existing readable `ArtifactID` into the current turn's `ArtifactToolManager` scope (resolving latest or pinned version and checking ACL permissions). |
| `list_workspace_artifacts` | List collaborative artifacts visible to the caller in the current conversation/workspace scope. |
| `create_synthesized_artifact` | Synthesize a new `Markdown Document`, `Presentation`, or `Excel Spreadsheet` from multiple readable source artifacts via `Artifact.SynthesizeFromSources` / `GovernedArtifactService`. |
| `refresh_and_snapshot_artifact` | Re-evaluate Live MJ Blocks / `=MJ.*` formulas across an existing artifact and create a new immutable snapshot version if outputs changed. |
| `reload_artifact` | Reload latest persisted/Yjs state for an already-open artifact inside the active turn. |

### `artifact_tool` ID Resolution & Workspace Routing

In native tool-calling mode (`packages/AI/Agents/src/native-tools/framework-tools.ts`), `artifact_tool` declares `required: ['tool']` and defaults an omitted or empty `artifactId` to `'workspace'`. Inside `ArtifactToolManager.InvokeTool`:
- Workspace tools (`create_artifact`, `open_artifact`, `list_workspace_artifacts`, `create_synthesized_artifact`, `refresh_and_snapshot_artifact`) are intercepted **before** artifact lookup so both `artifactId: 'workspace'` and `artifactId: '*'` dispatch cleanly.
- `resolveExistingArtifactEntry(artifactId)` expands `'*'` **only** when `this.artifacts.size === 1`; if the caller supplies an explicit unknown `ArtifactID`, it fails explicitly rather than silently falling back.

### Realtime `ArtifactWorkspace` Channel vs. Server Tools

While Loop agents mutate artifact versions via `ArtifactToolManager` (`artifactToolCalls` / `artifact_tool`), a live voice/co-agent uses the `ArtifactWorkspace` realtime channel (`ContextTool` with `target: { channel: 'ArtifactWorkspace' }`) to control the user's side-by-side workspace surface:
- Verbs: `open`, `focus`, `show_version`, `refresh`, `close`, `navigate_to_anchor` (`{ blockId?, heading?, sheet?, range?, slideNumber?, slideId?, elementId? }`), and `set_view_mode` (`{ mode: 'edit' | 'suggest' | 'diff' | 'present' }`).
- Events emitted back to the session context: `opened`, `focused`, `version_changed`, `newer_version_available`, `refreshed`, `selection_changed` (from `EmitSelectionDelta`), `navigated_to_anchor`, `view_mode_changed`, `closed`.
- See [`guides/REALTIME_CHANNELS_GUIDE.md`](../../../../guides/REALTIME_CHANNELS_GUIDE.md) for the complete channel contract.

## Security & Concurrency Guards

Every server-side artifact tool enforces defense-in-depth protections:

1. **ReDoS & Bounded Regex Execution:** All user/agent regex patterns (`grep`, `search_blocks`, `search_cells`, `search_rows`, `grepHelper.ts`, `artifact-tool-helpers.ts`) pass through `CompileSafeUserRegex` / `IsSafeUserRegex` (`@memberjunction/core-entities`) and `ExecuteSafeRegexBatchWithRecovery` (`packages/AI/Agents/src/artifact-tools/node-vm-safe-regex.ts`) with a `65,536`-byte input ceiling per block/line and millisecond timeout recovery.
2. **Serialized Mutation & Server Lock Enforcement:** Mutations coordinate through `GovernedArtifactService.Instance.WithArtifactLock` (`packages/AI/Agents/src/GovernedArtifactService.ts`) and check active `set_lock` / `release_lock` region locks persisted on the Yjs collaboration room (`lockOwners` / `HasActiveLocks`) before applying edits or accepting suggestions (`review_suggestion`).
3. **Hierarchical ACL & Embedded Artifact Checks:** `ArtifactPermissionEngine.Instance.ResolvePermissions` enforces Collection-inherited permissions (including `Defer`) on every inspect/mutate/comment/suggestion call (`artifact-comment-suggestion-helper.ts`), and `ValidateEmbeddedArtifactAccess` + `ResolveEmbeddedArtifactId` / `ResolveEmbeddedVersionId` guard embedded OLE/block references with ancestor cycle detection.
4. **Row-Level Security on Search Links:** `SearchResultSetToolLibrary.followSourceLink` executes entity loads under `contextUser` so agents never bypass user RLS.
5. **Freeze & Integrity Verification:** Live MJ Blocks / `=MJ.*` formulas freeze into HMAC-SHA256 verified snapshots (verified with `MJ_ARTIFACT_FREEZE_HMAC_SECRET` / guest share secret) rather than auto-recomputing untrusted expressions for non-owners.

## Output Artifact Lifecycle (`artifactDirective`) & `_ARTIFACTS_ENABLED` Prompt Gating

When a Loop agent completes a turn (`taskComplete: true`), `AgentRunner` can automatically persist the agent's payload as an `MJ: Artifacts` + `MJ: Artifact Versions` pair.

### 1. Per-Agent Prompt Gating (`_ARTIFACTS_ENABLED`, Default: `true`)

`BaseAgent.isArtifactSupportEnabled(agent)` inspects `AIAgent.ArtifactCreationMode`:

| `AIAgent.ArtifactCreationMode` | `_ARTIFACTS_ENABLED` | System Prompt Behavior |
|---|---|---|
| `'Always'`, `'Prompt'`, or `null` / `undefined` *(default)* | `true` | Injects the `artifactDirective` JSON schema, lifecycle instructions, and `_CONVERSATION_ARTIFACTS` catalog into `<mj-runtime-state>`. |
| `'Never'` or `'System Only'` | `false` | Strips automatic turn-end `artifactDirective` JSON instructions (`{% if _ARTIFACTS_ENABLED != false %}`) and suppresses `<mj-runtime-state>` artifact catalog rendering. Note that explicit workspace tools (`create_artifact`, `open_artifact`, etc.) remain available when `ArtifactToolManager` has `workspaceEnabled: true`. |

### 2. The `artifactDirective` Contract

```typescript
export interface AgentArtifactDirective {
    behavior: 'create-new' | 'version-source' | 'suppress';
    targetArtifactId?: string;
    name?: string;
    description?: string;
}
```

### 3. Full-Conversation Artifact Discovery & `ExecuteAgentResult.touchedArtifacts`

- `AgentRunner.loadConversationArtifactsCatalog` loads prior `Direction = 'Output'` artifact versions (`Visibility !== 'System Only'`), passing `ConversationArtifactSummary[]` as `_CONVERSATION_ARTIFACTS`.
- `GovernedArtifactService` populates `ExecuteAgentResult.touchedArtifacts` (`GovernedRunArtifactSummary[]` with `ArtifactID`, `ArtifactVersionID`, `VersionNumber`, `Name`, `ArtifactTypeName`, `DriverClass?`, `Operation`) so callers — including realtime delegation and `ArtifactWorkspaceChannel` — open newly created or updated collaborative artifacts even when `result.payload` is `{}`.

### 4. Metadata-Driven Naming (`ArtifactType.ExtractRules`)

Each type in [`metadata/artifact-types/.artifact-types.json`](../../../../metadata/artifact-types/.artifact-types.json) can declare `ExtractRules` to extract `name` and `description` when `artifactDirective` omits them.

## Deprecated: `MJ: Conversation Detail Attachments`

The `MJ: Conversation Detail Attachments` entity is `Status='Deprecated'`. New code should write to `MJ: Artifacts` / `MJ: Artifact Versions` (`MJArtifactEntity` / `MJArtifactVersionEntity`) directly.
