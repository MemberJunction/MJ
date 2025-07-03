import { RegisterClass } from '@memberjunction/global';
import { HootSuiteBaseAction } from '../hootsuite-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { MediaFile } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to update a scheduled post in HootSuite
 */
@RegisterClass(BaseAction, 'HootSuiteUpdateScheduledPostAction')
export class HootSuiteUpdateScheduledPostAction extends HootSuiteBaseAction {
    /**
     * Update a scheduled post in HootSuite
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!await this.initializeOAuth(companyIntegrationId)) {
                throw new Error('Failed to initialize OAuth connection');
            }

            // Extract parameters
            const postId = this.getParamValue(Params, 'PostID');
            const content = this.getParamValue(Params, 'Content');
            const profileIds = this.getParamValue(Params, 'ProfileIDs');
            const scheduledTime = this.getParamValue(Params, 'ScheduledTime');
            const mediaFiles = this.getParamValue(Params, 'MediaFiles');
            const replaceMedia = this.getParamValue(Params, 'ReplaceMedia') || false;
            const tags = this.getParamValue(Params, 'Tags');
            const location = this.getParamValue(Params, 'Location');

            // Validate required parameters
            if (!postId) {
                throw new Error('PostID is required');
            }

            // First, get the existing post
            LogStatus(`Fetching existing post ${postId}...`);
            const existingPostResponse = await this.axiosInstance.get(`/messages/${postId}`);
            const existingPost = existingPostResponse.data;

            // Check if post can be updated
            if (existingPost.state !== 'SCHEDULED' && existingPost.state !== 'DRAFT') {
                throw new Error(`Cannot update post in ${existingPost.state} state. Only SCHEDULED and DRAFT posts can be updated.`);
            }

            // Build update data
            const updateData: any = {};

            // Update content if provided
            if (content !== undefined && content !== null) {
                updateData.text = content;
            }

            // Update profile IDs if provided
            if (profileIds) {
                if (Array.isArray(profileIds)) {
                    updateData.socialProfileIds = profileIds;
                } else if (typeof profileIds === 'string') {
                    updateData.socialProfileIds = [profileIds];
                }
            }

            // Update scheduled time if provided
            if (scheduledTime !== undefined) {
                updateData.scheduledTime = scheduledTime ? this.formatHootSuiteDate(scheduledTime) : null;
            }

            // Handle media updates
            if (mediaFiles !== undefined) {
                if (replaceMedia || !existingPost.mediaIds || existingPost.mediaIds.length === 0) {
                    // Replace all media or add new media
                    if (mediaFiles && Array.isArray(mediaFiles) && mediaFiles.length > 0) {
                        LogStatus(`Uploading ${mediaFiles.length} media files...`);
                        const mediaIds = await this.uploadMedia(mediaFiles as MediaFile[]);
                        updateData.mediaIds = mediaIds;
                    } else {
                        // Remove all media
                        updateData.mediaIds = [];
                    }
                } else if (mediaFiles && Array.isArray(mediaFiles) && mediaFiles.length > 0) {
                    // Append new media to existing
                    LogStatus(`Uploading ${mediaFiles.length} additional media files...`);
                    const newMediaIds = await this.uploadMedia(mediaFiles as MediaFile[]);
                    updateData.mediaIds = [...(existingPost.mediaIds || []), ...newMediaIds];
                }
            }

            // Update tags if provided
            if (tags !== undefined) {
                updateData.tags = Array.isArray(tags) ? tags : [];
            }

            // Update location if provided
            if (location !== undefined) {
                updateData.location = location ? {
                    latitude: location.latitude,
                    longitude: location.longitude
                } : null;
            }

            // Only proceed if there are updates
            if (Object.keys(updateData).length === 0) {
                return {
                    Success: true,
                    ResultCode: 'NO_CHANGES',
                    Message: 'No updates were provided',
                    Params
                };
            }

            // Update the post
            LogStatus(`Updating post ${postId}...`);
            const response = await this.axiosInstance.patch(`/messages/${postId}`, updateData);
            const updatedPost = response.data;

            // Normalize the updated post
            const normalizedPost = this.normalizePost(updatedPost);

            // Update output parameters
            const outputParams = [...Params];
            const postParam = outputParams.find(p => p.Name === 'UpdatedPost');
            if (postParam) postParam.Value = normalizedPost;
            const changesSummaryParam = outputParams.find(p => p.Name === 'ChangesSummary');
            if (changesSummaryParam) changesSummaryParam.Value = {
                fieldsUpdated: Object.keys(updateData),
                previousState: existingPost.state,
                newState: updatedPost.state,
                mediaChanges: {
                    before: existingPost.mediaIds?.length || 0,
                    after: updatedPost.mediaIds?.length || 0
                }
            };

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully updated scheduled post (ID: ${postId})`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Failed to update scheduled post: ${errorMessage}`,
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
                Name: 'PostID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Content',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ProfileIDs',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ScheduledTime',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MediaFiles',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ReplaceMedia',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Tags',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Location',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UpdatedPost',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'ChangesSummary',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Updates a scheduled post in HootSuite. Only SCHEDULED and DRAFT posts can be updated.';
    }
}