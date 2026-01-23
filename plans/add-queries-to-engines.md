# Add Query Support to BaseEngine

## Overview

Extend `BaseEnginePropertyConfig` to support caching query results alongside entities and datasets. This enables engines to load and cache arbitrary SQL query results with automatic refresh when underlying entities change.

## Current State

### BaseEnginePropertyConfig Today

```typescript
export class BaseEnginePropertyConfig extends BaseInfo {
    Type: 'entity' | 'dataset' = 'entity';
    PropertyName: string;
    EntityName?: string;      // For Type: 'entity'
    DatasetName?: string;     // For Type: 'dataset'
    Filter?: string;
    OrderBy?: string;
    AutoRefresh?: boolean;
    DebounceTime?: number;
    // ... other properties
}
```

### Existing Metadata Infrastructure

The database already has the metadata needed for query-to-entity mapping:

1. **`Queries` entity** - Query definitions with:
   - `Name` - unique query identifier
   - `SQL` - the actual query text
   - `Description`, `TechnicalDescription` - documentation
   - `UserQuestion` - natural language description (for AI selection)

2. **`Query Entities` entity** - Maps queries to their underlying entities:
   - `QueryID` → links to the query
   - `EntityID` → links to entities used by that query
   - `DetectionMethod` → `'AI'` or `'Manual'`
     - `'AI'` means the system parsed the SQL to auto-detect entity references
     - `'Manual'` means a user explicitly marked the relationship

## Proposed Changes

### 1. Extend BaseEnginePropertyConfig

```typescript
export class BaseEnginePropertyConfig extends BaseInfo {
    /**
     * The type of item to load: 'entity', 'dataset', or 'query'
     */
    Type: 'entity' | 'dataset' | 'query' = 'entity';

    PropertyName: string;

    // Existing entity/dataset properties
    EntityName?: string;
    DatasetName?: string;
    Filter?: string;
    OrderBy?: string;

    // NEW: Query properties
    /**
     * The name of the query to run, required if Type is 'query'.
     * Must match a Query.Name in the Queries entity.
     */
    QueryName?: string;

    /**
     * Optional parameters to pass to the query.
     * These are substituted into parameterized queries.
     */
    QueryParams?: Record<string, unknown>;

    // Existing refresh properties (apply to queries too)
    AutoRefresh?: boolean;
    DebounceTime?: number;
}
```

### 2. Add Query Loading Methods to BaseEngine

```typescript
// New method to load a single query config
protected async LoadSingleQueryConfig(
    config: BaseEnginePropertyConfig,
    contextUser: UserInfo
): Promise<void> {
    const rq = new RunQuery(this.RunViewProviderToUse);
    const result = await rq.RunQuery({
        QueryName: config.QueryName,
        Params: config.QueryParams,
        _fromEngine: true  // Prevent telemetry false positives
    }, contextUser);

    if (result.Success) {
        if (config.AddToObject !== false) {
            (this as any)[config.PropertyName] = result.Results;
        }
        this._dataMap.set(config.PropertyName, {
            queryName: config.QueryName,
            data: result.Results
        });
    }
}

// Batch loading for multiple queries
protected async LoadMultipleQueryConfigs(
    configs: BaseEnginePropertyConfig[],
    contextUser: UserInfo
): Promise<void> {
    // RunQuery may not have a batch API like RunViews
    // Could execute in parallel with Promise.all
    await Promise.all(
        configs.map(c => this.LoadSingleQueryConfig(c, contextUser))
    );

    // Record query loads for registry tracking
    const queryNames = configs.map(c => c.QueryName).filter(Boolean);
    if (queryNames.length > 0) {
        BaseEngineRegistry.Instance.RecordQueryLoads(this.constructor.name, queryNames);
    }
}
```

### 3. Update LoadConfigs to Handle Queries

```typescript
protected async LoadConfigs(
    configs: Partial<BaseEnginePropertyConfig>[],
    contextUser: UserInfo
): Promise<void> {
    this._metadataConfigs = configs.map(c => this.UpgradeObjectToConfig(c));

    const entityConfigs = this._metadataConfigs.filter(c => c.Type === 'entity');
    const datasetConfigs = this._metadataConfigs.filter(c => c.Type === 'dataset');
    const queryConfigs = this._metadataConfigs.filter(c => c.Type === 'query');

    await Promise.all([
        ...datasetConfigs.map(c => this.LoadSingleDatasetConfig(c, contextUser)),
        this.LoadMultipleEntityConfigs(entityConfigs, contextUser),
        this.LoadMultipleQueryConfigs(queryConfigs, contextUser)  // NEW
    ]);
}
```

### 4. Auto-Refresh Based on Query Entities

The key insight: when a BaseEntity save/delete event fires, we need to check if any cached queries reference that entity.

```typescript
protected async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
    if (event.type === 'delete' || event.type === 'save') {
        const entityName = event.baseEntity.EntityInfo.Name.toLowerCase().trim();

        // Existing: check entity configs
        const matchingEntityConfig = this.Configs.some(config =>
            config.AutoRefresh &&
            config.Type === 'entity' &&
            config.EntityName?.toLowerCase().trim() === entityName
        );

        // NEW: check query configs via Query Entities mapping
        const matchingQueryConfig = await this.checkQueryConfigsForEntity(entityName);

        if (matchingEntityConfig || matchingQueryConfig) {
            return this.DebounceIndividualBaseEntityEvent(event);
        }
    }
    return true;
}

/**
 * Check if any query configs reference the given entity.
 * Uses the Query Entities metadata to determine relationships.
 */
private async checkQueryConfigsForEntity(entityName: string): Promise<boolean> {
    const queryConfigs = this.Configs.filter(c =>
        c.Type === 'query' && c.AutoRefresh
    );

    if (queryConfigs.length === 0) return false;

    // Look up Query Entities to see if any of our queries reference this entity
    // This could be cached in the engine for performance
    const queryEntityMapping = await this.getQueryEntityMapping();

    for (const config of queryConfigs) {
        const entities = queryEntityMapping.get(config.QueryName);
        if (entities?.includes(entityName)) {
            return true;
        }
    }

    return false;
}

/**
 * Cache the query-to-entity mapping for performance.
 * Loads from Query Entities metadata.
 */
private _queryEntityMapping: Map<string, string[]> | null = null;

private async getQueryEntityMapping(): Promise<Map<string, string[]>> {
    if (this._queryEntityMapping) {
        return this._queryEntityMapping;
    }

    // Load Query Entities for all queries this engine uses
    const queryNames = this.Configs
        .filter(c => c.Type === 'query')
        .map(c => c.QueryName);

    if (queryNames.length === 0) {
        this._queryEntityMapping = new Map();
        return this._queryEntityMapping;
    }

    const rv = new RunView(this.RunViewProviderToUse);
    const result = await rv.RunView({
        EntityName: 'Query Entities',
        ExtraFilter: `Query IN (${queryNames.map(n => `'${n}'`).join(',')})`,
        ResultType: 'simple',
        _fromEngine: true
    }, this._contextUser);

    // Build mapping: queryName -> [entityName1, entityName2, ...]
    this._queryEntityMapping = new Map();
    for (const row of result.Results) {
        const queryName = row.Query;
        const entityName = row.Entity?.toLowerCase().trim();
        if (!this._queryEntityMapping.has(queryName)) {
            this._queryEntityMapping.set(queryName, []);
        }
        this._queryEntityMapping.get(queryName)!.push(entityName);
    }

    return this._queryEntityMapping;
}
```

### 5. Extend BaseEngineRegistry for Query Tracking

```typescript
// In BaseEngineRegistry
private _queryLoadTracking: Map<string, string[]> = new Map();  // queryName -> [engines]

public RecordQueryLoads(engineName: string, queryNames: string[]): void {
    for (const queryName of queryNames) {
        if (!this._queryLoadTracking.has(queryName)) {
            this._queryLoadTracking.set(queryName, []);
        }
        const engines = this._queryLoadTracking.get(queryName)!;
        if (!engines.includes(engineName)) {
            engines.push(engineName);
        }
    }
}

public GetQueryLoadTrackingMap(): Map<string, string[]> {
    return new Map(this._queryLoadTracking);
}
```

## Use Cases

### Dashboard Statistics Engine

```typescript
class DashboardStatsEngine extends BaseEngine<DashboardStatsEngine> {
    public Stats: DashboardStats[];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
        await this.Load([
            {
                Type: 'query',
                PropertyName: 'Stats',
                QueryName: 'Dashboard Summary Stats',
                AutoRefresh: true,
                DebounceTime: 10000  // 10 second debounce for stats
            }
        ], Metadata.Provider, forceRefresh, contextUser);
    }
}
```

### Reporting Engine with Parameters

```typescript
class SalesReportEngine extends BaseEngine<SalesReportEngine> {
    public MonthlySales: SalesData[];
    public TopProducts: ProductData[];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
        await this.Load([
            {
                Type: 'query',
                PropertyName: 'MonthlySales',
                QueryName: 'Monthly Sales by Region',
                QueryParams: { Year: new Date().getFullYear() },
                AutoRefresh: true
            },
            {
                Type: 'query',
                PropertyName: 'TopProducts',
                QueryName: 'Top 10 Products',
                AutoRefresh: false  // Static, manual refresh only
            }
        ], Metadata.Provider, forceRefresh, contextUser);
    }
}
```

## Considerations

### Auto-Refresh Noise

A query joining 5+ tables means ANY save to ANY of those 5 entities triggers a refresh. Mitigation options:

1. **Default AutoRefresh to false for queries** - require explicit opt-in
2. **Longer default DebounceTime for queries** - e.g., 30 seconds vs 5 seconds for entities
3. **Add `AutoRefreshEntities` property** - whitelist specific entities that should trigger refresh

```typescript
{
    Type: 'query',
    QueryName: 'Complex Report',
    AutoRefresh: true,
    AutoRefreshEntities: ['Orders', 'Invoices']  // Only refresh when these change
}
```

### Query Entity Mapping Accuracy

The `DetectionMethod: 'AI'` field suggests there's already an AI-based SQL parser that identifies entity references. For auto-refresh to work reliably:

- Query Entities metadata must be kept current
- When queries are modified, the mapping should be re-analyzed
- Consider adding a validation step that warns if mappings seem stale

### Performance

- Cache the Query Entities mapping per engine instance
- Invalidate mapping cache when Query Entities for relevant queries change
- Consider loading Query Entities mapping eagerly during engine Config

### RunQuery Batching

Unlike RunView which has RunViews for batching, RunQuery may not have a batch API. Options:

1. Execute queries in parallel with `Promise.all`
2. Add `RunQueries` batch method to RunQuery class
3. Accept sequential execution for simplicity

## Implementation Phases

### Phase 1: Basic Query Support
1. Add `'query'` to Type union
2. Add `QueryName` and `QueryParams` properties
3. Implement `LoadSingleQueryConfig`
4. Update `LoadConfigs` to handle queries

### Phase 2: Auto-Refresh
1. Load Query Entities mapping during Config
2. Extend `HandleIndividualBaseEntityEvent` to check queries
3. Add `_queryEntityMapping` caching

### Phase 3: Registry Integration
1. Add query tracking to BaseEngineRegistry
2. Extend telemetry to track query loads
3. Add QueryOverlapAnalyzer for telemetry insights

### Phase 4: Refinements
1. Add `AutoRefreshEntities` whitelist option
2. Tune default debounce times
3. Add RunQueries batch method if beneficial

## Open Questions

1. **Should queries support `ResultType: 'entity_object'`?** Queries return arbitrary result sets, not entity records. Probably should be `'simple'` only.

2. **How to handle parameterized queries?** The `QueryParams` approach seems clean, but need to verify RunQuery supports this.

3. **Should we add a `RunQueries` batch API?** Would mirror RunViews pattern but queries are often independent, so `Promise.all` may be sufficient.

4. **Cache invalidation for Query Entities mapping?** If someone updates the Query Entities while engine is running, the cached mapping becomes stale. Probably acceptable for now - engine refresh would reload it.
