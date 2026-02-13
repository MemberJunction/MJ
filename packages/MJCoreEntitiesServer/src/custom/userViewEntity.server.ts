import { RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { BaseEntity, EntityInfo, LogError, IMetadataProvider } from "@memberjunction/core";
import { UserViewEntityExtended } from '@memberjunction/core-entities'
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";

/**
 * Expected response format from the Smart Filter AI prompt
 */
interface SmartFilterResponse {
    whereClause: string;
    orderByClause?: string;
    userExplanationMessage: string;
}

@RegisterClass(BaseEntity, 'MJ: User Views')
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
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser);

            // Find the Smart Filter Generation prompt
            const smartFilterPrompt = AIEngine.Instance.Prompts.find(
                p => p.Name === 'Smart Filter Generation' && p.Category === 'MJ: System'
            );

            if (!smartFilterPrompt) {
                throw new Error('Smart Filter Generation prompt not found. Please ensure the prompt metadata is synced.');
            }

            // Build template data for the prompt
            const templateData = this.BuildTemplateData(entityInfo);

            // Create execution parameters
            const params = new AIPromptParams();
            params.prompt = smartFilterPrompt;
            params.contextUser = this.ContextCurrentUser;
            params.data = templateData;
            params.attemptJSONRepair = true; // Help with JSON parsing issues

            // Add the user's filter request as a conversation message
            params.conversationMessages = [
                {
                    role: 'user',
                    content: prompt
                }
            ];

            // Execute the prompt
            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt<SmartFilterResponse>(params);

            if (!result.success) {
                throw new Error(`AI prompt execution failed: ${result.errorMessage}`);
            }

            if (!result.rawResult) {
                throw new Error('AI returned empty result');
            }

            // Process the response
            const llmResponse = SafeJSONParse<SmartFilterResponse>(result.rawResult);
            if (!llmResponse) {
                throw new Error('Failed to parse AI response as JSON');
            }

            // Handle the whereClause - sometimes LLM prefixes with WHERE
            if (llmResponse.whereClause && llmResponse.whereClause.length > 0) {
                const trimmed = llmResponse.whereClause.trim();
                const whereClause = trimmed.toLowerCase().startsWith('where ')
                    ? trimmed.substring(6)
                    : llmResponse.whereClause;

                return {
                    whereClause,
                    userExplanation: llmResponse.userExplanationMessage
                };
            }
            else if (llmResponse.whereClause !== undefined && llmResponse.whereClause !== null) {
                // Empty string is valid - means no where clause
                return {
                    whereClause: '',
                    userExplanation: llmResponse.userExplanationMessage
                };
            }
            else {
                throw new Error('Invalid response from AI, no whereClause property found');
            }
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**
     * Builds the template data object for the Smart Filter Generation prompt.
     * This data is used to populate the Nunjucks template variables.
     */
    protected BuildTemplateData(entityInfo: EntityInfo): Record<string, unknown> {
        const processedViews: string[] = [entityInfo.BaseView];
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const listsEntity = md.Entities.find(e => e.Name === "MJ: Lists");
        const listDetailsEntity = md.Entities.find(e => e.Name === "MJ: List Details");

        // Build fields description
        const fieldsDescription = entityInfo.Fields.map(f => {
            let ret: string = `${f.Name} (${f.Type})`;
            if (f.RelatedEntity) {
                ret += ` (fkey to ${f.RelatedEntityBaseView})`;
            }
            return ret;
        }).join(',');

        // Build related views description
        const relatedViewsDescription = this.BuildRelatedViewsDescription(entityInfo, md, processedViews);

        // Build lists fields
        const listsFields = listsEntity ? listsEntity.Fields.map(f => {
            return f.Name + ' (' + f.SQLFullType + ')';
        }).join(', ') : '';

        // Build list details fields
        const listDetailsFields = listDetailsEntity ? listDetailsEntity.Fields.map(f => {
            return f.Name + ' (' + f.SQLFullType + ')';
        }).join(', ') : '';

        return {
            entityName: entityInfo.Name,
            entityId: entityInfo.ID,
            baseView: entityInfo.BaseView,
            fieldsDescription,
            relatedViewsDescription: processedViews.length > 1 ? relatedViewsDescription : '',
            listsSchema: listsEntity?.SchemaName || '__mj',
            listsFields,
            listDetailsFields
        };
    }

    /**
     * Builds the description of related views for the prompt template.
     */
    protected BuildRelatedViewsDescription(entityInfo: EntityInfo, md: IMetadataProvider, processedViews: string[]): string {
        const fkeyFields = entityInfo.Fields.filter(f => f.RelatedEntity && f.RelatedEntity.length > 0);
        const fkeyBaseViewsDistinct = fkeyFields.map(f => f.RelatedEntityBaseView).filter((v, i, a) => a.indexOf(v) === i);

        // Build fkey views description
        const fkeyViewsDesc = fkeyBaseViewsDistinct.map(v => {
            if (processedViews.indexOf(v) === -1) {
                const e = md.Entities.find(e => e.BaseView === v);
                if (e) {
                    processedViews.push(v);
                    return `* ${e.SchemaName}.${e.BaseView}: ${e.Fields.map(ef => {
                        return ef.Name + ' (' + ef.Type + ')';
                    }).join(',') }`;
                }
            }
            return '';
        }).filter(s => s.length > 0).join('\n');

        // Build related entities views description
        const relatedEntitiesDesc = entityInfo.RelatedEntities.map(r => {
            const e = md.Entities.find(e => e.Name === r.RelatedEntity);
            if (e && processedViews.indexOf(e.BaseView) === -1) {
                processedViews.push(e.BaseView);
                return `* ${e.SchemaName}.${e.BaseView}: ${e.Fields.map(ef => {
                    let ret: string = `${ef.Name} (${ef.Type})`;
                    if (ef.RelatedEntity) {
                        ret += ` (fkey to ${ef.RelatedEntityBaseView})`;
                    }
                    return ret;
                }).join(',') }`;
            }
            return '';
        }).filter(s => s.length > 0).join('\n');

        return [fkeyViewsDesc, relatedEntitiesDesc].filter(s => s.length > 0).join('\n');
    }
}