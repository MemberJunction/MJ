import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Interface for a LearnWorlds user
 */
export interface LearnWorldsUser {
    id: string;
    email: string;
    username: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    status: 'active' | 'inactive' | 'suspended';
    role: string;
    createdAt: Date;
    lastLoginAt?: Date;
    tags?: string[];
    customFields?: Record<string, any>;
    totalCourses?: number;
    completedCourses?: number;
    inProgressCourses?: number;
    totalTimeSpent?: number;
    avatarUrl?: string;
    bio?: string;
    location?: string;
    timezone?: string;
}

/**
 * Action to retrieve users from LearnWorlds LMS
 */
@RegisterClass(BaseAction, 'GetLearnWorldsUsersAction')
export class GetLearnWorldsUsersAction extends LearnWorldsBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves users (students, instructors, admins) from LearnWorlds LMS with filtering and search options';
    }

    /**
     * Main execution method
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: 'Context user is required for LearnWorlds API calls'
                };
            }

            // Store params for base class methods
            this.params = params.Params;

            // Build query parameters
            const queryParams: Record<string, any> = {};
            
            // Search filter
            const searchText = this.getParamValue(params.Params, 'SearchText');
            if (searchText) {
                queryParams.search = searchText;
            }

            // Role filter
            const role = this.getParamValue(params.Params, 'Role');
            if (role) {
                queryParams.role = role;
            }

            // Status filter
            const status = this.getParamValue(params.Params, 'Status');
            if (status) {
                queryParams.status = status;
            }

            // Tag filter
            const tags = this.getParamValue(params.Params, 'Tags');
            if (tags) {
                queryParams.tags = tags;
            }

            // Date filters
            const createdAfter = this.getParamValue(params.Params, 'CreatedAfter');
            if (createdAfter) {
                queryParams.created_after = this.formatLearnWorldsDate(new Date(createdAfter));
            }

            const createdBefore = this.getParamValue(params.Params, 'CreatedBefore');
            if (createdBefore) {
                queryParams.created_before = this.formatLearnWorldsDate(new Date(createdBefore));
            }

            // Sorting
            const sortBy = this.getParamValue(params.Params, 'SortBy') || 'created';
            const sortOrder = this.getParamValue(params.Params, 'SortOrder') || 'desc';
            queryParams.sort = `${sortOrder === 'asc' ? '' : '-'}${sortBy}`;

            // Include course stats
            const includeCourseStats = this.getParamValue(params.Params, 'IncludeCourseStats');
            if (includeCourseStats) {
                queryParams.include = 'course_stats';
            }

            // Limit for pagination
            const maxResults = this.getParamValue(params.Params, 'MaxResults') || 100;
            queryParams.limit = Math.min(maxResults, 100); // LearnWorlds max is usually 100

            // Make the API request
            const users = await this.makeLearnWorldsPaginatedRequest<any>(
                'users',
                queryParams,
                contextUser
            );

            // Map to our interface
            const mappedUsers: LearnWorldsUser[] = users.map(user => this.mapLearnWorldsUser(user));

            // Calculate summary
            const summary = this.calculateUserSummary(mappedUsers);

            // Create output parameters
            if (!params.Params.find(p => p.Name === 'Users')) {
                params.Params.push({
                    Name: 'Users',
                    Type: 'Output',
                    Value: mappedUsers
                });
            } else {
                params.Params.find(p => p.Name === 'Users')!.Value = mappedUsers;
            }

            if (!params.Params.find(p => p.Name === 'TotalCount')) {
                params.Params.push({
                    Name: 'TotalCount',
                    Type: 'Output',
                    Value: mappedUsers.length
                });
            } else {
                params.Params.find(p => p.Name === 'TotalCount')!.Value = mappedUsers.length;
            }

            if (!params.Params.find(p => p.Name === 'Summary')) {
                params.Params.push({
                    Name: 'Summary',
                    Type: 'Output',
                    Value: summary
                });
            } else {
                params.Params.find(p => p.Name === 'Summary')!.Value = summary;
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved ${mappedUsers.length} users from LearnWorlds`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: errorMessage
            };
        }
    }

    /**
     * Map LearnWorlds user data to our interface
     */
    private mapLearnWorldsUser(lwUser: any): LearnWorldsUser {
        return {
            id: lwUser.id || lwUser._id,
            email: lwUser.email,
            username: lwUser.username || lwUser.email,
            firstName: lwUser.first_name,
            lastName: lwUser.last_name,
            fullName: lwUser.full_name || `${lwUser.first_name || ''} ${lwUser.last_name || ''}`.trim(),
            status: this.mapUserStatus(lwUser.status || 'active'),
            role: lwUser.role || 'student',
            createdAt: this.parseLearnWorldsDate(lwUser.created || lwUser.created_at),
            lastLoginAt: lwUser.last_login ? this.parseLearnWorldsDate(lwUser.last_login) : undefined,
            tags: lwUser.tags || [],
            customFields: lwUser.custom_fields || {},
            totalCourses: lwUser.course_stats?.total || 0,
            completedCourses: lwUser.course_stats?.completed || 0,
            inProgressCourses: lwUser.course_stats?.in_progress || 0,
            totalTimeSpent: lwUser.course_stats?.total_time_spent || 0,
            avatarUrl: lwUser.avatar_url,
            bio: lwUser.bio,
            location: lwUser.location,
            timezone: lwUser.timezone
        };
    }

    /**
     * Calculate summary statistics
     */
    private calculateUserSummary(users: LearnWorldsUser[]): any {
        const summary = {
            totalUsers: users.length,
            activeUsers: users.filter(u => u.status === 'active').length,
            inactiveUsers: users.filter(u => u.status === 'inactive').length,
            suspendedUsers: users.filter(u => u.status === 'suspended').length,
            usersByRole: {} as Record<string, number>,
            averageCoursesPerUser: 0,
            totalTimeSpent: 0,
            mostActiveUsers: [] as any[],
            recentSignups: [] as any[]
        };

        // Count by role
        users.forEach(user => {
            summary.usersByRole[user.role] = (summary.usersByRole[user.role] || 0) + 1;
            summary.totalTimeSpent += user.totalTimeSpent || 0;
        });

        // Calculate averages
        if (users.length > 0) {
            const totalCourses = users.reduce((sum, u) => sum + (u.totalCourses || 0), 0);
            summary.averageCoursesPerUser = totalCourses / users.length;
        }

        // Find most active users (by completed courses)
        summary.mostActiveUsers = users
            .filter(u => u.completedCourses && u.completedCourses > 0)
            .sort((a, b) => (b.completedCourses || 0) - (a.completedCourses || 0))
            .slice(0, 5)
            .map(u => ({
                id: u.id,
                name: u.fullName || u.email,
                completedCourses: u.completedCourses
            }));

        // Find recent signups (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        summary.recentSignups = users
            .filter(u => u.createdAt > thirtyDaysAgo)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 10)
            .map(u => ({
                id: u.id,
                name: u.fullName || u.email,
                signupDate: u.createdAt
            }));

        return summary;
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonLMSParams();
        
        const specificParams: ActionParam[] = [
            {
                Name: 'SearchText',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Role',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Status',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Tags',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CreatedAfter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CreatedBefore',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'created'
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'desc'
            },
            {
                Name: 'IncludeCourseStats',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            }
        ];

        return [...baseParams, ...specificParams];
    }
}