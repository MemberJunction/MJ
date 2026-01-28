import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { LogError, LogStatus, Metadata, RunView } from '@memberjunction/core';
import { TemplateContentEntity, TemplateEntityExtended } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';

@ObjectType()
export class TemplateRunResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    output?: string;

    @Field({ nullable: true })
    error?: string;

    @Field({ nullable: true })
    executionTimeMs?: number;
}

@Resolver()
export class RunTemplateResolver extends ResolverBase {
    @Mutation(() => TemplateRunResult)
    async RunTemplate(
        @Arg('templateId') templateId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('contextData', { nullable: true }) contextData?: string
    ): Promise<TemplateRunResult> {
        // Check API key scope authorization for template execution
        await this.CheckAPIKeyScopeAuthorization('template:execute', templateId, userPayload);

        const startTime = Date.now();

        try {
            LogStatus(`=== RUNNING TEMPLATE FOR ID: ${templateId} ===`);

            // Parse context data (JSON string)
            let data = {};
            if (contextData) {
                try {
                    data = JSON.parse(contextData);
                } catch (parseError) {
                    return {
                        success: false,
                        error: `Invalid JSON in context data: ${(parseError as Error).message}`,
                        executionTimeMs: Date.now() - startTime
                    };
                }
            }

            // Get current user from payload
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return {
                    success: false,
                    error: 'Unable to determine current user',
                    executionTimeMs: Date.now() - startTime
                };
            }
            
            const p = GetReadWriteProvider(providers);
            // Load the template entity
            const templateEntity = await p.GetEntityObject<TemplateEntityExtended>('Templates', currentUser);
            await templateEntity.Load(templateId);
            
            if (!templateEntity.IsSaved) {
                return {
                    success: false,
                    error: `Template with ID ${templateId} not found`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Load template content (get the first/highest priority content)
            const rv = new RunView();
            const templateContentResult = await rv.RunView<TemplateContentEntity>({
                EntityName: 'Template Contents',
                ExtraFilter: `TemplateID = '${templateId}'`,
                OrderBy: 'Priority ASC',
                MaxRows: 1,
                ResultType: 'entity_object'
            }, currentUser);

            if (!templateContentResult.Results || templateContentResult.Results.length === 0) {
                return {
                    success: false,
                    error: `No template content found for template ${templateEntity.Name}`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Configure and render the template
            await TemplateEngineServer.Instance.Config(true /*always refresh to get latest templates*/, currentUser);
            const result = await TemplateEngineServer.Instance.RenderTemplate(
                templateEntity, 
                templateContentResult.Results[0], 
                data, 
                true // skip validation for execution
            );

            const executionTime = Date.now() - startTime;

            if (result.Success) {
                LogStatus(`=== TEMPLATE RUN COMPLETED FOR: ${templateEntity.Name} (${executionTime}ms) ===`);
                return {
                    success: true,
                    output: result.Output,
                    executionTimeMs: executionTime
                };
            } else {
                LogError(`Template run failed for ${templateEntity.Name}: ${result.Message}`);
                return {
                    success: false,
                    error: result.Message,
                    executionTimeMs: executionTime
                };
            }

        } catch (error) {
            const executionTime = Date.now() - startTime;
            LogError(`Template run failed:`, undefined, error);
            return {
                success: false,
                error: (error as Error).message || 'Unknown error occurred',
                executionTimeMs: executionTime
            };
        }
    }
}