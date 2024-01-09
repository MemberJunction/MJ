import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { BaseEntity, EntityInfo, LogError, Metadata } from "@memberjunction/core";
import { UserViewEntityExtended } from '@memberjunction/core-entities'
import { BaseLLM, BaseModel, ChatParams, IChat, OpenAILLM } from "@memberjunction/ai";

@RegisterClass(BaseEntity, 'User Views', 3) // high priority to ensure this is used ahead of the UserViewEntityExtended in the @memberjunction/core-entities package (which has priority of 2)
export class UserViewEntity_Server extends UserViewEntityExtended  {
    /**
     * This property is hard-coded to true in this class because we DO support smart filters in this class. If you want to disable smart filters for a specific view you can override this property in your subclass and set it to false.
     */
    protected override get SmartFilterImplemented(): boolean {
        return true;
    }

    /** 
     * This method will use AI to return a valid WHERE clause based on the provided prompt. This is automatically called at the right time if the view has SmartFilterEnabled turned on and the SmartFilterPrompt is set. If you want
     * to call this directly to get back a WHERE clause for other purposes you can call this method directly and provide both a prompt and the entity that the view is based on.
     * @param prompt 
     */
    public async GenerateSmartFilterWhereClause(prompt: string, entityInfo: EntityInfo): Promise<{whereClause: string, userExplanation: string}> {
        try {
            const llm = <IChat> new OpenAILLM(); // for now, hardcoded to use OpenAI

            const chatParams: ChatParams = {
                model: 'gpt-4',
                systemPrompt: this.GenerateSysPrompt(entityInfo),
                userMessage: '',
                messages: [      
                {
                    role: 'user',
                    content: `${prompt}`,
                  },
                ],
            }
            const result = await llm.ChatCompletion(chatParams);
            if (result && result.data) {
                const llmResponse = result.data.choices[0].message.content;
                if (llmResponse) {
                    // try to parse it as JSON
                    try {
                        const parsed = JSON.parse(llmResponse);
                        if (parsed.whereClause && parsed.whereClause.length > 0) {
                            // we have the where clause. Sometimes the LLM prefixes it with WHERE and somtimes not, we need to strip WHERE if it is there
                            const trimmed = parsed.whereClause.trim();
                            let ret: string = '';
                            if (trimmed.toLowerCase().startsWith('where '))
                                ret = trimmed.substring(6);
                            else
                                ret = parsed.whereClause;

                            return  { 
                                        whereClause: ret, 
                                        userExplanation: parsed.userExplanationMessage
                                    };
                        }
                        else if (parsed.whereClause !== undefined && parsed.whereClause !== null) {
                            return  { 
                                whereClause: '',  // empty string is valid, it means no where clause
                                userExplanation: parsed.userExplanationMessage
                            };
                        }
                        else {
                            // if we get here, no whereClause property was provided by the LLM, that is an error
                            throw new Error('Invalid response from AI, no whereClause property found in response: ' + llmResponse);
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

    public GenerateSysPrompt(entityInfo: EntityInfo): string {
        const processedViews: string[] = [entityInfo.BaseView];
        const md = new Metadata();
        const gptSysPrompt: string = `You are an expert in SQL and Microsoft SQL Server.
You will be provided a user prompt representing how they want to filter the data.
You may *NOT* use JOINS, only sub-queries for related tables. 

I am a bot and can only understand JSON. Your response must be parsable into this type:
const returnType = {
    whereClause: string,
    orderByClause: string
    userExplanationMessage: string
};

The view that the user is querying is called ${entityInfo.BaseView} and has these fields:
${entityInfo.Fields.map(f => {
    let ret: string = `${f.Name} (${f.Type})`;
    if (f.RelatedEntity) {
        ret += ` (fkey to ${f.RelatedEntityBaseView})`;
    }
    return ret;
}).join(',')}`

        const fkeyFields = entityInfo.Fields.filter(f => f.RelatedEntity && f.RelatedEntity.length > 0);
        const fkeyBaseViewsDistinct = fkeyFields.map(f => f.RelatedEntityBaseView).filter((v, i, a) => a.indexOf(v) === i);
        const relationships: string = `
In addition, ${entityInfo.BaseView} has links to other views, as shown here, you can use these views in sub-queries to achieve the request from the user.
If there are multiple filters related to a single related view, attempt to combine them into a single sub-query for efficiency.
${
    // this part returns a list of all the related views and the fields that are related to the current view via fkeys in the current view
    fkeyBaseViewsDistinct.map(v => {
        if (processedViews.indexOf(v) === -1) {
            const e = md.Entities.find(e => e.BaseView === v);
            if (e) {
                processedViews.push(v); // already processed this view now, so we won't repeat it
                return `* ${e.SchemaName}.${e.BaseView}: ${e.Fields.map(ef => {
                    return ef.Name + ' (' + ef.Type + ')';
                }).join(',') }`
            }
            else
                return '';    
        }
        else 
            return ''; // already did this at some point
    }).join('\n')
}
${
    // this part returns a list of all the related views and the fields that are related to the current view fkeys in THOSE views
    entityInfo.RelatedEntities.map(r => {
        const e = md.Entities.find(e => e.Name === r.RelatedEntity);
        if (e) {
            if (processedViews.indexOf(e.BaseView) === -1) {
                processedViews.push(e.BaseView); // note that we are processing this view now, so we won't repeat it
                return `* ${e.SchemaName}.${e.BaseView}: ${e.Fields.map(ef => {
                    let ret: string = `${ef.Name} (${ef.Type})`;
                    if (ef.RelatedEntity) {
                        ret += ` (fkey to ${ef.RelatedEntityBaseView})`;
                    }
                    return ret;
                }).join(',') }`    
            }
            else
                return ''; // already did this at some point
        }
        else
            return '';
    }).join('\n')
}`

        return gptSysPrompt + (processedViews.length > 1 /*we always have 1 from the entity base view*/ ? relationships : '') + `
        **** REMEMBER **** I am a BOT, do not return anything other than JSON to me or I will choke on your response!`;
    }    
}
