import { Arg, Field, Float, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { BaseEngine, BaseEngineRegistry, LocalCacheManager, CacheStats, CacheEntryType } from '@memberjunction/core';
import type { EngineStateCensus } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/index.js';

// ============================================================================
// GraphQL Object Types
// ============================================================================

@ObjectType()
class CacheStatsByTypeGQL {
    @Field(() => String)
    Type: CacheEntryType;

    @Field(() => Int)
    Count: number;

    @Field(() => Int)
    SizeBytes: number;
}

@ObjectType()
class CacheStatsGQL {
    @Field(() => Int)
    TotalEntries: number;

    @Field(() => Int)
    TotalSizeBytes: number;

    @Field(() => [CacheStatsByTypeGQL])
    ByType: CacheStatsByTypeGQL[];

    @Field(() => Float)
    OldestEntry: number;

    @Field(() => Float)
    NewestEntry: number;

    @Field(() => Int)
    Hits: number;

    @Field(() => Int)
    Misses: number;

    @Field(() => Float)
    HitRate: number;
}

@ObjectType()
class CacheEntityBreakdownGQL {
    @Field(() => String)
    EntityName: string;

    @Field(() => Int)
    EntryCount: number;

    @Field(() => Int)
    TotalSizeBytes: number;

    @Field(() => Int)
    TotalAccessCount: number;
}

@ObjectType()
class CacheStatsDetailGQL extends CacheStatsGQL {
    @Field(() => [CacheEntityBreakdownGQL])
    EntityBreakdown: CacheEntityBreakdownGQL[];
}

@ObjectType()
class EnginePropertyCensusGQL {
    @Field(() => String)
    PropertyName: string;

    @Field(() => String, { nullable: true })
    EntityName?: string;

    @Field(() => String, { nullable: true })
    DatasetName?: string;

    @Field(() => Int)
    RowCount: number;

    @Field(() => String, { nullable: true })
    MaxUpdatedAt: string | null;

    @Field(() => String, { nullable: true })
    IdentityHash: string | null;

    @Field(() => Boolean)
    LoadedSuccessfully: boolean;

    @Field(() => Boolean)
    PermissionDenied: boolean;
}

@ObjectType()
class EngineDerivedCountGQL {
    @Field(() => String)
    Name: string;

    @Field(() => Int)
    Value: number;
}

@ObjectType()
class EngineStateCensusGQL {
    @Field(() => String)
    EngineClass: string;

    @Field(() => Boolean)
    Loaded: boolean;

    @Field(() => Boolean)
    PermissionConstrained: boolean;

    @Field(() => [EnginePropertyCensusGQL])
    Properties: EnginePropertyCensusGQL[];

    @Field(() => [EngineDerivedCountGQL])
    Derived: EngineDerivedCountGQL[];
}

// ============================================================================
// Helpers (pure core)
// ============================================================================

function censusToGQL(census: EngineStateCensus): EngineStateCensusGQL {
    const gql = new EngineStateCensusGQL();
    gql.EngineClass = census.EngineClass;
    gql.Loaded = census.Loaded;
    gql.PermissionConstrained = census.PermissionConstrained;
    gql.Properties = census.Properties.map(p => Object.assign(new EnginePropertyCensusGQL(), p));
    gql.Derived = Object.entries(census.Derived).map(([Name, Value]) => Object.assign(new EngineDerivedCountGQL(), { Name, Value }));
    return gql;
}

/** Census of every registered engine in this process, optionally narrowed to one class name. */
function buildEngineCensus(engineClass?: string): EngineStateCensusGQL[] {
    return BaseEngineRegistry.Instance.GetAllEngines()
        .filter((engine): engine is BaseEngine<unknown> => engine instanceof BaseEngine)
        .filter(engine => !engineClass || engine.constructor.name === engineClass)
        .map(engine => censusToGQL(engine.GetStateCensus()))
        .sort((a, b) => a.EngineClass.localeCompare(b.EngineClass));
}

function toGQL(stats: CacheStats): CacheStatsGQL {
    const gql = new CacheStatsGQL();
    gql.TotalEntries = stats.totalEntries;
    gql.TotalSizeBytes = stats.totalSizeBytes;
    gql.ByType = (['dataset', 'runview', 'runquery'] as const).map(t => {
        const bt = stats.byType[t];
        const entry = new CacheStatsByTypeGQL();
        entry.Type = t;
        entry.Count = bt.count;
        entry.SizeBytes = bt.sizeBytes;
        return entry;
    });
    gql.OldestEntry = stats.oldestEntry;
    gql.NewestEntry = stats.newestEntry;
    gql.Hits = stats.hits;
    gql.Misses = stats.misses;
    gql.HitRate = (stats.hits + stats.misses) > 0
        ? (stats.hits / (stats.hits + stats.misses)) * 100
        : 0;
    return gql;
}

function buildEntityBreakdown(): CacheEntityBreakdownGQL[] {
    const entries = LocalCacheManager.Instance.GetAllEntries();
    const entityMap = new Map<string, { count: number; sizeBytes: number; accessCount: number }>();

    for (const entry of entries) {
        if (entry.type !== 'runview' || !entry.name) continue;
        const existing = entityMap.get(entry.name) ?? { count: 0, sizeBytes: 0, accessCount: 0 };
        existing.count++;
        existing.sizeBytes += entry.sizeBytes;
        existing.accessCount += entry.accessCount;
        entityMap.set(entry.name, existing);
    }

    return [...entityMap.entries()]
        .map(([name, data]) => {
            const gql = new CacheEntityBreakdownGQL();
            gql.EntityName = name;
            gql.EntryCount = data.count;
            gql.TotalSizeBytes = data.sizeBytes;
            gql.TotalAccessCount = data.accessCount;
            return gql;
        })
        .sort((a, b) => b.EntryCount - a.EntryCount);
}

// ============================================================================
// Resolver
// ============================================================================

@Resolver()
export class CacheStatsResolver {
    @RequireSystemUser()
    @Query(() => CacheStatsGQL)
    CacheStats(): CacheStatsGQL {
        const stats = LocalCacheManager.Instance.GetStats();
        return toGQL(stats);
    }

    @RequireSystemUser()
    @Query(() => CacheStatsDetailGQL)
    CacheStatsDetail(): CacheStatsDetailGQL {
        const stats = LocalCacheManager.Instance.GetStats();
        const result = new CacheStatsDetailGQL();
        Object.assign(result, toGQL(stats));
        result.EntityBreakdown = buildEntityBreakdown();
        return result;
    }

    /**
     * What each engine in this server process holds — row counts, newest timestamps, a row-version
     * hash, and engine-specific derived-state counts. Comparing the hashes across servers shows
     * whether they converged; a derived count of zero next to a full array shows lost derived state.
     */
    @RequireSystemUser()
    @Query(() => [EngineStateCensusGQL])
    EngineStateCensus(
        @Arg('EngineClass', () => String, { nullable: true }) engineClass?: string
    ): EngineStateCensusGQL[] {
        return buildEngineCensus(engineClass);
    }
}
