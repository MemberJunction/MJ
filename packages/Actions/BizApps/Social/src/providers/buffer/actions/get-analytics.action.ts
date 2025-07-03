import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get detailed analytics for a specific Buffer post
 */
@RegisterClass(BaseAction, 'BufferGetAnalyticsAction')
export class BufferGetAnalyticsAction extends BufferBaseAction {
    /**
     * Get analytics for a Buffer post
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

            // Get analytics
            const analyticsData = await this.getAnalytics(updateId);

            // Normalize analytics
            const normalizedAnalytics = this.normalizeAnalytics(analyticsData);

            // Create detailed analytics object
            const detailedAnalytics = {
                updateId: updateId,
                metrics: normalizedAnalytics,
                platformSpecific: analyticsData,
                summary: {
                    totalEngagements: normalizedAnalytics.engagements,
                    engagementRate: analyticsData.reach > 0 ? 
                        (normalizedAnalytics.engagements / analyticsData.reach) * 100 : 0,
                    primaryMetric: this.determinePrimaryMetric(analyticsData),
                    performanceLevel: this.calculatePerformanceLevel(normalizedAnalytics)
                }
            };

            // Update output parameters
            const outputParams = [...Params];
            const analyticsParam = outputParams.find(p => p.Name === 'Analytics');
            if (analyticsParam) analyticsParam.Value = detailedAnalytics;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved analytics for Buffer post ${updateId}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const resultCode = this.mapBufferError(error);
            
            return {
                Success: false,
                ResultCode: resultCode,
                Message: `Failed to get analytics: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Determine the primary metric based on the platform
     */
    private determinePrimaryMetric(analytics: any): { name: string; value: number } {
        // Twitter/X focuses on retweets
        if (analytics.retweets !== undefined) {
            return { name: 'Retweets', value: analytics.retweets || 0 };
        }
        
        // Facebook focuses on shares
        if (analytics.shares !== undefined) {
            return { name: 'Shares', value: analytics.shares || 0 };
        }
        
        // LinkedIn focuses on reach
        if (analytics.reach !== undefined && analytics.reach > 0) {
            return { name: 'Reach', value: analytics.reach };
        }
        
        // Default to clicks
        return { name: 'Clicks', value: analytics.clicks || 0 };
    }

    /**
     * Calculate performance level based on engagement metrics
     */
    private calculatePerformanceLevel(analytics: any): 'low' | 'medium' | 'high' | 'viral' {
        const engagementRate = analytics.reach > 0 ? 
            (analytics.engagements / analytics.reach) * 100 : 0;

        if (engagementRate >= 10) return 'viral';
        if (engagementRate >= 5) return 'high';
        if (engagementRate >= 2) return 'medium';
        return 'low';
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
                Name: 'Analytics',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Retrieves detailed analytics and interaction metrics for a specific Buffer post';
    }
}