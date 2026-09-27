import { RequiresSubclass } from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';

/**
 * An entity's IsA subtype rule, written in code.
 *
 * Subclasses register with ClassFactory using `baseClassName: EntitySubtypeResolver`
 * and the entity name as `key`. A registered resolver owns the entity's rule: `BaseEntity`
 * asks it instead of the entity's `SubtypeSelector`, both when a record is created and when
 * one is loaded.
 *
 * It answers two different questions, one per method:
 * - {@link Resolve}: which subtype a NEW record gets. Asked by
 *   `BaseEntity.ResolveSubtypeEntityName()` and `EnsureISAChild()`. It may query, or await an
 *   engine's `Config()`, because the answer has to be right.
 * - {@link ResolveLoadHint}: which subtype a LOADED record most likely has. Asked on every load
 *   of a disjoint parent, and only when a subclass overrides it. It answers from memory, and
 *   returns `null` when it can't.
 *
 * @see plans/sync-composition-axes.md
 */
@RequiresSubclass()
export abstract class EntitySubtypeResolver {
    /**
     * Which subtype a new record gets: the name of a declared IsA child entity, or `null` or an
     * empty string for no subtype. Asked when a record is created, so it may query or await an
     * engine's `Config()`, and a `null` here means "no subtype".
     */
    public abstract Resolve(record: BaseEntity): string | null | Promise<string | null>;

    /**
     * Which subtype a record that was just LOADED most likely has, so the load can fetch that
     * child's row directly instead of first querying every child's table for it.
     *
     * The base implementation gives no hint. Overriding it is the opt-in: `BaseEntity` checks the
     * registered class for an override once, and doesn't construct a resolver that has none when
     * it loads records. One that has one is constructed once per entity and shared by every record
     * it loads, so it must not keep per-record state. Override it as a method; an arrow-function
     * property isn't seen.
     *
     * An override:
     * - answers from memory only: the record's own fields, or rows a loaded `BaseEngine` holds. It
     *   never queries and never awaits an engine's `Config()`, because it runs for every loaded
     *   record and the hint exists only to skip a query;
     * - returns `null` when it can't answer from memory, for example while the cache it reads is
     *   still cold. Here `null` means "no hint", not "no subtype": the record then loads as it
     *   would without a rule, and {@link Resolve} is not asked in its place.
     *
     * The answer is a hint, checked rather than trusted:
     * - the named child's load, which happens anyway, checks it. When that load finds no row, the
     *   discovery query decides, as it does without a hint;
     * - a hint naming a child the user can't read isn't loaded; the discovery query decides;
     * - an override that throws or rejects is logged once per entity, and a hint naming an entity
     *   that isn't a declared IsA child is logged once per name; the record loads without a hint.
     *
     * So for well-formed data a hint changes the number of round trips, not which child is linked
     * or whether the load succeeds. The benign exceptions: a failure reading the hinted row falls
     * back to the discovery query, so a transient failure recovers where it used to fail the load;
     * with two child rows (the disjoint rule broken) a hint links the one it names, where the
     * discovery query links either; and a provider without `FindISAChildEntity` links the hinted
     * child, where it links none without a hint.
     *
     * Entities that allow overlapping subtypes (`AllowMultipleSubtypes`) never ask it.
     *
     * @returns A declared IsA child's entity name, or `null` for no hint, or a Promise of either.
     */
    public ResolveLoadHint(_record: BaseEntity): string | null | Promise<string | null> {
        return null;
    }
}
