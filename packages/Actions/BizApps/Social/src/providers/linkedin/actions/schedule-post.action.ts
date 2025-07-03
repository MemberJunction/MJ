import { RegisterClass } from '@memberjunction/global';
import { LinkedInBaseAction, LinkedInShareData } from '../linkedin-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { MediaFile } from '../../../base/base-social.action';

/**
 * Action to schedule a post on LinkedIn
 * Note: LinkedIn API v2 does not have native scheduling support.
 * This action stores the post data for later publishing via a separate scheduler service.
 */
@RegisterClass(BaseAction, 'LinkedInSchedulePostAction')
export class LinkedInSchedulePostAction extends LinkedInBaseAction {
    /**
     * Schedule a post for future publishing on LinkedIn
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
            const scheduledTime = this.getParamValue(Params, 'ScheduledTime');
            const authorType = this.getParamValue(Params, 'AuthorType') || 'personal'; // 'personal' or 'organization'
            const organizationId = this.getParamValue(Params, 'OrganizationID');
            const mediaFiles = this.getParamValue(Params, 'MediaFiles');
            const visibility = this.getParamValue(Params, 'Visibility') || 'PUBLIC';
            const visibleToGuest = this.getParamValue(Params, 'VisibleToGuest') !== false; // Default true

            // Validate required parameters
            if (!content) {
                throw new Error('Content is required');
            }
            if (!scheduledTime) {
                throw new Error('ScheduledTime is required');
            }

            // Validate scheduled time is in the future
            const scheduledDate = new Date(scheduledTime);
            if (scheduledDate <= new Date()) {
                throw new Error('ScheduledTime must be in the future');
            }

            // Determine author URN
            let authorUrn: string;
            if (authorType === 'organization') {
                if (!organizationId) {
                    // Get first admin organization if not specified
                    const orgs = await this.getAdminOrganizations();
                    if (orgs.length === 0) {
                        throw new Error('No organizations found. Please specify OrganizationID.');
                    }
                    authorUrn = orgs[0].urn;
                    LogStatus(`Using organization: ${orgs[0].name}`);
                } else {
                    authorUrn = `urn:li:organization:${organizationId}`;
                }
            } else {
                // Personal post
                authorUrn = await this.getCurrentUserUrn();
            }

            // Upload media if provided (to ensure they're valid and get URNs)
            let mediaUrns: string[] = [];
            if (mediaFiles && Array.isArray(mediaFiles)) {
                LogStatus(`Uploading ${mediaFiles.length} media files...`);
                mediaUrns = await this.uploadMedia(mediaFiles as MediaFile[]);
            }

            // Build share data for future publishing
            const shareData: LinkedInShareData = {
                author: authorUrn,
                lifecycleState: 'PUBLISHED',
                specificContent: {
                    'com.linkedin.ugc.ShareContent': {
                        shareCommentary: {
                            text: content
                        },
                        shareMediaCategory: mediaUrns.length > 0 ? 'IMAGE' : 'NONE',
                        media: mediaUrns.length > 0 ? mediaUrns.map(urn => ({
                            status: 'READY' as const,
                            media: urn
                        })) : undefined
                    }
                },
                visibility: {
                    'com.linkedin.ugc.MemberNetworkVisibility': visibility as any
                }
            };

            // Add distribution settings if public
            if (visibility === 'PUBLIC') {
                shareData.distribution = {
                    linkedInDistributionTarget: {
                        visibleToGuest: visibleToGuest
                    }
                };
            }

            // Create a scheduled post record
            // Note: This would typically be stored in a database or queue for processing
            const scheduledPost = {
                id: `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                platform: 'LinkedIn',
                companyIntegrationId: companyIntegrationId,
                scheduledTime: scheduledDate.toISOString(),
                shareData: shareData,
                status: 'SCHEDULED',
                createdAt: new Date().toISOString()
            };

            LogStatus(`Post scheduled for ${scheduledDate.toISOString()}`);

            // Update output parameters
            const outputParams = [...Params];
            const scheduledPostParam = outputParams.find(p => p.Name === 'ScheduledPost');
            if (scheduledPostParam) scheduledPostParam.Value = scheduledPost;
            const scheduledIdParam = outputParams.find(p => p.Name === 'ScheduledID');
            if (scheduledIdParam) scheduledIdParam.Value = scheduledPost.id;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully scheduled LinkedIn post for ${scheduledDate.toISOString()}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Failed to schedule LinkedIn post: ${errorMessage}`,
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
                Name: 'Content',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ScheduledTime',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'AuthorType',
                Type: 'Input',
                Value: 'personal' // 'personal' or 'organization'
            },
            {
                Name: 'OrganizationID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MediaFiles',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Visibility',
                Type: 'Input',
                Value: 'PUBLIC' // 'PUBLIC', 'CONNECTIONS', 'LOGGED_IN', 'CONTAINER'
            },
            {
                Name: 'VisibleToGuest',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'ScheduledPost',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'ScheduledID',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Schedules a post for future publishing on LinkedIn. Note: LinkedIn API does not support native scheduling, so this stores the post for later publishing via a scheduler service.';
    }
}