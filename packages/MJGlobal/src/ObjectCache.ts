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

    /**
     * Add a new object to the cache. If the key already exists, an exception is thrown
     * @param key 
     * @param object 
     */
    public Add<T>(key: string, object: T) {
        // make sure that if we have the key already we throw an exception
        const idx = this._entries.findIndex((i: ObjectCacheEntry) => i.key.trim().toLowerCase() === key.trim().toLowerCase())
        if (idx >= 0) {
            throw new Error(`An object with the key ${key} already exists in the cache. Remove it first before adding a new one.`);
        }
        else {
            const entry = new ObjectCacheEntry<T>(key, object);
            this._entries.push(entry);    
        }
    }

    /**
     * Replace an existing object in the cache with a new one. If the key does not exist, the new object is added
     * @param key 
     * @param object 
     */
    public Replace<T>(key: string, object: T) {
        this.Remove(key); // remove the existing one if it exists
        this.Add(key, object); // add the new one
    }

    /**
     * Remove an object from the cache based on the key
     * @param key 
     */
    public Remove(key: string) {
        // first, see if we get a match for the index
        const idx = this._entries.findIndex((i: ObjectCacheEntry) => i.key.trim().toLowerCase() === key.trim().toLowerCase())
        if (idx >= 0) {
            // now remove it
            this._entries.splice(idx, 1);
        }
    }

    /**
     * Returns an object from the cache based on the key and only if it matches the type provided in the generic
     * @param key 
     * @returns 
     */
    public Find<T>(key: string): T | null {
        // first, see if we get a match for the index
        const idx = this._entries.findIndex((i: ObjectCacheEntry) => i.key.trim().toLowerCase() === key.trim().toLowerCase())
        if (idx >= 0) {
            return this._entries[idx].object as T;
        }
        return null;
    }
}