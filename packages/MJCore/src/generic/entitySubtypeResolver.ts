import { RequiresSubclass } from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';

/**
 * Base class for prospective subtype resolution on an entity.
 *
 * Subclasses register with ClassFactory using `baseClassName: EntitySubtypeResolver`
 * and the entity name as `key`.
 *
 * Used by `BaseEntity.ResolveSubtypeEntityName()` when registered.
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
}
