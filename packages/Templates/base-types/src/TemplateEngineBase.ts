import { BaseEngine, BaseEntityEvent, BaseEnginePropertyConfig, IMetadataProvider, LogError, UserInfo } from "@memberjunction/core";
import { MJTemplateCategoryEntity, MJTemplateContentEntity, MJTemplateContentTypeEntity, MJTemplateEntityExtended, MJTemplateParamEntity } from "@memberjunction/core-entities";
import { NormalizeUUID } from "@memberjunction/global";

/** Rows grouped by their normalized TemplateID. */
function groupByTemplate<T extends { TemplateID: string }>(rows: T[]): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const row of rows) {
        const key = NormalizeUUID(row.TemplateID);
        const bucket = groups.get(key);
        if (bucket) {
            bucket.push(row);
        } else {
            groups.set(key, [row]);
        }
    }
    return groups;
}

/**
 * TemplateEngine is used for accessing template metadata/caching it, and rendering templates
 */
export class TemplateEngineBase extends BaseEngine<TemplateEngineBase> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): TemplateEngineBase {
       return super.getInstance<TemplateEngineBase>();
    }

    private _metadata: {
        TemplateContentTypes: MJTemplateContentTypeEntity[],
        TemplateCategories: MJTemplateCategoryEntity[],
        Templates: MJTemplateEntityExtended[],
        TemplateContents: MJTemplateContentEntity[],
        TemplateParams: MJTemplateParamEntity[]
    };

    /** Templates by normalized ID, rebuilt on every load (see {@link FindTemplateByID}). */
    private _templatesByID = new Map<string, MJTemplateEntityExtended>();

    /** The content row each template renders, by normalized template ID, rebuilt on every load (see {@link FindRenderedContent}). */
    private _renderedContentByTemplateID = new Map<string, MJTemplateContentEntity>();

    /** The engine's one config: the `Template_Metadata` dataset, held in a single property. */
    protected static TemplateConfigs(): Partial<BaseEnginePropertyConfig>[] {
        return [
            {
                Type: 'dataset',
                DatasetName: 'Template_Metadata',
                DatasetResultHandling: "single_property",
                PropertyName: "_metadata"
            }
        ];
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        await this.Load(TemplateEngineBase.TemplateConfigs(), provider, forceRefresh, contextUser);
    }

    /**
     * The templates load as one dataset, which the base class cannot match to an entity event, so a saved Template
     * Content would stay stale until restart. Reload the dataset when any entity the dataset holds changes,
     * locally or on another server. The entities are read from the loaded dataset itself (see `DatasetEntityNames`), so
     * the set follows the dataset's definition; before the first load there is nothing cached to refresh.
     *
     * A save inside an open transaction reloads after the commit (and not at all on rollback), as the base class does
     * for its cache mutations: a reload while the transaction is open can read the text from before the save. Reloads
     * that overlap coalesce: a forced load requested while one is in flight shares one follow-up load (BaseEngine.Load).
     */
    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        const name = (event.baseEntity?.EntityInfo?.Name || event.entityName || '').trim().toLowerCase();
        const changes = event.type === 'save' || event.type === 'delete' || event.type === 'remote-invalidate';
        if (!changes || !this.DatasetEntityNames().has(name)) {
            return super.HandleIndividualBaseEntityEvent(event);
        }
        if (this.IsPermissionConstrained) {
            return true; // as the base class: the user cannot read the templates, so there is nothing to reload
        }
        try {
            // RunAfterCommitOrNow captures the save's post-commit token synchronously, before this handler's first await
            await this.RunAfterCommitOrNow(event, `TemplateEngineBase reload for ${name}`, () => this.ReloadTemplates());
            return true;
        }
        catch (e) {
            // the event subscriber does not await this, so a rejection here would be unhandled
            LogError(e);
            return false;
        }
    }

    /**
     * Reloads the template dataset from the database, bypassing every cache. The reads run on the pool, never inside a
     * transaction that happens to be open on the provider: this reload runs detached from the write that asked for it.
     */
    protected async ReloadTemplates(): Promise<void> {
        await this.Load(TemplateEngineBase.TemplateConfigs(), this.ProviderToUse, true, this.ContextUser, BaseEngine.BackgroundReloadReads);
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // Associate content and params with their templates. Each template gets a new array on
        // every run, so repeated rebuilds converge. Grouping first keeps this linear; filtering
        // both child arrays once per template was O(templates x children).
        // (The templates load as a dataset, which a cache-sourced related-record collection cannot
        // read from, so these stay hand-associated.)
        const contentByTemplate = groupByTemplate(this.TemplateContents);
        const paramsByTemplate = groupByTemplate(this.TemplateParams);
        const templatesByID = new Map<string, MJTemplateEntityExtended>();
        const renderedContent = new Map<string, MJTemplateContentEntity>();
        for (const template of this.Templates) {
            const key = NormalizeUUID(template.ID);
            template.Content = contentByTemplate.get(key) || [];
            template.Params = paramsByTemplate.get(key) || [];
            templatesByID.set(key, template);
            const content = template.GetHighestPriorityContent();
            if (content) {
                renderedContent.set(key, content);
            }
        }
        this._templatesByID = templatesByID;
        this._renderedContentByTemplateID = renderedContent;
    }

    // The collections read empty until the first load: MJAIPromptEntityExtended.TemplateText reads through to
    // TemplateContents on every access, including on prompts created before the template engine has loaded.
    public get Templates(): MJTemplateEntityExtended[] {
        return this._metadata?.Templates ?? [];
    }

    public get TemplateContentTypes(): MJTemplateContentTypeEntity[] {
        return this._metadata?.TemplateContentTypes ?? [];
    }
    public get TemplateCategories(): MJTemplateCategoryEntity[] {
        return this._metadata?.TemplateCategories ?? [];
    }
    public get TemplateContents(): MJTemplateContentEntity[] {
        return this._metadata?.TemplateContents ?? [];
    }
    public get TemplateParams(): MJTemplateParamEntity[] {
        return this._metadata?.TemplateParams ?? [];
    }

    /**
     * Convenience method to find a template by name, case-insensitive
     * @param templateName
     * @returns
     */
    public FindTemplate(templateName: string): MJTemplateEntityExtended {
        return this.Templates.find((t) => t.Name.trim().toLowerCase() === templateName.trim().toLowerCase())
    }

    /**
     * The cached template with this ID (any case), in O(1); undefined when the cache does not know it (or has not
     * loaded yet).
     */
    public FindTemplateByID(templateID: string): MJTemplateEntityExtended | undefined {
        return this._templatesByID.get(NormalizeUUID(templateID));
    }

    /**
     * The content row the template with this ID renders — the row `GetHighestPriorityContent()` selects — as of the
     * last load, in O(1). Hot read-through paths (an AI prompt's `TemplateText`, read per record by a feature
     * pipeline and repeatedly by UI bindings) use this instead of re-selecting on every read. Undefined when the cache
     * does not know the template or the template has no content.
     */
    public FindRenderedContent(templateID: string): MJTemplateContentEntity | undefined {
        return this._renderedContentByTemplateID.get(NormalizeUUID(templateID));
    }
}
