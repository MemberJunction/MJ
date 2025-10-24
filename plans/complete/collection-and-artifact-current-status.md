# Collection and Artifact System - Current Status Documentation

**Date:** 2025-10-16
**Author:** Claude Code
**Purpose:** Comprehensive documentation of the current state of Collections and Artifacts in MemberJunction

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Collection System](#collection-system)
3. [Artifact System](#artifact-system)
4. [Database Schema](#database-schema)
5. [Entity Classes](#entity-classes)
6. [UI Components](#ui-components)
7. [Integration Points](#integration-points)
8. [Current Capabilities](#current-capabilities)
9. [Gaps and Potential Enhancements](#gaps-and-potential-enhancements)

---

## Executive Summary

MemberJunction provides a comprehensive artifact and collection management system with the following key features:

- **Dual Artifact Storage Models**: Global artifacts (reusable across conversations) and conversation-scoped artifacts
- **Version Control**: Built-in versioning for all artifacts with SHA-256 content hashing
- **Hierarchical Collections**: Organize artifacts into nested collections with drag-and-drop support
- **Plugin-Based Viewing**: Type-specific viewers for Code, Markdown, HTML, JSON, SVG, and React Components
- **Automatic Extraction**: Parse structured data from artifact content using configurable rules
- **Access Control**: Granular permissions for conversation artifacts
- **AI Agent Integration**: Agents declare artifact types they can produce

**File Locations:**
- Collection UI: `/packages/Angular/Generic/conversations/src/lib/components/collection/`
- Artifact UI: `/packages/Angular/Generic/artifacts/src/lib/components/`
- Entity Classes: `/packages/MJCoreEntities/src/generated/entity_subclasses.ts`
- Database Migrations: `/migrations/v2/V202509271512__v2.103.x__Add_CollectionArtifact_Join_Table.sql` (and others)
- SQL Objects: `/SQL Scripts/generated/__mj/`

---

## Collection System

### Overview

Collections are hierarchical containers that organize artifacts into user-managed libraries. They support:
- Nested folder structure (via `ParentID` self-reference)
- Drag-and-drop reorganization
- Environment-scoped isolation
- Custom sequencing for display order

### Collection Entity Schema

**Table:** `Collection`
**Entity Name:** `MJ: Collections`
**View:** `vwCollections`

**Columns:**
| Column | Type | Description |
|--------|------|-------------|
| `ID` | uniqueidentifier | Primary key |
| `Name` | nvarchar(255) | Display name (required) |
| `Description` | nvarchar(MAX) | Optional description |
| `EnvironmentID` | uniqueidentifier | FK to Environment (scoped isolation) |
| `ParentID` | uniqueidentifier | FK to Collection (self-reference for hierarchy) |
| `Color` | nvarchar(50) | Optional custom color for UI |
| `Sequence` | int | Ordering within parent collection |
| `__mj_CreatedAt` | datetimeoffset | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | Last update timestamp |

**Indexes:**
- `IDX_AUTO_MJ_FKEY_Collection_EnvironmentID`
- `IDX_AUTO_MJ_FKEY_Collection_ParentID`

### Collection UI Components

#### 1. CollectionsFullViewComponent
**Path:** `collections-full-view.component.ts`

**Purpose:** Main collections interface with breadcrumb navigation

**Key Features:**
- Breadcrumb navigation for collection hierarchy
- Full-text search across collections and artifacts
- Grid layout with hover actions (edit, delete)
- Create/edit collection modal
- Artifact management (add, remove)
- Loading and empty states

**Data Loading:**
```typescript
// Parallel load collections and artifacts
async loadData() {
  const [collections, artifacts] = await Promise.all([
    this.loadCollections(),
    this.loadArtifacts()
  ]);
}
```

#### 2. CollectionTreeComponent
**Path:** `collection-tree.component.ts`

**Purpose:** Hierarchical sidebar navigation with drag-and-drop

**Key Features:**
- Recursive tree rendering
- Expand/collapse nodes
- Drag-and-drop to reorganize (updates `ParentID`)
- Quick actions (create sub-collection, delete)
- Visual feedback for drag operations

**Drag Validation:**
- Prevents dropping on self
- Prevents dropping on descendants (circular reference check)
- Validates hierarchy constraints

#### 3. CollectionViewComponent
**Path:** `collection-view.component.ts`

**Purpose:** Display and manage artifacts within a single collection

**Key Features:**
- Grid/List view toggle (persisted to localStorage)
- Sort options: Name, Date Modified, Type
- Artifact viewer overlay
- Add/remove artifacts
- Empty state with call-to-action

**Query Pattern:**
```typescript
// Load artifacts through junction table
RunView<ArtifactEntity>({
  EntityName: 'MJ: Artifacts',
  ExtraFilter: `ID IN (SELECT ArtifactID FROM [__mj].[MJ: Collection Artifacts]
                       WHERE CollectionID='${collectionId}')`
}, currentUser);
```

#### 4. CollectionArtifactCardComponent
**Path:** `collection-artifact-card.component.ts`

**Purpose:** Individual artifact display card

**Key Features:**
- Semantic icon based on artifact type
- Metadata display (name, type, description, timestamp)
- Hover actions (view, edit, remove)
- Event emission for parent handling

**Icon Mapping:**
```typescript
getIconClass(): string {
  if (type.includes('code')) return 'fa-code';
  if (type.includes('markdown')) return 'fa-file-lines';
  if (type.includes('html')) return 'fa-file-code';
  if (type.includes('json')) return 'fa-brackets-curly';
  if (type.includes('text')) return 'fa-file-alt';
  return 'fa-file';
}
```

#### 5. CollectionFormModalComponent
**Path:** `collection-form-modal.component.ts`

**Purpose:** Create and edit collection dialog

**Key Features:**
- Form validation (name required)
- Parent collection display (for sub-collections)
- Error messaging from server
- Kendo Dialog integration

### Collection-Artifact Relationship

**Junction Table:** `CollectionArtifact`
**Entity Name:** `MJ: Collection Artifacts`

**Schema:**
| Column | Type | Description |
|--------|------|-------------|
| `ID` | uniqueidentifier | Primary key |
| `CollectionID` | uniqueidentifier | FK to Collection |
| `ArtifactID` | uniqueidentifier | FK to Artifact |
| `Sequence` | int | Ordering within collection (default: 0) |
| `__mj_CreatedAt` | datetimeoffset | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | Update timestamp |

**Constraints:**
- `UQ_CollectionArtifact_Collection_Artifact` - Unique on (CollectionID, ArtifactID)

**Key Points:**
- Many-to-many relationship (artifact can be in multiple collections)
- Sequencing support for custom ordering
- Managed via `ArtifactStateService.addToCollection()` / `removeFromCollection()`

---

## Artifact System

### Overview

MemberJunction supports two parallel artifact storage models:

1. **Global Artifacts** (`Artifact` table): Reusable across conversations, organized in collections
2. **Conversation Artifacts** (`ConversationArtifact` table): Scoped to specific conversations with sharing controls

Both models support:
- Version control
- Type-based rendering
- Automatic attribute extraction
- Permission management

### Artifact Types Supported

| Type | Plugin | Display Format | Features |
|------|--------|----------------|----------|
| JSON | JsonArtifactViewerPlugin | Raw JSON OR extracted markdown/HTML | Extract rules, syntax highlighting |
| Code | CodeArtifactViewerPlugin | Monaco editor | Language detection (Python, C#, Java, TypeScript, SQL, etc.) |
| Markdown | MarkdownArtifactViewerPlugin | Preview or source editor | Syntax highlighting, rendered preview |
| HTML | HtmlArtifactViewerPlugin | Sanitized rendering | XSS protection, preview/source toggle |
| SVG | SvgArtifactViewerPlugin | Centered rendering | Responsive, preview/source toggle |
| Component | ComponentArtifactViewerPlugin | Interactive React UI | Live rendering, error boundaries |

### Plugin Architecture

**Base Class:** `BaseArtifactViewerPluginComponent`
**Registration Pattern:**
```typescript
@RegisterClass(BaseArtifactViewerPluginComponent, 'JsonArtifactViewerPlugin')
export class JsonArtifactViewerComponent extends BaseArtifactViewerPluginComponent {
  // Plugin implementation
}
```

**Dynamic Loading:**
```typescript
// MJGlobal ClassFactory instantiates correct plugin based on ArtifactType.DriverClass
const plugin = MJGlobal.Instance.ClassFactory.CreateInstance(
  BaseArtifactViewerPluginComponent,
  driverClass
);
```

**Hierarchical Resolution:**
- Checks artifact type's `DriverClass`
- If not found, traverses parent hierarchy (via `ParentID`)
- Falls back to JSON viewer if content is valid JSON

### Artifact Versioning

**Version Management:**
- Sequential version numbers (1, 2, 3, ...)
- Unique constraint: `(ArtifactID, VersionNumber)`
- Content stored per version
- SHA-256 content hashing for duplicate detection

**Version History Component Features:**
- Timeline view (DESC by version number)
- Version comparison (diff summary)
- Restore older versions (creates new version with restored content)
- Download specific versions

**Display Name Resolution Priority:**
1. `ArtifactVersion.Name` (version-specific)
2. `Artifact.Name` (artifact-level)
3. Default: 'Artifact'

### Artifact Extraction System

**Purpose:** Automatically extract structured attributes from artifact content

**Extract Rules Configuration:**
Stored in `ArtifactType.ExtractRules` as JSON array:

```json
[
  {
    "name": "title",
    "description": "Main title of the document",
    "type": "string",
    "standardProperty": "name",
    "extractor": "const match = content.match(/^#\\s+(.+)$/m); return match ? match[1] : null;"
  },
  {
    "name": "displayMarkdown",
    "description": "Rendered markdown content",
    "type": "string",
    "standardProperty": "displayMarkdown",
    "extractor": "return content;"
  }
]
```

**Extraction Flow:**
1. `ArtifactVersionExtended.Save()` is called
2. Walks up type hierarchy to resolve all extract rules
3. Executes JavaScript extractors with timeout (5 seconds)
4. Creates `ArtifactVersionAttribute` records for each extracted value
5. Standard properties map to UI display (`displayMarkdown`, `displayHtml`, `name`, `description`)

**Standard Properties:**
- `name` - Artifact display name override
- `description` - Artifact description override
- `displayMarkdown` - Markdown content to render in Display tab
- `displayHtml` - HTML content to render in Display tab

### Access Control & Permissions

**Conversation Artifact Sharing:**

**SharingScope Values:**
- `None` - Only owner can view
- `SpecificUsers` - Visible to users with explicit permissions
- `Everyone` - All conversation participants
- `Public` - System-wide public access

**ConversationArtifactPermission Levels:**
- `Owner` - Full control (create, read, update, delete)
- `Edit` - Can modify and create new versions
- `Read` - View-only access

**Constraint:** One unique permission per user per artifact

### AI Agent Integration

**Agent Capabilities:**

Agents declare artifact types they can produce via:
1. `AIAgent.DefaultArtifactTypeID` - Primary artifact type
2. `AIAgentArtifactType` junction table - Additional types

**Use Cases:**
- Agent filters available based on desired artifact type
- UI shows which agents can produce which artifacts
- Artifact creation workflows suggest compatible agents

---

## Database Schema

### Core Artifact Tables

#### 1. Artifact (Global Artifacts)
**Entity:** `MJ: Artifacts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `EnvironmentID` | uniqueidentifier | FK (Environment) | Environment scope |
| `Name` | nvarchar(255) | NOT NULL | Display name |
| `Description` | nvarchar(MAX) | NULL | Extended description |
| `TypeID` | uniqueidentifier | FK (ArtifactType), NOT NULL | Artifact type reference |
| `Comments` | nvarchar(MAX) | NULL | User comments |
| `UserID` | uniqueidentifier | FK (User), NOT NULL | Creator/owner |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**Relationships:**
- `EnvironmentID` → `Environment.ID`
- `TypeID` → `ArtifactType.ID`
- `UserID` → `User.ID`

---

#### 2. ArtifactType
**Entity:** `MJ: Artifact Types`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `Name` | nvarchar(100) | NOT NULL, UNIQUE | Type name |
| `Description` | nvarchar(MAX) | NULL | Type description |
| `ContentType` | nvarchar(100) | NOT NULL | MIME type (e.g., "text/markdown") |
| `IsEnabled` | bit | DEFAULT 1 | Availability flag |
| `ParentID` | uniqueidentifier | FK (ArtifactType) | Parent type for hierarchy |
| `ExtractRules` | nvarchar(MAX) | NULL | JSON array of extraction rules |
| `DriverClass` | nvarchar(255) | NULL | UI viewer plugin class name |

**Hierarchy Example:**
```
Code (Parent)
├── Python (DriverClass: CodeArtifactViewerPlugin)
├── JavaScript (DriverClass: CodeArtifactViewerPlugin)
└── TypeScript (DriverClass: CodeArtifactViewerPlugin)
```

---

#### 3. ArtifactVersion (Version History)
**Entity:** `MJ: Artifact Versions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `ArtifactID` | uniqueidentifier | FK (Artifact), NOT NULL | Parent artifact |
| `VersionNumber` | int | NOT NULL | Sequential version |
| `Name` | nvarchar(255) | NULL | Version-specific name |
| `Description` | nvarchar(MAX) | NULL | Version-specific description |
| `Content` | nvarchar(MAX) | NULL | Full artifact content |
| `Configuration` | nvarchar(MAX) | NULL | JSON metadata |
| `Comments` | nvarchar(MAX) | NULL | Version comments |
| `UserID` | uniqueidentifier | FK (User), NOT NULL | Version creator |
| `ContentHash` | nvarchar(500) | NULL | SHA-256 hash of content |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**Unique Constraint:** `(ArtifactID, VersionNumber)`

**Extended Functionality:**
- Automatic `ContentHash` calculation on save
- Automatic attribute extraction via `ExtractAndSaveAttributes()`
- Creates `ArtifactVersionAttribute` records

---

#### 4. ArtifactVersionAttribute (Extracted Attributes)
**Entity:** `MJ: Artifact Version Attributes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `ArtifactVersionID` | uniqueidentifier | FK (ArtifactVersion), NOT NULL | Version reference |
| `Name` | nvarchar(255) | NOT NULL | Attribute name |
| `Type` | nvarchar(500) | NOT NULL | TypeScript type definition |
| `Value` | nvarchar(MAX) | NULL | JSON-serialized value |
| `StandardProperty` | nvarchar(50) | NULL | Maps to standard properties |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**Unique Constraint:** `(ArtifactVersionID, Name)`

**Standard Property Values:**
- `name`
- `description`
- `displayMarkdown`
- `displayHtml`
- `NULL` (for custom attributes)

---

#### 5. ConversationArtifact
**Entity:** `MJ: Conversation Artifacts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `Name` | nvarchar(255) | NOT NULL | Display name |
| `Description` | nvarchar(MAX) | NULL | Description |
| `ConversationID` | uniqueidentifier | FK (Conversation), NOT NULL | Conversation reference |
| `ArtifactTypeID` | uniqueidentifier | FK (ArtifactType), NOT NULL | Type reference |
| `SharingScope` | nvarchar(50) | NOT NULL | Access control level |
| `Comments` | nvarchar(MAX) | NULL | User comments |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**SharingScope Check Constraint:** `IN ('None', 'SpecificUsers', 'Everyone', 'Public')`

---

#### 6. ConversationArtifactVersion
**Entity:** `MJ: Conversation Artifact Versions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `ConversationArtifactID` | uniqueidentifier | FK (ConversationArtifact), NOT NULL | Parent artifact |
| `Version` | int | NOT NULL, > 0 | Sequential version |
| `Configuration` | nvarchar(MAX) | NOT NULL | JSON configuration |
| `Content` | nvarchar(MAX) | NULL | Artifact content |
| `Comments` | nvarchar(MAX) | NULL | Version comments |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**Unique Constraint:** `(ConversationArtifactID, Version)`
**Check Constraint:** `Version > 0`

---

#### 7. ConversationArtifactPermission
**Entity:** `MJ: Conversation Artifact Permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `ConversationArtifactID` | uniqueidentifier | FK (ConversationArtifact), NOT NULL | Artifact reference |
| `UserID` | uniqueidentifier | FK (User), NOT NULL | Target user |
| `AccessLevel` | nvarchar(20) | NOT NULL | Permission level |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**Unique Constraint:** `(ConversationArtifactID, UserID)`
**AccessLevel Check Constraint:** `IN ('Read', 'Edit', 'Owner')`

---

#### 8. ConversationDetailArtifact (Message-Level Linking)
**Entity:** `MJ: Conversation Detail Artifacts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `ConversationDetailID` | uniqueidentifier | FK (ConversationDetail), NOT NULL | Message reference |
| `ArtifactVersionID` | uniqueidentifier | FK (ArtifactVersion), NOT NULL | Version reference |
| `Direction` | nvarchar(20) | DEFAULT 'Output' | Artifact flow direction |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**Direction Values:** `'Input' | 'Output'`

---

#### 9. CollectionArtifact (Collection-Artifact Junction)
**Entity:** `MJ: Collection Artifacts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `CollectionID` | uniqueidentifier | FK (Collection), NOT NULL | Collection reference |
| `ArtifactID` | uniqueidentifier | FK (Artifact), NOT NULL | Artifact reference |
| `Sequence` | int | DEFAULT 0 | Ordering within collection |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**Unique Constraint:** `(CollectionID, ArtifactID)`

---

#### 10. AIAgentArtifactType (Agent Capabilities)
**Entity:** `MJ: AI Agent Artifact Types`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ID` | uniqueidentifier | PK | Primary key |
| `AgentID` | uniqueidentifier | FK (AIAgent), NOT NULL | Agent reference |
| `ArtifactTypeID` | uniqueidentifier | FK (ArtifactType), NOT NULL | Type reference |
| `Sequence` | int | NULL | Ordering for multiple types |
| `__mj_CreatedAt` | datetimeoffset | | Creation timestamp |
| `__mj_UpdatedAt` | datetimeoffset | | Update timestamp |

**Unique Constraint:** `(AgentID, ArtifactTypeID)`

---

### Stored Procedures

All entities have standard CRUD stored procedures:

**Artifact Operations:**
- `spCreateArtifact`
- `spUpdateArtifact`
- `spDeleteArtifact`

**Version Operations:**
- `spCreateArtifactVersion`
- `spUpdateArtifactVersion`
- `spDeleteArtifactVersion`

**Type Operations:**
- `spCreateArtifactType`
- `spUpdateArtifactType`
- `spDeleteArtifactType`

**Collection Operations:**
- `spCreateCollectionArtifact`
- `spUpdateCollectionArtifact`
- `spDeleteCollectionArtifact`

**Conversation Artifact Operations:**
- `spCreateConversationArtifact`
- `spUpdateConversationArtifact`
- `spDeleteConversationArtifact`
- `spCreateConversationArtifactVersion`
- `spCreateConversationArtifactPermission`

**Agent Artifact Type Operations:**
- `spCreateAIAgentArtifactType`
- `spUpdateAIAgentArtifactType`
- `spDeleteAIAgentArtifactType`

---

## Entity Classes

### TypeScript Entity Structure

All artifact entities are generated in:
`/packages/MJCoreEntities/src/generated/entity_subclasses.ts`

**Key Entities:**

1. **ArtifactTypeEntity** - Artifact type definitions
2. **ArtifactEntity** - Global artifacts
3. **ArtifactVersionEntity** - Version history (extended in `/packages/MJCoreEntitiesServer/src/custom/ArtifactVersionExtended.server.ts`)
4. **ArtifactVersionAttributeEntity** - Extracted attributes
5. **ConversationArtifactEntity** - Conversation-scoped artifacts
6. **ConversationArtifactVersionEntity** - Conversation artifact versions
7. **ConversationArtifactPermissionEntity** - Permission management
8. **ConversationDetailArtifactEntity** - Message-level artifact links
9. **CollectionArtifactEntity** - Collection-artifact junction
10. **AIAgentArtifactTypeEntity** - Agent capability declarations

### Validation with Zod

All entities have Zod schema definitions for runtime validation:

```typescript
export const ArtifactSchema = z.object({
  ID: z.string(),
  EnvironmentID: z.string(),
  Name: z.string(),
  Description: z.string().nullable(),
  TypeID: z.string(),
  Comments: z.string().nullable(),
  UserID: z.string(),
  // ... computed fields
});
```

### Extended Functionality: ArtifactVersionExtended

**Location:** `/packages/MJCoreEntitiesServer/src/custom/ArtifactVersionExtended.server.ts`

**Key Enhancements:**

1. **Automatic Content Hashing:**
```typescript
override async Save(options?: EntitySaveOptions): Promise<boolean> {
  // Calculate SHA-256 hash
  this.ContentHash = crypto.createHash('sha256')
    .update(this.Content || '')
    .digest('hex');

  // ... rest of save logic
}
```

2. **Automatic Attribute Extraction:**
```typescript
protected async ExtractAndSaveAttributes(): Promise<void> {
  // Load artifact type hierarchy
  const typeChain = await this.LoadArtifactTypeHierarchy(artifact.TypeID);

  // Extract attributes using rules
  const result = await ArtifactExtractor.ExtractAttributes({
    content: this.Content || '',
    extractRules: ArtifactExtractor.ResolveExtractRules(typeChain),
    timeout: 5000
  });

  // Save to ArtifactVersionAttribute table
  await this.SaveAttributeRecords(result.attributes);
}
```

3. **Hierarchical Rule Resolution:**
- Walks up `ParentID` chain to collect all extract rules
- Child rules override parent rules by name
- Merged rule set passed to extractor

---

## UI Components

### Artifact Viewer Components

**Location:** `/packages/Angular/Generic/artifacts/src/lib/components/`

#### 1. ArtifactViewerPanelComponent
**Purpose:** Main container for viewing/editing artifacts

**Features:**
- Tabbed interface (Display, JSON, Details)
- Version history sidebar
- Save to collection functionality
- Panel resize and persistence
- Lazy loading of artifact content

**Tabs:**
- **Display**: Plugin-rendered view (markdown preview, code editor, etc.)
- **JSON**: Raw JSON view of artifact content
- **Details**: Metadata (name, type, created/updated timestamps, etc.)

---

#### 2. ArtifactTypePluginViewerComponent
**Purpose:** Dynamic plugin loader

**Functionality:**
- Reads `ArtifactType.DriverClass` to determine plugin
- Instantiates plugin via `MJGlobal.ClassFactory`
- Passes `artifactVersion` to plugin component
- Handles plugin loading errors with fallback

---

#### 3. ArtifactVersionHistoryComponent
**Purpose:** Version timeline and comparison

**Features:**
- Timeline display (DESC by version number)
- Version comparison (diff summary showing lines changed)
- Restore older version (creates new version)
- Download version as text file
- Content size display (B/KB/MB formatting)

**Actions:**
- **Restore**: Creates new version with content from selected version
- **Compare**: Shows diff against current version
- **Download**: Exports version as `.txt` file

---

#### 4. ArtifactMessageCardComponent
**Purpose:** Inline artifact display in conversation messages

**Features:**
- Compact card layout
- Artifact name and type badge
- Click to open full viewer
- Version number display

---

#### 5. BaseArtifactViewerPluginComponent (Abstract)
**Purpose:** Base class for all viewer plugins

**Key Properties:**
```typescript
@Input() artifactVersion: ArtifactVersionEntity;
isShowingElevatedDisplay: boolean;        // Using extracted content vs raw?
parentShouldShowRawContent: boolean;      // Should parent show JSON tab?
```

**Subclasses:**
- `JsonArtifactViewerPlugin`
- `CodeArtifactViewerPlugin`
- `MarkdownArtifactViewerPlugin`
- `HtmlArtifactViewerPlugin`
- `SvgArtifactViewerPlugin`
- `ComponentArtifactViewerPlugin`

---

### Collection UI Components (Detailed)

#### Component Hierarchy
```
ConversationsModule
├── CollectionTreeComponent (Sidebar)
├── CollectionsFullViewComponent (Main view)
├── CollectionViewComponent (Single collection)
├── CollectionArtifactCardComponent (Card)
└── CollectionFormModalComponent (Create/Edit)
```

#### Key Features Summary

**CollectionsFullViewComponent:**
- Breadcrumb navigation
- Search across collections and artifacts
- Grid display with actions
- Modal for create/edit

**CollectionTreeComponent:**
- Recursive tree rendering
- Expand/collapse nodes
- Drag-and-drop reparenting
- Visual drag feedback
- Circular reference prevention

**CollectionViewComponent:**
- Grid/List view toggle (persisted)
- Sort by Name/Date/Type
- Add/remove artifacts
- Artifact viewer overlay

**CollectionArtifactCardComponent:**
- Type-based icons
- Metadata display
- Hover actions (view, edit, remove)

**CollectionFormModalComponent:**
- Name validation
- Parent display for sub-collections
- Error handling

---

## Integration Points

### 1. Conversation Integration

**ConversationChatAreaComponent** manages conversation details and artifacts:

**Loading Strategy:**
- **Phase 1 (Fast):** Load messages from cache
- **Phase 2 (Background):** Load agent runs and artifacts in parallel

**Optimized Query:**
```typescript
// Single RunQuery instead of 3 sequential queries (~200ms vs ~880ms)
rq.RunQuery({
  QueryName: 'GetConversationArtifactsMap',
  CategoryPath: '/MJ/Conversations',
  Parameters: { ConversationID: conversationId }
}, currentUser);
```

**LazyArtifactInfo Pattern:**
- Display data loaded immediately (artifactId, name, type, versionNumber)
- Full entities lazy-loaded on-demand
- Prevents loading large `Content` fields upfront (~97% payload reduction)

---

### 2. ArtifactStateService (State Management)

**Location:** `/packages/Angular/Generic/conversations/src/lib/services/artifact-state.service.ts`

**Observable Streams:**
```typescript
activeArtifactId$: Observable<string | null>
activeVersionNumber$: Observable<number | null>
isPanelOpen$: Observable<boolean>
panelMode$: Observable<'view' | 'edit'>
activeArtifact$: Observable<ArtifactEntity | null>
```

**Key Methods:**

**Panel Management:**
- `openArtifact(id: string, versionNumber?: number): void`
- `closeArtifact(): void`
- `togglePanel(): void`
- `setPanelMode(mode: 'view' | 'edit'): void`

**CRUD Operations:**
- `loadArtifact(id, user): Promise<ArtifactEntity | null>`
- `createArtifact(data, user): Promise<ArtifactEntity>`
- `updateArtifact(id, updates, user): Promise<boolean>`
- `deleteArtifact(id, user): Promise<boolean>`

**Collection Operations:**
- `loadArtifactsForCollection(collectionId, user): Promise<ArtifactEntity[]>`
- `addToCollection(artifactId, collectionId, user): Promise<void>`
- `removeFromCollection(artifactId, collectionId, user): Promise<void>`

**Caching:**
- `cacheArtifact(artifact): void`
- `clearCache(): void`
- In-memory Map<artifactId, ArtifactEntity>

---

### 3. Artifact Extraction Engine

**Location:** `/packages/MJCoreEntities/src/artifact-extraction/artifact-extractor.ts`

**Key Methods:**

**Rule Resolution:**
```typescript
static ResolveExtractRules(
  artifactTypeChain: Array<{ ExtractRules?: string | null }>
): ArtifactExtractRule[]
// Merges parent and child rules, child overrides by name
```

**Extraction Execution:**
```typescript
static async ExtractAttributes(
  config: ArtifactExtractionConfig
): Promise<ArtifactExtractionResult>
// Executes JavaScript extractors with timeout and error handling
```

**Serialization:**
```typescript
static SerializeForStorage(
  attributes: ExtractedArtifactAttribute[]
): Array<{name, type, value, standardProperty}>
// Converts to JSON for database storage

static DeserializeFromStorage(
  storedAttributes: Array<{Name, Type, Value}>
): ExtractedArtifactAttribute[]
// Reconstructs from database JSON
```

**Standard Property Access:**
```typescript
static GetStandardProperty(
  attributes: ExtractedArtifactAttribute[],
  standardProperty: 'name' | 'description' | 'displayMarkdown' | 'displayHtml'
): any | null
// Convenience method for UI rendering
```

---

### 4. ConversationDetail Links

**Extended Columns on ConversationDetail:**

| Column | Type | Description |
|--------|------|-------------|
| `ArtifactID` | uniqueidentifier | Optional reference to ConversationArtifact |
| `ArtifactVersionID` | uniqueidentifier | Optional reference to specific version |

**ConversationDetailArtifact Junction:**
- Links messages to multiple artifacts
- Tracks direction (Input/Output)
- Enables artifact lineage tracking

**Use Cases:**
- Show artifacts generated in message
- Track artifacts used as input to agent
- Display artifact history in conversation timeline

---

## Current Capabilities

### ✅ Implemented Features

**Collection Management:**
- ✅ Create, edit, delete collections
- ✅ Hierarchical nesting with drag-and-drop
- ✅ Breadcrumb navigation
- ✅ Search collections and artifacts
- ✅ Grid and list view modes
- ✅ Environment-scoped isolation
- ✅ Custom sequencing

**Artifact Storage:**
- ✅ Dual storage models (global + conversation-scoped)
- ✅ Version control with SHA-256 hashing
- ✅ Type hierarchy with inheritance
- ✅ Automatic attribute extraction
- ✅ Multiple artifact types (6+ plugins)
- ✅ Content hashing for deduplication

**Artifact Viewing:**
- ✅ Plugin-based type-specific viewers
- ✅ Dynamic plugin loading via DriverClass
- ✅ Fallback to JSON viewer
- ✅ Tabbed interface (Display/JSON/Details)
- ✅ Version history with comparison
- ✅ Download versions

**Access Control:**
- ✅ Conversation artifact sharing scopes
- ✅ Granular permission levels (Owner/Edit/Read)
- ✅ User-specific permissions
- ✅ Environment isolation

**AI Integration:**
- ✅ Agents declare artifact types they produce
- ✅ Default artifact type per agent
- ✅ Multiple artifact type support per agent
- ✅ Message-level artifact tracking

**Performance:**
- ✅ Lazy loading of artifact content
- ✅ In-memory caching
- ✅ Batch queries for artifacts
- ✅ Parallel data loading
- ✅ localStorage for UI preferences

**Data Integrity:**
- ✅ Foreign key constraints
- ✅ Unique constraints (version numbers, permissions)
- ✅ Check constraints (sharing scope, access levels)
- ✅ Circular reference prevention in collections

---

## Gaps and Potential Enhancements

### 🚧 Missing or Incomplete Features

#### 1. Collection Features
- ❌ **Collection Sharing** - No mechanism to share collections between users
- ❌ **Collection Permissions** - No role-based access control for collections
- ❌ **Collection Export** - Cannot export collection contents as zip/bundle
- ❌ **Collection Templates** - No pre-configured collection structures
- ❌ **Bulk Operations** - No multi-select for batch add/remove
- ❌ **Collection Archival** - No soft-delete or archive functionality
- ❌ **Collection Search Filters** - Limited search capabilities
- ❌ **Collection Activity Log** - No audit trail for collection changes
- ❌ **Favorites/Stars** - No way to mark important collections

#### 2. Artifact Features
- ❌ **Artifact Linking** - No cross-references between artifacts
- ❌ **Artifact Dependencies** - Cannot declare "depends-on" relationships
- ❌ **Artifact Tags** - No tagging system for cross-collection organization
- ❌ **Full-Text Search** - No search within artifact content
- ❌ **Attribute Indexing** - Extracted attributes not indexed for search
- ❌ **Version Branching** - Only linear versioning supported
- ❌ **Merge/Conflict Resolution** - No collaborative editing features
- ❌ **Comments/Annotations** - No in-artifact commenting
- ❌ **Artifact Templates** - No quick-create from templates

#### 3. Versioning Enhancements
- ❌ **Branch/Tag Versions** - Only sequential versioning
- ❌ **Version Diff Viewer** - Only summary shown, not detailed diff
- ❌ **Auto-versioning Triggers** - No scheduled or event-based versioning
- ❌ **Version Rollback Audit** - Limited tracking of restore operations
- ❌ **Version Comparison UI** - Side-by-side comparison not implemented

#### 4. Extraction System
- ❌ **ML-Based Extraction** - Only rule-based extraction supported
- ❌ **Extraction Validators** - No validation of extracted values
- ❌ **Recursive Extraction** - No nested artifact extraction
- ❌ **Streaming Extraction** - Large content not handled incrementally
- ❌ **Custom Extractor Plugins** - Limited to JavaScript extractors

#### 5. Performance Optimizations
- ❌ **Content Compression** - Large content not compressed
- ❌ **Pagination** - All artifacts loaded at once
- ❌ **Lazy Load Versions** - Version list fully loaded upfront
- ❌ **Query Result Caching** - Server-side caching limited
- ❌ **CDN for Static Assets** - Artifact content not CDN-cached

#### 6. Integration Features
- ❌ **Export to Formats** - No PDF, Word, Excel export
- ❌ **Import from External** - No import from GitHub, Drive, etc.
- ❌ **Webhook Events** - No event notifications on artifact changes
- ❌ **CI/CD Integration** - No pipeline integration for code artifacts
- ❌ **API Documentation** - GraphQL API not fully documented
- ❌ **Public API** - No public REST API for artifacts

#### 7. Analytics & Insights
- ❌ **Usage Statistics** - No tracking of artifact views/downloads
- ❌ **Popular Artifacts** - No most-accessed artifacts report
- ❌ **Extraction Metrics** - No performance tracking for extractors
- ❌ **Version Statistics** - No diff size or change frequency metrics
- ❌ **Collection Analytics** - No insights on collection usage

#### 8. User Experience
- ❌ **Drag-and-Drop Upload** - Cannot drag files into collections
- ❌ **Artifact Preview** - No quick preview without opening
- ❌ **Keyboard Shortcuts** - Limited keyboard navigation
- ❌ **Mobile Responsive** - Collection UI not optimized for mobile
- ❌ **Dark Mode** - Artifact viewer doesn't respect theme
- ❌ **Accessibility** - ARIA labels incomplete

#### 9. Data Management
- ❌ **Retention Policies** - No automatic deletion by age
- ❌ **Archive to Cold Storage** - No S3/blob storage integration
- ❌ **Backup/Restore** - No artifact-specific backup tools
- ❌ **Data Export** - No bulk export functionality
- ❌ **Compliance Tools** - No GDPR/compliance features

#### 10. Security
- ❌ **Encryption at Rest** - Artifact content not encrypted
- ❌ **Audit Logging** - Limited audit trail for access
- ❌ **Permission Inheritance** - No inherited permissions from collections
- ❌ **IP Whitelisting** - No network-based access control
- ❌ **Token-Based Access** - No shareable access tokens

---

### 🎯 High-Priority Enhancements

Based on likely user needs, here are recommended priorities:

#### **Phase 1: Essential Features**
1. **Collection Export** - Export collection as zip with all artifacts
2. **Artifact Full-Text Search** - Search within content and attributes
3. **Version Diff Viewer** - Side-by-side comparison UI
4. **Bulk Operations** - Multi-select for batch operations
5. **Collection Sharing** - Share collections with other users

#### **Phase 2: Collaboration**
1. **Artifact Tagging** - Cross-collection organization
2. **Comments/Annotations** - In-artifact feedback
3. **Activity Log** - Audit trail for changes
4. **Favorites** - Mark important artifacts/collections
5. **Real-time Collaboration** - Multiple users editing

#### **Phase 3: Advanced Features**
1. **ML-Based Extraction** - Smarter attribute extraction
2. **Version Branching** - Non-linear version trees
3. **Artifact Dependencies** - Relationship graphs
4. **Import/Export** - External system integration
5. **Analytics Dashboard** - Usage insights

#### **Phase 4: Scale & Performance**
1. **Content Compression** - Reduce storage size
2. **Pagination** - Handle large collections
3. **CDN Integration** - Faster content delivery
4. **Query Optimization** - Server-side improvements
5. **Retention Policies** - Automated cleanup

---

## Key File Locations Reference

### Database Migrations
- `/migrations/v2/V202509171543__v2.101.x__Schema.sql` - Base Artifact/Collection tables
- `/migrations/v2/V202504231336__v2.34.x_Conversation_Artifacts.sql` - Conversation artifacts
- `/migrations/v2/V202509271512__v2.103.x__Add_CollectionArtifact_Join_Table.sql` - Collection junction
- `/migrations/v2/V202510081612__v2.105.x__Artifact_Extract_Rules_and_Agent_Artifact_Types.sql` - Extraction system
- `/migrations/v2/V202510111001__v2.105.x__Add_ArtifactType_DriverClass.sql` - DriverClass column

### SQL Generated Scripts
- `/SQL Scripts/generated/__mj/` - All views, stored procedures, indexes

### TypeScript Entity Classes
- `/packages/MJCoreEntities/src/generated/entity_subclasses.ts` - All entities
- `/packages/MJCoreEntitiesServer/src/custom/ArtifactVersionExtended.server.ts` - Extended version entity

### Extraction System
- `/packages/MJCoreEntities/src/artifact-extraction/artifact-extract-rules.ts` - Rule definitions
- `/packages/MJCoreEntities/src/artifact-extraction/artifact-extractor.ts` - Extraction engine

### UI Components
- `/packages/Angular/Generic/conversations/src/lib/components/collection/` - Collection UI
- `/packages/Angular/Generic/artifacts/src/lib/components/` - Artifact viewers

### Services
- `/packages/Angular/Generic/conversations/src/lib/services/artifact-state.service.ts` - State management
- `/packages/Angular/Generic/conversations/src/lib/models/lazy-artifact-info.ts` - Lazy loading

---

## Conclusion

MemberJunction's Collection and Artifact system provides a comprehensive foundation for organizing and managing artifacts with:

- **Mature Core Features**: Version control, type system, extraction, permissions
- **Flexible Architecture**: Plugin-based viewers, hierarchical types, dual storage models
- **Performance Optimizations**: Lazy loading, caching, batch queries
- **Integration Points**: Conversations, AI agents, collections

The system is production-ready for core use cases with clear paths for enhancement in areas like collaboration, analytics, and advanced search capabilities.

---

**Document Version:** 1.0
**Last Updated:** 2025-10-16
**Next Review:** TBD based on planned enhancements