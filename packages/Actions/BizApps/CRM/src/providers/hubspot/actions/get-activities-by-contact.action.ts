import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get activity history for a contact in HubSpot
 */
@RegisterClass(HubSpotBaseAction, 'GetActivitiesByContactAction')
export class GetActivitiesByContactAction extends HubSpotBaseAction {
    /**
     * Get activity history for a specific contact
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const contactId = this.getParamValue(Params, 'ContactId');
            const activityTypes = this.getParamValue(Params, 'ActivityTypes');
            const includeCompleted = this.getParamValue(Params, 'IncludeCompleted') !== false;
            const includeScheduled = this.getParamValue(Params, 'IncludeScheduled') !== false;
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
            
            if (!contactId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'ContactId is required',
                    Params
                };
            }

            // First, get the contact to ensure it exists
            let contact;
            try {
                contact = await this.makeHubSpotRequest<any>(
                    `objects/contacts/${contactId}`,
                    'GET',
                    undefined,
                    ContextUser
                );
            } catch (error) {
                return {
                    Success: false,
                    ResultCode: 'CONTACT_NOT_FOUND',
                    Message: `Contact with ID ${contactId} not found`,
                    Params
                };
            }

            // Get all activities (engagements and tasks) associated with the contact
            const activities: any[] = [];

            // Get engagements (emails, calls, meetings, notes)
            const engagementAssociations = await this.makeHubSpotRequest<any>(
                `objects/contacts/${contactId}/associations/engagements`,
                'GET',
                undefined,
                ContextUser
            );

            if (engagementAssociations.results && engagementAssociations.results.length > 0) {
                // Fetch engagement details
                for (const association of engagementAssociations.results) {
                    try {
                        const engagement = await this.makeHubSpotRequest<any>(
                            `engagements/${association.id}`,
                            'GET',
                            undefined,
                            ContextUser
                        );

                        // Check if we should include this engagement based on filters
                        const engagementType = engagement.engagement.type;
                        if (activityTypes && activityTypes.length > 0 && 
                            !activityTypes.includes(engagementType) && 
                            !activityTypes.includes('ALL')) {
                            continue;
                        }

                        // Check date filters
                        const activityDate = new Date(engagement.engagement.timestamp);
                        if (startDate && activityDate < new Date(startDate)) continue;
                        if (endDate && activityDate > new Date(endDate)) continue;

                        // Format engagement data
                        const activity = {
                            type: 'engagement',
                            activityType: engagementType,
                            id: engagement.engagement.id,
                            timestamp: new Date(engagement.engagement.timestamp).toISOString(),
                            subject: this.getEngagementSubject(engagement),
                            body: this.getEngagementBody(engagement),
                            status: engagement.metadata.status || 'COMPLETED',
                            ownerId: engagement.engagement.ownerId,
                            createdAt: new Date(engagement.engagement.createdAt).toISOString(),
                            updatedAt: new Date(engagement.engagement.updatedAt).toISOString(),
                            metadata: engagement.metadata,
                            associations: engagement.associations
                        };

                        activities.push(activity);
                    } catch (error) {
                        // Skip individual engagement errors
                        console.error(`Failed to fetch engagement ${association.id}:`, error);
                    }
                }
            }

            // Get tasks associated with the contact
            const taskAssociations = await this.makeHubSpotRequest<any>(
                `objects/contacts/${contactId}/associations/tasks`,
                'GET',
                undefined,
                ContextUser
            );

            if (taskAssociations.results && taskAssociations.results.length > 0) {
                // Fetch task details
                for (const association of taskAssociations.results) {
                    try {
                        const task = await this.makeHubSpotRequest<any>(
                            `objects/tasks/${association.id}`,
                            'GET',
                            undefined,
                            ContextUser
                        );

                        const taskProperties = task.properties;
                        
                        // Check if we should include tasks
                        if (activityTypes && activityTypes.length > 0 && 
                            !activityTypes.includes('TASK') && 
                            !activityTypes.includes('ALL')) {
                            continue;
                        }

                        // Check status filters
                        const isCompleted = taskProperties.hs_task_status === 'COMPLETED';
                        if (!includeCompleted && isCompleted) continue;
                        if (!includeScheduled && !isCompleted) continue;

                        // Check date filters
                        const taskDate = taskProperties.hs_timestamp ? 
                            new Date(parseInt(taskProperties.hs_timestamp)) : 
                            new Date(task.createdAt);
                        if (startDate && taskDate < new Date(startDate)) continue;
                        if (endDate && taskDate > new Date(endDate)) continue;

                        // Format task data
                        const activity = {
                            type: 'task',
                            activityType: 'TASK',
                            id: task.id,
                            timestamp: taskDate.toISOString(),
                            subject: taskProperties.hs_task_subject,
                            body: taskProperties.hs_task_body,
                            status: taskProperties.hs_task_status,
                            priority: taskProperties.hs_task_priority,
                            dueDate: taskProperties.hs_timestamp ? 
                                new Date(parseInt(taskProperties.hs_timestamp)).toISOString() : null,
                            completedDate: taskProperties.hs_task_completion_date ? 
                                new Date(parseInt(taskProperties.hs_task_completion_date)).toISOString() : null,
                            ownerId: taskProperties.hubspot_owner_id,
                            createdAt: task.createdAt,
                            updatedAt: task.updatedAt,
                            properties: taskProperties
                        };

                        activities.push(activity);
                    } catch (error) {
                        // Skip individual task errors
                        console.error(`Failed to fetch task ${association.id}:`, error);
                    }
                }
            }

            // Sort activities by timestamp (most recent first)
            activities.sort((a, b) => 
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            // Limit results if specified
            const limitedActivities = activities.slice(0, maxResults);

            // Create activity summary
            const activitySummary = {
                totalActivities: limitedActivities.length,
                byType: this.groupActivitiesByType(limitedActivities),
                byStatus: this.groupActivitiesByStatus(limitedActivities),
                dateRange: limitedActivities.length > 0 ? {
                    earliest: limitedActivities[limitedActivities.length - 1].timestamp,
                    latest: limitedActivities[0].timestamp
                } : null
            };

            // Create summary
            const summary = {
                contactId: contact.id,
                contactEmail: contact.properties.email,
                contactName: `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim(),
                totalActivities: limitedActivities.length,
                activitySummary: activitySummary
            };

            // Update output parameters
            const outputParams = [...Params];
            const activitiesParam = outputParams.find(p => p.Name === 'Activities');
            if (activitiesParam) activitiesParam.Value = limitedActivities;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${limitedActivities.length} activities for contact ${contact.properties.email}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error getting activities: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Extract subject from engagement based on type
     */
    private getEngagementSubject(engagement: any): string {
        const metadata = engagement.metadata;
        switch (engagement.engagement.type) {
            case 'EMAIL':
                return metadata.subject || 'Email';
            case 'CALL':
                return metadata.title || 'Call';
            case 'MEETING':
                return metadata.title || 'Meeting';
            case 'NOTE':
                return 'Note';
            default:
                return engagement.engagement.type;
        }
    }

    /**
     * Extract body from engagement based on type
     */
    private getEngagementBody(engagement: any): string {
        const metadata = engagement.metadata;
        switch (engagement.engagement.type) {
            case 'EMAIL':
                return metadata.html || metadata.text || '';
            case 'CALL':
            case 'MEETING':
                return metadata.body || '';
            case 'NOTE':
                return metadata.body || '';
            default:
                return '';
        }
    }

    /**
     * Group activities by type
     */
    private groupActivitiesByType(activities: any[]): Record<string, number> {
        const grouped: Record<string, number> = {};
        for (const activity of activities) {
            const type = activity.activityType;
            grouped[type] = (grouped[type] || 0) + 1;
        }
        return grouped;
    }

    /**
     * Group activities by status
     */
    private groupActivitiesByStatus(activities: any[]): Record<string, number> {
        const grouped: Record<string, number> = {};
        for (const activity of activities) {
            const status = activity.status || 'UNKNOWN';
            grouped[status] = (grouped[status] || 0) + 1;
        }
        return grouped;
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonCRMParams();
        const specificParams: ActionParam[] = [
            {
                Name: 'ContactId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ActivityTypes',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeCompleted',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeScheduled',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'StartDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EndDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'Activities',
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
        return 'Gets activity history (calls, emails, meetings, notes, tasks) for a specific contact in HubSpot';
    }
}