import { IMetadataProvider, LogError, UserInfo, ValidationErrorInfo } from "@memberjunction/core";
import { MJTemplateContentEntity, MJTemplateEntityExtended, MJTemplateParamEntity } from "@memberjunction/core-entities";
import nunjucks from 'nunjucks';
import { MJGlobal, UUIDsEqual } from "@memberjunction/global";
import { TemplateExtensionBase } from "./extensions/TemplateExtensionBase";
import { TemplateRenderResult, TemplateEngineBase } from '@memberjunction/templates-base-types'
  
/**
 * This class extends the nunjucks loader to allow adding templates directly to the loader
 */
export class TemplateEntityLoader extends nunjucks.Loader {
    public async = true; // tell nunjucks this is an async loader

    private templates: { [templateId: string]: MJTemplateEntityExtended } = {};

    /**
     * Add a new template to the loader
     * @param templateId 
     * @param template 
     */
    public AddTemplate(templateId: string, template: MJTemplateEntityExtended) {
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
            this._nunjucksEnv = new nunjucks.Environment(this._templateLoader as unknown as nunjucks.ILoader, { autoescape: true, dev: true });

            // Add custom filters
            this.addCustomFilters();

            // get all of the extensions that are registered and register them with nunjucks
            const extensions = MJGlobal.Instance.ClassFactory.GetAllRegistrations(TemplateExtensionBase);
            if (extensions && extensions.length > 0) {
                for (const ext of extensions) {
                    const SubClassConstructor = ext.SubClass as new (contextUser: UserInfo) => TemplateExtensionBase;
                    const instance = new SubClassConstructor(contextUser!);
                    if (ext.Key) {
                        this._nunjucksEnv.addExtension(ext.Key, instance);
                    }
                }
            }
        }
    }

    public SetupNunjucks(): void {
        this._templateLoader = new TemplateEntityLoader();
        this._nunjucksEnv = new nunjucks.Environment(this._templateLoader as unknown as nunjucks.ILoader, { autoescape: true, dev: true });
        
        // Add custom filters
        this.addCustomFilters();
    }

    private _nunjucksEnv: nunjucks.Environment;
    private _templateLoader: TemplateEntityLoader;

    /**
     * Adds custom filters to the Nunjucks environment
     */
    private addCustomFilters(): void {
        // Add a json filter for converting objects to JSON strings
        // This is similar to the built-in 'dump' filter but with more control
        this._nunjucksEnv.addFilter('json', (obj: any, indent: number = 2) => {
            try {
                return JSON.stringify(obj, null, indent);
            } catch (error) {
                return '[Error serializing to JSON: ' + error.message + ']';
            }
        });

        // Add a jsoninline filter for compact JSON output
        this._nunjucksEnv.addFilter('jsoninline', (obj: any) => {
            try {
                return JSON.stringify(obj);
            } catch (error) {
                return '[Error serializing to JSON: ' + error.message + ']';
            }
        });

        // Add a jsonparse filter for parsing JSON strings
        this._nunjucksEnv.addFilter('jsonparse', (str: string) => {
            try {
                return JSON.parse(str);
            } catch (error) {
                return str; // Return original string if parsing fails
            }
        });
    }

    /**
     * Cache for templates that have been created by nunjucks so we don't have to create them over and over
     */
    private _templateCache: Map<string, any> = new Map<string, any>();

    public AddTemplate(templateEntity: MJTemplateEntityExtended) {
        this._templateLoader.AddTemplate(templateEntity.ID, templateEntity);
    }
 
    
    /**
     * Renders a template with the given data.
     * @param templateEntity the template object to render
     * @param templateContent the template content item (within the template)  
     * @param data 
     */
    public async RenderTemplate(templateEntity: MJTemplateEntityExtended, templateContent: MJTemplateContentEntity, data: any, SkipValidation?: boolean): Promise<TemplateRenderResult> {
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
                // Validate using content-specific parameters
                const valResult = templateEntity.ValidateTemplateInput(data, templateContent.ID);
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
            
            // Merge default values from parameters applicable to this content
            const mergedData = this.mergeDefaultValues(templateEntity, templateContent.ID, data);
     
            const template = this.getNunjucksTemplate(templateContent.ID, templateContent.TemplateText, true);
            const result = await this.renderTemplateAsync(template, mergedData); 
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
                    resolve(result!);
                }
            });
        });
    }

    /**
     * Merges default values from template parameters with the provided data.
     * Content-specific parameters take precedence over global parameters when both define the same parameter name.
     * 
     * @param templateEntity - The template entity containing parameter definitions
     * @param contentId - The ID of the template content being rendered
     * @param data - The input data provided by the caller
     * @returns A new object containing merged data with defaults applied
     * 
     * @remarks
     * - Only applies defaults for parameters that are not already present in the input data
     * - Handles all parameter types: Scalar, Array, Object, Record, Entity
     * - Content-specific parameter defaults override global parameter defaults
     */
    protected mergeDefaultValues(templateEntity: MJTemplateEntityExtended, contentId: string, data: any): any {
        // Create a shallow copy of the input data
        const mergedData = { ...data };
        
        // Get all parameters applicable to this content
        const params = templateEntity.GetParametersForContent(contentId);
        
        // Group parameters by name to handle precedence
        const paramsByName = new Map<string, MJTemplateParamEntity>();
        
        // First add global parameters
        params.filter(p => !(p as any).TemplateContentID).forEach(p => {
            paramsByName.set(p.Name, p);
        });
        
        // Then add/override with content-specific parameters
        params.filter(p => UUIDsEqual((p as any).TemplateContentID, contentId)).forEach(p => {
            paramsByName.set(p.Name, p);
        });
        
        // Apply default values for missing parameters
        paramsByName.forEach((param, name) => {
            // Only apply default if the parameter is not already provided
            if (mergedData[name] === undefined && param.DefaultValue !== null && param.DefaultValue !== undefined) {
                try {
                    // Handle different parameter types
                    switch (param.Type) {
                        case 'Array':
                        case 'Object':
                        case 'Record':
                        case 'Entity':
                            // Try to parse as JSON for complex types
                            try {
                                mergedData[name] = JSON.parse(param.DefaultValue);
                            } catch {
                                // If not valid JSON, use as-is
                                mergedData[name] = param.DefaultValue;
                            }
                            break;
                        
                        case 'Scalar':
                        default:
                            // For scalar types, use the value directly
                            mergedData[name] = param.DefaultValue;
                            break;
                    }
                } catch (error) {
                    // Log warning but continue - don't fail the entire render
                    LogError(`Failed to apply default value for parameter '${name}': ${error.message}`);
                }
            }
        });
        
        return mergedData;
    }
}
