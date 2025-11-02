# Advanced Generation: Metadata Intelligence Enhancement

**Status:** Planning
**Created:** 2025-11-02
**Updated:** 2025-11-02
**Author:** AI Assistant
**Target Package:** `@memberjunction/codegen-lib`

---

## Executive Summary

This plan extends the existing Advanced Generation system in CodeGen to add intelligent, LLM-powered metadata inference capabilities. Instead of relying solely on heuristics (like "a field named 'Name' is the name field"), we'll use semantic analysis to make smarter decisions about entity metadata, relationships, and UI generation.

The system uses MemberJunction's **AI Prompts architecture** (`AIPromptRunner` + metadata-driven prompts) and is **fully optional** - when disabled, CodeGen continues to work exactly as it does today.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Goals and Non-Goals](#goals-and-non-goals)
3. [Architecture Overview](#architecture-overview)
4. [New Advanced Generation Features](#new-advanced-generation-features)
5. [Prompt Design](#prompt-design)
6. [Implementation Details](#implementation-details)
7. [Database Schema Changes](#database-schema-changes)
8. [Configuration](#configuration)
9. [Testing Strategy](#testing-strategy)
10. [Timeline and Phases](#timeline-and-phases)
11. [Risk Mitigation](#risk-mitigation)

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

**Current Approach:**
- Direct `BaseLLM.ChatCompletion()` calls
- Hardcoded prompts in code
- Simple string template substitution
- No model failover or retry logic
- No execution tracking

### Problems with Current Metadata Heuristics

**File:** `/packages/CodeGenLib/src/Database/manage-metadata.ts`

1. **Name Field Detection** - Assumes field called "Name" or "Title"
   - Fails on: `ProductSKU`, `CustomerCode`, `EmployeeNumber`

2. **Default in View** - No intelligent selection
   - Defaults to primary key or first text field
   - Doesn't consider semantic meaning

3. **Join Field Selection** - Can't handle transitive relationships
   - Example: `TableX → UserRole → User, Role`
   - Current system can't determine to include User/Role fields

4. **Form Layout** - Fields dumped sequentially
   - No logical grouping
   - No semantic categorization
   - Uses tabs instead of modern collapsible sections

---

## Goals and Non-Goals

### Goals

✅ **Use MJ's AI Prompts architecture** - `AIPromptRunner` with metadata-driven prompts
✅ **Add intelligent metadata inference** using LLM semantic analysis
✅ **Preserve existing CodeGen functionality** - system works without LLM features
✅ **Respect user modifications** - never override manual changes
✅ **Improve UI generation** - modern collapsible sections with icons
✅ **Handle transitive relationships** - smart join field inclusion
✅ **Proper error handling** - timeouts, fallbacks, retry logic
✅ **Execution tracking** - link to CodeGen runs for auditing

### Non-Goals

❌ Require LLM for basic CodeGen operation
❌ Override existing working heuristics (augment, don't replace)
❌ Build complex plugin architecture (keep it simple)
❌ Generate code that requires LLM at runtime
❌ Replace human decision-making for critical business logic

---

## Architecture Overview

### High-Level Approach

**Simple Enhancement Pattern:**

```
Database Schema Changes Detected
         ↓
[Metadata Management]
         ↓
   [Check if Advanced Generation enabled]
         ↓
       YES ──────────────────────> NO
         ↓                          ↓
   [Create AIPromptParams]    [Use Heuristics]
         ↓                          ↓
   [AIPromptRunner.ExecutePrompt]  │
         ↓                          │
   [Parse JSON Response]            │
         ↓                          │
   [Apply if not user-modified]    │
         ↓                          │
         └──────────┬───────────────┘
                    ↓
          [Update Metadata]
                    ↓
          [Generate Code]
```

### Key Components

1. **AI Prompts** (metadata/prompts)
   - Structured prompt definitions in JSON
   - Template files with Nunjucks syntax
   - Model/vendor configuration
   - Response format validation

2. **AIPromptRunner** (packages/AI/Prompts)
   - Executes prompts with model selection
   - Handles failover and retries
   - Validates JSON responses
   - Tracks execution history

3. **AdvancedGeneration** (packages/CodeGenLib)
   - Orchestrates prompt execution
   - Loads prompts from metadata
   - Applies results to entity metadata
   - Respects user modifications

4. **ManageMetadata** (packages/CodeGenLib)
   - Integration point for features
   - Calls AdvancedGeneration methods
   - Updates database records

---

## New Advanced Generation Features

### 1. Smart Field Identification

**Feature Name:** `SmartFieldIdentification`

**Purpose:** Use LLM to determine which fields should be marked as name fields and default in view.

**Inputs:**
- Entity name and description
- All field names, types, descriptions
- Relationships to other entities

**Outputs:**
```json
{
  "nameField": "ProductTitle",
  "nameFieldReason": "Most user-friendly identifier",
  "defaultInView": "ProductSKU",
  "defaultInViewReason": "Unique identifier users search for",
  "confidence": "high"
}
```

**When to Run:** During metadata management for new entities or when explicitly requested

**Implementation:** New prompt + integration in `ManageMetadataBase.manageEntityFields()`

---

### 2. Transitive Join Intelligence

**Feature Name:** `TransitiveJoinIntelligence`

**Purpose:** Automatically determine which additional fields to include when joining through junction tables.

**Problem Scenario:**
```
TableX (FK: UserRoleID)
  → UserRole (junction table: UserID, RoleID)
    → User (Name)
    → Role (Name)
```

When `TableX` joins to `UserRole`, we should also bring in `User` and `Role` because `UserRole` has no semantic meaning without them.

**Inputs:**
- Source entity
- Target entity (relationship target)
- Target entity's fields and relationships
- All entities in schema (for context)

**Outputs:**
```json
{
  "isJunctionTable": true,
  "reason": "UserRole has only FK fields and minimal other data",
  "additionalFields": [
    {
      "fieldName": "User",
      "fieldType": "virtual",
      "includeInView": true,
      "displayFields": ["Name", "Email"]
    },
    {
      "fieldName": "Role",
      "fieldType": "virtual",
      "includeInView": true,
      "displayFields": ["Name"]
    }
  ],
  "confidence": "high"
}
```

**When to Run:** During relationship creation/update

**Implementation:** New prompt + integration in `ManageMetadataBase.manageEntityRelationships()`

---

### 3. Form Layout Generation

**Feature Name:** `FormLayoutGeneration`

**Purpose:** Generate semantic field groupings with icons for modern collapsible section layouts.

**Inputs:**
- Entity name and description
- All fields with names, types, descriptions
- Relationships

**Outputs:**
```json
{
  "categories": [
    {
      "name": "Basic Information",
      "icon": "user",
      "priority": 1,
      "defaultExpanded": true,
      "fields": ["CustomerName", "Email", "Phone"]
    },
    {
      "name": "Billing Details",
      "icon": "credit-card",
      "priority": 2,
      "defaultExpanded": false,
      "fields": ["BillingAddress", "PaymentMethodID"]
    },
    {
      "name": "System Information",
      "icon": "info-circle",
      "priority": 4,
      "defaultExpanded": false,
      "fields": ["ID", "__mj_CreatedAt", "__mj_UpdatedAt"]
    }
  ]
}
```

**When to Run:** During metadata management (categories are semantic, not UI-specific)

**Implementation:** New prompt + new metadata tables + Angular generation updates

---

## Prompt Design

### Prompt Metadata Files

**Location:** `/metadata/prompts/`

Each feature gets a prompt definition file following MJ conventions:

#### Smart Field Identification Prompt

**File:** `.codegen-smart-field-identification.json`

```json
[
  {
    "fields": {
      "Name": "CodeGen: Smart Field Identification",
      "Description": "Analyzes entity structure to intelligently identify name fields and default view fields",
      "TypeID": "@lookup:AI Prompt Types.Name=Chat",
      "TemplateText": "@file:templates/codegen/smart-field-identification.template.md",
      "Status": "Active",
      "ResponseFormat": "JSON",
      "SelectionStrategy": "Specific",
      "PowerPreference": "Balanced",
      "ParallelizationMode": "None",
      "MaxRetries": 2,
      "RetryDelayMS": 1000,
      "RetryStrategy": "Fixed",
      "PromptRole": "System",
      "PromptPosition": "First",
      "CategoryID": "@lookup:AI Prompt Categories.Name=MJ: System"
    },
    "relatedEntities": {
      "MJ: AI Prompt Models": [
        {
          "fields": {
            "PromptID": "@parent:ID",
            "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B",
            "VendorID": "@lookup:MJ: AI Vendors.Name=Groq",
            "Priority": 1
          }
        },
        {
          "fields": {
            "PromptID": "@parent:ID",
            "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B",
            "VendorID": "@lookup:MJ: AI Vendors.Name=Cerebras",
            "Priority": 2
          }
        }
      ]
    }
  }
]
```

#### Transitive Join Intelligence Prompt

**File:** `.codegen-transitive-join-intelligence.json`

```json
[
  {
    "fields": {
      "Name": "CodeGen: Transitive Join Intelligence",
      "Description": "Analyzes entity relationships to determine which additional fields should be included in transitive joins through junction tables",
      "TypeID": "@lookup:AI Prompt Types.Name=Chat",
      "TemplateText": "@file:templates/codegen/transitive-join-intelligence.template.md",
      "Status": "Active",
      "ResponseFormat": "JSON",
      "SelectionStrategy": "Specific",
      "PowerPreference": "Balanced",
      "ParallelizationMode": "None",
      "MaxRetries": 2,
      "RetryDelayMS": 1000,
      "RetryStrategy": "Fixed",
      "PromptRole": "System",
      "PromptPosition": "First",
      "CategoryID": "@lookup:AI Prompt Categories.Name=MJ: System"
    },
    "relatedEntities": {
      "MJ: AI Prompt Models": [
        {
          "fields": {
            "PromptID": "@parent:ID",
            "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B",
            "VendorID": "@lookup:MJ: AI Vendors.Name=Groq",
            "Priority": 1
          }
        },
        {
          "fields": {
            "PromptID": "@parent:ID",
            "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B",
            "VendorID": "@lookup:MJ: AI Vendors.Name=Cerebras",
            "Priority": 2
          }
        }
      ]
    }
  }
]
```

#### Form Layout Generation Prompt

**File:** `.codegen-form-layout-generation.json`

```json
[
  {
    "fields": {
      "Name": "CodeGen: Form Layout Generation",
      "Description": "Analyzes entity fields to generate semantic categories with icons for collapsible section layouts",
      "TypeID": "@lookup:AI Prompt Types.Name=Chat",
      "TemplateText": "@file:templates/codegen/form-layout-generation.template.md",
      "Status": "Active",
      "ResponseFormat": "JSON",
      "SelectionStrategy": "Specific",
      "PowerPreference": "Balanced",
      "ParallelizationMode": "None",
      "MaxRetries": 2,
      "RetryDelayMS": 1000,
      "RetryStrategy": "Fixed",
      "PromptRole": "System",
      "PromptPosition": "First",
      "CategoryID": "@lookup:AI Prompt Categories.Name=MJ: System"
    },
    "relatedEntities": {
      "MJ: AI Prompt Models": [
        {
          "fields": {
            "PromptID": "@parent:ID",
            "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B",
            "VendorID": "@lookup:MJ: AI Vendors.Name=Groq",
            "Priority": 1
          }
        },
        {
          "fields": {
            "PromptID": "@parent:ID",
            "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B",
            "VendorID": "@lookup:MJ: AI Vendors.Name=Cerebras",
            "Priority": 2
          }
        }
      ]
    }
  }
]
```

### Prompt Templates

**Location:** `/metadata/prompts/templates/codegen/`

#### Smart Field Identification Template

**File:** `smart-field-identification.template.md`

```markdown
# Entity Field Analyzer

You are an expert database analyst specializing in identifying the most appropriate fields for user-facing displays and semantic naming.

## Your Task

Analyze the provided entity structure and determine:
1. Which field should be the **Name Field** (primary human-readable identifier)
2. Which field should be **Default in View** (shown in dropdowns/lists)

## Entity Information

### Entity Name
{{ entityName }}

{% if entityDescription %}
### Description
{{ entityDescription }}
{% endif %}

### Fields
{% for field in fields %}
- **{{ field.Name }}** ({{ field.Type }}){% if field.IsNullable %} - Nullable{% endif %}
  {% if field.Description %}
  Description: {{ field.Description }}
  {% endif %}
  {% if field.IsPrimaryKey %}
  **Primary Key**
  {% endif %}
  {% if field.IsUnique %}
  **Unique**
  {% endif %}
{% endfor %}

{% if relationships %}
### Relationships
{% for rel in relationships %}
- {{ rel.Name }} → {{ rel.RelatedEntity }}
{% endfor %}
{% endif %}

## Analysis Guidelines

### Name Field Selection

The Name Field should be:
- **User-friendly** - What humans naturally call this record
- **Readable** - Contains actual names/titles, not codes
- **Descriptive** - Provides semantic meaning
- **Unique or near-unique** - Helps distinguish records

Good candidates:
- Fields with "name", "title", "label" in the name
- String fields that are UNIQUE NOT NULL
- Fields that would appear in a heading or title

Bad candidates:
- Primary keys (UUIDs, integers)
- Internal codes (SKU, unless that's what users actually use)
- Technical fields (__mj_*, ID, CreatedAt)
- Overly long text fields (descriptions, notes)

### Default in View Selection

The Default in View field should be:
- **Recognizable** - What users search for or reference
- **Unique** - Helps identify the specific record
- **Concise** - Short enough for dropdown display
- **Practical** - What users actually use day-to-day

This might be:
- The same as Name Field (common case)
- A unique code if that's how users reference items (e.g., ProductSKU, OrderNumber)
- A composite display (but single field only - we'll concatenate elsewhere if needed)

## Output Format

Return a JSON object with this exact structure:

```json
{
  "nameField": "FieldName",
  "nameFieldReason": "Brief explanation of why this field is best for human-readable identification",
  "defaultInView": "FieldName",
  "defaultInViewReason": "Brief explanation of why this field should appear in dropdowns",
  "confidence": "high|medium|low"
}
```

### Confidence Levels
- **high**: Clear, obvious choice (e.g., "CustomerName" in Customers table)
- **medium**: Reasonable choice but alternatives exist (e.g., "Title" vs "Name")
- **low**: No strong candidate, best guess (e.g., all fields are codes/IDs)

## Important Rules

- You **must** return ONLY the JSON object, no other text before or after
- Field names must exactly match the provided field list
- If no good candidate exists, choose the best available and explain in reason
- Consider business context from field and entity names
- Prefer semantic fields over technical fields

## Example

For entity "Products" with fields: ID, ProductSKU, ProductTitle, InternalCode, Price

```json
{
  "nameField": "ProductTitle",
  "nameFieldReason": "Most user-friendly identifier for display purposes - describes what the product is",
  "defaultInView": "ProductSKU",
  "defaultInViewReason": "Unique identifier that users recognize and search for when looking up products",
  "confidence": "high"
}
```
```

#### Transitive Join Intelligence Template

**File:** `transitive-join-intelligence.template.md`

```markdown
# Junction Table and Transitive Relationship Analyzer

You are an expert database architect specializing in relationship analysis and view optimization.

## Your Task

Analyze the provided entity relationship to determine:
1. Whether the target entity is a **junction table** (linking table with minimal semantic value)
2. If so, which **additional fields** should be included when joining through it

## Relationship Context

### Source Entity
{{ sourceEntityName }}

### Target Entity (Relationship Target)
{{ targetEntityName }}

{% if targetEntityDescription %}
**Description:** {{ targetEntityDescription }}
{% endif %}

### Target Entity Fields
{% for field in targetFields %}
- **{{ field.Name }}** ({{ field.Type }}){% if field.IsPrimaryKey %} - PK{% endif %}{% if field.IsForeignKey %} - FK{% endif %}
  {% if field.Description %}
  {{ field.Description }}
  {% endif %}
{% endfor %}

### Target Entity Relationships
{% for rel in targetRelationships %}
- **{{ rel.FieldName }}** → {{ rel.RelatedEntity }}.{{ rel.RelatedEntityNameField }}
{% endfor %}

## Junction Table Detection

A junction table typically has these characteristics:
- **2+ foreign keys** to other entities
- **Few or no other fields** beyond FKs and metadata
- **No significant business data** of its own
- **Name suggests linkage** (e.g., UserRole, OrderProduct, StudentCourse)
- **Purpose is to connect** two entities in a many-to-many relationship

Common patterns:
- EntityA + EntityB (e.g., "UserRole", "ProductCategory")
- EntityA + Verb + EntityB (e.g., "PersonOwnsAsset")
- Just a linking concept (e.g., "Assignment", "Membership")

## Analysis Guidelines

### If Junction Table

Recommend including:
1. **All FK fields** - Users need to see what's linked
2. **Virtual fields** for related entities - Include the name fields from related entities
3. **Any status/date fields** - If junction has metadata like "AssignedDate", include it

### If NOT Junction Table

If the target entity has significant business data of its own (beyond just linking), it should be treated as a normal entity and no additional transitive fields are needed.

## Output Format

Return a JSON object with this exact structure:

```json
{
  "isJunctionTable": true,
  "reason": "Clear explanation of why this is or isn't a junction table",
  "additionalFields": [
    {
      "fieldName": "User",
      "fieldType": "virtual",
      "includeInView": true,
      "displayFields": ["Name", "Email"],
      "reason": "Users need to see which user is linked"
    }
  ],
  "confidence": "high|medium|low"
}
```

### Field Types
- **virtual** - Field created by CodeGen based on FK relationship
- **existing** - Field already exists in the target entity

### Confidence Levels
- **high**: Clear junction table with obvious transitive fields needed
- **medium**: Likely junction but could go either way
- **low**: Uncertain, more information would help

## Important Rules

- You **must** return ONLY the JSON object, no other text before or after
- If not a junction table, set `isJunctionTable: false` and `additionalFields: []`
- Field names must be actual field names from the relationship list
- Virtual fields should use the relationship name (e.g., "User" not "UserID")
- Focus on fields that add semantic value to the view

## Example 1: Clear Junction Table

**Target Entity:** UserRole (UserID FK, RoleID FK)

```json
{
  "isJunctionTable": true,
  "reason": "UserRole contains only foreign keys to User and Role with no additional business data - it exists solely to link users to roles",
  "additionalFields": [
    {
      "fieldName": "User",
      "fieldType": "virtual",
      "includeInView": true,
      "displayFields": ["Name", "Email"],
      "reason": "Need to see which user is assigned to the role"
    },
    {
      "fieldName": "Role",
      "fieldType": "virtual",
      "includeInView": true,
      "displayFields": ["Name"],
      "reason": "Need to see which role is assigned to the user"
    }
  ],
  "confidence": "high"
}
```

## Example 2: Not a Junction Table

**Target Entity:** Order (CustomerID FK, but also OrderNumber, OrderDate, TotalAmount, Status, etc.)

```json
{
  "isJunctionTable": false,
  "reason": "Order is a substantial business entity with significant data beyond just linking Customer to Products - it has order numbers, dates, amounts, status, and represents a real business transaction",
  "additionalFields": [],
  "confidence": "high"
}
```
```

#### Form Layout Generation Template

**File:** `form-layout-generation.template.md`

```markdown
# Entity Form Layout Designer

You are a UX expert specializing in data entry form design and field organization.

## Your Task

Analyze the provided entity and create semantic field groupings with appropriate icons for a collapsible section layout.

## Entity Information

### Entity Name
{{ entityName }}

{% if entityDescription %}
### Description
{{ entityDescription }}
{% endif %}

### Fields
{% for field in fields %}
- **{{ field.Name }}** ({{ field.Type }}){% if field.IsNullable %} - Nullable{% endif %}
  {% if field.Description %}
  {{ field.Description }}
  {% endif %}
  {% if field.IsPrimaryKey %}
  **Primary Key**
  {% endif %}
  {% if field.IsForeignKey %}
  **Foreign Key** → {{ field.RelatedEntity }}
  {% endif %}
{% endfor %}

## Categorization Guidelines

### Create Logical Groupings

Group fields into categories that make semantic sense:

1. **Basic/Core Information** - Primary identifying fields users always need
   - Icon: `user`, `file-text`, `box`, `tag`
   - Examples: Name, Title, Code, Status
   - Default: Expanded

2. **Contact/Communication** - Communication channels and addresses
   - Icon: `envelope`, `phone`, `map-marker`
   - Examples: Email, Phone, Address, Website
   - Default: Expanded if entity is person/organization

3. **Financial/Billing** - Money, payments, accounting
   - Icon: `credit-card`, `dollar-sign`, `receipt`
   - Examples: Price, Cost, PaymentMethod, BillingAddress
   - Default: Collapsed

4. **Dates/Timeline** - Time-related fields
   - Icon: `calendar`, `clock`, `history`
   - Examples: CreatedDate, ModifiedDate, DueDate, StartDate
   - Default: Collapsed

5. **Settings/Preferences** - Configuration and options
   - Icon: `sliders`, `cog`, `toggle-on`
   - Examples: Theme, Language, Timezone, Notifications
   - Default: Collapsed

6. **Relationships** - Foreign keys to other entities
   - Icon: `link`, `sitemap`, `arrows-alt`
   - Examples: CustomerID, CategoryID, AssignedTo
   - Default: Expanded if critical, otherwise collapsed

7. **Metadata/System** - Technical fields
   - Icon: `info-circle`, `database`, `code`
   - Examples: ID, __mj_CreatedAt, __mj_UpdatedAt, GUID
   - Default: Collapsed

### Icon Selection

Use semantic, recognizable icons from Font Awesome. Format: just the icon name without prefixes.

Good icons:
- `user`, `users` - People
- `building`, `home` - Places
- `envelope`, `phone` - Contact
- `credit-card`, `dollar-sign` - Financial
- `calendar`, `clock` - Time
- `cog`, `sliders` - Settings
- `info-circle`, `database` - System
- `tag`, `tags` - Categories
- `file-text`, `file-alt` - Documents
- `box`, `cube` - Products/Items

### Priority Order

1 = Highest priority (appears first)
- Core identifying information
- Most frequently accessed fields

2-3 = Medium priority
- Important but not always needed
- Context-specific fields

4+ = Lower priority
- Technical fields
- Rarely modified fields
- System metadata

### Default Expansion

- **Expanded** - Categories users need immediately (core info)
- **Collapsed** - Secondary information or rarely accessed fields

## Output Format

Return a JSON object with this exact structure:

```json
{
  "categories": [
    {
      "name": "Basic Information",
      "icon": "user",
      "priority": 1,
      "defaultExpanded": true,
      "fields": ["CustomerName", "Email", "Phone"],
      "reason": "Core identifying fields users need immediately"
    }
  ]
}
```

### Constraints

- Each field must appear in exactly ONE category
- ALL fields must be assigned to a category
- Field names must exactly match the provided field list
- Create 2-6 categories (not too many, not too few)
- Icon must be a valid Font Awesome icon name (without `fa-` prefix)
- Priority must be 1-10 (lower number = higher priority)

## Important Rules

- You **must** return ONLY the JSON object, no other text before or after
- Every field in the input must appear in exactly one category
- Use clear, user-friendly category names (not technical jargon)
- Consider the business context from entity and field names
- Keep related fields together

## Example

For entity "Customers" with fields: ID, CustomerName, Email, Phone, BillingAddress, PaymentMethodID, PreferredLanguage, NewsletterOptIn, __mj_CreatedAt, __mj_UpdatedAt

```json
{
  "categories": [
    {
      "name": "Basic Information",
      "icon": "user",
      "priority": 1,
      "defaultExpanded": true,
      "fields": ["CustomerName", "Email", "Phone"],
      "reason": "Core customer identification fields accessed most frequently"
    },
    {
      "name": "Billing Details",
      "icon": "credit-card",
      "priority": 2,
      "defaultExpanded": false,
      "fields": ["BillingAddress", "PaymentMethodID"],
      "reason": "Financial information needed for transactions but not constantly viewed"
    },
    {
      "name": "Preferences",
      "icon": "sliders",
      "priority": 3,
      "defaultExpanded": false,
      "fields": ["PreferredLanguage", "NewsletterOptIn"],
      "reason": "User preferences and settings that are configured occasionally"
    },
    {
      "name": "System Information",
      "icon": "info-circle",
      "priority": 4,
      "defaultExpanded": false,
      "fields": ["ID", "__mj_CreatedAt", "__mj_UpdatedAt"],
      "reason": "Technical metadata primarily for administrators and debugging"
    }
  ]
}
```
```

---

## Implementation Details

### Updated AdvancedGeneration Class

**File:** `/packages/CodeGenLib/src/Misc/advanced_generation.ts`

```typescript
import { BaseLLM, GetAIAPIKey } from "@memberjunction/ai";
import { AdvancedGenerationFeature, configInfo } from "../Config/config";
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { AIPromptRunner, AIPromptParams, AIPromptRunResult } from "@memberjunction/ai-prompts";
import { AIPromptEntityExtended } from "@memberjunction/core-entities";

export type EntityNameResult = { entityName: string, tableName: string }
export type EntityDescriptionResult = { entityDescription: string, tableName: string }
export type SmartFieldIdentificationResult = {
    nameField: string;
    nameFieldReason: string;
    defaultInView: string;
    defaultInViewReason: string;
    confidence: 'high' | 'medium' | 'low';
}
export type TransitiveJoinResult = {
    isJunctionTable: boolean;
    reason: string;
    additionalFields: Array<{
        fieldName: string;
        fieldType: 'virtual' | 'existing';
        includeInView: boolean;
        displayFields?: string[];
        reason: string;
    }>;
    confidence: 'high' | 'medium' | 'low';
}
export type FormLayoutResult = {
    categories: Array<{
        name: string;
        icon: string;
        priority: number;
        defaultExpanded: boolean;
        fields: string[];
        reason: string;
    }>;
}

/**
 * Enhanced Advanced Generation system using MJ's AI Prompts architecture
 */
export class AdvancedGeneration {
    private _metadata: Metadata;
    private _promptRunner: AIPromptRunner;
    private _promptCache: Map<string, AIPromptEntityExtended> = new Map();

    constructor() {
        this._metadata = new Metadata();
        this._promptRunner = new AIPromptRunner();
    }

    public get enabled(): boolean {
        return configInfo.advancedGeneration?.enableAdvancedGeneration ?? false;
    }

    public featureEnabled(featureName: string): boolean {
        return this.enabled && this.getFeature(featureName)?.enabled === true;
    }

    public getFeature(featureName: string): AdvancedGenerationFeature | undefined {
        return configInfo.advancedGeneration?.features?.find(f => f.name === featureName);
    }

    /**
     * Load a prompt by name from metadata
     */
    private async getPrompt(promptName: string, contextUser: UserInfo): Promise<AIPromptEntityExtended> {
        if (this._promptCache.has(promptName)) {
            return this._promptCache.get(promptName)!;
        }

        const prompt = await this._metadata.GetEntityObject<AIPromptEntityExtended>(
            'AI Prompts',
            contextUser
        );

        const loaded = await prompt.Load(promptName, ['MJ: AI Prompt Models']);
        if (!loaded) {
            throw new Error(`Prompt '${promptName}' not found`);
        }

        this._promptCache.set(promptName, prompt);
        return prompt;
    }

    /**
     * Execute a prompt with proper error handling and timeout
     */
    private async executePromptWithTimeout<T>(
        params: AIPromptParams,
        timeoutMs: number = 10000
    ): Promise<AIPromptRunResult<T>> {
        const timeoutPromise = new Promise<AIPromptRunResult<T>>((_, reject) => {
            setTimeout(() => reject(new Error('Prompt execution timeout')), timeoutMs);
        });

        try {
            const result = await Promise.race([
                this._promptRunner.ExecutePrompt<T>(params),
                timeoutPromise
            ]);
            return result;
        } catch (error) {
            LogError('AdvancedGeneration', `Prompt execution failed: ${error}`);
            throw error;
        }
    }

    /**
     * Smart Field Identification - determine name field and default in view
     */
    public async identifyFields(
        entity: any,
        contextUser: UserInfo
    ): Promise<SmartFieldIdentificationResult | null> {
        if (!this.featureEnabled('SmartFieldIdentification')) {
            return null;
        }

        try {
            const prompt = await this.getPrompt('CodeGen: Smart Field Identification', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                entityName: entity.Name,
                entityDescription: entity.Description,
                fields: entity.Fields.map((f: any) => ({
                    Name: f.Name,
                    Type: f.Type,
                    IsNullable: f.AllowsNull,
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsUnique: f.IsUnique,
                    Description: f.Description
                })),
                relationships: entity.RelatedEntities?.map((r: any) => ({
                    Name: r.Name,
                    RelatedEntity: r.RelatedEntity
                })) || []
            };
            params.contextUser = contextUser;

            const result = await this.executePromptWithTimeout<SmartFieldIdentificationResult>(
                params,
                10000 // 10 second timeout
            );

            if (result.success && result.result) {
                LogStatus(`Smart field identification for ${entity.Name}: ${result.result.nameField} (confidence: ${result.result.confidence})`);
                return result.result;
            } else {
                LogError('AdvancedGeneration', `Smart field identification failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in identifyFields: ${error}`);
            return null; // Graceful fallback
        }
    }

    /**
     * Transitive Join Intelligence - detect junction tables and recommend additional fields
     */
    public async analyzeTransitiveJoin(
        sourceEntity: any,
        targetEntity: any,
        contextUser: UserInfo
    ): Promise<TransitiveJoinResult | null> {
        if (!this.featureEnabled('TransitiveJoinIntelligence')) {
            return null;
        }

        try {
            const prompt = await this.getPrompt('CodeGen: Transitive Join Intelligence', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                sourceEntityName: sourceEntity.Name,
                targetEntityName: targetEntity.Name,
                targetEntityDescription: targetEntity.Description,
                targetFields: targetEntity.Fields.map((f: any) => ({
                    Name: f.Name,
                    Type: f.Type,
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsForeignKey: f.EntityIDFieldName != null,
                    Description: f.Description
                })),
                targetRelationships: targetEntity.RelatedEntities?.map((r: any) => ({
                    FieldName: r.FieldName,
                    RelatedEntity: r.RelatedEntity,
                    RelatedEntityNameField: r.RelatedEntityNameField
                })) || []
            };
            params.contextUser = contextUser;

            const result = await this.executePromptWithTimeout<TransitiveJoinResult>(
                params,
                10000
            );

            if (result.success && result.result) {
                LogStatus(`Transitive join analysis for ${sourceEntity.Name} → ${targetEntity.Name}: Junction=${result.result.isJunctionTable}`);
                return result.result;
            } else {
                LogError('AdvancedGeneration', `Transitive join analysis failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in analyzeTransitiveJoin: ${error}`);
            return null;
        }
    }

    /**
     * Form Layout Generation - create semantic field categories with icons
     */
    public async generateFormLayout(
        entity: any,
        contextUser: UserInfo
    ): Promise<FormLayoutResult | null> {
        if (!this.featureEnabled('FormLayoutGeneration')) {
            return null;
        }

        try {
            const prompt = await this.getPrompt('CodeGen: Form Layout Generation', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                entityName: entity.Name,
                entityDescription: entity.Description,
                fields: entity.Fields.map((f: any) => ({
                    Name: f.Name,
                    Type: f.Type,
                    IsNullable: f.AllowsNull,
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsForeignKey: f.EntityIDFieldName != null,
                    RelatedEntity: f.RelatedEntityName,
                    Description: f.Description
                }))
            };
            params.contextUser = contextUser;

            const result = await this.executePromptWithTimeout<FormLayoutResult>(
                params,
                15000 // 15 seconds - more complex task
            );

            if (result.success && result.result) {
                LogStatus(`Form layout generated for ${entity.Name}: ${result.result.categories.length} categories`);
                return result.result;
            } else {
                LogError('AdvancedGeneration', `Form layout generation failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in generateFormLayout: ${error}`);
            return null;
        }
    }
}
```

### Integration into ManageMetadata

**File:** `/packages/CodeGenLib/src/Database/manage-metadata.ts`

Add imports:
```typescript
import { AdvancedGeneration } from "../Misc/advanced_generation";
```

Update `manageEntityFields` method:

```typescript
protected async manageEntityFields(
    pool: sql.ConnectionPool,
    entity: EntityInfo,
    currentUser: any
): Promise<void> {
    // ... existing field management code ...

    // After fields are created/updated, run advanced generation
    const ag = new AdvancedGeneration();
    if (ag.enabled) {
        try {
            // Smart Field Identification
            const fieldAnalysis = await ag.identifyFields(entity, currentUser);
            if (fieldAnalysis) {
                await this.applyFieldIdentification(entity, fieldAnalysis, pool);
            }

            // Form Layout Generation
            const layoutAnalysis = await ag.generateFormLayout(entity, currentUser);
            if (layoutAnalysis) {
                await this.applyFormLayout(entity, layoutAnalysis, pool);
            }
        } catch (error) {
            // Non-fatal - log and continue
            LogError('ManageMetadata', `Advanced generation failed for ${entity.Name}: ${error}`);
        }
    }
}

/**
 * Apply smart field identification results to entity metadata
 */
private async applyFieldIdentification(
    entity: EntityInfo,
    analysis: SmartFieldIdentificationResult,
    pool: sql.ConnectionPool
): Promise<void> {
    // Update NameField if not user-modified
    const nameFieldResult = await pool.request().query(`
        SELECT _IsNameField_UserModified
        FROM [${mj_core_schema()}].EntityField
        WHERE EntityID = '${entity.ID}' AND Name = '${analysis.nameField}'
    `);

    if (nameFieldResult.recordset.length > 0 &&
        !nameFieldResult.recordset[0]._IsNameField_UserModified) {

        // Clear other name fields first
        await pool.request().query(`
            UPDATE [${mj_core_schema()}].EntityField
            SET IsNameField = 0
            WHERE EntityID = '${entity.ID}' AND IsNameField = 1
        `);

        // Set new name field
        await pool.request().query(`
            UPDATE [${mj_core_schema()}].EntityField
            SET IsNameField = 1
            WHERE EntityID = '${entity.ID}' AND Name = '${analysis.nameField}'
        `);

        LogStatus(`Set name field for ${entity.Name}: ${analysis.nameField} (${analysis.nameFieldReason})`);
    }

    // Similar logic for DefaultInView...
}

/**
 * Apply form layout analysis to create categories
 */
private async applyFormLayout(
    entity: EntityInfo,
    layout: FormLayoutResult,
    pool: sql.ConnectionPool
): Promise<void> {
    // Create EntityFieldCategory records
    for (const category of layout.categories) {
        // Check if category already exists
        const existingCategory = await pool.request().query(`
            SELECT ID
            FROM [${mj_core_schema()}].EntityFieldCategory
            WHERE EntityID = '${entity.ID}' AND Name = '${category.name}'
        `);

        let categoryId: string;

        if (existingCategory.recordset.length > 0) {
            categoryId = existingCategory.recordset[0].ID;

            // Update existing category
            await pool.request().query(`
                UPDATE [${mj_core_schema()}].EntityFieldCategory
                SET Icon = '${category.icon}',
                    Priority = ${category.priority},
                    DefaultExpanded = ${category.defaultExpanded ? 1 : 0},
                    __mj_UpdatedAt = GETDATE()
                WHERE ID = '${categoryId}'
            `);
        } else {
            // Create new category
            categoryId = uuidv4();
            await pool.request().query(`
                INSERT INTO [${mj_core_schema()}].EntityFieldCategory
                (ID, EntityID, Name, Icon, Priority, DefaultExpanded)
                VALUES
                ('${categoryId}', '${entity.ID}', '${category.name}', '${category.icon}', ${category.priority}, ${category.defaultExpanded ? 1 : 0})
            `);
        }

        // Assign fields to category (only if not user-modified)
        for (const fieldName of category.fields) {
            await pool.request().query(`
                UPDATE [${mj_core_schema()}].EntityField
                SET CategoryID = '${categoryId}'
                WHERE EntityID = '${entity.ID}'
                  AND Name = '${fieldName}'
                  AND (_CategoryID_UserModified IS NULL OR _CategoryID_UserModified = 0)
            `);
        }
    }

    LogStatus(`Applied form layout for ${entity.Name}: ${layout.categories.length} categories created`);
}
```

Update `manageEntityRelationships` method:

```typescript
protected async manageEntityRelationships(
    pool: sql.ConnectionPool,
    entity: EntityInfo,
    currentUser: any
): Promise<void> {
    // ... existing relationship management code ...

    // After relationships are created, analyze for transitive joins
    const ag = new AdvancedGeneration();
    if (ag.enabled) {
        for (const relationship of entity.RelatedEntities) {
            const targetEntity = await this.getEntityByName(relationship.RelatedEntity, pool);

            const analysis = await ag.analyzeTransitiveJoin(entity, targetEntity, currentUser);
            if (analysis && analysis.isJunctionTable) {
                await this.applyTransitiveJoinAnalysis(relationship, analysis, pool);
            }
        }
    }
}

/**
 * Apply transitive join analysis to relationship metadata
 */
private async applyTransitiveJoinAnalysis(
    relationship: any,
    analysis: TransitiveJoinResult,
    pool: sql.ConnectionPool
): Promise<void> {
    // Store additional fields in JSON format
    const additionalFields = JSON.stringify(analysis.additionalFields);

    await pool.request().query(`
        UPDATE [${mj_core_schema()}].EntityRelationship
        SET AdditionalFieldsToInclude = '${additionalFields.replace(/'/g, "''")}'
        WHERE ID = '${relationship.ID}'
    `);

    LogStatus(`Applied transitive join analysis: ${analysis.additionalFields.length} additional fields for ${relationship.RelatedEntity}`);
}
```

---

## Database Schema Changes

### Migration File

**File:** `migrations/v2/V202511020001__v2.x_Advanced_Generation_Metadata.sql`

```sql
-- Add user modification tracking columns to EntityField
ALTER TABLE [${flyway:defaultSchema}].EntityField
ADD _IsNameField_UserModified BIT NOT NULL DEFAULT 0,
    _DefaultInView_UserModified BIT NOT NULL DEFAULT 0,
    _CategoryID_UserModified BIT NOT NULL DEFAULT 0;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks whether IsNameField was manually set by user (1) or by system/LLM (0)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = '_IsNameField_UserModified';

-- Create global FieldCategory table for reusable categories
CREATE TABLE [${flyway:defaultSchema}].FieldCategory (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) UNIQUE NOT NULL,
    Icon NVARCHAR(100) NULL,
    Description NVARCHAR(500) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
);

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Global dictionary of field categories that can be reused across entities (e.g., Basic Information, Billing Details)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'FieldCategory';

-- Create EntityFieldCategory for entity-specific category instances
CREATE TABLE [${flyway:defaultSchema}].EntityFieldCategory (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    CategoryID UNIQUEIDENTIFIER NULL, -- Optional link to global category
    Name NVARCHAR(100) NOT NULL,
    Icon NVARCHAR(100) NULL,
    Priority INT NOT NULL DEFAULT 100,
    DefaultExpanded BIT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_EntityFieldCategory_Entity
        FOREIGN KEY (EntityID) REFERENCES [${flyway:defaultSchema}].Entity(ID),
    CONSTRAINT FK_EntityFieldCategory_FieldCategory
        FOREIGN KEY (CategoryID) REFERENCES [${flyway:defaultSchema}].FieldCategory(ID)
);

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Entity-specific instances of field categories with display properties like icon and priority',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityFieldCategory';

-- Add CategoryID to EntityField
ALTER TABLE [${flyway:defaultSchema}].EntityField
ADD CategoryID UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_EntityField_EntityFieldCategory
        FOREIGN KEY (CategoryID) REFERENCES [${flyway:defaultSchema}].EntityFieldCategory(ID);

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links field to a category for form layout grouping',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'CategoryID';

-- Add transitive join metadata to EntityRelationship
ALTER TABLE [${flyway:defaultSchema}].EntityRelationship
ADD AdditionalFieldsToInclude NVARCHAR(MAX) NULL;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of additional field names to include when joining through this relationship (for junction tables)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityRelationship',
    @level2type = N'COLUMN', @level2name = 'AdditionalFieldsToInclude';

-- Insert common global categories
INSERT INTO [${flyway:defaultSchema}].FieldCategory (ID, Name, Icon, Description)
VALUES
    (NEWID(), 'Basic Information', 'user', 'Core identifying fields'),
    (NEWID(), 'Contact Information', 'envelope', 'Communication channels and addresses'),
    (NEWID(), 'Financial Information', 'credit-card', 'Money, payments, and billing'),
    (NEWID(), 'Dates and Timeline', 'calendar', 'Time-related fields'),
    (NEWID(), 'Settings and Preferences', 'sliders', 'Configuration and user preferences'),
    (NEWID(), 'Relationships', 'link', 'Foreign keys to other entities'),
    (NEWID(), 'System Metadata', 'info-circle', 'Technical fields and audit information');
```

---

## Configuration

### CodeGen Config Update

**File:** `/packages/CodeGenLib/src/Config/config.ts`

```typescript
export type AdvancedGeneration = z.infer<typeof advancedGenerationSchema>;
const advancedGenerationSchema = z.object({
  enableAdvancedGeneration: z.boolean().default(false),

  features: advancedGenerationFeatureSchema.array().default([
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
      name: 'SmartFieldIdentification',
      description: 'Intelligently identify name fields and default view fields using semantic analysis',
      enabled: false,
    },
    {
      name: 'TransitiveJoinIntelligence',
      description: 'Automatically determine additional fields to include for transitive relationships through junction tables',
      enabled: false,
    },
    {
      name: 'FormLayoutGeneration',
      description: 'Generate modern form layouts with collapsible sections and icons',
      enabled: false,
    }
  ]),

  // Settings
  allowReanalysis: z.boolean().default(false), // Re-run on existing entities
  timeout: z.number().default(10000), // 10 seconds per prompt
  fallbackToHeuristics: z.boolean().default(true), // Use heuristics if LLM fails
});
```

### Example mj.config.cjs

```javascript
module.exports = {
  // ... existing config ...

  advancedGeneration: {
    enableAdvancedGeneration: true,

    features: [
      {
        name: 'SmartFieldIdentification',
        enabled: true
      },
      {
        name: 'TransitiveJoinIntelligence',
        enabled: true
      },
      {
        name: 'FormLayoutGeneration',
        enabled: true
      }
    ],

    allowReanalysis: false, // Only run on new entities
    timeout: 15000, // 15 seconds
    fallbackToHeuristics: true
  }
};
```

---

## Testing Strategy

### Unit Tests

**File:** `/packages/CodeGenLib/src/__tests__/advanced-generation.test.ts`

```typescript
describe('AdvancedGeneration', () => {
  let ag: AdvancedGeneration;
  let mockContextUser: UserInfo;

  beforeEach(() => {
    ag = new AdvancedGeneration();
    mockContextUser = createMockUser();
  });

  describe('Smart Field Identification', () => {
    test('identifies name field correctly for standard entity', async () => {
      const entity = {
        Name: 'Products',
        Fields: [
          { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
          { Name: 'ProductSKU', Type: 'nvarchar(50)', IsUnique: true },
          { Name: 'ProductTitle', Type: 'nvarchar(200)' }
        ]
      };

      const result = await ag.identifyFields(entity, mockContextUser);

      expect(result).not.toBeNull();
      expect(result?.nameField).toBe('ProductTitle');
      expect(result?.defaultInView).toBe('ProductSKU');
      expect(result?.confidence).toBe('high');
    });

    test('handles timeout gracefully', async () => {
      // Mock slow LLM response
      jest.spyOn(ag as any, 'executePromptWithTimeout')
        .mockRejectedValue(new Error('Timeout'));

      const result = await ag.identifyFields(mockEntity, mockContextUser);

      expect(result).toBeNull(); // Graceful fallback
    });
  });

  describe('Transitive Join Intelligence', () => {
    test('detects junction table correctly', async () => {
      const sourceEntity = { Name: 'Tasks' };
      const targetEntity = {
        Name: 'UserRole',
        Fields: [
          { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
          { Name: 'UserID', Type: 'uniqueidentifier', EntityIDFieldName: 'UserID' },
          { Name: 'RoleID', Type: 'uniqueidentifier', EntityIDFieldName: 'RoleID' }
        ],
        RelatedEntities: [
          { FieldName: 'UserID', RelatedEntity: 'Users' },
          { FieldName: 'RoleID', RelatedEntity: 'Roles' }
        ]
      };

      const result = await ag.analyzeTransitiveJoin(
        sourceEntity,
        targetEntity,
        mockContextUser
      );

      expect(result?.isJunctionTable).toBe(true);
      expect(result?.additionalFields.length).toBeGreaterThan(0);
    });
  });
});
```

### Integration Tests with Real LLMs

**File:** `/packages/CodeGenLib/src/__tests__/integration/llm-prompts.test.ts`

```typescript
describe('Advanced Generation Prompts (Integration)', () => {
  // These tests require actual LLM API keys
  // Only run in CI/CD with proper environment variables

  const runner = new AIPromptRunner();

  test('Smart Field Identification prompt produces valid JSON', async () => {
    const prompt = await loadPrompt('CodeGen: Smart Field Identification');
    const params = new AIPromptParams();
    params.prompt = prompt;
    params.data = {
      entityName: 'Customers',
      fields: [
        { Name: 'ID', Type: 'uniqueidentifier' },
        { Name: 'CustomerName', Type: 'nvarchar(200)' },
        { Name: 'Email', Type: 'nvarchar(100)' }
      ]
    };

    const result = await runner.ExecutePrompt(params);

    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty('nameField');
    expect(result.result).toHaveProperty('defaultInView');
    expect(result.result).toHaveProperty('confidence');
  });

  // Snapshot testing for prompt stability
  test('Smart Field Identification prompt matches snapshot', () => {
    const template = fs.readFileSync(
      'metadata/prompts/templates/codegen/smart-field-identification.template.md',
      'utf-8'
    );
    expect(template).toMatchSnapshot();
  });
});
```

### Manual Testing Checklist

- [ ] Create new entity with non-standard name field (e.g., `ProductSKU`)
- [ ] Verify LLM correctly identifies name field
- [ ] Manually set a name field in database, set `_IsNameField_UserModified = 1`
- [ ] Verify LLM does NOT overwrite user-modified field
- [ ] Create entity with junction table relationship (e.g., TaskAssignments)
- [ ] Verify transitive fields are identified
- [ ] Check generated Angular form has collapsible sections
- [ ] Verify icons display correctly
- [ ] Disable features, verify fallback to heuristics
- [ ] Test timeout scenario (mock slow LLM)
- [ ] Verify prompt execution tracking in `MJ: AI Prompt Runs`

---

## Timeline and Phases

### Phase 1: Infrastructure (Days 1-3)

**Goals:**
- Create prompt metadata files
- Create prompt templates
- Update AdvancedGeneration class
- Database migrations

**Deliverables:**
- 3 prompt JSON files in `/metadata/prompts`
- 3 prompt template files in `/metadata/prompts/templates/codegen`
- Updated `AdvancedGeneration.ts` with `AIPromptRunner` integration
- Migration SQL file

### Phase 2: Smart Field Identification (Days 4-5)

**Goals:**
- Integration into `manage-metadata.ts`
- User modification tracking
- Unit tests

**Deliverables:**
- Working smart field identification
- Tests passing
- Example configurations

### Phase 3: Transitive Join Intelligence (Days 6-7)

**Goals:**
- Junction table detection
- Additional field metadata storage
- SQL view generation updates (if needed)

**Deliverables:**
- Working transitive join analysis
- Tests for complex relationship scenarios

### Phase 4: Form Layout Generation (Days 8-10)

**Goals:**
- Category generation and storage
- Angular collapsible section component
- Angular generation updates

**Deliverables:**
- Category metadata in database
- Reusable Angular component
- Updated Angular generator

### Phase 5: Testing and Documentation (Days 11-12)

**Goals:**
- Integration tests with real LLMs
- Performance testing
- Documentation updates

**Deliverables:**
- Full test suite
- Developer guide
- Configuration examples

---

## Risk Mitigation

### Risk: LLM Hallucinations

**Mitigation:**
- JSON validation in `AIPromptRunner`
- Confidence scoring in responses
- User can review and modify results
- Track changes via `_UserModified` flags

### Risk: Performance Impact

**Mitigation:**
- 10-15 second timeout per prompt
- Graceful fallback to heuristics on failure
- Only run on new entities by default
- Skip if `advancedGeneration.enabled = false`

### Risk: API Costs

**Mitigation:**
- GPT-OSS-120B via Groq/Cerebras is cheap ($0.13-0.30 per 1M tokens)
- Typical entity = ~1K tokens = $0.0001-0.0003 per entity
- 200 entities × 3 prompts = ~$0.20 per full CodeGen run
- Option to disable features individually

### Risk: Prompt Quality

**Mitigation:**
- Detailed prompt templates with examples
- Snapshot testing to detect regressions
- Integration tests with real LLMs in CI/CD
- Easy to update templates via metadata system

### Risk: Breaking Changes

**Mitigation:**
- All features opt-in via config
- Database columns allow NULL
- User modification tracking prevents overwrites
- Fallback to heuristics if LLM unavailable

---

## Success Metrics

### Quantitative Metrics

- **Accuracy**: % of name fields correctly identified (target: >85%)
- **Performance**: Additional time per entity with features enabled (target: <5 seconds)
- **API Cost**: Average cost per CodeGen run (target: <$0.50)
- **Adoption**: % of entities with LLM-generated categories after 3 months

### Qualitative Metrics

- **Developer Feedback**: Survey on usefulness of smart field identification
- **User Satisfaction**: Feedback on generated form layouts
- **Time Savings**: Reduced manual metadata configuration time

---

## Conclusion

This updated plan uses MemberJunction's established AI Prompts architecture for a clean, maintainable implementation. The approach is:

✅ **Architecture-compliant** - Uses `AIPromptRunner`, metadata-driven prompts
✅ **Simple** - No complex plugin system, direct integration
✅ **Cost-effective** - GPT-OSS-120B via Groq/Cerebras
✅ **Backwards Compatible** - Opt-in, graceful fallbacks
✅ **Testable** - Unit tests, integration tests, snapshot tests
✅ **Safe** - User modification tracking, timeouts, error handling

---

## Appendix: File Locations

**Prompts:**
- `/metadata/prompts/.codegen-smart-field-identification.json`
- `/metadata/prompts/.codegen-transitive-join-intelligence.json`
- `/metadata/prompts/.codegen-form-layout-generation.json`

**Templates:**
- `/metadata/prompts/templates/codegen/smart-field-identification.template.md`
- `/metadata/prompts/templates/codegen/transitive-join-intelligence.template.md`
- `/metadata/prompts/templates/codegen/form-layout-generation.template.md`

**Code:**
- `/packages/CodeGenLib/src/Misc/advanced_generation.ts`
- `/packages/CodeGenLib/src/Database/manage-metadata.ts`
- `/packages/CodeGenLib/src/Config/config.ts`

**Migrations:**
- `/migrations/v2/V202511020001__v2.x_Advanced_Generation_Metadata.sql`

---

**Next Steps:**
1. Review plan
2. Implement Phase 1 (infrastructure)
3. Test with real prompts
4. Iterate based on results
