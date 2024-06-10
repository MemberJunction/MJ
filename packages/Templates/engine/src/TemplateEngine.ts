import { BaseEngine, BaseEnginePropertyConfig, UserInfo } from "@memberjunction/core";
import { TemplateCategoryEntity, TemplateContentEntity, TemplateContentTypeEntity, TemplateParamEntity } from "@memberjunction/core-entities";
import * as nunjucks from 'nunjucks';
import { MJGlobal } from "@memberjunction/global";
import { TemplateExtensionBase } from "./extensions/TemplateExtensionBase";
import { TemplateEntityExtended, TemplateRenderResult } from '@memberjunction/templates-base-types'
  
/**
 * This class extends the nunjucks loader to allow adding templates directly to the loader
 */
export class TemplateEntityLoader extends nunjucks.Loader {
    public async: true; // tell nunjucks this is an async loader

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
export class TemplateEngine extends BaseEngine<TemplateEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): TemplateEngine {
       return super.getInstance<TemplateEngine>();
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
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // post-process the template content and params to associate them with a template
        this.Templates.forEach((t) => {
            t.Content = this.TemplateContents.filter((tc) => tc.TemplateID === t.ID);
            t.Params = this.TemplateParams.filter((tp) => tp.TemplateID === t.ID);
        });


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
            // const aiPromptExtension = new AIPromptExtension();
            // aiPromptExtension._contextUser = contextUser;
            // this._nunjucksEnv.addExtension('AIPrompt', aiPromptExtension);
        }
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
                    Message: valResult.Errors.join(', ')
                };
            }
    
//            return new Promise((resolve, reject) => {
                const template = new nunjucks.Template(templateContent.TemplateText, this._nunjucksEnv);
                const result = await this.renderTemplateAsync(template, data); 
                return {
                    Success: true,
                    Output: result,
                    Message: undefined
                };
                // template.render(data, (err, result) => {
                //     if (err) {
                //         reject({
                //             Success: false,
                //             Output: null,
                //             Message: err                    
                //         });
                //     } else {
                //         resolve({
                //             Success: true,
                //             Output: result,
                //             Message: undefined
                //         });
                //     }
                // });
//            });
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


// function RemoteExtension() {
//     this.tags = ['remote'];

//     this.parse = function(parser, nodes, lexer) {
//         // get the tag token
//         var tok = parser.nextToken();

//         // parse the args and move after the block end. passing true
//         // as the second arg is required if there are no parentheses
//         var args = parser.parseSignature(null, true);
//         parser.advanceAfterBlockEnd(tok.value);

//         // parse the body and possibly the error block, which is optional
//         var body = parser.parseUntilBlocks('error', 'endremote');
//         var errorBody = null;

//         if(parser.skipSymbol('error')) {
//             parser.skip(lexer.TOKEN_BLOCK_END);
//             errorBody = parser.parseUntilBlocks('endremote');
//         }

//         parser.advanceAfterBlockEnd();

//         // See above for notes about CallExtension
//         return new nodes.CallExtension(this, 'run', args, [body, errorBody]);
//     };

//     this.run = function(context, url, body, errorBody) {
//         var id = 'el' + Math.floor(Math.random() * 10000);
//         var ret = new nunjucks.runtime.SafeString('<div id="' + id + '">' + body() + '</div>');
//         var ajax = new XMLHttpRequest();

//         ajax.onreadystatechange = function() {
//             if(ajax.readyState == 4) {
//                 if(ajax.status == 200) {
//                     document.getElementById(id).innerHTML = ajax.responseText;
//                 }
//                 else {
//                     document.getElementById(id).innerHTML = errorBody();
//                 }
//             }
//         };

//         ajax.open('GET', url, true);
//         ajax.send();

//         return ret;
//     };
// }

