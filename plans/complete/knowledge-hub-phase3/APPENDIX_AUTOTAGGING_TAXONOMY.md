# Knowledge Hub Phase 3 — Appendix: Autotagging, Taxonomy & Tag UX

> Detailed design for tasks 1, 2, and 4 from the Phase 3 plan, plus new work identified during design review.

---

## Table of Contents

1. [Schema Changes Summary](#1-schema-changes-summary)
2. [Plugin Architecture for Content Source Types](#2-plugin-architecture-for-content-source-types)
3. [Entity Records Source Type Rebuild](#3-entity-records-source-type-rebuild)
4. [Tag Taxonomy Bridge](#4-tag-taxonomy-bridge)
5. [TagEngine + Semantic Tag Matching](#5-tagengine--semantic-tag-matching)
6. [Autotagging Prompt Restructuring](#6-autotagging-prompt-restructuring)
7. [Tagged Items on Standard Entity Forms](#7-tagged-items-on-standard-entity-forms)
8. [ng-word-cloud Generic Package](#8-ng-word-cloud-generic-package)
9. [Task Breakdown](#9-task-breakdown)

---

## 1. Schema Changes Summary

### New Columns

| Table | Column | Type | Nullable | Default | Purpose |
|-------|--------|------|----------|---------|---------|
| `ContentSourceType` | `DriverClass` | `NVARCHAR(255)` | NULL | — | `@RegisterClass` key for ClassFactory lookup |
| `ContentSourceType` | `Configuration` | `NVARCHAR(MAX)` | NULL | — | JSON blob for type-level settings (`IContentSourceTypeConfiguration`) |
| `ContentSource` | `Configuration` | `NVARCHAR(MAX)` | NULL | — | JSON blob for source-instance settings (`IContentSourceConfiguration`) |
| `ContentSource` | `EntityID` | `UNIQUEIDENTIFIER` | NULL | — | FK to `Entity.ID` — which entity this source pulls from (Entity source type only) |
| `ContentSource` | `EntityDocumentID` | `UNIQUEIDENTIFIER` | NULL | — | FK to `EntityDocument.ID` — template for rendering records (Entity source type only) |
| `ContentType` | `Configuration` | `NVARCHAR(MAX)` | NULL | — | JSON blob for type-level settings (`IContentTypeConfiguration`) |
| `ContentItem` | `EntityRecordDocumentID` | `UNIQUEIDENTIFIER` | NULL | — | FK to `EntityRecordDocument.ID` — links content item to its rendered snapshot |
| `ContentItemTag` | `TagID` | `UNIQUEIDENTIFIER` | NULL | — | FK to `Tag.ID` — links free-text tag to formal taxonomy entry |
| `TaggedItem` | `Weight` | `NUMERIC(5,4)` | NOT NULL | `1.0` | Relevance weight (0.0–1.0), matching ContentItemTag pattern |

### JSONType Interfaces (emitted by CodeGen)

| Entity Field | JSONType Name | IsArray | Purpose |
|---|---|---|---|
| `ContentSourceType.Configuration` | `IContentSourceTypeConfiguration` | `false` | Type-level config schema |
| `ContentSource.Configuration` | `IContentSourceConfiguration` | `false` | Instance-level config schema |
| `ContentType.Configuration` | `IContentTypeConfiguration` | `false` | Content-type-level config schema |

### Seed Data Updates

| Table | Record | Change |
|---|---|---|
| `ContentSourceType` | "Entity" (existing) | Set `DriverClass = 'AutotagEntity'` |
| `ContentSourceType` | "Local File System" (existing) | Set `DriverClass = 'AutotagLocalFileSystem'` |
| `ContentSourceType` | "Website" (existing) | Set `DriverClass = 'AutotagWebsite'` |
| `ContentSourceType` | "RSS Feed" (existing) | Set `DriverClass = 'AutotagRSSFeed'` |
| `ContentSourceType` | "Azure Blob" (existing) | Set `DriverClass = 'AutotagAzureBlob'` |

---

## 2. Plugin Architecture for Content Source Types

### Current State

The `AutotagAndVectorizeContentAction` hardcodes provider instantiation:

```typescript
// Current: hardcoded in content-autotag-and-vectorize.action.ts
const localFileSystem = new AutotagLocalFileSystem();
const rssFeed = new AutotagRSSFeed();
const website = new AutotagWebsite();
```

### Target State

Each provider is registered via `@RegisterClass` against `AutotagBase` and discovered at runtime via `ClassFactory`:

```typescript
// Each provider already has @RegisterClass(AutotagBase, 'AutotagEntity') etc.
// The engine resolves dynamically:
const sourceTypes = await engine.GetAllContentSourceTypes(contextUser);
for (const sourceType of sourceTypes) {
    const sources = await engine.getAllContentSources(contextUser, sourceType.ID);
    if (sources.length === 0) continue;

    const provider = MJGlobal.Instance.ClassFactory.CreateInstance<AutotagBase>(
        AutotagBase,
        sourceType.DriverClass
    );
    if (!provider) {
        LogError(`No provider registered for DriverClass: ${sourceType.DriverClass}`);
        continue;
    }
    await provider.Autotag(contextUser, onProgress);
}
```

### Changes Required

1. **`ContentSourceType` table** — Add `DriverClass NVARCHAR(255) NULL` and `Configuration NVARCHAR(MAX) NULL`
2. **Seed existing types** — UPDATE each existing ContentSourceType row to set its DriverClass
3. **`AutotagBaseEngine`** — Add method to load all ContentSourceTypes and cache them; add method to resolve provider by DriverClass
4. **`AutotagAndVectorizeContentAction`** — Replace hardcoded instantiation with ClassFactory loop over source types
5. **`AutotagBase`** — No changes needed (interface is already clean)
6. **Each provider** — Already has `@RegisterClass`; no changes needed

### Configuration Interfaces

```typescript
// Stub interfaces for forward compatibility — fields added as needed

/** Type-level configuration stored on ContentSourceType.Configuration */
export interface IContentSourceTypeConfiguration {
    // Reserved for future type-wide settings
}

/** Instance-level configuration stored on ContentSource.Configuration */
export interface IContentSourceConfiguration {
    /** Tag taxonomy matching mode */
    TagTaxonomyMode?: 'constrained' | 'auto-grow' | 'free-flow';
    /** Root Tag ID for constrained/auto-grow modes */
    TagRootID?: string | null;
    /** Similarity threshold for matching ContentItemTags to formal Tags (0.0-1.0) */
    TagMatchThreshold?: number; // default: 0.9
    /** Whether to share existing taxonomy with LLM during autotagging */
    ShareTaxonomyWithLLM?: boolean; // default: true
    /** Enable vectorization for this source (default: true) */
    EnableVectorization?: boolean; // default: true
}

/** Content-type-level configuration stored on ContentType.Configuration */
export interface IContentTypeConfiguration {
    // Reserved for future content-type-wide settings
}
```

These interfaces will be registered as JSONType metadata so CodeGen emits typed `ConfigurationObject` accessors on the generated entity classes.

---

## 3. Entity Records Source Type Rebuild

### Current State

`AutotagEntity` ([AutotagEntity.ts](../../../packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts)):
- Uses `ContentSourceParam` key/value pairs for `EntityName` and `EntityFields`
- Concatenates raw field values into text (`field: value\n`)
- Creates ContentItems directly with no link back to entity records
- No connection to Entity Documents or Entity Record Documents

### Target State

`AutotagEntity` is rebuilt to:
1. Read `EntityID` and `EntityDocumentID` from the `ContentSource` record (new FK columns)
2. Use the existing Entity Document template rendering pipeline to produce text
3. Create/update `EntityRecordDocument` records (rendered snapshots)
4. Create `ContentItem` records linked to the ERD via `EntityRecordDocumentID` FK
5. Send text through LLM autotagging → `ContentItemTag`
6. Bridge `ContentItemTag` → `Tag` + `TaggedItem` via TagEngine (see section 4)

### Data Flow

```
ContentSource (type="Entity", EntityID, EntityDocumentID)
  │
  ├─ 1. Query entity records where __mj_UpdatedAt > lastRunDate
  │     (incremental: uses ContentProcessRun.EndTime for last run)
  │
  ├─ 2. Render each record via EntityDocument template
  │     → Reuses EntityDocumentTemplateParser (Nunjucks templates)
  │     → Creates/updates EntityRecordDocument (snapshot with DocumentText)
  │
  ├─ 3. Create/update ContentItem per record
  │     → ContentItem.EntityRecordDocumentID = ERD.ID
  │     → ContentItem.Text = ERD.DocumentText
  │     → ContentItem.Checksum = hash(DocumentText)
  │     → ContentItem.Name = record display name
  │
  ├─ 4. LLM Autotagging (existing pipeline)
  │     → AutotagBaseEngine.ExtractTextAndProcessWithLLM()
  │     → Creates ContentItemTag records (free text + weight)
  │
  ├─ 5. Tag Taxonomy Bridge (new)
  │     → For each ContentItemTag, match/create formal Tag
  │     → Create TaggedItem linking Tag to source entity record
  │
  └─ 6. Optional Vectorization
        → Only if EntityDocument doesn't already have vectorization
          configured through normal means
        → If enabled on ContentSource, run standard vectorization pipeline
```

### Key Implementation Details

**Incremental detection**: Query `__mj_UpdatedAt > lastRunDate` where `lastRunDate` comes from the most recent `ContentProcessRun.EndTime` for this source. This is already how the current code works via `getContentSourceLastRunDate()`.

**ERD reuse**: The `EntityVectorSyncer` already creates `EntityRecordDocument` records. We need to extract the template-rendering portion into a shared utility so `AutotagEntity` can render templates without triggering vectorization. Alternatively, `AutotagEntity` can directly use `EntityDocumentTemplateParser` + `TemplateEngineServer.RenderTemplate()`.

**ContentItem ↔ ERD linking**: New nullable FK `ContentItem.EntityRecordDocumentID`. For non-entity sources this is NULL. For entity sources it points to the ERD, enabling:
- Navigation from ContentItem → source entity record (via ERD.EntityID + ERD.RecordID)
- Avoiding duplicate text rendering (reuse ERD.DocumentText)
- Tracking which ERD version was tagged

**Vectorization decision**: The ContentSource.Configuration has `EnableVectorization` (default true). However, if the EntityDocument already has vectorization configured through the normal Entity Document pipeline (VectorDatabaseID + AIModelID are set and an active EntityDocumentRun exists), the autotagging pipeline should skip vectorization to avoid double-vectorizing. The UI can detect this and surface a message: "Vectorization is handled by the Entity Document pipeline."

---

## 4. Tag Taxonomy Bridge

### Architecture

The bridge runs after LLM autotagging produces `ContentItemTag` records. For each content item tag:

1. **Semantic match** against existing `Tag` records using `TagEngine` (see section 5)
2. **Decision** based on ContentSource.Configuration.TagTaxonomyMode:
   - **`constrained`**: Only match within the subtree rooted at `TagRootID`. If no match above threshold → log as unmatched, do NOT create new Tag
   - **`auto-grow`**: Match within subtree. If no match above threshold → create new `Tag` under `TagRootID` (or as child of closest partial match)
   - **`free-flow`**: Match against all Tags. If no match → create new root-level Tag
3. **Link**: Set `ContentItemTag.TagID` to the matched/created Tag
4. **Create `TaggedItem`**: Link the formal Tag to the source entity record with weight

### Tag Creation from LLM Output

The LLM can suggest hierarchical tags. When `ShareTaxonomyWithLLM` is true, the prompt includes the existing taxonomy tree and the LLM can return:

```json
{
  "tags": [
    { "tag": "Machine Learning", "weight": 0.95, "parentTag": "Artificial Intelligence" },
    { "tag": "Healthcare", "weight": 0.8, "parentTag": null }
  ]
}
```

If `parentTag` matches an existing Tag, the new Tag is created as a child. This lets the LLM organically build the taxonomy hierarchy.

### ContentItemTag → TaggedItem Flow

```typescript
// Pseudocode for bridge logic in ContentItemTagEntityServer
async AfterSave(contextUser: UserInfo): Promise<void> {
    // Only bridge for entity-sourced content items
    const contentItem = await this.loadContentItem();
    if (!contentItem.EntityRecordDocumentID) return; // not entity-sourced

    const erd = await this.loadEntityRecordDocument(contentItem.EntityRecordDocumentID);
    const contentSource = await this.loadContentSource(contentItem.ContentSourceID);
    const config = contentSource.ConfigurationObject; // typed via JSONType

    // Use TagEngine to find or create formal Tag
    const tagEngine = TagEngine.Instance;
    const formalTag = await tagEngine.ResolveTag(
        this.Tag,           // free text from LLM
        this.Weight,
        config.TagTaxonomyMode ?? 'auto-grow',
        config.TagRootID ?? null,
        config.TagMatchThreshold ?? 0.9,
        contextUser
    );

    if (formalTag) {
        // Link ContentItemTag to formal Tag
        this.TagID = formalTag.ID;
        await this.Save(contextUser);

        // Create TaggedItem linking Tag to source entity record
        await tagEngine.CreateTaggedItem(
            formalTag.ID,
            erd.EntityID,
            erd.RecordID,
            this.Weight,
            contextUser
        );
    }
}
```

---

## 5. TagEngine + Semantic Tag Matching

### Architecture (AIEngineBase/AIEngine Containment Pattern)

Following the established MJ pattern:

```
TagEngineBase (packages/MJCoreEntities or new package)
  ├── Extends BaseEngine<TagEngineBase>
  ├── Loads: all Tag records, all TaggedItem records (cached)
  ├── Provides: tag lookup, hierarchy traversal, CRUD helpers
  ├── Usable: client + server
  └── Singleton via BaseSingleton

TagEngine (packages/MJCoreEntitiesServer or new server package)
  ├── Extends BaseSingleton<TagEngine>
  ├── Contains: TagEngineBase (composition, not inheritance)
  ├── Server-only additions:
  │   ├── SimpleVectorService<TagEmbeddingMetadata> for semantic matching
  │   ├── Embedding generation for Tag.Name + Tag.Description
  │   └── ResolveTag() — semantic match + create/link logic
  └── Config() pattern:
      1. await TagEngineBase.Instance.Config()
      2. Generate embeddings for all Tags
      3. Load into SimpleVectorService
```

### TagEngineBase (Client + Server)

```typescript
@RegisterForStartup()
export class TagEngineBase extends BaseEngine<TagEngineBase> {
    private _tags: MJTagEntity[] = [];
    private _taggedItems: MJTaggedItemEntity[] = [];

    public get Tags(): MJTagEntity[] { return this._tags; }
    public get TaggedItems(): MJTaggedItemEntity[] { return this._taggedItems; }

    // Hierarchy helpers
    public GetTagByName(name: string): MJTagEntity | undefined;
    public GetTagByID(id: string): MJTagEntity | undefined;
    public GetChildTags(parentID: string): MJTagEntity[];
    public GetSubtree(rootID: string): MJTagEntity[]; // all descendants
    public GetTaggedItemsForRecord(entityID: string, recordID: string): MJTaggedItemEntity[];
    public GetTaxonomyTree(rootID?: string): TagTreeNode[]; // for prompt injection

    // CRUD helpers
    public async CreateTag(name: string, displayName: string, parentID: string | null, description: string | null, contextUser: UserInfo): Promise<MJTagEntity>;
    public async CreateTaggedItem(tagID: string, entityID: string, recordID: string, weight: number, contextUser: UserInfo): Promise<MJTaggedItemEntity>;
}
```

### TagEngine (Server-Only)

```typescript
export class TagEngine extends BaseSingleton<TagEngine> {
    private _tagVectorService: SimpleVectorService<TagEmbeddingMetadata> | null = null;

    protected get Base(): TagEngineBase {
        return TagEngineBase.Instance;
    }

    // Delegate all TagEngineBase properties
    public get Tags() { return this.Base.Tags; }
    public get TaggedItems() { return this.Base.TaggedItems; }
    // ... etc

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
        // 1. Load base metadata
        await TagEngineBase.Instance.Config(forceRefresh, contextUser);

        // 2. Generate embeddings for all tags using smallest available model
        await this.RefreshTagEmbeddings(contextUser);
    }

    private async RefreshTagEmbeddings(contextUser?: UserInfo): Promise<void> {
        // Use smallest/fastest embedding model available
        const model = this.getSmallestEmbeddingModel();
        const tagTexts = this.Tags.map(t =>
            `${t.Name}${t.Description ? ': ' + t.Description : ''}`
        );

        const embeddings = await model.EmbedTexts(tagTexts);

        this._tagVectorService = new SimpleVectorService<TagEmbeddingMetadata>();
        const entries = this.Tags.map((tag, i) => ({
            key: tag.ID,
            vector: embeddings[i],
            metadata: { Name: tag.Name, ParentID: tag.ParentID }
        }));
        this._tagVectorService.LoadVectors(entries);
    }

    /**
     * Core method: resolve a free-text tag to a formal Tag record.
     * Uses semantic search for sub-millisecond local matching.
     */
    public async ResolveTag(
        tagText: string,
        weight: number,
        mode: 'constrained' | 'auto-grow' | 'free-flow',
        rootID: string | null,
        threshold: number,
        contextUser: UserInfo
    ): Promise<MJTagEntity | null> {
        // 1. Embed the candidate tag text
        const model = this.getSmallestEmbeddingModel();
        const [candidateVector] = await model.EmbedTexts([tagText]);

        // 2. Search existing tags (optionally filtered to subtree)
        const filter = rootID
            ? (meta: TagEmbeddingMetadata) => this.isInSubtree(meta.key, rootID)
            : undefined;
        const matches = this._tagVectorService.FindNearest(
            candidateVector, 1, threshold, 'cosine', filter
        );

        // 3. If match found above threshold, return it
        if (matches.length > 0) {
            return this.Base.GetTagByID(matches[0].key);
        }

        // 4. No match — behavior depends on mode
        switch (mode) {
            case 'constrained':
                return null; // don't create, just log

            case 'auto-grow':
                // Create under rootID (or as child of closest partial match)
                const newTag = await this.Base.CreateTag(
                    tagText, tagText, rootID, null, contextUser
                );
                // Add to vector service for future matching
                const [newVector] = await model.EmbedTexts([tagText]);
                this._tagVectorService.AddVector(newTag.ID, newVector, {
                    Name: tagText, ParentID: rootID
                });
                return newTag;

            case 'free-flow':
                const rootTag = await this.Base.CreateTag(
                    tagText, tagText, null, null, contextUser
                );
                const [rootVector] = await model.EmbedTexts([tagText]);
                this._tagVectorService.AddVector(rootTag.ID, rootVector, {
                    Name: tagText, ParentID: null
                });
                return rootTag;
        }
    }
}
```

### Tag Embedding Metadata

```typescript
interface TagEmbeddingMetadata {
    Name: string;
    ParentID: string | null;
}
```

### Performance Characteristics

- **Tag count**: Typically hundreds to low thousands — easily fits in memory
- **Embedding model**: Use smallest available (e.g., `text-embedding-3-small` or local sentence transformer)
- **Embedding time**: One-time at server startup; incremental adds for new tags
- **Search time**: Sub-millisecond via `SimpleVectorService.FindNearest()` (pure in-memory cosine)
- **Cache invalidation**: Re-embed only when tags are added/modified; listen for Tag entity save events

---

## 6. Autotagging Prompt Restructuring

### Prefix Caching Optimization

Many inference providers (OpenAI, Anthropic, Google) support prefix caching — if the first N tokens of a prompt match a recent request, those tokens are served from cache at reduced cost. Structure the prompt to maximize cache hits:

```
┌──────────────────────────────────────────────────────┐
│  STATIC PREFIX (rarely changes, cached)              │
│  ├── System instructions for autotagging             │
│  ├── Output format specification (JSON schema)       │
│  ├── Tag quality guidelines                          │
│  └── Parent-child tag relationship instructions      │
├──────────────────────────────────────────────────────┤
│  SEMI-STATIC (changes when taxonomy changes)         │
│  ├── Existing tag taxonomy tree (JSON)               │
│  ├── Instructions to prefer existing tags            │
│  └── Content type context (min/max tags)             │
├──────────────────────────────────────────────────────┤
│  DYNAMIC SUFFIX (changes per item)                   │
│  ├── Content text to tag                             │
│  └── Source-specific context (entity name, etc.)     │
└──────────────────────────────────────────────────────┘
```

### Taxonomy Injection

When `ShareTaxonomyWithLLM` is true (default), the prompt includes:

```json
{
  "existingTaxonomy": [
    {
      "name": "Technology",
      "children": [
        { "name": "Artificial Intelligence", "children": [
          { "name": "Machine Learning", "children": [] },
          { "name": "Natural Language Processing", "children": [] }
        ]},
        { "name": "Cloud Computing", "children": [] }
      ]
    },
    {
      "name": "Healthcare",
      "children": []
    }
  ]
}
```

The LLM is instructed:
1. Prefer existing tags from the taxonomy when they fit
2. May create new tags if existing ones don't capture the concept
3. May suggest parent-child relationships for new tags
4. Return `parentTag` field when a tag should be nested

### Updated Output Schema

```json
{
  "tags": [
    {
      "tag": "string — tag name (prefer existing taxonomy tags)",
      "weight": "number — 0.0 to 1.0 relevance score",
      "parentTag": "string | null — existing tag name this should be nested under"
    }
  ],
  "attributes": [
    {
      "attribute": "string",
      "value": "string"
    }
  ]
}
```

---

## 7. Tagged Items on Standard Entity Forms

### Toolbar Integration

Add a **Tags** button to the standard entity form toolbar, alongside existing buttons (Edit/Save, Favorite, Record Changes, Lists).

**Location**: [base-form-component.ts](../../../packages/Angular/Generic/base-forms/src/lib/base-form-component.ts) toolbar section

**Behavior**:
- **Icon**: `fa-solid fa-tags`
- **Badge**: Shows tag count (loaded async on form load)
- **Click**: Opens a slide-in panel (consistent with Record Changes panel)
- **Panel contents**:
  - Tag pills/chips with weight visualization (opacity or size proportional to weight)
  - Click a tag → navigates to tag detail or filters by tag
  - Word cloud view toggle (uses `ng-word-cloud` component)
  - "Add Tag" action for manual tagging

### Async Data Loading

```typescript
// Load tagged items for the current record
private async LoadTaggedItems(): Promise<void> {
    const rv = new RunView();
    const result = await rv.RunView<MJTaggedItemEntity>({
        EntityName: 'MJ: Tagged Items',
        ExtraFilter: `EntityID='${this.entityInfo.ID}' AND RecordID='${this.record.CompositeKey.Values()}'`,
        ResultType: 'entity_object'
    });
    if (result.Success) {
        this.TaggedItems = result.Results;
        this.TagCount = result.Results.length;
    }
}
```

### Tag Display Component

A reusable `mj-record-tags` component (part of `ng-shared-generic` or a new `ng-tags` package):
- Input: `EntityID`, `RecordID`
- Loads and displays tags automatically
- Supports inline add/remove
- Toggle between list view and word cloud view
- Emits events: `TagClick`, `TagAdd`, `TagRemove`

---

## 8. ng-word-cloud Generic Package

### Package Structure

```
packages/Angular/Generic/word-cloud/
├── package.json                    (@memberjunction/ng-word-cloud)
├── tsconfig.json
├── ng-package.json
├── src/
│   ├── lib/
│   │   ├── word-cloud.component.ts   (main component)
│   │   ├── word-cloud.types.ts       (interfaces, types)
│   │   ├── word-cloud.layout.ts      (layout algorithm)
│   │   ├── word-cloud.component.scss
│   │   └── word-cloud.module.ts      (if NgModule needed)
│   ├── public-api.ts
│   └── index.ts
```

### Component API

```typescript
@Component({
    selector: 'mj-word-cloud',
    standalone: true,
    // ...
})
export class MJWordCloudComponent {
    // --- Inputs ---
    /** Data items to render */
    @Input() Items: WordCloudItem[] = [];

    /** Minimum font size in pixels */
    @Input() MinFontSize: number = 12;

    /** Maximum font size in pixels */
    @Input() MaxFontSize: number = 48;

    /** Layout algorithm */
    @Input() Layout: 'spiral' | 'rectangular' = 'spiral';

    /** Color mode — uses design tokens */
    @Input() ColorMode: 'brand' | 'categorical' | 'weight-gradient' = 'brand';

    /** Whether items are interactive (clickable, hoverable) */
    @Input() Interactive: boolean = true;

    /** Maximum items to display */
    @Input() MaxItems: number = 100;

    /** Animation on initial render */
    @Input() Animate: boolean = true;

    // --- Outputs ---
    @Output() ItemClick = new EventEmitter<WordCloudItemEvent>();
    @Output() ItemHover = new EventEmitter<WordCloudItemEvent>();
    @Output() ItemLeave = new EventEmitter<WordCloudItemEvent>();
}
```

### Types

```typescript
export interface WordCloudItem {
    /** Display text */
    Text: string;
    /** Weight/importance (0.0–1.0) — determines font size */
    Weight: number;
    /** Optional category for color grouping */
    Category?: string;
    /** Optional arbitrary metadata passed through events */
    Metadata?: Record<string, unknown>;
}

export interface WordCloudItemEvent {
    /** The item that was interacted with */
    Item: WordCloudItem;
    /** Original DOM event */
    Event: MouseEvent;
}
```

### Rendering Approach

- **SVG-based** — Angular-friendly for events, accessibility, and styling
- **Layout**: Archimedean spiral placement (most natural word cloud look)
- **Collision detection**: Bounding box overlap checks during placement
- **Font sizing**: Linear interpolation between `MinFontSize` and `MaxFontSize` based on weight
- **Colors**: Use `--mj-brand-primary` with varying opacity, or categorical palette from design tokens
- **Responsive**: SVG viewBox scales to container

### Usage Examples

```html
<!-- In content autotagging dashboard -->
<mj-word-cloud
    [Items]="tagCloudItems"
    [MaxFontSize]="64"
    ColorMode="weight-gradient"
    (ItemClick)="OnTagClicked($event)">
</mj-word-cloud>

<!-- In entity form tag panel -->
<mj-word-cloud
    [Items]="recordTagItems"
    [MaxFontSize]="32"
    [MinFontSize]="14"
    Layout="rectangular"
    (ItemClick)="OnFormTagClicked($event)">
</mj-word-cloud>
```

---

## 9. Task Breakdown

### Phase 3A: Schema & Infrastructure (do first — enables everything else)

| # | Task | Priority | Dependencies |
|---|------|----------|-------------|
| 3A-1 | **Migration**: Add `DriverClass`, `Configuration` to `ContentSourceType`; `Configuration`, `EntityID`, `EntityDocumentID` to `ContentSource`; `Configuration` to `ContentType`; `EntityRecordDocumentID` to `ContentItem`; `TagID` to `ContentItemTag`; `Weight` to `TaggedItem`. Include all extended properties. | HIGH | None |
| 3A-2 | **Migration seed data**: UPDATE existing ContentSourceType rows to set DriverClass values | HIGH | 3A-1 |
| 3A-3 | **JSONType metadata**: Create metadata files for Configuration fields on ContentSourceType, ContentSource, ContentType with interface definitions | HIGH | 3A-1, CodeGen run |
| 3A-4 | **Run CodeGen** to generate typed entity classes with new fields + JSONType accessors | HIGH | 3A-1 |
| 3A-5 | **Define TypeScript interfaces**: `IContentSourceTypeConfiguration`, `IContentSourceConfiguration`, `IContentTypeConfiguration` in appropriate package (use JSONTypeDefinition in metadata so CodeGen emits them) | HIGH | 3A-3 |

### Phase 3B: Plugin Architecture

| # | Task | Priority | Dependencies |
|---|------|----------|-------------|
| 3B-1 | **Refactor `AutotagBaseEngine`**: Add `GetAllContentSourceTypes()` method; cache source types; add `ResolveProvider(driverClass)` using ClassFactory | HIGH | 3A-4 |
| 3B-2 | **Refactor `AutotagAndVectorizeContentAction`**: Replace hardcoded provider instantiation with dynamic ClassFactory loop over source types | HIGH | 3B-1 |
| 3B-3 | **Verify all providers** still have correct `@RegisterClass` decorators matching seed DriverClass values | HIGH | 3B-2 |
| 3B-4 | **Unit tests**: Plugin resolution, unknown driver class handling, empty source type handling | HIGH | 3B-2 |

### Phase 3C: Entity Records Source Type Rebuild

| # | Task | Priority | Dependencies |
|---|------|----------|-------------|
| 3C-1 | **Extract template rendering** from `EntityVectorSyncer` into a shared utility or ensure `EntityDocumentTemplateParser` is independently usable without triggering vectorization | HIGH | 3A-4 |
| 3C-2 | **Rebuild `AutotagEntity`**: Read EntityID + EntityDocumentID from ContentSource; render via EntityDocument template; create/update ERD records; create ContentItems linked to ERD | HIGH | 3C-1 |
| 3C-3 | **Incremental detection**: Use `__mj_UpdatedAt > lastRunDate` from ContentProcessRun for changed-record detection | HIGH | 3C-2 |
| 3C-4 | **Vectorization decision logic**: Check if EntityDocument already has vectorization configured; skip if so; honor ContentSource.Configuration.EnableVectorization | MEDIUM | 3C-2 |
| 3C-5 | **Unit tests**: Template rendering, ERD creation, ContentItem linking, incremental detection, vectorization skip logic | HIGH | 3C-2 |

### Phase 3D: Tag Taxonomy Bridge

| # | Task | Priority | Dependencies |
|---|------|----------|-------------|
| 3D-1 | **Create `TagEngineBase`** (new package or in MJCoreEntities): Load all Tags + TaggedItems, hierarchy helpers, CRUD methods, `GetTaxonomyTree()` for prompt injection | HIGH | 3A-4 |
| 3D-2 | **Create `TagEngine`** (server package): Composition over TagEngineBase, SimpleVectorService for tag embeddings, `ResolveTag()` method with constrained/auto-grow/free-flow modes | HIGH | 3D-1 |
| 3D-3 | **Tag bridge logic**: After ContentItemTag save for entity-sourced items, call TagEngine.ResolveTag() → set TagID, create TaggedItem | HIGH | 3D-2 |
| 3D-4 | **Update autotagging prompt**: Restructure for prefix caching (static → taxonomy → dynamic); add taxonomy injection; update output schema for parentTag field | HIGH | 3D-1 |
| 3D-5 | **Prompt taxonomy injection**: Build JSON tree from TagEngineBase.GetTaxonomyTree(); inject into prompt context when ShareTaxonomyWithLLM is true | HIGH | 3D-4 |
| 3D-6 | **Unit tests**: TagEngineBase hierarchy methods, TagEngine semantic matching, ResolveTag modes, taxonomy tree serialization, bridge flow | HIGH | 3D-3 |

### Phase 3E: Tagged Items on Entity Forms

| # | Task | Priority | Dependencies |
|---|------|----------|-------------|
| 3E-1 | **Create `mj-record-tags` component** (in `ng-shared-generic` or new `ng-tags` package): Loads TaggedItems for a given EntityID + RecordID, displays as pills with weights | MEDIUM | 3A-4 |
| 3E-2 | **Add Tags toolbar button** to base-form-component: Icon, badge with async count, click opens slide-in panel | MEDIUM | 3E-1 |
| 3E-3 | **Tag slide-in panel**: List view with tag pills, word cloud toggle, add/remove actions | MEDIUM | 3E-1, 3F-1 |
| 3E-4 | **Manual tagging**: Allow users to search/select from existing Tags and add TaggedItem records | MEDIUM | 3E-2 |

### Phase 3F: ng-word-cloud Package

| # | Task | Priority | Dependencies |
|---|------|----------|-------------|
| 3F-1 | **Create package scaffolding**: `packages/Angular/Generic/word-cloud/` with standard MJ Angular package structure | MEDIUM | None |
| 3F-2 | **Implement layout engine**: Archimedean spiral placement, bounding box collision, responsive SVG viewBox | MEDIUM | 3F-1 |
| 3F-3 | **Implement `MJWordCloudComponent`**: Inputs, outputs, SVG rendering, design token colors, animation | MEDIUM | 3F-2 |
| 3F-4 | **Integrate in content autotagging dashboard**: Replace current tag display with word cloud | MEDIUM | 3F-3 |
| 3F-5 | **Integrate in entity form tag panel**: Word cloud toggle in tag slide-in | MEDIUM | 3F-3, 3E-3 |
| 3F-6 | **Unit tests**: Layout algorithm, component rendering, event emission | MEDIUM | 3F-3 |

### Phase 3G: Content Autotagging UI Updates

| # | Task | Priority | Dependencies |
|---|------|----------|-------------|
| 3G-1 | **Content Source form update**: Show EntityID + EntityDocumentID pickers when source type is "Entity"; hide URL field; show Configuration JSON editor | MEDIUM | 3A-4, 3C-2 |
| 3G-2 | **Tag taxonomy mode UI**: Per-source configuration for taxonomy mode, root tag selector, match threshold slider | MEDIUM | 3D-2 |
| 3G-3 | **Vectorization status indicator**: Show whether EntityDocument already handles vectorization; offer to enable if not | LOW | 3C-4 |

### Execution Order

```
3A (Schema) → CodeGen → 3B (Plugin) → 3C (Entity Source) ──┐
                                                             ├→ 3G (UI Updates)
3A (Schema) → CodeGen → 3D (Taxonomy) ──────────────────────┘
                                                    │
3F (Word Cloud) ────────────────────────────────────┤
                                                    │
3A (Schema) → CodeGen → 3E (Form Tags) ← ──────────┘
```

**Parallelizable work**: 3B, 3C, 3D can proceed in parallel after 3A + CodeGen. 3F (word cloud) has no schema dependencies and can start immediately. 3E and 3G depend on downstream results.
