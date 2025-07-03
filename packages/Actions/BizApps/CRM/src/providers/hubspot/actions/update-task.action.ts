import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to update task status and details in HubSpot
 */
@RegisterClass(BaseAction, 'UpdateTaskAction')
export class UpdateTaskAction extends HubSpotBaseAction {
    /**
     * Update a task in HubSpot
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const taskId = this.getParamValue(Params, 'TaskId');
            const status = this.getParamValue(Params, 'Status');
            const subject = this.getParamValue(Params, 'Subject');
            const body = this.getParamValue(Params, 'Body');
            const priority = this.getParamValue(Params, 'Priority');
            const dueDate = this.getParamValue(Params, 'DueDate');
            const reminderDate = this.getParamValue(Params, 'ReminderDate');
            const ownerId = this.getParamValue(Params, 'OwnerId');
            const completedDate = this.getParamValue(Params, 'CompletedDate');
            const taskType = this.getParamValue(Params, 'TaskType');
            
            if (!taskId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'TaskId is required',
                    Params
                };
            }

            // Build update properties
            const updateProperties: any = {};
            
            // Update status if provided
            if (status) {
                const validStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'DEFERRED'];
                if (!validStatuses.includes(status.toUpperCase())) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: `Invalid Status. Must be one of: ${validStatuses.join(', ')}`,
                        Params
                    };
                }
                updateProperties.hs_task_status = status.toUpperCase();
                
                // If marking as completed and no completed date provided, use current time
                if (status.toUpperCase() === 'COMPLETED' && !completedDate) {
                    updateProperties.hs_task_completion_date = Date.now();
                }
            }

            // Update priority if provided
            if (priority) {
                const validPriorities = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
                if (!validPriorities.includes(priority.toUpperCase())) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: `Invalid Priority. Must be one of: ${validPriorities.join(', ')}`,
                        Params
                    };
                }
                updateProperties.hs_task_priority = priority.toUpperCase();
            }

            // Update other fields if provided
            if (subject) updateProperties.hs_task_subject = subject;
            if (body !== undefined) updateProperties.hs_task_body = body;
            if (taskType) updateProperties.hs_task_type = taskType;
            if (ownerId !== undefined) updateProperties.hubspot_owner_id = ownerId;

            // Update dates if provided
            if (dueDate !== undefined) {
                if (dueDate === null) {
                    // Allow clearing the due date
                    updateProperties.hs_timestamp = '';
                } else {
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
                    updateProperties.hs_timestamp = dueDateObj.getTime();
                }
            }

            if (reminderDate !== undefined) {
                if (reminderDate === null) {
                    // Allow clearing the reminder
                    updateProperties.hs_task_reminders = '';
                } else {
                    const reminderDateObj = new Date(reminderDate);
                    if (isNaN(reminderDateObj.getTime())) {
                        return {
                            Success: false,
                            ResultCode: 'VALIDATION_ERROR',
                            Message: 'Invalid ReminderDate format',
                            Params
                        };
                    }
                    updateProperties.hs_task_reminders = reminderDateObj.getTime();
                }
            }

            if (completedDate) {
                const completedDateObj = new Date(completedDate);
                if (isNaN(completedDateObj.getTime())) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: 'Invalid CompletedDate format',
                        Params
                    };
                }
                updateProperties.hs_task_completion_date = completedDateObj.getTime();
            }

            // Check if there are any properties to update
            if (Object.keys(updateProperties).length === 0) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'No properties provided to update',
                    Params
                };
            }

            // Get current task to show before/after
            let originalTask;
            try {
                originalTask = await this.makeHubSpotRequest<any>(
                    `objects/tasks/${taskId}`,
                    'GET',
                    undefined,
                    ContextUser
                );
            } catch (error) {
                return {
                    Success: false,
                    ResultCode: 'TASK_NOT_FOUND',
                    Message: `Task with ID ${taskId} not found`,
                    Params
                };
            }

            // Update the task
            const updatedTask = await this.makeHubSpotRequest<any>(
                `objects/tasks/${taskId}`,
                'PATCH',
                { properties: updateProperties },
                ContextUser
            );

            // Format task details
            const originalDetails = this.mapHubSpotProperties(originalTask);
            const updatedDetails = this.mapHubSpotProperties(updatedTask);

            // Create change summary
            const changes: any = {};
            for (const key of Object.keys(updateProperties)) {
                const fieldName = key.replace('hs_task_', '').replace('hs_', '').replace(/_/g, ' ');
                changes[fieldName] = {
                    from: originalDetails[key],
                    to: updatedDetails[key]
                };
            }

            // Create summary
            const summary = {
                taskId: updatedDetails.id,
                subject: updatedDetails.hs_task_subject,
                status: updatedDetails.hs_task_status,
                priority: updatedDetails.hs_task_priority,
                dueDate: updatedDetails.hs_timestamp ? new Date(parseInt(updatedDetails.hs_timestamp)).toISOString() : null,
                reminderDate: updatedDetails.hs_task_reminders ? new Date(parseInt(updatedDetails.hs_task_reminders)).toISOString() : null,
                completedDate: updatedDetails.hs_task_completion_date ? new Date(parseInt(updatedDetails.hs_task_completion_date)).toISOString() : null,
                owner: updatedDetails.hubspot_owner_id,
                updatedAt: updatedDetails.updatedAt,
                portalUrl: `https://app.hubspot.com/contacts/tasks/${updatedDetails.id}`,
                changes: changes
            };

            // Update output parameters
            const outputParams = [...Params];
            const originalDetailsParam = outputParams.find(p => p.Name === 'OriginalDetails');
            if (originalDetailsParam) originalDetailsParam.Value = originalDetails;
            const updatedDetailsParam = outputParams.find(p => p.Name === 'UpdatedDetails');
            if (updatedDetailsParam) updatedDetailsParam.Value = updatedDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully updated task: ${updatedDetails.hs_task_subject}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error updating task: ${errorMessage}`,
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
                Name: 'TaskId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Status',
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
                Name: 'Priority',
                Type: 'Input',
                Value: null
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
                Name: 'CompletedDate',
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
                Value: null
            },
            {
                Name: 'OriginalDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'UpdatedDetails',
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
        return 'Updates task status and other properties in HubSpot';
    }
}