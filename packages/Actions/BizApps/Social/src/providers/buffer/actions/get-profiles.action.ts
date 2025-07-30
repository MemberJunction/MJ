import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get all Buffer profiles (social media accounts) for the authenticated user
 */
@RegisterClass(BaseAction, 'BufferGetProfilesAction')
export class BufferGetProfilesAction extends BufferBaseAction {
    /**
     * Get Buffer profiles
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Get company integration ID
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
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

            // Get profiles
            const profiles = await this.getProfiles();

            // Format profile data
            const formattedProfiles = profiles.map(profile => ({
                id: profile.id,
                service: profile.service,
                serviceId: profile.service_id,
                serviceUsername: profile.service_username,
                serviceType: profile.service_type,
                default: profile.default,
                createdAt: new Date(profile.created_at * 1000),
                formattedUsername: profile.formatted_username,
                formattedServiceType: profile.formatted_service,
                avatar: profile.avatar,
                avatarHttps: profile.avatar_https,
                statistics: {
                    followers: profile.statistics?.followers || 0
                },
                timezone: profile.timezone,
                schedules: profile.schedules || []
            }));

            // Create summary
            const summary = {
                totalProfiles: formattedProfiles.length,
                profilesByService: this.groupByService(formattedProfiles),
                defaultProfile: formattedProfiles.find(p => p.default)?.id
            };

            // Update output parameters
            const outputParams = [...Params];
            const profilesParam = outputParams.find(p => p.Name === 'Profiles');
            if (profilesParam) profilesParam.Value = formattedProfiles;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${formattedProfiles.length} Buffer profiles`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const resultCode = this.mapBufferError(error);
            
            return {
                Success: false,
                ResultCode: resultCode,
                Message: `Failed to get Buffer profiles: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Group profiles by service
     */
    private groupByService(profiles: any[]): Record<string, number> {
        return profiles.reduce((acc, profile) => {
            const service = profile.service || 'unknown';
            acc[service] = (acc[service] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
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
     * Metadata about this action
     */
    public get Description(): string {
        return 'Retrieves all Buffer profiles (social media accounts) associated with the authenticated user';
    }
}