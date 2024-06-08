import { BaseEngine, BaseEnginePropertyConfig, UserInfo } from "@memberjunction/core";
import { TemplateEntity } from "@memberjunction/core-entities";
import * as nunjucks from 'nunjucks';


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
    private templates: { [templateId: number]: TemplateEntity } = {};

    /**
     * Add a new template to the loader
     * @param templateId 
     * @param template 
     */
    public AddTemplate(templateId: number, template: TemplateEntity) {
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
                src: template.TemplateText,
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
                EntityName: 'Templates',
                PropertyName: '_Templates',
            }
        ]
        await this.Load(c, forceRefresh, contextUser);

        this._templateLoader = new TemplateEntityLoader();
        this._nunjucksEnv = new nunjucks.Environment(this._templateLoader, { autoescape: true });
    }


    private _nunjucksEnv: nunjucks.Environment;
    private _templateLoader: TemplateEntityLoader;
    private _Templates: TemplateEntity[];
    public get Templates(): TemplateEntity[] {
        return this._Templates;
    }

    public AddTemplate(templateEntity: TemplateEntity) {
        this._templateLoader.AddTemplate(templateEntity.ID, templateEntity);
    }

    /**
     * Convenience method to find a template by name, case-insensitive
     * @param templateName 
     * @returns 
     */
    public FindTemplate(templateName: string): TemplateEntity {
        return this.Templates.find((t) => t.Name.trim().toLowerCase() === templateName.trim().toLowerCase())
    }

    /**
     * Renders a template with the given data.
     * @param templateString 
     * @param data 
     */
    public async RenderTemplate(templateEntity: TemplateEntity, data: any): Promise<TemplateRenderResult> {
        return new Promise((resolve, reject) => {
            const template = new nunjucks.Template(templateEntity.TemplateText, this._nunjucksEnv);
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