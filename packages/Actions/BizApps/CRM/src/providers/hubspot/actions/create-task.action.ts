import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to create tasks in HubSpot
 */
@RegisterClass(HubSpotBaseAction, 'CreateTaskAction')
export class CreateTaskAction extends HubSpotBaseAction {
    /**
     * Create a task in HubSpot
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const subject = this.getParamValue(Params, 'Subject');
            const body = this.getParamValue(Params, 'Body');
            const status = this.getParamValue(Params, 'Status') || 'NOT_STARTED';
            const priority = this.getParamValue(Params, 'Priority') || 'NONE';
            const dueDate = this.getParamValue(Params, 'DueDate');
            const reminderDate = this.getParamValue(Params, 'ReminderDate');
            const contactIds = this.getParamValue(Params, 'ContactIds');
            const companyIds = this.getParamValue(Params, 'CompanyIds');
            const dealIds = this.getParamValue(Params, 'DealIds');
            const ownerId = this.getParamValue(Params, 'OwnerId');
            const taskType = this.getParamValue(Params, 'TaskType') || 'TODO';
            const queueId = this.getParamValue(Params, 'QueueId');
            
            if (!subject) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Subject is required',
                    Params
                };
            }

            // Validate status
            const validStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'DEFERRED'];
            if (!validStatuses.includes(status.toUpperCase())) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Invalid Status. Must be one of: ${validStatuses.join(', ')}`,
                    Params
                };
            }

            // Validate priority
            const validPriorities = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
            if (!validPriorities.includes(priority.toUpperCase())) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Invalid Priority. Must be one of: ${validPriorities.join(', ')}`,
                    Params
                };
            }

            // Prepare task properties
            const taskProperties: any = {
                hs_task_subject: subject,
                hs_task_body: body || '',
                hs_task_status: status.toUpperCase(),
                hs_task_priority: priority.toUpperCase(),
                hs_task_type: taskType
            };

            // Add dates if provided
            if (dueDate) {
                const dueDateObj = new Date(dueDate);
                if (isNaN(dueDateObj.getTime())) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: 'Invalid DueDate format',
                        Params
                    };
                }
                // HubSpot expects date in midnight UTC
                dueDateObj.setUTCHours(0, 0, 0, 0);
                taskProperties.hs_timestamp = dueDateObj.getTime();
            }

            if (reminderDate) {
                const reminderDateObj = new Date(reminderDate);
                if (isNaN(reminderDateObj.getTime())) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: 'Invalid ReminderDate format',
                        Params
                    };
                }
                taskProperties.hs_task_reminders = reminderDateObj.getTime();
            }

            // Add owner if provided
            if (ownerId) {
                taskProperties.hubspot_owner_id = ownerId;
            }

            // Add queue if provided
            if (queueId) {
                taskProperties.hs_queue_membership_ids = queueId;
            }

            // Create the task using the objects API
            const task = await this.makeHubSpotRequest<any>(
                'objects/tasks',
                'POST',
                { properties: taskProperties },
                ContextUser
            );

            // Associate with contacts, companies, and deals
            const associationResults = [];
            
            if (contactIds && Array.isArray(contactIds) && contactIds.length > 0) {
                for (const contactId of contactIds) {
                    try {
                        await this.associateObjects(
                            'tasks',
                            task.id,
                            'contacts',
                            contactId,
                            undefined,
                            ContextUser
                        );
                        associationResults.push({
                            type: 'contact',
                            id: contactId,
                            success: true
                        });
                    } catch (error) {
                        associationResults.push({
                            type: 'contact',
                            id: contactId,
                            success: false,
                            error: error instanceof Error ? error.message : 'Association failed'
                        });
                    }
                }
            }

            if (companyIds && Array.isArray(companyIds) && companyIds.length > 0) {
                for (const companyId of companyIds) {
                    try {
                        await this.associateObjects(
                            'tasks',
                            task.id,
                            'companies',
                            companyId,
                            undefined,
                            ContextUser
                        );
                        associationResults.push({
                            type: 'company',
                            id: companyId,
                            success: true
                        });
                    } catch (error) {
                        associationResults.push({
                            type: 'company',
                            id: companyId,
                            success: false,
                            error: error instanceof Error ? error.message : 'Association failed'
                        });
                    }
                }
            }

            if (dealIds && Array.isArray(dealIds) && dealIds.length > 0) {
                for (const dealId of dealIds) {
                    try {
                        await this.associateObjects(
                            'tasks',
                            task.id,
                            'deals',
                            dealId,
                            undefined,
                            ContextUser
                        );
                        associationResults.push({
                            type: 'deal',
                            id: dealId,
                            success: true
                        });
                    } catch (error) {
                        associationResults.push({
                            type: 'deal',
                            id: dealId,
                            success: false,
                            error: error instanceof Error ? error.message : 'Association failed'
                        });
                    }
                }
            }

            // Format task details
            const taskDetails = this.mapHubSpotProperties(task);

            // Create summary
            const summary = {
                taskId: taskDetails.id,
                subject: taskDetails.hs_task_subject,
                status: taskDetails.hs_task_status,
                priority: taskDetails.hs_task_priority,
                dueDate: taskDetails.hs_timestamp ? new Date(parseInt(taskDetails.hs_timestamp)).toISOString() : null,
                reminderDate: taskDetails.hs_task_reminders ? new Date(parseInt(taskDetails.hs_task_reminders)).toISOString() : null,
                owner: taskDetails.hubspot_owner_id,
                createdAt: taskDetails.createdAt,
                portalUrl: `https://app.hubspot.com/contacts/tasks/${taskDetails.id}`,
                associations: associationResults
            };

            // Update output parameters
            const outputParams = [...Params];
            const taskDetailsParam = outputParams.find(p => p.Name === 'TaskDetails');
            if (taskDetailsParam) taskDetailsParam.Value = taskDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created task: ${taskDetails.hs_task_subject}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error creating task: ${errorMessage}`,
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
                Value: 'NOT_STARTED'
            },
            {
                Name: 'Priority',
                Type: 'Input',
                Value: 'NONE'
            },
            {
                Name: 'DueDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ReminderDate',
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
                Name: 'TaskType',
                Type: 'Input',
                Value: 'TODO'
            },
            {
                Name: 'QueueId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'TaskDetails',
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
        return 'Creates a task in HubSpot with due dates and optional associations to contacts, companies, and deals';
    }
}