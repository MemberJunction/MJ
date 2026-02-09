import { LogError, UserInfo } from "@memberjunction/core";
import { MJGlobal, RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { NunjucksCallback, TemplateExtensionBase } from "./TemplateExtensionBase";
import { AIEngine } from "@memberjunction/aiengine";
import { BaseLLM, GetAIAPIKey } from "@memberjunction/ai";
import { AIModelEntityExtended } from "@memberjunction/ai-core-plus";
// TODO: Add type defs based on nunjucks classes used for extensions
type Parser = any;
type Nodes = any;
type Lexer = any;
type Context = any;

/**
 * This class is an extension for the Nunjucks template engine that allows for the use of an AI prompt in a template.
 */
@RegisterClass(TemplateExtensionBase, 'AIPrompt')
export class AIPromptExtension extends TemplateExtensionBase {

    AllowFormattingText: string = "Do not use markdown, HTML, or any other special formatting."

    constructor(contextUser: UserInfo) {
        super(contextUser);
        this.tags = ['AIPrompt'];
    }
    
    public parse(parser: Parser, nodes: Nodes, lexer: Lexer) {
        // get the tag token
        var tok = parser.nextToken();

        // parse the args and move after the block end. passing true
        // as the second arg is required if there are no parentheses
        var params = parser.parseSignature(null, true);
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
        return new nodes.CallExtensionAsync(this, 'run', params, [body]);    
    }

    /**
     * Executes AI prompt processing using the configured language model.
     * 
     * **Parameter Mapping from CallExtensionAsync:**
     * - In parse(): `new nodes.CallExtensionAsync(this, 'run', params, [body])`
     * - Results in: `run(context, params, body, callBack)`
     * 
     * The key difference from TemplateEmbed is that we pass `[body]` as the 4th parameter
     * to CallExtensionAsync, which shifts the parameter order to include both params and body
     * as separate arguments. The body contains the prompt text between the opening and closing tags.
     * 
     * @param context - Nunjucks template rendering context containing variables and data
     * @param params - Parsed parameters from the opening tag (AIModel, AllowFormatting, etc.)
     * @param body - Function that returns the rendered prompt content between {% AIPrompt %} and {% endAIPrompt %}
     * @param callBack - Async callback function to return the AI-generated response or errors
     * 
     * @example
     * ```nunjucks
     * {% AIPrompt AIModel="gpt-4", AllowFormatting=true %}
     * Generate a personalized greeting for {{ user.name }} who works as {{ user.jobTitle }}.
     * Make it professional but warm.
     * {% endAIPrompt %}
     * ```
     */
    public run(context: Context, params: any, body: any, callBack: NunjucksCallback) {
        const prompt = body();
        const config: AIPromptConfig = {};
        // now map each value from params to the config object, and be case INsensitive
        for (const key in params) {
            if (params.hasOwnProperty(key)) {
                const value = params[key];
                // convert the key to lower case and remove any spaces
                const lowerKey = key.toLowerCase().replace(/\s+/g, '');
                // now set the value in the config object
                if (lowerKey === 'aimodel') {
                    config.AIModel = value;
                } else if (lowerKey === 'allowformatting') {
                    // convert the value to a boolean
                    if (typeof value === 'string') {
                        config.AllowFormatting = value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
                    } else if (typeof value === 'boolean') {
                        config.AllowFormatting = value;
                    } else {
                        // if the value is not a string or boolean, we will just set it to false
                        config.AllowFormatting = false;
                    }
                }
            }
        }

        // we now have the LLM prompt in the prompt variable
        // we can't use async/await here because this is a synchronous function
        // so instead we will use the callback pattern
        // we will get the highest power model from the AI Engine
        // then we will create an instance of the LLM class
        AIEngine.Instance.Config(false, this.ContextUser).then(async () => {
            try {
                let model: AIModelEntityExtended = null;
                if(config.AIModel) {
                    model = AIEngine.Instance.Models.find(m => 
                        m.Name.toLowerCase() === config.AIModel.toLowerCase() ||
                        m.APIName?.toLowerCase() === config.AIModel.toLowerCase() 
                    );
                    if (!model) {
                        throw new Error(`AI model '${config.AIModel}' not found.`);
                    }
                }
                else{
                    model = await AIEngine.Instance.GetHighestPowerModel('Groq', 'llm', this.ContextUser);
                    if (!model) {
                        throw new Error(`No AI model found for the vendor 'Groq' and type 'llm'.`);
                    }
                }
                
                const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass))
                const llmResult = await llm.ChatCompletion({
                    messages: [
                        {
                            role: 'system',
                            content: `Background: The output from this will be DIRECTLY inserted into a messaging template going to a recipient. For this reason whenever
                                                  you are prompted to provide a result, do not preface it with any text, just provide the result itself. ${config.AllowFormatting ? "" : this.AllowFormattingText }  Assume that the text you are generating will go directly into a message.
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
                    let response = llmResult.data.choices[0].message.content;
                    response = response.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

                    callBack(null, response);
                }
            }
            catch (e) {
                LogError(e);
                callBack(null, e);
            }
        });        
    }


    /**
     * Default implementation simply returns 'OpenAI' - override this in your subclass if you are using a different AI vendor.
     * @returns 
     */
    protected get DefaultAIVendorName(): string {
        return 'OpenAI';
    }

    /**
     * Default implementation simply grabs the first AI model that matches GetAIModelName().
     * @returns 
     */
    protected async GetAIModel(vendorName: string, contextUser: UserInfo): Promise<AIModelEntityExtended> {
        await AIEngine.Instance.Config(false, contextUser); // most of the time this is already loaded, but just in case it isn't we will load it here
        const models = AIEngine.Instance.Models.filter(m => m.AIModelType.trim().toLowerCase() === 'llm' && 
                                                    m.Vendor.trim().toLowerCase() === vendorName.trim().toLowerCase())  
        // next, sort the models by the PowerRank field so that the highest power rank model is the first array element
        models.sort((a, b) => b.PowerRank - a.PowerRank); // highest power rank first
        return models[0];
    }
}

export type AIPromptConfig = {
    /**
     * The AI model to use for the prompt. If not provided, the extension will use the highest power model available.
     */
    AIModel?: string;
    /**
     * Whether or not to allow the AI Model to return its reponse formatted, HTML, Markdown, JSON, etc.
     * If false, the AI Model will return the response as plain text
     */
    AllowFormatting?: boolean;
};

// function AIPromptExtension() {
//     this.tags = ['AIPrompt'];

//     this.parse = function(parser, nodes, lexer) {
//         // get the tag token
//         var tok = parser.nextToken();

//         // parse the args and move after the block end. passing true
//         // as the second arg is required if there are no parentheses
//         var args = parser.parseSignature(null, true);
//         parser.advanceAfterBlockEnd(tok.value);

//         // parse the body and possibly the error block, which is optional
//         var body = parser.parseUntilBlocks('error', 'endAIPrompt');
//         var errorBody = null;

//         if(parser.skipSymbol('error')) {
//             parser.skip(lexer.TOKEN_BLOCK_END);
//             errorBody = parser.parseUntilBlocks('endAIPrompt');
//         }

//         parser.advanceAfterBlockEnd();

//         // Parse the args and move after the block end.
//         // const args = parser.parseSignature(null, true);
//         // parser.advanceAfterBlockEnd(tok.value);

//         // // Parse the body
//         // const body = parser.parseUntilBlocks('endAIPrompt');
//         // parser.advanceAfterBlockEnd();

//         // const errorBody = '';

//         // See above for notes about CallExtension
//         return new nodes.CallExtensionAsync(this, 'run', args, [body, errorBody]);
//     };

//     this.run = function(context, body, errorBody, callBack) {
//         const prompt = body();
//         // we now have the LLM prompt in the prompt variable
//         // we can't use async/await here because this is a synchronous function
//         // so instead we will use the callback pattern
//         // we will get the highest power model from the AI Engine
//         // then we will create an instance of the LLM class
//         AIEngine.Instance.LoadAIMetadata(this._contextUser).then(async () => {
//             try {
//                 const model = await AIEngine.Instance.GetHighestPowerModel('Groq','llm', this._contextUser) 
//                 const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass))
//                 const llmResult = await llm.ChatCompletion({
//                     messages: [
//                         {
//                             role: 'system',
//                             content: `Background: The output from this will be DIRECTLY inserted into a messaging template going to a recipient. For this reason whenever
//                                                   you are prompted to provide a result, do not preface it with any text, just provide the result itself. Do not use
//                                                   markdown, HTML, or any other special formatting. Assume that the text you are generating will go directly into a message.
//                                       <IMPORTANT>ONLY PROVIDE THE RESPONSE REQUESTED FOR THE MESSAGE - **** DO NOT ADD ANYTHING ELSE ****</IMPORTANT>`,
//                         },
//                         {
//                             role: 'user',
//                             content: `${prompt}`,
//                         }
//                     ],
//                     model: model.APINameOrName
//                 })
//                 if (llmResult && llmResult.success) {
//                     callBack(null, llmResult.data.choices[0].message.content);
//                 }
//             }
//             catch (e) {
//                 LogError(e);
//             }
//         });
//     };
// }



// /**
//  * Default implementation simply returns 'OpenAI' - override this in your subclass if you are using a different AI vendor.
//  * @returns 
//  */
// function AIVendorName(): string {
//     return 'OpenAI';
// }

// /**
//  * Default implementation simply grabs the first AI model that matches GetAIModelName().
//  * @returns 
//  */
// async function GetAIModel(vendorName: string, contextUser: UserInfo): Promise<AIModelEntityExtended> {
//     await AIEngine.LoadAIMetadata(contextUser); // most of the time this is already loaded, but just in case it isn't we will load it here
//     const models = AIEngine.Models.filter(m => m.AIModelType.trim().toLowerCase() === 'llm' && 
//                                                 m.Vendor.trim().toLowerCase() === vendorName.trim().toLowerCase())  
//     // next, sort the models by the PowerRank field so that the highest power rank model is the first array element
//     models.sort((a, b) => b.PowerRank - a.PowerRank); // highest power rank first
//     return models[0];
// }