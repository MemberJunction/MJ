import { ILocalStorageProvider, LogError, LogErrorEx } from '@memberjunction/core';
import { openDB, DBSchema, IDBPDatabase } from '@tempfix/idb';



// this class implements a simple in-memory only storage as a fallback if the browser doesn't support local storage
export class BrowserStorageProviderBase implements ILocalStorageProvider {
    private _localStorage: { [key: string]: string } = {};

    public async GetItem(key: string): Promise<string | null> {
        return new Promise((resolve) => {
            if (this._localStorage.hasOwnProperty(key))
                resolve(this._localStorage[key]);
            else
                resolve(null);
        });
    }

    public async SetItem(key: string, value: string): Promise<void> {
        return new Promise((resolve) => {
            this._localStorage[key] = value;
            resolve();
        });
    }

    public async Remove(key: string): Promise<void> {
        return new Promise((resolve) => {
            if (this._localStorage.hasOwnProperty(key)) {
                delete this._localStorage[key];
            }
            resolve();
        });
    }
}


// This implementation just wraps the browser local storage and if for some reason the browser doesn't
// have a localStorage object, we just use a simple object to store the data in memory.
class BrowserLocalStorageProvider extends BrowserStorageProviderBase  {
    public override async GetItem(key: string): Promise<string | null> {
        if (localStorage)
            return localStorage.getItem(key);
        else
            return await super.GetItem(key)
    }

    public override async SetItem(key: string, value: string): Promise<void> {
        if (localStorage)
            localStorage.setItem(key, value);
        else
            await super.SetItem(key, value)
    }

    public override async Remove(key: string): Promise<void> {
        if (localStorage)
            localStorage.removeItem(key);
        else
            await super.Remove(key)
    }
}



const IDB_DB_NAME = 'MJ_Metadata';
const IDB_DB_ObjectStoreName = 'Metadata_KVPairs';

export interface MJ_MetadataDB extends DBSchema {
    'Metadata_KVPairs': {
        key: string;
        value: any;
    };
}

export class BrowserIndexedDBStorageProvider extends BrowserStorageProviderBase {
    private dbPromise: Promise<IDBPDatabase<MJ_MetadataDB>>;
    private _dbReady: boolean = false;

    constructor() {
        super();
        this.dbPromise = openDB<MJ_MetadataDB>(IDB_DB_NAME, 1, {
            upgrade(db) {
                try {
                    if (!db.objectStoreNames.contains(IDB_DB_ObjectStoreName)) {
                        db.createObjectStore(IDB_DB_ObjectStoreName);
                    }
                }
                catch (e) {
                    LogErrorEx({
                        error: e,
                        message: e?.message
                    })
                }
            },
        });

        this.dbPromise.then(() => {
            this._dbReady = true;
        }).catch(e => {
            LogErrorEx({
                error: e,
                message: 'IndexedDB initialization failed: ' + e?.message
            });
        });
    }

    public override async SetItem(key: string, value: string): Promise<void> {
        try {
            const db = await this.dbPromise;
            const tx = db.transaction(IDB_DB_ObjectStoreName, 'readwrite');
            await tx.objectStore(IDB_DB_ObjectStoreName).put(value, key);
            await tx.done;
        }
        catch (e) {
            LogErrorEx({
                error: e,
                message: e?.message
            })
        }
    }

    public override async GetItem(key: string): Promise<string | null> {
        try {
            const db = await this.dbPromise;
            const value = await db.transaction(IDB_DB_ObjectStoreName).objectStore(IDB_DB_ObjectStoreName).get(key);
            return value;
        }
        catch (e) {
            LogErrorEx({
                error: e,
                message: e?.message
            })
            return null;
        }
    }

    public override async Remove(key: string): Promise<void> {
        try {
            const db = await this.dbPromise;
            const tx = db.transaction(IDB_DB_ObjectStoreName, 'readwrite');
            await tx.objectStore(IDB_DB_ObjectStoreName).delete(key);
            await tx.done;
        }
        catch (e) {
            LogErrorEx({
                error: e,
                message: e?.message
            })
        }
    }
}