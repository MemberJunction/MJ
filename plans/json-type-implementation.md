# JSONType Expansion Implementation Plan

## Overview
Adding strongly-typed `*Object` accessors (via JSONType metadata) to entity fields that store JSON blobs. CodeGen emits cached getter/setters with automatic `JSON.parse`/`JSON.stringify`, eliminating manual parsing scattered across the codebase.

## Already Done (4 fields)
- [x] `ApplicationEntity.DefaultNavItems` → `IDefaultNavItem[]`
- [x] `ContentSourceTypeEntity.Configuration` → `IContentSourceTypeConfiguration`
- [x] `ContentSourceEntity.Configuration` → `IContentSourceConfiguration`
- [x] `ContentTypeEntity.Configuration` → `IContentTypeConfiguration`

---

## Tier 1a — User Views (do first)

High-traffic UI state fields parsed/written heavily in `MJUserViewEntityExtended.ts`.

| Status | Entity | Field | Interface | Notes |
|--------|--------|-------|-----------|-------|
| [ ] | User Views | `GridState` | `IGridState` | Column widths, visibility, formatting, sort settings |
| [ ] | User Views | `FilterState` | `IFilterState` | Filter logic trees (`{logic: "and", filters: [...]}`) |
| [ ] | User Views | `SortState` | `ISortState` | Sort field + direction config |
| [ ] | User Views | `CardState` | `ICardState` | Card display mode config (title field, subtitle, display fields) |
| [ ] | User Views | `DisplayState` | `IDisplayState` | Grid/cards/timeline/chart mode settings |

### Implementation Steps — Tier 1a
- [x] Study `MJUserViewEntityExtended.ts` and consuming code to define accurate interface shapes
- [x] Create interface `.ts` files in `metadata/entities/JSONType-interfaces/`
  - `IGridState.ts` — includes nested IGridColumnSetting, IColumnFormat, IFilterNode, IGridAggregatesConfig, etc.
  - `IFilterState.ts` — composite filter tree (IFilterState + IFilterItem)
  - `ISortState.ts` — ISortStateItem (JSONTypeIsArray=true, emits ISortStateItem[])
  - `ICardState.ts` — card size preference
  - `IDisplayState.ts` — view mode + ITimelineState, IDisplayCardState, IGridDisplayState
- [x] Create `.entity-field-jsontype-user-views.json` metadata file
- [ ] Push metadata with `mj sync push`
- [ ] Run CodeGen to emit typed accessors
- [ ] Update consuming code to use typed accessors instead of `JSON.parse()`

---

## Tier 1b — Model Parameters & Credentials

High-value, clear interface shapes, heavily used but separate from User Views.

| Status | Entity | Field | Interface | Notes |
|--------|--------|-------|-----------|-------|
| [ ] | AI Prompt Models | `ModelParameters` | `IModelParameters` | Parsed on every prompt execution (`ExecutionPlanner.ts`). `{ temperature?, max_tokens?, top_p?, seed?, ... }` |
| [ ] | Credentials | `Values` | `Record<string, string>` | Parsed in CredentialEngine + Angular edit panels. Key-value credential store. |
| [ ] | Credential Types | `FieldSchema` | JSON Schema | Parsed to build dynamic forms in Angular. Defines credential field structure. |

---

## Tier 2 — Agent Execution Pipeline

Core agent framework fields parsed at every step.

| Status | Entity | Field | Interface | Notes |
|--------|--------|-------|-----------|-------|
| [ ] | AI Agent Run Steps | `InputData` | open object | Stringified/parsed every step in `base-agent.ts` |
| [ ] | AI Agent Run Steps | `OutputData` | open object | Step output |
| [ ] | AI Agent Runs | `Data` | open object | Agent execution params |
| [ ] | AI Agent Runs | `StartingPayload` | open object | Initial payload JSON |
| [ ] | AI Agent Runs | `FinalPayload` | open object | Final payload JSON |
| [ ] | AI Agent Runs | `AgentState` | open object | Full agent state serialization |
| [ ] | AI Agents | `PayloadSelfReadPaths` | `string[]` | JSON array of paths |
| [ ] | AI Agents | `PayloadSelfWritePaths` | `string[]` | JSON array of paths |
| [ ] | AI Agents | `ScopeConfig` | `IScopeConfig` | Multi-tenant scope dimensions |
| [ ] | AI Agent Steps | `Configuration` | `IAgentStepConfiguration` | ForEach/While loop config |
| [ ] | AI Agent Steps | `ActionInputMapping` | `IActionInputMapping` | Maps values to action params |
| [ ] | AI Agent Steps | `ActionOutputMapping` | `IActionOutputMapping` | Maps action output to payload |
| [ ] | AI Agent Relationships | `SubAgentInputMapping` | open object | Parent→sub-agent payload mapping |
| [ ] | AI Agent Relationships | `SubAgentOutputMapping` | open object | Sub-agent→parent result mapping |
| [ ] | AI Agent Relationships | `SubAgentContextPaths` | `string[]` | Paths to send as context |

**Design decision needed**: Many agent payload fields are intentionally open-ended. Options:
- Use `Record<string, unknown>` for generic payloads (still adds cached parsing + auto-stringify)
- Define `IAgentPayload` base with common fields, extensible via generics

---

## Tier 3 — Configuration Fields

Widely used but less frequently parsed.

| Status | Entity | Field | Interface | Notes |
|--------|--------|-------|-----------|-------|
| [ ] | Scheduled Jobs | `Configuration` | `IScheduledJobConfiguration` | Parsed in `BaseScheduledJob.ts` |
| [ ] | Company Integrations | `Configuration` | `ICompanyIntegrationConfig` | Every connector parses this |
| [ ] | Vector Indexes | `ProviderConfig` | open object | Provider-specific vector DB config |
| [ ] | Vector Databases | `Configuration` | open object | Vector DB provider settings |
| [ ] | Entity Documents | `Configuration` | `IEntityDocumentConfig` | Controls vector metadata field inclusion |
| [ ] | Workspaces | `Configuration` | `IWorkspaceConfig` | Tabs, layout, theme, active tab |
| [ ] | MCP Server Connections | `EnvironmentVars` | `Record<string, string>` | Env vars for Stdio transport |
| [ ] | MCP Servers | `CommandArgs` | `string[]` | Command arguments array |

---

## Tier 4 — Logging / Audit / Test (lower urgency)

Write-once/read-rarely fields. Still benefit from typed accessors.

| Status | Entity | Fields | Notes |
|--------|--------|--------|-------|
| [ ] | AI Prompt Runs | `Messages`, `ModelSelection`, `ValidationAttempts`, `FailoverErrors`, etc. (9 fields) | Execution logs |
| [ ] | Test Runs | `InputData`, `ExpectedOutputData`, `ActualOutputData`, `ResultDetails`, etc. (7 fields) | Test infrastructure |
| [ ] | Test Entities | `Configuration`, `InputDefinition`, `ExpectedOutcomes`, `Variables` (5 fields) | Test definitions |
| [ ] | Conversation Details | `ActionableCommands`, `AutomaticCommands`, `ResponseForm` | Chat UI commands |
| [ ] | Action Execution Logs | `Params`, `Message` | Action audit trail |
| [ ] | Queue Tasks | `Data`, `Options`, `Output` | Task queue payloads |

---

## Metadata File Organization

| File | Content |
|------|---------|
| `.entity-field-jsontype-defaults.json` | Applications (existing) |
| `.entity-field-jsontype-content-autotagging.json` | Content Sources/Types (existing) |
| `.entity-field-jsontype-user-views.json` | **New** — Tier 1a |
| `.entity-field-jsontype-ai-prompts.json` | **New** — Tier 1b + Tier 4 prompt runs |
| `.entity-field-jsontype-credentials.json` | **New** — Tier 1b |
| `.entity-field-jsontype-ai-agents.json` | **New** — Tier 2 |
| `.entity-field-jsontype-integrations.json` | **New** — Tier 3 integrations + scheduling |
| `.entity-field-jsontype-vectors.json` | **New** — Tier 3 vectors + entity docs |

---

## Implementation Pattern (for reference)

For each field:
1. Create a `.ts` interface file in `metadata/entities/JSONType-interfaces/`
2. Add the metadata record to the appropriate `.entity-field-jsontype-*.json` file
3. Push metadata with `mj sync push --dir=metadata --include="entities"`
4. Run CodeGen — it emits the cached `*Object` accessor automatically
5. Update consuming code to use the typed accessor instead of `JSON.parse()`
