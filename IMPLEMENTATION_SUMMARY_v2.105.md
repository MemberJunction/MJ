# Implementation Summary: v2.105 Artifact Extract Rules and Agent Artifact Types

## Overview

This implementation adds comprehensive support for artifact attribute extraction and agent-artifact type associations. The system enables artifact types to declaratively define how to extract attributes from artifact content with hierarchical inheritance, and allows agents to specify which artifact types they can produce.

## Schema Changes (Migration v2.105)

### 1. ArtifactType Table Enhancements

**Added Columns:**
- `ParentID` (UNIQUEIDENTIFIER NULL) - Recursive foreign key for hierarchical artifact types
- `ExtractRules` (NVARCHAR(MAX) NULL) - JSON array of extraction rules

**Purpose:**
- Enable artifact type hierarchies (e.g., "JSON Document" → "Email JSON" → "Marketing Email JSON")
- Store declarative extraction logic without requiring code changes
- Support rule inheritance with override capability

**ExtractRules JSON Structure:**
```json
[
  {
    "name": "subject",
    "description": "Email subject line",
    "type": "string",
    "standardProperty": "name",
    "extractor": "const parsed = JSON.parse(content); return parsed.subject;"
  },
  {
    "name": "body",
    "description": "Email body content",
    "type": "string",
    "standardProperty": "displayMarkdown",
    "extractor": "const parsed = JSON.parse(content); return parsed.body;"
  }
]
```

### 2. AgentArtifactType Junction Table (NEW)

**Columns:**
- `ID` (UNIQUEIDENTIFIER) - Primary key
- `AgentID` (UNIQUEIDENTIFIER) - FK to AIAgent
- `ArtifactTypeID` (UNIQUEIDENTIFIER) - FK to ArtifactType
- `Sequence` (INT NULL) - For ordering multiple artifact types

**Purpose:**
- Associate agents with the artifact types they can produce (0-to-many relationship)
- Enable UI to know what format to expect from an agent
- Support agents that can produce multiple artifact types

**Constraints:**
- Unique constraint on (AgentID, ArtifactTypeID) to prevent duplicates

### 3. ArtifactVersion Table Enhancements

**Added Columns:**
- `Name` (NVARCHAR(255) NULL) - Version-specific name
- `Description` (NVARCHAR(MAX) NULL) - Version-specific description

**Purpose:**
- Allow names and descriptions to evolve across versions
- Previous design had these only at the Artifact level, limiting versioning flexibility

### 4. ArtifactVersionAttribute Table (NEW)

**Columns:**
- `ID` (UNIQUEIDENTIFIER) - Primary key
- `ArtifactVersionID` (UNIQUEIDENTIFIER) - FK to ArtifactVersion
- `Name` (NVARCHAR(255)) - Attribute name (from extract rule)
- `Type` (NVARCHAR(500)) - TypeScript type definition
- `Value` (NVARCHAR(MAX)) - JSON-serialized extracted value
- `StandardProperty` (NVARCHAR(50) NULL) - Maps to 'name' | 'description' | 'displayMarkdown' | 'displayHtml'

**Purpose:**
- Persist extracted attribute values to avoid re-running extraction on every access
- Cache results of extraction rules for performance
- Enable querying artifacts by extracted attributes

**Constraints:**
- Unique constraint on (ArtifactVersionID, Name) to prevent duplicate attributes
- Check constraint on StandardProperty to validate enum values

## TypeScript Implementation

### 1. ExecuteAgentResult Type Enhancement

**Location:** `packages/AI/CorePlus/src/agent-types.ts`

**Changes:**
```typescript
export type ExecuteAgentResult<P = any> = {
    success: boolean;
    payload?: P;
    agentRun: AIAgentRunEntityExtended;

    // NEW: Artifact type identification
    payloadArtifactTypeID?: string;
}
```

**Purpose:**
- Enable agents to specify what artifact type their payload represents
- UI can use this to determine how to render and which extract rules to apply
- Falls back to agent's default artifact type if not specified

### 2. Extract Rule Type Definitions

**Location:** `packages/AI/CorePlus/src/artifact-extract-rules.ts`

**Key Types:**

#### ArtifactExtractRule
```typescript
interface ArtifactExtractRule {
    name: string;                          // Unique identifier
    description: string;                   // Human-readable description
    type: string;                          // TypeScript type (e.g., 'string', 'Array<{x: number}>')
    standardProperty?: ArtifactStandardProperty;  // Optional standard mapping
    extractor: string;                     // JavaScript extraction code
}
```

#### ExtractedArtifactAttribute
```typescript
interface ExtractedArtifactAttribute {
    name: string;
    type: string;
    value: any;
    standardProperty?: ArtifactStandardProperty;
}
```

#### ArtifactExtractionConfig & Result
```typescript
interface ArtifactExtractionConfig {
    content: string;
    extractRules: ArtifactExtractRule[];
    throwOnError?: boolean;
    timeout?: number;
    verbose?: boolean;
}

interface ArtifactExtractionResult {
    success: boolean;
    attributes: ExtractedArtifactAttribute[];
    errors: Array<{ ruleName: string; error: string }>;
    executionTimeMs: number;
}
```

### 3. ArtifactExtractor Utility Class

**Location:** `packages/AI/CorePlus/src/artifact-extractor.ts`

**Key Methods:**

#### resolveExtractRules()
```typescript
static resolveExtractRules(
    artifactTypeChain: Array<{ ExtractRules?: string | null }>
): ArtifactExtractRule[]
```
- Resolves extract rules with hierarchical inheritance
- Child rules override parent rules by name
- Processes from root parent to child for natural override behavior

#### extractAttributes()
```typescript
static async extractAttributes(
    config: ArtifactExtractionConfig
): Promise<ArtifactExtractionResult>
```
- Executes extractor functions against artifact content
- Provides timeout protection and error handling
- Returns both successful extractions and errors

#### serializeForStorage() / deserializeFromStorage()
```typescript
static serializeForStorage(attributes: ExtractedArtifactAttribute[]): Array<{...}>
static deserializeFromStorage(storedAttributes: Array<{...}>): ExtractedArtifactAttribute[]
```
- Converts between runtime and database representations
- Handles JSON serialization/deserialization

#### getStandardProperty()
```typescript
static getStandardProperty(
    attributes: ExtractedArtifactAttribute[],
    standardProperty: 'name' | 'description' | 'displayMarkdown' | 'displayHtml'
): any | null
```
- Convenience method for retrieving standard property values

## Usage Examples

### Example 1: Defining Extract Rules for an Artifact Type

```typescript
// In the ArtifactType record (stored as JSON in ExtractRules column)
const extractRules: ArtifactExtractRule[] = [
    {
        name: 'emailSubject',
        description: 'Subject line of the email',
        type: 'string',
        standardProperty: 'name',
        extractor: `
            const parsed = JSON.parse(content);
            return parsed.subject || 'Untitled Email';
        `
    },
    {
        name: 'recipientCount',
        description: 'Number of recipients',
        type: 'number',
        extractor: `
            const parsed = JSON.parse(content);
            return parsed.recipients ? parsed.recipients.length : 0;
        `
    },
    {
        name: 'bodyPreview',
        description: 'First 200 characters of email body',
        type: 'string',
        standardProperty: 'description',
        extractor: `
            const parsed = JSON.parse(content);
            const body = parsed.body || '';
            return body.substring(0, 200);
        `
    }
];

// Store in database
artifactType.ExtractRules = JSON.stringify(extractRules);
await artifactType.Save();
```

### Example 2: Extracting Attributes from Artifact Content

```typescript
import { ArtifactExtractor } from '@memberjunction/ai-core-plus';

// Load the artifact type hierarchy (child → parent)
const childType = await md.GetEntityObject<ArtifactTypeEntity>('Artifact Types', contextUser);
await childType.Load(artifactTypeId);

const parentType = childType.ParentID ?
    await md.GetEntityObject<ArtifactTypeEntity>('Artifact Types', contextUser) : null;
if (parentType) {
    await parentType.Load(childType.ParentID);
}

// Resolve inherited rules
const typeChain = [childType, parentType].filter(t => t != null);
const rules = ArtifactExtractor.ResolveExtractRules(typeChain);

// Extract attributes
const result = await ArtifactExtractor.ExtractAttributes({
    content: artifactVersion.Content,
    extractRules: rules,
    throwOnError: false,
    timeout: 5000,
    verbose: false
});

// Store extracted attributes
if (result.success) {
    const serialized = ArtifactExtractor.SerializeForStorage(result.attributes);
    for (const attr of serialized) {
        const versionAttr = await md.GetEntityObject<ArtifactVersionAttributeEntity>(
            'Artifact Version Attributes',
            contextUser
        );
        versionAttr.NewRecord();
        versionAttr.ArtifactVersionID = artifactVersion.ID;
        versionAttr.Name = attr.name;
        versionAttr.Type = attr.type;
        versionAttr.Value = attr.value;
        versionAttr.StandardProperty = attr.standardProperty;
        await versionAttr.Save();
    }
}
```

### Example 3: Agent Returning Artifact with Type

```typescript
// In BaseAgent.Execute() method
const result: ExecuteAgentResult = {
    success: true,
    payload: {
        subject: "Q3 Marketing Campaign",
        body: "Detailed campaign proposal...",
        recipients: ["marketing@example.com"],
        metadata: { ... }
    },
    agentRun: agentRunEntity,

    // Specify the artifact type for this payload
    payloadArtifactTypeID: 'C5E8F3A2-...'  // Marketing Email JSON type
};
```

### Example 4: UI Rendering Using Extracted Attributes

```typescript
// Load artifact version attributes
const rv = new RunView();
const attributesResult = await rv.RunView<ArtifactVersionAttributeEntity>({
    EntityName: 'Artifact Version Attributes',
    ExtraFilter: `ArtifactVersionID='${versionId}'`,
    ResultType: 'entity_object'
});

// Deserialize attributes
const attributes = ArtifactExtractor.DeserializeFromStorage(
    attributesResult.Results.map(r => ({
        Name: r.Name,
        Type: r.Type,
        Value: r.Value,
        StandardProperty: r.StandardProperty
    }))
);

// Get standard properties for UI
const displayName = ArtifactExtractor.GetStandardProperty(attributes, 'name');
const description = ArtifactExtractor.GetStandardProperty(attributes, 'description');
const markdown = ArtifactExtractor.GetStandardProperty(attributes, 'displayMarkdown');

// Render in UI
console.log(`Artifact: ${displayName}`);
console.log(`Description: ${description}`);
if (markdown) {
    renderMarkdown(markdown);
}
```

## Hierarchical Inheritance Example

```
Artifact Type Hierarchy:
    JSON Document (root)
      ExtractRules: [
        { name: "title", extractor: "..." },
        { name: "author", extractor: "..." }
      ]

      ├─ Email JSON (child)
      │    ExtractRules: [
      │      { name: "title", extractor: "..." },  // Overrides parent
      │      { name: "subject", extractor: "..." }  // New rule
      │    ]
      │
      ├─ Marketing Email JSON (grandchild)
           ExtractRules: [
             { name: "campaignName", extractor: "..." }  // New rule
           ]

Resolved Rules for "Marketing Email JSON":
    [
      { name: "title", ... },        // From Email JSON (overrode root)
      { name: "author", ... },       // From JSON Document (inherited)
      { name: "subject", ... },      // From Email JSON (inherited)
      { name: "campaignName", ... }  // From Marketing Email JSON (own)
    ]
```

## Database Migration File

**Location:** `/migrations/v2/V202510081612__v2.105.x__Artifact_Extract_Rules_and_Agent_Artifact_Types.sql`

**Sections:**
1. ArtifactType - Add ParentID and ExtractRules columns
2. Create AgentArtifactType junction table
3. ArtifactVersion - Add Name and Description columns
4. Create ArtifactVersionAttribute table
5. Extended property descriptions for all changes

## Next Steps (Not Implemented Yet)

1. **Run CodeGen** - After fixing the compilation error in MJCodeGenAPI, run CodeGen to generate:
   - Entity classes for AgentArtifactType
   - Entity classes for ArtifactVersionAttribute
   - Updated entity classes for ArtifactType (ParentID, ExtractRules)
   - Updated entity classes for ArtifactVersion (Name, Description)

2. **UI Components** - Create Angular components for:
   - Extract rule editor (JSON editor with validation)
   - Artifact type hierarchy viewer
   - Extracted attribute display
   - Agent artifact type association management

3. **API Endpoints** - Add endpoints for:
   - Extracting attributes on-demand
   - Resolving extract rule hierarchy
   - Testing extract rules against sample content

4. **Performance** - Add optimizations for:
   - Caching resolved extract rules
   - Batch extraction for multiple artifacts
   - Lazy loading of artifact version attributes

5. **Validation** - Add validation for:
   - Extract rule JavaScript syntax
   - TypeScript type definitions in rules
   - StandardProperty enum values

## Benefits

1. **Declarative Configuration** - Extract logic defined in database, no code changes required
2. **Type Safety** - TypeScript type definitions ensure extracted values match expected types
3. **Performance** - Cached attributes avoid re-running extraction logic
4. **Flexibility** - Hierarchical inheritance allows shared and specialized rules
5. **Interoperability** - Standard properties enable consistent UI rendering across artifact types
6. **Agent Awareness** - Agents can declare their output types, improving integration

## Files Modified

### Database
- `/migrations/v2/V202510081612__v2.105.x__Artifact_Extract_Rules_and_Agent_Artifact_Types.sql`

### TypeScript
- `packages/AI/CorePlus/src/agent-types.ts` - Added payloadArtifactTypeID
- `packages/AI/CorePlus/src/artifact-extract-rules.ts` - Type definitions (NEW)
- `packages/AI/CorePlus/src/artifact-extractor.ts` - Utility class (NEW)
- `packages/AI/CorePlus/src/index.ts` - Export new modules

### Documentation
- This implementation summary

## Testing Recommendations

1. **Unit Tests** - Test ArtifactExtractor methods:
   - Rule resolution with various hierarchy depths
   - Extractor execution with timeouts and errors
   - Serialization/deserialization round-trips

2. **Integration Tests** - Test end-to-end flows:
   - Agent execution with payloadArtifactTypeID
   - Artifact creation with attribute extraction
   - Rule inheritance across multiple levels

3. **Performance Tests** - Benchmark:
   - Extraction time for complex rules
   - Storage/retrieval of large attribute sets
   - Rule resolution for deep hierarchies

## Compatibility Notes

- All new fields are nullable or have defaults - fully backward compatible
- Existing agents work without modification
- Existing artifact types work without extract rules
- New functionality is opt-in via configuration
