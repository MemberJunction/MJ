import { ExtractActualDefaultValue } from "./util";
import type { IMetadataProvider } from "./interfaces";

/**
 * Back-references from Info objects to the metadata provider that built them. Held OUTSIDE the
 * instances (a WeakMap rather than a field) so the reference can never leak into `toJSON()`,
 * `Object.keys()`, `copyInitData` of a clone, or the local metadata cache — and so an Info object
 * never keeps its provider reachable on its own account.
 */
const owningProviders = new WeakMap<BaseInfo, IMetadataProvider>();

/**
 * Per-constructor cache of property names that resolve to a settable accessor (`set` function)
 * on the subclass prototype chain. Avoids repeated prototype walks during `copyInitData`.
 */
const settableAccessorsByClass = new WeakMap<Function, Set<string>>();

/**
 * Per-constructor cache mapping `_`-prefixed private backing field names (e.g. `_fields`) to
 * their public getter name on the prototype chain (e.g. `Fields`), or `null` when no public
 * getter exists. Avoids repeated prototype walks during `toJSON()` serialization.
 */
const backingGetterByClass = new WeakMap<Function, Map<string, string | null>>();

/**
 * Base class for all MemberJunction metadata info classes.
 * Provides common functionality for copying initialization data and handling default values.
 * All Info classes (EntityInfo, QueryInfo, etc.) extend this base class.
 */
export abstract class BaseInfo {
    /**
     * Primary Key
     */
    ID: any = null

    /**
     * The metadata provider that built this Info object, when known.
     *
     * Info getters that resolve sibling metadata (an entity's IS-A children, a permission's RLS
     * filter, a query's fields, an authorization's roles, …) must read from the SAME provider the
     * object came from. In a multi-provider process — several `GraphQLDataProvider` instances with
     * `separateConnection`, or a server servicing several connections — the global
     * `Metadata.Provider` is a different provider or not set at all. Providers pass themselves to
     * every Info constructor (`new m.class(row, provider)`), and container Info objects hand it to
     * the child Info objects they construct.
     *
     * `undefined` for an Info object built outside a provider (tests, ad-hoc construction). Callers
     * then fall back to the global provider, which is exactly the pre-existing behavior.
     */
    public get OwningProvider(): IMetadataProvider | undefined {
        return owningProviders.get(this);
    }

    /**
     * Records the provider that owns this Info object. A null/undefined provider is ignored, so
     * passing an optional constructor argument straight through is always safe.
     * @param provider - the provider whose metadata this object belongs to
     */
    public SetOwningProvider(provider: IMetadataProvider | null | undefined): void {
        if (provider) {
            owningProviders.set(this, provider);
        }
    }

    /**
     * Returns the cached set of settable accessor names on `instance`'s prototype chain.
     *
     * A `@deprecated` alias for a renamed field is a get/set pair on the prototype, not an own
     * property, so `hasOwnProperty` does not see it. Without this the incoming value is silently
     * dropped: the DB column `spCreate` stops reaching `SpCreate`, and the entity loads with its
     * custom routine name missing rather than failing loudly.
     *
     * Only accessors that can be WRITTEN qualify. A read-only getter has nothing to assign to, and
     * requiring a setter keeps inherited methods out of the copy.
     */
    private static getSettableAccessorsForInstance(instance: BaseInfo): Set<string> {
        const ctor = instance.constructor;
        let cached = settableAccessorsByClass.get(ctor);
        if (cached) {
            return cached;
        }
        cached = new Set<string>();
        const seen = new Set<string>();
        let target = Object.getPrototypeOf(instance);
        while (target && target !== Object.prototype) {
            const descriptors = Object.getOwnPropertyDescriptors(target);
            const names = Object.keys(descriptors);
            for (let i = 0; i < names.length; i++) {
                const name = names[i];
                if (seen.has(name)) continue;
                seen.add(name);
                if (typeof descriptors[name].set === 'function') {
                    cached.add(name);
                }
            }
            target = Object.getPrototypeOf(target);
        }
        settableAccessorsByClass.set(ctor, cached);
        return cached;
    }

    /**
     * Resolves and caches the public getter name on `instance`'s prototype chain corresponding
     * to a `_`-prefixed backing field (or `null` if no matching getter exists).
     */
    private static resolveBackingGetterKey(instance: BaseInfo, backingKey: string): string | null {
        const ctor = instance.constructor;
        let map = backingGetterByClass.get(ctor);
        if (!map) {
            map = new Map<string, string | null>();
            backingGetterByClass.set(ctor, map);
        }
        const existing = map.get(backingKey);
        if (existing !== undefined) {
            return existing;
        }
        const lowerKey = backingKey.slice(1);
        if (!lowerKey) {
            map.set(backingKey, null);
            return null;
        }
        const pascalKey = lowerKey.charAt(0).toUpperCase() + lowerKey.slice(1);
        let proto = Object.getPrototypeOf(instance);
        while (proto && proto !== Object.prototype) {
            const targetKey = Object.prototype.hasOwnProperty.call(proto, pascalKey) ? pascalKey : lowerKey;
            const desc = Object.getOwnPropertyDescriptor(proto, targetKey);
            if (desc && typeof desc.get === 'function') {
                map.set(backingKey, targetKey);
                return targetKey;
            }
            proto = Object.getPrototypeOf(proto);
        }
        map.set(backingKey, null);
        return null;
    }

    /**
     * Copies initialization data from a plain object to the class instance.
     * Only copies properties that already exist on the class to prevent creating new fields.
     * Special handling for DefaultValue fields to extract actual values from SQL Server syntax.
     * @param initData - The initialization data object
     * @param skipKeys - Optional set of property keys handled directly by the subclass constructor
     */
    protected copyInitData(initData: any, skipKeys?: ReadonlySet<string>) {
        if (initData) {
            const self = this as Record<string, unknown>;
            let settableAccessors: Set<string> | undefined;
            // copy the properties from the init data to the new class instance we are constructing
            const keys = Object.keys(initData);
            for (let j = 0; j < keys.length; j++) {
                const key = keys[j];
                if (skipKeys && skipKeys.has(key)) {
                    continue;
                }
                const val = initData[key];
                const isOwn = Object.prototype.hasOwnProperty.call(this, key);
                if (isOwn && val === null && self[key] === null) {
                    continue;
                }
                // make sure it is one of our keys, we don't want to create NEW fields
                if (isOwn || (settableAccessors ??= BaseInfo.getSettableAccessorsForInstance(this)).has(key)) {
                    // fast path for exact match first, fallback to length check + lowercasing
                    if ((key === 'DefaultValue' || (key.length === 12 && key.toLowerCase() === 'defaultvalue')) && val) {
                        // strip parens from default value from the DB, if they exist, for example defaults might be ((1)) or (getdate())   
                        // could also be something like (('Pending')) in which case we'll want to remove the SYMMETRIC parens
                        const initialValue: string = val;
                        const trueDefault: string = ExtractActualDefaultValue(initialValue);
                        self[key] = trueDefault;
                    }
                    else {
                        self[key] = val;
                    }
                }
                else {
                    const lowerUnderscoreKey = `_${key.charAt(0).toLowerCase()}${key.slice(1)}`;
                    const underscoreKey = `_${key}`;
                    if (Object.prototype.hasOwnProperty.call(this, lowerUnderscoreKey) || hasMemoField(this, lowerUnderscoreKey)) {
                        self[lowerUnderscoreKey] = val;
                    }
                    else if (Object.prototype.hasOwnProperty.call(this, underscoreKey) || hasMemoField(this, underscoreKey)) {
                        self[underscoreKey] = val;
                    }
                }
            }
        }
    }

    /**
     * Creates a new instance of the BaseInfo-derived class.
     * @param initData - Optional initialization data to populate the instance
     */
    constructor(initData: any = null) {
        if (initData) {
            this.copyInitData(initData);
        }
    }

    /**
     * Default JSON serialization for BaseInfo subclasses.
     *
     * Emits all non-underscored direct field declarations. For `_`-prefixed private backing fields
     * (the MJ pattern for collection storage — e.g. `_Fields`, `_RelatedEntities`, `_OrganicKeys`),
     * emits the value of the corresponding same-named public getter instead. Purely computed getters
     * without a backing field (display-name formatters, derived flags) are intentionally skipped —
     * they can throw when source fields are null and don't belong on the wire anyway.
     *
     * A `_`-backed getter that throws is omitted from the output rather than aborting the whole
     * serialization. That omission is safe ONLY because such getters are recomputable: the backing
     * field is a lazy cache over other serialized state (e.g. QueryInfo.CategoryPath over CategoryID),
     * so the value is rebuilt on the next access after a warm boot. Do not add a `_`-backed getter
     * whose value cannot be recomputed from the serialized fields — a throw would silently drop it.
     *
     * Nested BaseInfo instances and arrays of them unwrap automatically via JSON.stringify's
     * native toJSON() protocol.
     *
     * Subclasses may override to emit a filtered subset or custom shape (see EntityFieldValueInfo).
     */
    toJSON(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const self = this as unknown as Record<string, unknown>;
        const keys = Object.keys(this);
        // Memo fields live behind prototype accessors, not as own fields; serialize the ones that are
        // set exactly as the plain fields they replaced were serialized.
        const memoNames = memoFieldsOf(this);
        if (memoNames.length > 0) {
            const memo = memoHolderOf(this);
            for (const name of memoNames) {
                if (name in memo) {
                    keys.push(name);
                }
            }
        }

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!key.startsWith('_')) {
                result[key] = self[key];
                continue;
            }
            // Private backing field — expose via its public getter if one exists with the same name minus the underscore
            const targetKey = BaseInfo.resolveBackingGetterKey(this, key);
            if (targetKey !== null) {
                // A getter reached through a backing field must not abort the whole
                // serialization. The contract above already says computed getters can throw
                // when their sources are not ready; a `_`-backed getter can too — e.g.
                // QueryInfo.CategoryPath walks Metadata.Provider.QueryCategories, which does
                // not exist yet during the initial metadata load. Omitting one key is strictly
                // better than losing the entire snapshot: the value is recomputed lazily on
                // the next access, and the local metadata cache still gets written.
                try {
                    result[targetKey] = self[targetKey];
                }
                catch {
                    // intentionally omitted from the serialized shape
                }
            }
        }

        return result;
    }
}

/** A concrete or abstract Info class, for {@link RegisterInfoMemoFields}. */
export type InfoClass = abstract new (...args: never[]) => BaseInfo;

/** Key of each Info object's memo holder: a plain object that is never frozen. */
const MEMO: unique symbol = Symbol('mj.info.memo');

/** An Info object seen through its memo holder. */
interface MemoHost {
    readonly [MEMO]?: Record<string, unknown>;
}

/** Memo field names per Info class prototype, as registered with {@link RegisterInfoMemoFields}. */
const memoFieldsByPrototype = new Map<object, readonly string[]>();

/** Memo field names for an instance's whole prototype chain, per constructor. */
const memoFieldsByConstructor = new WeakMap<Function, readonly string[]>();

/** Objects already visited by {@link DeepFreezeInfoValue}, so a refresh only walks new objects. */
const deepFrozen = new WeakSet<object>();

/**
 * Returns the Info object's memo holder, creating it on first use (also for objects built with
 * `Object.create(prototype)`, which skip the constructor). Non-enumerable and symbol-keyed, so
 * `Object.keys`, `toJSON()`, `copyInitData` and spreads never see or copy it.
 */
function memoHolderOf(info: BaseInfo): Record<string, unknown> {
    const existing = (info as unknown as MemoHost)[MEMO];
    if (existing) {
        return existing;
    }
    const holder: Record<string, unknown> = {};
    if (Object.isExtensible(info)) {
        Object.defineProperty(info, MEMO, { value: holder, enumerable: false, writable: false, configurable: false });
    }
    // Frozen elsewhere without a holder: the value is computed but not cached.
    return holder;
}

/**
 * Registers the memo fields of an Info class (#3095).
 *
 * A memo field is a `_` field the class writes after construction to cache a derived value (a field
 * map, the primary keys, parsed configuration, ...). Each one becomes an accessor on the class
 * prototype that reads and writes a per-object holder instead of an own field. The holder is never
 * frozen, so when a shared metadata graph is frozen in development ({@link DeepFreezeInfoValue}) the
 * getters that fill these caches keep working. The class code is unchanged: `this._x` reads and
 * assignments go through the accessor.
 *
 * A new lazily-cached `_` field must be added here, or its first write on a frozen object throws.
 * Call it once per class, right after the class declaration.
 * @param infoClass - the class declaring the fields
 * @param names - the field names, `_` prefix included
 */
export function RegisterInfoMemoFields(infoClass: InfoClass, names: readonly string[]): void {
    const proto = infoClass.prototype;
    for (const name of names) {
        Object.defineProperty(proto, name, {
            configurable: true,
            enumerable: false,
            get(this: BaseInfo): unknown {
                return memoHolderOf(this)[name];
            },
            set(this: BaseInfo, value: unknown) {
                if (Object.isFrozen(this)) {
                    // A value cached after the freeze is shared just like one cached before it.
                    DeepFreezeInfoValue(value);
                }
                memoHolderOf(this)[name] = value;
            }
        });
    }
    memoFieldsByPrototype.set(proto, names);
}

/** The registered memo field names of an Info object's class and its base classes. */
function memoFieldsOf(info: BaseInfo): readonly string[] {
    const ctor = info.constructor;
    let names = memoFieldsByConstructor.get(ctor);
    if (!names) {
        const collected: string[] = [];
        let proto: object | null = Object.getPrototypeOf(info);
        while (proto && proto !== Object.prototype) {
            const own = memoFieldsByPrototype.get(proto);
            if (own) {
                collected.push(...own);
            }
            proto = Object.getPrototypeOf(proto);
        }
        names = collected;
        memoFieldsByConstructor.set(ctor, names);
    }
    return names;
}

/** Whether `name` is a registered memo field of the Info object's class chain. */
function hasMemoField(info: BaseInfo, name: string): boolean {
    return memoFieldsOf(info).includes(name);
}

/**
 * Deep-freezes a value of the metadata graph (#3095): arrays, Info objects and plain objects, and
 * everything they hold. Other class instances (a provider, a user), `Map` and `Set` are left as is,
 * and so is each Info object's memo holder, so memoizing getters keep working
 * ({@link RegisterInfoMemoFields}). Idempotent: objects already frozen are not walked again.
 * @param value - the value to freeze
 */
export function DeepFreezeInfoValue(value: unknown): void {
    if (value === null || typeof value !== 'object' || deepFrozen.has(value)) {
        return;
    }
    deepFrozen.add(value);
    if (Array.isArray(value)) {
        Object.freeze(value);
        for (let i = 0; i < value.length; i++) {
            DeepFreezeInfoValue(value[i]);
        }
        return;
    }
    const isInfo = value instanceof BaseInfo;
    if (!isInfo && !isPlainObject(value)) {
        return;
    }
    if (isInfo) {
        memoHolderOf(value); // must exist before the object stops accepting new properties
    }
    Object.freeze(value);
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        DeepFreezeInfoValue(record[key]);
    }
    if (isInfo) {
        // Values already cached are shared like the rest of the graph; the holder itself stays writable.
        const memo = memoHolderOf(value);
        for (const key of Object.keys(memo)) {
            DeepFreezeInfoValue(memo[key]);
        }
    }
}

function isPlainObject(value: object): boolean {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
