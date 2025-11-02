# Agent Semantic Configuration Presets

**Date:** 2025-10-31
**Status:** Planning Phase
**Issue:** Users need a simple way to select different AI model configurations per agent (e.g., "Fast Draft" vs "High Quality")
**Scope:** Add semantic configuration presets to agent metadata with UI support

---

## Executive Summary

**Problem:** Users want to run agents with different "power levels" or model configurations (e.g., use Claude Opus for high-quality reports vs Claude Haiku for quick drafts), but there's no UX mechanism to expose this choice.

**Solution:** Add **AI Agent Configuration** entity that defines semantic presets (like "Fast", "Balanced", "High Quality") per agent. Each preset maps to an existing `AI Configuration` which controls model selection across all prompts in the agent execution.

### Key Design Principles

1. **Leverage Existing Infrastructure** - `AIConfiguration`, `AIPromptModel.ConfigurationID`, and `ExecuteAgentParams.configurationId` already work
2. **Semantic Presets** - User-friendly names like "Fast Draft", "High Quality", "Maximum Detail" instead of technical config IDs
3. **Per-Agent Customization** - Each agent defines its own preset names/descriptions appropriate to its domain
4. **Automatic Propagation** - Configuration ID flows to all sub-agents automatically (already implemented)
5. **No Combinatorial Explosion** - Each preset maps to ONE configuration; granularity comes from per-prompt `AIPromptModel` records
6. **Zero Breaking Changes** - Purely additive; all existing code continues to work

---

## Architecture Overview

### Current State (Infrastructure Already Exists)

```
┌─────────────────────────────────────────────────────────────┐
│                   ExecuteAgentParams                         │
├─────────────────────────────────────────────────────────────┤
│ configurationId?: string    ← ALREADY SUPPORTED             │
│     ↓                                                        │
│     Passed to AIPromptRunner.selectModel()                   │
│     ↓                                                        │
│     Filters AIPromptModel WHERE ConfigurationID = X          │
│     Falls back to AIPromptModel WHERE ConfigurationID IS NULL│
└─────────────────────────────────────────────────────────────┘
```

**What Exists:**
- ✅ `AI Configurations` table (global configurations)
- ✅ `AIPromptModel.ConfigurationID` (per-prompt model selection)
- ✅ `ExecuteAgentParams.configurationId` (runtime parameter)
- ✅ Configuration propagation to sub-agents
- ✅ Fallback to NULL configuration models

**What's Missing:**
- ❌ UX metadata: Which configurations should each agent expose to users?
- ❌ User-friendly names: "High Quality" instead of UUID
- ❌ Per-agent descriptions: "Uses Claude Opus for all operations"
- ❌ Caching in AIEngine for fast lookups

### Proposed State (Add UX Layer)

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent Configurations                  │
│                         (NEW TABLE)                          │
├─────────────────────────────────────────────────────────────┤
│ AgentID              → Which agent this preset is for       │
│ Name                 → Code name: "HighPower", "Fast"       │
│ DisplayName          → UI label: "High Quality"             │
│ Description          → Help text for users                  │
│ AIConfigurationID    → FK to AI Configurations (or NULL)    │
│ IsDefault            → Is this the default choice?          │
│ Priority             → Display order in UI                  │
│ Status               → Pending/Active/Revoked               │
└─────────────────────────────────────────────────────────────┘
                          ↓
                    Maps to existing
┌─────────────────────────────────────────────────────────────┐
│                   AI Configurations                          │
│                    (EXISTING TABLE)                          │
├─────────────────────────────────────────────────────────────┤
│ ID, Name, Description, ConfigurationParams                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
                   Filters models via
┌─────────────────────────────────────────────────────────────┐
│                   AI Prompt Models                           │
│                    (EXISTING TABLE)                          │
├─────────────────────────────────────────────────────────────┤
│ PromptID, ModelID, ConfigurationID, Priority                │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Table: `AIAgentConfiguration`

```sql
CREATE TABLE [__mj].[AIAgentConfiguration] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [AgentID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [DisplayName] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [AIConfigurationID] UNIQUEIDENTIFIER NULL,
    [IsDefault] BIT NOT NULL DEFAULT 0,
    [Priority] INT NOT NULL DEFAULT 100,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_AIAgentConfiguration_Agent]
        FOREIGN KEY ([AgentID]) REFERENCES [__mj].[AIAgent]([ID]),
    CONSTRAINT [FK_AIAgentConfiguration_Configuration]
        FOREIGN KEY ([AIConfigurationID]) REFERENCES [__mj].[AIConfiguration]([ID]),
    CONSTRAINT [CK_AIAgentConfiguration_Status]
        CHECK ([Status] IN ('Pending', 'Active', 'Revoked')),
    CONSTRAINT [UQ_AIAgentConfiguration_Agent_Name]
        UNIQUE ([AgentID], [Name])
);

CREATE INDEX [IX_AIAgentConfiguration_AgentID_Status]
    ON [__mj].[AIAgentConfiguration]([AgentID], [Status]);
```

### Extended Properties (for CodeGen)

```sql
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines semantic configuration presets for agents, allowing users to select between different AI model configurations (e.g., Fast, Balanced, High Quality) when executing an agent. Each preset maps to an AI Configuration which controls model selection across all prompts.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The agent this configuration preset belongs to',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'AgentID';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Code-friendly name for the preset (e.g., HighPower, Fast, Balanced). Used in API calls.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User-friendly display name shown in UI (e.g., "High Quality", "Quick Draft", "Maximum Detail")',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description shown to users explaining what this configuration does (e.g., "Uses Claude Opus for highest quality results")',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional AI Configuration to use for this preset. If NULL, uses default configuration (prompts with ConfigurationID IS NULL)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'AIConfigurationID';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this is the default preset for the agent. Should have exactly one default per agent.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display order for UI. Lower numbers appear first. Typical values: 100 (Default), 200 (Fast), 300 (Balanced), 400 (High Quality)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Status of the preset: Pending (being configured), Active (available for use), Revoked (no longer available)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Status';
```

---

## Example Data

### Research Agent Configuration Presets

**Location:** `/metadata/agents/.research-agent-configurations.json`

This example shows how to add configuration presets to an existing agent using the metadata sync system.

```json
{
  "fields": {
    "Name": "Research Agent"
  },
  "relatedEntities": {
    "MJ: AI Agent Configurations": [
      {
        "fields": {
          "AgentID": "@parent:ID",
          "Name": "Default",
          "DisplayName": "Standard",
          "Description": "Balanced performance using default model selections",
          "AIConfigurationID": null,
          "IsDefault": true,
          "Priority": 100,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "F1A2B3C4-D5E6-7890-ABCD-EF1234567890"
        }
      },
      {
        "fields": {
          "AgentID": "@parent:ID",
          "Name": "Fast",
          "DisplayName": "Quick Draft",
          "Description": "Fastest results using efficient models (Haiku, GPT-4o-mini)",
          "AIConfigurationID": "@lookup:MJ: AI Configurations.Name=Fast Configuration",
          "IsDefault": false,
          "Priority": 200,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "A1B2C3D4-E5F6-7890-1234-567890ABCDEF"
        }
      },
      {
        "fields": {
          "AgentID": "@parent:ID",
          "Name": "HighQuality",
          "DisplayName": "Maximum Detail",
          "Description": "Best quality results using frontier models (Claude Opus, GPT-4)",
          "AIConfigurationID": "@lookup:MJ: AI Configurations.Name=Frontier Models",
          "IsDefault": false,
          "Priority": 300,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "B2C3D4E5-F678-90AB-CDEF-1234567890AB"
        }
      },
      {
        "fields": {
          "AgentID": "@parent:ID",
          "Name": "HighPowerReport",
          "DisplayName": "Premium Report",
          "Description": "Uses frontier model for final report generation, efficient models for research",
          "AIConfigurationID": "@lookup:MJ: AI Configurations.Name=Frontier Report Config",
          "IsDefault": false,
          "Priority": 250,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "C3D4E5F6-7890-ABCD-EF12-34567890ABCD"
        }
      }
    ]
  },
  "primaryKey": {
    "ID": "research-agent-uuid-goes-here"
  }
}
```

### Supporting AI Configurations

**Location:** `/metadata/ai-configurations/.fast-configuration.json`

```json
{
  "fields": {
    "Name": "Fast Configuration",
    "Description": "Uses smaller, faster models (Haiku, GPT-4o-mini) for quick responses"
  },
  "primaryKey": {
    "ID": "D4E5F678-90AB-CDEF-1234-567890ABCDEF"
  }
}
```

**Location:** `/metadata/ai-configurations/.frontier-models-configuration.json`

```json
{
  "fields": {
    "Name": "Frontier Models",
    "Description": "Uses highest quality frontier models (Claude Opus, GPT-4) for best results"
  },
  "primaryKey": {
    "ID": "E5F67890-ABCD-EF12-3456-7890ABCDEF12"
  }
}
```

### Supporting AIPromptModel Configuration

**Example:** Prompt that uses different models per configuration

**Location:** `/metadata/prompts/.research-report-writing-prompt.json`

```json
{
  "fields": {
    "Name": "Research Report Writing Prompt",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "TemplateText": "@file:templates/research/write-report.template.md",
    "ResponseFormat": "JSON",
    "CategoryID": "@lookup:AI Prompt Categories.Name=Research",
    "Status": "Active",
    "Description": "Synthesizes research findings into comprehensive report"
  },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      {
        "fields": {
          "PromptID": "@parent:ID",
          "ModelID": "@lookup:AI Models.Name=Claude Haiku 4.5",
          "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic",
          "ConfigurationID": null,
          "Priority": 1,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "11111111-2222-3333-4444-555555555555"
        }
      },
      {
        "fields": {
          "PromptID": "@parent:ID",
          "ModelID": "@lookup:AI Models.Name=Claude Haiku 4.5",
          "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic",
          "ConfigurationID": "@lookup:MJ: AI Configurations.Name=Fast Configuration",
          "Priority": 1,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "22222222-3333-4444-5555-666666666666"
        }
      },
      {
        "fields": {
          "PromptID": "@parent:ID",
          "ModelID": "@lookup:AI Models.Name=Claude Opus 4.5",
          "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic",
          "ConfigurationID": "@lookup:MJ: AI Configurations.Name=Frontier Models",
          "Priority": 1,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "33333333-4444-5555-6666-777777777777"
        }
      },
      {
        "fields": {
          "PromptID": "@parent:ID",
          "ModelID": "@lookup:AI Models.Name=Claude Opus 4.5",
          "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic",
          "ConfigurationID": "@lookup:MJ: AI Configurations.Name=Frontier Report Config",
          "Priority": 1,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "44444444-5555-6666-7777-888888888888"
        }
      }
    ]
  },
  "primaryKey": {
    "ID": "write-report-prompt-uuid"
  }
}
```

**Note:** The "Frontier Report Config" is designed so that ONLY the report writing prompt has a model linked to it. Other prompts (data gathering, analysis) would only have models linked to NULL, "Fast Configuration", and "Frontier Models" - this creates the "high power report only" behavior.

---

## Code Changes

### 1. AIEngine Caching (packages/AI/BaseAIEngine)

**Purpose:** Cache agent configurations for fast lookup without database hits

**File:** `/packages/AI/BaseAIEngine/src/BaseAIEngine.ts`

**Changes:**

```typescript
// 1. Add import to the imports section (around line 2)
import { AIActionEntity, AIAgentActionEntity, AIAgentModelEntity, AIAgentNoteEntity, AIAgentNoteTypeEntity,
         AIModelActionEntity, AIModelEntityExtended,
         AIPromptModelEntity, AIPromptTypeEntity, AIResultCacheEntity, AIVendorTypeDefinitionEntity,
         ArtifactTypeEntity, EntityAIActionEntity, VectorDatabaseEntity,
         AIPromptCategoryEntityExtended, AIAgentEntityExtended,
         AIAgentPromptEntity,
         AIAgentTypeEntity,
         AIVendorEntity,
         AIModelVendorEntity,
         AIModelTypeEntity,
         AIPromptEntityExtended,
         AIModelCostEntity,
         AIModelPriceTypeEntity,
         AIModelPriceUnitTypeEntity,
         AIConfigurationEntity,
         AIConfigurationParamEntity,
         AIAgentStepEntity,
         AIAgentStepPathEntity,
         AIAgentRelationshipEntity,
         AIAgentPermissionEntity,
         AIAgentDataSourceEntity,
         AIAgentConfigurationEntity,  // ADD THIS LINE
         AIAgentExampleEntity} from "@memberjunction/core-entities";

// 2. Add to class properties (around line 56)
private _agentConfigurations: AIAgentConfigurationEntity[] = [];

/**
 * Cached array of AI Agent Configurations loaded from the database.
 * These define semantic presets for agents (e.g., "Fast", "High Quality").
 */
public get AgentConfigurations(): AIAgentConfigurationEntity[] {
    return this._agentConfigurations;
}

// Update Config() method - add to params array (around line 166)
public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
    const params = [
        // ... existing entries ...
        {
            PropertyName: '_agentDataSources',
            EntityName: 'MJ: AI Agent Data Sources'
        },
        // ADD THIS NEW ENTRY:
        {
            PropertyName: '_agentConfigurations',
            EntityName: 'MJ: AI Agent Configurations'
        }
    ];
    return await this.Load(params, provider, forceRefresh, contextUser);
}
```

**Helper Methods:**

```typescript
/**
 * Gets all configuration presets for a specific agent
 * @param agentId The agent ID
 * @param activeOnly If true, only returns Active status presets (default: true)
 * @returns Array of configuration presets sorted by Priority
 */
public GetAgentConfigurationPresets(agentId: string, activeOnly: boolean = true): AIAgentConfigurationEntity[] {
    let presets = this._agentConfigurations.filter(ac => ac.AgentID === agentId);

    if (activeOnly) {
        presets = presets.filter(ac => ac.Status === 'Active');
    }

    // Sort by Priority (lower numbers first)
    return presets.sort((a, b) => a.Priority - b.Priority);
}

/**
 * Gets the default configuration preset for an agent
 * @param agentId The agent ID
 * @returns The default preset, or undefined if none exists
 */
public GetDefaultAgentConfigurationPreset(agentId: string): AIAgentConfigurationEntity | undefined {
    const presets = this.GetAgentConfigurationPresets(agentId, true);
    return presets.find(ac => ac.IsDefault);
}

/**
 * Gets a specific configuration preset by agent ID and preset name
 * @param agentId The agent ID
 * @param presetName The preset name (e.g., "Fast", "HighQuality")
 * @returns The configuration preset, or undefined if not found
 */
public GetAgentConfigurationPresetByName(agentId: string, presetName: string): AIAgentConfigurationEntity | undefined {
    return this._agentConfigurations.find(
        ac => ac.AgentID === agentId &&
              ac.Name === presetName &&
              ac.Status === 'Active'
    );
}
```

### 2. Base Agent Type Hint (packages/AI/Agents)

**Purpose:** Add convenience method to BaseAgent for getting available presets

**File:** `/packages/AI/Agents/src/base-agent.ts`

**Changes:**

```typescript
/**
 * Gets the available configuration presets for this agent.
 * Returns semantic presets like "Fast", "Balanced", "High Quality" that users can choose from.
 *
 * @returns Array of configuration presets sorted by Priority, or empty array if none configured
 *
 * @example
 * ```typescript
 * const agent = new ResearchAgent();
 * const presets = agent.GetConfigurationPresets();
 * // Returns: [
 * //   { Name: 'Default', DisplayName: 'Standard', AIConfigurationID: null },
 * //   { Name: 'Fast', DisplayName: 'Quick Draft', AIConfigurationID: 'fast-config-uuid' },
 * //   { Name: 'HighQuality', DisplayName: 'Maximum Detail', AIConfigurationID: 'frontier-uuid' }
 * // ]
 * ```
 */
public GetConfigurationPresets(): AIAgentConfigurationEntity[] {
    if (!this._agent?.ID) {
        return [];
    }
    return AIEngine.Instance.GetAgentConfigurationPresets(this._agent.ID);
}

/**
 * Gets the default configuration preset for this agent.
 *
 * @returns The default preset, or undefined if none configured
 */
public GetDefaultConfigurationPreset(): AIAgentConfigurationEntity | undefined {
    if (!this._agent?.ID) {
        return undefined;
    }
    return AIEngine.Instance.GetDefaultAgentConfigurationPreset(this._agent.ID);
}
```

### 3. Export New Entity Type (packages/MJCoreEntities)

**Purpose:** Export the generated AIAgentConfigurationEntity class

**File:** `/packages/MJCoreEntities/src/index.ts`

**Changes:**

```typescript
// Add after AIAgent export
export { AIAgentConfigurationEntity, AIAgentConfigurationEntityExtended } from './generated/entity_subclasses';
```

---

## UI Integration

### Angular Component (packages/Angular/Generic/Conversations)

**New Component:** `agent-configuration-selector`

**Location:** `/packages/Angular/Generic/Conversations/src/lib/components/agent-configuration-selector/`

**Purpose:** Dropdown for selecting semantic configuration presets before executing an agent

**Component Code:**

```typescript
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { AIAgentEntityExtended, AIAgentConfigurationEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';

@Component({
  selector: 'mj-agent-configuration-selector',
  template: `
    <div class="configuration-selector" *ngIf="presets.length > 0">
      <label for="config-preset">Power Level:</label>
      <select
        id="config-preset"
        [(ngModel)]="selectedPresetName"
        (change)="onPresetChange()"
        [disabled]="disabled">
        <option *ngFor="let preset of presets" [value]="preset.Name">
          {{ preset.DisplayName }}
        </option>
      </select>
      <span class="preset-description" *ngIf="selectedPreset">
        {{ selectedPreset.Description }}
      </span>
    </div>
  `,
  styles: [`
    .configuration-selector {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    label {
      font-weight: 500;
      font-size: 14px;
    }

    select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .preset-description {
      font-size: 12px;
      color: #666;
      font-style: italic;
    }
  `]
})
export class AgentConfigurationSelectorComponent implements OnInit {
  @Input() agent!: AIAgentEntityExtended;
  @Input() disabled: boolean = false;

  @Output() configurationSelected = new EventEmitter<string | null>();

  presets: AIAgentConfigurationEntity[] = [];
  selectedPresetName: string = '';
  selectedPreset: AIAgentConfigurationEntity | null = null;

  async ngOnInit() {
    await this.loadPresets();
  }

  async loadPresets() {
    // Ensure AIEngine is configured
    await AIEngine.Instance.Config();

    // Get presets for this agent
    this.presets = AIEngine.Instance.GetAgentConfigurationPresets(this.agent.ID);

    if (this.presets.length > 0) {
      // Select default preset
      const defaultPreset = this.presets.find(p => p.IsDefault);
      this.selectedPresetName = defaultPreset?.Name || this.presets[0].Name;
      this.updateSelectedPreset();
    }
  }

  onPresetChange() {
    this.updateSelectedPreset();
  }

  private updateSelectedPreset() {
    this.selectedPreset = this.presets.find(p => p.Name === this.selectedPresetName) || null;

    // Emit the AIConfigurationID (or null for default)
    this.configurationSelected.emit(this.selectedPreset?.AIConfigurationID || null);
  }
}
```

**Integration into Conversation Component:**

```typescript
// In conversation.component.ts

// Add property
selectedConfigurationId: string | null = null;

// Add to template before "Send" button
<mj-agent-configuration-selector
  *ngIf="currentAgent"
  [agent]="currentAgent"
  [disabled]="isSending"
  (configurationSelected)="onConfigurationSelected($event)">
</mj-agent-configuration-selector>

// Add handler
onConfigurationSelected(configId: string | null) {
  this.selectedConfigurationId = configId;
}

// Update executeAgent() method
async executeAgent() {
  const params: ExecuteAgentParams = {
    agent: this.currentAgent,
    conversationMessages: this.messages,
    contextUser: this.contextUser,
    configurationId: this.selectedConfigurationId, // Add this line
    // ... other params
  };

  const result = await this.currentAgent.Execute(params);
  // ... handle result
}
```

---

## Migration Strategy

### Phase 1: Database Schema (Week 1)

1. Create migration file: `V2YYYYMMDDHHMM__v2.XXX.x_add_agent_configurations.sql`
2. Add table, constraints, indexes, extended properties
3. Run migration on dev environment
4. Run CodeGen to generate entity classes
5. Test entity CRUD operations

### Phase 2: AIEngine Integration (Week 1)

1. Update `BaseAIEngine.ts` to cache agent configurations
2. Add helper methods for querying presets
3. Export new entity types from MJCoreEntities
4. Add convenience methods to BaseAgent
5. Write unit tests for preset lookups

### Phase 3: Sample Data (Week 2)

1. Create sample configurations for existing agents:
   - Research Agent (Fast, Balanced, High Quality)
   - Code Review Agent (Quick, Thorough)
   - Data Analysis Agent (Draft, Production)
2. Document AIPromptModel setup for each configuration
3. Test end-to-end with different presets

### Phase 4: UI Components (Week 2)

1. Create `agent-configuration-selector` component
2. Integrate into conversation components
3. Add to agent execution dialogs
4. Style consistently with existing UI
5. Add tooltips/help text

### Phase 5: Documentation & Testing (Week 3)

1. Update developer documentation
2. Create admin guide for setting up presets
3. Add examples to agent metadata documentation
4. Write integration tests
5. Performance testing with cached presets

---

## Testing Plan

### Unit Tests

```typescript
describe('AIEngine AgentConfiguration caching', () => {
  it('should load agent configurations on Config()', async () => {
    await AIEngine.Instance.Config();
    expect(AIEngine.Instance.AgentConfigurations.length).toBeGreaterThan(0);
  });

  it('should filter presets by agent ID', () => {
    const agentId = 'test-agent-uuid';
    const presets = AIEngine.Instance.GetAgentConfigurationPresets(agentId);
    expect(presets.every(p => p.AgentID === agentId)).toBe(true);
  });

  it('should return default preset', () => {
    const agentId = 'test-agent-uuid';
    const defaultPreset = AIEngine.Instance.GetDefaultAgentConfigurationPreset(agentId);
    expect(defaultPreset?.IsDefault).toBe(true);
  });

  it('should sort presets by Priority', () => {
    const agentId = 'test-agent-uuid';
    const presets = AIEngine.Instance.GetAgentConfigurationPresets(agentId);

    for (let i = 1; i < presets.length; i++) {
      expect(presets[i].Priority).toBeGreaterThanOrEqual(presets[i - 1].Priority);
    }
  });
});

describe('BaseAgent configuration presets', () => {
  it('should return presets for agent', () => {
    const agent = new TestAgent();
    const presets = agent.GetConfigurationPresets();
    expect(Array.isArray(presets)).toBe(true);
  });

  it('should return default preset', () => {
    const agent = new TestAgent();
    const defaultPreset = agent.GetDefaultConfigurationPreset();
    expect(defaultPreset?.IsDefault).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('Agent execution with configuration presets', () => {
  it('should execute with default preset', async () => {
    const agent = new ResearchAgent();
    const defaultPreset = agent.GetDefaultConfigurationPreset();

    const params: ExecuteAgentParams = {
      agent: agentEntity,
      conversationMessages: [],
      configurationId: defaultPreset?.AIConfigurationID || null
    };

    const result = await agent.Execute(params);
    expect(result.success).toBe(true);
  });

  it('should execute with Fast preset', async () => {
    const agent = new ResearchAgent();
    const fastPreset = AIEngine.Instance.GetAgentConfigurationPresetByName(
      agentEntity.ID,
      'Fast'
    );

    const params: ExecuteAgentParams = {
      agent: agentEntity,
      conversationMessages: [],
      configurationId: fastPreset?.AIConfigurationID
    };

    const result = await agent.Execute(params);
    expect(result.success).toBe(true);
    // Verify Haiku was used (check model in agentRun)
  });

  it('should propagate configuration to sub-agents', async () => {
    const parentAgent = new ParentAgent();
    const presetWithConfig = AIEngine.Instance.GetAgentConfigurationPresetByName(
      parentAgentEntity.ID,
      'HighQuality'
    );

    const params: ExecuteAgentParams = {
      agent: parentAgentEntity,
      conversationMessages: [],
      configurationId: presetWithConfig?.AIConfigurationID
    };

    const result = await parentAgent.Execute(params);

    // Check that sub-agent runs also used the configuration
    const subAgentRuns = result.agentRun.Steps?.filter(s => s.StepType === 'Sub-Agent');
    // Verify each sub-agent used appropriate models for the configuration
  });
});
```

---

## Performance Considerations

### Caching Strategy

- **AIEngine caches all active presets** on initialization
- **No database queries** during agent selection UI rendering
- **Fast lookups** via helper methods (O(n) filtering, small n)
- **Invalidation:** Only on AIEngine.Config(force=true)

### Query Optimization

```sql
-- Index on AgentID + Status for fast filtering
CREATE INDEX [IX_AIAgentConfiguration_AgentID_Status]
    ON [__mj].[AIAgentConfiguration]([AgentID], [Status]);

-- Most common query pattern:
SELECT * FROM [__mj].[AIAgentConfiguration]
WHERE [AgentID] = @AgentId AND [Status] = 'Active'
ORDER BY [Priority];
-- Uses index efficiently
```

### Memory Footprint

- Typical agent: 3-5 presets
- 100 agents with 5 presets each = 500 records
- ~200 bytes per record = ~100 KB total
- **Negligible memory impact**

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **User Preferences:** Remember user's last selected preset per agent
   ```typescript
   interface UserAgentPreference {
     userId: string;
     agentId: string;
     lastUsedPresetName: string;
   }
   ```

2. **Configuration Templates:** Share preset configurations across multiple agents
   ```sql
   -- Template for "Research Agents"
   INSERT INTO AIAgentConfiguration
   SELECT NEWID(), ag.ID, 'Fast', 'Quick Draft', 'Fast research', 'fast-config-uuid', 0, 200, 'Active'
   FROM AIAgent ag
   WHERE ag.Name LIKE '%Research%';
   ```

3. **Dynamic Preset Visibility:** Show/hide presets based on user permissions or subscription tier
   ```typescript
   agentConfigurationEntity.RequiredSubscriptionTier = 'Premium';
   ```

4. **Preset Analytics:** Track which presets are most popular
   ```sql
   ALTER TABLE AIAgentConfiguration ADD UsageCount INT DEFAULT 0;
   ```

5. **Configuration Slots:** More granular control (mentioned in original discussion)
   ```typescript
   // Future: Per-operation configuration
   {
     "ConfigurationSlots": [
       { "SlotName": "DataGathering", "Options": [...] },
       { "SlotName": "Analysis", "Options": [...] },
       { "SlotName": "ReportWriting", "Options": [...] }
     ]
   }
   ```

---

## Success Metrics

### User Experience

- ✅ Users can see available configuration options when starting agent
- ✅ Selection takes < 100ms (cached lookup)
- ✅ Preset descriptions help users understand differences
- ✅ Default preset is pre-selected for quick execution

### Technical

- ✅ Zero additional database queries during agent selection
- ✅ Configuration propagates to all sub-agents
- ✅ AIPromptModel filtering works correctly
- ✅ Falls back to NULL configuration gracefully

### Business

- ✅ Power users can choose "High Quality" for important tasks
- ✅ Cost-conscious users can choose "Fast" for drafts
- ✅ Balanced default provides good experience for all users

---

## Open Questions

1. **Should presets have cost indicators?**
   - Show estimated cost difference between "Fast" and "High Quality"?
   - Answer: Post-MVP feature

2. **Should we support preset inheritance?**
   - Child agents inherit parent's configuration presets?
   - Answer: No, each agent defines its own presets

3. **Should presets be exportable/importable?**
   - Share preset configurations across environments?
   - Answer: Future enhancement via metadata sync

4. **Should we add A/B testing support?**
   - Randomly assign users to different presets for comparison?
   - Answer: Not in scope for this feature

---

## Appendix A: Complete Migration File

```sql
-- Migration: V2YYYYMMDDHHMM__v2.XXX.x_add_agent_configurations.sql
-- Description: Add AI Agent Configuration table for semantic configuration presets

-- Create table
CREATE TABLE [__mj].[AIAgentConfiguration] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [AgentID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [DisplayName] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [AIConfigurationID] UNIQUEIDENTIFIER NULL,
    [IsDefault] BIT NOT NULL DEFAULT 0,
    [Priority] INT NOT NULL DEFAULT 100,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_AIAgentConfiguration_Agent]
        FOREIGN KEY ([AgentID]) REFERENCES [__mj].[AIAgent]([ID]),
    CONSTRAINT [FK_AIAgentConfiguration_Configuration]
        FOREIGN KEY ([AIConfigurationID]) REFERENCES [__mj].[AIConfiguration]([ID]),
    CONSTRAINT [CK_AIAgentConfiguration_Status]
        CHECK ([Status] IN ('Pending', 'Active', 'Revoked')),
    CONSTRAINT [UQ_AIAgentConfiguration_Agent_Name]
        UNIQUE ([AgentID], [Name])
);

-- Create indexes
CREATE INDEX [IX_AIAgentConfiguration_AgentID_Status]
    ON [__mj].[AIAgentConfiguration]([AgentID], [Status]);

-- Add extended properties
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines semantic configuration presets for agents, allowing users to select between different AI model configurations (e.g., Fast, Balanced, High Quality) when executing an agent. Each preset maps to an AI Configuration which controls model selection across all prompts.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The agent this configuration preset belongs to',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'AgentID';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Code-friendly name for the preset (e.g., HighPower, Fast, Balanced). Used in API calls.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User-friendly display name shown in UI (e.g., "High Quality", "Quick Draft", "Maximum Detail")',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description shown to users explaining what this configuration does (e.g., "Uses Claude Opus for highest quality results")',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional AI Configuration to use for this preset. If NULL, uses default configuration (prompts with ConfigurationID IS NULL)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'AIConfigurationID';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this is the default preset for the agent. Should have exactly one default per agent.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display order for UI. Lower numbers appear first. Typical values: 100 (Default), 200 (Fast), 300 (Balanced), 400 (High Quality)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Status of the preset: Pending (being configured), Active (available for use), Revoked (no longer available)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Status';

-- Add spCreate, spUpdate, spDelete stored procedures
-- (These will be generated by CodeGen)
```

---

## Appendix B: TypeScript Type Definitions

```typescript
// Generated by CodeGen in packages/MJCoreEntities/src/generated/entity_subclasses.ts

/**
 * AI Agent Configuration entity
 * Defines semantic configuration presets for agents
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Configurations')
export class AIAgentConfigurationEntity extends BaseEntity {
    AgentID: string;
    Name: string;
    DisplayName: string;
    Description: string | null;
    AIConfigurationID: string | null;
    IsDefault: boolean;
    Priority: number;
    Status: 'Pending' | 'Active' | 'Revoked';

    // Navigation properties
    Agent?: AIAgentEntityExtended;
    Configuration?: AIConfigurationEntity;
}

// Extended type with lazy-loaded relationships
export type AIAgentConfigurationEntityExtended =
    AIAgentConfigurationEntity & {
        Agent?: AIAgentEntityExtended;
        Configuration?: AIConfigurationEntity;
    };
```

---

## Summary

This plan adds a lightweight UX metadata layer on top of the existing robust AI Configuration infrastructure. The new `AIAgentConfiguration` table allows agents to expose semantic presets to users without requiring any changes to the core execution engine. The configuration system already handles all the heavy lifting - we're just adding friendly names and descriptions to make it accessible to users.

**Key Benefits:**
- ✅ Zero changes to execution logic
- ✅ Leverages existing AIConfiguration + AIPromptModel system
- ✅ Fast (cached in AIEngine)
- ✅ Flexible per-agent customization
- ✅ Automatic sub-agent propagation
- ✅ Simple to implement and maintain
