import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Interface for LearnWorlds user detailed information
 */
export interface LearnWorldsUserDetails {
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
    avatarUrl?: string;
    bio?: string;
    location?: string;
    timezone?: string;
    language?: string;
    phone?: string;
    tags?: string[];
    customFields?: Record<string, any>;
    
    // Learning statistics
    totalCourses: number;
    completedCourses: number;
    inProgressCourses: number;
    notStartedCourses: number;
    totalTimeSpent: number;
    averageCompletionRate: number;
    lastActivityDate?: Date;
    
    // Enrollment details
    enrollments?: UserEnrollment[];
    
    // Achievement data
    totalCertificates: number;
    totalBadges: number;
    points?: number;
    level?: string;
    
    // Account settings
    emailNotifications?: boolean;
    twoFactorEnabled?: boolean;
    agreedToTerms?: boolean;
    marketingConsent?: boolean;
}

/**
 * Interface for user enrollment in a course
 */
export interface UserEnrollment {
    courseId: string;
    courseTitle: string;
    enrolledAt: Date;
    status: 'active' | 'completed' | 'expired' | 'suspended';
    progress: number;
    completedAt?: Date;
    expiresAt?: Date;
    lastAccessedAt?: Date;
    timeSpent: number;
    certificateUrl?: string;
    grade?: number;
}

/**
 * Action to retrieve detailed information about a specific LearnWorlds user
 */
@RegisterClass(LearnWorldsBaseAction, 'GetLearnWorldsUserDetailsAction')
export class GetLearnWorldsUserDetailsAction extends LearnWorldsBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves comprehensive details about a specific user in LearnWorlds including profile, enrollments, progress, and achievements';
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

            // Get user ID
            const userId = this.getParamValue(params.Params, 'UserID');
            if (!userId) {
                return {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: 'UserID parameter is required'
                };
            }

            // Include enrollments
            const includeEnrollments = this.getParamValue(params.Params, 'IncludeEnrollments') ?? true;
            const includeStats = this.getParamValue(params.Params, 'IncludeStats') ?? true;

            // Make the API request for user details
            const userResponse = await this.makeLearnWorldsRequest<any>(
                `users/${userId}`,
                'GET',
                undefined,
                contextUser
            );

            // Map basic user details
            const userDetails = this.mapUserDetails(userResponse);

            // Get enrollments if requested
            if (includeEnrollments) {
                const enrollmentsResponse = await this.makeLearnWorldsRequest<{
                    data: any[]
                }>(
                    `users/${userId}/enrollments`,
                    'GET',
                    undefined,
                    contextUser
                );

                if (enrollmentsResponse.data) {
                    userDetails.enrollments = enrollmentsResponse.data.map(e => this.mapEnrollment(e));
                    
                    // Calculate enrollment statistics
                    this.calculateEnrollmentStats(userDetails);
                }
            }

            // Get additional stats if requested
            if (includeStats) {
                try {
                    const statsResponse = await this.makeLearnWorldsRequest<any>(
                        `users/${userId}/stats`,
                        'GET',
                        undefined,
                        contextUser
                    );

                    if (statsResponse) {
                        this.mergeStatistics(userDetails, statsResponse);
                    }
                } catch (error) {
                    // Stats endpoint might not be available for all plans
                    console.log('Stats endpoint not available:', error);
                }
            }

            // Create output parameters
            if (!params.Params.find(p => p.Name === 'UserDetails')) {
                params.Params.push({
                    Name: 'UserDetails',
                    Type: 'Output',
                    Value: userDetails
                });
            } else {
                params.Params.find(p => p.Name === 'UserDetails')!.Value = userDetails;
            }

            if (!params.Params.find(p => p.Name === 'Summary')) {
                params.Params.push({
                    Name: 'Summary',
                    Type: 'Output',
                    Value: this.createUserSummary(userDetails)
                });
            } else {
                params.Params.find(p => p.Name === 'Summary')!.Value = this.createUserSummary(userDetails);
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved details for user ${userDetails.email}`
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
     * Map LearnWorlds user data to detailed interface
     */
    private mapUserDetails(lwUser: any): LearnWorldsUserDetails {
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
            avatarUrl: lwUser.avatar_url || lwUser.profile_image,
            bio: lwUser.bio || lwUser.description,
            location: lwUser.location || lwUser.country,
            timezone: lwUser.timezone,
            language: lwUser.language || 'en',
            phone: lwUser.phone,
            tags: lwUser.tags || [],
            customFields: lwUser.custom_fields || {},
            
            // Initialize statistics
            totalCourses: 0,
            completedCourses: 0,
            inProgressCourses: 0,
            notStartedCourses: 0,
            totalTimeSpent: 0,
            averageCompletionRate: 0,
            lastActivityDate: lwUser.last_activity ? this.parseLearnWorldsDate(lwUser.last_activity) : undefined,
            
            // Achievement data
            totalCertificates: lwUser.certificates_count || 0,
            totalBadges: lwUser.badges_count || 0,
            points: lwUser.points || 0,
            level: lwUser.level,
            
            // Account settings
            emailNotifications: lwUser.email_notifications,
            twoFactorEnabled: lwUser.two_factor_enabled,
            agreedToTerms: lwUser.agreed_to_terms,
            marketingConsent: lwUser.marketing_consent
        };
    }

    /**
     * Map enrollment data
     */
    private mapEnrollment(enrollment: any): UserEnrollment {
        const progress = this.calculateProgress(enrollment.progress || {});
        
        return {
            courseId: enrollment.course_id || enrollment.course?.id,
            courseTitle: enrollment.course_title || enrollment.course?.title || 'Unknown Course',
            enrolledAt: this.parseLearnWorldsDate(enrollment.enrolled_at || enrollment.created),
            status: this.mapLearnWorldsEnrollmentStatus(enrollment),
            progress: progress.percentage,
            completedAt: enrollment.completed_at ? this.parseLearnWorldsDate(enrollment.completed_at) : undefined,
            expiresAt: enrollment.expires_at ? this.parseLearnWorldsDate(enrollment.expires_at) : undefined,
            lastAccessedAt: enrollment.last_accessed_at ? this.parseLearnWorldsDate(enrollment.last_accessed_at) : undefined,
            timeSpent: progress.timeSpent || enrollment.time_spent || 0,
            certificateUrl: enrollment.certificate_url,
            grade: enrollment.grade || enrollment.final_grade
        };
    }

    /**
     * Calculate enrollment statistics
     */
    private calculateEnrollmentStats(userDetails: LearnWorldsUserDetails): void {
        if (!userDetails.enrollments) return;

        userDetails.totalCourses = userDetails.enrollments.length;
        userDetails.completedCourses = userDetails.enrollments.filter(e => e.status === 'completed').length;
        userDetails.inProgressCourses = userDetails.enrollments.filter(e => 
            e.status === 'active' && e.progress > 0 && e.progress < 100
        ).length;
        userDetails.notStartedCourses = userDetails.enrollments.filter(e => 
            e.status === 'active' && e.progress === 0
        ).length;

        // Calculate total time spent
        userDetails.totalTimeSpent = userDetails.enrollments.reduce((sum, e) => sum + e.timeSpent, 0);

        // Calculate average completion rate
        const activeEnrollments = userDetails.enrollments.filter(e => e.status === 'active' || e.status === 'completed');
        if (activeEnrollments.length > 0) {
            const totalProgress = activeEnrollments.reduce((sum, e) => sum + e.progress, 0);
            userDetails.averageCompletionRate = Math.round(totalProgress / activeEnrollments.length);
        }
    }

    /**
     * Merge additional statistics
     */
    private mergeStatistics(userDetails: LearnWorldsUserDetails, stats: any): void {
        if (stats.total_time_spent) {
            userDetails.totalTimeSpent = stats.total_time_spent;
        }
        if (stats.certificates_earned !== undefined) {
            userDetails.totalCertificates = stats.certificates_earned;
        }
        if (stats.badges_earned !== undefined) {
            userDetails.totalBadges = stats.badges_earned;
        }
        if (stats.points !== undefined) {
            userDetails.points = stats.points;
        }
    }

    /**
     * Create a summary of user information
     */
    private createUserSummary(userDetails: LearnWorldsUserDetails): any {
        return {
            userId: userDetails.id,
            displayName: userDetails.fullName || userDetails.email,
            status: userDetails.status,
            role: userDetails.role,
            learningProgress: {
                totalCourses: userDetails.totalCourses,
                completedCourses: userDetails.completedCourses,
                inProgressCourses: userDetails.inProgressCourses,
                notStartedCourses: userDetails.notStartedCourses,
                averageCompletionRate: userDetails.averageCompletionRate,
                totalTimeSpent: this.formatDuration(userDetails.totalTimeSpent)
            },
            achievements: {
                certificates: userDetails.totalCertificates,
                badges: userDetails.totalBadges,
                points: userDetails.points,
                level: userDetails.level
            },
            engagement: {
                accountAge: Math.floor((new Date().getTime() - userDetails.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
                lastLoginDaysAgo: userDetails.lastLoginAt ? 
                    Math.floor((new Date().getTime() - userDetails.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
                lastActivityDaysAgo: userDetails.lastActivityDate ? 
                    Math.floor((new Date().getTime() - userDetails.lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)) : null
            },
            recentActivity: userDetails.enrollments ?
                userDetails.enrollments
                    .filter(e => e.lastAccessedAt)
                    .sort((a, b) => (b.lastAccessedAt?.getTime() || 0) - (a.lastAccessedAt?.getTime() || 0))
                    .slice(0, 5)
                    .map(e => ({
                        courseTitle: e.courseTitle,
                        progress: e.progress,
                        lastAccessed: e.lastAccessedAt
                    })) : []
        };
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonLMSParams();
        
        const specificParams: ActionParam[] = [
            {
                Name: 'UserID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeEnrollments',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeStats',
                Type: 'Input',
                Value: true
            }
        ];

        return [...baseParams, ...specificParams];
    }
}