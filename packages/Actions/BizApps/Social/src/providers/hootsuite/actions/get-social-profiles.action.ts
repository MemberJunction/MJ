import { RegisterClass } from '@memberjunction/global';
import { HootSuiteBaseAction, HootSuiteProfile } from '../hootsuite-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
/**
 * Action to retrieve social profiles connected to HootSuite account
 */
@RegisterClass(HootSuiteBaseAction, 'HootSuiteGetSocialProfilesAction')
export class HootSuiteGetSocialProfilesAction extends HootSuiteBaseAction {
    /**
     * Get social profiles from HootSuite
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
            const includeInactive = this.getParamValue(Params, 'IncludeInactive') || false;
            const socialNetwork = this.getParamValue(Params, 'SocialNetwork');

            // Get all profiles
            LogStatus('Fetching social profiles...');
            const profiles = await this.getSocialProfiles();

            // Filter profiles based on parameters
            let filteredProfiles = profiles;

            // Filter by social network if specified
            if (socialNetwork) {
                filteredProfiles = filteredProfiles.filter(p => 
                    p.socialNetworkId.toLowerCase() === socialNetwork.toLowerCase()
                );
            }

            // Process profiles to add additional information
            const enrichedProfiles = await Promise.all(
                filteredProfiles.map(async (profile) => {
                    try {
                        // Get additional profile details if available
                        const details = await this.getProfileDetails(profile.id);
                        
                        return {
                            id: profile.id,
                            displayName: profile.displayName,
                            socialNetwork: this.mapSocialNetworkId(profile.socialNetworkId),
                            socialNetworkId: profile.socialNetworkId,
                            socialNetworkUserId: profile.socialNetworkUserId,
                            avatarUrl: profile.avatarUrl,
                            type: profile.type,
                            ownerId: profile.ownerId,
                            isActive: details?.isActive !== false,
                            followerCount: details?.followerCount,
                            followingCount: details?.followingCount,
                            postCount: details?.postCount,
                            profileUrl: details?.profileUrl,
                            verified: details?.verified || false
                        };
                    } catch (error) {
                        // If we can't get details, return basic info
                        LogStatus(`Could not get details for profile ${profile.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        return {
                            id: profile.id,
                            displayName: profile.displayName,
                            socialNetwork: this.mapSocialNetworkId(profile.socialNetworkId),
                            socialNetworkId: profile.socialNetworkId,
                            socialNetworkUserId: profile.socialNetworkUserId,
                            avatarUrl: profile.avatarUrl,
                            type: profile.type,
                            ownerId: profile.ownerId,
                            isActive: true
                        };
                    }
                })
            );

            // Filter out inactive profiles if requested
            const finalProfiles = includeInactive 
                ? enrichedProfiles 
                : enrichedProfiles.filter(p => p.isActive);

            // Create summary
            const summary = {
                totalProfiles: finalProfiles.length,
                byNetwork: this.groupByNetwork(finalProfiles),
                byType: this.groupByType(finalProfiles),
                activeProfiles: finalProfiles.filter(p => p.isActive).length,
                inactiveProfiles: finalProfiles.filter(p => !p.isActive).length,
                verifiedProfiles: finalProfiles.filter(p => p.verified).length
            };

            // Store default profile in custom attribute if not set
            if (finalProfiles.length > 0 && !this.getCustomAttribute(1)) {
                const defaultProfile = finalProfiles.find(p => p.isActive) || finalProfiles[0];
                await this.setCustomAttribute(1, defaultProfile.id);
                LogStatus(`Set default profile to: ${defaultProfile.displayName} (${defaultProfile.id})`);
            }

            // Update output parameters
            const outputParams = [...Params];
            const profilesParam = outputParams.find(p => p.Name === 'Profiles');
            if (profilesParam) profilesParam.Value = finalProfiles;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${finalProfiles.length} social profiles`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Failed to get social profiles: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get additional details for a profile
     */
    private async getProfileDetails(profileId: string): Promise<any> {
        try {
            const response = await this.axiosInstance.get(`/socialProfiles/${profileId}`);
            return response.data;
        } catch (error) {
            // Details endpoint might not be available for all profiles
            return null;
        }
    }

    /**
     * Map social network ID to readable name
     */
    private mapSocialNetworkId(networkId: string): string {
        const networkMap: Record<string, string> = {
            'TWITTER': 'Twitter',
            'FACEBOOK': 'Facebook',
            'FACEBOOK_PAGE': 'Facebook Page',
            'INSTAGRAM': 'Instagram',
            'INSTAGRAM_BUSINESS': 'Instagram Business',
            'LINKEDIN': 'LinkedIn',
            'LINKEDIN_COMPANY': 'LinkedIn Company',
            'PINTEREST': 'Pinterest',
            'YOUTUBE': 'YouTube',
            'TIKTOK': 'TikTok'
        };

        return networkMap[networkId.toUpperCase()] || networkId;
    }

    /**
     * Group profiles by network
     */
    private groupByNetwork(profiles: any[]): Record<string, number> {
        return profiles.reduce((groups, profile) => {
            const network = profile.socialNetwork;
            groups[network] = (groups[network] || 0) + 1;
            return groups;
        }, {} as Record<string, number>);
    }

    /**
     * Group profiles by type
     */
    private groupByType(profiles: any[]): Record<string, number> {
        return profiles.reduce((groups, profile) => {
            const type = profile.type || 'Unknown';
            groups[type] = (groups[type] || 0) + 1;
            return groups;
        }, {} as Record<string, number>);
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.oauthParams,
            {
                Name: 'IncludeInactive',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SocialNetwork',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Profiles',
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
     * Get action description
     */
    public get Description(): string {
        return 'Retrieves all social profiles connected to the HootSuite account with optional filtering';
    }
}