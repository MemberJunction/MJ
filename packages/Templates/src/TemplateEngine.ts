import { BaseEngine, BaseEnginePropertyConfig, UserInfo } from "@memberjunction/core";
import { TemplateCategoryEntity, TemplateContentEntity, TemplateContentTypeEntity, TemplateEntity, TemplateParamEntity } from "@memberjunction/core-entities";
import * as nunjucks from 'nunjucks';
import { TemplateEntityExtended } from "./TemplateEntityExtended";


/**
 * Contains the results of a call to render a template
 */
export class TemplateRenderResult {
    Success: boolean;
    Output: string;
    /**
     * Optional, typically used only for Success=false
     */
    Message?: string;
}

/**
 * This class extends the nunjucks loader to allow adding templates directly to the loader
 */
export class TemplateEntityLoader extends nunjucks.Loader {
    private templates: { [templateId: number]: TemplateEntityExtended } = {};

    /**
     * Add a new template to the loader
     * @param templateId 
     * @param template 
     */
    public AddTemplate(templateId: number, template: TemplateEntityExtended) {
        this.templates[templateId] = template;
    }

    /**
     * This method is required to be implemented by a subclass of Loader. It is used to get the source of a template by name.
     * @param name - this is actually the templateId but nunjucks calls it name and makes it a string, we handle it as a number internally 
     * @returns 
     */
    public getSource(name: string) { 
        const templateId = Number(name);
        const template = this.templates[templateId];
        if (template) {
            return {
                src: template.Get,
                path: templateId,
                noCache: true
            };
        }
        return null;
    }
}

/**
 * TemplateEngine is used for accessing template metadata/caching it, and rendering templates
 */
export class TemplateEngine extends BaseEngine<TemplateEngine> {
    private constructor() {
        super('MJ_Templates_Metadata');
    }
  
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): TemplateEngine {
       return super.getInstance<TemplateEngine>('MJ_Templates_Metadata');
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const c: BaseEnginePropertyConfig[] = [
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

        this._templateLoader = new TemplateEntityLoader();
        this._nunjucksEnv = new nunjucks.Environment(this._templateLoader, { autoescape: true });
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // post-process the template content and params to associate them with a template
        this.Templates.forEach((t) => {
            t.Content = this.TemplateContents.filter((tc) => tc.TemplateID === t.ID);
            t.Params = this.TemplateParams.filter((tp) => tp.TemplateID === t.ID);
        });
    }


    private _nunjucksEnv: nunjucks.Environment;
    private _templateLoader: TemplateEntityLoader;

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


    public AddTemplate(templateEntity: TemplateEntityExtended) {
        this._templateLoader.AddTemplate(templateEntity.ID, templateEntity);
    }

    /**
     * Convenience method to find a template by name, case-insensitive
     * @param templateName 
     * @returns 
     */
    public FindTemplate(templateName: string): TemplateEntityExtended {
        return this.Templates.find((t) => t.Name.trim().toLowerCase() === templateName.trim().toLowerCase())
    }

    /**
     * Renders a template with the given data.
     * @param templateString 
     * @param data 
     */
    public async RenderTemplate(templateContent: TemplateContentEntity, data: any): Promise<TemplateRenderResult> {
        if (!templateContent)
            throw new Error('templateContent variable is required');

        return new Promise((resolve, reject) => {
            const template = new nunjucks.Template(templateContent.TemplateText, this._nunjucksEnv);
            template.render(data, (err, result) => {
                if (err) {
                    reject({
                        Success: false,
                        Output: null,
                        Message: err                    
                    });
                } else {
                    resolve({
                        Success: true,
                        Output: result,
                        Message: undefined
                    });
                }
            });
        });
    }
}