import { RequiresSubclass } from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';

/**
 * Base class for prospective subtype resolution on an entity.
 *
 * Subclasses register with ClassFactory using `baseClassName: EntitySubtypeResolver`
 * and the entity name as `key`.
 *
 * Used by `BaseEntity.ResolveSubtypeEntityName()` when registered. A resolver that sets
 * {@link UseForLoadedRecords} is also asked when a record is loaded, so the load can fetch the
 * named child's row directly instead of first querying every child's table.
 *
 * @see plans/sync-composition-axes.md
 */
@RequiresSubclass()
export abstract class EntitySubtypeResolver {
    /**
     * Synchronous or asynchronous prospective resolution of the subtype entity name for `record`.
     * Return `null` or empty string if no subtype applies.
     */
    public abstract Resolve(record: BaseEntity): string | null | Promise<string | null>;

    /**
     * Whether `BaseEntity` may also ask this resolver which subtype a record has when it **loads**
     * the record, not only when it creates one.
     *
     * Off by default, because a resolver written for create time may run a query, and asking it on
     * load must cost nothing: the answer exists only to skip the query that looks for the subtype.
     * Return `true` only when {@link Resolve} answers from data already in memory, such as the
     * record's own fields or rows a loaded `BaseEngine` holds.
     *
     * The answer is a hint and is never trusted on its own:
     * - the load of the named child checks it, and on a miss the record loads as it does today;
     * - an answer of `null` ("no subtype") also loads as today, because only the discovery query can
     *   tell whether an older record still has a child row;
     * - a resolver that throws, or names an entity that isn't a declared IsA child, is logged and
     *   the record loads as today.
     *
     * Entities that allow overlapping subtypes (`AllowMultipleSubtypes`) never ask it on load.
     */
    public get UseForLoadedRecords(): boolean {
        return false;
    }
}
