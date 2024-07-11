import { BaseEngine, BaseEnginePropertyConfig, UserInfo } from "@memberjunction/core";
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

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                EntityName: 'Template Content Types',
                PropertyName: '_TemplateContentTypes',
            },
            {
                EntityName: 'Template Categories',
                PropertyName: '_TemplateCategories'
            },
            {
                EntityName: 'Templates',
                PropertyName: '_Templates',
            },
            {
                EntityName: 'Template Contents',
                PropertyName: '_TemplateContents',
            },
            {
                EntityName: 'Template Params',
                PropertyName: '_TemplateParams',
            },

        ]
        await this.Load(c, forceRefresh, contextUser);
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // post-process the template content and params to associate them with a template
        this.Templates.forEach((t) => {
            t.Content = this.TemplateContents.filter((tc) => tc.TemplateID === t.ID);
            t.Params = this.TemplateParams.filter((tp) => tp.TemplateID === t.ID);
        });
    }

    private _Templates: TemplateEntityExtended[];
    public get Templates(): TemplateEntityExtended[] {
        return this._Templates;
    }

    private _TemplateContentTypes: TemplateContentTypeEntity[];
    public get TemplateContentTypes(): TemplateContentTypeEntity[] {
        return this._TemplateContentTypes;
    }

    private _TemplateCategories: TemplateCategoryEntity[];
    public get TemplateCategories(): TemplateCategoryEntity[] {
        return this._TemplateCategories;
    }
    private _TemplateContents: TemplateContentEntity[];
    public get TemplateContents(): TemplateContentEntity[] {
        return this._TemplateContents;
    }

    private _TemplateParams: TemplateParamEntity[];
    public get TemplateParams(): TemplateParamEntity[] {
        return this._TemplateParams;
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
