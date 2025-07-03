import { RegisterClass } from '@memberjunction/global';
import { LinkedInBaseAction, LinkedInShareData } from '../linkedin-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { MediaFile } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a post on LinkedIn
 */
@RegisterClass(BaseAction, 'LinkedInCreatePostAction')
export class LinkedInCreatePostAction extends LinkedInBaseAction {
    /**
     * Create a post on LinkedIn (personal or organization)
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
            const authorType = this.getParamValue(Params, 'AuthorType') || 'personal'; // 'personal' or 'organization'
            const organizationId = this.getParamValue(Params, 'OrganizationID');
            const mediaFiles = this.getParamValue(Params, 'MediaFiles');
            const visibility = this.getParamValue(Params, 'Visibility') || 'PUBLIC';
            const visibleToGuest = this.getParamValue(Params, 'VisibleToGuest') !== false; // Default true

            // Validate required parameters
            if (!content) {
                throw new Error('Content is required');
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

            // Upload media if provided
            let mediaUrns: string[] = [];
            if (mediaFiles && Array.isArray(mediaFiles)) {
                LogStatus(`Uploading ${mediaFiles.length} media files...`);
                mediaUrns = await this.uploadMedia(mediaFiles as MediaFile[]);
            }

            // Build share data
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

            // Create the post
            LogStatus('Creating LinkedIn post...');
            const postId = await this.createShare(shareData);

            // Get the created post details
            const shares = await this.getShares(authorUrn, 1);
            const createdPost = shares.find(s => s.id === postId);

            if (!createdPost) {
                throw new Error('Failed to retrieve created post');
            }

            // Normalize the created post
            const normalizedPost = this.normalizePost(createdPost);

            // Update output parameters
            const outputParams = [...Params];
            const postParam = outputParams.find(p => p.Name === 'CreatedPost');
            if (postParam) postParam.Value = normalizedPost;
            const postIdParam = outputParams.find(p => p.Name === 'PostID');
            if (postIdParam) postIdParam.Value = postId;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created LinkedIn post (ID: ${postId})`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Failed to create LinkedIn post: ${errorMessage}`,
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
        return 'Creates a post on LinkedIn for personal profiles or organization pages with optional media attachments';
    }
}