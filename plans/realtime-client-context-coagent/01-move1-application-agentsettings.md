# Move 1 — `Application.AgentSettings` metadata

**Goal:** Add a strongly-typed JSON column to the `Application` table that is the single place an app declares its default agent, the agents relevant to it, app-scoped client tools, and realtime persona/disclosure overrides. Fold it into the default-agent resolution chain.

**Independently shippable:** Yes. On its own it improves default-agent config and gives the app an agent-awareness surface; Moves 3 & 4 consume it.

## Template we're copying

`Application.DefaultNavItems` is an existing JSONType column with a generated interface — copy it beat-for-beat:
- Interface file: `metadata/entities/JSONType-interfaces/IDefaultNavItem.ts`
- CodeGen registration: `metadata/entities/.entity-field-jsontype-defaults.json` (references the interface via `@file:` + `JSONTypeIsArray`)
- Generated accessor: `MJApplicationEntity.DefaultNavItemsObject` getter/setter (lazy JSON parse/stringify) in `packages/MJCoreEntities/src/generated/entity_subclasses.ts`

## Tasks

### 1.1 Migration — add the column
New migration in `migrations/v5/` (highest-numbered folder), naming `VYYYYMMDDHHMM__v5.43.x__Application_AgentSettings.sql`.

```sql
ALTER TABLE ${flyway:defaultSchema}.Application ADD
    AgentSettings NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'App-scoped agent configuration JSON (shape = IAgentSettings). Declares the default agent, relevant agents available to conversational and realtime co-agents, app-scoped client tool references, and realtime persona/disclosure overrides that layer into the agent config cascade. Null = no app-level agent config.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Application',
    @level2type = N'COLUMN', @level2name = N'AgentSettings';
```

> No `__mj_*` columns, no FK indexes — CodeGen handles those. Single `ALTER TABLE`.

### 1.2 Author the `IAgentSettings` interface
New file `metadata/entities/JSONType-interfaces/IAgentSettings.ts`:

```typescript
/**
 * App-scoped agent configuration. Stored as JSON in Application.AgentSettings.
 * Read by the conversations default-agent resolver and the realtime co-agent
 * cascade. Every field optional — an app opts into exactly what it needs.
 */
export interface IAgentSettings {
    /** The app's default/lead agent (conversational default AND realtime lead identity). Agent ID. */
    DefaultAgentID?: string | null;

    /** Agents relevant to this app — the static allowed-target set for the co-agent. Union-accumulated with type + dynamic. */
    RelevantAgents?: IAppRelevantAgent[];

    /** App-scoped static client tools, by tool-definition reference. Surfaced to every agent acting in this app. */
    ClientTools?: IAppClientToolRef[];

    /** Realtime co-agent overrides that layer into the config cascade above the agent's own TypeConfiguration. */
    Realtime?: IAppRealtimeOverrides;
}

export interface IAppRelevantAgent {
    /** Agent ID (loop or flow — transparent to the co-agent). */
    AgentID: string;
    /** Optional friendly label for manifest/disclosure ("Skip", "Query Builder"). */
    Label?: string | null;
    /** Per-target disclosure override; falls back to the effective default disclosure. */
    Disclosure?: AgentDisclosurePolicy | null;
    /** If true, surfaced in pickers / proactively offered; if false, available but not advertised. */
    Advertised?: boolean | null;
}

export interface IAppClientToolRef {
    /** References MJ: AI Client Tool Definitions by ID (preferred) or Name. */
    ClientToolDefinitionID?: string | null;
    Name?: string | null;
    /** Optional app-level priority for first-match-wins resolution. */
    Priority?: number | null;
}

/** Subset of the realtime config section an app may override. Shape mirrors RealtimeConfigSection keys. */
export interface IAppRealtimeOverrides {
    /** Default delegation disclosure for this app's co-agent. */
    Disclosure?: AgentDisclosurePolicy | null;
    /** Persona override folded into the session system prompt at mint. */
    Persona?: { Tone?: string | null; SpeakingStyle?: string | null } | null;
    /** Model preference override (AI Models Name or ID). */
    ModelPreference?: string | null;
}

export type AgentDisclosurePolicy = 'silent' | 'mention' | 'hand-voice';
```

> `AgentDisclosurePolicy` is the **single source of truth** for the disclosure union and is re-declared identically in the `ai-core-plus` shared types (see [05](05-config-cascade-and-shared-types.md)) — interface files are standalone by MJ convention, so the union lives in both places by value (no cross-package import in metadata interface files). Keep them in lockstep.

### 1.3 Register the JSONType with CodeGen
New file `metadata/entities/.entity-field-jsontype-agent-settings.json` (model on `.entity-field-jsontype-defaults.json`):

```json
{
  "fields": { "Name": "MJ: Applications" },
  "relatedEntities": {
    "MJ: Entity Fields": [
      {
        "fields": {
          "JSONType": "IAgentSettings",
          "JSONTypeIsArray": false,
          "JSONTypeDefinition": "@file:JSONType-interfaces/IAgentSettings.ts"
        },
        "primaryKey": {
          "ID": "@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=MJ: Applications&Name=AgentSettings"
        }
      }
    ]
  }
}
```

### 1.4 Run migration + CodeGen against `MJ_5_43_0_Predictive`
- Apply the migration to the dedicated predictive DB.
- Run `mj codegen` against that DB so the `AgentSettings` field and the `AgentSettingsObject: IAgentSettings | null` accessor generate into `entity_subclasses.ts`, and the `MJApplicationEntity_IAgentSettings` interface is emitted.
- **Wait for CodeGen** before writing any consumer code that reads `AgentSettingsObject` (no `.Get('AgentSettings')` — strong typing only).

### 1.5 Fold into the default-agent resolution chain
`packages/ConversationsRuntime/src/default-agent/DefaultAgentResolver.ts` — insert the `AgentSettings.DefaultAgentID` check **between** the explicit input and the `ApplicationSetting` key (which becomes the legacy fallback):

```
explicit input
  → Application.AgentSettings.DefaultAgentID   (NEW)
  → ApplicationSetting 'Conversations.DefaultAgentID' (app-scoped, then global)  [legacy]
  → Sage code-const fallback
```

The resolver already receives `applicationId` + `provider`; read the app's `AgentSettingsObject` from cached app metadata (no extra query). Guard with `UUIDsEqual` for the agent lookup.

### 1.6 Seed (optional, demonstrative)
Add an `AgentSettings` block to an existing app metadata file (e.g. `metadata/applications/.ai-application.json`) showing `DefaultAgentID` (via `@lookup:MJ: AI Agents.Name=...`) + one `RelevantAgents` entry, so the shape is exercised end-to-end. Use metadata sync, not SQL.

## Tests
- Unit: `DefaultAgentResolver` — new app layer wins over `ApplicationSetting`, falls through correctly when `AgentSettings` is null / `DefaultAgentID` absent / agent not found.
- CodeGen smoke: `AgentSettingsObject` round-trips an `IAgentSettings` object (parse/stringify).
- Run the `ConversationsRuntime` and `MJCoreEntities` package test suites.

## Risks / notes
- **CodeGen determinism** — fold this into the existing predictive codegen run to avoid Sequence/timestamp churn (see memory: CodeGen determinism baseline).
- The interface-file disclosure union duplication (1.2) is intentional per MJ's standalone-interface-file rule; add a comment in both files pointing at each other.
