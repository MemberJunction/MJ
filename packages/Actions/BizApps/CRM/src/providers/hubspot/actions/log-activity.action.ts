import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to log activities (calls, emails, meetings, notes) in HubSpot
 */
@RegisterClass(BaseAction, 'LogActivityAction')
export class LogActivityAction extends HubSpotBaseAction {
    /**
     * Log an activity (engagement) in HubSpot
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const activityType = this.getParamValue(Params, 'ActivityType');
            const subject = this.getParamValue(Params, 'Subject');
            const body = this.getParamValue(Params, 'Body');
            const status = this.getParamValue(Params, 'Status') || 'COMPLETED';
            const activityDate = this.getParamValue(Params, 'ActivityDate');
            const durationMilliseconds = this.getParamValue(Params, 'DurationMilliseconds');
            const contactIds = this.getParamValue(Params, 'ContactIds');
            const companyIds = this.getParamValue(Params, 'CompanyIds');
            const dealIds = this.getParamValue(Params, 'DealIds');
            const ownerId = this.getParamValue(Params, 'OwnerId');
            const metadata = this.getParamValue(Params, 'Metadata');
            
            if (!activityType) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'ActivityType is required',
                    Params
                };
            }

            const validTypes = ['EMAIL', 'CALL', 'MEETING', 'NOTE'];
            if (!validTypes.includes(activityType.toUpperCase())) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Invalid ActivityType. Must be one of: ${validTypes.join(', ')}`,
                    Params
                };
            }

            // Prepare engagement properties based on type
            const engagementProperties: any = {
                type: activityType.toUpperCase()
            };

            // Set activity date (default to now)
            const timestamp = activityDate ? new Date(activityDate).getTime() : Date.now();
            engagementProperties.timestamp = timestamp;

            // Add common properties
            if (ownerId) engagementProperties.ownerId = ownerId;

            // Prepare metadata based on activity type
            const engagementMetadata: any = {};
            
            switch (activityType.toUpperCase()) {
                case 'EMAIL':
                    engagementMetadata.subject = subject || 'Email activity';
                    engagementMetadata.html = body || '';
                    engagementMetadata.status = status;
                    if (metadata?.from) engagementMetadata.from = metadata.from;
                    if (metadata?.to) engagementMetadata.to = metadata.to;
                    if (metadata?.cc) engagementMetadata.cc = metadata.cc;
                    if (metadata?.bcc) engagementMetadata.bcc = metadata.bcc;
                    break;
                    
                case 'CALL':
                    engagementMetadata.title = subject || 'Call activity';
                    engagementMetadata.body = body || '';
                    engagementMetadata.status = status;
                    if (durationMilliseconds) engagementMetadata.durationMilliseconds = durationMilliseconds;
                    if (metadata?.toNumber) engagementMetadata.toNumber = metadata.toNumber;
                    if (metadata?.fromNumber) engagementMetadata.fromNumber = metadata.fromNumber;
                    if (metadata?.recordingUrl) engagementMetadata.recordingUrl = metadata.recordingUrl;
                    break;
                    
                case 'MEETING':
                    engagementMetadata.title = subject || 'Meeting';
                    engagementMetadata.body = body || '';
                    engagementMetadata.startTime = timestamp;
                    if (durationMilliseconds) {
                        engagementMetadata.endTime = timestamp + durationMilliseconds;
                    }
                    if (metadata?.location) engagementMetadata.location = metadata.location;
                    if (metadata?.meetingOutcome) engagementMetadata.meetingOutcome = metadata.meetingOutcome;
                    break;
                    
                case 'NOTE':
                    engagementMetadata.body = body || subject || 'Note';
                    break;
            }

            // Prepare associations
            const associations: any = {};
            if (contactIds && Array.isArray(contactIds) && contactIds.length > 0) {
                associations.contactIds = contactIds;
            }
            if (companyIds && Array.isArray(companyIds) && companyIds.length > 0) {
                associations.companyIds = companyIds;
            }
            if (dealIds && Array.isArray(dealIds) && dealIds.length > 0) {
                associations.dealIds = dealIds;
            }

            // Create the engagement
            const engagementBody = {
                engagement: engagementProperties,
                associations,
                metadata: engagementMetadata
            };

            const engagement = await this.makeHubSpotRequest<any>(
                'engagements',
                'POST',
                engagementBody,
                ContextUser
            );

            // Format activity details
            const activityDetails = {
                engagementId: engagement.engagement.id,
                type: engagement.engagement.type,
                subject: subject || engagementMetadata.title || engagementMetadata.body,
                timestamp: new Date(engagement.engagement.timestamp).toISOString(),
                ownerId: engagement.engagement.ownerId,
                createdAt: new Date(engagement.engagement.createdAt).toISOString(),
                updatedAt: new Date(engagement.engagement.updatedAt).toISOString(),
                portalUrl: `https://app.hubspot.com/contacts/engagements/${engagement.engagement.id}`,
                associations: engagement.associations
            };

            // Create summary
            const summary = {
                activityId: activityDetails.engagementId,
                type: activityDetails.type,
                subject: activityDetails.subject,
                timestamp: activityDetails.timestamp,
                associatedContacts: contactIds?.length || 0,
                associatedCompanies: companyIds?.length || 0,
                associatedDeals: dealIds?.length || 0,
                portalUrl: activityDetails.portalUrl
            };

            // Update output parameters
            const outputParams = [...Params];
            const activityDetailsParam = outputParams.find(p => p.Name === 'ActivityDetails');
            if (activityDetailsParam) activityDetailsParam.Value = activityDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully logged ${activityType.toLowerCase()} activity`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error logging activity: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonCRMParams();
        const specificParams: ActionParam[] = [
            {
                Name: 'ActivityType',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Subject',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Body',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Status',
                Type: 'Input',
                Value: 'COMPLETED'
            },
            {
                Name: 'ActivityDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DurationMilliseconds',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ContactIds',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CompanyIds',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DealIds',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OwnerId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Metadata',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ActivityDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            }
        ];
        return [...baseParams, ...specificParams];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Logs activities (calls, emails, meetings, notes) in HubSpot with optional associations to contacts, companies, and deals';
    }
}