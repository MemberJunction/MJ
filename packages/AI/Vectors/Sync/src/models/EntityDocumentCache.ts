import { UserInfo, RunView, LogStatus } from "@memberjunction/core";
import { EntityDocumentEntity } from "@memberjunction/core-entities";

/**
 * Simple caching class to load all Entity Documents at once into memory
 */
export class EntityDocumentCache {
    private static _instance: EntityDocumentCache;
    private _loaded: boolean = false;
    private _cache: { [key: number]: EntityDocumentEntity } = {};
    private _contextUser: UserInfo | null = null;

    private constructor() {
        // load up the cache
        this._cache = {};
    } 

    public static get Instance(): EntityDocumentCache {
        if(!EntityDocumentCache._instance){
            EntityDocumentCache._instance = new EntityDocumentCache();
        }
        return EntityDocumentCache._instance;
    }

    public get IsLoaded(): boolean {
        return this._loaded;
    }

    protected Cache(): { [key: number]: EntityDocumentEntity } {
        return this._cache;
    }

    public GetDocument(EntityDocumentID: number): EntityDocumentEntity | null {
        let document: EntityDocumentEntity = this._cache[EntityDocumentID];
        if (!document) {
            LogStatus(`EntityDocumentCache.GetDocument: Cache miss for EntityDocumentID: ${EntityDocumentID}`);
        }

        return document || null;
    }

    public GetDocumentByName(EntityDocumentName: string): EntityDocumentEntity | null {
        const toLower = EntityDocumentName.trim().toLowerCase();
        let document: EntityDocumentEntity = Object.values(this._cache).find((ed: EntityDocumentEntity) => {
            ed.Name.trim().toLowerCase() === toLower;
        });

        if (!document) {
            LogStatus(`EntityDocumentCache.GetDocumentByName: Cache miss for EntityDocumentName: ${EntityDocumentName}`);
        }

        return document || null;
    }

    public SetCurrentUser(user: UserInfo) {
        this._contextUser = user;
    }

    public async Refresh(ContextUser?: UserInfo) {
        LogStatus('Refreshing Entity Document Cache');
        this._cache = {};

        // now load up the cache with all the entity documents
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: "Entity Documents",
            ResultType: "entity_object"
        }, ContextUser || this._contextUser);

        if (result && result.Success) {
            for (const entityDocument of result.Results) {
                this._cache[entityDocument.ID] = entityDocument;
            }
            this._loaded = true;
        }
    }
}