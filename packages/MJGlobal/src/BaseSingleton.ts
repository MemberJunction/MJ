import { GetGlobalObjectStore } from "./util";
import { GetClassName, MJ_CLASS_NAME_SYMBOL } from "./ClassUtils";

const SINGLETON_KEY_PREFIX = '___SINGLETON__';
const BY_CTOR_STORE_KEY = '___SINGLETON__BY_CTOR__';

/**
 * True when a production minifier renamed classes (e.g. the Angular/esbuild build with identifier
 * mangling on). Class names then mean nothing: unrelated classes in different chunks are all called
 * `e` or `t`, and can even have byte-identical source. BaseSingleton's own name is the probe, since
 * the minifier renames it along with everything else in the same bundle.
 * ponytail: one probe per bundle; a host that mixes a mangled app with an unmangled MJGlobal copy would read "not mangled".
 */
function classNamesAreMangled(): boolean {
    return BaseSingleton.name !== 'BaseSingleton';
}

/** True when the class carries its real name as an own stamp (`StampClassName` / `RegisterClassEx({ className })`). */
function hasStampedName(ctor: object): boolean {
    return Object.prototype.hasOwnProperty.call(ctor, MJ_CLASS_NAME_SYMBOL)
        || Object.prototype.hasOwnProperty.call(ctor, '__mjClassName');
}

/**
 * Whether the class's name can identify its singleton. Names are trusted unless the build mangled
 * them; a stamped name survives mangling. Trusted names let duplicate copies of a class (two installs
 * of a package, even at different versions) share one instance, which is why the store is global.
 */
function nameIdentifiesClass(ctor: object): boolean {
    return !classNamesAreMangled() || hasStampedName(ctor);
}

/** Singletons of classes with mangled, unstamped names, keyed by the constructor itself. */
function getCtorMap(g: Record<string, unknown>): WeakMap<object, unknown> {
    const existing = g[BY_CTOR_STORE_KEY];
    if (existing instanceof WeakMap) {
        return existing as WeakMap<object, unknown>;
    }
    const created = new WeakMap<object, unknown>();
    g[BY_CTOR_STORE_KEY] = created;
    return created;
}

/**
 * Generic, abstract base class for any scenario where we want to use a Singleton pattern. This base class abstracts away the complexity of ensuring a truly global
 * singleton instance across multiple code paths in a deployed application. It uses a Global Object Store to ensure that only one instance of the class exists in the application even
 * if the class has code imported into multiple execution paths (which is not optimal, of course, but can occur in some situations).
 *
 * The instance is keyed by class name (the stamped name when there is one). When a minifier has
 * mangled class names, an unstamped class is keyed by its constructor instead, so unrelated classes
 * that the minifier gave the same name never share an instance.
 */
export abstract class BaseSingleton<T> {
    private _globalKey: string;
    public get GlobalKey(): string {
        return this._globalKey;
    }
    protected constructor() {
        const ctor = this.constructor;
        this._globalKey = SINGLETON_KEY_PREFIX + GetClassName(ctor);
        const g = GetGlobalObjectStore();
        if (!g) {
            return;
        }

        if (!nameIdentifiesClass(ctor)) {
            const ctorMap = getCtorMap(g);
            const existing = ctorMap.get(ctor);
            if (existing) {
                return existing as this;
            }
            ctorMap.set(ctor, this);
            return;
        }

        if (g[this._globalKey]) {
            return g[this._globalKey] as this;
        }
        // If we get here, we are the first instance of this class
        g[this._globalKey] = this;
    }

    /**
     * Returns the singleton instance of the class. If the instance does not exist, it is created and stored in the Global Object Store.
     * If className is provided it will be used as part of the key in the Global Object Store, otherwise the actual class name will be used.
     * NOTE: the class name used by default is the lowest level of the object hierarchy, so if you have a class that extends another class, the lowest
     * level class name will be used.
     * @param this
     * @param className
     * @returns
     */
    protected static getInstance<T extends BaseSingleton<unknown>>(this: new () => T, className?: string): T {
        const g = GetGlobalObjectStore();
        if (!g) {
            return new this();
        }
        if (!className && !nameIdentifiesClass(this)) {
            // The constructor registers the new instance in the by-constructor map.
            return (getCtorMap(g).get(this) as T | undefined) ?? new this();
        }

        const key = SINGLETON_KEY_PREFIX + (className || GetClassName(this));
        if (!g[key]) {
            g[key] = new this();
        }
        return g[key] as T;
    }

    /**
     * The Global Object Store is a place to store global objects that need to be shared across the application. Depending on the execution environment, this could be the window object in a browser, or the global object in a node environment, or something else in other contexts. The key here is that in some cases static variables are not truly shared
     * because it is possible that a given class might have copies of its code in multiple paths in a deployed application. This approach ensures that no matter how many code copies might exist, there is only one instance of the object in question by using the Global Object Store.
     * @returns
     */
    public GetGlobalObjectStore() {
        return GetGlobalObjectStore();
    }
}
