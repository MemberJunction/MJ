import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Interface for user progress in a course
 */
export interface CourseProgress {
    courseId: string;
    courseTitle: string;
    enrollmentId: string;
    enrolledAt: Date;
    lastAccessedAt?: Date;
    
    // Progress metrics
    progressPercentage: number;
    completedUnits: number;
    totalUnits: number;
    completedLessons: number;
    totalLessons: number;
    
    // Time metrics
    totalTimeSpent: number;
    averageSessionTime: number;
    estimatedTimeToComplete?: number;
    
    // Performance metrics
    quizScoreAverage?: number;
    assignmentsCompleted?: number;
    assignmentsTotal?: number;
    currentGrade?: number;
    
    // Status
    status: 'not_started' | 'in_progress' | 'completed' | 'expired';
    completedAt?: Date;
    expiresAt?: Date;
    certificateEarned: boolean;
    certificateUrl?: string;
    
    // Unit-level progress
    unitProgress?: UnitProgress[];
}

/**
 * Interface for progress within a course unit/module
 */
export interface UnitProgress {
    unitId: string;
    unitTitle: string;
    unitType: 'section' | 'chapter' | 'module';
    order: number;
    
    // Progress
    progressPercentage: number;
    completedLessons: number;
    totalLessons: number;
    timeSpent: number;
    
    // Status
    status: 'not_started' | 'in_progress' | 'completed';
    startedAt?: Date;
    completedAt?: Date;
    
    // Lesson details
    lessons?: LessonProgress[];
}

/**
 * Interface for individual lesson progress
 */
export interface LessonProgress {
    lessonId: string;
    lessonTitle: string;
    lessonType: 'video' | 'text' | 'quiz' | 'assignment' | 'scorm' | 'interactive';
    order: number;
    
    // Progress
    completed: boolean;
    progressPercentage: number;
    timeSpent: number;
    
    // Timestamps
    startedAt?: Date;
    completedAt?: Date;
    lastAccessedAt?: Date;
    
    // Additional data for specific types
    videoWatchTime?: number;
    videoTotalTime?: number;
    quizScore?: number;
    quizMaxScore?: number;
    quizAttempts?: number;
    assignmentSubmitted?: boolean;
    assignmentGrade?: number;
}

/**
 * Interface for overall user learning progress
 */
export interface UserLearningProgress {
    userId: string;
    userEmail: string;
    totalCourses: number;
    coursesCompleted: number;
    coursesInProgress: number;
    coursesNotStarted: number;
    overallProgressPercentage: number;
    totalTimeSpent: number;
    totalCertificatesEarned: number;
    averageQuizScore?: number;
    courses: CourseProgress[];
    
    // Analytics
    learningStreak?: number;
    lastLearningDate?: Date;
    mostActiveDay?: string;
    preferredLearningTime?: string;
}

/**
 * Action to retrieve detailed progress information for a LearnWorlds user
 */
@RegisterClass(BaseAction, 'GetLearnWorldsUserProgressAction')
export class GetLearnWorldsUserProgressAction extends LearnWorldsBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves comprehensive learning progress for a user in LearnWorlds, including course completion, time spent, and detailed unit/lesson progress';
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

            // Optional course ID for specific course progress
            const courseId = this.getParamValue(params.Params, 'CourseID');
            const includeUnitDetails = this.getParamValue(params.Params, 'IncludeUnitDetails') ?? false;
            const includeLessonDetails = this.getParamValue(params.Params, 'IncludeLessonDetails') ?? false;

            let userProgress: UserLearningProgress;

            if (courseId) {
                // Get progress for specific course
                const courseProgress = await this.getCourseProgress(userId, courseId, includeUnitDetails, includeLessonDetails, contextUser);
                
                // Create user progress object with single course
                userProgress = {
                    userId,
                    userEmail: '', // Will be populated if we get user info
                    totalCourses: 1,
                    coursesCompleted: courseProgress.status === 'completed' ? 1 : 0,
                    coursesInProgress: courseProgress.status === 'in_progress' ? 1 : 0,
                    coursesNotStarted: courseProgress.status === 'not_started' ? 1 : 0,
                    overallProgressPercentage: courseProgress.progressPercentage,
                    totalTimeSpent: courseProgress.totalTimeSpent,
                    totalCertificatesEarned: courseProgress.certificateEarned ? 1 : 0,
                    courses: [courseProgress]
                };
            } else {
                // Get progress for all courses
                userProgress = await this.getAllCoursesProgress(userId, includeUnitDetails, includeLessonDetails, contextUser);
            }

            // Try to get user email
            try {
                const userInfo = await this.makeLearnWorldsRequest<any>(
                    `users/${userId}`,
                    'GET',
                    undefined,
                    contextUser
                );
                userProgress.userEmail = userInfo.email || '';
            } catch {
                // Ignore if we can't get user info
            }

            // Calculate analytics
            this.calculateLearningAnalytics(userProgress);

            // Create output parameters
            if (!params.Params.find(p => p.Name === 'UserProgress')) {
                params.Params.push({
                    Name: 'UserProgress',
                    Type: 'Output',
                    Value: userProgress
                });
            } else {
                params.Params.find(p => p.Name === 'UserProgress')!.Value = userProgress;
            }

            if (!params.Params.find(p => p.Name === 'Summary')) {
                params.Params.push({
                    Name: 'Summary',
                    Type: 'Output',
                    Value: this.createProgressSummary(userProgress)
                });
            } else {
                params.Params.find(p => p.Name === 'Summary')!.Value = this.createProgressSummary(userProgress);
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: courseId ? 
                    `Successfully retrieved progress for course ${courseId}` :
                    `Successfully retrieved progress for ${userProgress.totalCourses} courses`
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
     * Get progress for a specific course
     */
    private async getCourseProgress(
        userId: string,
        courseId: string,
        includeUnits: boolean,
        includeLessons: boolean,
        contextUser: any
    ): Promise<CourseProgress> {
        // Get enrollment/progress data
        const progressResponse = await this.makeLearnWorldsRequest<any>(
            `users/${userId}/courses/${courseId}/progress`,
            'GET',
            undefined,
            contextUser
        );

        const progress = this.mapCourseProgress(progressResponse);

        // Get unit-level details if requested
        if (includeUnits) {
            try {
                const unitsResponse = await this.makeLearnWorldsRequest<{
                    data: any[]
                }>(
                    `users/${userId}/courses/${courseId}/units`,
                    'GET',
                    undefined,
                    contextUser
                );

                if (unitsResponse.data) {
                    progress.unitProgress = await Promise.all(
                        unitsResponse.data.map(unit => 
                            this.mapUnitProgress(unit, userId, courseId, includeLessons, contextUser)
                        )
                    );
                }
            } catch {
                // Units endpoint might not be available
            }
        }

        return progress;
    }

    /**
     * Get progress for all user courses
     */
    private async getAllCoursesProgress(
        userId: string,
        includeUnits: boolean,
        includeLessons: boolean,
        contextUser: any
    ): Promise<UserLearningProgress> {
        // Get all enrollments
        const enrollmentsResponse = await this.makeLearnWorldsRequest<{
            data: any[]
        }>(
            `users/${userId}/enrollments`,
            'GET',
            undefined,
            contextUser
        );

        const courseProgressPromises = enrollmentsResponse.data.map(enrollment =>
            this.getCourseProgress(
                userId,
                enrollment.course_id || enrollment.course?.id,
                includeUnits,
                includeLessons,
                contextUser
            ).catch(() => null) // Handle individual course failures gracefully
        );

        const courseProgressResults = await Promise.all(courseProgressPromises);
        const validCourses = courseProgressResults.filter(p => p !== null) as CourseProgress[];

        // Calculate aggregated metrics
        const completed = validCourses.filter(c => c.status === 'completed').length;
        const inProgress = validCourses.filter(c => c.status === 'in_progress').length;
        const notStarted = validCourses.filter(c => c.status === 'not_started').length;
        const totalTime = validCourses.reduce((sum, c) => sum + c.totalTimeSpent, 0);
        const totalCerts = validCourses.filter(c => c.certificateEarned).length;

        // Calculate overall progress
        let overallProgress = 0;
        if (validCourses.length > 0) {
            const totalProgress = validCourses.reduce((sum, c) => sum + c.progressPercentage, 0);
            overallProgress = Math.round(totalProgress / validCourses.length);
        }

        // Calculate average quiz score if available
        const coursesWithQuizzes = validCourses.filter(c => c.quizScoreAverage !== undefined);
        const avgQuizScore = coursesWithQuizzes.length > 0 ?
            coursesWithQuizzes.reduce((sum, c) => sum + (c.quizScoreAverage || 0), 0) / coursesWithQuizzes.length :
            undefined;

        return {
            userId,
            userEmail: '',
            totalCourses: validCourses.length,
            coursesCompleted: completed,
            coursesInProgress: inProgress,
            coursesNotStarted: notStarted,
            overallProgressPercentage: overallProgress,
            totalTimeSpent: totalTime,
            totalCertificatesEarned: totalCerts,
            averageQuizScore: avgQuizScore,
            courses: validCourses
        };
    }

    /**
     * Map course progress data
     */
    private mapCourseProgress(data: any): CourseProgress {
        const progress = this.calculateProgress(data.progress || data);
        const status = this.determineCourseStatus(data);

        return {
            courseId: data.course_id || data.course?.id,
            courseTitle: data.course_title || data.course?.title || 'Unknown Course',
            enrollmentId: data.enrollment_id || data.id,
            enrolledAt: this.parseLearnWorldsDate(data.enrolled_at || data.created),
            lastAccessedAt: data.last_accessed_at ? this.parseLearnWorldsDate(data.last_accessed_at) : undefined,
            
            progressPercentage: progress.percentage,
            completedUnits: progress.completedUnits,
            totalUnits: progress.totalUnits,
            completedLessons: data.completed_lessons || 0,
            totalLessons: data.total_lessons || 0,
            
            totalTimeSpent: progress.timeSpent,
            averageSessionTime: data.average_session_time || 0,
            estimatedTimeToComplete: this.calculateEstimatedTimeToComplete(data),
            
            quizScoreAverage: data.quiz_score_average,
            assignmentsCompleted: data.assignments_completed,
            assignmentsTotal: data.assignments_total,
            currentGrade: data.current_grade || data.grade,
            
            status,
            completedAt: data.completed_at ? this.parseLearnWorldsDate(data.completed_at) : undefined,
            expiresAt: data.expires_at ? this.parseLearnWorldsDate(data.expires_at) : undefined,
            certificateEarned: data.certificate_earned || false,
            certificateUrl: data.certificate_url
        };
    }

    /**
     * Map unit progress data
     */
    private async mapUnitProgress(
        unitData: any,
        userId: string,
        courseId: string,
        includeLessons: boolean,
        contextUser: any
    ): Promise<UnitProgress> {
        const unitProgress: UnitProgress = {
            unitId: unitData.id || unitData.unit_id,
            unitTitle: unitData.title || unitData.name,
            unitType: unitData.type || 'section',
            order: unitData.order || unitData.position || 0,
            
            progressPercentage: unitData.progress_percentage || 0,
            completedLessons: unitData.completed_lessons || 0,
            totalLessons: unitData.total_lessons || 0,
            timeSpent: unitData.time_spent || 0,
            
            status: this.determineUnitStatus(unitData),
            startedAt: unitData.started_at ? this.parseLearnWorldsDate(unitData.started_at) : undefined,
            completedAt: unitData.completed_at ? this.parseLearnWorldsDate(unitData.completed_at) : undefined
        };

        // Get lesson details if requested
        if (includeLessons && unitData.lessons) {
            unitProgress.lessons = unitData.lessons.map((lesson: any) => this.mapLessonProgress(lesson));
        }

        return unitProgress;
    }

    /**
     * Map lesson progress data
     */
    private mapLessonProgress(lessonData: any): LessonProgress {
        return {
            lessonId: lessonData.id || lessonData.lesson_id,
            lessonTitle: lessonData.title || lessonData.name,
            lessonType: this.mapLessonType(lessonData.type),
            order: lessonData.order || lessonData.position || 0,
            
            completed: lessonData.completed || false,
            progressPercentage: lessonData.progress_percentage || (lessonData.completed ? 100 : 0),
            timeSpent: lessonData.time_spent || 0,
            
            startedAt: lessonData.started_at ? this.parseLearnWorldsDate(lessonData.started_at) : undefined,
            completedAt: lessonData.completed_at ? this.parseLearnWorldsDate(lessonData.completed_at) : undefined,
            lastAccessedAt: lessonData.last_accessed_at ? this.parseLearnWorldsDate(lessonData.last_accessed_at) : undefined,
            
            videoWatchTime: lessonData.video_watch_time,
            videoTotalTime: lessonData.video_total_time,
            quizScore: lessonData.quiz_score,
            quizMaxScore: lessonData.quiz_max_score,
            quizAttempts: lessonData.quiz_attempts,
            assignmentSubmitted: lessonData.assignment_submitted,
            assignmentGrade: lessonData.assignment_grade
        };
    }

    /**
     * Determine course status from data
     */
    private determineCourseStatus(data: any): 'not_started' | 'in_progress' | 'completed' | 'expired' {
        if (data.expired || (data.expires_at && new Date(data.expires_at) < new Date())) {
            return 'expired';
        }
        if (data.completed || data.progress_percentage === 100) {
            return 'completed';
        }
        if (data.progress_percentage > 0 || data.started) {
            return 'in_progress';
        }
        return 'not_started';
    }

    /**
     * Determine unit status
     */
    private determineUnitStatus(data: any): 'not_started' | 'in_progress' | 'completed' {
        if (data.completed || data.progress_percentage === 100) {
            return 'completed';
        }
        if (data.progress_percentage > 0 || data.started) {
            return 'in_progress';
        }
        return 'not_started';
    }

    /**
     * Map lesson type
     */
    private mapLessonType(type: string): 'video' | 'text' | 'quiz' | 'assignment' | 'scorm' | 'interactive' {
        const typeMap: Record<string, 'video' | 'text' | 'quiz' | 'assignment' | 'scorm' | 'interactive'> = {
            'video': 'video',
            'text': 'text',
            'quiz': 'quiz',
            'exam': 'quiz',
            'assignment': 'assignment',
            'scorm': 'scorm',
            'interactive': 'interactive',
            'multimedia': 'interactive'
        };
        
        return typeMap[type?.toLowerCase()] || 'text';
    }

    /**
     * Calculate estimated time to complete
     */
    private calculateEstimatedTimeToComplete(data: any): number | undefined {
        if (data.estimated_time_to_complete) {
            return data.estimated_time_to_complete;
        }
        
        // Estimate based on progress
        if (data.total_time_spent && data.progress_percentage > 0 && data.progress_percentage < 100) {
            const timePerPercent = data.total_time_spent / data.progress_percentage;
            const remainingPercent = 100 - data.progress_percentage;
            return Math.round(timePerPercent * remainingPercent);
        }
        
        return undefined;
    }

    /**
     * Calculate learning analytics
     */
    private calculateLearningAnalytics(progress: UserLearningProgress): void {
        if (progress.courses.length === 0) return;

        // Find last learning date
        const lastDates = progress.courses
            .map(c => c.lastAccessedAt)
            .filter(d => d !== undefined) as Date[];
        
        if (lastDates.length > 0) {
            progress.lastLearningDate = new Date(Math.max(...lastDates.map(d => d.getTime())));
            
            // Calculate learning streak (simplified - days since last activity)
            const daysSinceLastActivity = Math.floor(
                (new Date().getTime() - progress.lastLearningDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            progress.learningStreak = daysSinceLastActivity <= 1 ? 1 : 0;
        }
    }

    /**
     * Create progress summary
     */
    private createProgressSummary(progress: UserLearningProgress): any {
        const activeCourses = progress.courses.filter(c => c.status === 'in_progress');
        const recentActivity = progress.courses
            .filter(c => c.lastAccessedAt)
            .sort((a, b) => (b.lastAccessedAt?.getTime() || 0) - (a.lastAccessedAt?.getTime() || 0))
            .slice(0, 5);

        return {
            overview: {
                totalCourses: progress.totalCourses,
                completedCourses: progress.coursesCompleted,
                inProgressCourses: progress.coursesInProgress,
                notStartedCourses: progress.coursesNotStarted,
                overallProgress: `${progress.overallProgressPercentage}%`,
                certificatesEarned: progress.totalCertificatesEarned,
                totalLearningTime: this.formatDuration(progress.totalTimeSpent)
            },
            performance: {
                averageQuizScore: progress.averageQuizScore ? `${Math.round(progress.averageQuizScore)}%` : 'N/A',
                averageCourseProgress: `${progress.overallProgressPercentage}%`,
                completionRate: progress.totalCourses > 0 ? 
                    `${Math.round((progress.coursesCompleted / progress.totalCourses) * 100)}%` : '0%'
            },
            currentFocus: activeCourses.map(c => ({
                courseTitle: c.courseTitle,
                progress: `${c.progressPercentage}%`,
                timeSpent: this.formatDuration(c.totalTimeSpent),
                estimatedTimeToComplete: c.estimatedTimeToComplete ? 
                    this.formatDuration(c.estimatedTimeToComplete) : 'N/A'
            })),
            recentActivity: recentActivity.map(c => ({
                courseTitle: c.courseTitle,
                lastAccessed: c.lastAccessedAt,
                progress: `${c.progressPercentage}%`
            })),
            achievements: {
                totalCertificates: progress.totalCertificatesEarned,
                coursesWithCertificates: progress.courses
                    .filter(c => c.certificateEarned)
                    .map(c => ({
                        courseTitle: c.courseTitle,
                        completedAt: c.completedAt
                    }))
            }
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
                Name: 'CourseID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeUnitDetails',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'IncludeLessonDetails',
                Type: 'Input',
                Value: false
            }
        ];

        return [...baseParams, ...specificParams];
    }
}