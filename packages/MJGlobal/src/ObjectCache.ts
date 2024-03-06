/**
 * ObjectCacheEntry is used for the array within the ObjectCache class
 */
export class ObjectCacheEntry<T = any> {
    key: string
    object: T

    constructor (key: string, object: T) {
        this.key = key
        this.object = object
    }
}

/**
 * ObjectCache can be used to cache objects as needed by any application in memory. These objects are NOT persisted to disk or any other storage medium, so they are only good for the lifetime of the application
 */
export class ObjectCache {
    // our internal array is an array of ObjectCacheEntry objects
    private _entries: ObjectCacheEntry[] = []; //starts off empty

    /**
     * Remove all entries from the object cache
     */
    public Clear() {
        this._entries = []; // set to a blank
    }

    public Add<T>(key: string, object: T) {
        const entry = new ObjectCacheEntry<T>(key, object);
        this._entries.push(entry);
    }

    public Remove(key: string) {
        // first, see if we get a match for the index
        const idx = this._entries.findIndex((i: ObjectCacheEntry) => i.key.trim().toLowerCase() === key.trim().toLowerCase())
        if (idx && idx >= 0) {
            // now remove it
            this._entries.splice(idx, 1);
        }
    }

    /**
     * Generic method that returns an object from the cache based on the key and only if it matches the type provided in the generic
     * @param key 
     * @returns 
     */
    public Find<T>(key: string): T | null {
        // first, see if we get a match for the index
        const idx = this._entries.findIndex((i: ObjectCacheEntry) => i.key.trim().toLowerCase() === key.trim().toLowerCase())
        if (idx && idx >= 0) {
            return this._entries[idx].object as T;
        }
        return null;
    }
}