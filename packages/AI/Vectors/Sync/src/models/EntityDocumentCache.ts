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
    private _loadedAt: number = 0;
    private _typeCache: { [key: string]: MJEntityDocumentTypeEntity } = {};
    private _contextUser: UserInfo | null = null;

    /**
     * How long a load stays trusted, in milliseconds.
     *
     * `_loaded` used to be a one-way latch: the first `Refresh(false)` set it and nothing ever
     * cleared it, and **every** production caller passes `false`
     * (`entityVectorSync.GetEntityDocument`/`GetEntityDocumentByName`, the Vectorize Entity
     * action, `KnowledgePipeline`, `KnowledgeAgent`). In a long-lived MJAPI that made Entity
     * Document and Entity Document Type edits invisible until the process was restarted — and
     * `_typeCache` is only ever populated inside {@link Refresh}, so document *types* were
     * restart-only unconditionally, no matter what any caller passed.
     *
     * A window rather than "always reload" is deliberate: `Refresh` is called once per lookup,
     * and a vectorize run over many entities would otherwise re-read this metadata for each one.
     * Within the window a repeat call is still skipped; past it the next call reloads.
     *
     * Set to `0` to reload on every call, or to `Number.POSITIVE_INFINITY` to restore the old
     * latch. Hosts that know when their metadata changes should call {@link Invalidate} instead
     * of widening this.
     */
    public static StaleAfterMs: number = 60_000;

    public constructor() {
        super();
    }

    public static get Instance(): EntityDocumentCache {
        return EntityDocumentCache.getInstance<EntityDocumentCache>();
    }

    /** True once a load has completed. Says nothing about whether that load is still fresh — see {@link IsStale}. */
    public get IsLoaded(): boolean {
        return this._loaded;
    }

    /** True when there is no load to trust: either nothing has loaded yet, or the last load has aged out. */
    public get IsStale(): boolean {
        return !this._loaded || (Date.now() - this._loadedAt) >= EntityDocumentCache.StaleAfterMs;
    }

    /**
     * Drop the cached copy so the next {@link Refresh} reloads, regardless of the staleness
     * window. The exact hook for a caller that knows metadata just changed out of band.
     */
    public Invalidate(): void {
        this._loaded = false;
        this._loadedAt = 0;
        this._typeCache = {};
    }

    public GetDocument(EntityDocumentID: string): MJEntityDocumentEntity | null {
        const document = KnowledgeHubMetadataEngine.Instance.GetEntityDocumentByID(EntityDocumentID);
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
     *
     * This method is the only gate. Callers should invoke it unconditionally rather than
     * pre-checking {@link IsLoaded} — a caller-side `if (!IsLoaded)` reintroduces the latch this
     * removed by skipping the staleness check entirely.
     */
    public async Refresh(forceRefresh: boolean, ContextUser?: UserInfo) {

        if (!forceRefresh && !this.IsStale) {
            return;
        }

        LogStatus('Refreshing Entity Document Cache');
        this._typeCache = {};

        const user = ContextUser || this._contextUser;

        // Delegate Entity Documents to KnowledgeHubMetadataEngine. Past the gate above we always
        // force: the engine's own `Config(false)` is a no-op once it has loaded, so passing our
        // caller's `false` through would refresh the type cache while leaving the Entity
        // Documents themselves stale — a half-refresh is harder to diagnose than no refresh.
        await KnowledgeHubMetadataEngine.Instance.Config(true, user);

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
        this._loadedAt = Date.now();
    }
}
