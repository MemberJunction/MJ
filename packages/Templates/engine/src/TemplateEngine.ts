import { UserInfo, ValidationErrorInfo } from "@memberjunction/core";
import { TemplateContentEntity } from "@memberjunction/core-entities";
import * as nunjucks from 'nunjucks';
import { MJGlobal } from "@memberjunction/global";
import { TemplateExtensionBase } from "./extensions/TemplateExtensionBase";
import { TemplateEntityExtended, TemplateRenderResult, TemplateEngineBase } from '@memberjunction/templates-base-types'
  
/**
 * This class extends the nunjucks loader to allow adding templates directly to the loader
 */
export class TemplateEntityLoader extends nunjucks.Loader {
    public async: true; // tell nunjucks this is an async loader

    private templates: { [templateId: string]: TemplateEntityExtended } = {};

    /**
     * Add a new template to the loader
     * @param templateId 
     * @param template 
     */
    public AddTemplate(templateId: string, template: TemplateEntityExtended) {
        this.templates[templateId] = template;
    }

    /**
     * This method is required to be implemented by a subclass of Loader. It is used to get the source of a template by name.
     * @param name - this is actually the templateId but nunjucks calls it name and makes it a string, we handle it as a number internally 
     * @returns 
     */
    public getSource(name: string, callBack: any) { 
        const templateId = Number(name);
        const template = this.templates[templateId];
        if (template) {
            callBack({
                src: template.Get,
                path: templateId,
                noCache: true
            });
        }
    }
}

/**
 * TemplateEngine is used for accessing template metadata/caching it, and rendering templates
 */
export class TemplateEngineServer extends TemplateEngineBase {
    public static get Instance(): TemplateEngineServer {
        return super.getInstance<TemplateEngineServer>();
    }

    private _oneTimeLoadingComplete: boolean = false;
    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // pass along the call to our base class so it can do whatever it wants
        await super.AdditionalLoading(contextUser);

        // clear our template cache as we are going to reload all of the templates
        this.ClearTemplateCache();
        if (!this._oneTimeLoadingComplete) {
            this._oneTimeLoadingComplete = true; // flag to make sure we don't do this again

            // do this after the templates are loaded and doing it inside AdditionalLoading() ensures it is done after the templates are loaded and
            // only done once
            this._templateLoader = new TemplateEntityLoader();
            this._nunjucksEnv = new nunjucks.Environment(this._templateLoader, { autoescape: true, dev: true });

            // get all of the extensions that are registered and register them with nunjucks
            const extensions = MJGlobal.Instance.ClassFactory.GetAllRegistrations(TemplateExtensionBase);
            if (extensions && extensions.length > 0) {
                for (const ext of extensions) {
                    const instance = new ext.SubClass(contextUser);                
                    this._nunjucksEnv.addExtension(ext.Key, instance);
                }
            }
        }
    }

    private _nunjucksEnv: nunjucks.Environment;
    private _templateLoader: TemplateEntityLoader;

    /**
     * Cache for templates that have been created by nunjucks so we don't have to create them over and over
     */
    private _templateCache: Map<string, any> = new Map<string, any>();

    public AddTemplate(templateEntity: TemplateEntityExtended) {
        this._templateLoader.AddTemplate(templateEntity.ID, templateEntity);
    }
 
    
    /**
     * Renders a template with the given data.
     * @param templateEntity the template object to render
     * @param templateContent the template content item (within the template)  
     * @param data 
     */
    public async RenderTemplate(templateEntity: TemplateEntityExtended, templateContent: TemplateContentEntity, data: any): Promise<TemplateRenderResult> {
        try {
            if (!templateContent) {
                return {
                    Success: false,
                    Output: null,
                    Message: 'templateContent variable is required'
                };
            }
    
            const valResult = templateEntity.ValidateTemplateInput(data);
            if (!valResult.Success) {
                return {
                    Success: false,
                    Output: null,
                    Message: valResult.Errors.map((error: ValidationErrorInfo) => {
                        return error.Message;
                    }).join(', ')
                };
            }
     
            const template = this.getNunjucksTemplate(templateContent.ID, templateContent.TemplateText);
            const result = await this.renderTemplateAsync(template, data); 
            return {
                Success: true,
                Output: result,
                Message: undefined
            }; 
        }
        catch (e) {
            return {
                Success: false,
                Output: null,
                Message: e.message
            };
        }
    }

    /**
     * This method is responsible for creating a new Nunjucks template, caching it, and returning it.
     * If the templateContentId already had a template created, it will return that template from the cache.
     * @param templateId 
     * @param templateText 
     */
    protected getNunjucksTemplate(templateContentId: string, templateText: string): any {
        let template = this._templateCache.get(templateContentId);
        if (!template) {
            template = new nunjucks.Template(templateText, this._nunjucksEnv);
            this._templateCache.set(templateContentId, template);
        }
        return template;
    }

    public ClearTemplateCache() {
        this._templateCache.clear();
    }

    /**
     * Promisifies the Nunjucks template rendering process.
     * @param template the Nunjucks template object
     * @param data the data to render the template with
     */
    protected async renderTemplateAsync(template: nunjucks.Template, data: any): Promise<string> {
        return new Promise((resolve, reject) => {
            template.render(data, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }
}
