import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { MJTemplateCategoryEntity, MJTemplateContentEntity, MJTemplateContentTypeEntity, MJTemplateEntityExtended, MJTemplateParamEntity } from "@memberjunction/core-entities";
import { UUIDsEqual } from "@memberjunction/global";

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


    private _Metadata: {
        TemplateContentTypes: MJTemplateContentTypeEntity[],
        TemplateCategories: MJTemplateCategoryEntity[],
        Templates: MJTemplateEntityExtended[],
        TemplateContents: MJTemplateContentEntity[],
        TemplateParams: MJTemplateParamEntity[]
    };

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'dataset',
                DatasetName: 'Template_Metadata',
                DatasetResultHandling: "single_property",
                PropertyName: "_Metadata"
            }
        ]
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // post-process the template content and params to associate them with a template
        this.Templates.forEach((t) => {
            t.Content = this.TemplateContents.filter((tc) => UUIDsEqual(tc.TemplateID, t.ID));
            t.Params = this.TemplateParams.filter((tp) => UUIDsEqual(tp.TemplateID, t.ID));
        });
    }

    /*
     * Every accessor below reads through `this._Metadata`, which is only assigned once
     * {@link Config} has loaded the `Template_Metadata` dataset. Before that — an engine
     * that was never configured, a Config() that threw, or a caller that reaches the
     * engine while the cache is still warming — `this._Metadata` is `undefined` and an
     * unguarded `this._Metadata.X` throws a TypeError out of a property read.
     *
     * That crash lands in surfaces whose whole job is to let the user fix the problem
     * (the template form the error message points at), so it takes the remedy down with
     * the fault. An empty array is the honest answer to "what is cached?" when nothing
     * is cached yet, and every consumer already handles an empty collection.
     *
     * The guard is applied to ALL of these accessors, not just the one that was observed
     * crashing: they are the same shape over the same object, so any of them is reachable
     * on the same unwarmed engine.
     */
    public get Templates(): MJTemplateEntityExtended[] {
        return this._Metadata?.Templates ?? [];
    }

    public get TemplateContentTypes(): MJTemplateContentTypeEntity[] {
        return this._Metadata?.TemplateContentTypes ?? [];
    }
    public get TemplateCategories(): MJTemplateCategoryEntity[] {
        return this._Metadata?.TemplateCategories ?? [];
    }
    public get TemplateContents(): MJTemplateContentEntity[] {
        return this._Metadata?.TemplateContents ?? [];
    }
    public get TemplateParams(): MJTemplateParamEntity[] {
        return this._Metadata?.TemplateParams ?? [];
    }

    /**
     * Convenience method to find a template by name, case-insensitive
     * @param templateName 
     * @returns 
     */
    public FindTemplate(templateName: string): MJTemplateEntityExtended {
        return this.Templates.find((t) => t.Name.trim().toLowerCase() === templateName.trim().toLowerCase())
    }
}
