import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { MediaFile } from '../../../base/base-social.action';

/**
 * Action to create a new post in Buffer (scheduled or immediate)
 */
@RegisterClass(BaseAction, 'BufferCreatePostAction')
export class BufferCreatePostAction extends BufferBaseAction {
    /**
     * Create a Buffer post
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Get parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            const profileIds = this.getParamValue(Params, 'ProfileIDs');
            const content = this.getParamValue(Params, 'Content');
            const mediaFiles = this.getParamValue(Params, 'MediaFiles');
            const scheduledTime = this.getParamValue(Params, 'ScheduledTime');
            const postNow = this.getParamValue(Params, 'PostNow');
            const addToTop = this.getParamValue(Params, 'AddToTop');
            const shortenLinks = this.getParamValue(Params, 'ShortenLinks');
            const mediaLink = this.getParamValue(Params, 'MediaLink');
            const mediaDescription = this.getParamValue(Params, 'MediaDescription');

            // Validate required parameters
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }

            if (!profileIds || !Array.isArray(profileIds) || profileIds.length === 0) {
                throw new Error('ProfileIDs array is required with at least one profile');
            }

            if (!content && !mediaFiles && !mediaLink) {
                throw new Error('Content, MediaFiles, or MediaLink is required');
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

            // Prepare media array
            const media: any[] = [];

            // Upload media files if provided
            if (mediaFiles && Array.isArray(mediaFiles) && mediaFiles.length > 0) {
                const uploadedUrls = await this.uploadMedia(mediaFiles as MediaFile[]);
                uploadedUrls.forEach(url => {
                    media.push({ picture: url });
                });
            }

            // Add media link if provided
            if (mediaLink) {
                const mediaItem: any = { link: mediaLink };
                if (mediaDescription) {
                    mediaItem.description = mediaDescription;
                }
                media.push(mediaItem);
            }

            // Create the update
            const result = await this.createUpdate(
                profileIds,
                content || '',
                media.length > 0 ? media : undefined,
                scheduledTime ? new Date(scheduledTime) : undefined,
                {
                    now: postNow === true,
                    top: addToTop === true,
                    shorten: shortenLinks !== false // Default to true
                }
            );

            // Format the response
            const createdPosts = result.updates || [];
            const formattedPosts = createdPosts.map((update: any) => ({
                id: update.id,
                profileId: update.profile_id,
                service: update.profile_service,
                status: update.status,
                scheduledAt: update.due_at ? new Date(update.due_at * 1000) : null,
                text: update.text,
                media: update.media,
                createdAt: update.created_at ? new Date(update.created_at * 1000) : new Date()
            }));

            // Create summary
            const summary = {
                totalCreated: formattedPosts.length,
                profilesPosted: profileIds,
                scheduled: !postNow,
                scheduledTime: scheduledTime || null,
                hasMedia: media.length > 0
            };

            // Update output parameters
            const outputParams = [...Params];
            const postsParam = outputParams.find(p => p.Name === 'CreatedPosts');
            if (postsParam) postsParam.Value = formattedPosts;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created ${formattedPosts.length} Buffer post(s)`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const resultCode = this.mapBufferError(error);
            
            return {
                Success: false,
                ResultCode: resultCode,
                Message: `Failed to create Buffer post: ${errorMessage}`,
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
                Name: 'ProfileIDs',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Content',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MediaFiles',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MediaLink',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MediaDescription',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ScheduledTime',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PostNow',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'AddToTop',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'ShortenLinks',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'CreatedPosts',
                Type: 'Output',
                Value: null
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
        return 'Creates a new post in Buffer that can be scheduled or posted immediately to one or more social media profiles';
    }
}