import { MJLruCache } from '@memberjunction/global';
import { CompositeKey } from './compositeKey';
import { EntityRecordNameInput, EntityRecordNameResult } from './interfaces';

/**
 * An in-memory cache of record display names, keyed by entity and primary key, for a provider
 * that serves one user.
 *
 * It exists so UI code can show a record's name synchronously — a tab title, a breadcrumb, a
 * navigation label — once any lookup or record load has seen it. Entries are not scoped to a
 * user, so only a provider whose every caller is the same identity may keep one: a browser
 * session's provider, or a `GraphQLDataProvider` connection, which the server answers as that
 * connection's user. A provider shared by several users, such as a server's database provider,
 * must not, because field-level security can withhold a name from some of them.
 *
 * Entries are bounded (least recently used is evicted first) and expire after an hour. Nothing
 * else invalidates them, so a rename made elsewhere can show its old name until then.
 */
export class EntityRecordNameCache {
    private readonly _names: MJLruCache<string, string>;

    /**
     * @param maxSize Maximum number of names kept.
     * @param ttlMs How long a name is kept after it was stored.
     */
    constructor(maxSize: number = 10000, ttlMs: number = 60 * 60 * 1000) {
        this._names = new MJLruCache<string, string>({ maxSize, ttlMs });
    }

    /** The cached name for a record, or `undefined` when none is cached. */
    public Get(entityName: string, compositeKey: CompositeKey): string | undefined {
        return this._names.Get(this.keyOf(entityName, compositeKey));
    }

    /** Whether a name is cached for a record. */
    public Has(entityName: string, compositeKey: CompositeKey): boolean {
        return this.Get(entityName, compositeKey) !== undefined;
    }

    /** Stores a record's name. An empty name is ignored, so it is looked up again next time. */
    public Set(entityName: string, compositeKey: CompositeKey, recordName: string): void {
        if (recordName) {
            this._names.Set(this.keyOf(entityName, compositeKey), recordName);
        }
    }

    /** Number of names currently cached. */
    public get Size(): number {
        return this._names.Size;
    }

    /**
     * Returns a record's cached name, or fetches and caches it.
     *
     * @param forceRefresh Fetch even when a name is cached, and replace it.
     * @param fetch Looks the name up; an empty result is returned but not cached.
     */
    public async GetOrFetch(entityName: string, compositeKey: CompositeKey, forceRefresh: boolean, fetch: () => Promise<string>): Promise<string> {
        if (!forceRefresh) {
            const cached = this.Get(entityName, compositeKey);
            if (cached !== undefined) {
                return cached;
            }
        }
        const name = await fetch();
        this.Set(entityName, compositeKey, name);
        return name;
    }

    /**
     * Returns the names for a batch of records, fetching only the ones not cached, in input order.
     *
     * @param forceRefresh Fetch every record, and replace what is cached.
     * @param fetch Looks up the records it is given and answers in the same order.
     */
    public async GetOrFetchMany(
        info: EntityRecordNameInput[],
        forceRefresh: boolean,
        fetch: (uncached: EntityRecordNameInput[]) => Promise<EntityRecordNameResult[]>
    ): Promise<EntityRecordNameResult[]> {
        const results: EntityRecordNameResult[] = new Array(info.length);
        const missingIndexes: number[] = [];
        info.forEach((item, i) => {
            const cached = forceRefresh ? undefined : this.Get(item.EntityName, item.CompositeKey);
            if (cached !== undefined) {
                results[i] = { EntityName: item.EntityName, CompositeKey: item.CompositeKey, Status: 'cached', Success: true, RecordName: cached };
            } else {
                missingIndexes.push(i);
            }
        });

        if (missingIndexes.length > 0) {
            const fetched = await fetch(missingIndexes.map(i => info[i]));
            fetched.forEach((result, j) => {
                results[missingIndexes[j]] = result;
                if (result.Success && result.RecordName) {
                    this.Set(result.EntityName, result.CompositeKey, result.RecordName);
                }
            });
        }
        return results;
    }

    private keyOf(entityName: string, compositeKey: CompositeKey): string {
        return `${entityName}|${compositeKey.ToString()}`;
    }
}
