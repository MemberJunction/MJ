# Unified Data Snapshots, Component Events & Agent-Component Dialog

> **Status**: PLANNING
> **Created**: 2026-03-25
> **Scope**: `@memberjunction/interactive-component-types`, `@memberjunction/ng-artifacts`, `@memberjunction/ng-react`, agent integration

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Sub-Phase A: Unified DataArtifactSpec — Multi-Table Expansion](#3-sub-phase-a-unified-dataartifactspec--multi-table-expansion)
4. [Sub-Phase B: Component Event System with Cancellation](#4-sub-phase-b-component-event-system-with-cancellation)
5. [Sub-Phase C: Artifact-Level State Snapshots](#5-sub-phase-c-artifact-level-state-snapshots)
6. [Sub-Phase D: Data Artifact Viewer Multi-Table UX](#6-sub-phase-d-data-artifact-viewer-multi-table-ux)
7. [Sub-Phase E: Agent-Component Dialog Bridge](#7-sub-phase-e-agent-component-dialog-bridge)
8. [Sub-Phase F: Interactive Component Data Contract](#8-sub-phase-f-interactive-component-data-contract)
9. [Cross-Cutting Concerns](#9-cross-cutting-concerns)
10. [File Inventory](#10-file-inventory)
11. [Open Items & Future Considerations](#11-open-items--future-considerations)

---

## 1. Executive Summary

This plan unifies three interconnected capabilities that are currently missing from MemberJunction's interactive component system:

| Capability | Problem Today | Solution |
|---|---|---|
| **Multi-table data snapshots** | `DataArtifactSpec` supports only a single table (one `rows[]`, one `columns[]`). Interactive components and dashboards produce multiple datasets. | Expand `DataArtifactSpec` to support a `tables[]` array of named datasets with per-table metadata, while maintaining full backward compatibility with the single-table format. |
| **Component event system** | Interactive components have no way for consumers to subscribe to events or cancel default behavior. The Angular generic components (grids, trees, timelines) have rich Before/After cancelable events, but the `@memberjunction/interactive-component-types` package has only declarative metadata with no runtime subscription layer. | Add an event bus to `ComponentObject` with `on`/`off`/`emit`, Before/After event pairs, and cancellation support. |
| **Agent-component dialog** | Agents cannot inspect a running component's data, and components cannot package their state for agent consumption. There's no bridge between the artifact system and live component state. | Add `GetCurrentStateSnapshot()` at the artifact viewer plugin level (works for ALL artifact types), with interactive components returning rich `DataArtifactSpec` snapshots. Enable agents to receive these as conversation context or persisted artifacts. |

### Key Design Decision: One Unified Type

Rather than inventing separate types for "component data snapshots" and "data artifacts," the **expanded `DataArtifactSpec` IS the universal data container**. A query builder produces it. A dashboard component produces it. A chart produces it. An LLM can reason over any of them because they share the same shape: named tables with typed columns, optional computations, optional visual state, and optional interpretation text.

### Dependencies Between Sub-Phases

```
Sub-Phase A: Unified DataArtifactSpec (types)
    ├──▶ Sub-Phase B: Component Event System (types + runtime)
    ├──▶ Sub-Phase C: Artifact-Level State Snapshots (base class method)
    ├──▶ Sub-Phase D: Data Artifact Viewer Multi-Table UX (Angular)
    └──▶ Sub-Phase F: Interactive Component Data Contract (React runtime)
              │
              ▼
         Sub-Phase E: Agent-Component Dialog Bridge (integration)
```

Sub-Phases A through D and F can be worked in parallel after A is complete. Sub-Phase E depends on C and F.

---

## 2. Architecture Overview

### Data Flow: Component → Snapshot → Agent

```
┌──────────────────────────────┐
│  Any Artifact Viewer Plugin  │
│  (Data, Component, JSON,     │
│   Code, Markdown, etc.)      │
│                              │
│  GetCurrentStateSnapshot()   │──────────────┐
└──────────────────────────────┘              │
                                              ▼
                                   ┌─────────────────────┐
                                   │  DataArtifactSpec    │
                                   │  (Unified JSON)      │
                                   │                     │
                                   │  tables[]           │
                                   │  computations[]     │
                                   │  visualState        │
                                   │  interpretation     │
                                   └────────┬────────────┘
                                            │
                              ┌─────────────┼─────────────┐
                              │             │             │
                         Ephemeral     Persistent    Direct to
                         (inject into  (save as      component
                          agent msg)   artifact      via invokeMethod)
                              │        version)      │
                              │             │        │
                              ▼             ▼        ▼
                         ┌────────────────────────────────┐
                         │  Agent receives structured     │
                         │  multi-table data with         │
                         │  computations, visual state,   │
                         │  and entity lineage            │
                         └────────────────────────────────┘
```

### Event Flow: Component → Consumer (with Cancellation)

```
┌─────────────────────────┐
│  Interactive Component  │
│  (React)                │
│                         │    emit('beforeFilterChange', args)
│  Internal event occurs  │──────────────────────────────────────┐
│                         │                                      │
└─────────────────────────┘                                      ▼
                                                    ┌────────────────────────┐
                                                    │  Consumer/Container    │
                                                    │                        │
                                                    │  args.cancel = true?   │
                                                    │  args.modifiedValue?   │
                                                    └────────────┬───────────┘
                                                                 │
                                              ┌──────────────────┼──────────────┐
                                              │ cancel=false     │ cancel=true  │
                                              ▼                  ▼              │
                                   Component proceeds    Component skips       │
                                   with default (or      default behavior      │
                                   modified) behavior                          │
                                              │                                │
                                              ▼                                │
                                   emit('afterFilterChange', result)           │
                                              │                                │
                                              ▼                                │
                                   Consumer receives                           │
                                   success/metrics                             │
```

---

## 3. Sub-Phase A: Unified DataArtifactSpec — Multi-Table Expansion

### 3.1 Overview

Expand `DataArtifactSpec` from a single-table format to a multi-table container while maintaining 100% backward compatibility. This type becomes the universal data exchange format between components, artifacts, and agents.

### 3.2 Current State

The `DataArtifactSpec` interface lives as a local interface in `data-artifact-viewer.component.ts` (lines 14-57). It supports one table:

```typescript
// Current — single table
interface DataArtifactSpec {
    source: 'query' | 'view';
    title?: string;
    columns?: DataArtifactColumn[];
    rows?: Record<string, unknown>[];
    metadata?: { sql?: string; rowCount?: number; executionTimeMs?: number };
    // ... query save tracking fields
}
```

### 3.3 Target State

Move the interface to `@memberjunction/interactive-component-types` so it's shared across the entire stack (React runtime, Angular viewers, agents, server). Expand with multi-table support:

#### 3.3.1 New File: `packages/InteractiveComponents/src/data-artifact-spec.ts`

```typescript
/**
 * A single named dataset within a data artifact.
 * Represents one logical table of data with its columns, rows, metadata, and source information.
 */
export interface DataTable {
    /**
     * Unique name for this table within the artifact.
     * Used as tab label in multi-table UX and as reference key for computations.
     * Examples: "customers", "monthly_revenue", "top_products"
     */
    name: string;

    /**
     * Human-readable description of what this table contains.
     * Useful for agent interpretation and UI tooltips.
     */
    description?: string;

    /**
     * How this table's data was sourced
     * - 'query': From a stored or ad-hoc SQL query
     * - 'view': From a MJ entity view (RunView)
     * - 'computed': Derived/aggregated from other data within the component
     */
    source?: 'query' | 'view' | 'computed';

    /**
     * Column definitions with type information and entity lineage.
     */
    columns: DataArtifactColumn[];

    /**
     * The actual row data.
     */
    rows: Record<string, unknown>[];

    /**
     * Source-specific metadata for this table.
     */
    metadata?: DataTableMetadata;
}

/**
 * Metadata about how a DataTable's data was produced.
 */
export interface DataTableMetadata {
    /** SQL that produced this data (if source is 'query') */
    sql?: string;

    /** MJ Entity name (if source is 'view') */
    entityName?: string;

    /** Extra WHERE filter applied (if source is 'view') */
    extraFilter?: string;

    /** Query ID in MJ (if from a stored query) */
    queryId?: string;

    /** Query parameters used */
    parameters?: Record<string, string | number | boolean>;

    /** Number of rows in this result set */
    rowCount?: number;

    /** Total rows available in the source (if paged, this is the full count) */
    totalAvailableRows?: number;

    /** Time to execute the query/view in milliseconds */
    executionTimeMs?: number;

    /** Description of how computed data was derived */
    computationDescription?: string;
}

/**
 * Column definition with data lineage tracking back to MJ entities.
 * Enables entity linking, type-aware formatting, and schema understanding.
 */
export interface DataArtifactColumn {
    /** Field name in the result set */
    field: string;

    /** Display header text (defaults to field name) */
    headerName?: string;

    /** Column width in pixels */
    width?: number;

    /** MJ entity name this column originates from (e.g., "Customers") */
    sourceEntity?: string;

    /** Field name in that entity (e.g., "ID", "FirstName") */
    sourceFieldName?: string;

    /** True for calculated expressions (CASE, ROUND, CONCAT, etc.) */
    isComputed?: boolean;

    /** True for aggregate functions (SUM, COUNT, AVG, etc.) */
    isSummary?: boolean;

    /**
     * SQL data type for formatting and alignment.
     * Examples: 'int', 'nvarchar', 'uniqueidentifier', 'datetime', 'decimal', 'bit', 'money'
     */
    sqlBaseType?: string;

    /** Human-readable description of this column */
    description?: string;
}

/**
 * A named computation/aggregation performed on the data.
 * Pre-computed insights that agents can consume without recalculating.
 */
export interface DataComputation {
    /** Display name: "Total Revenue", "Average Order Value", "Customer Count" */
    name: string;

    /** Type of aggregation performed */
    type: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'distinct_count' | 'custom';

    /** Source field name this computation operates on (if applicable) */
    field?: string;

    /** Which table this computation references (if multi-table) */
    table?: string;

    /** The computed value */
    value: number | string | boolean;

    /** Human-formatted display value: "$1,234,567.89", "+12.3%", "1,247 customers" */
    formattedValue?: string;

    /** Human/AI-readable explanation of what this computation represents */
    description?: string;
}

/**
 * Captures the current visual/interaction state of the component.
 * Tells an agent not just WHAT data exists, but what the user is LOOKING AT right now.
 */
export interface DataVisualState {
    /** Currently active filters applied by the user */
    activeFilters?: DataFilter[];

    /** Current sort state */
    sorting?: Array<{
        field: string;
        table?: string;
        direction: 'asc' | 'desc';
    }>;

    /** Currently selected rows */
    selectedRows?: Array<{
        table?: string;
        rowIndex: number;
        rowKey?: string;
        rowData?: Record<string, unknown>;
    }>;

    /** Drill-down breadcrumb path: ["All Regions", "West", "California"] */
    drillPath?: string[];

    /** Which tab/view/section is currently active */
    activeTab?: string;

    /** Current page number (1-based) */
    pageNumber?: number;

    /** Current page size */
    pageSize?: number;

    /** Search/filter text entered by user */
    searchText?: string;

    /** Any component-specific visual state not covered above */
    custom?: Record<string, unknown>;
}

/**
 * A single active filter applied to the data.
 */
export interface DataFilter {
    /** Field being filtered */
    field: string;

    /** Which table (if multi-table) */
    table?: string;

    /** Filter operator */
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn' | 'isNull' | 'isNotNull' | 'between' | 'custom';

    /** Filter value(s) */
    value: string | number | boolean | Array<string | number>;

    /** Human-readable description of this filter */
    displayText?: string;
}

/**
 * Unified data artifact specification.
 *
 * This is the universal data exchange format between components, artifact viewers, and agents.
 * It supports both single-table (backward compatible) and multi-table modes.
 *
 * **Backward Compatibility**: When `tables` is not present, the root-level `source`, `columns`,
 * `rows`, and `metadata` fields represent a single implicit table. Consumers should check for
 * `tables` first and fall back to root-level fields.
 *
 * **Usage Contexts**:
 * - Query Builder Agent: produces single-table specs with `metadata.sql` for live execution
 * - Dashboard Components: produce multi-table specs with computations and visual state
 * - Data Artifact Viewer: renders single or multi-table data in grids
 * - Agent Dialog: any artifact viewer can snapshot its state as a `DataArtifactSpec`
 */
export interface DataArtifactSpec {
    // ─── BACKWARD-COMPATIBLE SINGLE-TABLE FIELDS ───
    // These are used when `tables` is not present (legacy single-table mode).
    // When `tables` IS present, these root-level fields are ignored.

    /** Data source type (single-table mode only) */
    source?: 'query' | 'view';

    /** For query source: the query ID (single-table mode only) */
    queryId?: string;

    /** For query source: parameter values (single-table mode only) */
    parameters?: Record<string, string | number | boolean>;

    /** For view source: the entity name (single-table mode only) */
    entityName?: string;

    /** For view source: extra WHERE filter (single-table mode only) */
    extraFilter?: string;

    /** Column definitions (single-table mode only) */
    columns?: DataArtifactColumn[];

    /** Row data (single-table mode only) */
    rows?: Record<string, unknown>[];

    /** Query metadata (single-table mode only) */
    metadata?: DataTableMetadata;

    // ─── MULTI-TABLE FIELDS ───

    /**
     * Named datasets. When present, root-level `source`/`columns`/`rows`/`metadata` are ignored.
     * Single-table artifacts may omit this and use root-level fields instead.
     */
    tables?: DataTable[];

    // ─── SHARED FIELDS (apply in both modes) ───

    /** Display title for the artifact */
    title?: string;

    /**
     * Optional markdown plan, approach description, or explanatory content.
     * May include Mermaid diagrams. Shown in a "Plan" tab in the viewer.
     */
    plan?: string;

    /**
     * AI/human-readable interpretation of what this data shows.
     * Unlike `plan` (which describes how data was obtained), `interpretation`
     * describes what the data MEANS — patterns, insights, key takeaways.
     *
     * When an interactive component populates this, it provides the component's
     * own understanding of its data. An agent can use this as a starting point
     * for deeper analysis.
     */
    interpretation?: string;

    /**
     * Pre-computed aggregations and metrics.
     * Components that perform calculations (sums, averages, counts, custom KPIs)
     * expose them here so agents don't need to recalculate from raw rows.
     */
    computations?: DataComputation[];

    /**
     * Current visual/interaction state capturing what the user is looking at.
     * Includes active filters, sort state, selections, drill-down path, etc.
     */
    visualState?: DataVisualState;

    // ─── QUERY SAVE TRACKING (viewer-specific, preserved for compatibility) ───

    /** ID of saved query (set after user saves from artifact) */
    savedQueryId?: string;

    /** Name of saved query (for display) */
    savedQueryName?: string;

    /** Version number this query was saved/updated from */
    savedAtVersionNumber?: number;
}

// ─── HELPER FUNCTIONS ───

/**
 * Normalizes a DataArtifactSpec to always use the `tables` array format.
 * If the spec uses legacy single-table root-level fields, wraps them in a single DataTable.
 * If `tables` is already present, returns them as-is.
 *
 * @param spec The DataArtifactSpec to normalize
 * @param defaultTableName Name to use for the implicit table when converting from single-table format
 * @returns Array of DataTable objects (always at least one if spec has data)
 */
export function normalizeToTables(spec: DataArtifactSpec, defaultTableName: string = 'results'): DataTable[] {
    // Multi-table mode: tables array is authoritative
    if (spec.tables && spec.tables.length > 0) {
        return spec.tables;
    }

    // Single-table mode: wrap root-level fields
    if (spec.rows || spec.columns || spec.metadata?.sql) {
        return [{
            name: defaultTableName,
            source: spec.source,
            columns: spec.columns || [],
            rows: spec.rows || [],
            metadata: spec.metadata ? {
                sql: spec.metadata.sql,
                entityName: spec.entityName,
                extraFilter: spec.extraFilter,
                queryId: spec.queryId,
                parameters: spec.parameters,
                rowCount: spec.metadata.rowCount,
                executionTimeMs: spec.metadata.executionTimeMs
            } : undefined
        }];
    }

    return [];
}

/**
 * Checks whether a DataArtifactSpec uses multi-table format.
 */
export function isMultiTable(spec: DataArtifactSpec): boolean {
    return !!(spec.tables && spec.tables.length > 1);
}
```

### 3.4 Export from Package

Add to `packages/InteractiveComponents/src/index.ts`:
```typescript
export * from './data-artifact-spec';
```

### 3.5 Migration: Update Data Artifact Viewer Import

In `data-artifact-viewer.component.ts`:
- Remove local `DataArtifactSpec` and `DataArtifactColumn` interfaces
- Import from `@memberjunction/interactive-component-types`
- No behavior changes — the root-level fields are unchanged

### 3.6 Migration: Update Any Other Consumers

Search for any code that constructs `DataArtifactSpec` objects (Skip agent, query builder agent actions) and ensure they still work. Since all existing fields are preserved at root level, no changes should be needed.

### 3.7 Unit Tests

Add tests in `packages/InteractiveComponents/src/__tests__/data-artifact-spec.test.ts`:
- `normalizeToTables()` with single-table spec returns one table
- `normalizeToTables()` with multi-table spec returns tables array unchanged
- `normalizeToTables()` with empty spec returns empty array
- `isMultiTable()` returns correct boolean
- Backward compatibility: existing single-table spec shape is valid

---

## 4. Sub-Phase B: Component Event System with Cancellation

### 4.1 Overview

Add a runtime event subscription system to `ComponentObject` in `@memberjunction/interactive-component-types`. This enables consumers (Angular containers, agents, dashboards) to subscribe to component events and optionally cancel or modify default behavior.

The existing `ComponentEvent` metadata in `ComponentSpec` already declares what events a component emits. This sub-phase adds the **runtime layer** that makes those declarations actionable.

### 4.2 Design Principles

1. **Before/After pattern**: Mirrors the proven pattern from MJ's Angular generic components (grids, trees, timelines)
2. **Cancelable before events**: Before events carry a `cancel` flag; setting it to `true` prevents the default behavior
3. **Modifiable before events**: Before events can carry `modifiedValue` fields so consumers can intercept AND alter behavior without canceling
4. **Informational after events**: After events carry success/error/metrics — they cannot be canceled
5. **Framework-agnostic**: The types work in React, Angular, or vanilla JS contexts
6. **Typed event args**: Each event has a strongly-typed args interface, but the bus itself is generic to avoid requiring compile-time knowledge of all event types

### 4.3 New File: `packages/InteractiveComponents/src/component-events.ts`

```typescript
/**
 * Base interface for all component event arguments.
 * Every event carries a timestamp and optional source reference.
 */
export interface BaseEventArgs {
    /** When the event occurred */
    timestamp: Date;

    /** Optional reference to the component that raised the event */
    sourceComponentName?: string;
}

/**
 * Base interface for Before events that support cancellation.
 * Consumers can set `cancel = true` to prevent the default behavior.
 */
export interface CancelableEventArgs extends BaseEventArgs {
    /**
     * Set to true to prevent the component from executing its default behavior.
     * Only meaningful for "before" events.
     */
    cancel: boolean;

    /**
     * Optional reason for cancellation (for debugging/logging).
     */
    cancelReason?: string;
}

/**
 * Base interface for After events that report on completed operations.
 * These are informational only — they cannot be canceled.
 */
export interface AfterEventArgs extends BaseEventArgs {
    /** Whether the operation succeeded */
    success: boolean;

    /** Error message if the operation failed */
    errorMessage?: string;

    /** Duration of the operation in milliseconds */
    durationMs?: number;
}

// ─── COMMON BEFORE EVENT ARGS ───

/**
 * Before a data load/refresh operation.
 * Consumer can cancel or modify the load parameters.
 */
export interface BeforeDataLoadEventArgs extends CancelableEventArgs {
    /** The parameters that will be used for loading */
    loadParams: Record<string, unknown>;

    /**
     * Set this to override the load parameters.
     * If set, the component uses these instead of `loadParams`.
     */
    modifiedLoadParams?: Record<string, unknown>;
}

/**
 * After data finishes loading.
 */
export interface AfterDataLoadEventArgs extends AfterEventArgs {
    /** Number of rows/records loaded */
    recordCount: number;

    /** Total available records (if paged) */
    totalAvailableRecords?: number;

    /** Which table(s) were loaded */
    tableNames?: string[];
}

/**
 * Before a filter is applied.
 */
export interface BeforeFilterChangeEventArgs extends CancelableEventArgs {
    /** The filter being applied */
    filter: {
        field: string;
        operator: string;
        value: unknown;
    };

    /** Previous filter state */
    previousFilters: Array<{ field: string; operator: string; value: unknown }>;

    /** Set this to apply a different filter instead */
    modifiedFilter?: {
        field: string;
        operator: string;
        value: unknown;
    };
}

/**
 * After a filter is applied.
 */
export interface AfterFilterChangeEventArgs extends AfterEventArgs {
    /** The filter that was applied */
    filter: { field: string; operator: string; value: unknown };

    /** Resulting record count after filtering */
    resultingRecordCount: number;
}

/**
 * Before a row/item is selected.
 */
export interface BeforeSelectionChangeEventArgs extends CancelableEventArgs {
    /** Rows/items being selected */
    selectedItems: Array<{ rowIndex: number; rowKey?: string; rowData?: Record<string, unknown> }>;

    /** Whether this is additive (Ctrl+click) or replacing */
    isAdditive: boolean;

    /** Current selection before this change */
    currentSelection: Array<{ rowIndex: number; rowKey?: string }>;
}

/**
 * After selection changes.
 */
export interface AfterSelectionChangeEventArgs extends AfterEventArgs {
    /** New selection state */
    newSelection: Array<{ rowIndex: number; rowKey?: string; rowData?: Record<string, unknown> }>;

    /** Previous selection state */
    previousSelection: Array<{ rowIndex: number; rowKey?: string }>;
}

/**
 * Before a row/item click is processed.
 */
export interface BeforeItemClickEventArgs extends CancelableEventArgs {
    /** The clicked item's data */
    item: Record<string, unknown>;

    /** Row/item index */
    itemIndex: number;

    /** Which column was clicked (if applicable) */
    column?: string;

    /** The original DOM event */
    domEvent?: { clientX: number; clientY: number; button: number };
}

/**
 * After a row/item click.
 */
export interface AfterItemClickEventArgs extends AfterEventArgs {
    /** The clicked item's data */
    item: Record<string, unknown>;

    /** Row/item index */
    itemIndex: number;

    /** Which column was clicked (if applicable) */
    column?: string;
}

/**
 * Before a drill-down navigation.
 */
export interface BeforeDrillDownEventArgs extends CancelableEventArgs {
    /** Current drill path before this navigation */
    currentPath: string[];

    /** The segment being drilled into */
    target: string;

    /** The full new path that would result */
    newPath: string[];
}

/**
 * After a drill-down navigation.
 */
export interface AfterDrillDownEventArgs extends AfterEventArgs {
    /** The new drill path after navigation */
    newPath: string[];

    /** The previous path */
    previousPath: string[];

    /** Number of records in the drilled-down view */
    resultingRecordCount?: number;
}

/**
 * Emitted when the component's data state changes significantly.
 * Not cancelable — this is a notification that the snapshot has changed.
 */
export interface DataStateChangedEventArgs extends BaseEventArgs {
    /** What triggered the change */
    reason: 'dataLoad' | 'filter' | 'sort' | 'selection' | 'drillDown' | 'refresh' | 'userAction' | 'external';

    /** Brief description of what changed */
    changeDescription?: string;

    /** Whether a new snapshot should be captured */
    snapshotRecommended: boolean;
}

// ─── EVENT BUS TYPES ───

/**
 * Function signature for event handlers.
 */
export type EventHandler<T extends BaseEventArgs = BaseEventArgs> = (args: T) => void;

/**
 * Function to unsubscribe from an event.
 */
export type Unsubscribe = () => void;

/**
 * Well-known event names that components can emit.
 * Components may also emit custom events not listed here.
 */
export type StandardEventName =
    | 'beforeDataLoad' | 'afterDataLoad'
    | 'beforeFilterChange' | 'afterFilterChange'
    | 'beforeSelectionChange' | 'afterSelectionChange'
    | 'beforeItemClick' | 'afterItemClick'
    | 'beforeDrillDown' | 'afterDrillDown'
    | 'dataStateChanged';

/**
 * Maps standard event names to their argument types.
 * Used for type-safe event subscription when the event name is known at compile time.
 */
export interface StandardEventMap {
    beforeDataLoad: BeforeDataLoadEventArgs;
    afterDataLoad: AfterDataLoadEventArgs;
    beforeFilterChange: BeforeFilterChangeEventArgs;
    afterFilterChange: AfterFilterChangeEventArgs;
    beforeSelectionChange: BeforeSelectionChangeEventArgs;
    afterSelectionChange: AfterSelectionChangeEventArgs;
    beforeItemClick: BeforeItemClickEventArgs;
    afterItemClick: AfterItemClickEventArgs;
    beforeDrillDown: BeforeDrillDownEventArgs;
    afterDrillDown: AfterDrillDownEventArgs;
    dataStateChanged: DataStateChangedEventArgs;
}

/**
 * The event bus interface exposed on ComponentObject.
 * Provides subscribe/unsubscribe/emit capabilities.
 */
export interface ComponentEventBus {
    /**
     * Subscribe to a named event.
     * Returns an unsubscribe function.
     *
     * @example
     * const unsub = events.on('beforeFilterChange', (args) => {
     *     if (args.filter.field === 'status') {
     *         args.cancel = true; // Prevent filtering on status
     *     }
     * });
     * // Later: unsub();
     */
    on<K extends keyof StandardEventMap>(event: K, handler: EventHandler<StandardEventMap[K]>): Unsubscribe;
    on(event: string, handler: EventHandler): Unsubscribe;

    /**
     * Unsubscribe a specific handler from an event.
     */
    off(event: string, handler: EventHandler): void;

    /**
     * Emit an event. Returns the event args after all handlers have processed it.
     * For cancelable events, check args.cancel after calling emit.
     */
    emit<K extends keyof StandardEventMap>(event: K, args: StandardEventMap[K]): StandardEventMap[K];
    emit(event: string, args: BaseEventArgs): BaseEventArgs;
}
```

### 4.4 Update ComponentObject

In `packages/InteractiveComponents/src/runtime-types.ts`, add to the `ComponentObject` interface:

```typescript
/**
 * Event bus for subscribing to component events.
 * Consumers can listen for before/after events, cancel default behavior,
 * and receive notifications of state changes.
 *
 * If the component does not support events, this will be undefined.
 */
events?: ComponentEventBus;
```

### 4.5 Default EventBus Implementation

Add a simple default implementation in `packages/InteractiveComponents/src/component-event-bus.ts`:

```typescript
/**
 * Default implementation of ComponentEventBus.
 * Components can use this directly or implement their own.
 */
export class DefaultComponentEventBus implements ComponentEventBus {
    private handlers: Map<string, Set<EventHandler>> = new Map();

    on(event: string, handler: EventHandler): Unsubscribe {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);

        return () => this.off(event, handler);
    }

    off(event: string, handler: EventHandler): void {
        this.handlers.get(event)?.delete(handler);
    }

    emit(event: string, args: BaseEventArgs): BaseEventArgs {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            for (const handler of eventHandlers) {
                handler(args);
                // If a cancelable event was canceled, stop processing
                if ('cancel' in args && (args as CancelableEventArgs).cancel) {
                    break;
                }
            }
        }
        return args;
    }
}
```

### 4.6 Update ComponentSpec Events Metadata

The existing `ComponentEvent` interface in `component-props-events.ts` should be enhanced to declare whether an event is cancelable and what its args shape is:

```typescript
export interface ComponentEvent {
    name: string;
    description: string;
    parameters?: ComponentEventParameter[];

    /** Whether this is a cancelable "before" event */
    cancelable?: boolean;

    /** The paired "after" event name (if this is a "before" event) */
    pairedEvent?: string;
}
```

### 4.7 Export from Package

Add to `packages/InteractiveComponents/src/index.ts`:
```typescript
export * from './component-events';
export * from './component-event-bus';
```

### 4.8 Unit Tests

Add tests in `packages/InteractiveComponents/src/__tests__/component-events.test.ts`:
- `DefaultComponentEventBus.on()` registers handler and fires on emit
- `DefaultComponentEventBus.off()` removes handler
- Unsubscribe function from `on()` works
- Cancelable events: setting `cancel = true` stops further handlers
- Non-cancelable events: all handlers fire regardless
- Multiple handlers on same event fire in order
- Emitting unknown event (no handlers) returns args unchanged

---

## 5. Sub-Phase C: Artifact-Level State Snapshots

### 5.1 Overview

Add a `GetCurrentStateSnapshot()` method to `BaseArtifactViewerPluginComponent` that ALL artifact viewer plugins inherit. This creates a universal mechanism for extracting structured state from any artifact type — not just interactive components.

### 5.2 Design

Every artifact type returns JSON that an LLM can reason over:

| Artifact Type | What `GetCurrentStateSnapshot()` Returns |
|---|---|
| **Data** | Full `DataArtifactSpec` with live grid data, current page, column configs |
| **Component** | Rich `DataArtifactSpec` from `componentObject.getCurrentDataState()` with tables, computations, visual state |
| **JSON** | The parsed JSON content as-is |
| **Code** | `{ language, content, lineCount }` |
| **Markdown** | `{ content, wordCount, headings }` |
| **HTML** | `{ content }` |
| **SVG** | `{ content }` (SVG source) |

The key insight: **the Data and Component viewers return `DataArtifactSpec`** (the unified multi-table type). All other viewers return plain JSON objects. An LLM can reason over any of them, but the structured `DataArtifactSpec` format gives it much richer context.

### 5.3 Changes to BaseArtifactViewerPluginComponent

In `packages/Angular/Generic/artifacts/src/lib/components/base-artifact-viewer.component.ts`:

```typescript
import { DataArtifactSpec } from '@memberjunction/interactive-component-types';

export abstract class BaseArtifactViewerPluginComponent implements IArtifactViewerComponent {
    // ... existing code ...

    /**
     * Returns a point-in-time snapshot of this artifact's current state as JSON.
     *
     * Override in subclasses to provide richer, type-specific snapshots.
     * For example:
     * - Data viewer returns DataArtifactSpec with live grid data and visual state
     * - Component viewer returns DataArtifactSpec from the running React component
     * - JSON viewer returns the parsed JSON content
     *
     * The snapshot can be:
     * - Passed directly to an agent as conversation context (ephemeral)
     * - Saved as an artifact version for persistence (persistent)
     * - Used for comparison or audit purposes
     *
     * @returns A JSON-serializable object representing current state, or null if unavailable
     */
    public GetCurrentStateSnapshot(): DataArtifactSpec | Record<string, unknown> | null {
        // Default: return the parsed content as-is
        const content = this.parseJsonContent();
        if (content) {
            return content as Record<string, unknown>;
        }
        // For non-JSON content, return a simple wrapper
        const rawContent = this.getContent();
        if (rawContent) {
            return {
                contentType: 'text',
                content: rawContent,
                artifactName: this.getDisplayName(),
                snapshotTimestamp: new Date().toISOString()
            };
        }
        return null;
    }
}
```

### 5.4 Data Artifact Viewer Override

In `data-artifact-viewer.component.ts`:

```typescript
/**
 * Returns a DataArtifactSpec snapshot including live grid data,
 * current page state, and query sync state.
 */
public override GetCurrentStateSnapshot(): DataArtifactSpec | null {
    if (!this.spec) return null;

    return {
        ...this.spec,
        // Override rows with current live data if available
        ...(this.IsLive ? { rows: this.GridData } : {}),
        // Add visual state
        visualState: {
            pageNumber: this.PagerPageNumber,
            pageSize: this.PagerPageSize,
            // Future: extract sort/filter state from grid component
        },
        // Update metadata with live execution info
        metadata: {
            ...this.spec.metadata,
            ...(this.liveRowCount != null ? { rowCount: this.liveRowCount } : {}),
            ...(this.liveExecutionTime != null ? { executionTimeMs: this.liveExecutionTime } : {}),
            ...(this.PagerTotalRowCount > 0 ? { totalAvailableRows: this.PagerTotalRowCount } : {})
        }
    };
}
```

### 5.5 Component Artifact Viewer Override

In `component-artifact-viewer.component.ts`:

```typescript
/**
 * Returns a DataArtifactSpec from the running React component.
 * Falls back to the component spec metadata if the component
 * doesn't implement getCurrentDataState().
 */
public override GetCurrentStateSnapshot(): DataArtifactSpec | Record<string, unknown> | null {
    // Try to get structured data from the running React component
    const reactState = this.reactComponent?.componentObject?.getCurrentDataState?.();
    if (reactState) {
        return reactState as DataArtifactSpec;
    }

    // Fall back to component spec as metadata
    const spec = this.resolvedComponentSpec;
    if (spec) {
        return {
            title: spec.title || spec.name,
            interpretation: spec.description,
            tables: [],  // No live data available
            computations: [],
            visualState: undefined
        };
    }

    return null;
}
```

### 5.6 JSON Artifact Viewer Override

```typescript
public override GetCurrentStateSnapshot(): Record<string, unknown> | null {
    return this.parseJsonContent<Record<string, unknown>>();
}
```

### 5.7 Code Artifact Viewer Override

```typescript
public override GetCurrentStateSnapshot(): Record<string, unknown> | null {
    const content = this.getContent();
    if (!content) return null;
    return {
        language: this.detectedLanguage || 'unknown',
        content: content,
        lineCount: content.split('\n').length,
        artifactName: this.getDisplayName(),
        snapshotTimestamp: new Date().toISOString()
    };
}
```

### 5.8 Exposing Snapshot to Parent (Artifact Viewer Panel)

The `ArtifactViewerPanelComponent` hosts the plugin. It should expose the snapshot capability to its consumers:

```typescript
// In artifact-viewer-panel.component.ts
/**
 * Get a point-in-time snapshot of the currently displayed artifact's state.
 * Delegates to the active plugin's GetCurrentStateSnapshot().
 *
 * @returns JSON-serializable snapshot, or null if no plugin is active
 */
public GetCurrentStateSnapshot(): DataArtifactSpec | Record<string, unknown> | null {
    return this.activePlugin?.GetCurrentStateSnapshot() ?? null;
}
```

This means any parent component (conversations panel, dashboard, explorer tab) can call `viewerPanel.GetCurrentStateSnapshot()` to capture the current state and pass it to an agent.

---

## 6. Sub-Phase D: Data Artifact Viewer Multi-Table UX

### 6.1 Overview

Update the `DataArtifactViewerComponent` to render multi-table artifacts with a tabbed interface. When a `DataArtifactSpec` contains a single table (or uses legacy root-level fields), the viewer behaves exactly as it does today — no tabs, just the grid. When multiple tables are present, each table gets its own tab labeled with the table name.

### 6.2 UX Design

#### Single Table (No Change)

When `tables` has 0-1 entries or legacy root-level fields are used:

```
┌─────────────────────────────────────────────────────┐
│ 📊 Data Results        Live  1,247 rows  145ms      │
│                                          [Refresh]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────┬──────────────┬──────────┬───────────────┐ │
│  │ ID   │ Customer     │ Revenue  │ Region        │ │
│  ├──────┼──────────────┼──────────┼───────────────┤ │
│  │ 001  │ Acme Corp    │ $45,000  │ West          │ │
│  │ 002  │ Globex Inc   │ $38,000  │ East          │ │
│  │ ...  │ ...          │ ...      │ ...           │ │
│  └──────┴──────────────┴──────────┴───────────────┘ │
│                                                     │
│  Page 1 of 13  [< 1 2 3 ... 13 >]                  │
└─────────────────────────────────────────────────────┘
```

Identical to current behavior. No regression.

#### Multiple Tables

When `tables` has 2+ entries, a horizontal tab strip appears between the toolbar and grid:

```
┌─────────────────────────────────────────────────────┐
│ 📊 Sales Dashboard Q4   Live                        │
│                                          [Refresh]  │
├─────────────────────────────────────────────────────┤
│  ┌──────────────┬─────────────────┬────────────────┐│
│  │▸ Customers   │  Revenue by Mo  │  Top Products  ││
│  │  (847 rows)  │  (12 rows)      │  (25 rows)     ││
│  └──────────────┴─────────────────┴────────────────┘│
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────┬──────────────┬──────────┬───────────────┐ │
│  │ ID   │ Customer     │ Revenue  │ Region        │ │
│  ├──────┼──────────────┼──────────┼───────────────┤ │
│  │ 001  │ Acme Corp    │ $45,000  │ West          │ │
│  │ ...  │ ...          │ ...      │ ...           │ │
│  └──────┴──────────────┴──────────┴───────────────┘ │
│                                                     │
│  Page 1 of 9  [< 1 2 3 ... 9 >]                    │
└─────────────────────────────────────────────────────┘
```

**Tab strip details:**
- Each tab shows the table `name` and row count
- Active tab is visually highlighted (using `--mj-brand-primary`)
- Tabs use `--mj-bg-surface-card` background with `--mj-border-default` borders
- Switching tabs re-renders the grid with the selected table's data and column configs
- Each table maintains its own paging state independently
- The toolbar row count and execution time update to reflect the active table
- If a table has a `description`, it appears as a tooltip on the tab

### 6.3 Component Changes

#### 6.3.1 New Properties

```typescript
// In DataArtifactViewerComponent

/** All resolved tables (from multi-table or wrapped single-table) */
public ResolvedTables: DataTable[] = [];

/** Index of the currently active table tab */
public ActiveTableIndex = 0;

/** Per-table paging state */
private tablePageState: Map<number, { pageNumber: number; pageSize: number; totalRowCount: number }> = new Map();

/** Per-table live data cache */
private tableDataCache: Map<number, Record<string, unknown>[]> = new Map();

/** Per-table column configs cache */
private tableColumnConfigsCache: Map<number, QueryGridColumnConfig[]> = new Map();

/** Whether we're in multi-table mode */
public get IsMultiTable(): boolean {
    return this.ResolvedTables.length > 1;
}

/** The currently active table */
public get ActiveTable(): DataTable | null {
    return this.ResolvedTables[this.ActiveTableIndex] ?? null;
}
```

#### 6.3.2 Initialization Changes

In `ngOnInit()`, use `normalizeToTables()` to resolve all tables:

```typescript
import { normalizeToTables, isMultiTable } from '@memberjunction/interactive-component-types';

async ngOnInit(): Promise<void> {
    this.spec = this.parseJsonContent<DataArtifactSpec>();
    if (!this.spec) { /* error handling */ return; }

    // Resolve to tables array (handles both single and multi-table)
    this.ResolvedTables = normalizeToTables(this.spec, this.spec.title || 'Results');

    if (this.ResolvedTables.length === 0) {
        // Plan-only or empty — existing behavior
        return;
    }

    // Build column configs for the first (or only) table
    this.GridColumnConfigs = this.BuildColumnConfigsForTable(this.ResolvedTables[0]);

    // Initialize paging state for all tables
    for (let i = 0; i < this.ResolvedTables.length; i++) {
        this.tablePageState.set(i, { pageNumber: 1, pageSize: 100, totalRowCount: 0 });
    }

    // Load data for the active table
    this.IsLoading = true;
    await this.LoadTableData(0);

    // ... existing query sync state init ...
}
```

#### 6.3.3 Tab Switching

```typescript
/**
 * Switch to a different table tab.
 * Loads data if not already cached, updates grid.
 */
public async OnTableTabClick(index: number): Promise<void> {
    if (index === this.ActiveTableIndex) return;
    this.ActiveTableIndex = index;

    const table = this.ResolvedTables[index];
    if (!table) return;

    // Use cached column configs or build new
    if (!this.tableColumnConfigsCache.has(index)) {
        this.tableColumnConfigsCache.set(index, this.BuildColumnConfigsForTable(table));
    }
    this.GridColumnConfigs = this.tableColumnConfigsCache.get(index)!;

    // Use cached data or load fresh
    if (this.tableDataCache.has(index)) {
        this.GridData = this.tableDataCache.get(index)!;
        const pageState = this.tablePageState.get(index)!;
        this.PagerPageNumber = pageState.pageNumber;
        this.PagerPageSize = pageState.pageSize;
        this.PagerTotalRowCount = pageState.totalRowCount;
    } else {
        await this.LoadTableData(index);
    }

    this.cdr.detectChanges();
}
```

#### 6.3.4 Per-Table Data Loading

```typescript
/**
 * Load data for a specific table.
 * Handles live SQL execution, inline rows, and caching.
 */
private async LoadTableData(tableIndex: number): Promise<void> {
    const table = this.ResolvedTables[tableIndex];
    if (!table) return;

    this.IsLoading = true;
    this.HasError = false;
    this.cdr.detectChanges();

    try {
        if (table.metadata?.sql) {
            // Live execution
            const pageState = this.tablePageState.get(tableIndex)!;
            const rq = new RunQuery();
            const result = await rq.RunQuery({
                SQL: table.metadata.sql,
                StartRow: (pageState.pageNumber - 1) * pageState.pageSize,
                MaxRows: pageState.pageSize
            });

            if (result.Success) {
                this.tableDataCache.set(tableIndex, result.Results);
                this.GridData = result.Results;
                this.IsLive = true;

                // Update page state
                pageState.totalRowCount = result.TotalRowCount ?? result.RowCount ?? 0;
                this.PagerTotalRowCount = pageState.totalRowCount;
                this.PagerPageNumber = pageState.pageNumber;
                this.PagerPageSize = pageState.pageSize;

                // Update live metadata
                this.liveRowCount = result.RowCount;
                this.liveExecutionTime = result.ExecutionTime;
            } else {
                this.HandleTableError(tableIndex, result.ErrorMessage || 'Query failed');
            }
        } else if (table.rows && table.rows.length > 0) {
            // Inline data
            this.tableDataCache.set(tableIndex, table.rows);
            this.GridData = table.rows;
            this.liveRowCount = table.rows.length;
        } else {
            this.GridData = [];
        }
    } catch (error) {
        this.HandleTableError(tableIndex, error instanceof Error ? error.message : 'Load failed');
    } finally {
        this.IsLoading = false;
        this.cdr.detectChanges();
    }
}
```

#### 6.3.5 Column Config Builder Refactor

Rename `BuildColumnConfigs()` → `BuildColumnConfigsForTable(table: DataTable)`:

```typescript
/**
 * Build QueryGridColumnConfig[] for a specific table's columns.
 */
private BuildColumnConfigsForTable(table: DataTable): QueryGridColumnConfig[] {
    if (!table.columns || table.columns.length === 0) {
        // Auto-generate from first row keys (existing fallback behavior)
        if (table.rows && table.rows.length > 0) {
            return Object.keys(table.rows[0]).map((key, idx) => ({
                field: key,
                title: key,
                visible: true,
                sortable: true,
                resizable: true,
                reorderable: true,
                sqlBaseType: 'nvarchar',
                sqlFullType: 'nvarchar(max)',
                order: idx,
                isEntityLink: false
            }));
        }
        return [];
    }

    // Build from column metadata (existing logic, parameterized for table)
    return table.columns.map((col, idx) => {
        const config = resolveTargetEntity(col, idx);
        return config;
    });
}
```

### 6.4 Template Changes

In `data-artifact-viewer.component.html`, add the tab strip between toolbar and grid:

```html
<!-- Multi-table tab strip -->
@if (IsMultiTable) {
  <div class="table-tabs">
    @for (table of ResolvedTables; track table.name; let i = $index) {
      <button
        class="table-tab"
        [class.active]="i === ActiveTableIndex"
        [title]="table.description || table.name"
        (click)="OnTableTabClick(i)">
        <span class="table-tab-name">{{ table.name }}</span>
        @if (table.metadata?.rowCount != null || table.rows?.length) {
          <span class="table-tab-count">
            ({{ table.metadata?.rowCount ?? table.rows?.length }} rows)
          </span>
        }
      </button>
    }
  </div>
}
```

### 6.5 Styles

In `data-artifact-viewer.component.css`, add table tab styles:

```css
.table-tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--mj-border-default);
    padding: 0 var(--mj-spacing-md, 16px);
    background: var(--mj-bg-surface);
    overflow-x: auto;
}

.table-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--mj-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: color 150ms ease, border-color 150ms ease;
    white-space: nowrap;
}

.table-tab:hover {
    color: var(--mj-text-primary);
    background: var(--mj-bg-surface-hover);
}

.table-tab.active {
    color: var(--mj-brand-primary);
    border-bottom-color: var(--mj-brand-primary);
}

.table-tab-name {
    text-transform: capitalize;
}

.table-tab-count {
    color: var(--mj-text-muted);
    font-weight: 400;
    font-size: 12px;
}

.table-tab.active .table-tab-count {
    color: var(--mj-brand-primary);
    opacity: 0.7;
}
```

### 6.6 Toolbar Updates for Multi-Table

When in multi-table mode, the toolbar should show the active table's info:

```typescript
/** Display title — in multi-table mode, show active table name */
public get DisplayTitle(): string {
    if (this.IsMultiTable && this.ActiveTable) {
        return this.spec?.title || 'Data Results';
    }
    return this.spec?.title || 'Data Results';
}

/** Row count for the active table */
public override get DisplayRowCount(): number | null {
    if (this.IsMultiTable) {
        const pageState = this.tablePageState.get(this.ActiveTableIndex);
        return pageState?.totalRowCount || this.ActiveTable?.metadata?.rowCount || null;
    }
    return this.liveRowCount ?? this.spec?.metadata?.rowCount ?? null;
}
```

### 6.7 Page Change Per Table

```typescript
public async OnPageChange(event: PageChangeEvent): Promise<void> {
    const pageState = this.tablePageState.get(this.ActiveTableIndex);
    if (!pageState) return;

    pageState.pageNumber = event.PageNumber;
    pageState.pageSize = event.PageSize;

    // Clear cache for this table so it reloads
    this.tableDataCache.delete(this.ActiveTableIndex);

    await this.LoadTableData(this.ActiveTableIndex);
}
```

### 6.8 Computations Display

When `spec.computations` is present, show a summary bar above or below the grid:

```html
<!-- Computations summary bar -->
@if (spec?.computations?.length) {
  <div class="computations-bar">
    @for (comp of spec.computations; track comp.name) {
      @if (!IsMultiTable || !comp.table || comp.table === ActiveTable?.name) {
        <div class="computation-chip" [title]="comp.description || comp.name">
          <span class="computation-label">{{ comp.name }}</span>
          <span class="computation-value">{{ comp.formattedValue || comp.value }}</span>
        </div>
      }
    }
  </div>
}
```

```css
.computations-bar {
    display: flex;
    gap: 12px;
    padding: 8px 16px;
    background: var(--mj-bg-surface-card);
    border-bottom: 1px solid var(--mj-border-subtle);
    overflow-x: auto;
    flex-wrap: wrap;
}

.computation-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--mj-bg-surface);
    border: 1px solid var(--mj-border-default);
    border-radius: 16px;
    font-size: 13px;
    white-space: nowrap;
}

.computation-label {
    color: var(--mj-text-secondary);
    font-weight: 400;
}

.computation-value {
    color: var(--mj-text-primary);
    font-weight: 600;
}
```

### 6.9 Interpretation Tab

When `spec.interpretation` is present, add it as an additional tab (via `GetAdditionalTabs`):

```typescript
public override GetAdditionalTabs(): ArtifactViewerTab[] {
    const tabs: ArtifactViewerTab[] = [];

    // Existing: Plan tab
    if (this.spec?.plan) {
        tabs.push({
            label: 'Plan',
            icon: 'fa-diagram-project',
            contentType: 'markdown',
            content: () => this.spec!.plan!
        });
    }

    // Existing: SQL tab
    if (this.spec?.metadata?.sql) {
        tabs.push({
            label: 'SQL',
            icon: 'fa-code',
            contentType: 'code',
            content: () => this.spec!.metadata!.sql!,
            language: 'sql'
        });
    }

    // NEW: Interpretation tab
    if (this.spec?.interpretation) {
        tabs.push({
            label: 'Interpretation',
            icon: 'fa-lightbulb',
            contentType: 'markdown',
            content: () => this.spec!.interpretation!
        });
    }

    return tabs;
}
```

### 6.10 Multi-Table SQL Tabs

When in multi-table mode and multiple tables have SQL, the SQL tab should show all of them or provide its own sub-tabs. Simplest approach: concatenate with headers:

```typescript
// In GetAdditionalTabs, replace single SQL tab with multi-table aware version
if (this.IsMultiTable) {
    const sqlTables = this.ResolvedTables.filter(t => t.metadata?.sql);
    if (sqlTables.length > 0) {
        tabs.push({
            label: 'SQL',
            icon: 'fa-code',
            contentType: 'code',
            content: () => sqlTables.map(t =>
                `-- ═══ ${t.name} ═══\n${t.metadata!.sql!}`
            ).join('\n\n'),
            language: 'sql'
        });
    }
} else if (this.spec?.metadata?.sql) {
    tabs.push({
        label: 'SQL',
        icon: 'fa-code',
        contentType: 'code',
        content: () => this.spec!.metadata!.sql!,
        language: 'sql'
    });
}
```

---

## 7. Sub-Phase E: Agent-Component Dialog Bridge

### 7.1 Overview

Enable agents to consume component data snapshots and interact with running components. This sub-phase connects the snapshot mechanism (Sub-Phase C) to the agent conversation system and the event system (Sub-Phase B) to agent-driven component interaction.

### 7.2 Interaction Modes

#### Mode A: Snapshot Handoff (Ephemeral)

The simplest mode — UI captures a snapshot and injects it into the agent conversation as structured context. No new infrastructure needed beyond what Sub-Phases A and C provide.

**Flow:**
1. User clicks "Analyze" or asks agent "what patterns do you see?" while viewing an artifact
2. UI calls `viewerPanel.GetCurrentStateSnapshot()` → gets `DataArtifactSpec` JSON
3. UI constructs a conversation message with the snapshot embedded:
   ```
   The user is viewing a data artifact. Here is its current state:

   ```json
   { "title": "...", "tables": [...], "computations": [...], ... }
   ```

   The user asks: "what patterns do you see?"
   ```
4. Agent processes the structured data and responds with insights
5. No persistent record — snapshot lives only in the conversation turn

**Implementation:**
- Add an "Analyze" button/action to `ArtifactViewerPanelComponent`'s toolbar
- Button calls `GetCurrentStateSnapshot()`, formats as markdown code block, and sends to conversation
- The conversation component handles routing to the active agent

```typescript
// In ArtifactViewerPanelComponent or a parent wrapper
public OnAnalyzeWithAgent(): void {
    const snapshot = this.GetCurrentStateSnapshot();
    if (!snapshot) {
        // Notify user: nothing to analyze
        return;
    }

    const snapshotJson = JSON.stringify(snapshot, null, 2);
    const contextMessage = [
        'The user is viewing a data artifact with the following current state:',
        '',
        '```json',
        snapshotJson,
        '```',
        '',
        'Please analyze this data and provide insights.'
    ].join('\n');

    this.analyzeRequested.emit({
        snapshot: snapshot,
        contextMessage: contextMessage
    });
}
```

#### Mode B: Artifact-Mediated (Persistent)

The snapshot is saved as an artifact version, linked to the conversation, and passed to the agent as a formal artifact input.

**Flow:**
1. User triggers "Save Snapshot" or "Analyze (persistent)"
2. UI calls `GetCurrentStateSnapshot()` → gets `DataArtifactSpec`
3. UI creates a new `MJ: Artifact Version` with:
   - `ArtifactID`: existing artifact or new "Snapshot" artifact
   - `Content`: JSON.stringify(snapshot)
   - `ContentHash`: SHA-256 of content
4. UI creates `MJ: Conversation Detail Artifact` with:
   - `ConversationDetailID`: the message where analysis was requested
   - `ArtifactVersionID`: the new version
   - `Direction: 'Input'`
5. Agent receives the artifact as part of conversation context
6. Agent's response can reference the artifact by ID

**New Artifact Type:**

Create a new artifact type for snapshots:

```json
{
    "fields": {
        "Name": "Data Snapshot",
        "Description": "Point-in-time snapshot of a component or artifact's data state. Contains structured multi-table data with computations, visual state, and optional interpretation. Used for agent analysis and historical comparison.",
        "ContentType": "application/vnd.mj.data-snapshot",
        "DriverClass": "DataArtifactViewerPlugin",
        "Icon": "fa-solid fa-camera"
    }
}
```

Note: This reuses the `DataArtifactViewerPlugin` driver class since the content format is `DataArtifactSpec` — the same viewer handles both data artifacts and data snapshots.

#### Mode C: Live Dialog (Future)

Agent subscribes to component events and can invoke methods in real-time. This requires the event system from Sub-Phase B plus a WebSocket/streaming channel between agent and component.

**Not implemented in this plan** — documented here as a future direction. Prerequisites:
- Sub-Phase B (event system) must be complete
- Agent framework must support long-running subscriptions
- WebSocket channel between agent and UI must exist

### 7.3 Agent Data Context Format

When a snapshot is passed to an agent (either ephemeral or as artifact), the agent needs to understand the format. Define a standard prompt template that agents can use:

```typescript
/**
 * Formats a DataArtifactSpec snapshot as agent-friendly context.
 * Produces a concise summary followed by the full JSON.
 */
export function formatSnapshotForAgent(snapshot: DataArtifactSpec): string {
    const tables = normalizeToTables(snapshot);
    const parts: string[] = [];

    // Header
    parts.push(`## Data Snapshot: ${snapshot.title || 'Untitled'}`);
    parts.push('');

    // Table summary
    if (tables.length > 0) {
        parts.push(`**Tables:** ${tables.length}`);
        for (const table of tables) {
            const rowCount = table.metadata?.rowCount ?? table.rows?.length ?? 0;
            const colCount = table.columns?.length ?? 0;
            parts.push(`- **${table.name}**: ${rowCount} rows, ${colCount} columns`);
            if (table.description) {
                parts.push(`  ${table.description}`);
            }
        }
        parts.push('');
    }

    // Computations summary
    if (snapshot.computations && snapshot.computations.length > 0) {
        parts.push('**Key Metrics:**');
        for (const comp of snapshot.computations) {
            parts.push(`- ${comp.name}: ${comp.formattedValue || comp.value}`);
        }
        parts.push('');
    }

    // Visual state summary
    if (snapshot.visualState) {
        const vs = snapshot.visualState;
        if (vs.activeFilters && vs.activeFilters.length > 0) {
            parts.push(`**Active Filters:** ${vs.activeFilters.map(f => f.displayText || `${f.field} ${f.operator} ${f.value}`).join(', ')}`);
        }
        if (vs.drillPath && vs.drillPath.length > 0) {
            parts.push(`**Drill Path:** ${vs.drillPath.join(' > ')}`);
        }
        if (vs.searchText) {
            parts.push(`**Search:** "${vs.searchText}"`);
        }
        parts.push('');
    }

    // Interpretation (if component provided one)
    if (snapshot.interpretation) {
        parts.push('**Component Interpretation:**');
        parts.push(snapshot.interpretation);
        parts.push('');
    }

    // Full JSON
    parts.push('**Full Data (JSON):**');
    parts.push('```json');
    parts.push(JSON.stringify(snapshot, null, 2));
    parts.push('```');

    return parts.join('\n');
}
```

### 7.4 UI Integration: "Analyze" Action

Add an action to the artifact viewer panel toolbar that triggers agent analysis:

**In `artifact-viewer-panel.component.html`:**
```html
<!-- Analyze button in toolbar -->
<button class="btn-icon" title="Analyze with AI agent"
  (click)="OnAnalyzeWithAgent()"
  [disabled]="!HasActivePlugin">
  <i class="fas fa-brain"></i> Analyze
</button>
```

**Events:**
```typescript
@Output() AnalyzeRequested = new EventEmitter<{
    snapshot: DataArtifactSpec | Record<string, unknown>;
    contextMessage: string;
    artifactId?: string;
    artifactVersionId?: string;
}>();
```

The parent (conversations panel, dashboard, etc.) handles the event and routes the snapshot to the appropriate agent conversation.

### 7.5 Agent Actions for Component Interaction

For agents to actively interact with components (Mode C, future), new MJ Actions would be needed:

| Action | Purpose | Sub-Phase |
|---|---|---|
| `Get Component Snapshot` | Captures current state of a named component | Future |
| `Apply Component Filter` | Applies a filter to a running component | Future |
| `Set Component Selection` | Selects specific rows/items in a component | Future |
| `Refresh Component Data` | Triggers a data reload in a component | Future |

These are **not in scope** for this plan but are documented as the natural next step once the event system and snapshot infrastructure are in place.

---

## 8. Sub-Phase F: Interactive Component Data Contract

### 8.1 Overview

Update the `ComponentObject` interface in `@memberjunction/interactive-component-types` so that `getCurrentDataState()` returns a `DataArtifactSpec` (the unified type from Sub-Phase A) instead of `any`. Update the React runtime and Angular bridge to support the new contract. This is the critical link that makes interactive components first-class participants in the data snapshot ecosystem.

### 8.2 Changes to ComponentObject

In `packages/InteractiveComponents/src/runtime-types.ts`:

```typescript
import { DataArtifactSpec } from './data-artifact-spec';

export interface ComponentObject {
    component: Function;
    print?: ComponentPrintFunction;
    refresh?: ComponentRefreshFunction;

    /**
     * Gets the current data state of the component as a structured DataArtifactSpec.
     *
     * Components should return a snapshot that includes:
     * - `tables[]`: One or more named datasets the component is displaying
     * - `computations[]`: Any aggregations or KPIs the component has calculated
     * - `visualState`: Current filters, sorting, selections, drill path
     * - `interpretation`: Optional narrative of what the data shows
     * - `title`: Display name of the component/view
     *
     * This snapshot can be:
     * - Passed to an agent for analysis (ephemeral or as artifact)
     * - Saved as a Data Snapshot artifact for persistence
     * - Used by the container to understand what the component is showing
     *
     * For components that don't work with tabular data, return a DataArtifactSpec
     * with an empty `tables` array and populate `interpretation` with a textual
     * description of the component's state.
     *
     * @returns Structured data snapshot, or undefined if not supported
     */
    getCurrentDataState?: () => DataArtifactSpec | undefined;

    /**
     * Gets the history of data state changes in the component.
     * Returns an array of timestamped snapshots.
     *
     * Useful for understanding how the user interacted with the component
     * over time (what they filtered, drilled into, selected).
     */
    getDataStateHistory?: () => Array<{ timestamp: Date; state: DataArtifactSpec }>;

    // ... rest of existing methods unchanged ...
    validate?: () => boolean | { valid: boolean; errors?: string[] };
    isDirty?: () => boolean;
    reset?: () => void;
    scrollTo?: (target: string | HTMLElement | { top?: number; left?: number }) => void;
    focus?: (target?: string | HTMLElement) => void;
    invokeMethod?: (methodName: string, ...args: unknown[]) => unknown;
    hasMethod?: (methodName: string) => boolean;

    /**
     * Event bus for subscribing to component events.
     * See Sub-Phase B for full event system documentation.
     */
    events?: ComponentEventBus;
}
```

### 8.3 Standard Methods Update

In `ComponentMethodInfo.standardMethodsSupported`, the meaning of `getCurrentDataState` and `getDataStateHistory` is now: "returns `DataArtifactSpec`." No interface change needed, but documentation in `component-spec.ts` should be updated to reference the new type.

### 8.4 React Runtime: Component Spec Guide Update

The component spec guide (`packages/React/mj-component-spec-guide.md`) should document how component authors implement `getCurrentDataState()`:

```markdown
### Implementing getCurrentDataState()

Your component should return a `DataArtifactSpec` object that describes its current state.
This enables the "Analyze" feature and allows agents to reason about your component's data.

**Example for a dashboard component:**
```javascript
getCurrentDataState: () => ({
    title: "Sales Dashboard Q4 2025",
    tables: [
        {
            name: "monthly_revenue",
            description: "Revenue aggregated by month",
            source: "query",
            columns: [
                { field: "Month", headerName: "Month", sqlBaseType: "nvarchar" },
                { field: "Revenue", headerName: "Revenue", sqlBaseType: "money", isSummary: true }
            ],
            rows: monthlyData,  // Your component's data array
            metadata: { rowCount: monthlyData.length, queryId: "revenue-query-id" }
        },
        {
            name: "top_customers",
            description: "Top 10 customers by revenue",
            source: "view",
            columns: [
                { field: "Name", sourceEntity: "Customers", sourceFieldName: "Name", sqlBaseType: "nvarchar" },
                { field: "TotalRevenue", sqlBaseType: "money", isSummary: true, isComputed: true }
            ],
            rows: topCustomers,
            metadata: { rowCount: 10, entityName: "Customers" }
        }
    ],
    computations: [
        { name: "Total Revenue", type: "sum", field: "Revenue", table: "monthly_revenue",
          value: 4500000, formattedValue: "$4.5M" },
        { name: "YoY Growth", type: "custom", value: 12.3, formattedValue: "+12.3%",
          description: "Year-over-year revenue growth rate" },
        { name: "Customer Count", type: "count", table: "top_customers",
          value: 847, formattedValue: "847" }
    ],
    visualState: {
        activeFilters: [
            { field: "Region", operator: "eq", value: "West", displayText: "Region = West" }
        ],
        drillPath: ["All Regions", "West"],
        sorting: [{ field: "Revenue", direction: "desc" }],
        activeTab: "revenue"
    },
    interpretation: "Q4 West region revenue totals $4.5M (+12.3% YoY). Top customer Acme Corp represents 15% of total. November showed a spike driven by enterprise renewals."
})
```

**For non-tabular components** (e.g., a diagram, a settings panel):
```javascript
getCurrentDataState: () => ({
    title: "Network Topology Viewer",
    tables: [],  // No tabular data
    interpretation: "Displaying 47 nodes across 3 clusters. Cluster A (production) has 22 nodes with 2 showing warning status. No critical alerts.",
    visualState: {
        activeFilters: [{ field: "status", operator: "neq", value: "offline", displayText: "Status is not Offline" }],
        custom: { zoomLevel: 0.85, selectedCluster: "production" }
    }
})
```
```

### 8.5 Angular Bridge: MJReactComponent Update

In `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`, expose the snapshot through a public method:

```typescript
/**
 * Get the current data state from the running React component.
 * Returns a DataArtifactSpec if the component implements getCurrentDataState().
 */
public GetCurrentDataState(): DataArtifactSpec | undefined {
    return this.componentObject?.getCurrentDataState?.();
}
```

This allows the `ComponentArtifactViewerComponent` (Sub-Phase C) to call through cleanly.

### 8.6 Backward Compatibility

Components that currently return `any` from `getCurrentDataState()` will continue to work — TypeScript allows returning a more specific type where `any` was expected. The only change is that NEW components are guided toward returning `DataArtifactSpec`, and the consuming infrastructure (snapshot methods, agent bridge) now has a structured contract to rely on.

Existing components returning plain objects will still work through the `Record<string, unknown>` fallback in `GetCurrentStateSnapshot()` (Sub-Phase C).

### 8.7 Unit Tests

Add tests in `packages/InteractiveComponents/src/__tests__/runtime-types.test.ts`:
- `getCurrentDataState()` returning `DataArtifactSpec` is type-compatible
- `getDataStateHistory()` returning timestamped `DataArtifactSpec[]` is type-compatible
- `DefaultComponentEventBus` integrates with `ComponentObject.events`

---

## 9. Cross-Cutting Concerns

### 9.1 Package Dependencies

| Package | New Dependencies | Why |
|---|---|---|
| `@memberjunction/interactive-component-types` | None (new types only) | Contains all new interfaces |
| `@memberjunction/ng-artifacts` | `@memberjunction/interactive-component-types` | Already depends on this; needs new type imports |
| `@memberjunction/ng-react` | Already depends on `interactive-component-types` | No change |
| `@memberjunction/ng-query-viewer` | None | Uses `QueryGridColumnConfig` which is unchanged |

### 9.2 Versioning

All changes are additive. No breaking changes to existing interfaces:
- `DataArtifactSpec` gains new optional fields
- `ComponentObject.getCurrentDataState()` signature changes from `() => any` to `() => DataArtifactSpec | undefined` — compatible because `any` accepts any return type
- `BaseArtifactViewerPluginComponent` gains a new virtual method with a default implementation

### 9.3 Build Order

1. `@memberjunction/interactive-component-types` (new types + event bus)
2. `@memberjunction/ng-artifacts` (viewer changes, snapshot method)
3. `@memberjunction/ng-react` (bridge update)
4. Consumer code (conversation panel, agent integration)

### 9.4 Migration Path

**For existing data artifacts:** Zero migration. Single-table specs with root-level fields continue to work unchanged. The viewer detects whether `tables[]` is present and falls back to root-level fields.

**For existing interactive components:** Zero migration. Components that don't implement `getCurrentDataState()` continue to work. The snapshot system returns `null` gracefully.

**For existing agents:** Zero migration. Agents that don't consume snapshots are unaffected. New agents can opt into snapshot consumption via the agent data context.

### 9.5 Performance Considerations

- **Snapshot serialization**: `JSON.stringify()` on large datasets could be slow. Consider truncating `rows` arrays beyond a configurable limit (e.g., 1000 rows) when creating snapshots for agent consumption. The full data is still available via live query execution.
- **Multi-table lazy loading**: In the viewer, only load data for the active table tab. Other tabs load on first click (already designed this way in Sub-Phase D).
- **Event bus**: The `DefaultComponentEventBus` uses a simple `Map<string, Set<Function>>`. For high-frequency events, components can implement a custom bus with debouncing.

### 9.6 Security Considerations

- **Snapshot content**: Snapshots inherit the same permission model as their source artifact. A user who can view the artifact can capture its snapshot.
- **Agent context**: When snapshots are passed to agents, the agent runs under the user's permission context (`contextUser`). The agent cannot access data the user cannot see.
- **Artifact persistence**: When snapshots are saved as artifact versions, they inherit the parent artifact's permissions. New artifacts use the creator's ownership model.

### 9.7 Testing Strategy

| Sub-Phase | Test Type | What to Test |
|---|---|---|
| A | Unit | `normalizeToTables()`, `isMultiTable()`, type compatibility |
| B | Unit | Event bus subscribe/unsubscribe, cancellation, handler ordering |
| C | Unit | Default snapshot for each viewer plugin type |
| D | Component | Multi-table tab rendering, tab switching, per-table paging |
| E | Integration | Snapshot → agent context formatting, artifact creation |
| F | Unit | `getCurrentDataState()` return type, backward compatibility |

---

## 10. File Inventory

### New Files

| File | Sub-Phase | Purpose |
|---|---|---|
| `packages/InteractiveComponents/src/data-artifact-spec.ts` | A | Unified `DataArtifactSpec` and related interfaces |
| `packages/InteractiveComponents/src/component-events.ts` | B | Event args interfaces and `ComponentEventBus` interface |
| `packages/InteractiveComponents/src/component-event-bus.ts` | B | `DefaultComponentEventBus` implementation |
| `packages/InteractiveComponents/src/__tests__/data-artifact-spec.test.ts` | A | Unit tests for helper functions |
| `packages/InteractiveComponents/src/__tests__/component-events.test.ts` | B | Unit tests for event bus |
| `metadata/artifact-types/.data-snapshot-artifact-type.json` | E | Data Snapshot artifact type metadata |

### Modified Files

| File | Sub-Phase | Changes |
|---|---|---|
| `packages/InteractiveComponents/src/index.ts` | A, B | Add exports for new modules |
| `packages/InteractiveComponents/src/runtime-types.ts` | B, F | Update `ComponentObject` with typed `getCurrentDataState()`, add `events` |
| `packages/InteractiveComponents/src/component-props-events.ts` | B | Add `cancelable` and `pairedEvent` to `ComponentEvent` |
| `packages/Angular/Generic/artifacts/src/lib/components/base-artifact-viewer.component.ts` | C | Add `GetCurrentStateSnapshot()` base method |
| `packages/Angular/Generic/artifacts/src/lib/components/plugins/data-artifact-viewer.component.ts` | A, C, D | Remove local interfaces, import from package, add multi-table UX, add snapshot override |
| `packages/Angular/Generic/artifacts/src/lib/components/plugins/data-artifact-viewer.component.html` | D | Add table tab strip, computations bar, interpretation tab |
| `packages/Angular/Generic/artifacts/src/lib/components/plugins/data-artifact-viewer.component.css` | D | Add table tab and computation styles |
| `packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.ts` | C | Add snapshot override that calls through to React component |
| `packages/Angular/Generic/artifacts/src/lib/components/artifact-viewer-panel.component.ts` | C, E | Add `GetCurrentStateSnapshot()` passthrough, add "Analyze" action |
| `packages/Angular/Generic/artifacts/src/lib/components/artifact-viewer-panel.component.html` | E | Add "Analyze" button to toolbar |
| `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts` | F | Add `GetCurrentDataState()` public method |

---

## 11. Open Items & Future Considerations

### 11.1 Open Design Questions

1. **Snapshot size limits**: When a component has 100K rows, should `getCurrentDataState()` return all of them? Recommendation: truncate to configurable limit (default 1000 rows) with `metadata.totalAvailableRows` indicating the full count. The agent can request more via a follow-up action if needed.

2. **Real-time event streaming to agents (Mode C)**: Requires WebSocket infrastructure between agent and UI. This is a future capability that builds on the event system from Sub-Phase B. Not designed in detail here.

3. **Snapshot diff**: Should the system support comparing two snapshots? Useful for "what changed since I last looked?" scenarios. Could be a separate utility function operating on two `DataArtifactSpec` objects.

4. **Computed table support**: When `source` is `'computed'`, the component built the data client-side (e.g., aggregation, pivot). The `metadata.computationDescription` field documents how it was derived. Should we formalize computation descriptions more (e.g., a mini-DSL)?

5. **Agent-initiated component creation**: An agent that analyzes a snapshot could produce a NEW `DataArtifactSpec` with different filters/computations as a suggested "next view." The component artifact system could render this directly. This creates a feedback loop: component → snapshot → agent → new component.

### 11.2 Future Sub-Phases (Not In Scope)

| Future Phase | Description | Prerequisites |
|---|---|---|
| **Live Agent Dialog** | Agent subscribes to component events in real-time, can invoke methods | Sub-Phases B, E, WebSocket infrastructure |
| **Snapshot Comparison** | Diff two snapshots to highlight changes | Sub-Phase A |
| **Agent-Initiated Filtering** | Agent applies filters to running components via actions | Sub-Phases B, F, new MJ Actions |
| **Cross-Component Snapshots** | Capture state of multiple components simultaneously | Sub-Phase C, dashboard infrastructure |
| **Snapshot Scheduling** | Automatically capture snapshots at intervals for trend analysis | Sub-Phase E, scheduling infrastructure |

### 11.3 Relationship to Existing Plans

- **Query Builder Agent Plan** (`plans/complete/query-builder-agent-plan.md`): This plan extends the Data artifact type that was created in Phase 2 of that plan. The multi-table expansion and snapshot system are additive — they don't change how the query builder agent produces artifacts.
- **Component Artifact Viewer Improvements** (`plans/complete/3-component-artifact-viewer-improvements.md`): The snapshot system adds a new capability to the component viewer but doesn't modify its existing rendering pipeline.
- **Composable Queries Plan** (`plans/nested-queries-paging-caching-plan.md`): The multi-table `DataArtifactSpec` could naturally represent composed query results where each sub-query becomes a named table.

---

## Summary: Implementation Order

```
1. Sub-Phase A: DataArtifactSpec types     ← FOUNDATION (do first)
   │
   ├──▶ 2a. Sub-Phase B: Event system types + bus    (parallel)
   ├──▶ 2b. Sub-Phase C: Base snapshot method        (parallel)
   ├──▶ 2c. Sub-Phase D: Multi-table viewer UX       (parallel)
   └──▶ 2d. Sub-Phase F: ComponentObject contract    (parallel)
              │
              ▼
         3. Sub-Phase E: Agent bridge                 (after C + F)
```

**Estimated scope**: ~1500 lines of new TypeScript types/implementations, ~300 lines of Angular template/styles, ~400 lines of unit tests.
