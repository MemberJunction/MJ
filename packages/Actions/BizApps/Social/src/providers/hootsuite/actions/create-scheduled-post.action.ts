import { RegisterClass } from '@memberjunction/global';
import { HootSuiteBaseAction } from '../hootsuite-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { MediaFile } from '../../../base/base-social.action';

/**
 * Action to create a scheduled post in HootSuite
 */
@RegisterClass(BaseAction, 'HootSuiteCreateScheduledPostAction')
export class HootSuiteCreateScheduledPostAction extends HootSuiteBaseAction {
    /**
     * Create a scheduled post in HootSuite
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
            const content = this.getParamValue(Params, 'Content');
            const profileIds = this.getParamValue(Params, 'ProfileIDs');
            const scheduledTime = this.getParamValue(Params, 'ScheduledTime');
            const mediaFiles = this.getParamValue(Params, 'MediaFiles');
            const tags = this.getParamValue(Params, 'Tags');
            const location = this.getParamValue(Params, 'Location');
            const targetingOptions = this.getParamValue(Params, 'TargetingOptions');

            // Validate required parameters
            if (!content) {
                throw new Error('Content is required');
            }

            // Get profile IDs - either from parameter or default profiles
            let socialProfileIds: string[] = [];
            if (profileIds && Array.isArray(profileIds)) {
                socialProfileIds = profileIds;
            } else if (profileIds && typeof profileIds === 'string') {
                socialProfileIds = [profileIds];
            } else {
                // Get default profiles if none specified
                const profiles = await this.getSocialProfiles();
                if (profiles.length === 0) {
                    throw new Error('No social profiles found. Please specify ProfileIDs.');
                }
                socialProfileIds = profiles.map(p => p.id);
                LogStatus(`Using ${socialProfileIds.length} default profiles`);
            }

            // Upload media if provided
            let mediaIds: string[] = [];
            if (mediaFiles && Array.isArray(mediaFiles)) {
                LogStatus(`Uploading ${mediaFiles.length} media files...`);
                mediaIds = await this.uploadMedia(mediaFiles as MediaFile[]);
            }

            // Build post data
            const postData: any = {
                text: content,
                socialProfileIds: socialProfileIds,
                scheduledTime: scheduledTime ? this.formatHootSuiteDate(scheduledTime) : undefined,
                mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
                tags: tags && Array.isArray(tags) ? tags : undefined,
                location: location ? {
                    latitude: location.latitude,
                    longitude: location.longitude
                } : undefined
            };

            // Add targeting options if provided
            if (targetingOptions) {
                postData.targeting = targetingOptions;
            }

            // Create the post
            LogStatus('Creating scheduled post...');
            const response = await this.axiosInstance.post('/messages', postData);
            const createdPost = response.data;

            // Normalize the created post
            const normalizedPost = this.normalizePost(createdPost);

            // Update output parameters
            const outputParams = [...Params];
            const postParam = outputParams.find(p => p.Name === 'CreatedPost');
            if (postParam) postParam.Value = normalizedPost;
            const postIdParam = outputParams.find(p => p.Name === 'PostID');
            if (postIdParam) postIdParam.Value = createdPost.id;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created scheduled post (ID: ${createdPost.id})`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Failed to create scheduled post: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Validate media files before upload
     */
    protected validateMediaFile(file: MediaFile): void {
        // HootSuite-specific media limits
        const supportedTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'video/mp4',
            'video/quicktime'
        ];

        if (!supportedTypes.includes(file.mimeType)) {
            throw new Error(`Unsupported media type: ${file.mimeType}. Supported types: ${supportedTypes.join(', ')}`);
        }

        // Check file sizes
        const maxSizes: Record<string, number> = {
            'image/jpeg': 10 * 1024 * 1024,   // 10MB
            'image/png': 10 * 1024 * 1024,    // 10MB
            'image/gif': 15 * 1024 * 1024,    // 15MB
            'video/mp4': 500 * 1024 * 1024,   // 500MB
            'video/quicktime': 500 * 1024 * 1024 // 500MB
        };

        const maxSize = maxSizes[file.mimeType];
        if (file.size > maxSize) {
            throw new Error(`File size exceeds limit for ${file.mimeType}. Max: ${maxSize / 1024 / 1024}MB, Got: ${file.size / 1024 / 1024}MB`);
        }
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
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
                Name: 'TargetingOptions',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CreatedPost',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'PostID',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Creates a scheduled post in HootSuite with support for multiple social profiles, media attachments, and scheduling';
    }
}