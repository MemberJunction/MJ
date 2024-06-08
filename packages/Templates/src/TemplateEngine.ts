import { BaseEngine, BaseEnginePropertyConfig, LogError, UserInfo } from "@memberjunction/core";
import { AIModelEntityExtended, TemplateCategoryEntity, TemplateContentEntity, TemplateContentTypeEntity, TemplateEntity, TemplateParamEntity } from "@memberjunction/core-entities";
import * as nunjucks from 'nunjucks';
import { TemplateEntityExtended } from "./TemplateEntityExtended";
import { AIEngine } from "@memberjunction/aiengine";
import { MJGlobal } from "@memberjunction/global";
import { BaseLLM, GetAIAPIKey } from "@memberjunction/ai";


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
        //this._nunjucksEnv.addExtension('RemoteExtension', new RemoteExtension());
        const aiPromptExtension = new AIPromptExtension();
        aiPromptExtension._contextUser = contextUser;
        this._nunjucksEnv.addExtension('AIPrompt', aiPromptExtension);
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
        catch (e) {
            return {
                Success: false,
                Output: null,
                Message: e.message
            };
        }
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


function AIPromptExtension() {
    this.tags = ['AIPrompt'];

    this.parse = function(parser, nodes, lexer) {
        // get the tag token
        var tok = parser.nextToken();

        // parse the args and move after the block end. passing true
        // as the second arg is required if there are no parentheses
        var args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        // parse the body and possibly the error block, which is optional
        var body = parser.parseUntilBlocks('error', 'endAIPrompt');
        var errorBody = null;

        if(parser.skipSymbol('error')) {
            parser.skip(lexer.TOKEN_BLOCK_END);
            errorBody = parser.parseUntilBlocks('endAIPrompt');
        }

        parser.advanceAfterBlockEnd();

        // Parse the args and move after the block end.
        // const args = parser.parseSignature(null, true);
        // parser.advanceAfterBlockEnd(tok.value);

        // // Parse the body
        // const body = parser.parseUntilBlocks('endAIPrompt');
        // parser.advanceAfterBlockEnd();

        // const errorBody = '';

        // See above for notes about CallExtension
        return new nodes.CallExtensionAsync(this, 'run', args, [body, errorBody]);
    };

    this.run = function(context, body, errorBody, callBack, b, c, d, e) {
        const prompt = body();
        // we now have the LLM prompt in the prompt variable
        // we can't use async/await here because this is a synchronous function
        // so instead we will use the callback pattern
        // we will get the highest power model from the AI Engine
        // then we will create an instance of the LLM class
        AIEngine.Instance.LoadAIMetadata(this._contextUser).then(async () => {
            try {
                const model = await AIEngine.Instance.GetHighestPowerModel('Groq','llm', this._contextUser) 
                const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass))
                const llmResult = await llm.ChatCompletion({
                    messages: [
                        {
                            role: 'system',
                            content: `Background: The output from this will be DIRECTLY inserted into a messaging template going to a recipient. For this reason whenever
                                                  you are prompted to provide a result, do not preface it with any text, just provide the result itself. Do not use
                                                  markdown, HTML, or any other special formatting. Assume that the text you are generating will go directly into a message.
                                      <IMPORTANT>ONLY PROVIDE THE RESPONSE REQUESTED FOR THE MESSAGE - **** DO NOT ADD ANYTHING ELSE ****</IMPORTANT>`,
                        },
                        {
                            role: 'user',
                            content: `${prompt}`,
                        }
                    ],
                    model: model.APINameOrName
                })
                if (llmResult && llmResult.success) {
                    callBack(null, llmResult.data.choices[0].message.content);
                }
            }
            catch (e) {
                LogError(e);
            }
        });
    };
}



/**
 * Default implementation simply returns 'OpenAI' - override this in your subclass if you are using a different AI vendor.
 * @returns 
 */
function AIVendorName(): string {
    return 'OpenAI';
}

/**
 * Default implementation simply grabs the first AI model that matches GetAIModelName().
 * @returns 
 */
async function GetAIModel(vendorName: string, contextUser: UserInfo): Promise<AIModelEntityExtended> {
    await AIEngine.LoadAIMetadata(contextUser); // most of the time this is already loaded, but just in case it isn't we will load it here
    const models = AIEngine.Models.filter(m => m.AIModelType.trim().toLowerCase() === 'llm' && 
                                                m.Vendor.trim().toLowerCase() === vendorName.trim().toLowerCase())  
    // next, sort the models by the PowerRank field so that the highest power rank model is the first array element
    models.sort((a, b) => b.PowerRank - a.PowerRank); // highest power rank first
    return models[0];
}