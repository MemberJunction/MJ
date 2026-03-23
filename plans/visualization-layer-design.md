# Visualization & Artifact Layer — MJ Foundation Design Plan

## Document Purpose

This document defines the **open-source foundation layer** for the Visualization and Artifact system in MemberJunction. It covers the artifact type system, the `IDataSet` data interchange abstraction, the rendering pipeline, and the base package structure. These are framework-level constructs available to **any** application built on MJ.

The foundation is intentionally minimal and extensible — it provides the structural primitives and registry patterns that leave room for commercial products to stack on top of the core bits. Products like Skip can add AI-driven visualization intelligence, polished renderers, and product-specific integrations without modifying any MJ code — they simply register higher-priority renderers and add their own artifact types. See the corresponding product-layer design documents for those details.

---

## Part 1: MemberJunction's Role in the Visualization Story

### MemberJunction (MJ) — The Open-Source Foundation

MemberJunction is a **metadata-driven application framework** that provides:

- A universal metadata layer over any database schema (entities, fields, relationships, permissions)
- A code generation pipeline that produces TypeScript entity subclasses from metadata
- A generalized API layer (GraphQL) with dynamic resolution driven by metadata
- A base UI component library (Angular) with generic entity management (lists, forms, record detail)
- An extensible action/AI framework with provider-based abstractions (LLM providers, vector DB providers, etc.)
- A plugin/library architecture where functionality is delivered as independently versioned npm packages

**MJ's role in the visualization story**: MJ provides the **base artifact type system**, the **dataset abstraction (`IDataSet`)**, and **generic rendering infrastructure**. These are framework-level constructs that any application built on MJ can use. A hypothetical "MJ CRM" or "MJ ERP" or any third-party product built on MJ would have access to the same artifact system.

### The Layered Architecture

```
┌─────────────────────────────────────────────────┐
│        Commercial Products (e.g. Skip)           │
│   (AI viz selection, polished components,        │
│    conversation integration, dashboards)         │
├─────────────────────────────────────────────────┤
│        MemberJunction Framework  ← THIS PLAN     │
│   (Artifact types, IDataSet, base rendering,     │
│    metadata, entities, API, code gen)            │
└─────────────────────────────────────────────────┘
```

### Value for the Open-Source Community

By placing the artifact type system and dataset abstraction in MJ (open source), we enable:

1. **Any MJ-based application** can define and render artifacts — not just a single product
2. **Third-party developers** can build their own visualization products on MJ's foundation
3. **Community contributions** to base artifact types benefit the entire ecosystem
4. **Standard interfaces** (`IDataSet`, `IArtifact`, `IArtifactRenderer`) create a shared vocabulary
5. **Interoperability** — artifacts produced by one MJ-based app can be consumed by another

---

## Part 2: Core Technical Architecture

### 2.1 The Artifact Type System

The artifact type system lives in MemberJunction as a **provider-based, extensible registry** of artifact types. Each artifact type represents a category of visual or structured output (chart, table, report, dashboard, etc.).

#### Base Artifact Interface

```typescript
// @memberjunction/artifacts-core

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
    /** Inline row data — the most common case for query results */
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

**Base class implementation:**

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

### 2.2 Artifact Type Registry

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

### 2.3 The Rendering Pipeline

#### Renderer Interface (Base)

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

#### Renderer Registry

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

The priority-based registry is key to the extensibility model: commercial products or third-party apps register their own renderers at higher priority, and the registry automatically selects the best available renderer for any artifact.

---

## Part 3: MJ Package Structure

| Package | Contents |
|---------|----------|
| `@memberjunction/artifacts-core` | `IArtifact`, `IArtifactData`, `IDataSet`, `IColumnDescriptor`, `IDataSetColumn`, `IDataSetRow`, `BaseArtifact`, `ArtifactTypeRegistry`, `ArtifactRendererRegistry` |
| `@memberjunction/artifacts-types` | Built-in artifact type implementations: `ChartArtifact`, `TableArtifact`, `KPIArtifact`, `ReportArtifact`, `DashboardArtifact` — each with their `ToDataSet()` / `SupportsDataSet` implementations |
| `@memberjunction/artifacts-renderers-angular` | Base Angular renderers for each artifact type — functional but basic |
| `@memberjunction/artifacts-renderers-react` *(future)* | Base React renderers |

### Dependency Flow for Third-Party Apps

```
Third-Party MJ App
  ├── @memberjunction/artifacts-core
  ├── @memberjunction/artifacts-types
  └── @memberjunction/artifacts-renderers-angular (or custom renderers)
```

---

## Part 4: Implementation Phases

### Phase 1: Foundation
1. Create `@memberjunction/artifacts-core` package
2. Implement `IArtifact`, `IArtifactData`, `IDataSet` interfaces
3. Implement `BaseArtifact` class with `SupportsDataSet` / `ToDataSet()` pattern
4. Implement `ArtifactTypeRegistry` and `ArtifactRendererRegistry`
5. Write comprehensive unit tests for dataset conversion and registry

### Phase 2: Built-in Types
1. Implement `ChartArtifact` with sub-types (bar, line, pie, scatter, area, donut)
2. Implement `TableArtifact` with column config, sorting, pagination support
3. Implement `KPIArtifact` for single-value / scorecard display
4. Implement `ReportArtifact` as a multi-section container
5. Implement `DashboardArtifact` as an artifact container (SupportsDataSet = false)
6. Each type implements `BuildDataSet()` for types where SupportsDataSet = true

### Phase 3: Base Renderers
1. Create `@memberjunction/artifacts-renderers-angular` package
2. Implement base Angular components for chart, table, KPI rendering
3. Create a generic `<mj-artifact>` component that auto-selects renderer
4. Ensure renderers work standalone (no product-layer dependency)

---

## Part 5: Key Design Decisions & Rationale

### Why `SupportsDataSet` as a boolean getter instead of just try/catch?

**Explicit over implicit.** Callers should be able to inspect capability without triggering side effects or exceptions. The getter pattern allows:
- UI to conditionally show "Export to CSV" buttons
- Type-safe conditional logic without exception handling overhead
- Documentation and discoverability — it's clear from the interface what's possible

### Why separate `IArtifact` from rendering?

**Platform independence.** An `IArtifact` is a data structure — it can be serialized to JSON, stored in a database, sent over a wire, produced by a server-side agent, and consumed by any rendering platform. Coupling the artifact to a specific rendering technology (Angular, React, etc.) would break this portability and violate MJ's framework-agnostic philosophy.

### Why registries instead of hard-coded mappings?

**Extensibility without modification.** Following MJ's established ClassFactory and provider patterns, registries allow:
- Products to add enhanced renderers without modifying MJ code
- Third parties to add custom artifact types without forking
- Runtime configuration — different deployments can have different renderers registered
- Priority-based selection — graceful fallback from enhanced → base renderers

### Why IDataSet as a separate abstraction from entity data?

**Artifacts deal with query results, not entity records.** MJ entities have metadata, permissions, relationships, change tracking, and lifecycle management. A dataset is simpler — it's tabular data with column descriptors. Many artifact data sources are arbitrary SQL result sets, aggregations, or computed data that don't map to a single entity. `IDataSet` is the right abstraction for this "just data" use case while `EntityInfo` / `BaseEntity` remain the right abstraction for entity-oriented operations.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Artifact** | A platform-agnostic specification describing a visualization or structured output |
| **Artifact Type** | A registered category of artifact (chart, table, KPI, report, dashboard) |
| **IDataSet** | A standardized tabular data format for interchange between artifact types and consumers |
| **Renderer** | A platform-specific component that takes an IArtifact and produces visual output |
| **SupportsDataSet** | Boolean getter on IArtifact indicating whether ToDataSet() can be called |
| **ToDataSet()** | Method that converts an artifact's data into the standard IDataSet format |
