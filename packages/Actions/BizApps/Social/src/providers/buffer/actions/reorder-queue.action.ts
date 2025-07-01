import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to reorder posts in a Buffer profile's queue
 */
@RegisterClass(BufferBaseAction, 'BufferReorderQueueAction')
export class BufferReorderQueueAction extends BufferBaseAction {
    /**
     * Reorder posts in the queue
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Get parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            const profileId = this.getParamValue(Params, 'ProfileID');
            const updateIds = this.getParamValue(Params, 'UpdateIDs');
            const offset = this.getParamValue(Params, 'Offset');

            // Validate required parameters
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }

            if (!profileId) {
                throw new Error('ProfileID is required');
            }

            if (!updateIds || !Array.isArray(updateIds) || updateIds.length === 0) {
                throw new Error('UpdateIDs array is required with at least one update ID');
            }

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_TOKEN',
                    Message: 'Failed to initialize Buffer OAuth connection',
                    Params
                };
            }

            // Reorder the updates
            const result = await this.reorderUpdates(profileId, updateIds, offset);

            // Get the new queue order to confirm
            const pendingPosts = await this.getUpdates(profileId, 'pending', {
                count: updateIds.length + (offset || 0) + 10
            });

            // Find the reordered posts in the new queue
            const reorderedPosts = pendingPosts.updates?.filter((update: any) => 
                updateIds.includes(update.id)
            ) || [];

            // Create summary
            const summary = {
                profileId: profileId,
                reorderedCount: updateIds.length,
                offset: offset || 0,
                newOrder: updateIds,
                success: result.success === true,
                newPositions: reorderedPosts.map((post: any, index: number) => ({
                    id: post.id,
                    position: index + (offset || 0),
                    scheduledFor: post.due_at ? new Date(post.due_at * 1000) : null,
                    text: post.text?.substring(0, 100) + (post.text?.length > 100 ? '...' : '')
                }))
            };

            // Update output parameters
            const outputParams = [...Params];
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const reorderedParam = outputParams.find(p => p.Name === 'ReorderedPosts');
            if (reorderedParam) reorderedParam.Value = reorderedPosts;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully reordered ${updateIds.length} posts in Buffer queue`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const resultCode = this.mapBufferError(error);
            
            return {
                Success: false,
                ResultCode: resultCode,
                Message: `Failed to reorder queue: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'ProfileID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UpdateIDs',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Offset',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'ReorderedPosts',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Reorders posts in a Buffer profile\'s queue, allowing you to change the posting schedule order';
    }
}