# @memberjunction/actions-bizapps-lms

Learning Management System (LMS) integration actions for MemberJunction. This package provides a standardized way to interact with various LMS platforms through MemberJunction's action framework.

## Overview

This package implements actions for common LMS operations across multiple learning platforms:
- LearnWorlds ✅
- Moodle (coming soon)
- Canvas (coming soon)
- Blackboard (coming soon)
- LearnDash (coming soon)

## Architecture

### Base Classes

- **BaseLMSAction**: Abstract base class providing common functionality for all LMS actions
  - Company-based credential management via CompanyIntegration entity
  - Common parameter definitions
  - Learning-specific utilities (progress calculation, duration formatting)
  - Error handling patterns

- **Provider-Specific Base Classes** (e.g., LearnWorldsBaseAction):
  - Handle provider-specific authentication
  - API request/response handling
  - Pagination support
  - Data mapping between provider formats and standard formats

### Authentication

The package uses MemberJunction's CompanyIntegration entity to store credentials:
- Each Company can have multiple LMS integrations
- API keys, OAuth tokens stored securely
- Environment variable support with database fallback

## Available Actions

### LearnWorlds

#### User Management

##### GetLearnWorldsUsersAction
Retrieves users (students, instructors, admins) from LearnWorlds with comprehensive filtering.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `SearchText`: Search by name, email, or username
- `Role`: Filter by user role (student, instructor, admin)
- `Status`: Filter by status (active, inactive, suspended)
- `Tags`: Filter by user tags (comma-separated)
- `CreatedAfter/CreatedBefore`: Date range filters
- `SortBy`: Sort field (created, name, email, last_login)
- `SortOrder`: asc or desc
- `IncludeCourseStats`: Include enrollment statistics
- `MaxResults`: Limit results (default: 100)

**Output:**
- `Users`: Array of user objects with profile and statistics
- `TotalCount`: Total number of users found
- `Summary`: Statistical summary including role distribution

##### GetLearnWorldsUserDetailsAction
Retrieves comprehensive details about a specific user including enrollments and achievements.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `UserID` (required): LearnWorlds user ID
- `IncludeEnrollments`: Include course enrollments (default: true)
- `IncludeStats`: Include additional statistics (default: true)

**Output:**
- `UserDetails`: Complete user profile with learning data
- `Summary`: User engagement and achievement summary

##### GetLearnWorldsUserProgressAction
Retrieves detailed learning progress for a user across all courses or specific course.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `UserID` (required): LearnWorlds user ID
- `CourseID`: Optional specific course ID
- `IncludeUnitDetails`: Include module/unit breakdown
- `IncludeLessonDetails`: Include individual lesson progress

**Output:**
- `UserProgress`: Comprehensive progress data
- `Summary`: Progress overview with key metrics

#### Course Management

##### GetLearnWorldsCoursesAction
Retrieves the course catalog with advanced filtering and search capabilities.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `SearchText`: Search in title and description
- `Status`: Filter by status (published, draft, coming_soon)
- `CategoryID`: Filter by category
- `Level`: Filter by difficulty (beginner, intermediate, advanced)
- `Language`: Filter by course language
- `OnlyFree`: Show only free courses
- `MinPrice/MaxPrice`: Price range filter
- `Tags`: Filter by course tags
- `InstructorID`: Filter by instructor
- `CreatedAfter/CreatedBefore`: Date range filters
- `SortBy`: Sort field (created, title, price, enrollments)
- `SortOrder`: asc or desc
- `IncludeEnrollmentStats`: Include enrollment data
- `MaxResults`: Limit results (default: 100)

**Output:**
- `Courses`: Array of course objects with details
- `TotalCount`: Total number of courses found
- `Summary`: Catalog statistics including pricing and enrollment data

## Setup

### 1. Create Integration Record

```sql
INSERT INTO Integration (Name, Description, NavigationBaseURL, ClassName)
VALUES ('LearnWorlds', 'LearnWorlds LMS Integration', 
        'https://api.learnworlds.com', 'LearnWorldsIntegration');
```

### 2. Configure CompanyIntegration

```sql
INSERT INTO CompanyIntegration (CompanyID, IntegrationID, ExternalSystemID, IsActive)
VALUES (@CompanyID, @LearnWorldsIntegrationID, @SchoolDomain, 1);
-- ExternalSystemID: Your LearnWorlds school domain (e.g., 'myschool.learnworlds.com')
```

### 3. Set Environment Variables

```bash
# LearnWorlds API credentials
BIZAPPS_LEARNWORLDS_[COMPANY_ID]_API_KEY=your_api_key
BIZAPPS_LEARNWORLDS_[COMPANY_ID]_SCHOOL_DOMAIN=myschool.learnworlds.com

# Example for company ID "12345"
BIZAPPS_LEARNWORLDS_12345_API_KEY=lw_api_xxxxxxxxxxxxx
BIZAPPS_LEARNWORLDS_12345_SCHOOL_DOMAIN=myschool.learnworlds.com
```

## Usage Examples

### Get All Active Students
```typescript
import { GetLearnWorldsUsersAction } from '@memberjunction/actions-bizapps-lms';

const action = new GetLearnWorldsUsersAction();
const result = await action.RunAction({
    Params: [
        { Name: 'CompanyID', Value: 'company-123' },
        { Name: 'Role', Value: 'student' },
        { Name: 'Status', Value: 'active' },
        { Name: 'IncludeCourseStats', Value: true },
        { Name: 'SortBy', Value: 'last_login' },
        { Name: 'SortOrder', Value: 'desc' }
    ],
    ContextUser: currentUser
});

if (result.Success) {
    const users = result.Params.find(p => p.Name === 'Users')?.Value;
    const summary = result.Params.find(p => p.Name === 'Summary')?.Value;
    console.log(`Found ${users.length} active students`);
    console.log(`Average courses per student: ${summary.averageCoursesPerUser}`);
}
```

### Get User Learning Progress
```typescript
import { GetLearnWorldsUserProgressAction } from '@memberjunction/actions-bizapps-lms';

const action = new GetLearnWorldsUserProgressAction();
const result = await action.RunAction({
    Params: [
        { Name: 'CompanyID', Value: 'company-123' },
        { Name: 'UserID', Value: 'user-456' },
        { Name: 'IncludeUnitDetails', Value: true }
    ],
    ContextUser: currentUser
});

if (result.Success) {
    const progress = result.Params.find(p => p.Name === 'UserProgress')?.Value;
    console.log(`User has completed ${progress.coursesCompleted} of ${progress.totalCourses} courses`);
    console.log(`Overall progress: ${progress.overallProgressPercentage}%`);
}
```

### Search Course Catalog
```typescript
import { GetLearnWorldsCoursesAction } from '@memberjunction/actions-bizapps-lms';

const action = new GetLearnWorldsCoursesAction();
const result = await action.RunAction({
    Params: [
        { Name: 'CompanyID', Value: 'company-123' },
        { Name: 'SearchText', Value: 'JavaScript' },
        { Name: 'Status', Value: 'published' },
        { Name: 'Level', Value: 'beginner' },
        { Name: 'MaxPrice', Value: 100 }
    ],
    ContextUser: currentUser
});

if (result.Success) {
    const courses = result.Params.find(p => p.Name === 'Courses')?.Value;
    courses.forEach(course => {
        console.log(`${course.title} - $${course.price} (${course.totalEnrollments} students)`);
    });
}
```

## Common Data Models

### LMS User
```typescript
interface LMSUser {
    id: string;
    email: string;
    username: string;
    firstName?: string;
    lastName?: string;
    status: 'active' | 'inactive' | 'suspended';
    role: string;
    createdAt: Date;
    lastLoginAt?: Date;
    totalCourses?: number;
    completedCourses?: number;
    totalTimeSpent?: number;
}
```

### Course Progress
```typescript
interface CourseProgress {
    courseId: string;
    courseTitle: string;
    enrolledAt: Date;
    progressPercentage: number;
    completedUnits: number;
    totalUnits: number;
    totalTimeSpent: number;
    status: 'not_started' | 'in_progress' | 'completed' | 'expired';
    certificateEarned: boolean;
}
```

### Course
```typescript
interface LMSCourse {
    id: string;
    title: string;
    description?: string;
    status: 'published' | 'draft' | 'coming_soon';
    price?: number;
    currency?: string;
    level?: 'beginner' | 'intermediate' | 'advanced' | 'all';
    duration?: number;
    totalEnrollments: number;
    averageRating?: number;
    instructorName?: string;
}
```

## Planned Actions

### Coming Soon
- **GetCourseDetailsAction** - Detailed course information with curriculum
- **EnrollUserAction** - Enroll users in courses
- **GetUserEnrollmentsAction** - Get all enrollments for a user
- **GetCourseAnalyticsAction** - Course performance analytics
- **CreateUserAction** - Create new LMS users
- **UpdateUserProgressAction** - Update user progress manually
- **GetCertificatesAction** - Retrieve earned certificates
- **GetQuizResultsAction** - Get quiz/assessment results

## Development

### Adding New Providers

1. Create provider directory: `src/providers/[provider-name]/`
2. Extend `BaseLMSAction` with provider-specific base class
3. Implement authentication mechanism
4. Add pagination support for list endpoints
5. Map provider data to common LMS models
6. Implement core actions (users, courses, progress)
7. Add comprehensive error handling
8. Write unit tests
9. Update documentation

### Testing

```bash
# Run tests
npm test

# Build package
npm run build

# Watch mode
npm run watch
```

## Best Practices

1. **Pagination**: Always implement pagination for list endpoints
2. **Rate Limiting**: Respect provider API limits
3. **Data Mapping**: Consistently map to common models
4. **Error Messages**: Provide clear, actionable error messages
5. **Progress Tracking**: Calculate progress percentages consistently
6. **Time Formatting**: Use consistent duration formatting

## License

ISC