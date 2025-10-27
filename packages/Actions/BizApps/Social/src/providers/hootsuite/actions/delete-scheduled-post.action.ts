import { RegisterClass } from '@memberjunction/global';
import { HootSuiteBaseAction } from '../hootsuite-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
/**
 * Action to delete a scheduled post from HootSuite
 */
@RegisterClass(BaseAction, 'HootSuiteDeleteScheduledPostAction')
export class HootSuiteDeleteScheduledPostAction extends HootSuiteBaseAction {
  /**
   * Delete a scheduled post from HootSuite
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;

    try {
      // Initialize OAuth
      const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
      if (!(await this.initializeOAuth(companyIntegrationId))) {
        throw new Error('Failed to initialize OAuth connection');
      }

      // Extract parameters
      const postId = this.getParamValue(Params, 'PostID');
      const confirmDeletion = this.getParamValue(Params, 'ConfirmDeletion') || false;

      // Validate required parameters
      if (!postId) {
        throw new Error('PostID is required');
      }

      // Safety check - require confirmation
      if (!confirmDeletion) {
        return {
          Success: false,
          ResultCode: 'CONFIRMATION_REQUIRED',
          Message: 'Deletion not confirmed. Set ConfirmDeletion to true to proceed.',
          Params,
        };
      }

      // First, get the post details to verify it exists and can be deleted
      LogStatus(`Fetching post ${postId} details...`);
      let postDetails: any;

      try {
        const response = await this.axiosInstance.get(`/messages/${postId}`);
        postDetails = response.data;
      } catch (error: any) {
        if (error.response?.status === 404) {
          return {
            Success: false,
            ResultCode: 'POST_NOT_FOUND',
            Message: `Post with ID ${postId} not found`,
            Params,
          };
        }
        throw error;
      }

      // Check if post can be deleted
      if (postDetails.state === 'PUBLISHED') {
        return {
          Success: false,
          ResultCode: 'CANNOT_DELETE_PUBLISHED',
          Message: 'Cannot delete published posts. Only scheduled, draft, or failed posts can be deleted.',
          Params,
        };
      }

      // Store post details before deletion
      const deletedPostInfo = {
        id: postDetails.id,
        content: postDetails.text,
        state: postDetails.state,
        scheduledTime: postDetails.scheduledTime,
        profiles: postDetails.socialProfileIds,
        mediaCount: postDetails.mediaIds?.length || 0,
        tags: postDetails.tags || [],
        deletedAt: new Date().toISOString(),
      };

      // Delete the post
      LogStatus(`Deleting post ${postId}...`);
      await this.axiosInstance.delete(`/messages/${postId}`);

      // Verify deletion by trying to fetch the post again
      let verificationFailed = false;
      try {
        await this.axiosInstance.get(`/messages/${postId}`);
        verificationFailed = true;
      } catch (error: any) {
        if (error.response?.status !== 404) {
          verificationFailed = true;
        }
      }

      if (verificationFailed) {
        LogStatus('Warning: Post deletion could not be verified');
      }

      // Update output parameters
      const outputParams = [...Params];
      const deletedPostParam = outputParams.find((p) => p.Name === 'DeletedPostInfo');
      if (deletedPostParam) deletedPostParam.Value = deletedPostInfo;
      const deletionVerifiedParam = outputParams.find((p) => p.Name === 'DeletionVerified');
      if (deletionVerifiedParam) deletionVerifiedParam.Value = !verificationFailed;

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Successfully deleted post ${postId}`,
        Params: outputParams,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Handle specific error cases
      if (error instanceof Error && error.message.includes('404')) {
        return {
          Success: false,
          ResultCode: 'POST_NOT_FOUND',
          Message: `Post ${this.getParamValue(Params, 'PostID')} not found or already deleted`,
          Params,
        };
      }

      return {
        Success: false,
        ResultCode: 'ERROR',
        Message: `Failed to delete scheduled post: ${errorMessage}`,
        Params,
      };
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    return [
      ...this.oauthParams,
      {
        Name: 'PostID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'ConfirmDeletion',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'DeletedPostInfo',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'DeletionVerified',
        Type: 'Output',
        Value: null,
      },
    ];
  }

  /**
   * Get action description
   */
  public get Description(): string {
    return 'Deletes a scheduled post from HootSuite. Only SCHEDULED, DRAFT, or FAILED posts can be deleted. Published posts cannot be deleted.';
  }
}
