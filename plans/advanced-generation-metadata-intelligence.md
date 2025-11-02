# Advanced Generation: Metadata Intelligence Enhancement

**Status:** Planning
**Created:** 2025-11-02
**Author:** AI Assistant
**Target Package:** `@memberjunction/codegen-lib`

---

## Executive Summary

This plan extends the existing Advanced Generation system in CodeGen to add intelligent, LLM-powered metadata inference capabilities. Instead of relying solely on heuristics (like "a field named 'Name' is the name field"), we'll use semantic analysis to make smarter decisions about entity metadata, relationships, and UI generation.

The system is designed as **optional, plugin-based enhancements** that augment but don't replace the existing CodeGen pipeline. When disabled, CodeGen continues to work exactly as it does today.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Goals and Non-Goals](#goals-and-non-goals)
3. [Proposed Architecture](#proposed-architecture)
4. [New Advanced Generation Features](#new-advanced-generation-features)
5. [Implementation Details](#implementation-details)
6. [Configuration Schema Updates](#configuration-schema-updates)
7. [Plugin System Design](#plugin-system-design)
8. [Migration and Backwards Compatibility](#migration-and-backwards-compatibility)
9. [Testing Strategy](#testing-strategy)
10. [Timeline and Phases](#timeline-and-phases)
11. [Future Extensibility](#future-extensibility)

---

## Current State Analysis

### Existing AdvancedGeneration Infrastructure

**Location:** `/packages/CodeGenLib/src/Misc/advanced_generation.ts`

**Current Features:**
- `EntityNames` - Generate user-friendly entity names from table names
- `EntityDescriptions` - Create business-friendly descriptions
- `EntityFieldDescriptions` - Describe individual fields (not currently used)
- `FormLayout` - AI determines optimal form layouts (not currently used)
- `FormTabs` - AI decides which relationships should be visible (not currently used)
- `CheckConstraintParser` - Translate SQL CHECK constraints to TypeScript validation

**Current Status:**
```typescript
public get enabled(): boolean {
    return false; // temporarily disabled - not yielding good results
}
```

**Configuration Structure:**
```typescript
type AdvancedGenerationFeature = {
  name: string;
  enabled: boolean;
  description?: string;
  systemPrompt?: string;
  userMessage?: string;
  options?: { name: string, value: unknown }[];
}
```

**Usage Pattern:**
```typescript
const ag = new AdvancedGeneration();
if (ag.featureEnabled('EntityDescriptions')) {
    const llm = ag.LLM;
    const prompt = ag.getPrompt('EntityDescriptions');
    // ... invoke LLM and process results
}
```

### Current Metadata Heuristics

**File:** `/packages/CodeGenLib/src/Database/manage-metadata.ts`

**Problems with Current Approach:**

1. **Name Field Detection** - Assumes field called "Name" or "Title"
   - Fails on: `ProductSKU`, `CustomerCode`, `EmployeeNumber`

2. **Default in View** - No intelligent selection
   - Defaults to primary key or first text field
   - Doesn't consider semantic meaning

3. **Join Field Selection** - Can't handle transitive relationships
   - Example: `TableX → UserRole → User, Role`
   - Current system can't determine to include User/Role fields when joining to UserRole

4. **Form Layout** - Fields dumped sequentially
   - No logical grouping
   - No semantic categorization
   - Uses tabs instead of modern collapsible sections

---

## Goals and Non-Goals

### Goals

✅ **Add intelligent metadata inference** using LLM semantic analysis
✅ **Preserve existing CodeGen functionality** - system works without LLM features
✅ **Plugin-based architecture** - easy to add new AI-powered features
✅ **Respect user modifications** - never override manual changes
✅ **Improve UI generation** - modern collapsible sections with icons
✅ **Handle complex relationships** - transitive join intelligence
✅ **Batch processing** - efficient LLM usage with combined prompts
✅ **Extensible design** - foundation for future AI-powered features

### Non-Goals

❌ Require LLM for basic CodeGen operation
❌ Override existing working heuristics (augment, don't replace)
❌ Change existing configuration format (extend it)
❌ Generate code that requires LLM at runtime
❌ Replace human decision-making for critical business logic

---

## Proposed Architecture

### High-Level Flow

```
Database Schema Changes Detected
         ↓
[Metadata Management]
         ↓
    [FORK based on config]
         ↓
   ╔════════════════════════════════╗
   ║ Advanced Generation Enabled?   ║
   ╚════════════════════════════════╝
         ↓                ↓
       YES              NO
         ↓                ↓
   ┌─────────┐    ┌──────────┐
   │ Plugin  │    │ Simple   │
   │ System  │    │ Heuristic│
   └─────────┘    └──────────┘
         ↓                ↓
   [LLM Analysis]   [Pattern Match]
         ↓                ↓
   [Batch Decisions]    [Return]
         ↓                ↓
   [Update Metadata]    [Return]
         ↓                ↓
         └────────┬───────┘
                  ↓
          [Generate Code]
                  ↓
    [TypeScript, SQL, Angular, etc.]
```

### Plugin Architecture

```typescript
// Base class for all Advanced Generation plugins
abstract class AdvancedGenerationPlugin {
  abstract name: string;
  abstract description: string;

  abstract isEnabled(config: AdvancedGeneration): boolean;

  abstract execute(
    context: GenerationContext,
    llm: BaseLLM
  ): Promise<PluginResult>;

  // Hook for when to run (metadata, codegen, post-gen, etc.)
  abstract runPhase: 'metadata' | 'codegen' | 'post-gen';
}

// Plugin registration system
class AdvancedGenerationPluginRegistry {
  private plugins: Map<string, AdvancedGenerationPlugin> = new Map();

  register(plugin: AdvancedGenerationPlugin): void;
  getPlugin(name: string): AdvancedGenerationPlugin | undefined;
  getPluginsForPhase(phase: string): AdvancedGenerationPlugin[];
  executePlugins(phase: string, context: GenerationContext): Promise<void>;
}
```

---

## New Advanced Generation Features

### 1. Smart Field Identification

**Feature Name:** `SmartFieldIdentification`

**Purpose:** Use LLM to determine which fields should be marked as name fields and default in view, based on semantic analysis of the entire entity context.

**Inputs:**
- Entity name and description
- All field names, types, and descriptions
- Relationships to other entities
- Existing values (to detect user modifications)

**Outputs:**
- `NameField` - The human-readable identifier field
- `DefaultInView` - What to show in dropdowns/lists
- `SortPriority` - Logical sort order for fields

**LLM Prompt Structure:**
```json
{
  "systemPrompt": "You are a database metadata analyst...",
  "userMessage": {
    "entity": {
      "name": "Products",
      "description": "Catalog of products available for sale",
      "fields": [
        { "name": "ID", "type": "uniqueidentifier", "description": "Primary key" },
        { "name": "ProductSKU", "type": "nvarchar(50)", "description": "Stock keeping unit" },
        { "name": "ProductTitle", "type": "nvarchar(200)", "description": "Display name for product" },
        { "name": "InternalCode", "type": "nvarchar(20)", "description": "Internal reference code" }
      ]
    },
    "task": "Determine: (1) NameField, (2) DefaultInView"
  }
}
```

**Expected LLM Response:**
```json
{
  "nameField": "ProductTitle",
  "nameFieldReason": "Most user-friendly identifier for display purposes",
  "defaultInView": "ProductSKU",
  "defaultInViewReason": "Unique identifier users will recognize and search for",
  "sortPriority": {
    "ProductSKU": 1,
    "ProductTitle": 2,
    "InternalCode": 3,
    "ID": 4
  }
}
```

**Implementation Location:**
- Plugin: `/packages/CodeGenLib/src/Misc/plugins/SmartFieldIdentificationPlugin.ts`
- Called from: `ManageMetadataBase.manageEntityFields()`

**Protection Against Overwriting:**
```typescript
// Only apply if not already set by user
if (!entityField.IsNameField && !entityField._IsNameField_UserModified) {
  entityField.IsNameField = llmResult.nameField === entityField.Name;
}
```

---

### 2. Transitive Join Intelligence

**Feature Name:** `TransitiveJoinIntelligence`

**Purpose:** Automatically determine which additional fields to include when joining through junction tables or intermediate entities.

**Problem Scenario:**
```
TableX (FK: UserRoleID)
  → UserRole (junction table: UserID, RoleID)
    → User (Name)
    → Role (Name)
```

When `TableX` joins to `UserRole`, we should also bring in `User.Name` and `Role.Name` because `UserRole` is semantically meaningless without them.

**Inputs:**
- Source entity
- Target entity (relationship)
- Target entity's relationships
- Field metadata for all involved entities

**Outputs:**
- List of additional fields to include in view
- List of additional relationships to auto-create

**LLM Prompt Structure:**
```json
{
  "entity": "TableX",
  "relationship": {
    "targetEntity": "UserRole",
    "foreignKey": "UserRoleID"
  },
  "targetEntityDetails": {
    "name": "UserRole",
    "fields": [
      { "name": "ID", "type": "uniqueidentifier" },
      { "name": "UserID", "type": "uniqueidentifier" },
      { "name": "RoleID", "type": "uniqueidentifier" }
    ],
    "relationships": [
      { "name": "User", "field": "UserID", "targetEntity": "Users" },
      { "name": "Role", "field": "RoleID", "targetEntity": "Roles" }
    ]
  },
  "task": "Determine if UserRole is a junction table and if so, which transitive fields should be included when TableX joins to it."
}
```

**Expected LLM Response:**
```json
{
  "isJunctionTable": true,
  "reason": "UserRole has only FK fields and no meaningful data of its own",
  "additionalFieldsToInclude": [
    { "fieldName": "UserID", "include": true },
    { "fieldName": "RoleID", "include": true },
    { "fieldName": "User", "include": true, "type": "virtual" },
    { "fieldName": "Role", "include": true, "type": "virtual" }
  ],
  "suggestedVirtualFields": [
    {
      "name": "User",
      "sourceFieldName": "UserID",
      "targetEntity": "Users",
      "displayField": "Name"
    },
    {
      "name": "Role",
      "sourceFieldName": "RoleID",
      "targetEntity": "Roles",
      "displayField": "Name"
    }
  ]
}
```

**Implementation:**
- Plugin: `/packages/CodeGenLib/src/Misc/plugins/TransitiveJoinPlugin.ts`
- Called from: `ManageMetadataBase.manageEntityRelationships()`
- Updates: `EntityRelationship.AdditionalFieldsToInclude` (new field in metadata)

**Metadata Schema Change:**
```sql
-- New column in __mj.EntityRelationship
ALTER TABLE __mj.EntityRelationship
ADD AdditionalFieldsToInclude NVARCHAR(MAX) NULL;
-- JSON array of field names to include in joins
-- Example: ["UserID", "RoleID", "User", "Role"]
```

---

### 3. Form Layout Generation with Collapsible Sections

**Feature Name:** `FormLayoutGeneration`

**Purpose:** Generate modern, semantically-grouped form layouts with collapsible sections and appropriate icons, replacing the current flat tab-based approach.

**Current State:**
- Fields dumped in sequential order
- Generic tabs with no semantic grouping
- No visual icons or organizational structure

**Target State:**
- Logical field grouping by category
- Collapsible sections with icons (like AI Agent form)
- Priority-based ordering
- Metadata-driven (stored in `EntityField.Category`)

**Inputs:**
- Entity name and description
- All fields with names, types, descriptions
- Relationships
- Business context (if available)

**Outputs:**
- Category assignments for each field
- Icon recommendations for each category
- Section ordering priority
- Recommended default expanded/collapsed state

**LLM Prompt Structure:**
```json
{
  "entity": {
    "name": "Customers",
    "description": "Customer master data",
    "fields": [
      { "name": "ID", "type": "uniqueidentifier", "description": "Primary key" },
      { "name": "CustomerName", "type": "nvarchar(200)", "description": "Full name" },
      { "name": "Email", "type": "nvarchar(100)", "description": "Email address" },
      { "name": "Phone", "type": "nvarchar(20)", "description": "Phone number" },
      { "name": "BillingAddress", "type": "nvarchar(500)", "description": "Billing address" },
      { "name": "PaymentMethodID", "type": "uniqueidentifier", "description": "Default payment method" },
      { "name": "PreferredLanguage", "type": "nvarchar(10)", "description": "Language preference" },
      { "name": "NewsletterOptIn", "type": "bit", "description": "Newsletter subscription" },
      { "name": "__mj_CreatedAt", "type": "datetime", "description": "Record creation timestamp" },
      { "name": "__mj_UpdatedAt", "type": "datetime", "description": "Last update timestamp" }
    ]
  },
  "task": "Group these fields into logical categories with appropriate icons. Use Font Awesome icon classes (fa-solid, fa-user, etc.)"
}
```

**Expected LLM Response:**
```json
{
  "categories": [
    {
      "name": "Basic Information",
      "icon": "fa-solid fa-user",
      "priority": 1,
      "defaultExpanded": true,
      "fields": ["CustomerName", "Email", "Phone"]
    },
    {
      "name": "Billing Details",
      "icon": "fa-solid fa-credit-card",
      "priority": 2,
      "defaultExpanded": false,
      "fields": ["BillingAddress", "PaymentMethodID"]
    },
    {
      "name": "Preferences",
      "icon": "fa-solid fa-sliders",
      "priority": 3,
      "defaultExpanded": false,
      "fields": ["PreferredLanguage", "NewsletterOptIn"]
    },
    {
      "name": "System Information",
      "icon": "fa-solid fa-info-circle",
      "priority": 4,
      "defaultExpanded": false,
      "fields": ["ID", "__mj_CreatedAt", "__mj_UpdatedAt"]
    }
  ]
}
```

**Implementation:**
- Plugin: `/packages/CodeGenLib/src/Misc/plugins/FormLayoutGenerationPlugin.ts`
- Called from: Either metadata phase OR Angular generation phase (TBD)
- Updates: `EntityField.Category` and new `EntityFieldCategory` table (see schema below)

**Metadata Schema Changes:**

```sql
-- New table for category definitions
CREATE TABLE __mj.EntityFieldCategory (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Icon NVARCHAR(100) NULL,  -- Font Awesome class
    Priority INT NOT NULL DEFAULT 100,
    DefaultExpanded BIT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (EntityID) REFERENCES __mj.Entity(ID)
);

-- Update EntityField to reference category
ALTER TABLE __mj.EntityField
ADD CategoryID UNIQUEIDENTIFIER NULL,
    FOREIGN KEY (CategoryID) REFERENCES __mj.EntityFieldCategory(ID);
```

**Angular Generation Changes:**

```typescript
// In AngularClientGeneratorBase
protected generateFormHTML(entity: EntityInfo): string {
  const categories = this.getCategoriesForEntity(entity);

  if (categories.length > 0) {
    return this.generateCollapsibleSectionLayout(entity, categories);
  } else {
    return this.generateTraditionalTabLayout(entity);
  }
}

protected generateCollapsibleSectionLayout(
  entity: EntityInfo,
  categories: CategoryInfo[]
): string {
  return `
    <div class="entity-form-container">
      ${categories.map(category => `
        <mj-collapsible-section
          title="${category.Name}"
          icon="${category.Icon}"
          [defaultExpanded]="${category.DefaultExpanded}">
          ${this.generateFieldsForCategory(entity, category)}
        </mj-collapsible-section>
      `).join('\n')}
    </div>
  `;
}
```

**Reference Implementation:**
- Study existing: `/packages/Angular/Explorer/core-entity-forms/src/lib/ai-agent-form/ai-agent-form.component.html`
- Reusable component: Create `CollapsibleSectionComponent` in shared library

---

### 4. Batch Processing for Efficiency

**Feature Name:** Built-in to all plugins

**Purpose:** Reduce LLM API calls by combining multiple decisions into single prompts.

**Strategy:**

Instead of:
```typescript
// Bad: Multiple LLM calls
for (const field of entity.Fields) {
  const isNameField = await llm.determineNameField(field);
  const category = await llm.determineCategory(field);
}
```

Do this:
```typescript
// Good: Single combined call
const prompt = `
Analyze this entity and determine:
1. Which field is the NameField?
2. Which field is DefaultInView?
3. What categories should fields be grouped into?
4. What icons should each category have?

Entity: ${entity.Name}
Fields: ${JSON.stringify(entity.Fields)}
`;

const decisions = await llm.analyze(prompt);
// Parse all decisions from single response
```

**Configuration:**
```typescript
{
  name: "SmartFieldIdentification",
  enabled: true,
  options: [
    { name: "batchDecisions", value: true },
    { name: "combinedWithFormLayout", value: true }
  ]
}
```

---

## Implementation Details

### Plugin System Architecture

**File:** `/packages/CodeGenLib/src/Misc/plugins/PluginBase.ts`

```typescript
import { BaseLLM } from "@memberjunction/ai";
import { EntityInfo } from "@memberjunction/core";
import { AdvancedGenerationFeature } from "../../Config/config";

export type GenerationPhase = 'metadata' | 'sql' | 'typescript' | 'angular' | 'graphql' | 'post-gen';

export interface PluginContext {
  entity: EntityInfo;
  allEntities: EntityInfo[];
  phase: GenerationPhase;
  pool: any; // SQL connection pool
  metadata: any; // Metadata instance
  currentUser: any;
}

export interface PluginResult {
  success: boolean;
  modified: boolean;
  changes?: any;
  error?: string;
}

export abstract class AdvancedGenerationPlugin {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly runPhase: GenerationPhase;

  /**
   * Check if plugin is enabled based on config
   */
  abstract isEnabled(feature: AdvancedGenerationFeature): boolean;

  /**
   * Execute the plugin's logic
   */
  abstract execute(
    context: PluginContext,
    llm: BaseLLM
  ): Promise<PluginResult>;

  /**
   * Validate plugin can run (dependencies, prerequisites, etc.)
   */
  validate(context: PluginContext): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * Cleanup after execution
   */
  async cleanup(): Promise<void> {
    // Default: no-op
  }
}
```

**File:** `/packages/CodeGenLib/src/Misc/plugins/PluginRegistry.ts`

```typescript
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { AdvancedGenerationPlugin, GenerationPhase, PluginContext } from "./PluginBase";
import { BaseLLM } from "@memberjunction/ai";
import { configInfo } from "../../Config/config";

export class AdvancedGenerationPluginRegistry {
  private static _instance: AdvancedGenerationPluginRegistry;
  private plugins: Map<string, AdvancedGenerationPlugin> = new Map();

  private constructor() {
    this.discoverPlugins();
  }

  public static get Instance(): AdvancedGenerationPluginRegistry {
    if (!this._instance) {
      this._instance = new AdvancedGenerationPluginRegistry();
    }
    return this._instance;
  }

  /**
   * Discover and register all plugins using ClassFactory
   */
  private discoverPlugins(): void {
    // Use ClassFactory to discover all AdvancedGenerationPlugin subclasses
    const pluginClasses = MJGlobal.Instance.ClassFactory.GetRegistrations(AdvancedGenerationPlugin);

    for (const registration of pluginClasses) {
      const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<AdvancedGenerationPlugin>(
        AdvancedGenerationPlugin,
        registration.ClassName
      );

      if (plugin) {
        this.plugins.set(plugin.name, plugin);
      }
    }
  }

  /**
   * Get all plugins for a specific phase
   */
  public getPluginsForPhase(phase: GenerationPhase): AdvancedGenerationPlugin[] {
    return Array.from(this.plugins.values())
      .filter(p => p.runPhase === phase);
  }

  /**
   * Execute all enabled plugins for a phase
   */
  public async executePhase(
    phase: GenerationPhase,
    context: PluginContext,
    llm: BaseLLM
  ): Promise<void> {
    const plugins = this.getPluginsForPhase(phase);

    for (const plugin of plugins) {
      const feature = configInfo.advancedGeneration?.features?.find(
        f => f.name === plugin.name
      );

      if (!feature || !plugin.isEnabled(feature)) {
        continue; // Skip disabled plugins
      }

      // Validate before running
      const valid = await plugin.validate(context);
      if (!valid) {
        console.warn(`Plugin ${plugin.name} validation failed, skipping`);
        continue;
      }

      // Execute plugin
      try {
        const result = await plugin.execute(context, llm);

        if (!result.success) {
          console.error(`Plugin ${plugin.name} failed:`, result.error);
        }
      } catch (error) {
        console.error(`Plugin ${plugin.name} threw error:`, error);
      } finally {
        await plugin.cleanup();
      }
    }
  }
}
```

### Example Plugin Implementation

**File:** `/packages/CodeGenLib/src/Misc/plugins/SmartFieldIdentificationPlugin.ts`

```typescript
import { RegisterClass } from "@memberjunction/global";
import { AdvancedGenerationPlugin, PluginContext, PluginResult } from "./PluginBase";
import { BaseLLM } from "@memberjunction/ai";
import { AdvancedGenerationFeature } from "../../Config/config";

@RegisterClass(AdvancedGenerationPlugin, 'SmartFieldIdentification')
export class SmartFieldIdentificationPlugin extends AdvancedGenerationPlugin {
  readonly name = 'SmartFieldIdentification';
  readonly description = 'Use LLM to intelligently identify name fields and default view fields';
  readonly runPhase = 'metadata' as const;

  isEnabled(feature: AdvancedGenerationFeature): boolean {
    return feature.enabled === true;
  }

  async execute(context: PluginContext, llm: BaseLLM): Promise<PluginResult> {
    const { entity } = context;

    // Build prompt
    const systemPrompt = this.getSystemPrompt();
    const userMessage = this.buildUserMessage(entity);

    // Call LLM
    const response = await llm.ChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]);

    // Parse response
    const decisions = JSON.parse(response);

    // Apply decisions (only if not user-modified)
    let modified = false;
    for (const field of entity.Fields) {
      if (field.Name === decisions.nameField && !field._IsNameField_UserModified) {
        field.IsNameField = true;
        modified = true;
      }

      if (field.Name === decisions.defaultInView && !field._DefaultInView_UserModified) {
        field.DefaultInView = true;
        modified = true;
      }
    }

    return {
      success: true,
      modified,
      changes: decisions
    };
  }

  private getSystemPrompt(): string {
    return `You are a database metadata analyst. Analyze entity structures and determine the most appropriate fields for user identification and display.

Return JSON in this exact format:
{
  "nameField": "FieldName",
  "nameFieldReason": "Brief explanation",
  "defaultInView": "FieldName",
  "defaultInViewReason": "Brief explanation"
}`;
  }

  private buildUserMessage(entity: any): string {
    return `
Entity: ${entity.Name}
Description: ${entity.Description || 'N/A'}

Fields:
${entity.Fields.map((f: any) =>
  `  - ${f.Name} (${f.Type}): ${f.Description || 'N/A'}`
).join('\n')}

Determine:
1. Which field should be marked as "NameField" (human-readable identifier)?
2. Which field should be "DefaultInView" (shown in dropdowns)?
`;
  }
}
```

### Integration into CodeGen Pipeline

**File:** `/packages/CodeGenLib/src/Database/manage-metadata.ts`

```typescript
import { AdvancedGeneration } from "../Misc/advanced_generation";
import { AdvancedGenerationPluginRegistry } from "../Misc/plugins/PluginRegistry";

export class ManageMetadataBase {

  protected async manageEntityFields(
    pool: sql.ConnectionPool,
    entity: EntityInfo,
    currentUser: any
  ): Promise<void> {

    // ... existing field management code ...

    // Execute Advanced Generation plugins for metadata phase
    const ag = new AdvancedGeneration();
    if (ag.enabled) {
      const registry = AdvancedGenerationPluginRegistry.Instance;
      const context = {
        entity,
        allEntities: await this.getAllEntities(pool),
        phase: 'metadata' as const,
        pool,
        metadata: this.metadata,
        currentUser
      };

      await registry.executePhase('metadata', context, ag.LLM);
    }

    // ... continue with field creation/update ...
  }
}
```

---

## Configuration Schema Updates

**File:** `/packages/CodeGenLib/src/Config/config.ts`

```typescript
export type AdvancedGeneration = z.infer<typeof advancedGenerationSchema>;
const advancedGenerationSchema = z.object({
  enableAdvancedGeneration: z.boolean().default(true),
  AIVendor: z.enum(['openai', 'anthropic', 'mistral', 'groq']).default('anthropic'),
  AIModel: z.string().default('claude-sonnet-4'),

  features: advancedGenerationFeatureSchema.array().default([
    // Existing features
    {
      name: 'EntityNames',
      description: 'Use AI to generate better entity names when creating new entities',
      enabled: false,
    },
    {
      name: 'EntityDescriptions',
      description: 'Generate descriptions for new entities',
      enabled: false,
    },
    {
      name: 'CheckConstraintParser',
      description: 'Parse CHECK constraints into TypeScript validation code',
      enabled: false,
    },

    // NEW FEATURES
    {
      name: 'SmartFieldIdentification',
      description: 'Intelligently identify name fields and default view fields using semantic analysis',
      enabled: false,
      options: [
        { name: 'batchDecisions', value: true },
        { name: 'respectUserModifications', value: true }
      ]
    },
    {
      name: 'TransitiveJoinIntelligence',
      description: 'Automatically determine additional fields to include for transitive relationships',
      enabled: false,
      options: [
        { name: 'detectJunctionTables', value: true },
        { name: 'maxDepth', value: 2 } // How many levels deep to traverse
      ]
    },
    {
      name: 'FormLayoutGeneration',
      description: 'Generate modern form layouts with collapsible sections and icons',
      enabled: false,
      options: [
        { name: 'useCollapsibleSections', value: true },
        { name: 'generateIcons', value: true },
        { name: 'iconLibrary', value: 'font-awesome' }
      ]
    }
  ]),

  // NEW: Plugin-specific settings
  pluginSettings: z.object({
    allowReanalysis: z.boolean().default(false), // Re-run on existing entities
    respectUserModifications: z.boolean().default(true),
    batchProcessing: z.boolean().default(true),
    maxBatchSize: z.number().default(10),
  }).nullish(),
});
```

**Example Configuration File:**

```javascript
// mj.config.cjs
module.exports = {
  // ... existing config ...

  advancedGeneration: {
    enableAdvancedGeneration: true,
    AIVendor: 'anthropic',
    AIModel: 'claude-sonnet-4',

    features: [
      {
        name: 'SmartFieldIdentification',
        enabled: true,
        options: [
          { name: 'batchDecisions', value: true }
        ]
      },
      {
        name: 'TransitiveJoinIntelligence',
        enabled: true,
        options: [
          { name: 'maxDepth', value: 2 }
        ]
      },
      {
        name: 'FormLayoutGeneration',
        enabled: true,
        options: [
          { name: 'useCollapsibleSections', value: true },
          { name: 'generateIcons', value: true }
        ]
      }
    ],

    pluginSettings: {
      allowReanalysis: false, // Only run on new entities
      respectUserModifications: true,
      batchProcessing: true
    }
  }
};
```

---

## Plugin System Design

### Directory Structure

```
packages/CodeGenLib/src/Misc/
├── advanced_generation.ts          # Existing base class
└── plugins/
    ├── PluginBase.ts               # Abstract base class
    ├── PluginRegistry.ts           # Discovery and execution
    ├── SmartFieldIdentificationPlugin.ts
    ├── TransitiveJoinPlugin.ts
    ├── FormLayoutGenerationPlugin.ts
    └── index.ts                    # Exports
```

### Plugin Lifecycle

```
1. Discovery Phase (on CodeGen startup)
   ↓
   [PluginRegistry scans ClassFactory]
   ↓
   [Finds all @RegisterClass(AdvancedGenerationPlugin) classes]
   ↓
   [Stores in registry Map]

2. Execution Phase (during CodeGen pipeline)
   ↓
   [CodeGen reaches a phase: 'metadata', 'sql', 'angular', etc.]
   ↓
   [Registry.executePhase(phase) called]
   ↓
   [Get all plugins for that phase]
   ↓
   [Filter: only enabled plugins]
   ↓
   [For each plugin:]
     ↓
     [Validate prerequisites]
     ↓
     [Execute plugin.execute(context, llm)]
     ↓
     [Handle result/errors]
     ↓
     [Cleanup]

3. Post-Execution
   ↓
   [Continue with normal CodeGen flow]
```

### Plugin Registration Pattern

```typescript
// Each plugin auto-registers via decorator
@RegisterClass(AdvancedGenerationPlugin, 'MyCustomPlugin')
export class MyCustomPlugin extends AdvancedGenerationPlugin {
  // Implementation
}

// Discovery happens automatically via ClassFactory
// No manual registration needed!
```

### Adding New Plugins (Developer Guide)

To add a new plugin in the future:

1. **Create plugin file:**
   ```typescript
   // packages/CodeGenLib/src/Misc/plugins/MyFeaturePlugin.ts
   import { RegisterClass } from "@memberjunction/global";
   import { AdvancedGenerationPlugin, PluginContext, PluginResult } from "./PluginBase";

   @RegisterClass(AdvancedGenerationPlugin, 'MyFeature')
   export class MyFeaturePlugin extends AdvancedGenerationPlugin {
     readonly name = 'MyFeature';
     readonly description = 'What my feature does';
     readonly runPhase = 'metadata'; // or 'sql', 'angular', etc.

     isEnabled(feature) { return feature.enabled; }

     async execute(context, llm) {
       // Your logic here
       return { success: true, modified: false };
     }
   }
   ```

2. **Add to config schema:**
   ```typescript
   // In config.ts features array
   {
     name: 'MyFeature',
     description: 'What my feature does',
     enabled: false
   }
   ```

3. **Export from index:**
   ```typescript
   // plugins/index.ts
   export * from './MyFeaturePlugin';
   ```

4. **Done!** Plugin auto-discovered and available.

---

## Migration and Backwards Compatibility

### Database Schema Migration

**File:** `migrations/v2/VYYYYMMDDHHmm__v2.x_Advanced_Generation_Metadata.sql`

```sql
-- Add user modification tracking columns to EntityField
ALTER TABLE [${flyway:defaultSchema}].EntityField
ADD _IsNameField_UserModified BIT NOT NULL DEFAULT 0,
    _DefaultInView_UserModified BIT NOT NULL DEFAULT 0,
    CategoryID UNIQUEIDENTIFIER NULL;

-- Create EntityFieldCategory table
CREATE TABLE [${flyway:defaultSchema}].EntityFieldCategory (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Icon NVARCHAR(100) NULL,
    Priority INT NOT NULL DEFAULT 100,
    DefaultExpanded BIT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_EntityFieldCategory_Entity
        FOREIGN KEY (EntityID) REFERENCES [${flyway:defaultSchema}].Entity(ID)
);

-- Add foreign key for Category
ALTER TABLE [${flyway:defaultSchema}].EntityField
ADD CONSTRAINT FK_EntityField_Category
    FOREIGN KEY (CategoryID) REFERENCES [${flyway:defaultSchema}].EntityFieldCategory(ID);

-- Add transitive join metadata
ALTER TABLE [${flyway:defaultSchema}].EntityRelationship
ADD AdditionalFieldsToInclude NVARCHAR(MAX) NULL;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of additional field names to include when joining through this relationship',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityRelationship',
    @level2type = N'COLUMN', @level2name = 'AdditionalFieldsToInclude';
```

### Backwards Compatibility Strategy

**No Breaking Changes:**
- All new features are opt-in via configuration
- Existing CodeGen behavior unchanged when features disabled
- New database columns allow NULL
- Tracking columns default to 0 (not user-modified)

**Safe Defaults:**
```typescript
// In config.ts - all new features default to disabled
features: [
  {
    name: 'SmartFieldIdentification',
    enabled: false, // Must explicitly enable
  }
]
```

**Fallback Behavior:**
```typescript
// In plugin execution
if (ag.featureEnabled('SmartFieldIdentification')) {
  // Use LLM-based detection
  return await smartDetection(entity);
} else {
  // Use existing heuristic
  return entity.Fields.find(f => f.Name === 'Name');
}
```

---

## Testing Strategy

### Unit Tests

**File:** `/packages/CodeGenLib/src/__tests__/plugins/SmartFieldIdentification.test.ts`

```typescript
describe('SmartFieldIdentificationPlugin', () => {
  let plugin: SmartFieldIdentificationPlugin;
  let mockLLM: jest.Mocked<BaseLLM>;

  beforeEach(() => {
    plugin = new SmartFieldIdentificationPlugin();
    mockLLM = createMockLLM();
  });

  test('identifies correct name field from LLM response', async () => {
    // Arrange
    mockLLM.ChatCompletion.mockResolvedValue(JSON.stringify({
      nameField: 'ProductTitle',
      defaultInView: 'ProductSKU'
    }));

    const context = createMockContext({
      entity: {
        Name: 'Products',
        Fields: [
          { Name: 'ID', Type: 'uniqueidentifier' },
          { Name: 'ProductSKU', Type: 'nvarchar(50)' },
          { Name: 'ProductTitle', Type: 'nvarchar(200)' }
        ]
      }
    });

    // Act
    const result = await plugin.execute(context, mockLLM);

    // Assert
    expect(result.success).toBe(true);
    expect(result.modified).toBe(true);
    expect(context.entity.Fields[2].IsNameField).toBe(true);
    expect(context.entity.Fields[1].DefaultInView).toBe(true);
  });

  test('respects user modifications', async () => {
    // Test that fields with _UserModified flag are not changed
  });

  test('handles LLM errors gracefully', async () => {
    // Test error handling when LLM fails
  });
});
```

### Integration Tests

**File:** `/packages/CodeGenLib/src/__tests__/integration/plugin-pipeline.test.ts`

```typescript
describe('Plugin Pipeline Integration', () => {
  test('executes all metadata phase plugins in order', async () => {
    // Test full pipeline execution
  });

  test('skips disabled plugins', async () => {
    // Test configuration filtering
  });

  test('handles plugin failures without breaking pipeline', async () => {
    // Test error isolation
  });
});
```

### Manual Testing Checklist

- [ ] Create new entity with non-standard name field (e.g., `ProductSKU`)
- [ ] Verify LLM correctly identifies name field
- [ ] Manually set a name field, verify not overwritten
- [ ] Create entity with junction table relationship
- [ ] Verify transitive fields added to view
- [ ] Check generated Angular form has collapsible sections
- [ ] Verify icons display correctly
- [ ] Disable features, verify fallback to heuristics
- [ ] Test with different LLM vendors (OpenAI, Anthropic, etc.)
- [ ] Performance test: batch processing vs. individual calls

---

## Timeline and Phases

### Phase 1: Foundation (Week 1-2)

**Goals:**
- ✅ Plugin system architecture
- ✅ Registry and discovery mechanism
- ✅ Integration points in CodeGen pipeline
- ✅ Configuration schema updates
- ✅ Database migrations

**Deliverables:**
- `PluginBase.ts` and `PluginRegistry.ts`
- Updated `config.ts` with new feature definitions
- Migration SQL for metadata changes
- Unit tests for plugin system

### Phase 2: Smart Field Identification (Week 2-3)

**Goals:**
- ✅ Implement `SmartFieldIdentificationPlugin`
- ✅ LLM prompts and response parsing
- ✅ User modification tracking
- ✅ Integration with metadata management

**Deliverables:**
- Working plugin that identifies name fields
- Tests and documentation
- Example configurations

### Phase 3: Transitive Join Intelligence (Week 3-4)

**Goals:**
- ✅ Implement `TransitiveJoinPlugin`
- ✅ Junction table detection logic
- ✅ Additional field metadata storage
- ✅ SQL view generation updates

**Deliverables:**
- Plugin that adds transitive fields
- Updated SQL generation to use metadata
- Tests for complex relationship scenarios

### Phase 4: Form Layout Generation (Week 4-6)

**Goals:**
- ✅ Implement `FormLayoutGenerationPlugin`
- ✅ Category and icon generation
- ✅ Collapsible section component
- ✅ Angular generation updates

**Deliverables:**
- Plugin that generates form categories
- Reusable Angular component
- Updated Angular generator
- Migration of existing forms (optional)

### Phase 5: Refinement and Documentation (Week 6-7)

**Goals:**
- ✅ Performance optimization (batching)
- ✅ Error handling improvements
- ✅ Comprehensive documentation
- ✅ Example configurations

**Deliverables:**
- Optimized plugin execution
- Developer guide for adding plugins
- User guide for configuration
- Real-world examples

---

## Future Extensibility

### Potential Future Plugins

**1. RelationshipSuggestionPlugin**
- Analyze schema and suggest missing relationships
- Detect denormalization opportunities
- Recommend indexes based on query patterns

**2. ValidationRuleGenerationPlugin**
- Beyond CHECK constraints
- Business rule inference from field names/types
- Cross-field validation suggestions

**3. SecurityPolicyPlugin**
- Suggest role-based permissions
- Detect PII fields and recommend encryption
- Generate audit trail recommendations

**4. PerformanceOptimizationPlugin**
- Suggest indexes based on relationships
- Detect N+1 query patterns
- Recommend caching strategies

**5. DocumentationGenerationPlugin**
- Generate comprehensive entity documentation
- Create ER diagrams automatically
- Build API documentation

**6. TestDataGenerationPlugin**
- Generate realistic test data
- Respect constraints and relationships
- Create data migration scripts

### Plugin Hooks (Future)

```typescript
// Pre/post hooks for plugins
export abstract class AdvancedGenerationPlugin {
  async beforeExecute?(context: PluginContext): Promise<void>;
  async afterExecute?(result: PluginResult): Promise<void>;
  async onError?(error: Error): Promise<void>;
}
```

### Plugin Dependencies (Future)

```typescript
export abstract class AdvancedGenerationPlugin {
  // Declare dependencies on other plugins
  readonly dependencies?: string[];

  // Example:
  dependencies = ['SmartFieldIdentification']; // Must run first
}
```

### Plugin Configuration UI (Future)

- Web-based configuration editor
- Real-time preview of LLM suggestions
- Approval workflow for metadata changes
- Rollback capability

---

## Risk Mitigation

### Risk: LLM Hallucinations

**Mitigation:**
- Always validate LLM responses against schema
- Provide rollback mechanism
- User approval for significant changes
- Logging of all LLM decisions

### Risk: Performance Impact

**Mitigation:**
- Batch processing by default
- Caching of LLM responses
- Optional features (can disable)
- Parallel plugin execution where possible

### Risk: API Costs

**Mitigation:**
- Batch decisions to minimize calls
- Cache results for similar entities
- Configuration option to limit LLM usage
- Fallback to heuristics on error

### Risk: Breaking Changes

**Mitigation:**
- All features opt-in
- User modification tracking prevents overwrites
- Comprehensive testing
- Migration guides

---

## Success Metrics

### Quantitative Metrics

- **Accuracy:** % of name fields correctly identified (target: >90%)
- **Performance:** Time to run CodeGen with features enabled vs. disabled (target: <20% increase)
- **API Usage:** Number of LLM calls per entity (target: <3 calls via batching)
- **Adoption:** % of entities using generated categories (track over time)

### Qualitative Metrics

- **Developer Feedback:** Survey on ease of adding new plugins
- **User Satisfaction:** Feedback on generated form layouts
- **Code Quality:** Review of generated code vs. manual code
- **Extensibility:** Number of custom plugins created by users

---

## Conclusion

This plan provides a comprehensive, extensible architecture for adding LLM-powered intelligence to MemberJunction's CodeGen system. The plugin-based approach ensures:

✅ **Backwards Compatibility** - Existing functionality preserved
✅ **Opt-In Features** - Users choose what to enable
✅ **Extensibility** - Easy to add new capabilities
✅ **Performance** - Batching and caching minimize overhead
✅ **Safety** - User modifications protected
✅ **Future-Proof** - Foundation for many advanced features

The implementation follows MemberJunction's existing patterns (ClassFactory, RegisterClass, Zod config) and integrates seamlessly into the current CodeGen pipeline.

---

## Appendix: References

- **Existing AdvancedGeneration:** `/packages/CodeGenLib/src/Misc/advanced_generation.ts`
- **Metadata Management:** `/packages/CodeGenLib/src/Database/manage-metadata.ts`
- **Config Schema:** `/packages/CodeGenLib/src/Config/config.ts`
- **Angular Forms Example:** `/packages/Angular/Explorer/core-entity-forms/src/lib/ai-agent-form/`
- **ClassFactory Pattern:** `/packages/MJGlobal/src/`

---

**Next Steps:** Review this plan, discuss any modifications, then proceed with Phase 1 implementation.
