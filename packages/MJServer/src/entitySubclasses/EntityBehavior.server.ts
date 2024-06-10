import { CleanJSON, MJGlobal, RegisterClass } from "@memberjunction/global";
import { BaseEntity, EntityInfo, EntitySaveOptions, LogError, Metadata } from "@memberjunction/core";
import { AIModelEntityExtended, EntityBehaviorEntityExtended, EntityBehaviorTypeEntity } from '@memberjunction/core-entities'
import { BaseLLM, ChatParams, GetAIAPIKey } from "@memberjunction/ai";
import { AIEngine } from "@memberjunction/aiengine";
import { LoadOpenAILLM } from "@memberjunction/ai-openai";
LoadOpenAILLM(); // this is to prevent tree shaking since the openai package is not directly used and rather instantiated dynamically in the LoadOpenAILLM function. Since no static code path exists tree shaking can result in this class being optimized out

@RegisterClass(BaseEntity, 'Entity Behaviors', 3) // high priority to ensure this is used ahead of other classes including the custom client-side only sub-class that this derives from
export class EntityBehaviorEntity_Server extends EntityBehaviorEntityExtended  {
    /**
     * Default implementation simply returns 'OpenAI' - override this in your subclass if you are using a different AI vendor.
     * @returns 
     */
    protected get AIVendorName(): string {
        return 'OpenAI';
    }

    /**
     * Default implementation simply grabs the first AI model that matches GetAIModelName().
     * @returns 
     */
    protected async GetAIModel(): Promise<AIModelEntityExtended> {
        await AIEngine.Instance.Config(false, this.ContextCurrentUser); // most of the time this is already loaded, but just in case it isn't we will load it here
        const models = AIEngine.Models.filter(m => m.AIModelType.trim().toLowerCase() === 'llm' && 
                                                   m.Vendor.trim().toLowerCase() === this.AIVendorName.trim().toLowerCase())  
        // next, sort the models by the PowerRank field so that the highest power rank model is the first array element
        models.sort((a, b) => b.PowerRank - a.PowerRank); // highest power rank first
        return models[0];
    }
    
    /**
     * Overrides the Save method to implement checking of any changes to the Description field, or a new record condition, and in those cases, will call GenerateCode to generate the code for the new behavior.
     * @param options 
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.CodeGenerated && this.RegenerateCode) {
            const md = new Metadata();
            const ei = md.Entities.find(e => e.ID === this.EntityID);
            const bt = <EntityBehaviorTypeEntity>await md.GetEntityObject("Entity Behavior Types", this.ContextCurrentUser);
            await bt.Load(this.BehaviorTypeID)

            // next up, we need to determine for this behavior type, which code generator to use
            const codeGen = MJGlobal.Instance.ClassFactory.CreateInstance<EntityBehaviorTypeCodeGeneratorBase>(EntityBehaviorTypeCodeGeneratorBase, bt.Name);
            if (!codeGen)
                throw new Error(`No code generator found for behavior type ${bt.Name}`);

            // next up, we generate the code
            let result: {code: string, explanation: string};
            if (codeGen.Type == 'Prompt') {
                const btPrompt = await codeGen.GenerateSysPrompt(ei, bt);
                result = await this.GenerateCode(this.Description, btPrompt, bt, ei)
            }
            else {
                // in this scenario, the code generator wants to do all the code gen itself so just let it
                result = await codeGen.GenerateCode(this.Description, bt, ei);
            }
            if (result) {
                this.Code = result.code;
                this.CodeExplanation = result.explanation;
            }
            else {
                this.Code = null;
                this.CodeExplanation = 'No code generated';
            }

            this.RegenerateCode = false; // reset the flag
        }
        return super.Save(options);
    }

    /** 
     * This method will use AI to generate code that matches the desired behavior.
     * @param prompt 
     */
    public async GenerateCode(behaviorDescription: string, behaviorTypePrompt: string, behaviorType: EntityBehaviorTypeEntity, entityInfo: EntityInfo): Promise<{code: string, explanation: string}> {
        try {
            const model = await this.GetAIModel();
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass)); 

            const chatParams: ChatParams = {
                model: model.APINameOrName,
                messages: [      
                    {
                        role: 'system',
                        content: this.GenerateSysPrompt(entityInfo, behaviorTypePrompt, behaviorType)
                    },
                    {
                        role: 'user',
                        content: behaviorDescription,
                    },
                ],
            }
            const result = await llm.ChatCompletion(chatParams);
            if (result && result.data) {
                const llmResponse = result.data.choices[0].message.content;
                if (llmResponse) {
                    // try to parse it as JSON
                    try {
                        const cleansed = CleanJSON(llmResponse);
                        if (!cleansed)
                            throw new Error('Invalid JSON response from AI: ' + llmResponse);

                        const parsed = JSON.parse(cleansed);
                        if (parsed.code && parsed.code.length > 0) {
                            // we have the where clause. Sometimes the LLM prefixes it with WHERE and somtimes not, we need to strip WHERE if it is there
                            const trimmed = parsed.code.trim();

                            return  { 
                                        code: trimmed, 
                                        explanation: parsed.explanation
                                    };
                        }
                        else if (parsed.code !== undefined && parsed.code !== null) {
                            return  { 
                                code: '',  // empty string is valid, it means no code generated
                                explanation: parsed.explanation
                            };
                        }
                        else {
                            // if we get here, no code was provided by the LLM, that is an error
                            throw new Error('Invalid response from AI, no code property found in response: ' + llmResponse);
                        }
                    }
                    catch (e) {
                        LogError(e);
                        throw new Error('Error parsing JSON response from AI: ' + llmResponse);
                    }
                }
                else 
                    throw new Error('Null response from AI');
            }
            else
                throw new Error('No result returned from AI');
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    public GenerateSysPrompt(entityInfo: EntityInfo, behaviorTypePrompt: string, behaviorType: EntityBehaviorTypeEntity): string {
        const prompt: string = `You are an expert in TypeScript coding and business applications. You take great pride in easy to read, commented, and BEAUTIFULLY formatted code.
You will be provided a system administrator's request for how to handle a specific type of behavior for the ${entityInfo.Name} entity in our system.

The type of behavior is ${behaviorType.Name} and is described as follows:
<BEHAVIOR_SPECIFIC_INFO>
    ${behaviorTypePrompt}
</BEHAVIOR_SPECIFIC_INFO>

The next message, which will be a user message in the conversation, will contain the sys admin's requested behavior for this entity. 

Here is the entity's schema information. When generating code that use the getter/setter methods for fields inside the object instance make sure to use the CodeName for the related entity field which sometimes
is different from the SQL Field Name if the SQL Field Name contains characters that are not valid in TypeScript variable names.

${entityInfo.Name} (${entityInfo.SchemaName}.${entityInfo.BaseView})
${
    entityInfo.Description ? `Description: ${entityInfo.Description}` : ''
}
Fields: 
${entityInfo.Fields.map(f => {
    let ret: string = `${f.Name} (${f.Type}) (CodeName: ${f.CodeName})`;
    if (f.RelatedEntity) {
        ret += ` (fkey to ${f.RelatedEntityBaseView})`;
    }
    return ret;
}).join(',')}

<CRITICAL>
I am a bot and can only understand JSON. Your response must be parsable into this type:
const returnType = {
    code: string, // The typescript code you will create that will work in the context described above. MAKE SURE TO PRETTY FORMAT THIS WITH SPACE INDENTS AND LINE BREAKS IN THE CODE!
    explanation: string // an explanation for the system admin of how the code works and why it was written that way
};
</CRITICAL>
**** REMEMBER **** I am a BOT, do not return anything other than JSON to me or I will choke on your response!
`
        return prompt;
    }    
}


/**
 * This is a simple stub base class that will be sub-classed in order to generate actual code for various scenarios. Build sub-classes and register them with a key that matches the Name of the Entity Behavior Type it relates to.
 */
export abstract class EntityBehaviorTypeCodeGeneratorBase {
    public abstract GenerateCode(behaviorDescription: string, behaviorType: EntityBehaviorTypeEntity, entityInfo: EntityInfo): Promise<{code: string, explanation: string}>;
    public abstract GenerateSysPrompt(entityInfo: EntityInfo, behaviorType: EntityBehaviorTypeEntity): Promise<string>;
    public abstract get Type(): 'Prompt' | 'Function';
}

@RegisterClass(EntityBehaviorTypeCodeGeneratorBase, 'Validation', 1)
export class ValidateEntityBehaviorCodeGenerator extends EntityBehaviorTypeCodeGeneratorBase {
    public get Type(): 'Prompt' | 'Function' {
        return 'Prompt';
    }
    public async GenerateCode(behaviorDescription: string, behaviorType: EntityBehaviorTypeEntity, entityInfo: EntityInfo): Promise<{code: string, explanation: string}> {
        throw new Error('Not implemented');
    }
    public async GenerateSysPrompt(entityInfo: EntityInfo, behaviorType: EntityBehaviorTypeEntity): Promise<string> {
        return `
        Your job is to create TypeScript code that will be executed within a Validate() method in a TypeScript sub-class of BaseEntity. 
        BaseEntity is an ORM style model entity that is being sub-classed for this entity specifically and we want to incorporate the logic for 
        the Validate method requested into TypeScript code that we will insert into an override of the BaseClass Validate method. It is important that you 
        call super.Validate() at some point in your code to incorporate the base class Validation. 
   
        For example, you might define the Validate() function as follows, and in your generated code you would get rid of the comments I have below and replace with your own relevant comments.
   
       public Validate(): ValidationResult  {
           const result = super.Validate();
   
           // The above super.Validate() may have returned a false or true Success property. Either way, do your custom
           // validation here to add to

           // ADD YOUR CUSTOM VALIDATION LOGIC HERE and update result.Success to false if anything fails and for each
           // failed valdiation condition add the ValidationErrorInfo to the Errors array of the result variable.
   
           return result;			
       }
        
        Validate must return a ValidationResult as defined below. Make sure your return type code complies with these strong type definitions.
         class ValidationErrorInfo {
           Source: string
           Message: string
           Value: string
           Type: ValidationErrorType
        }
        const ValidationErrorType = {
           Failure: ''Failure'',
           Warning: ''Warning'',
        } as const;
   
       class ValidationResult {
           Success: boolean
           Errors: ValidationErrorInfo[] = []
       }

       <IMPORTANT>The code you must return is ONLY the Validate() function, do not return anything else inside the code property in the JSON object!</IMPORTANT>
       `
    }
}