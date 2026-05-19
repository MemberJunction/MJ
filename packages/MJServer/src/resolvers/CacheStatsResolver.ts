import { Field, Float, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { LocalCacheManager, CacheStats, CacheEntryType } from '@memberjunction/core';
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

// ============================================================================
// Helpers (pure core)
// ============================================================================

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
}
