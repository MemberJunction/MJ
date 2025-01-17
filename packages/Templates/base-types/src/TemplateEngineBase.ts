import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { TemplateEntityExtended } from "./TemplateEntityExtended";
import { TemplateCategoryEntity, TemplateContentEntity, TemplateContentTypeEntity, TemplateParamEntity } from "@memberjunction/core-entities";

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
        TemplateContentTypes: TemplateContentTypeEntity[],
        TemplateCategories: TemplateCategoryEntity[],
        Templates: TemplateEntityExtended[],
        TemplateContents: TemplateContentEntity[],
        TemplateParams: TemplateParamEntity[]
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
            t.Content = this.TemplateContents.filter((tc) => tc.TemplateID === t.ID);
            t.Params = this.TemplateParams.filter((tp) => tp.TemplateID === t.ID);
        });
    }

    public get Templates(): TemplateEntityExtended[] {
        return this._Metadata.Templates;
    }

    public get TemplateContentTypes(): TemplateContentTypeEntity[] {
        return this._Metadata.TemplateContentTypes;
    }
    public get TemplateCategories(): TemplateCategoryEntity[] {
        return this._Metadata.TemplateCategories;
    }
    public get TemplateContents(): TemplateContentEntity[] {
        return this._Metadata.TemplateContents;
    }
    public get TemplateParams(): TemplateParamEntity[] {
        return this._Metadata.TemplateParams;
    }

    /**
     * Convenience method to find a template by name, case-insensitive
     * @param templateName 
     * @returns 
     */
    public FindTemplate(templateName: string): TemplateEntityExtended {
        return this.Templates.find((t) => t.Name.trim().toLowerCase() === templateName.trim().toLowerCase())
    }
}
