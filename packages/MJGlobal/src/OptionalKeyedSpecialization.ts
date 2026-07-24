/**
 * OptionalKeyedSpecialization.ts — marks a base class whose KEYED lookups are optional
 * specialization probes, so falling back to the base is the DESIGNED common case.
 *
 * ## Why this exists
 * The ClassFactory reports keyed lookups that land on the base class, because for most bases a
 * supplied key means "I demand implementation X" — landing on the base then signals a typo'd key
 * or a tree-shaken registration (the B34/B35 failure class).
 *
 * But some bases invert that contract. `EntityField` hydration asks the factory for
 * `'<Entity>.<Field>'` on EVERY field of EVERY entity — an extension point that says "if someone
 * registered a per-field subclass, give me that; otherwise the base is exactly what I want."
 * There, base fallback is not a failed lookup; it is the expected outcome for ~100% of keys, and
 * warning about it is pure noise that buries real resolution failures.
 *
 * `@OptionalKeyedSpecialization()` is the base author's explicit declaration of that contract.
 * The factory still resolves keyed registrations normally when they exist — the marker ONLY
 * suppresses the fallback diagnostic.
 *
 * ## The trade-off, stated honestly
 * On a marked base, a tree-shaken keyed registration falls back silently. That is the accepted
 * semantic: keyed subclasses of such bases refine behavior, they are not required for
 * correctness. Bases where fallback would be a correctness bug should use `@RequiresSubclass()`
 * (hard error) or no marker at all (warn-and-fall-back).
 *
 * ## Usage
 * ```ts
 * @OptionalKeyedSpecialization()
 * export class EntityField { ... }
 * ```
 *
 * Same own-property mechanics as `@RequiresSubclass()` (see that file for the full rationale):
 * the marker applies to exactly the class that declared it, never to its subclasses.
 */

/**
 * The marker key. `__mj_`-prefixed and non-enumerable so it cannot collide with application
 * fields, appear in object spreads, or show up in serialized instances.
 */
export const OPTIONAL_KEYED_SPECIALIZATION_KEY = '__mj_OptionalKeyedSpecialization';

/**
 * Class decorator declaring that keyed ClassFactory lookups against this base are optional
 * specialization probes — fallback to the base is by design and must not be reported.
 */
export function OptionalKeyedSpecialization(): (constructor: Function) => void {
    return function (constructor: Function): void {
        Object.defineProperty(constructor.prototype, OPTIONAL_KEYED_SPECIALIZATION_KEY, {
            value: true,
            enumerable: false,   // never appear in spreads / JSON / for-in
            writable: false,
            configurable: true,  // configurable so tests and hot-reload can redefine
        });
    };
}

/**
 * True iff `target` itself is marked `@OptionalKeyedSpecialization()`.
 *
 * Accepts either a class (constructor) or an instance. OWN-property check — a subclass of a
 * marked base returns `false`, mirroring `ClassRequiresSubclass`.
 */
export function ClassIsOptionalKeyedSpecialization(target: unknown): boolean {
    if (target == null) {
        return false;
    }
    const proto = typeof target === 'function'
        ? (target as { prototype?: object }).prototype
        : Object.getPrototypeOf(target as object);

    return !!proto
        && Object.prototype.hasOwnProperty.call(proto, OPTIONAL_KEYED_SPECIALIZATION_KEY)
        && (proto as Record<string, unknown>)[OPTIONAL_KEYED_SPECIALIZATION_KEY] === true;
}
