/**
 * ObjectCacheEntry is used for the array within the ObjectCache class
 */
export class ObjectCacheEntry<T = any> {
    key: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    object: T  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

    constructor (key: string, object: T) {
        this.key = key
        this.object = object
    }
}

/**
 * ObjectCache can be used to cache objects as needed by any application in memory. These objects are NOT persisted to disk or any other storage medium, so they are only good for the lifetime of the application.
 * Do not attempt to directly instantiate this class, instead use the static Instance property of the MJGlobal class to get the instance of the ObjectCache for your application within that instance of MJGlobal.
 */
export class ObjectCache {
    private _entries = new Map<string, ObjectCacheEntry>();

    private normalizeKey(key: string): string {
        return key.trim().toLowerCase();
    }

    /**
     * Remove all entries from the object cache
     */
    public Clear() {
        this._entries.clear();
    }

    /**
     * Add a new object to the cache. If the key already exists, an exception is thrown
     * @param key 
     * @param object 
     */
    public Add<T>(key: string, object: T) {
        const normalizedKey = this.normalizeKey(key);
        if (this._entries.has(normalizedKey)) {
            throw new Error(`An object with the key ${key} already exists in the cache. Remove it first before adding a new one.`);
        }
        this._entries.set(normalizedKey, new ObjectCacheEntry<T>(key, object));
    }

    /**
     * Replace an existing object in the cache with a new one. If the key does not exist, the new object is added
     * @param key 
     * @param object 
     */
    public Replace<T>(key: string, object: T) {
        const normalizedKey = this.normalizeKey(key);
        this._entries.set(normalizedKey, new ObjectCacheEntry<T>(key, object));
    }

    /**
     * Remove an object from the cache based on the key
     * @param key 
     */
    public Remove(key: string) {
        this._entries.delete(this.normalizeKey(key));
    }

    /**
     * Returns an object from the cache based on the key and only if it matches the type provided in the generic
     * @param key 
     * @returns 
     */
    public Find<T>(key: string): T | null {
        const entry = this._entries.get(this.normalizeKey(key));
        if (entry !== undefined) {
            return entry.object as T;
        }
        return null;
    }
}