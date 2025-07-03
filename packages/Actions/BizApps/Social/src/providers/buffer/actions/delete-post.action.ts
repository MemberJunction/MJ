import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to delete a post from Buffer
 */
@RegisterClass(BaseAction, 'BufferDeletePostAction')
export class BufferDeletePostAction extends BufferBaseAction {
    /**
     * Delete a Buffer post
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Get parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            const updateId = this.getParamValue(Params, 'UpdateID');

            // Validate required parameters
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }

            if (!updateId) {
                throw new Error('UpdateID is required');
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

            // Delete the update
            const success = await this.deleteUpdate(updateId);

            // Create summary
            const summary = {
                updateId: updateId,
                deleted: success,
                deletedAt: new Date()
            };

            // Update output parameters
            const outputParams = [...Params];
            const deletedParam = outputParams.find(p => p.Name === 'Deleted');
            if (deletedParam) deletedParam.Value = success;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            if (success) {
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Successfully deleted Buffer post ${updateId}`,
                    Params: outputParams
                };
            } else {
                return {
                    Success: false,
                    ResultCode: 'DELETE_FAILED',
                    Message: `Failed to delete Buffer post ${updateId}`,
                    Params: outputParams
                };
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const resultCode = this.mapBufferError(error);
            
            return {
                Success: false,
                ResultCode: resultCode,
                Message: `Failed to delete post: ${errorMessage}`,
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
                Name: 'UpdateID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Deleted',
                Type: 'Output',
                Value: false
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Deletes a pending or sent post from Buffer';
    }
}