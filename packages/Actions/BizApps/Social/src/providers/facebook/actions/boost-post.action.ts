import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/core';
import axios from 'axios';

/**
 * Boosts (promotes) a Facebook post to reach a wider audience.
 * Creates a simple ad campaign to increase post visibility.
 */
@RegisterClass(FacebookBaseAction, 'FacebookBoostPostAction')
export class FacebookBoostPostAction extends FacebookBaseAction {
    /**
     * Get action description
     */
    public get Description(): string {
        return 'Boosts (promotes) a Facebook post to reach a wider audience through paid advertising';
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'PostID',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'AdAccountID',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Budget',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Duration',
                Type: 'Input',
                Value: 7,
                },
            {
                Name: 'Objective',
                Type: 'Input',
                Value: 'POST_ENGAGEMENT',
                },
            {
                Name: 'AudienceType',
                Type: 'Input',
                Value: 'AUTO',
                },
            {
                Name: 'TargetingSpec',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'StartTime',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'CallToAction',
                Type: 'Input',
                Value: null,
                }
        ];
    }

    /**
     * Execute the action
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Validate required parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            const postId = this.getParamValue(Params, 'PostID');
            const adAccountId = this.getParamValue(Params, 'AdAccountID');
            const budget = this.getParamValue(Params, 'Budget') as number;
            
            if (!companyIntegrationId) {
                return {
                Success: false,
                Message: 'CompanyIntegrationID is required',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            if (!postId) {
                return {
                Success: false,
                Message: 'PostID is required',
                ResultCode: 'MISSING_REQUIRED_PARAM'
            };
            }

            if (!adAccountId) {
                return {
                Success: false,
                Message: 'AdAccountID is required',
                ResultCode: 'MISSING_REQUIRED_PARAM'
            };
            }

            if (!budget || budget <= 0) {
                return {
                Success: false,
                Message: 'Budget must be a positive number',
                ResultCode: 'INVALID_BUDGET'
            };
            }

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                Success: false,
                Message: 'Failed to initialize Facebook OAuth connection',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            // Get parameters
            const duration = this.getParamValue(Params, 'Duration') as number || 7;
            const objective = this.getParamValue(Params, 'Objective') as string || 'POST_ENGAGEMENT';
            const audienceType = this.getParamValue(Params, 'AudienceType') as string || 'AUTO';
            const targetingSpec = this.getParamValue(Params, 'TargetingSpec') as any;
            const startTime = this.getParamValue(Params, 'StartTime') as string;
            const callToAction = this.getParamValue(Params, 'CallToAction') as string;

            // Validate duration
            if (duration < 1 || duration > 30) {
                return {
                Success: false,
                Message: 'Duration must be between 1 and 30 days',
                ResultCode: 'INVALID_DURATION'
            };
            }

            // Extract page ID from post ID
            const pageId = postId.split('_')[0];
            
            // Get page access token
            const pageToken = await this.getPageAccessToken(pageId);

            LogStatus(`Creating boost campaign for post ${postId}...`);

            // Step 1: Create campaign
            const campaignName = `Boost Post ${postId} - ${new Date().toISOString()}`;
            const campaign = await this.createCampaign(adAccountId, campaignName, objective);

            // Step 2: Create ad set with targeting
            const adSetName = `Ad Set for ${postId}`;
            const targeting = this.buildTargeting(audienceType, targetingSpec, pageId);
            const adSet = await this.createAdSet(
                adAccountId,
                campaign.id,
                adSetName,
                budget,
                duration,
                targeting,
                startTime
            );

            // Step 3: Create ad creative from post
            const creative = await this.createCreativeFromPost(adAccountId, postId, pageToken, callToAction);

            // Step 4: Create the ad
            const adName = `Boosted Post ${postId}`;
            const ad = await this.createAd(adAccountId, adSet.id, creative.id, adName);

            // Get boost summary
            const boostSummary = {
                campaignId: campaign.id,
                adSetId: adSet.id,
                adId: ad.id,
                creativeId: creative.id,
                postId,
                budget,
                duration,
                objective,
                audienceType,
                startTime: adSet.start_time,
                endTime: adSet.end_time,
                status: ad.status,
                reviewStatus: ad.review_feedback?.global_review_status || 'PENDING',
                previewUrl: `https://www.facebook.com/ads/manager/account/campaigns?act=${adAccountId}&selected_campaign_ids=${campaign.id}`
            };

            LogStatus(`Successfully created boost campaign for post ${postId}`);

            return {
                Success: true,
                Message: 'Post boost created successfully',
                ResultCode: 'SUCCESS',
                Params
            };

        } catch (error) {
            LogError(`Failed to boost Facebook post: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            if (this.isAuthError(error)) {
                return this.handleOAuthError(error);
            }

            // Check for specific ad-related errors
            if (error instanceof Error) {
                if (error.message.includes('permissions')) {
                    return {
                Success: false,
                Message: 'Insufficient permissions. Ensure the token has ads_management permission.',
                ResultCode: 'INSUFFICIENT_PERMISSIONS'
            };
                }
                if (error.message.includes('budget')) {
                    return {
                Success: false,
                Message: 'Invalid budget. Check minimum budget requirements for your currency.',
                ResultCode: 'INVALID_BUDGET'
            };
                }
            }

            return {
                Success: false,
                Message: error instanceof Error ? error.message : 'Unknown error occurred',
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Create a campaign
     */
    private async createCampaign(adAccountId: string, name: string, objective: string): Promise<any> {
        const response = await this.axiosInstance.post(
            `/${adAccountId}/campaigns`,
            {
                name,
                objective,
                status: 'PAUSED', // Start paused for safety
                special_ad_categories: [] // Required field
            }
        );

        return response.data;
    }

    /**
     * Create an ad set
     */
    private async createAdSet(
        adAccountId: string,
        campaignId: string,
        name: string,
        budget: number,
        durationDays: number,
        targeting: any,
        startTime?: string
    ): Promise<any> {
        const now = new Date();
        const start = startTime ? new Date(startTime) : now;
        const end = new Date(start);
        end.setDate(end.getDate() + durationDays);

        // Calculate daily budget
        const dailyBudget = Math.ceil((budget * 100) / durationDays); // Convert to cents

        const response = await this.axiosInstance.post(
            `/${adAccountId}/adsets`,
            {
                name,
                campaign_id: campaignId,
                daily_budget: dailyBudget,
                billing_event: 'IMPRESSIONS',
                optimization_goal: this.getOptimizationGoal(campaignId),
                bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
                targeting,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                status: 'PAUSED'
            }
        );

        return response.data;
    }

    /**
     * Create creative from existing post
     */
    private async createCreativeFromPost(
        adAccountId: string,
        postId: string,
        pageToken: string,
        callToAction?: string
    ): Promise<any> {
        const creativeData: any = {
            name: `Creative for ${postId}`,
            object_story_id: postId
        };

        if (callToAction) {
            // Get post details to add CTA
            const postResponse = await axios.get(
                `${this.apiBaseUrl}/${postId}`,
                {
                    params: {
                        access_token: pageToken,
                        fields: 'permalink_url'
                    }
                }
            );

            creativeData.call_to_action = {
                type: callToAction,
                value: {
                    link: postResponse.data.permalink_url
                }
            };
        }

        const response = await this.axiosInstance.post(
            `/${adAccountId}/adcreatives`,
            creativeData
        );

        return response.data;
    }

    /**
     * Create the ad
     */
    private async createAd(
        adAccountId: string,
        adSetId: string,
        creativeId: string,
        name: string
    ): Promise<any> {
        const response = await this.axiosInstance.post(
            `/${adAccountId}/ads`,
            {
                name,
                adset_id: adSetId,
                creative: { creative_id: creativeId },
                status: 'PAUSED'
            }
        );

        return response.data;
    }

    /**
     * Build targeting specification
     */
    private buildTargeting(audienceType: string, customTargeting: any, pageId: string): any {
        const baseTargeting: any = {
            geo_locations: {
                countries: ['US'] // Default to US, can be overridden
            }
        };

        switch (audienceType) {
            case 'FANS':
                baseTargeting.connections = [pageId];
                break;
            case 'FANS_AND_CONNECTIONS':
                baseTargeting.connections = [pageId];
                baseTargeting.friends_of_connections = [pageId];
                break;
            case 'CUSTOM':
                if (customTargeting) {
                    return { ...baseTargeting, ...customTargeting };
                }
                break;
            case 'AUTO':
            default:
                // Facebook will automatically optimize targeting
                break;
        }

        // Add any custom targeting on top
        if (customTargeting && audienceType !== 'CUSTOM') {
            Object.assign(baseTargeting, customTargeting);
        }

        return baseTargeting;
    }

    /**
     * Get optimization goal based on objective
     */
    private getOptimizationGoal(objective: string): string {
        const goalMap: Record<string, string> = {
            'POST_ENGAGEMENT': 'POST_ENGAGEMENT',
            'REACH': 'REACH',
            'LINK_CLICKS': 'LINK_CLICKS',
            'PAGE_LIKES': 'PAGE_LIKES',
            'BRAND_AWARENESS': 'AD_RECALL_LIFT',
            'VIDEO_VIEWS': 'VIDEO_VIEWS'
        };

        return goalMap[objective] || 'POST_ENGAGEMENT';
    }


}