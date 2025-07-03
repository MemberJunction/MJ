import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Interface for a LearnWorlds course
 */
export interface LearnWorldsCourse {
    id: string;
    title: string;
    subtitle?: string;
    description?: string;
    shortDescription?: string;
    
    // Status and visibility
    status: 'published' | 'draft' | 'coming_soon';
    visibility: 'public' | 'private' | 'hidden';
    isActive: boolean;
    isFree: boolean;
    
    // Pricing
    price?: number;
    currency?: string;
    originalPrice?: number;
    discountPercentage?: number;
    
    // Course metadata
    categoryId?: string;
    categoryName?: string;
    tags?: string[];
    level?: 'beginner' | 'intermediate' | 'advanced' | 'all';
    language?: string;
    duration?: number; // in minutes
    
    // Media
    thumbnailUrl?: string;
    coverImageUrl?: string;
    promoVideoUrl?: string;
    
    // Instructor info
    instructorId?: string;
    instructorName?: string;
    instructorBio?: string;
    instructorAvatarUrl?: string;
    
    // Course structure
    totalUnits: number;
    totalLessons: number;
    totalQuizzes: number;
    totalAssignments: number;
    estimatedDuration?: number;
    
    // Enrollment data
    totalEnrollments: number;
    activeEnrollments: number;
    completionRate: number;
    averageRating?: number;
    totalReviews?: number;
    
    // Dates
    createdAt: Date;
    updatedAt: Date;
    publishedAt?: Date;
    enrollmentStartDate?: Date;
    enrollmentEndDate?: Date;
    
    // Access settings
    requiresApproval: boolean;
    hasPrerequisites: boolean;
    prerequisites?: string[];
    certificateAvailable: boolean;
    
    // Learning outcomes
    objectives?: string[];
    targetAudience?: string[];
    requirements?: string[];
}

/**
 * Interface for course catalog summary
 */
export interface CourseCatalogSummary {
    totalCourses: number;
    publishedCourses: number;
    draftCourses: number;
    freeCourses: number;
    paidCourses: number;
    
    categoryCounts: Record<string, number>;
    levelCounts: Record<string, number>;
    languageCounts: Record<string, number>;
    
    enrollmentStats: {
        totalEnrollments: number;
        averageEnrollmentsPerCourse: number;
        mostPopularCourses: Array<{
            id: string;
            title: string;
            enrollments: number;
        }>;
    };
    
    priceStats: {
        averagePrice: number;
        minPrice: number;
        maxPrice: number;
        currency: string;
    };
}

/**
 * Action to retrieve courses from LearnWorlds LMS
 */
@RegisterClass(BaseAction, 'GetLearnWorldsCoursesAction')
export class GetLearnWorldsCoursesAction extends LearnWorldsBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves the course catalog from LearnWorlds with filtering, search, and sorting options';
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

            // Status filter
            const status = this.getParamValue(params.Params, 'Status');
            if (status) {
                queryParams.status = status;
            }

            // Category filter
            const categoryId = this.getParamValue(params.Params, 'CategoryID');
            if (categoryId) {
                queryParams.category_id = categoryId;
            }

            // Level filter
            const level = this.getParamValue(params.Params, 'Level');
            if (level) {
                queryParams.level = level;
            }

            // Language filter
            const language = this.getParamValue(params.Params, 'Language');
            if (language) {
                queryParams.language = language;
            }

            // Price filters
            const onlyFree = this.getParamValue(params.Params, 'OnlyFree');
            if (onlyFree) {
                queryParams.is_free = true;
            }

            const minPrice = this.getParamValue(params.Params, 'MinPrice');
            if (minPrice !== null && minPrice !== undefined) {
                queryParams.min_price = minPrice;
            }

            const maxPrice = this.getParamValue(params.Params, 'MaxPrice');
            if (maxPrice !== null && maxPrice !== undefined) {
                queryParams.max_price = maxPrice;
            }

            // Tags filter
            const tags = this.getParamValue(params.Params, 'Tags');
            if (tags) {
                queryParams.tags = tags;
            }

            // Instructor filter
            const instructorId = this.getParamValue(params.Params, 'InstructorID');
            if (instructorId) {
                queryParams.instructor_id = instructorId;
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

            // Include extra data
            const includeEnrollmentStats = this.getParamValue(params.Params, 'IncludeEnrollmentStats') ?? true;
            if (includeEnrollmentStats) {
                queryParams.include = 'enrollment_stats';
            }

            // Limit for pagination
            const maxResults = this.getParamValue(params.Params, 'MaxResults') || 100;
            queryParams.limit = Math.min(maxResults, 100);

            // Make the API request
            const courses = await this.makeLearnWorldsPaginatedRequest<any>(
                'courses',
                queryParams,
                contextUser
            );

            // Map to our interface
            const mappedCourses: LearnWorldsCourse[] = courses.map(course => this.mapLearnWorldsCourse(course));

            // Calculate summary
            const summary = this.calculateCourseCatalogSummary(mappedCourses);

            // Create output parameters
            if (!params.Params.find(p => p.Name === 'Courses')) {
                params.Params.push({
                    Name: 'Courses',
                    Type: 'Output',
                    Value: mappedCourses
                });
            } else {
                params.Params.find(p => p.Name === 'Courses')!.Value = mappedCourses;
            }

            if (!params.Params.find(p => p.Name === 'TotalCount')) {
                params.Params.push({
                    Name: 'TotalCount',
                    Type: 'Output',
                    Value: mappedCourses.length
                });
            } else {
                params.Params.find(p => p.Name === 'TotalCount')!.Value = mappedCourses.length;
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
                Message: `Successfully retrieved ${mappedCourses.length} courses from LearnWorlds`
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
     * Map LearnWorlds course data to our interface
     */
    private mapLearnWorldsCourse(lwCourse: any): LearnWorldsCourse {
        return {
            id: lwCourse.id || lwCourse._id,
            title: lwCourse.title,
            subtitle: lwCourse.subtitle,
            description: lwCourse.description,
            shortDescription: lwCourse.short_description || lwCourse.excerpt,
            
            status: this.mapCourseStatus(lwCourse.status),
            visibility: this.mapCourseVisibility(lwCourse.visibility || lwCourse.access_type),
            isActive: lwCourse.is_active !== false,
            isFree: lwCourse.is_free || lwCourse.price === 0,
            
            price: lwCourse.price,
            currency: lwCourse.currency || 'USD',
            originalPrice: lwCourse.original_price,
            discountPercentage: this.calculateDiscountPercentage(lwCourse.original_price, lwCourse.price),
            
            categoryId: lwCourse.category_id || lwCourse.category?.id,
            categoryName: lwCourse.category_name || lwCourse.category?.name,
            tags: lwCourse.tags || [],
            level: this.mapCourseLevel(lwCourse.level || lwCourse.difficulty),
            language: lwCourse.language || 'en',
            duration: lwCourse.duration || lwCourse.estimated_duration,
            
            thumbnailUrl: lwCourse.thumbnail_url || lwCourse.image,
            coverImageUrl: lwCourse.cover_image_url || lwCourse.cover_image,
            promoVideoUrl: lwCourse.promo_video_url || lwCourse.video_url,
            
            instructorId: lwCourse.instructor_id || lwCourse.instructor?.id || lwCourse.author_id,
            instructorName: lwCourse.instructor_name || lwCourse.instructor?.name || lwCourse.author_name,
            instructorBio: lwCourse.instructor_bio || lwCourse.instructor?.bio,
            instructorAvatarUrl: lwCourse.instructor_avatar || lwCourse.instructor?.avatar_url,
            
            totalUnits: lwCourse.total_units || lwCourse.sections_count || 0,
            totalLessons: lwCourse.total_lessons || lwCourse.lessons_count || 0,
            totalQuizzes: lwCourse.total_quizzes || lwCourse.quizzes_count || 0,
            totalAssignments: lwCourse.total_assignments || lwCourse.assignments_count || 0,
            estimatedDuration: lwCourse.estimated_duration || lwCourse.total_duration,
            
            totalEnrollments: lwCourse.total_enrollments || lwCourse.students_count || 0,
            activeEnrollments: lwCourse.active_enrollments || lwCourse.active_students || 0,
            completionRate: lwCourse.completion_rate || 0,
            averageRating: lwCourse.average_rating || lwCourse.rating,
            totalReviews: lwCourse.total_reviews || lwCourse.reviews_count,
            
            createdAt: this.parseLearnWorldsDate(lwCourse.created || lwCourse.created_at),
            updatedAt: this.parseLearnWorldsDate(lwCourse.updated || lwCourse.updated_at),
            publishedAt: lwCourse.published_at ? this.parseLearnWorldsDate(lwCourse.published_at) : undefined,
            enrollmentStartDate: lwCourse.enrollment_start ? this.parseLearnWorldsDate(lwCourse.enrollment_start) : undefined,
            enrollmentEndDate: lwCourse.enrollment_end ? this.parseLearnWorldsDate(lwCourse.enrollment_end) : undefined,
            
            requiresApproval: lwCourse.requires_approval || false,
            hasPrerequisites: lwCourse.has_prerequisites || false,
            prerequisites: lwCourse.prerequisites || [],
            certificateAvailable: lwCourse.certificate_available || lwCourse.has_certificate || false,
            
            objectives: lwCourse.objectives || lwCourse.learning_objectives || [],
            targetAudience: lwCourse.target_audience || [],
            requirements: lwCourse.requirements || lwCourse.prerequisites_text || []
        };
    }

    /**
     * Map course status
     */
    private mapCourseStatus(status: string): 'published' | 'draft' | 'coming_soon' {
        const statusMap: Record<string, 'published' | 'draft' | 'coming_soon'> = {
            'published': 'published',
            'active': 'published',
            'draft': 'draft',
            'unpublished': 'draft',
            'coming_soon': 'coming_soon',
            'upcoming': 'coming_soon'
        };
        
        return statusMap[status?.toLowerCase()] || 'draft';
    }

    /**
     * Map course visibility
     */
    private mapCourseVisibility(visibility: string): 'public' | 'private' | 'hidden' {
        const visibilityMap: Record<string, 'public' | 'private' | 'hidden'> = {
            'public': 'public',
            'open': 'public',
            'private': 'private',
            'closed': 'private',
            'hidden': 'hidden',
            'unlisted': 'hidden'
        };
        
        return visibilityMap[visibility?.toLowerCase()] || 'public';
    }

    /**
     * Map course level
     */
    private mapCourseLevel(level: string): 'beginner' | 'intermediate' | 'advanced' | 'all' {
        const levelMap: Record<string, 'beginner' | 'intermediate' | 'advanced' | 'all'> = {
            'beginner': 'beginner',
            'basic': 'beginner',
            'introductory': 'beginner',
            'intermediate': 'intermediate',
            'medium': 'intermediate',
            'advanced': 'advanced',
            'expert': 'advanced',
            'all': 'all',
            'any': 'all',
            'mixed': 'all'
        };
        
        return levelMap[level?.toLowerCase()] || 'all';
    }

    /**
     * Calculate discount percentage
     */
    private calculateDiscountPercentage(originalPrice?: number, currentPrice?: number): number | undefined {
        if (!originalPrice || !currentPrice || originalPrice <= currentPrice) {
            return undefined;
        }
        
        return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    }

    /**
     * Calculate course catalog summary
     */
    private calculateCourseCatalogSummary(courses: LearnWorldsCourse[]): CourseCatalogSummary {
        const summary: CourseCatalogSummary = {
            totalCourses: courses.length,
            publishedCourses: courses.filter(c => c.status === 'published').length,
            draftCourses: courses.filter(c => c.status === 'draft').length,
            freeCourses: courses.filter(c => c.isFree).length,
            paidCourses: courses.filter(c => !c.isFree).length,
            
            categoryCounts: {},
            levelCounts: {},
            languageCounts: {},
            
            enrollmentStats: {
                totalEnrollments: 0,
                averageEnrollmentsPerCourse: 0,
                mostPopularCourses: []
            },
            
            priceStats: {
                averagePrice: 0,
                minPrice: 0,
                maxPrice: 0,
                currency: 'USD'
            }
        };

        // Count by category
        courses.forEach(course => {
            if (course.categoryName) {
                summary.categoryCounts[course.categoryName] = 
                    (summary.categoryCounts[course.categoryName] || 0) + 1;
            }
            
            // Count by level
            if (course.level) {
                summary.levelCounts[course.level] = 
                    (summary.levelCounts[course.level] || 0) + 1;
            }
            
            // Count by language
            if (course.language) {
                summary.languageCounts[course.language] = 
                    (summary.languageCounts[course.language] || 0) + 1;
            }
            
            // Accumulate enrollment stats
            summary.enrollmentStats.totalEnrollments += course.totalEnrollments;
        });

        // Calculate averages
        if (courses.length > 0) {
            summary.enrollmentStats.averageEnrollmentsPerCourse = 
                Math.round(summary.enrollmentStats.totalEnrollments / courses.length);
        }

        // Find most popular courses
        summary.enrollmentStats.mostPopularCourses = courses
            .filter(c => c.totalEnrollments > 0)
            .sort((a, b) => b.totalEnrollments - a.totalEnrollments)
            .slice(0, 5)
            .map(c => ({
                id: c.id,
                title: c.title,
                enrollments: c.totalEnrollments
            }));

        // Calculate price statistics for paid courses
        const paidCourses = courses.filter(c => !c.isFree && c.price !== undefined);
        if (paidCourses.length > 0) {
            const prices = paidCourses.map(c => c.price!);
            summary.priceStats = {
                averagePrice: Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length),
                minPrice: Math.min(...prices),
                maxPrice: Math.max(...prices),
                currency: paidCourses[0].currency || 'USD'
            };
        }

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
                Name: 'Status',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CategoryID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Level',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Language',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OnlyFree',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'MinPrice',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxPrice',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Tags',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'InstructorID',
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
                Name: 'IncludeEnrollmentStats',
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