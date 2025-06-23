import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get upcoming tasks by owner in HubSpot
 */
@RegisterClass(HubSpotBaseAction, 'GetUpcomingTasksAction')
export class GetUpcomingTasksAction extends HubSpotBaseAction {
    /**
     * Get upcoming tasks filtered by owner and other criteria
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const ownerId = this.getParamValue(Params, 'OwnerId');
            const daysAhead = this.getParamValue(Params, 'DaysAhead') || 30;
            const includeOverdue = this.getParamValue(Params, 'IncludeOverdue') !== false;
            const statuses = this.getParamValue(Params, 'Statuses') || ['NOT_STARTED', 'IN_PROGRESS', 'WAITING'];
            const priorities = this.getParamValue(Params, 'Priorities');
            const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
            const includeUnassigned = this.getParamValue(Params, 'IncludeUnassigned') || false;
            
            // Build filter groups for the search
            const filterGroups: any[] = [];
            
            // Status filter
            if (statuses && statuses.length > 0) {
                const statusFilters = statuses.map((status: string) => ({
                    propertyName: 'hs_task_status',
                    operator: 'EQ',
                    value: status.toUpperCase()
                }));
                filterGroups.push({ filters: statusFilters });
            }
            
            // Date range filter
            const now = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + daysAhead);
            
            const dateFilters: any[] = [];
            
            // Include tasks with due dates in the future
            dateFilters.push({
                propertyName: 'hs_timestamp',
                operator: 'LT',
                value: endDate.getTime().toString()
            });
            
            // Optionally include overdue tasks
            if (includeOverdue) {
                // Include all tasks with due dates (past and future)
                dateFilters.push({
                    propertyName: 'hs_timestamp',
                    operator: 'HAS_PROPERTY'
                });
            } else {
                // Only include future tasks
                dateFilters.push({
                    propertyName: 'hs_timestamp',
                    operator: 'GTE',
                    value: now.getTime().toString()
                });
            }
            
            // Add owner filter if specified
            if (ownerId) {
                filterGroups.push({
                    filters: [{
                        propertyName: 'hubspot_owner_id',
                        operator: 'EQ',
                        value: ownerId
                    }]
                });
            } else if (!includeUnassigned) {
                // Only include tasks with owners
                filterGroups.push({
                    filters: [{
                        propertyName: 'hubspot_owner_id',
                        operator: 'HAS_PROPERTY'
                    }]
                });
            }
            
            // Priority filter
            if (priorities && priorities.length > 0) {
                const priorityFilters = priorities.map((priority: string) => ({
                    propertyName: 'hs_task_priority',
                    operator: 'EQ',
                    value: priority.toUpperCase()
                }));
                filterGroups.push({ filters: priorityFilters });
            }
            
            // Search for tasks
            const searchBody = {
                filterGroups,
                sorts: [
                    {
                        propertyName: 'hs_timestamp',
                        direction: 'ASCENDING'
                    }
                ],
                properties: [
                    'hs_task_subject',
                    'hs_task_body',
                    'hs_task_status',
                    'hs_task_priority',
                    'hs_timestamp',
                    'hs_task_reminders',
                    'hs_task_completion_date',
                    'hs_task_type',
                    'hubspot_owner_id',
                    'hs_queue_membership_ids'
                ],
                limit: Math.min(maxResults, 100)
            };
            
            const searchResults = await this.makeHubSpotRequest<any>(
                'objects/tasks/search',
                'POST',
                searchBody,
                ContextUser
            );
            
            // Format task results
            const tasks = searchResults.results.map((task: any) => {
                const properties = task.properties;
                const dueDate = properties.hs_timestamp ? 
                    new Date(parseInt(properties.hs_timestamp)) : null;
                const isOverdue = dueDate && dueDate < now;
                
                return {
                    id: task.id,
                    subject: properties.hs_task_subject,
                    body: properties.hs_task_body,
                    status: properties.hs_task_status,
                    priority: properties.hs_task_priority || 'NONE',
                    type: properties.hs_task_type || 'TODO',
                    dueDate: dueDate ? dueDate.toISOString() : null,
                    reminderDate: properties.hs_task_reminders ? 
                        new Date(parseInt(properties.hs_task_reminders)).toISOString() : null,
                    isOverdue: isOverdue,
                    daysUntilDue: dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
                    ownerId: properties.hubspot_owner_id,
                    queueIds: properties.hs_queue_membership_ids,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                    portalUrl: `https://app.hubspot.com/contacts/tasks/${task.id}`
                };
            });
            
            // Group tasks by various criteria
            const tasksByStatus = this.groupTasksByStatus(tasks);
            const tasksByPriority = this.groupTasksByPriority(tasks);
            const tasksByOwner = this.groupTasksByOwner(tasks);
            const tasksByDueDate = this.groupTasksByDueDate(tasks);
            
            // Create summary
            const summary = {
                totalTasks: tasks.length,
                overdueCount: tasks.filter((t: any) => t.isOverdue).length,
                dueTodayCount: tasks.filter((t: any) => t.daysUntilDue === 0).length,
                dueThisWeekCount: tasks.filter((t: any) => t.daysUntilDue >= 0 && t.daysUntilDue <= 7).length,
                byStatus: tasksByStatus,
                byPriority: tasksByPriority,
                byOwner: tasksByOwner,
                byDueDate: tasksByDueDate,
                dateRange: {
                    from: now.toISOString(),
                    to: endDate.toISOString()
                }
            };
            
            // Update output parameters
            const outputParams = [...Params];
            const tasksParam = outputParams.find(p => p.Name === 'Tasks');
            if (tasksParam) tasksParam.Value = tasks;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${tasks.length} upcoming tasks${ownerId ? ' for specified owner' : ''}`,
                Params: outputParams
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error getting upcoming tasks: ${errorMessage}`,
                Params
            };
        }
    }
    
    /**
     * Group tasks by status
     */
    private groupTasksByStatus(tasks: any[]): Record<string, number> {
        const grouped: Record<string, number> = {};
        for (const task of tasks) {
            const status = task.status || 'UNKNOWN';
            grouped[status] = (grouped[status] || 0) + 1;
        }
        return grouped;
    }
    
    /**
     * Group tasks by priority
     */
    private groupTasksByPriority(tasks: any[]): Record<string, number> {
        const grouped: Record<string, number> = {};
        for (const task of tasks) {
            const priority = task.priority || 'NONE';
            grouped[priority] = (grouped[priority] || 0) + 1;
        }
        return grouped;
    }
    
    /**
     * Group tasks by owner
     */
    private groupTasksByOwner(tasks: any[]): Record<string, number> {
        const grouped: Record<string, number> = {};
        for (const task of tasks) {
            const owner = task.ownerId || 'UNASSIGNED';
            grouped[owner] = (grouped[owner] || 0) + 1;
        }
        return grouped;
    }
    
    /**
     * Group tasks by due date categories
     */
    private groupTasksByDueDate(tasks: any[]): Record<string, number> {
        const grouped: Record<string, number> = {
            overdue: 0,
            today: 0,
            tomorrow: 0,
            thisWeek: 0,
            nextWeek: 0,
            thisMonth: 0,
            later: 0,
            noDueDate: 0
        };
        
        for (const task of tasks) {
            if (!task.dueDate) {
                grouped.noDueDate++;
            } else if (task.isOverdue) {
                grouped.overdue++;
            } else if (task.daysUntilDue === 0) {
                grouped.today++;
            } else if (task.daysUntilDue === 1) {
                grouped.tomorrow++;
            } else if (task.daysUntilDue <= 7) {
                grouped.thisWeek++;
            } else if (task.daysUntilDue <= 14) {
                grouped.nextWeek++;
            } else if (task.daysUntilDue <= 30) {
                grouped.thisMonth++;
            } else {
                grouped.later++;
            }
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
                Name: 'OwnerId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DaysAhead',
                Type: 'Input',
                Value: 30
            },
            {
                Name: 'IncludeOverdue',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'Statuses',
                Type: 'Input',
                Value: ['NOT_STARTED', 'IN_PROGRESS', 'WAITING']
            },
            {
                Name: 'Priorities',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeUnassigned',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'Tasks',
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
        return 'Gets upcoming tasks from HubSpot filtered by owner, status, priority, and due date';
    }
}