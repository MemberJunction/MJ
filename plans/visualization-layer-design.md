# Visualization & Artifact Layer Design Plan

## Document Purpose

This document captures the complete design vision for the Visualization and Artifact Layer, spanning MemberJunction (MJ) as the open-source foundation and Skip as the commercial AI product built on top of it. It incorporates all analysis from the initial briefing, architectural discussions, and detailed design decisions around separation of concerns, artifact types, dataset interoperability, and the rendering pipeline.

---

## Part 1: Strategic Context — What is MJ, What is Skip, What is Research Agent?

### MemberJunction (MJ) — The Open-Source Foundation

MemberJunction is a **metadata-driven application framework** that provides:

- A universal metadata layer over any database schema (entities, fields, relationships, permissions)
- A code generation pipeline that produces TypeScript entity subclasses from metadata
- A generalized API layer (GraphQL) with dynamic resolution driven by metadata
- A base UI component library (Angular) with generic entity management (lists, forms, record detail)
- An extensible action/AI framework with provider-based abstractions (LLM providers, vector DB providers, etc.)
- A plugin/library architecture where functionality is delivered as independently versioned npm packages

**MJ's role in the visualization story**: MJ provides the **base artifact type system**, the **dataset abstraction (`IDataSet`)**, and **generic rendering infrastructure**. These are framework-level constructs that any application built on MJ can use — not just Skip. A hypothetical "MJ CRM" or "MJ ERP" or any third-party product built on MJ would have access to the same artifact system.

### Skip — The Commercial AI Product

Skip is the **commercial AI-powered business intelligence and data analysis product** built on MemberJunction. Skip provides:

- A conversational interface where business users ask questions in natural language
- An AI pipeline that translates questions into SQL, executes against the user's database, and presents results
- Smart visualizations that automatically select the best chart/table/report type for the data
- A conversation management system with history, follow-ups, and context threading
- Data source configuration, user management, and organizational features
- The **Skip Angular application** — a full product UI with branding, navigation, dashboards, etc.

**Skip's role in the visualization story**: Skip is where the **intelligent visualization selection logic** lives — the AI-driven decisions about "given this data shape and this user question, what chart type best communicates the answer?" Skip also provides the **polished, product-grade rendering components** that go beyond MJ's generic base, and the **conversation-integrated artifact experience** (artifacts appearing inline in chat, being saveable, shareable, etc.).

### Research Agent — The Autonomous Research System

The Research Agent is a **specialized autonomous agent capability** within Skip that performs multi-step research tasks:

- Breaks complex questions into sub-queries
- Executes multiple data retrievals in sequence or parallel
- Synthesizes findings across multiple result sets
- Produces structured research reports with citations to underlying data
- Can generate artifacts (charts, tables, reports) as part of its output

**Research Agent's role in the visualization story**: The Research Agent is a **producer of artifacts**. It needs to create artifact specifications as part of its research output. It doesn't need to know how artifacts render — it just needs to produce well-formed artifact descriptors that the rendering layer picks up. This is a clean separation: the Research Agent focuses on *what* to show, the artifact/rendering system handles *how* to show it.

---

## Part 2: Why This Separation Matters

### The Layered Architecture Value Proposition

```
┌─────────────────────────────────────────────────┐
│              Skip Product UI                     │
│   (AI viz selection, polished components,        │
│    conversation integration, dashboards)         │
├─────────────────────────────────────────────────┤
│           Research Agent                         │
│   (Multi-step research, artifact production,     │
│    synthesis, report generation)                 │
├─────────────────────────────────────────────────┤
│        MemberJunction Framework                  │
│   (Artifact types, IDataSet, base rendering,     │
│    metadata, entities, API, code gen)            │
└─────────────────────────────────────────────────┘
```

### Value for the Open-Source Community

By placing the artifact type system and dataset abstraction in MJ (open source), we enable:

1. **Any MJ-based application** can define and render artifacts — not just Skip
2. **Third-party developers** can build their own visualization products on MJ's foundation
3. **Community contributions** to base artifact types benefit the entire ecosystem
4. **Standard interfaces** (`IDataSet`, `IArtifact`, `IArtifactRenderer`) create a shared vocabulary
5. **Interoperability** — artifacts produced by one MJ-based app can be consumed by another

### Commercialization Opportunities for Skip

The separation creates clear commercial value:

1. **Skip's AI visualization intelligence** — the "smart" layer that knows *which* chart to pick and *how* to configure it based on natural language context — is proprietary product value. This is hard to replicate and represents genuine IP.
2. **Skip's polished rendering components** — production-quality, branded, interactive chart components that go far beyond basic rendering. These are the "last mile" that makes the difference between a developer tool and a business product.
3. **Skip's conversation integration** — artifacts living inside a chat experience, with follow-up questions, drill-down, sharing, and collaboration features.
4. **Research Agent capabilities** — the autonomous multi-step research pipeline is a premium feature that demonstrates Skip's AI depth.

### Commercialization Opportunities for Third Parties

Third parties building on MJ benefit from:

1. **Pre-built artifact foundation** — they don't have to design an artifact system from scratch
2. **Dataset interoperability** — `IDataSet` gives them a standard way to feed data into any renderer
3. **Extensible type system** — they can register their own artifact types via MJ's provider pattern
4. **Mix-and-match** — use MJ's base renderers for some types, build custom renderers for others
5. **Ecosystem compatibility** — artifacts created in their app are structurally compatible with Skip's, enabling potential integration paths

---

## Part 3: Core Technical Architecture

### 3.1 The Artifact Type System (MJ Layer)

The artifact type system lives in MemberJunction as a **provider-based, extensible registry** of artifact types. Each artifact type represents a category of visual or structured output (chart, table, report, dashboard, etc.).

#### Base Artifact Interface

```typescript
// @memberjunction/global — or a new @memberjunction/artifacts package

/**
 * Core artifact descriptor. This is the "specification" of what to render,
 * not the rendering itself. Think of it as a platform-agnostic blueprint.
 */
interface IArtifact {
    /** Unique identifier for this artifact instance */
    ID: string;

    /** The registered artifact type key (e.g., 'chart', 'table', 'report', 'dashboard') */
    ArtifactType: string;

    /** Human-readable title */
    Title: string;

    /** Optional description / subtitle */
    Description?: string;

    /**
     * Type-specific configuration. Each artifact type defines its own config shape.
     * For a chart: { chartType: 'bar', xAxis: 'Month', yAxis: 'Revenue', ... }
     * For a table: { columns: [...], sortBy: 'Name', ... }
     */
    Config: Record<string, any>;

    /**
     * The data associated with this artifact. Can be inline data,
     * a reference to a query, or an IDataSet instance.
     */
    Data?: IArtifactData;

    /**
     * Whether this artifact type supports conversion to IDataSet.
     * Allows interrogation before calling ToDataSet().
     */
    get SupportsDataSet(): boolean;

    /**
     * Converts the artifact's data into a standardized IDataSet.
     * Throws an error if SupportsDataSet is false.
     * This enables cross-artifact-type data interoperability —
     * e.g., take a chart's data and render it as a table, or export it.
     */
    ToDataSet(): IDataSet;
}

/**
 * Represents the data payload for an artifact.
 * Supports multiple modes of data binding.
 */
interface IArtifactData {
    /** Inline row data — the most common case for Skip query results */
    Rows?: Record<string, any>[];

    /** Column metadata — types, display names, formatting hints */
    Columns?: IColumnDescriptor[];

    /** Alternative: reference to a saved query or data source by ID */
    DataSourceRef?: string;

    /** Alternative: a pre-built IDataSet */
    DataSet?: IDataSet;
}

interface IColumnDescriptor {
    Name: string;
    DisplayName?: string;
    DataType: string; // 'string' | 'number' | 'date' | 'boolean' | ...
    Format?: string;  // e.g., 'currency', 'percent', 'date-short'
}
```

#### The IDataSet Abstraction

`IDataSet` is a **tabular data interchange format** that serves as the common currency between artifact types, renderers, and export mechanisms.

```typescript
/**
 * A standardized tabular dataset that can be consumed by any renderer,
 * exported to CSV/Excel, or transformed into another artifact type.
 * Lives in MJ as a framework-level abstraction.
 */
interface IDataSet {
    /** Descriptive name for this dataset */
    Name: string;

    /** Column definitions with type and display metadata */
    Columns: IDataSetColumn[];

    /** The actual row data */
    Rows: IDataSetRow[];

    /** Total row count (may differ from Rows.length if paginated) */
    TotalRowCount: number;

    /** Optional metadata about the dataset's origin */
    Metadata?: IDataSetMetadata;
}

interface IDataSetColumn {
    Name: string;
    DisplayName: string;
    DataType: 'string' | 'number' | 'date' | 'boolean' | 'object' | 'array';
    Format?: string;
    Visible?: boolean;        // defaults true
    Sortable?: boolean;       // defaults true
    Width?: number | string;  // hint for renderers
}

interface IDataSetRow {
    /** Keyed by column Name */
    Values: Record<string, any>;
}

interface IDataSetMetadata {
    /** SQL query that produced this data, if applicable */
    SourceQuery?: string;
    /** Entity name if this came from an MJ entity */
    SourceEntity?: string;
    /** Timestamp of when data was fetched */
    FetchedAt?: Date;
    /** Any additional context */
    [key: string]: any;
}
```

#### ToDataSet() and SupportsDataSet Pattern

The `ToDataSet()` / `SupportsDataSet` pattern provides **interrogatable interoperability**:

```typescript
// Usage pattern:
const artifact: IArtifact = getArtifact();

if (artifact.SupportsDataSet) {
    const dataset = artifact.ToDataSet();
    // Can now: render as table, export to CSV, feed into another chart, etc.
} else {
    // This artifact type doesn't have tabular data
    // (e.g., a free-form text report, an image, a dashboard container)
}
```

**Which artifact types support DataSet?**

| Artifact Type | SupportsDataSet | Notes |
|--------------|----------------|-------|
| Chart (bar, line, pie, etc.) | `true` | The underlying data series are inherently tabular |
| Table / Grid | `true` | Already is tabular data |
| Pivot Table | `true` | Can flatten to tabular |
| KPI / Scorecard | `true` | Simple key-value pairs → single-row dataset |
| Report (structured) | `true` | If report has data sections, each section can be a dataset |
| Dashboard | `false` | Container of other artifacts, not itself tabular |
| Free-text / Markdown | `false` | No structured data |
| Image / Media | `false` | Binary content, not tabular |

**Error behavior when not supported:**

```typescript
class BaseArtifact implements IArtifact {
    // ... other members ...

    get SupportsDataSet(): boolean {
        return false; // subclasses override
    }

    ToDataSet(): IDataSet {
        if (!this.SupportsDataSet) {
            throw new Error(
                `Artifact type '${this.ArtifactType}' does not support conversion to IDataSet. ` +
                `Check SupportsDataSet before calling ToDataSet().`
            );
        }
        return this.BuildDataSet(); // subclasses implement
    }

    protected BuildDataSet(): IDataSet {
        throw new Error('Subclass must implement BuildDataSet()');
    }
}
```

### 3.2 Artifact Type Registry (MJ Layer)

MJ provides a registry where artifact types are registered, following MJ's existing provider/class-factory patterns.

```typescript
/**
 * Registry for artifact types. Follows MJ's ClassFactory / ProviderBase patterns.
 */
class ArtifactTypeRegistry {
    private static _types: Map<string, IArtifactTypeRegistration> = new Map();

    static Register(registration: IArtifactTypeRegistration): void {
        this._types.set(registration.TypeKey, registration);
    }

    static Get(typeKey: string): IArtifactTypeRegistration | undefined {
        return this._types.get(typeKey);
    }

    static GetAll(): IArtifactTypeRegistration[] {
        return Array.from(this._types.values());
    }
}

interface IArtifactTypeRegistration {
    /** Unique key: 'chart', 'table', 'report', 'dashboard', etc. */
    TypeKey: string;

    /** Human-readable display name */
    DisplayName: string;

    /** Description for tooling / documentation */
    Description: string;

    /** Whether this type supports DataSet conversion */
    SupportsDataSet: boolean;

    /** Factory function to create instances */
    CreateInstance(config: Record<string, any>, data?: IArtifactData): IArtifact;

    /**
     * Sub-types, if applicable. For 'chart', these would be
     * 'bar', 'line', 'pie', 'scatter', 'area', etc.
     */
    SubTypes?: IArtifactSubType[];
}

interface IArtifactSubType {
    SubTypeKey: string;
    DisplayName: string;
    Description: string;
    /** JSON Schema or type descriptor for this sub-type's Config shape */
    ConfigSchema?: Record<string, any>;
}
```

### 3.3 The Rendering Pipeline

#### Renderer Interface (MJ Layer — Base)

```typescript
/**
 * Base renderer interface. Lives in MJ.
 * Platform-specific renderers (Angular, React, etc.) extend this.
 */
interface IArtifactRenderer {
    /** Which artifact type(s) this renderer handles */
    SupportedTypes: string[];

    /** Priority for renderer selection (higher = preferred) */
    Priority: number;

    /** Whether this renderer can handle the given artifact */
    CanRender(artifact: IArtifact): boolean;

    /**
     * Render the artifact. Platform-specific — in Angular this returns
     * a Component reference, in a server context it might return HTML string.
     */
    Render(artifact: IArtifact, container: any, options?: IRenderOptions): void;
}

interface IRenderOptions {
    /** Render in compact/thumbnail mode vs full interactive mode */
    Mode?: 'full' | 'compact' | 'thumbnail';
    /** Override theme */
    Theme?: 'light' | 'dark' | 'auto';
    /** Max dimensions */
    MaxWidth?: number;
    MaxHeight?: number;
    /** Whether interactions (click, hover, drill-down) are enabled */
    Interactive?: boolean;
}
```

#### Renderer Registry (MJ Layer)

```typescript
class ArtifactRendererRegistry {
    private static _renderers: IArtifactRenderer[] = [];

    static Register(renderer: IArtifactRenderer): void {
        this._renderers.push(renderer);
        // Keep sorted by priority (descending)
        this._renderers.sort((a, b) => b.Priority - a.Priority);
    }

    /**
     * Find the best renderer for a given artifact.
     * Returns the highest-priority renderer that can handle it.
     */
    static GetRenderer(artifact: IArtifact): IArtifactRenderer | undefined {
        return this._renderers.find(r => r.CanRender(artifact));
    }
}
```

---

## Part 4: The Skip Layer — AI-Driven Visualization Intelligence

### 4.1 Where Skip Adds Value on Top of MJ

MJ provides the **what** (artifact types, dataset abstraction, rendering interfaces). Skip provides the **intelligence**:

#### Visualization Selection Engine (Skip-Proprietary)

The core commercial differentiator. Given a user's natural language question and the resulting dataset, Skip's AI determines the optimal visualization:

```typescript
/**
 * Skip-proprietary visualization intelligence.
 * This is the "brain" that decides what artifact type best communicates
 * the answer to a user's question.
 */
interface IVisualizationSelector {
    /**
     * Given the context of a conversation turn, select the best
     * artifact type and configure it optimally.
     */
    SelectVisualization(context: IVisualizationContext): Promise<IArtifactRecommendation>;
}

interface IVisualizationContext {
    /** The user's original question */
    UserQuestion: string;

    /** The SQL that was generated */
    GeneratedSQL: string;

    /** The result data */
    DataSet: IDataSet;

    /** Conversation history for context */
    ConversationHistory?: IConversationTurn[];

    /** User preferences (preferred chart types, color schemes, etc.) */
    UserPreferences?: IUserVisualizationPreferences;
}

interface IArtifactRecommendation {
    /** The recommended artifact type */
    ArtifactType: string;

    /** Sub-type if applicable (e.g., 'bar' for chart type) */
    SubType?: string;

    /** Pre-configured Config object ready to pass to artifact creation */
    Config: Record<string, any>;

    /** Confidence score (0-1) for this recommendation */
    Confidence: number;

    /** Alternative recommendations ranked by fitness */
    Alternatives?: IArtifactRecommendation[];

    /** Human-readable explanation of why this visualization was chosen */
    Reasoning: string;
}
```

#### Skip's Smart Heuristics

Before even hitting an LLM, Skip applies data-shape heuristics:

```
Data Shape Analysis:
├── Single value → KPI Card
├── Single row, multiple columns → Detail Card / Scorecard
├── Multiple rows, 1-2 columns → Simple Table or List
├── Multiple rows, categorical + numeric → Bar/Column Chart
├── Multiple rows, temporal + numeric → Line/Area Chart
├── Multiple rows, 2 numeric columns → Scatter Plot
├── Proportional data (parts of whole) → Pie/Donut Chart
├── Geographic data detected → Map Visualization
├── Hierarchical structure → Tree/Treemap
└── Large row count (>100) → Paginated Table with optional chart
```

These heuristics provide instant recommendations without LLM latency, with the LLM used for refinement, edge cases, and respecting the nuance of the user's question.

### 4.2 Skip's Enhanced Renderers

Skip registers its own high-priority renderers that override MJ's base renderers:

```typescript
// Skip registers enhanced renderers at a higher priority than MJ defaults
ArtifactRendererRegistry.Register({
    SupportedTypes: ['chart'],
    Priority: 100,  // Higher than MJ's default (e.g., 10)
    CanRender: (artifact) => artifact.ArtifactType === 'chart',
    Render: (artifact, container, options) => {
        // Skip's polished chart rendering with:
        // - Branded color palettes
        // - Smooth animations
        // - Interactive tooltips with drill-down
        // - Responsive sizing
        // - Accessibility compliance
        // - Export to PNG/PDF
        // - "Ask a follow-up" integration
    }
});
```

This means:
- **In Skip**: the enhanced renderer is used automatically (higher priority)
- **In a plain MJ app**: the base MJ renderer is used (lower priority, but functional)
- **In a third-party app**: they can register their own renderers at any priority level

### 4.3 Conversation-Integrated Artifacts

Skip's unique value includes how artifacts live within the conversation flow:

```typescript
/**
 * Skip-specific extension that wraps an IArtifact with conversation context.
 */
interface IConversationArtifact {
    /** The underlying MJ artifact */
    Artifact: IArtifact;

    /** The conversation turn that produced this artifact */
    ConversationTurnID: string;

    /** The conversation this belongs to */
    ConversationID: string;

    /** Whether the user has "pinned" / saved this artifact */
    IsPinned: boolean;

    /** User annotations / notes on this artifact */
    Annotations?: string[];

    /** Actions available on this artifact */
    AvailableActions: IArtifactAction[];
}

interface IArtifactAction {
    Key: string;          // 'export-csv', 'export-png', 'change-chart-type', 'drill-down', 'ask-followup'
    DisplayName: string;
    Icon?: string;
    Execute(artifact: IArtifact, params?: any): Promise<any>;
}
```

### 4.4 Research Agent as Artifact Producer

The Research Agent produces artifacts as part of its multi-step research output:

```typescript
/**
 * A research report section that may include an artifact.
 * The Research Agent doesn't render anything — it produces specifications.
 */
interface IResearchSection {
    /** Section title */
    Title: string;

    /** Narrative text (markdown) */
    Narrative: string;

    /** Optional artifact specification for this section */
    Artifact?: IArtifact;

    /** Data citations — which queries/sources informed this section */
    Citations: IDataCitation[];
}

interface IResearchReport {
    /** Overall report title */
    Title: string;

    /** Executive summary */
    Summary: string;

    /** Ordered sections */
    Sections: IResearchSection[];

    /** All datasets used across the report */
    DataSets: IDataSet[];
}
```

The clean separation means:
1. Research Agent focuses on **analysis and synthesis** — its core competency
2. It outputs **artifact specifications** (`IArtifact` objects) describing what should be shown
3. The **rendering pipeline** (MJ base + Skip enhanced renderers) handles how to show it
4. The **conversation layer** (Skip) handles where to show it (inline in chat, in a report view, etc.)

---

## Part 5: Package & Repository Structure

### 5.1 Where Code Lives

#### In MemberJunction (Open Source)

| Package | Contents |
|---------|----------|
| `@memberjunction/artifacts-core` | `IArtifact`, `IArtifactData`, `IDataSet`, `IColumnDescriptor`, `IDataSetColumn`, `IDataSetRow`, `BaseArtifact`, `ArtifactTypeRegistry`, `ArtifactRendererRegistry` |
| `@memberjunction/artifacts-types` | Built-in artifact type implementations: `ChartArtifact`, `TableArtifact`, `KPIArtifact`, `ReportArtifact`, `DashboardArtifact` — each with their `ToDataSet()` / `SupportsDataSet` implementations |
| `@memberjunction/artifacts-renderers-angular` | Base Angular renderers for each artifact type — functional but basic |
| `@memberjunction/artifacts-renderers-react` *(future)* | Base React renderers |

#### In Skip (Commercial / Proprietary)

| Package / Module | Contents |
|---------|----------|
| `@skip-brain/visualization-engine` | `IVisualizationSelector`, data-shape heuristics, LLM-driven viz selection, `IArtifactRecommendation` |
| `@skip-brain/artifact-renderers` | Enhanced Angular renderers — polished charts, interactive tables, branded components |
| `@skip-brain/conversation-artifacts` | `IConversationArtifact`, artifact actions, pinning, export, follow-up integration |
| `@skip-brain/research-artifacts` | `IResearchReport`, `IResearchSection`, Research Agent artifact production logic |

### 5.2 Dependency Flow

```
Skip Application
  ├── @skip-brain/visualization-engine
  │     └── @memberjunction/artifacts-core
  ├── @skip-brain/artifact-renderers
  │     ├── @memberjunction/artifacts-core
  │     └── @memberjunction/artifacts-renderers-angular (extends base)
  ├── @skip-brain/conversation-artifacts
  │     └── @memberjunction/artifacts-core
  └── @skip-brain/research-artifacts
        └── @memberjunction/artifacts-core

Third-Party MJ App
  ├── @memberjunction/artifacts-core
  ├── @memberjunction/artifacts-types
  └── @memberjunction/artifacts-renderers-angular (or custom renderers)
```

---

## Part 6: Implementation Phases

### Phase 1: Foundation (MJ)
1. Create `@memberjunction/artifacts-core` package
2. Implement `IArtifact`, `IArtifactData`, `IDataSet` interfaces
3. Implement `BaseArtifact` class with `SupportsDataSet` / `ToDataSet()` pattern
4. Implement `ArtifactTypeRegistry` and `ArtifactRendererRegistry`
5. Write comprehensive unit tests for dataset conversion and registry

### Phase 2: Built-in Types (MJ)
1. Implement `ChartArtifact` with sub-types (bar, line, pie, scatter, area, donut)
2. Implement `TableArtifact` with column config, sorting, pagination support
3. Implement `KPIArtifact` for single-value / scorecard display
4. Implement `ReportArtifact` as a multi-section container
5. Implement `DashboardArtifact` as an artifact container (SupportsDataSet = false)
6. Each type implements `BuildDataSet()` for types where SupportsDataSet = true

### Phase 3: Base Renderers (MJ)
1. Create `@memberjunction/artifacts-renderers-angular` package
2. Implement base Angular components for chart, table, KPI rendering
3. Create a generic `<mj-artifact>` component that auto-selects renderer
4. Ensure renderers work standalone (no Skip dependency)

### Phase 4: Skip Intelligence Layer
1. Build `IVisualizationSelector` with data-shape heuristics
2. Integrate LLM-based visualization refinement
3. Build enhanced Skip renderers (polished, branded, interactive)
4. Integrate artifacts into conversation flow (`IConversationArtifact`)
5. Build artifact actions (export, drill-down, chart type switching, follow-up)

### Phase 5: Research Agent Integration
1. Define `IResearchReport` / `IResearchSection` structures
2. Update Research Agent to produce `IArtifact` specifications in its output
3. Build report rendering view that renders multi-section research with inline artifacts
4. Enable dataset cross-referencing across research sections

### Phase 6: Polish & Advanced Features
1. Dashboard builder — compose multiple artifacts into layouts
2. Artifact persistence — save/load artifacts to/from database
3. Sharing — generate shareable links to artifact views
4. Theming system — customizable color palettes, fonts, branding per organization
5. Server-side rendering for PDF/image export

---

## Part 7: Key Design Decisions & Rationale

### Why `SupportsDataSet` as a boolean getter instead of just try/catch?

**Explicit over implicit.** Callers should be able to inspect capability without triggering side effects or exceptions. The getter pattern allows:
- UI to conditionally show "Export to CSV" buttons
- Type-safe conditional logic without exception handling overhead
- Documentation and discoverability — it's clear from the interface what's possible

### Why separate `IArtifact` from rendering?

**Platform independence.** An `IArtifact` is a data structure — it can be serialized to JSON, stored in a database, sent over a wire, produced by a server-side agent, and consumed by any rendering platform. Coupling the artifact to a specific rendering technology (Angular, React, etc.) would break this portability and violate MJ's framework-agnostic philosophy.

### Why registries instead of hard-coded mappings?

**Extensibility without modification.** Following MJ's established ClassFactory and provider patterns, registries allow:
- Skip to add enhanced renderers without modifying MJ code
- Third parties to add custom artifact types without forking
- Runtime configuration — different deployments can have different renderers registered
- Priority-based selection — graceful fallback from enhanced → base renderers

### Why IDataSet as a separate abstraction from entity data?

**Artifacts deal with query results, not entity records.** MJ entities have metadata, permissions, relationships, change tracking, and lifecycle management. A dataset is simpler — it's tabular data with column descriptors. Many artifact data sources are arbitrary SQL result sets, aggregations, or computed data that don't map to a single entity. `IDataSet` is the right abstraction for this "just data" use case while `EntityInfo` / `BaseEntity` remain the right abstraction for entity-oriented operations.

### Why does the Research Agent produce artifact specs, not rendered output?

**Separation of concerns at its purest.** The Research Agent's job is to *think* — to analyze data, draw conclusions, and decide what information should be presented. It should not need to know whether the consumer is an Angular app, a React app, a PDF renderer, or a CLI. By producing platform-agnostic `IArtifact` specifications, the Research Agent remains testable, portable, and focused on its core competency.

---

## Appendix A: Example End-to-End Flow

### User asks: "How has revenue trended by quarter this year?"

1. **Skip Conversation Layer** receives the question
2. **Skip SQL Agent** generates: `SELECT Quarter, SUM(Revenue) as Revenue FROM Sales WHERE Year = 2026 GROUP BY Quarter ORDER BY Quarter`
3. **Skip executes query**, receives 4 rows of data
4. **Skip Visualization Selector** analyzes:
   - Temporal dimension (Quarter) + numeric measure (Revenue) → Line Chart recommended
   - Confidence: 0.92
   - Alternative: Bar Chart (confidence 0.85)
5. **Skip creates an IArtifact**:
   ```json
   {
     "ID": "artifact-uuid",
     "ArtifactType": "chart",
     "Title": "Revenue by Quarter (2026)",
     "Config": {
       "chartType": "line",
       "xAxis": { "field": "Quarter", "label": "Quarter" },
       "yAxis": { "field": "Revenue", "label": "Revenue", "format": "currency" },
       "showDataLabels": true
     },
     "Data": {
       "Rows": [
         { "Quarter": "Q1", "Revenue": 1250000 },
         { "Quarter": "Q2", "Revenue": 1480000 },
         { "Quarter": "Q3", "Revenue": 1320000 },
         { "Quarter": "Q4", "Revenue": 1590000 }
       ],
       "Columns": [
         { "Name": "Quarter", "DataType": "string" },
         { "Name": "Revenue", "DataType": "number", "Format": "currency" }
       ]
     }
   }
   ```
6. **Artifact Renderer Registry** finds Skip's enhanced chart renderer (Priority 100)
7. **Skip Chart Renderer** renders an interactive line chart with:
   - Branded color palette
   - Hover tooltips showing exact values
   - Smooth animation on load
   - Action bar: Export PNG | Export CSV | Change Chart Type | Ask Follow-up
8. **Conversation layer** wraps it as `IConversationArtifact` with the turn context
9. **User clicks "Export CSV"** → artifact action calls `artifact.ToDataSet()` (SupportsDataSet = true), converts to CSV

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Artifact** | A platform-agnostic specification describing a visualization or structured output |
| **Artifact Type** | A registered category of artifact (chart, table, KPI, report, dashboard) |
| **IDataSet** | A standardized tabular data format for interchange between artifact types and consumers |
| **Renderer** | A platform-specific component that takes an IArtifact and produces visual output |
| **Visualization Selector** | Skip's AI-driven engine that recommends the best artifact type for a given question and dataset |
| **Conversation Artifact** | A Skip-specific wrapper adding conversation context, actions, and persistence to an artifact |
| **Research Report** | A multi-section output from the Research Agent, potentially containing multiple artifacts |
| **SupportsDataSet** | Boolean getter on IArtifact indicating whether ToDataSet() can be called |
| **ToDataSet()** | Method that converts an artifact's data into the standard IDataSet format |
