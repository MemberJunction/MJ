import { LogError, UserInfo } from "@memberjunction/core";
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { NunjucksCallback, TemplateExtensionBase } from "./TemplateExtensionBase";
import { AIEngine } from "@memberjunction/aiengine";
import { BaseLLM, GetAIAPIKey } from "@memberjunction/ai";
import { AIModelEntityExtended } from "@memberjunction/core-entities";
import { Parser, Nodes, Lexer, Context } from 'nunjucks'; // Assuming these types exist in the Nunjucks TypeScript definitions

/**
 * This class is an extension for the Nunjucks template engine that allows for the use of an AI prompt in a template.
 */
@RegisterClass(TemplateExtensionBase, 'AIPrompt')
export class AIPromptExtension extends TemplateExtensionBase {
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
        return new nodes.CallExtensionAsync(this, 'run', params, [body, errorBody, params]);    
    }
    public run(context: Context, body: any, errorBody: any, callBack: NunjucksCallback) {
        const prompt = body();
        // we now have the LLM prompt in the prompt variable
        // we can't use async/await here because this is a synchronous function
        // so instead we will use the callback pattern
        // we will get the highest power model from the AI Engine
        // then we will create an instance of the LLM class
        AIEngine.Instance.LoadAIMetadata(this.ContextUser).then(async () => {
            try {
                const model = await AIEngine.Instance.GetHighestPowerModel('Groq','llm', this.ContextUser) 
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
        await AIEngine.LoadAIMetadata(contextUser); // most of the time this is already loaded, but just in case it isn't we will load it here
        const models = AIEngine.Models.filter(m => m.AIModelType.trim().toLowerCase() === 'llm' && 
                                                    m.Vendor.trim().toLowerCase() === vendorName.trim().toLowerCase())  
        // next, sort the models by the PowerRank field so that the highest power rank model is the first array element
        models.sort((a, b) => b.PowerRank - a.PowerRank); // highest power rank first
        return models[0];
    }
}

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