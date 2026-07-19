/*******************************************************************************************************
 * MJ Global Class Factory handles both the registration and instantiation of any class that we need to create across any MJ Project
 * 
 * The idea is to have a global place where we can register a subclass for a given base class and then call a simple class factory method to 
 * instantiate whatever class we need. This allows any module at any time to register their new class for a given base class as a sub-class 
 * and we will dynamically instantiate that sub-class from that point forward
 ******************************************************************************************************/

import { GetRootClass, IsRootClass } from './ClassUtils';

/**
 * Type for constructor functions that have a name property
 */
type NamedClass = { name: string };

/**
 * Data structure to track the class registrations
 */
export class ClassRegistration {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    BaseClass: any; // The TYPE of the base class, NOT an instance of the base class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SubClass: any; // The TYPE of the sub-class, NOT an instance of the sub-class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RootClass: any; // The TYPE of the root class, NOT an instance of the root class. This is used to determine if the baseClass is a root class or not
    Key: string | null = null; // used to identify a special attribute that we use to determine if this is the right sub-class. For example, in the case of BaseEntity and Entity object subclasses we'll have a LOT of entries
                // in the registration list, so we'll use the key to identify which sub-class to use for a given entity
    Priority: number = 0; // if there are multiple entries for a given combination of baseClass and subClass and key, we will use the priority to determine which one to use. The higher the number, the higher the priority
    /**
     * Optional structured metadata. Useful when callers want to attach
     * filterable/sortable attributes to a registration without polluting the
     * Key string (e.g. form-panel slots: { entity, slot, sortKey }).
     *
     * Pair with `ClassFactory.GetAllRegistrationsByMetadata()` /
     * `GetAllRegistrationsByKeyPrefix()` / `GetAllRegistrationsByKeyPattern()`
     * to discover registrations beyond exact-key matching.
     */
    Metadata?: Record<string, unknown>;
}
 

/**
 * The outcome of a {@link ClassFactory.TryCreateInstance} call — an EXPLICIT resolution result
 * so callers can distinguish "a registered subclass was found and instantiated" from "no
 * registration matched the key and we fell back to the anchor base class".
 *
 * ## Why this type exists
 * {@link ClassFactory.CreateInstance} has NEVER returned `null` for an unregistered key — it
 * falls back to `new BaseClass(...)`. Call sites written as `const x = CreateInstance(Base, key);
 * if (x) { use it } else { error }` therefore have a DEAD else-branch and silently install a
 * hollow base-class object. That failure mode is invisible until something calls a method the
 * base does not implement. `TryCreateInstance` makes the distinction explicit and checkable.
 */
export type ClassResolutionResult<T> = {
    /**
     * `true` only when a REGISTERED subclass matched the requested key. `false` means the key did
     * not resolve — check {@link Instance} to see whether a base-class fallback was produced.
     */
    Resolved: boolean;
    /**
     * The instance to use, or `null`.
     *
     * - `Resolved: true` → the registered subclass instance.
     * - `Resolved: false` and the anchor base declares `static RequiresSubclass = true` → `null`
     *   (the base cannot function standalone, so no fallback is produced).
     * - `Resolved: false` and no marker → the base-class fallback instance. This is a legitimate,
     *   long-standing pattern (e.g. `BaseEntity`, which is fully functional standalone).
     */
    Instance: T | null;
    /** Human-readable explanation, present whenever `Resolved` is `false`. */
    Reason?: string;
};

/**
 * Shape of a base class that opts in to the "I cannot be instantiated standalone" contract.
 *
 * TypeScript's `abstract` keyword is ERASED at runtime — there is no marker property, and plain
 * JS will happily `new` an abstract class — so abstractness cannot be introspected. Bases that
 * genuinely cannot function without a subclass therefore declare this static marker explicitly.
 */
type SubclassRequiringClass = { RequiresSubclass?: boolean };

/**
 * ClassFactory is used to register and create instances of classes. It is a singleton class that can be used to register a sub-class for a given base class and key. Do NOT directly attempt to instantiate this class,
 * instead use the static Instance property of the MJGlobal class to get the instance of the ClassFactory for your application.
 */
export class ClassFactory {
    private _registrations: ClassRegistration[] = [];

    /**
     * Memoized results of {@link GetRegistration}, keyed by `baseClassName|normalizedKey`.
     * GetRegistration is on extremely hot paths (every `CreateInstance`, including one call
     * per entity field during hydration) and otherwise re-`filter()`s the entire global
     * registration list on every call. The map is fully cleared whenever a new registration
     * is added (see {@link Register}) so it can never serve a stale result — registrations are
     * almost always all added at startup, so in practice the cache is built once and reused.
     * A `null` value is a cached "no registration found" (still a valid, useful memo).
     */
    private _registrationCache: Map<string, ClassRegistration | null> = new Map();

    /**
     * Registered lazy loader callbacks. When `GetRegistrationAsync` or `CreateInstanceAsync`
     * cannot find a registration synchronously, these loaders are called in order until one
     * succeeds (returns `true`). This allows multiple consumers/layers to register their own
     * lazy loading strategies (e.g., Angular chunk loading, server-side dynamic imports).
     *
     * Each loader receives the base class name and key, and should return `true` if it
     * successfully loaded the module containing the requested class registration.
     */
    private _lazyLoaders: ((baseClassName: string, key: string) => Promise<boolean>)[] = [];

    /**
     * `baseClassName|normalizedKey` pairs whose base-class-fallback diagnostic has already been
     * emitted, so a hot-path resolution failure logs once instead of on every call.
     */
    private _reportedResolutionFailures: Set<string> = new Set();

    /**
     * Registers a lazy loader callback that will be called when a class registration cannot
     * be found synchronously. Multiple loaders can be registered and will be called in order
     * until one succeeds.
     *
     * @param loader A function that receives (baseClassName, key) and returns a Promise<boolean>
     *               indicating whether it successfully loaded the module containing the registration.
     */
    public RegisterLazyLoader(loader: (baseClassName: string, key: string) => Promise<boolean>): void {
        this._lazyLoaders.push(loader);
    }

    /**
     * Attempts to lazy-load a missing registration by calling registered lazy loaders in order.
     * Returns true if any loader successfully loaded the requested class.
     */
    private async tryLazyLoad(baseClass: unknown, key: string): Promise<boolean> {
        const baseClassName = (baseClass as NamedClass).name;
        for (const loader of this._lazyLoaders) {
            const loaded = await loader(baseClassName, key);
            if (loaded) {
                return true;
            }
        }
        return false;
    }

    /**
     * Async version of GetRegistration that supports lazy loading. If no registration is found
     * synchronously and lazy loaders are registered, attempts to load the missing module before
     * retrying the lookup.
     *
     * @param baseClass The base class to look up
     * @param key Optional key to differentiate registrations
     * @returns The matching ClassRegistration, or null if not found even after lazy loading
     */
    public async GetRegistrationAsync(baseClass: unknown, key?: string | null): Promise<ClassRegistration | null> {
        let reg = this.GetRegistration(baseClass, key);
        if (!reg && key && this._lazyLoaders.length > 0) {
            const loaded = await this.tryLazyLoad(baseClass, key);
            if (loaded) {
                reg = this.GetRegistration(baseClass, key);
            }
        }
        return reg;
    }

    /**
     * Async version of CreateInstance that supports lazy loading. If no registration is found
     * synchronously and lazy loaders are registered, attempts to load the missing module before
     * retrying and creating the instance.
     *
     * Falls back to instantiating the base class directly if no registration is found even
     * after lazy loading (same behavior as the sync CreateInstance) — including throwing when the
     * anchor base declares `static RequiresSubclass = true`.
     */
    public async CreateInstanceAsync<T>(baseClass: unknown, key: string | null = null, ...params: unknown[]): Promise<T | null> {
        if (!baseClass) {
            return null;
        }

        const reg = await this.GetRegistrationAsync(baseClass, key);
        const result = this.resolveAndInstantiate<T>(baseClass, reg, key, params);
        if (!result.Resolved && result.Instance === null) {
            throw new Error(result.Reason);
        }
        return result.Instance;
    }

    /**
     * Explicit-result, lazy-loading-aware sibling of {@link TryCreateInstance}. Never throws for
     * an unresolved key.
     */
    public async TryCreateInstanceAsync<T>(baseClass: unknown, key: string | null = null, ...params: unknown[]): Promise<ClassResolutionResult<T>> {
        if (!baseClass) {
            return { Resolved: false, Instance: null, Reason: 'ClassFactory: no base class was provided.' };
        }
        const reg = await this.GetRegistrationAsync(baseClass, key);
        return this.resolveAndInstantiate<T>(baseClass, reg, key, params);
    }

    /**
     * Use this method or the @RegisterClass decorator to register a sub-class for a given base class.
     * @param baseClass A reference to the base class you are registering a sub-class for
     * @param subClass A reference to the sub-class you are registering
     * @param key A key can be used to differentiate registrations for the same base class/sub-class combination. For example, in the case of BaseEntity and Entity object subclasses we'll have a LOT of entries and we want to get the highest priority registered sub-class for a specific key. In that case, the key is the entity name, but the key can be any value you want to use to differentiate registrations.
     * @param priority Higher priority registrations will be used over lower priority registrations. If there are multiple registrations for a given base class/sub-class/key combination, the one with the highest priority will be used. If there are multiple registrations with the same priority, the last one registered will be used. Finally, if you do NOT provide this setting, the order of registrations will increment the priority automatically so dependency injection will typically care care of this. That is, in order for Class B, a subclass of Class A, to be registered properly, Class A code has to already have been loaded and therefore Class A's RegisterClass decorator was run. In that scenario, if neither Class A or B has a priority setting, Class A would be 1 and Class B would be 2 automatically. For this reason, you only need to explicitly set priority if you want to do something atypical as this mechanism normally will solve for setting the priority correctly based on the furthest descendant class that is registered.
     * @param skipNullKeyWarning If true, will not print a warning if the key is null or undefined. This is useful for cases where you know that the key is not needed and you don't want to see the warning in the console.
     * @param autoRegisterWithRootClass If true, will automatically register the subclass with the root class of the baseClass hierarchy. This ensures proper priority ordering when multiple subclasses are registered in a hierarchy. Defaults to false to preserve the original registration contract where classes are stored under the baseClass you specify.
     */
    public Register(baseClass: unknown, subClass: unknown, key: string | null = null, priority: number = 0, skipNullKeyWarning: boolean = false, autoRegisterWithRootClass: boolean = false, metadata?: Record<string, unknown>): void {
        if (baseClass && subClass) {
            const baseClassName = (baseClass as NamedClass).name;
            const subClassName = (subClass as NamedClass).name;

            if (key === undefined || key === null && !skipNullKeyWarning) {
                console.warn(`ClassFactory.GetAllRegistrations: Registration for base class ${baseClassName} has no key set. This is not recommended and may lead to unintended behavior when trying to match registrations. Please set a key for this registration.`)
            }

            // Get the root class for this registration
            const rootClass = GetRootClass(baseClass);
            const rootClassName = (rootClass as NamedClass).name;

            // Determine which class to actually register against
            const effectiveBaseClass = autoRegisterWithRootClass ? rootClass : baseClass;
            const effectiveBaseClassName = (effectiveBaseClass as NamedClass).name;

            // Log if we're auto-registering with root class
            if (autoRegisterWithRootClass && effectiveBaseClass !== baseClass) {
                console.info(`ClassFactory.Register: Auto-registering ${subClassName} with root class ${rootClassName} instead of ${baseClassName}`);
            }

            // get all of the existing registrations for the effective base class and key
            const registrations = this.GetAllRegistrations(effectiveBaseClass, key);

            if (priority > 0) {
                // validate to make sure that the combination of base class and key for the provided priority # is not already registered, if it is, then print a warning
                const existing = registrations.filter(r => r.Priority === priority);
                if (existing && existing.length > 0) {
                    console.warn(`*** ClassFactory.Register: Registering class ${subClassName} for base class ${effectiveBaseClassName} and key/priority ${key}/${priority}. ${existing.length} registrations already exist for that combination. While this is allowed it is not desired and when matching class requests occur, we will simply use the LAST registration we happen to have which can lead to unintended behavior. ***`);
                }
            }
            else if (priority === 0 || priority === null || priority === undefined) {
                // when priority is not provided or is zero, which is logically the same, check to see what the highest earlier registration was and increment by 1
                // this automatically makes the most recent registration higher, IF IT DIDN'T ALREADY have a priority explicitly set
                let highestPriority = 0;
                for (let i = 0; i < registrations.length; i++) {
                    if (registrations[i].Priority > highestPriority)
                        highestPriority = registrations[i].Priority;
                }
                // now set the priority to one higher than the highest priority we found
                priority = highestPriority + 1;
            }

            // this combination of baseclass/key/priority is NOT already registered.
            let reg = new ClassRegistration();
            reg.BaseClass = effectiveBaseClass;
            reg.SubClass = subClass;
            reg.RootClass = rootClass;
            reg.Key = key;
            reg.Priority = priority;
            if (metadata !== undefined) reg.Metadata = metadata;

            this._registrations.push(reg);
            // Invalidate the GetRegistration memo — a new registration may change the
            // highest-priority winner for any (baseClass, key) bucket.
            this._registrationCache.clear();
            // A new registration may resolve a key that previously fell back, so allow the
            // diagnostic to be emitted again if it fails a second time.
            this._reportedResolutionFailures.clear();
        }
    }

    /**
     * Creates an instance of the class registered for the given base class and key.
     *
     * If no registration is found, falls back to instantiating the base class itself — a
     * long-standing, deliberate behavior that legitimate consumers (notably `BaseEntity`) rely on.
     * **This method therefore does NOT return `null` for an unregistered key**, so `if (instance)`
     * is not a valid resolution-failure test. Use {@link TryCreateInstance} when you need to know
     * whether the key actually resolved.
     *
     * @throws when the key does not resolve AND the anchor base class declares
     *         `static RequiresSubclass = true` (i.e. it cannot function standalone). Bases without
     *         that marker keep the historical fallback behavior and only emit a structured warning.
     */
    public CreateInstance<T>(baseClass: unknown, key: string | null = null, ...params: unknown[]): T | null {
        const result = this.resolveAndInstantiate<T>(baseClass, this.GetRegistration(baseClass, key), key, params);
        if (!result.Resolved && result.Instance === null && baseClass) {
            // The base explicitly cannot stand alone — fail LOUD rather than handing back a hollow object.
            throw new Error(result.Reason);
        }
        return result.Instance;
    }

    /**
     * Explicit-result sibling of {@link CreateInstance}. Never throws for an unresolved key —
     * returns a {@link ClassResolutionResult} so the caller can branch on `Resolved`.
     *
     * ```typescript
     * const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<MyProvider>(MyProviderBase, key);
     * if (!res.Resolved || !res.Instance) {
     *     LogError(`provider '${key}' did not resolve: ${res.Reason}`);
     *     return; // skip — do NOT install a hollow base instance
     * }
     * use(res.Instance);
     * ```
     */
    public TryCreateInstance<T>(baseClass: unknown, key: string | null = null, ...params: unknown[]): ClassResolutionResult<T> {
        return this.resolveAndInstantiate<T>(baseClass, this.GetRegistration(baseClass, key), key, params);
    }

    /**
     * Single shared resolution path behind `CreateInstance`, `TryCreateInstance`, and
     * `CreateInstanceAsync` — so the sync and async surfaces (and the throwing and non-throwing
     * surfaces) can never drift apart in how they treat a fallback.
     */
    private resolveAndInstantiate<T>(
        baseClass: unknown,
        reg: ClassRegistration | null,
        key: string | null,
        params: unknown[]
    ): ClassResolutionResult<T> {
        if (!baseClass) {
            return { Resolved: false, Instance: null, Reason: 'ClassFactory: no base class was provided.' };
        }

        if (reg) {
            const SubClassConstructor = reg.SubClass as new (...args: unknown[]) => T;
            return { Resolved: true, Instance: new SubClassConstructor(...params) };
        }

        // ── Fallback path: the requested key did not resolve to any registered subclass. ──
        const requiresSubclass = (baseClass as SubclassRequiringClass).RequiresSubclass === true;
        const reason = this.describeResolutionFailure(baseClass, key, requiresSubclass);
        this.reportResolutionFailure(baseClass, key, requiresSubclass, reason);

        if (requiresSubclass) {
            return { Resolved: false, Instance: null, Reason: reason };
        }

        // No marker — the base is presumed usable standalone (e.g. BaseEntity). Preserve the
        // historical fallback so existing, CORRECT consumers keep working.
        const BaseClassConstructor = baseClass as new (...args: unknown[]) => T;
        return { Resolved: false, Instance: new BaseClassConstructor(...params), Reason: reason };
    }

    /**
     * Builds the diagnostic message for a failed key resolution. The registered-key list is the
     * highest-value part: a typo'd or tree-shaken key is immediately obvious next to the keys the
     * factory actually knows about.
     */
    private describeResolutionFailure(baseClass: unknown, key: string | null, requiresSubclass: boolean): string {
        const baseClassName = (baseClass as NamedClass).name;
        const known = this.GetAllRegistrations(baseClass)
            .map(r => r.Key)
            .filter((k): k is string => k != null);
        const uniqueKnown = Array.from(new Set(known)).sort();
        const knownText = uniqueKnown.length > 0 ? uniqueKnown.map(k => `'${k}'`).join(', ') : '(none)';

        return (
            `ClassFactory: no registration found for base class '${baseClassName}' with key '${key ?? '(null)'}'. ` +
            `Registered keys for '${baseClassName}': ${knownText}. ` +
            `RequiresSubclass=${requiresSubclass}. ` +
            (requiresSubclass
                ? `'${baseClassName}' declares 'static RequiresSubclass = true', so it CANNOT be used as a fallback — ` +
                  `no instance was created. Likely causes: a typo in the key, a class that was never imported ` +
                  `(tree-shaken out — check the class-registration manifest), or a missing @RegisterClass decorator.`
                : `Falling back to an instance of '${baseClassName}' itself. If that base cannot function standalone, ` +
                  `declare 'static readonly RequiresSubclass = true' on it so this becomes a hard error.`)
        );
    }

    /**
     * Emits the fallback diagnostic exactly once per (baseClass, key) pair — resolution happens on
     * very hot paths (once per entity-field hydration), so an un-deduped log would be a firehose.
     * A captured stack is included so the offending call site is identifiable.
     */
    private reportResolutionFailure(baseClass: unknown, key: string | null, requiresSubclass: boolean, reason: string): void {
        const logKey = `${(baseClass as NamedClass).name}|${key == null ? '' : key.trim().toLowerCase()}`;
        if (this._reportedResolutionFailures.has(logKey)) return;
        this._reportedResolutionFailures.add(logKey);

        const stack = new Error().stack ?? '(stack unavailable)';
        const message = `${reason}\nCall site:\n${stack}`;
        if (requiresSubclass) console.error(message);
        else console.warn(message);
    }

    /**
     * Returns all registrations for a given base class and key. If key is not provided, will return all registrations for the base class.
     * @param baseClass 
     * @param key 
     * @returns 
     */
    public GetAllRegistrations(baseClass: unknown, key?: string | null): ClassRegistration[] {
        if (baseClass) {
            return this._registrations.filter(r => {
                const baseClassName = (baseClass as { name: string }).name;
                const regBaseClassName = (r.BaseClass as { name: string }).name;
                return  regBaseClassName === baseClassName && // we use the name of the class instead of the class itself because JS is finicky about this since a given module can be loaded in various places (like from multiple other modules) and the class itself will be different in each case
                        ( key === undefined || key === null ? true : r.Key?.trim().toLowerCase() === key.trim().toLowerCase())
            } );
        }
        else
            return [];
    }

    /**
     * Returns all registrations for a given base class whose `Key` STARTS WITH the
     * provided prefix (case-insensitive, trimmed). Useful when registrations follow
     * a naming convention with a structured prefix (e.g. `"<EntityName>:..."`).
     *
     * Prefer `GetAllRegistrationsByMetadata` when the discriminating data is
     * structured — putting tuples in the key string is fragile.
     */
    public GetAllRegistrationsByKeyPrefix(baseClass: unknown, keyPrefix: string): ClassRegistration[] {
        if (!baseClass || keyPrefix == null) return [];
        const baseClassName = (baseClass as { name: string }).name;
        const needle = keyPrefix.trim().toLowerCase();
        return this._registrations.filter(r => {
            const regBaseClassName = (r.BaseClass as { name: string }).name;
            if (regBaseClassName !== baseClassName) return false;
            return r.Key != null && r.Key.trim().toLowerCase().startsWith(needle);
        });
    }

    /**
     * Returns all registrations for a given base class whose `Key` matches the
     * provided regex (tested against the trimmed-but-original-case key). Use for
     * more nuanced discovery patterns than the prefix helper handles.
     */
    public GetAllRegistrationsByKeyPattern(baseClass: unknown, pattern: RegExp): ClassRegistration[] {
        if (!baseClass || !pattern) return [];
        const baseClassName = (baseClass as { name: string }).name;
        return this._registrations.filter(r => {
            const regBaseClassName = (r.BaseClass as { name: string }).name;
            if (regBaseClassName !== baseClassName) return false;
            return r.Key != null && pattern.test(r.Key.trim());
        });
    }

    /**
     * Returns all registrations for a given base class whose attached `Metadata`
     * bag satisfies the predicate. Registrations with no metadata are passed
     * `undefined` to the predicate.
     *
     * This is the recommended discovery path for structured per-registration
     * data (e.g. form-panel slots that filter by `{ entity, slot }`). It avoids
     * the brittleness of encoding tuples into the Key string.
     */
    public GetAllRegistrationsByMetadata(
        baseClass: unknown,
        predicate: (metadata: Record<string, unknown> | undefined, registration: ClassRegistration) => boolean
    ): ClassRegistration[] {
        if (!baseClass || typeof predicate !== 'function') return [];
        const baseClassName = (baseClass as { name: string }).name;
        return this._registrations.filter(r => {
            const regBaseClassName = (r.BaseClass as { name: string }).name;
            if (regBaseClassName !== baseClassName) return false;
            return predicate(r.Metadata, r);
        });
    }

    /**
     * Returns the registration with the highest priority for a given base class and key. If key is not provided, will return the registration with the highest priority for the base class.
     */
    public GetRegistration(baseClass: unknown, key?: string | null): ClassRegistration | null {
        if (!baseClass) return null;

        // Memoized fast path — avoids re-filtering the entire registration list on every call.
        const cacheKey = `${(baseClass as { name: string }).name}|${key == null ? '' : key.trim().toLowerCase()}`;
        const cached = this._registrationCache.get(cacheKey);
        if (cached !== undefined) return cached; // includes cached `null` (no-registration) results

        const resolved = this.resolveRegistration(baseClass, key);
        this._registrationCache.set(cacheKey, resolved);
        return resolved;
    }

    /**
     * Uncached core of {@link GetRegistration}: filters all matching registrations and returns
     * the highest-priority (last-registered on ties). Kept private so the public accessor can
     * memoize without the cache logic obscuring the resolution rule.
     */
    private resolveRegistration(baseClass: unknown, key?: string | null): ClassRegistration | null {
        let matches = this.GetAllRegistrations(baseClass, key)
        if (matches && matches.length > 0) {
            // figure out the highest priority for all the matching registrations
            let highestPriority = 0;
            for (let i = 0; i < matches.length; i++) {
                if (matches[i].Priority > highestPriority)
                    highestPriority = matches[i].Priority;
            }

            // now filter the matches to only those that have the highest priority
            const highest = matches.filter(r => r.Priority === highestPriority);

            // return the last one in the list, which will be the last one registered - so that if everyone has the same priority number, we use the LAST one registered
            return highest[highest.length - 1];
        }

        return null;
    }

    /**
     * Returns all registrations that have the specified root class, regardless of what base class was used in the registration.
     * This is useful for finding all registrations in a class hierarchy.
     * @param rootClass The root class to search for
     * @param key Optional key to filter results
     * @returns Array of matching registrations
     */
    public GetRegistrationsByRootClass(rootClass: unknown, key?: string | null): ClassRegistration[] {
        if (rootClass) {
            const rootClassName = (rootClass as { name: string }).name;
            return this._registrations.filter(r => {
                const regRootClassName = (r.RootClass as { name?: string })?.name;
                return regRootClassName === rootClassName &&
                       (key === undefined || key === null ? true : r.Key?.trim().toLowerCase() === key.trim().toLowerCase())
            });
        }
        return [];
    }
}


