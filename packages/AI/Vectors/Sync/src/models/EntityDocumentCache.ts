import { UserInfo, RunView, LogStatus, RunViewResult } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import { MJEntityDocumentEntity, MJEntityDocumentTypeEntity, KnowledgeHubMetadataEngine } from "@memberjunction/core-entities";
import { BaseSingleton } from "@memberjunction/global";

/**
 * Caching class for Entity Documents and Entity Document Types.
 *
 * Delegates Entity Document storage to KnowledgeHubMetadataEngine (which uses
 * BaseEngine auto-refresh on entity events), and only independently caches
 * Entity Document Types (which KH engine does not manage).
 */
export class EntityDocumentCache extends BaseSingleton<EntityDocumentCache> {
    private _loaded: boolean = false;
    private _typeCache: { [key: string]: MJEntityDocumentTypeEntity } = {};
    private _contextUser: UserInfo | null = null;

    public constructor() {
        super();
    }

    public static get Instance(): EntityDocumentCache {
        return EntityDocumentCache.getInstance<EntityDocumentCache>();
    }

    public get IsLoaded(): boolean {
        return this._loaded;
    }

    public GetDocument(EntityDocumentID: string): MJEntityDocumentEntity | null {
        const document = KnowledgeHubMetadataEngine.Instance.GetEntityDocumentById(EntityDocumentID);
        if (!document) {
            LogStatus(`EntityDocumentCache.GetDocument: Cache miss for EntityDocumentID: ${EntityDocumentID}`);
        }
        return document ?? null;
    }

    public GetFirstActiveDocumentForEntityByID(EntityID: string): MJEntityDocumentEntity | null {
        const documentType: MJEntityDocumentTypeEntity | null = this.GetDocumentTypeByName('Record Duplicate');
        if (!documentType) {
            return null;
        }

        return KnowledgeHubMetadataEngine.Instance.EntityDocuments.find((ed: MJEntityDocumentEntity) =>
            UUIDsEqual(ed.EntityID, EntityID) && ed.Status === 'Active' && UUIDsEqual(ed.TypeID, documentType.ID)
        ) ?? null;
    }

    public GetFirstActiveDocumentForEntityByName(EntityName: string): MJEntityDocumentEntity | null {
        const documentType: MJEntityDocumentTypeEntity | null = this.GetDocumentTypeByName('Record Duplicate');
        if (!documentType) {
            return null;
        }

        return KnowledgeHubMetadataEngine.Instance.EntityDocuments.find((ed: MJEntityDocumentEntity) =>
            ed.Entity === EntityName && ed.Status === 'Active' && UUIDsEqual(ed.TypeID, documentType.ID)
        ) ?? null;
    }

    public GetDocumentByName(EntityDocumentName: string): MJEntityDocumentEntity | null {
        const toLower = EntityDocumentName.trim().toLowerCase();
        const document = KnowledgeHubMetadataEngine.Instance.EntityDocuments.find((ed: MJEntityDocumentEntity) =>
            ed.Name.trim().toLowerCase() === toLower
        );

        if (!document) {
            LogStatus(`EntityDocumentCache.GetDocumentByName: Cache miss for EntityDocumentName: ${EntityDocumentName}`);
        }

        return document ?? null;
    }

    public GetDocumentType(EntityDocumentTypeID: string): MJEntityDocumentTypeEntity | null {
        const documentType: MJEntityDocumentTypeEntity = this._typeCache[EntityDocumentTypeID];
        if (!documentType) {
            LogStatus(`EntityDocumentCache.GetDocumentType: Cache miss for EntityDocumentTypeID: ${EntityDocumentTypeID}`);
            return null;
        }

        return documentType;
    }

    public GetDocumentTypeByName(EntityDocumentTypeName: string): MJEntityDocumentTypeEntity | null {
        const toLower = EntityDocumentTypeName.trim().toLowerCase();
        const documentType: MJEntityDocumentTypeEntity = Object.values(this._typeCache).find((edt: MJEntityDocumentTypeEntity) => edt.Name.trim().toLowerCase() === toLower);

        if (!documentType) {
            LogStatus(`EntityDocumentCache.GetDocumentTypeByName: Cache miss for EntityDocumentTypeName: ${EntityDocumentTypeName}`);
            return null;
        }

        return documentType;
    }

    public SetCurrentUser(user: UserInfo) {
        this._contextUser = user;
    }

    /**
     * Refreshes the cache. Entity Documents are loaded via KnowledgeHubMetadataEngine
     * (auto-refreshing BaseEngine). Entity Document Types are loaded independently.
     */
    public async Refresh(forceRefresh: boolean, ContextUser?: UserInfo) {

        if (!forceRefresh && this._loaded) {
            return;
        }

        LogStatus('Refreshing Entity Document Cache');
        this._typeCache = {};

        const user = ContextUser || this._contextUser;

        // Delegate Entity Documents to KnowledgeHubMetadataEngine
        await KnowledgeHubMetadataEngine.Instance.Config(forceRefresh, user);

        // Load Entity Document Types independently (KH engine doesn't cache these)
        const rv = new RunView();
        const result: RunViewResult<MJEntityDocumentTypeEntity> = await rv.RunView<MJEntityDocumentTypeEntity>({
            EntityName: "MJ: Entity Document Types",
            ResultType: "entity_object"
        }, user);

        if (result && result.Success) {
            for (const entityDocumentType of result.Results) {
                this._typeCache[entityDocumentType.ID] = entityDocumentType;
            }
        }

        this._loaded = true;
    }
}
