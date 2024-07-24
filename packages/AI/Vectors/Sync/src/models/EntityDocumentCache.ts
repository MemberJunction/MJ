import { UserInfo, RunView, LogStatus, RunViewResult } from "@memberjunction/core";
import { EntityDocumentEntity, EntityDocumentTypeEntity } from "@memberjunction/core-entities";

/**
 * Simple caching class to load all Entity Documents and related data at once into memory
 */
export class EntityDocumentCache {
    private static _instance: EntityDocumentCache;
    private _loaded: boolean = false;
    private _cache: { [key: string]: EntityDocumentEntity } = {};
    private _typeCache: { [key: string]: EntityDocumentTypeEntity } = {};
    private _contextUser: UserInfo | null = null;

    private constructor() {
        // load up the cache
        this._cache = {};
        this._typeCache = {};
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

    protected Cache(): { [key: string]: EntityDocumentEntity } {
        return this._cache;
    }

    protected TypeCache(): { [key: string]: EntityDocumentTypeEntity } {
        return this._typeCache;
    }

    public GetDocument(EntityDocumentID: string): EntityDocumentEntity | null {
        let document: EntityDocumentEntity = this._cache[EntityDocumentID];
        if (!document) {
            LogStatus(`EntityDocumentCache.GetDocument: Cache miss for EntityDocumentID: ${EntityDocumentID}`);
        }

        return document || null;
    }

    public GetFirstActiveDocumentForEntityByID(EntityID: string): EntityDocumentEntity | null {
        let documentType: EntityDocumentTypeEntity | null = this.GetDocumentTypeByName('Record Duplicate');
        if(!documentType){
            return null;
        }

        return Object.values(this._cache).find((ed: EntityDocumentEntity) => {
            ed.EntityID === EntityID && ed.Status === 'Active' && ed.TypeID === documentType.ID;
        });

    }

    public GetFirstActiveDocumentForEntityByName(EntityName: string): EntityDocumentEntity | null {
        let documentType: EntityDocumentTypeEntity | null = this.GetDocumentTypeByName('Record Duplicate');
        if(!documentType){
            return null;
        }

        return Object.values(this._cache).find((ed: EntityDocumentEntity) => {
            ed.Entity === EntityName && ed.Status === 'Active' && ed.TypeID === documentType.ID;
        });

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

    public GetDocumentType(EntityDocumentTypeID: string): EntityDocumentTypeEntity | null {
        let documentType: EntityDocumentTypeEntity = this._typeCache[EntityDocumentTypeID];
        if (!documentType) {
            LogStatus(`EntityDocumentCache.GetDocument: Cache miss for EntityDocumentID: ${EntityDocumentTypeID}`);
            return null;
        }

        return documentType;
    }

    public GetDocumentTypeByName(EntityDocumentTypeName: string): EntityDocumentTypeEntity | null {
        const toLower = EntityDocumentTypeName.trim().toLowerCase();
        let documentType: EntityDocumentTypeEntity = Object.values(this._typeCache).find((edt: EntityDocumentTypeEntity) => edt.Name.trim().toLowerCase() === toLower);

        if (!documentType) {
            LogStatus(`EntityDocumentCache.GetDocumentByName: Cache miss for EntityDocumentName: ${EntityDocumentTypeName}`);
            return null;
        }

        return documentType;;
    }

    public SetCurrentUser(user: UserInfo) {
        this._contextUser = user;
    }

    public async Refresh(forceRefresh: boolean, ContextUser?: UserInfo) {

        if(!forceRefresh && this._loaded){
            return;
        }

        LogStatus('Refreshing Entity Document Cache');
        this._cache = {};
        this._typeCache = {};

        // now load up the cache with all the entity documents
        const rv = new RunView();

        const results: RunViewResult[] = await rv.RunViews([
            {
                EntityName: "Entity Documents",
                ResultType: "entity_object"
            },
            {
                EntityName: "Entity Document Types",
                ResultType: "entity_object"
            }
        ], ContextUser || this._contextUser);

        if (results[0] && results[0].Success) {
            for (const entityDocument of results[0].Results) {
                this._cache[entityDocument.ID] = entityDocument;
            }
        }

        if (results[1] && results[1].Success) {
            for (const entityDocumentType of results[1].Results) {
                this._typeCache[entityDocumentType.ID] = entityDocumentType;
            }
        }

        this._loaded = true;
    }
}