/**
 * RequiresSubclass.ts — marks a base class that CANNOT function standalone.
 *
 * ## Why this exists
 * MJ's ClassFactory resolves the highest-priority registered class for a (base, key) pair.
 * When no registration matches, it FALLS BACK to instantiating the anchor base itself. For
 * many bases that is correct and useful — `BaseEntity` does real work, so a browser without a
 * given `*EntityServer` subclass still gets a functional object.
 *
 * For other bases it is not. An anchor whose methods are all abstract produces a hollow object
 * whose members are `undefined`, and the failure surfaces later as a `TypeError` far from the
 * cause. TypeScript's `abstract` cannot help here: it is erased at compile time, leaving no
 * runtime marker, and `new AbstractBase()` succeeds in plain JS.
 *
 * `@RequiresSubclass()` is the explicit, runtime-visible declaration of that intent.
 *
 * ## Usage
 * ```ts
 * @RequiresSubclass()
 * export abstract class PermissionProviderBase { ... }
 *
 * // elsewhere — the factory consults it automatically:
 * ClassFactory.CreateInstance(PermissionProviderBase, 'NoSuchKey');  // throws, with context
 * ClassFactory.TryCreateInstance(PermissionProviderBase, 'NoSuchKey'); // { Resolved: false }
 * ```
 *
 * ## Why a decorator rather than `static RequiresSubclass = true`
 * 1. It matches the existing `@RegisterClass` idiom, so the two read as siblings.
 * 2. The marker key is defined once here instead of being retyped as a literal in every base.
 * 3. Most importantly, it lets the OWN-PROPERTY check live in one helper. A plain
 *    `cls.RequiresSubclass` read walks the constructor prototype chain, so every SUBCLASS of a
 *    marked base reports `true` as well — resolving against a concrete subclass would then
 *    wrongly throw. `ClassRequiresSubclass` checks for an OWN property, so the marker applies
 *    to exactly the class that declared it.
 */

/**
 * The marker key. Deliberately `__mj_`-prefixed and non-enumerable so it cannot collide with
 * application fields, appear in object spreads, or show up in serialized instances.
 */
export const REQUIRES_SUBCLASS_KEY = '__mj_RequiresSubclass';

/**
 * Class decorator declaring that this class must never be used as a ClassFactory fallback.
 *
 * Applies an own, non-enumerable marker to the class prototype. Subclasses do NOT inherit the
 * marker for the purposes of `ClassRequiresSubclass` (see the own-property note above), which
 * is the point: a concrete subclass of a marked base is perfectly instantiable.
 */
export function RequiresSubclass(): (constructor: Function) => void {
    return function (constructor: Function): void {
        Object.defineProperty(constructor.prototype, REQUIRES_SUBCLASS_KEY, {
            value: true,
            enumerable: false,   // never appear in spreads / JSON / for-in
            writable: false,
            configurable: true,  // configurable so tests and hot-reload can redefine
        });
    };
}

/**
 * True iff `target` itself is marked `@RequiresSubclass()`.
 *
 * Accepts either a class (constructor) or an instance, so callers don't have to normalize.
 * Uses an OWN-property check, so a subclass of a marked base returns `false` — only the class
 * that actually declared the marker is treated as non-instantiable.
 *
 * Also honors the legacy `static RequiresSubclass = true` form (same own-property semantics)
 * so bases written before the decorator existed keep working. Prefer the decorator.
 */
export function ClassRequiresSubclass(target: unknown): boolean {
    if (target == null) {
        return false;
    }
    const proto = typeof target === 'function'
        ? (target as { prototype?: object }).prototype
        : Object.getPrototypeOf(target as object);

    if (proto && Object.prototype.hasOwnProperty.call(proto, REQUIRES_SUBCLASS_KEY)) {
        return (proto as Record<string, unknown>)[REQUIRES_SUBCLASS_KEY] === true;
    }

    // Legacy form: `static RequiresSubclass = true` declared directly on the class.
    const ctor = typeof target === 'function' ? target : (target as object)?.constructor;
    if (ctor && Object.prototype.hasOwnProperty.call(ctor, 'RequiresSubclass')) {
        return (ctor as unknown as Record<string, unknown>)['RequiresSubclass'] === true;
    }
    return false;
}
