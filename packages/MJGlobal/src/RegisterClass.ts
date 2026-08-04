import { MJGlobal } from './Global';

/**
 * Options bag accepted by `RegisterClassEx`. Use this when you want named
 * fields instead of a long positional argument list — especially when
 * attaching `metadata` for structured discovery via
 * `ClassFactory.GetAllRegistrationsByMetadata`.
 *
 * Adding a field here is the right way to extend the registration contract
 * going forward — no more "yet another positional parameter."
 */
export interface RegisterClassOptions {
    /** Discriminator key used to look up registrations by `GetRegistration` etc. */
    key?: string | null;
    /** Higher = wins ties. See `ClassFactory.Register` for the auto-increment behavior. */
    priority?: number;
    /** Suppress the "registration has no key" console warning. */
    skipNullKeyWarning?: boolean;
    /** Auto-register against the hierarchy root class in addition to `baseClass`. */
    autoRegisterWithRootClass?: boolean;
    /**
     * Arbitrary structured metadata persisted on the `ClassRegistration`. Pair
     * with `ClassFactory.GetAllRegistrationsByMetadata` for structured discovery.
     * Common shapes include `{ entity, slot, sortKey }` for form-panel slots.
     */
    metadata?: Record<string, unknown>;
}

/**
 * Decorate your class with this to register it with the MJGlobal class factory.
 *
 * Classic positional form. The fifth and earlier parameters are unchanged from
 * the original signature — existing call sites keep working byte-for-byte.
 *
 * @remarks **Prefer `RegisterClassEx` for new code** when you have anything
 * beyond `(baseClass, key, priority)` to specify — the options-bag signature
 * scales much better than positional booleans, and it's the natural place to
 * attach the structured `metadata` bag used by dynamic discovery features
 * (form-panel slots, etc.). The `metadata` positional param here is provided
 * for parity and brevity, but reads worse than `{ metadata: {...} }` once the
 * decorator wraps onto multiple lines.
 *
 * @param baseClass A reference to the base class you are registering a sub-class for
 * @param key A string used to retrieve a given registration. Should be unique per baseClass/key combination; if multiple registrations exist for a given baseClass/key, the highest priority registration wins at lookup time.
 * @param priority Higher priority registrations beat lower. If unset (or 0), the priority is auto-incremented based on the highest existing priority for the same baseClass/key — so later registrations naturally win, which is the standard dependency-injection-by-import-order pattern.
 * @param skipNullKeyWarning If true, suppresses the "registration has no key" console warning. Useful when null keys are intentional.
 * @param autoRegisterWithRootClass If true, also registers against the root class of the hierarchy in addition to `baseClass`.
 * @param metadata Optional structured metadata persisted on the `ClassRegistration`. Used for filterable / sortable discovery via `ClassFactory.GetAllRegistrationsByMetadata`. Common shape: `{ entity, slot, sortKey }` for form-panel slots. For new code, prefer the {@link RegisterClassEx} options-bag form.
 */
export function RegisterClass(
    baseClass: unknown,
    key: string | null = null,
    priority: number = 0,
    skipNullKeyWarning: boolean = false,
    autoRegisterWithRootClass: boolean = false,
    metadata?: Record<string, unknown>,
): (constructor: Function) => void {
    return function (constructor: Function) {
        MJGlobal.Instance.ClassFactory.Register(baseClass, constructor, key, priority, skipNullKeyWarning, autoRegisterWithRootClass, metadata);
    }
}

/**
 * Decorate your class with this to register it with the MJGlobal class factory
 * using a structured options bag. The `Ex` suffix follows MJ's existing
 * `Foo` / `FooAsync` / `FooEx` naming convention for "same thing, modern variant."
 *
 * **Prefer this over `RegisterClass` for new code** when you have anything
 * beyond `(baseClass, key, priority)` to specify. The positional form gets
 * unwieldy past three args and the boolean flags read as anonymous magic.
 *
 * Same registration semantics as `RegisterClass` under the hood — pick the
 * shape that reads best at the call site.
 *
 * @example Structured panel registration with metadata
 * ```ts
 * @RegisterClassEx(BaseFormPanel, {
 *     key: 'content-sources:tag-pipeline',
 *     skipNullKeyWarning: true,
 *     metadata: {
 *         entity: 'MJ: Content Sources',
 *         slot: 'after-fields',
 *         sortKey: 100,
 *     },
 * })
 * export class TagPipelinePanel extends BaseFormPanel { ... }
 * ```
 *
 * @param baseClass A reference to the base class you are registering a sub-class for
 * @param options Structured options — see {@link RegisterClassOptions}. All fields optional.
 */
export function RegisterClassEx(baseClass: unknown, options: RegisterClassOptions = {}): (constructor: Function) => void {
    return function (constructor: Function) {
        MJGlobal.Instance.ClassFactory.Register(
            baseClass,
            constructor,
            options.key ?? null,
            options.priority ?? 0,
            options.skipNullKeyWarning ?? false,
            options.autoRegisterWithRootClass ?? false,
            options.metadata,
        );
    };
}
