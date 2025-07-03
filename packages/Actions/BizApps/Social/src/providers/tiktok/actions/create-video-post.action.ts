import { RegisterClass } from '@memberjunction/global';
import { TikTokBaseAction } from '../tiktok-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to create a video post on TikTok
 * Note: This requires special API approval from TikTok
 */
@RegisterClass(BaseAction, 'CreateVideoPostAction')
export class CreateVideoPostAction extends TikTokBaseAction {
    
    /**
     * Create a video post on TikTok
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }
            
            await this.initializeOAuth(companyIntegrationId);
            
            // Extract parameters
            const videoUrl = this.getParamValue(Params, 'VideoURL');
            const title = this.getParamValue(Params, 'Title');
            const description = this.getParamValue(Params, 'Description');
            const hashtags = this.getParamValue(Params, 'Hashtags') || [];
            const privacyLevel = this.getParamValue(Params, 'PrivacyLevel') || 'PUBLIC';
            const allowComments = this.getParamValue(Params, 'AllowComments') !== false;
            const allowDuet = this.getParamValue(Params, 'AllowDuet') !== false;
            const allowStitch = this.getParamValue(Params, 'AllowStitch') !== false;
            const scheduleTime = this.getParamValue(Params, 'ScheduleTime');
            
            // Validate required parameters
            if (!videoUrl && !this.getParamValue(Params, 'VideoFile')) {
                throw new Error('Either VideoURL or VideoFile is required');
            }
            
            // Build description with hashtags
            const hashtagString = hashtags.map((tag: string) => 
                tag.startsWith('#') ? tag : `#${tag}`
            ).join(' ');
            const fullDescription = description ? `${description} ${hashtagString}`.trim() : hashtagString;
            
            // Check if we have video upload approval
            const hasUploadApproval = this.getCustomAttribute(3) === 'approved';
            
            if (!hasUploadApproval) {
                // Return informative message about TikTok limitations
                const alternativeSteps = {
                    manualProcess: [
                        '1. Download the TikTok mobile app',
                        '2. Log in to your TikTok account',
                        '3. Tap the + button to create a new video',
                        '4. Upload your video or record a new one',
                        `5. Add title: "${title || 'Your video title'}"`,
                        `6. Add description: "${fullDescription}"`,
                        '7. Set privacy and interaction settings',
                        '8. Post immediately or save as draft'
                    ],
                    businessSolution: 'For automated posting, apply for TikTok Marketing API access at https://ads.tiktok.com/marketing_api/',
                    thirdPartyTools: [
                        'TikTok Creator Studio (web interface)',
                        'Buffer (with TikTok integration)',
                        'Hootsuite (business plans)'
                    ]
                };
                
                // Update output parameters with alternative instructions
                const outputParams = [...Params];
                const postIdParam = outputParams.find(p => p.Name === 'PostID');
                if (postIdParam) postIdParam.Value = null;
                const postUrlParam = outputParams.find(p => p.Name === 'PostURL');
                if (postUrlParam) postUrlParam.Value = null;
                const alternativesParam = outputParams.find(p => p.Name === 'Alternatives');
                if (alternativesParam) alternativesParam.Value = alternativeSteps;
                
                return {
                    Success: false,
                    ResultCode: 'API_LIMITATION',
                    Message: 'TikTok video upload requires special API approval. See Alternatives output for manual posting instructions.',
                    Params: outputParams
                };
            }
            
            // If we have approval, attempt to create the post
            // This is the theoretical implementation if approval is granted
            const createPostData = {
                video_url: videoUrl,
                title: title,
                description: fullDescription,
                privacy_level: privacyLevel,
                allow_comments: allowComments,
                allow_duet: allowDuet,
                allow_stitch: allowStitch,
                scheduled_publish_time: scheduleTime ? new Date(scheduleTime).toISOString() : undefined
            };
            
            const response = await this.makeTikTokRequest<any>(
                '/v2/video/upload/',
                'POST',
                createPostData
            );
            
            const postData = response.data;
            
            // Update output parameters
            const outputParams = [...Params];
            const postIdParam = outputParams.find(p => p.Name === 'PostID');
            if (postIdParam) postIdParam.Value = postData.video_id;
            const postUrlParam = outputParams.find(p => p.Name === 'PostURL');
            if (postUrlParam) postUrlParam.Value = postData.share_url;
            const statusParam = outputParams.find(p => p.Name === 'Status');
            if (statusParam) statusParam.Value = postData.status;
            
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created TikTok video post: ${postData.video_id}`,
                Params: outputParams
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for specific TikTok error codes
            if (errorMessage.includes('insufficient_permissions')) {
                return {
                    Success: false,
                    ResultCode: 'INSUFFICIENT_PERMISSIONS',
                    Message: 'This action requires TikTok Marketing API approval. Contact TikTok for Business.',
                    Params
                };
            }
            
            return {
                Success: false,
                ResultCode: this.isAuthError(error) ? 'INVALID_TOKEN' : 'ERROR',
                Message: `Failed to create TikTok video post: ${errorMessage}`,
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
                Name: 'VideoURL',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'VideoFile',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Title',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Description',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Hashtags',
                Type: 'Input',
                Value: []
            },
            {
                Name: 'PrivacyLevel',
                Type: 'Input',
                Value: 'PUBLIC'
            },
            {
                Name: 'AllowComments',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'AllowDuet',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'AllowStitch',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'ScheduleTime',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PostID',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'PostURL',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Status',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Alternatives',
                Type: 'Output',
                Value: null
            }
        ];
    }
    
    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Creates a video post on TikTok (requires special API approval from TikTok)';
    }
}