import { GetGlobalObjectStore } from "./util";
import { GetClassName, MJ_CLASS_NAME_SYMBOL } from "./ClassUtils";

const BY_CTOR_STORE_KEY = '___SINGLETON__BY_CTOR__';

function getOwnStampedName(ctor: object): string | undefined {
    if (Object.prototype.hasOwnProperty.call(ctor, MJ_CLASS_NAME_SYMBOL)) {
        const stamped = (ctor as { [MJ_CLASS_NAME_SYMBOL]?: unknown })[MJ_CLASS_NAME_SYMBOL];
        if (typeof stamped === 'string' && stamped.length > 0) {
            return stamped;
        }
    }
    if (Object.prototype.hasOwnProperty.call(ctor, '__mjClassName')) {
        const legacy = (ctor as { __mjClassName?: unknown }).__mjClassName;
        if (typeof legacy === 'string' && legacy.length > 0) {
            return legacy;
        }
    }
    return undefined;
}

function isSameSingletonClass(existing: unknown, targetCtor: object): boolean {
    if (typeof existing !== 'object' || existing === null) {
        return false;
    }
    const existingCtor = (existing as { constructor?: unknown }).constructor;
    if (existingCtor === targetCtor) {
        return true;
    }
    if (typeof existingCtor !== 'function') {
        return false;
    }

    const existingStamped = getOwnStampedName(existingCtor);
    const targetStamped = getOwnStampedName(targetCtor);
    if (existingStamped !== undefined || targetStamped !== undefined) {
        return existingStamped !== undefined && existingStamped === targetStamped;
    }

    // Fallback for duplicate physical copies of the same class (e.g. dual module load)
    // vs two unrelated classes whose names collided after ESBuild per-chunk minification.
    return Function.prototype.toString.call(existingCtor) === Function.prototype.toString.call(targetCtor);
}

function getCtorMap(g: Record<string, unknown> | null): WeakMap<object, unknown> | null {
    if (!g) {
        return null;
    }
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
 */
export abstract class BaseSingleton<T> {
    private static _globalKeyPrefix: string = '___SINGLETON__';
    private _globalKey: string;
    public get GlobalKey(): string {
        return this._globalKey;
    } 
    protected constructor() {
        const ctor = this.constructor;
        this._globalKey = BaseSingleton._globalKeyPrefix + GetClassName(ctor);
        const g = GetGlobalObjectStore();

        if (g && g[this._globalKey] !== undefined) {
            if (isSameSingletonClass(g[this._globalKey], ctor)) {
                return g[this._globalKey] as this;
            }
            const ctorMap = getCtorMap(g);
            if (ctorMap && ctorMap.has(ctor)) {
                return ctorMap.get(ctor) as this;
            }
            // Collision on g[this._globalKey] from an unrelated class (e.g. ESBuild minified names):
            // isolate this constructor's instance in the WeakMap without overwriting g[this._globalKey].
            ctorMap?.set(ctor, this);
            return;
        }

        // If we get here, g[this._globalKey] is unoccupied — claim it for this class.
        if (g) {
            g[this._globalKey] = this;
        }
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
        const effectiveName = className || GetClassName(this);
        const key = BaseSingleton._globalKeyPrefix + effectiveName;

        if (g && g[key] !== undefined) {
            if (className || isSameSingletonClass(g[key], this)) {
                return g[key] as T;
            }
            const ctorMap = getCtorMap(g);
            if (ctorMap && ctorMap.has(this)) {
                return ctorMap.get(this) as T;
            }
            const collidedInstance = new this();
            ctorMap?.set(this, collidedInstance);
            return collidedInstance;
        }

        const instance = new this();
        if (g && !g[key]) {
            g[key] = instance;
        }
        return instance;
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