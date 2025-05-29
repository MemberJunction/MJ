import { IMetadataProvider, LogError, UserInfo, ValidationErrorInfo } from "@memberjunction/core";
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
    override Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        // call the base class to ensure we get the config loaded
        this.ClearTemplateCache(); // clear the template cache before we load the config
        return super.Config(forceRefresh, contextUser, provider);
    }
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

    public SetupNunjucks(): void {
        this._templateLoader = new TemplateEntityLoader();
        this._nunjucksEnv = new nunjucks.Environment(this._templateLoader, { autoescape: true, dev: true });
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
    public async RenderTemplate(templateEntity: TemplateEntityExtended, templateContent: TemplateContentEntity, data: any, SkipValidation?: boolean): Promise<TemplateRenderResult> {
        try {
            if (!templateContent) {
                return {
                    Success: false,
                    Output: null,
                    Message: 'templateContent variable is required'
                };
            }

            if (!templateContent.TemplateText) {
                return {
                    Success: false,
                    Output: null,
                    Message: 'TemplateContent.TemplateText variable is required'
                };
            }
    
            if(!SkipValidation){
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
            }
     
            const template = this.getNunjucksTemplate(templateContent.ID, templateContent.TemplateText, true);
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
     * Simple rendering utilty method. Use this to render any valid Nunjucks Template within the Nunjucks environment created by the Template Engine
     * without having to use the stored metadata (Templates/Template Contents/Template Params/etc) within the MJ database. This is useful when you have 
     * a template that is stored elsewhere or dynamically created and you just want to render it with some data.
     * @param templateText 
     * @param data 
     * @returns 
     */
    public async RenderTemplateSimple(templateText: string, data: any): Promise<TemplateRenderResult> {
        try {
            const template = this.createNunjucksTemplate(templateText);
            const result = await this.renderTemplateAsync(template, data);
            return {
                Success: true,
                Output: result,
                Message: undefined
            };
        }
        catch (e) {
            LogError(e);
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
     * @param templateId - must be provided if you want to cache the template, if not provided the template will not be cached
     * @param templateText 
     * @param cacheTemplate - if true, the template will be cached, otherwise it will not be cached
     */
    protected getNunjucksTemplate(templateContentId: string, templateText: string, cacheTemplate: boolean): any {
        if (templateContentId && cacheTemplate) {
            let template = this._templateCache.get(templateContentId);
            if (!template) {
                template = this.createNunjucksTemplate(templateText);
                this._templateCache.set(templateContentId, template);
            }
            return template;    
        }
        else {
            // we don't have a template ID which means this is a dyanmic template, and so we don't want to do
            // anything with the cache, we just create a new nunjucks template and return it
            return this.createNunjucksTemplate(templateText);
        }
    }

    /**
     * Simple utility method to create a new Nunjucks template object and bind it to our Nunjucks environment.
     * @param templateText 
     * @returns 
     */
    protected createNunjucksTemplate(templateText: string): any {
        return new nunjucks.Template(templateText, this._nunjucksEnv);
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
