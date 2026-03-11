-- ============================================================================
-- SAMPLE LMS (Learning Management System) MIGRATION - T-SQL
-- ============================================================================
-- Third full-stack validation of the unified sql-convert toolchain.
--
-- Constructs exercised (different emphasis from prior HR / eCommerce tests):
--   1. Self-referencing FK  (CourseCategory.ParentCategoryID)
--   2. Circular FK          (Enrollment.CertificateID -> Certificate;
--                            Certificate.StudentID+CourseID relate back)
--   3. Seven CHECK constraints covering IN-lists, BETWEEN, and > 0
--   4. UNIQUE constraints   (Email x2, Slug, CertificateNumber)
--   5. Nullable DATETIME    (PublishedAt, CompletedAt, ExpiresAt)
--   6. Default string values ('Beginner', 'Active')
--   7. DECIMAL precision variants (6,1), (8,2), (5,2)
--   8. Mixed VARCHAR / NVARCHAR columns
--   9. INT and SMALLINT mix
--  10. N-string literals in INSERTs
--  11. sp_addextendedproperty on ALL tables and key columns
--  12. 5 views with JOINs, aggregation, CASE, sub-queries
-- ============================================================================

-- =============================================
-- SCHEMA
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_lms')
    EXEC('CREATE SCHEMA sample_lms');
GO

-- =============================================
-- TABLES
-- =============================================

-- 1. Instructor
CREATE TABLE sample_lms.Instructor (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    Bio NVARCHAR(MAX) NULL,
    Specialization NVARCHAR(200) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    HireDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Instructor PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Instructor_Email UNIQUE (Email)
);
GO

-- 2. CourseCategory (self-referencing FK)
CREATE TABLE sample_lms.CourseCategory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(150) NOT NULL,
    Description NVARCHAR(500) NULL,
    ParentCategoryID UNIQUEIDENTIFIER NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_CourseCategory PRIMARY KEY CLUSTERED (ID)
);
GO

-- 3. Course
CREATE TABLE sample_lms.Course (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Title NVARCHAR(300) NOT NULL,
    Slug VARCHAR(300) NOT NULL,
    Description NVARCHAR(MAX) NOT NULL,
    InstructorID UNIQUEIDENTIFIER NOT NULL,
    CategoryID UNIQUEIDENTIFIER NOT NULL,
    DurationHours DECIMAL(6,1) NOT NULL,
    DifficultyLevel VARCHAR(20) NOT NULL DEFAULT 'Beginner',
    MaxEnrollment INT NULL,
    Price DECIMAL(8,2) NOT NULL DEFAULT 0,
    IsPublished BIT NOT NULL DEFAULT 0,
    PublishedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Course PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Course_Slug UNIQUE (Slug)
);
GO

-- 4. Module
CREATE TABLE sample_lms.Module (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CourseID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(300) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    DurationMinutes INT NOT NULL DEFAULT 0,
    IsRequired BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Module PRIMARY KEY CLUSTERED (ID)
);
GO

-- 5. Lesson
CREATE TABLE sample_lms.Lesson (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ModuleID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(300) NOT NULL,
    ContentType VARCHAR(20) NOT NULL,
    ContentURL NVARCHAR(500) NULL,
    ContentBody NVARCHAR(MAX) NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    DurationMinutes INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_Lesson PRIMARY KEY CLUSTERED (ID)
);
GO

-- 6. Student
CREATE TABLE sample_lms.Student (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    DateOfBirth DATE NULL,
    RegistrationDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    IsActive BIT NOT NULL DEFAULT 1,
    ProfileImageURL NVARCHAR(500) NULL,
    CONSTRAINT PK_Student PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Student_Email UNIQUE (Email)
);
GO

-- 7. Certificate (must be created before Enrollment due to Enrollment.CertificateID FK)
CREATE TABLE sample_lms.Certificate (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    StudentID UNIQUEIDENTIFIER NOT NULL,
    CourseID UNIQUEIDENTIFIER NOT NULL,
    CertificateNumber VARCHAR(50) NOT NULL,
    IssuedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    ExpiresAt DATETIME NULL,
    GradeAwarded VARCHAR(5) NULL,
    CONSTRAINT PK_Certificate PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Certificate_Number UNIQUE (CertificateNumber)
);
GO

-- 8. Enrollment (circular FK: references Certificate; Certificate references Student+Course)
CREATE TABLE sample_lms.Enrollment (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    StudentID UNIQUEIDENTIFIER NOT NULL,
    CourseID UNIQUEIDENTIFIER NOT NULL,
    EnrolledAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CompletedAt DATETIME NULL,
    ProgressPercent DECIMAL(5,2) NOT NULL DEFAULT 0,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    Grade VARCHAR(5) NULL,
    CertificateID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_Enrollment PRIMARY KEY CLUSTERED (ID)
);
GO

-- 9. Quiz
CREATE TABLE sample_lms.Quiz (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ModuleID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(300) NOT NULL,
    PassingScore DECIMAL(5,2) NOT NULL DEFAULT 70.00,
    TimeLimitMinutes INT NULL,
    MaxAttempts SMALLINT NOT NULL DEFAULT 3,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Quiz PRIMARY KEY CLUSTERED (ID)
);
GO

-- 10. QuizAttempt
CREATE TABLE sample_lms.QuizAttempt (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    QuizID UNIQUEIDENTIFIER NOT NULL,
    StudentID UNIQUEIDENTIFIER NOT NULL,
    AttemptNumber SMALLINT NOT NULL DEFAULT 1,
    Score DECIMAL(5,2) NOT NULL,
    StartedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CompletedAt DATETIME NULL,
    IsPassed BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_QuizAttempt PRIMARY KEY CLUSTERED (ID)
);
GO

-- 11. LessonProgress
CREATE TABLE sample_lms.LessonProgress (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    StudentID UNIQUEIDENTIFIER NOT NULL,
    LessonID UNIQUEIDENTIFIER NOT NULL,
    StartedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CompletedAt DATETIME NULL,
    TimeSpentMinutes INT NOT NULL DEFAULT 0,
    IsCompleted BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_LessonProgress PRIMARY KEY CLUSTERED (ID)
);
GO

-- =============================================
-- CHECK CONSTRAINTS
-- =============================================
ALTER TABLE sample_lms.Course
    ADD CONSTRAINT CK_Course_DifficultyLevel
    CHECK (DifficultyLevel IN ('Beginner', 'Intermediate', 'Advanced', 'Expert'));
GO

ALTER TABLE sample_lms.Lesson
    ADD CONSTRAINT CK_Lesson_ContentType
    CHECK (ContentType IN ('Video', 'Text', 'Quiz', 'Assignment', 'Download'));
GO

ALTER TABLE sample_lms.Enrollment
    ADD CONSTRAINT CK_Enrollment_Status
    CHECK (Status IN ('Active', 'Completed', 'Dropped', 'Suspended'));
GO

ALTER TABLE sample_lms.Enrollment
    ADD CONSTRAINT CK_Enrollment_ProgressPercent
    CHECK (ProgressPercent BETWEEN 0 AND 100);
GO

ALTER TABLE sample_lms.QuizAttempt
    ADD CONSTRAINT CK_QuizAttempt_Score
    CHECK (Score BETWEEN 0 AND 100);
GO

ALTER TABLE sample_lms.QuizAttempt
    ADD CONSTRAINT CK_QuizAttempt_AttemptNumber
    CHECK (AttemptNumber > 0);
GO

ALTER TABLE sample_lms.Quiz
    ADD CONSTRAINT CK_Quiz_PassingScore
    CHECK (PassingScore BETWEEN 0 AND 100);
GO

-- =============================================
-- FOREIGN KEY CONSTRAINTS
-- =============================================

-- Self-referencing FK on CourseCategory
ALTER TABLE sample_lms.CourseCategory
    ADD CONSTRAINT FK_CourseCategory_Parent
    FOREIGN KEY (ParentCategoryID) REFERENCES sample_lms.CourseCategory(ID);
GO

-- Course FKs
ALTER TABLE sample_lms.Course
    ADD CONSTRAINT FK_Course_Instructor
    FOREIGN KEY (InstructorID) REFERENCES sample_lms.Instructor(ID);
GO

ALTER TABLE sample_lms.Course
    ADD CONSTRAINT FK_Course_Category
    FOREIGN KEY (CategoryID) REFERENCES sample_lms.CourseCategory(ID);
GO

-- Module FK
ALTER TABLE sample_lms.Module
    ADD CONSTRAINT FK_Module_Course
    FOREIGN KEY (CourseID) REFERENCES sample_lms.Course(ID);
GO

-- Lesson FK
ALTER TABLE sample_lms.Lesson
    ADD CONSTRAINT FK_Lesson_Module
    FOREIGN KEY (ModuleID) REFERENCES sample_lms.Module(ID);
GO

-- Certificate FKs
ALTER TABLE sample_lms.Certificate
    ADD CONSTRAINT FK_Certificate_Student
    FOREIGN KEY (StudentID) REFERENCES sample_lms.Student(ID);
GO

ALTER TABLE sample_lms.Certificate
    ADD CONSTRAINT FK_Certificate_Course
    FOREIGN KEY (CourseID) REFERENCES sample_lms.Course(ID);
GO

-- Enrollment FKs (includes circular reference to Certificate)
ALTER TABLE sample_lms.Enrollment
    ADD CONSTRAINT FK_Enrollment_Student
    FOREIGN KEY (StudentID) REFERENCES sample_lms.Student(ID);
GO

ALTER TABLE sample_lms.Enrollment
    ADD CONSTRAINT FK_Enrollment_Course
    FOREIGN KEY (CourseID) REFERENCES sample_lms.Course(ID);
GO

ALTER TABLE sample_lms.Enrollment
    ADD CONSTRAINT FK_Enrollment_Certificate
    FOREIGN KEY (CertificateID) REFERENCES sample_lms.Certificate(ID);
GO

-- Quiz FK
ALTER TABLE sample_lms.Quiz
    ADD CONSTRAINT FK_Quiz_Module
    FOREIGN KEY (ModuleID) REFERENCES sample_lms.Module(ID);
GO

-- QuizAttempt FKs
ALTER TABLE sample_lms.QuizAttempt
    ADD CONSTRAINT FK_QuizAttempt_Quiz
    FOREIGN KEY (QuizID) REFERENCES sample_lms.Quiz(ID);
GO

ALTER TABLE sample_lms.QuizAttempt
    ADD CONSTRAINT FK_QuizAttempt_Student
    FOREIGN KEY (StudentID) REFERENCES sample_lms.Student(ID);
GO

-- LessonProgress FKs
ALTER TABLE sample_lms.LessonProgress
    ADD CONSTRAINT FK_LessonProgress_Student
    FOREIGN KEY (StudentID) REFERENCES sample_lms.Student(ID);
GO

ALTER TABLE sample_lms.LessonProgress
    ADD CONSTRAINT FK_LessonProgress_Lesson
    FOREIGN KEY (LessonID) REFERENCES sample_lms.Lesson(ID);
GO

-- =============================================
-- INDEXES
-- =============================================
CREATE NONCLUSTERED INDEX IX_CourseCategory_ParentCategoryID ON sample_lms.CourseCategory(ParentCategoryID);
GO
CREATE NONCLUSTERED INDEX IX_Course_InstructorID ON sample_lms.Course(InstructorID);
GO
CREATE NONCLUSTERED INDEX IX_Course_CategoryID ON sample_lms.Course(CategoryID);
GO
CREATE NONCLUSTERED INDEX IX_Module_CourseID ON sample_lms.Module(CourseID);
GO
CREATE NONCLUSTERED INDEX IX_Lesson_ModuleID ON sample_lms.Lesson(ModuleID);
GO
CREATE NONCLUSTERED INDEX IX_Certificate_StudentID ON sample_lms.Certificate(StudentID);
GO
CREATE NONCLUSTERED INDEX IX_Certificate_CourseID ON sample_lms.Certificate(CourseID);
GO
CREATE NONCLUSTERED INDEX IX_Enrollment_StudentID ON sample_lms.Enrollment(StudentID);
GO
CREATE NONCLUSTERED INDEX IX_Enrollment_CourseID ON sample_lms.Enrollment(CourseID);
GO
CREATE NONCLUSTERED INDEX IX_Enrollment_CertificateID ON sample_lms.Enrollment(CertificateID);
GO
CREATE NONCLUSTERED INDEX IX_Quiz_ModuleID ON sample_lms.Quiz(ModuleID);
GO
CREATE NONCLUSTERED INDEX IX_QuizAttempt_QuizID ON sample_lms.QuizAttempt(QuizID);
GO
CREATE NONCLUSTERED INDEX IX_QuizAttempt_StudentID ON sample_lms.QuizAttempt(StudentID);
GO
CREATE NONCLUSTERED INDEX IX_LessonProgress_StudentID ON sample_lms.LessonProgress(StudentID);
GO
CREATE NONCLUSTERED INDEX IX_LessonProgress_LessonID ON sample_lms.LessonProgress(LessonID);
GO

-- =============================================
-- VIEWS
-- =============================================

-- vwCourseOverview: course with instructor name, category, enrollment count, avg quiz score
CREATE VIEW sample_lms.vwCourseOverview AS
SELECT
    c.ID AS CourseID,
    c.Title AS CourseTitle,
    c.Slug,
    c.DifficultyLevel,
    c.DurationHours,
    c.Price,
    c.IsPublished,
    i.FirstName + N' ' + i.LastName AS InstructorName,
    cc.Name AS CategoryName,
    ISNULL(enr.EnrollmentCount, 0) AS EnrollmentCount,
    enr.AvgQuizScore
FROM sample_lms.Course c
INNER JOIN sample_lms.Instructor i ON i.ID = c.InstructorID
INNER JOIN sample_lms.CourseCategory cc ON cc.ID = c.CategoryID
LEFT JOIN (
    SELECT
        e.CourseID,
        COUNT(*) AS EnrollmentCount,
        AVG(qa.Score) AS AvgQuizScore
    FROM sample_lms.Enrollment e
    LEFT JOIN sample_lms.Module m ON m.CourseID = e.CourseID
    LEFT JOIN sample_lms.Quiz q ON q.ModuleID = m.ID
    LEFT JOIN sample_lms.QuizAttempt qa ON qa.QuizID = q.ID AND qa.StudentID = e.StudentID
    GROUP BY e.CourseID
) enr ON enr.CourseID = c.ID;
GO

-- vwStudentProgress: student enrollment progress with course title, completion %
CREATE VIEW sample_lms.vwStudentProgress AS
SELECT
    s.ID AS StudentID,
    s.FirstName + N' ' + s.LastName AS StudentName,
    s.Email,
    c.Title AS CourseTitle,
    e.EnrolledAt,
    e.CompletedAt,
    e.ProgressPercent,
    e.Status,
    e.Grade,
    CASE
        WHEN e.Status = 'Completed' THEN N'Finished'
        WHEN e.ProgressPercent >= 75 THEN N'Almost Done'
        WHEN e.ProgressPercent >= 25 THEN N'In Progress'
        ELSE N'Just Started'
    END AS ProgressLabel
FROM sample_lms.Student s
INNER JOIN sample_lms.Enrollment e ON e.StudentID = s.ID
INNER JOIN sample_lms.Course c ON c.ID = e.CourseID;
GO

-- vwPopularCourses: courses ordered by enrollment count with avg completion rate
CREATE VIEW sample_lms.vwPopularCourses AS
SELECT
    c.ID AS CourseID,
    c.Title,
    c.DifficultyLevel,
    c.Price,
    COUNT(e.ID) AS TotalEnrollments,
    AVG(e.ProgressPercent) AS AvgProgress,
    SUM(CASE WHEN e.Status = 'Completed' THEN 1 ELSE 0 END) AS CompletedCount,
    CASE
        WHEN COUNT(e.ID) > 0
        THEN CAST(SUM(CASE WHEN e.Status = 'Completed' THEN 1 ELSE 0 END) AS DECIMAL(5,2))
             / CAST(COUNT(e.ID) AS DECIMAL(5,2)) * 100
        ELSE 0
    END AS CompletionRate
FROM sample_lms.Course c
LEFT JOIN sample_lms.Enrollment e ON e.CourseID = c.ID
GROUP BY c.ID, c.Title, c.DifficultyLevel, c.Price;
GO

-- vwQuizResults: quiz attempts with student name, course title, pass/fail, score
CREATE VIEW sample_lms.vwQuizResults AS
SELECT
    qa.ID AS AttemptID,
    s.FirstName + N' ' + s.LastName AS StudentName,
    c.Title AS CourseTitle,
    m.Title AS ModuleTitle,
    qz.Title AS QuizTitle,
    qa.AttemptNumber,
    qa.Score,
    qz.PassingScore,
    qa.IsPassed,
    qa.StartedAt,
    qa.CompletedAt,
    CASE WHEN qa.IsPassed = 1 THEN N'Pass' ELSE N'Fail' END AS Result
FROM sample_lms.QuizAttempt qa
INNER JOIN sample_lms.Quiz qz ON qz.ID = qa.QuizID
INNER JOIN sample_lms.Module m ON m.ID = qz.ModuleID
INNER JOIN sample_lms.Course c ON c.ID = m.CourseID
INNER JOIN sample_lms.Student s ON s.ID = qa.StudentID;
GO

-- vwInstructorDashboard: instructor with course count, total students, avg quiz scores
CREATE VIEW sample_lms.vwInstructorDashboard AS
SELECT
    i.ID AS InstructorID,
    i.FirstName + N' ' + i.LastName AS InstructorName,
    i.Email,
    i.Specialization,
    COUNT(DISTINCT c.ID) AS CourseCount,
    COUNT(DISTINCT e.StudentID) AS TotalStudents,
    AVG(qa.Score) AS AvgQuizScore,
    SUM(CASE WHEN e.Status = 'Completed' THEN 1 ELSE 0 END) AS CompletedEnrollments
FROM sample_lms.Instructor i
LEFT JOIN sample_lms.Course c ON c.InstructorID = i.ID
LEFT JOIN sample_lms.Enrollment e ON e.CourseID = c.ID
LEFT JOIN sample_lms.Module m ON m.CourseID = c.ID
LEFT JOIN sample_lms.Quiz qz ON qz.ModuleID = m.ID
LEFT JOIN sample_lms.QuizAttempt qa ON qa.QuizID = qz.ID
GROUP BY i.ID, i.FirstName, i.LastName, i.Email, i.Specialization;
GO

-- =============================================
-- EXTENDED PROPERTIES (sp_addextendedproperty)
-- =============================================

-- Instructor
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Instructors who teach courses on the platform', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Instructor';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique email address for instructor login', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Instructor', @level2type=N'COLUMN', @level2name=N'Email';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Long-form biography of the instructor', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Instructor', @level2type=N'COLUMN', @level2name=N'Bio';
GO

-- CourseCategory
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Hierarchical course categories with self-referencing parent', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'CourseCategory';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional parent category for hierarchy', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'CourseCategory', @level2type=N'COLUMN', @level2name=N'ParentCategoryID';
GO

-- Course
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Courses offered on the learning platform', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Course';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'URL-friendly slug for the course', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Course', @level2type=N'COLUMN', @level2name=N'Slug';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total course duration in hours', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Course', @level2type=N'COLUMN', @level2name=N'DurationHours';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Difficulty level: Beginner, Intermediate, Advanced, Expert', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Course', @level2type=N'COLUMN', @level2name=N'DifficultyLevel';
GO

-- Module
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Course modules grouping related lessons', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Module';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the module must be completed', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Module', @level2type=N'COLUMN', @level2name=N'IsRequired';
GO

-- Lesson
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Individual lessons within a module', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Lesson';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Type of content: Video, Text, Quiz, Assignment, Download', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Lesson', @level2type=N'COLUMN', @level2name=N'ContentType';
GO

-- Student
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Students enrolled in the learning platform', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Student';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique email for student account', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Student', @level2type=N'COLUMN', @level2name=N'Email';
GO

-- Certificate
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Certificates awarded upon course completion', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Certificate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Globally unique certificate identifier', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Certificate', @level2type=N'COLUMN', @level2name=N'CertificateNumber';
GO

-- Enrollment
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Student enrollments in courses', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Enrollment';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current enrollment status: Active, Completed, Dropped, Suspended', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Enrollment', @level2type=N'COLUMN', @level2name=N'Status';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Completion percentage from 0 to 100', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Enrollment', @level2type=N'COLUMN', @level2name=N'ProgressPercent';
GO

-- Quiz
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Quizzes within course modules', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Quiz';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Minimum score needed to pass the quiz', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'Quiz', @level2type=N'COLUMN', @level2name=N'PassingScore';
GO

-- QuizAttempt
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Individual quiz attempt records', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'QuizAttempt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Score achieved on this attempt (0-100)', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'QuizAttempt', @level2type=N'COLUMN', @level2name=N'Score';
GO

-- LessonProgress
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tracks individual lesson completion per student', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'LessonProgress';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Minutes spent on this lesson', @level0type=N'SCHEMA', @level0name=N'sample_lms', @level1type=N'TABLE', @level1name=N'LessonProgress', @level2type=N'COLUMN', @level2name=N'TimeSpentMinutes';
GO

-- =============================================
-- SECURITY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'lms_reader' AND type = 'R')
    CREATE ROLE lms_reader;
GO

GRANT SELECT ON SCHEMA::sample_lms TO lms_reader;
GO

-- =============================================
-- SAMPLE DATA
-- =============================================

-- Instructors (4)
INSERT INTO sample_lms.Instructor (ID, FirstName, LastName, Email, Bio, Specialization, IsActive, HireDate) VALUES
('A0000001-0001-0001-0001-000000000001', N'Elena', N'Rodriguez', N'elena.rodriguez@lms.example.com', N'Full-stack developer with 15 years of experience in web technologies.', N'Web Development', 1, '2020-03-15'),
('A0000001-0001-0001-0001-000000000002', N'Marcus', N'Chen', N'marcus.chen@lms.example.com', N'Data scientist specializing in machine learning and statistical analysis.', N'Data Science', 1, '2019-08-01'),
('A0000001-0001-0001-0001-000000000003', N'Sarah', N'Thompson', N'sarah.thompson@lms.example.com', N'UX designer and researcher with a passion for accessible design.', N'UX Design', 1, '2021-01-10'),
('A0000001-0001-0001-0001-000000000004', N'James', N'Okafor', N'james.okafor@lms.example.com', NULL, N'Cloud Computing', 0, '2018-06-20');
GO

-- CourseCategories (5 with hierarchy)
INSERT INTO sample_lms.CourseCategory (ID, Name, Description, ParentCategoryID, SortOrder) VALUES
('B0000001-0001-0001-0001-000000000001', N'Technology', N'All technology-related courses', NULL, 1),
('B0000001-0001-0001-0001-000000000002', N'Design', N'Creative and design courses', NULL, 2),
('B0000001-0001-0001-0001-000000000003', N'Programming', N'Software development and coding', 'B0000001-0001-0001-0001-000000000001', 1),
('B0000001-0001-0001-0001-000000000004', N'Data & AI', N'Data science and artificial intelligence', 'B0000001-0001-0001-0001-000000000001', 2),
('B0000001-0001-0001-0001-000000000005', N'UI/UX', N'User interface and experience design', 'B0000001-0001-0001-0001-000000000002', 1);
GO

-- Courses (8)
INSERT INTO sample_lms.Course (ID, Title, Slug, Description, InstructorID, CategoryID, DurationHours, DifficultyLevel, MaxEnrollment, Price, IsPublished, PublishedAt, CreatedAt, UpdatedAt) VALUES
('C0000001-0001-0001-0001-000000000001', N'Introduction to HTML & CSS', 'intro-html-css', N'Learn the building blocks of the web.', 'A0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000003', 24.5, 'Beginner', 200, 29.99, 1, '2023-01-15', '2022-12-01', '2023-01-15'),
('C0000001-0001-0001-0001-000000000002', N'Advanced JavaScript Patterns', 'advanced-js-patterns', N'Master design patterns and advanced concepts in JavaScript.', 'A0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000003', 36.0, 'Advanced', 100, 79.99, 1, '2023-03-01', '2023-02-01', '2023-03-01'),
('C0000001-0001-0001-0001-000000000003', N'Python for Data Science', 'python-data-science', N'From basics to pandas, numpy, and visualization.', 'A0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000004', 40.0, 'Intermediate', 150, 59.99, 1, '2023-02-20', '2023-01-10', '2023-02-20'),
('C0000001-0001-0001-0001-000000000004', N'Machine Learning Fundamentals', 'ml-fundamentals', N'Supervised and unsupervised learning with scikit-learn.', 'A0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000004', 48.0, 'Advanced', 80, 99.99, 1, '2023-05-01', '2023-04-01', '2023-05-01'),
('C0000001-0001-0001-0001-000000000005', N'UX Research Methods', 'ux-research-methods', N'Learn qualitative and quantitative UX research techniques.', 'A0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 20.0, 'Beginner', NULL, 39.99, 1, '2023-04-01', '2023-03-15', '2023-04-01'),
('C0000001-0001-0001-0001-000000000006', N'Design Systems at Scale', 'design-systems-scale', N'Building and maintaining design systems for large organizations.', 'A0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 30.0, 'Expert', 50, 129.99, 1, '2023-06-15', '2023-05-20', '2023-06-15'),
('C0000001-0001-0001-0001-000000000007', N'Cloud Architecture with AWS', 'cloud-architecture-aws', N'Design scalable and resilient cloud solutions.', 'A0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000001', 52.0, 'Expert', 60, 149.99, 0, NULL, '2023-07-01', '2023-07-01'),
('C0000001-0001-0001-0001-000000000008', N'Responsive Web Design', 'responsive-web-design', N'Mobile-first design principles and CSS frameworks.', 'A0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000003', 18.5, 'Intermediate', 180, 34.99, 1, '2023-08-01', '2023-07-15', '2023-08-01');
GO

-- Modules (2-3 per course, 18 total)
INSERT INTO sample_lms.Module (ID, CourseID, Title, Description, SortOrder, DurationMinutes, IsRequired) VALUES
-- Intro HTML/CSS modules
('D0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', N'HTML Basics', N'Learn HTML tags, structure, and semantics.', 1, 480, 1),
('D0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000001', N'CSS Fundamentals', N'Styling, layout, and responsive basics.', 2, 600, 1),
('D0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000001', N'Bonus: CSS Animations', N'Optional module on transitions and keyframes.', 3, 180, 0),
-- Advanced JS modules
('D0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000002', N'Closures & Scope', N'Deep dive into JavaScript scoping rules.', 1, 360, 1),
('D0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000002', N'Design Patterns', N'Singleton, observer, factory, and more.', 2, 540, 1),
-- Python Data Science modules
('D0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000003', N'Python Refresher', N'Quick refresher on Python fundamentals.', 1, 300, 1),
('D0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000003', N'Pandas & NumPy', N'Data manipulation and numerical computing.', 2, 600, 1),
('D0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000003', N'Data Visualization', N'Matplotlib, Seaborn, and Plotly.', 3, 420, 1),
-- ML Fundamentals modules
('D0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000004', N'Supervised Learning', N'Regression and classification algorithms.', 1, 720, 1),
('D0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000004', N'Unsupervised Learning', N'Clustering and dimensionality reduction.', 2, 600, 1),
-- UX Research modules
('D0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000005', N'Research Planning', N'How to plan and scope UX research.', 1, 360, 1),
('D0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000005', N'User Interviews', N'Conducting effective user interviews.', 2, 420, 1),
-- Design Systems modules
('D0000001-0001-0001-0001-000000000013', 'C0000001-0001-0001-0001-000000000006', N'Foundations', N'Color, typography, spacing tokens.', 1, 480, 1),
('D0000001-0001-0001-0001-000000000014', 'C0000001-0001-0001-0001-000000000006', N'Component Library', N'Building reusable UI components.', 2, 600, 1),
-- Cloud Architecture modules
('D0000001-0001-0001-0001-000000000015', 'C0000001-0001-0001-0001-000000000007', N'AWS Core Services', N'EC2, S3, RDS, Lambda overview.', 1, 720, 1),
('D0000001-0001-0001-0001-000000000016', 'C0000001-0001-0001-0001-000000000007', N'High Availability', N'Multi-AZ, auto-scaling, load balancing.', 2, 600, 1),
-- Responsive Web Design modules
('D0000001-0001-0001-0001-000000000017', 'C0000001-0001-0001-0001-000000000008', N'Mobile-First Approach', N'Designing for small screens first.', 1, 360, 1),
('D0000001-0001-0001-0001-000000000018', 'C0000001-0001-0001-0001-000000000008', N'CSS Frameworks', N'Bootstrap, Tailwind, and beyond.', 2, 420, 1);
GO

-- Lessons (2-3 per module, 40 total)
INSERT INTO sample_lms.Lesson (ID, ModuleID, Title, ContentType, ContentURL, ContentBody, SortOrder, DurationMinutes) VALUES
-- HTML Basics lessons
('E0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', N'What is HTML?', 'Video', N'https://videos.lms.example.com/html-intro', NULL, 1, 30),
('E0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000001', N'HTML Document Structure', 'Text', NULL, N'Every HTML document starts with a DOCTYPE declaration...', 2, 20),
('E0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000001', N'HTML Tags Practice', 'Assignment', NULL, N'Create a simple HTML page with headings, paragraphs, and lists.', 3, 45),
-- CSS Fundamentals lessons
('E0000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000002', N'CSS Selectors', 'Video', N'https://videos.lms.example.com/css-selectors', NULL, 1, 35),
('E0000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000002', N'Box Model Deep Dive', 'Text', NULL, N'The CSS box model consists of content, padding, border, and margin.', 2, 25),
-- CSS Animations lessons
('E0000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000003', N'Transitions', 'Video', N'https://videos.lms.example.com/css-transitions', NULL, 1, 30),
('E0000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000003', N'Keyframe Animations', 'Video', N'https://videos.lms.example.com/css-keyframes', NULL, 2, 40),
-- Closures & Scope lessons
('E0000001-0001-0001-0001-000000000008', 'D0000001-0001-0001-0001-000000000004', N'Lexical Scope', 'Video', N'https://videos.lms.example.com/lexical-scope', NULL, 1, 25),
('E0000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000004', N'Closures in Practice', 'Text', NULL, N'A closure is a function that remembers its outer variables.', 2, 30),
-- Design Patterns lessons
('E0000001-0001-0001-0001-000000000010', 'D0000001-0001-0001-0001-000000000005', N'Singleton Pattern', 'Video', N'https://videos.lms.example.com/singleton', NULL, 1, 20),
('E0000001-0001-0001-0001-000000000011', 'D0000001-0001-0001-0001-000000000005', N'Observer Pattern', 'Video', N'https://videos.lms.example.com/observer', NULL, 2, 25),
('E0000001-0001-0001-0001-000000000012', 'D0000001-0001-0001-0001-000000000005', N'Patterns Quiz', 'Quiz', NULL, NULL, 3, 15),
-- Python Refresher lessons
('E0000001-0001-0001-0001-000000000013', 'D0000001-0001-0001-0001-000000000006', N'Variables & Types', 'Video', N'https://videos.lms.example.com/py-variables', NULL, 1, 20),
('E0000001-0001-0001-0001-000000000014', 'D0000001-0001-0001-0001-000000000006', N'Functions & Classes', 'Text', NULL, N'Python supports both functional and object-oriented programming.', 2, 30),
-- Pandas & NumPy lessons
('E0000001-0001-0001-0001-000000000015', 'D0000001-0001-0001-0001-000000000007', N'NumPy Arrays', 'Video', N'https://videos.lms.example.com/numpy-arrays', NULL, 1, 35),
('E0000001-0001-0001-0001-000000000016', 'D0000001-0001-0001-0001-000000000007', N'Pandas DataFrames', 'Video', N'https://videos.lms.example.com/pandas-df', NULL, 2, 40),
('E0000001-0001-0001-0001-000000000017', 'D0000001-0001-0001-0001-000000000007', N'Data Wrangling Exercise', 'Assignment', NULL, N'Clean and transform a messy CSV dataset using pandas.', 3, 60),
-- Data Visualization lessons
('E0000001-0001-0001-0001-000000000018', 'D0000001-0001-0001-0001-000000000008', N'Matplotlib Basics', 'Video', N'https://videos.lms.example.com/matplotlib', NULL, 1, 30),
('E0000001-0001-0001-0001-000000000019', 'D0000001-0001-0001-0001-000000000008', N'Interactive Plots with Plotly', 'Video', N'https://videos.lms.example.com/plotly', NULL, 2, 35),
-- Supervised Learning lessons
('E0000001-0001-0001-0001-000000000020', 'D0000001-0001-0001-0001-000000000009', N'Linear Regression', 'Video', N'https://videos.lms.example.com/linear-reg', NULL, 1, 40),
('E0000001-0001-0001-0001-000000000021', 'D0000001-0001-0001-0001-000000000009', N'Decision Trees', 'Video', N'https://videos.lms.example.com/decision-trees', NULL, 2, 35),
('E0000001-0001-0001-0001-000000000022', 'D0000001-0001-0001-0001-000000000009', N'Model Evaluation', 'Assignment', NULL, N'Train and evaluate models on the Iris dataset.', 3, 60),
-- Unsupervised Learning lessons
('E0000001-0001-0001-0001-000000000023', 'D0000001-0001-0001-0001-000000000010', N'K-Means Clustering', 'Video', N'https://videos.lms.example.com/kmeans', NULL, 1, 30),
('E0000001-0001-0001-0001-000000000024', 'D0000001-0001-0001-0001-000000000010', N'PCA', 'Text', NULL, N'Principal Component Analysis reduces dimensionality while preserving variance.', 2, 25),
-- Research Planning lessons
('E0000001-0001-0001-0001-000000000025', 'D0000001-0001-0001-0001-000000000011', N'Defining Research Questions', 'Video', N'https://videos.lms.example.com/research-questions', NULL, 1, 25),
('E0000001-0001-0001-0001-000000000026', 'D0000001-0001-0001-0001-000000000011', N'Research Plan Template', 'Download', N'https://files.lms.example.com/research-template.pdf', NULL, 2, 10),
-- User Interviews lessons
('E0000001-0001-0001-0001-000000000027', 'D0000001-0001-0001-0001-000000000012', N'Interview Techniques', 'Video', N'https://videos.lms.example.com/interview-tech', NULL, 1, 35),
('E0000001-0001-0001-0001-000000000028', 'D0000001-0001-0001-0001-000000000012', N'Synthesis & Analysis', 'Text', NULL, N'After interviews, synthesize findings into themes and insights.', 2, 30),
-- Foundations lessons
('E0000001-0001-0001-0001-000000000029', 'D0000001-0001-0001-0001-000000000013', N'Design Tokens', 'Video', N'https://videos.lms.example.com/design-tokens', NULL, 1, 30),
('E0000001-0001-0001-0001-000000000030', 'D0000001-0001-0001-0001-000000000013', N'Typography Scale', 'Text', NULL, N'A consistent type scale ensures visual harmony across your product.', 2, 20),
-- Component Library lessons
('E0000001-0001-0001-0001-000000000031', 'D0000001-0001-0001-0001-000000000014', N'Button Components', 'Video', N'https://videos.lms.example.com/button-components', NULL, 1, 35),
('E0000001-0001-0001-0001-000000000032', 'D0000001-0001-0001-0001-000000000014', N'Form Components', 'Video', N'https://videos.lms.example.com/form-components', NULL, 2, 40),
-- AWS Core Services lessons
('E0000001-0001-0001-0001-000000000033', 'D0000001-0001-0001-0001-000000000015', N'EC2 & S3', 'Video', N'https://videos.lms.example.com/ec2-s3', NULL, 1, 45),
('E0000001-0001-0001-0001-000000000034', 'D0000001-0001-0001-0001-000000000015', N'Lambda & API Gateway', 'Video', N'https://videos.lms.example.com/lambda-apigw', NULL, 2, 40),
-- High Availability lessons
('E0000001-0001-0001-0001-000000000035', 'D0000001-0001-0001-0001-000000000016', N'Multi-AZ Architecture', 'Video', N'https://videos.lms.example.com/multi-az', NULL, 1, 35),
('E0000001-0001-0001-0001-000000000036', 'D0000001-0001-0001-0001-000000000016', N'Auto Scaling Groups', 'Text', NULL, N'Auto Scaling automatically adjusts capacity to maintain performance.', 2, 25),
-- Mobile-First lessons
('E0000001-0001-0001-0001-000000000037', 'D0000001-0001-0001-0001-000000000017', N'Viewport & Media Queries', 'Video', N'https://videos.lms.example.com/viewport', NULL, 1, 30),
('E0000001-0001-0001-0001-000000000038', 'D0000001-0001-0001-0001-000000000017', N'Fluid Typography', 'Text', NULL, N'Use clamp() and viewport units for responsive typography.', 2, 20),
-- CSS Frameworks lessons
('E0000001-0001-0001-0001-000000000039', 'D0000001-0001-0001-0001-000000000018', N'Bootstrap Grid System', 'Video', N'https://videos.lms.example.com/bootstrap-grid', NULL, 1, 30),
('E0000001-0001-0001-0001-000000000040', 'D0000001-0001-0001-0001-000000000018', N'Tailwind Utility Classes', 'Video', N'https://videos.lms.example.com/tailwind', NULL, 2, 35);
GO

-- Students (10)
INSERT INTO sample_lms.Student (ID, FirstName, LastName, Email, DateOfBirth, RegistrationDate, IsActive, ProfileImageURL) VALUES
('F0000001-0001-0001-0001-000000000001', N'Alice', N'Johnson', N'alice.johnson@students.example.com', '1995-04-12', '2023-01-05', 1, N'https://avatars.lms.example.com/alice.jpg'),
('F0000001-0001-0001-0001-000000000002', N'Bob', N'Williams', N'bob.williams@students.example.com', '1998-11-23', '2023-01-10', 1, NULL),
('F0000001-0001-0001-0001-000000000003', N'Carol', N'Martinez', N'carol.martinez@students.example.com', '2000-07-30', '2023-02-01', 1, N'https://avatars.lms.example.com/carol.jpg'),
('F0000001-0001-0001-0001-000000000004', N'David', N'Kim', N'david.kim@students.example.com', '1997-03-08', '2023-02-15', 1, NULL),
('F0000001-0001-0001-0001-000000000005', N'Eva', N'Nowak', N'eva.nowak@students.example.com', '1999-09-17', '2023-03-01', 1, N'https://avatars.lms.example.com/eva.jpg'),
('F0000001-0001-0001-0001-000000000006', N'Frank', N'Brown', N'frank.brown@students.example.com', '1996-12-05', '2023-03-10', 1, NULL),
('F0000001-0001-0001-0001-000000000007', N'Grace', N'Patel', N'grace.patel@students.example.com', '2001-01-22', '2023-04-01', 1, N'https://avatars.lms.example.com/grace.jpg'),
('F0000001-0001-0001-0001-000000000008', N'Henry', N'Liu', N'henry.liu@students.example.com', '1994-06-14', '2023-04-15', 0, NULL),
('F0000001-0001-0001-0001-000000000009', N'Iris', N'Anderson', N'iris.anderson@students.example.com', NULL, '2023-05-01', 1, NULL),
('F0000001-0001-0001-0001-000000000010', N'Jack', N'Garcia', N'jack.garcia@students.example.com', '2002-08-09', '2023-05-15', 1, N'https://avatars.lms.example.com/jack.jpg');
GO

-- Certificates (5 - created before enrollments that reference them)
INSERT INTO sample_lms.Certificate (ID, StudentID, CourseID, CertificateNumber, IssuedAt, ExpiresAt, GradeAwarded) VALUES
('BB000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'CERT-LMS-2023-0001', '2023-06-15', '2025-06-15', 'A'),
('BB000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000001', 'CERT-LMS-2023-0002', '2023-07-01', '2025-07-01', 'B+'),
('BB000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003', 'CERT-LMS-2023-0003', '2023-08-20', NULL, 'A-'),
('BB000001-0001-0001-0001-000000000004', 'F0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000005', 'CERT-LMS-2023-0004', '2023-09-01', NULL, 'A'),
('BB000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000001', 'CERT-LMS-2023-0005', '2023-10-15', '2025-10-15', 'B');
GO

-- Enrollments (18 - includes references to certificates for completed ones)
INSERT INTO sample_lms.Enrollment (ID, StudentID, CourseID, EnrolledAt, CompletedAt, ProgressPercent, Status, Grade, CertificateID) VALUES
-- Alice: completed HTML/CSS (has cert), completed UX Research (has cert), active in Advanced JS
('AA000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', '2023-01-20', '2023-06-15', 100.00, 'Completed', 'A', 'BB000001-0001-0001-0001-000000000001'),
('AA000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000005', '2023-06-20', '2023-09-01', 100.00, 'Completed', 'A', 'BB000001-0001-0001-0001-000000000004'),
('AA000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000002', '2023-09-15', NULL, 65.50, 'Active', NULL, NULL),
-- Bob: completed HTML/CSS (has cert), active in Python
('AA000001-0001-0001-0001-000000000004', 'F0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000001', '2023-02-01', '2023-07-01', 100.00, 'Completed', 'B+', 'BB000001-0001-0001-0001-000000000002'),
('AA000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000003', '2023-07-15', NULL, 45.00, 'Active', NULL, NULL),
-- Carol: completed Python (has cert), active in ML
('AA000001-0001-0001-0001-000000000006', 'F0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003', '2023-03-01', '2023-08-20', 100.00, 'Completed', 'A-', 'BB000001-0001-0001-0001-000000000003'),
('AA000001-0001-0001-0001-000000000007', 'F0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000004', '2023-09-01', NULL, 30.00, 'Active', NULL, NULL),
-- David: active in HTML/CSS and Python
('AA000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000001', '2023-03-15', NULL, 80.00, 'Active', NULL, NULL),
('AA000001-0001-0001-0001-000000000009', 'F0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000003', '2023-05-01', NULL, 55.25, 'Active', NULL, NULL),
-- Eva: completed HTML/CSS (has cert), dropped Advanced JS
('AA000001-0001-0001-0001-000000000010', 'F0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000001', '2023-04-01', '2023-10-15', 100.00, 'Completed', 'B', 'BB000001-0001-0001-0001-000000000005'),
('AA000001-0001-0001-0001-000000000011', 'F0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000002', '2023-10-20', NULL, 15.00, 'Dropped', NULL, NULL),
-- Frank: active in Design Systems and Responsive Web
('AA000001-0001-0001-0001-000000000012', 'F0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000006', '2023-07-01', NULL, 40.00, 'Active', NULL, NULL),
('AA000001-0001-0001-0001-000000000013', 'F0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000008', '2023-08-15', NULL, 70.00, 'Active', NULL, NULL),
-- Grace: active in UX Research
('AA000001-0001-0001-0001-000000000014', 'F0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000005', '2023-05-01', NULL, 50.00, 'Active', NULL, NULL),
-- Henry: suspended in ML
('AA000001-0001-0001-0001-000000000015', 'F0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000004', '2023-06-01', NULL, 10.00, 'Suspended', NULL, NULL),
-- Iris: active in HTML/CSS and Responsive Web
('AA000001-0001-0001-0001-000000000016', 'F0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000001', '2023-06-01', NULL, 25.00, 'Active', NULL, NULL),
('AA000001-0001-0001-0001-000000000017', 'F0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000008', '2023-08-01', NULL, 60.00, 'Active', NULL, NULL),
-- Jack: active in Python
('AA000001-0001-0001-0001-000000000018', 'F0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000003', '2023-06-15', NULL, 35.75, 'Active', NULL, NULL);
GO

-- Quizzes (8 - one per required module for some courses)
INSERT INTO sample_lms.Quiz (ID, ModuleID, Title, PassingScore, TimeLimitMinutes, MaxAttempts, IsActive) VALUES
('CC000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', N'HTML Basics Quiz', 60.00, 30, 3, 1),
('CC000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000002', N'CSS Fundamentals Quiz', 70.00, 45, 3, 1),
('CC000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000004', N'Closures & Scope Quiz', 75.00, 30, 2, 1),
('CC000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000005', N'Design Patterns Quiz', 80.00, 60, 2, 1),
('CC000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000007', N'Pandas & NumPy Quiz', 70.00, 45, 3, 1),
('CC000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000009', N'Supervised Learning Quiz', 75.00, 60, 2, 1),
('CC000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000011', N'Research Planning Quiz', 65.00, 20, 3, 1),
('CC000001-0001-0001-0001-000000000008', 'D0000001-0001-0001-0001-000000000017', N'Mobile-First Quiz', 70.00, 30, 3, 1);
GO

-- QuizAttempts (20+)
INSERT INTO sample_lms.QuizAttempt (ID, QuizID, StudentID, AttemptNumber, Score, StartedAt, CompletedAt, IsPassed) VALUES
-- Alice on HTML quiz
('DD000001-0001-0001-0001-000000000001', 'CC000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000001', 1, 85.00, '2023-03-01 10:00:00', '2023-03-01 10:25:00', 1),
-- Alice on CSS quiz
('DD000001-0001-0001-0001-000000000002', 'CC000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', 1, 65.00, '2023-04-15 14:00:00', '2023-04-15 14:40:00', 0),
('DD000001-0001-0001-0001-000000000003', 'CC000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', 2, 90.00, '2023-04-20 09:00:00', '2023-04-20 09:35:00', 1),
-- Alice on Closures quiz
('DD000001-0001-0001-0001-000000000004', 'CC000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000001', 1, 72.50, '2023-11-01 11:00:00', '2023-11-01 11:28:00', 0),
-- Bob on HTML quiz
('DD000001-0001-0001-0001-000000000005', 'CC000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000002', 1, 78.00, '2023-03-15 10:00:00', '2023-03-15 10:20:00', 1),
-- Bob on CSS quiz
('DD000001-0001-0001-0001-000000000006', 'CC000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000002', 1, 82.50, '2023-05-01 14:00:00', '2023-05-01 14:30:00', 1),
-- Bob on Pandas quiz
('DD000001-0001-0001-0001-000000000007', 'CC000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000002', 1, 55.00, '2023-09-01 10:00:00', '2023-09-01 10:40:00', 0),
('DD000001-0001-0001-0001-000000000008', 'CC000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000002', 2, 71.00, '2023-09-10 10:00:00', '2023-09-10 10:35:00', 1),
-- Carol on Pandas quiz
('DD000001-0001-0001-0001-000000000009', 'CC000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000003', 1, 92.00, '2023-06-15 09:00:00', '2023-06-15 09:30:00', 1),
-- Carol on Supervised Learning quiz
('DD000001-0001-0001-0001-000000000010', 'CC000001-0001-0001-0001-000000000006', 'F0000001-0001-0001-0001-000000000003', 1, 68.00, '2023-10-01 14:00:00', '2023-10-01 14:55:00', 0),
-- David on HTML quiz
('DD000001-0001-0001-0001-000000000011', 'CC000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000004', 1, 45.00, '2023-05-01 10:00:00', '2023-05-01 10:25:00', 0),
('DD000001-0001-0001-0001-000000000012', 'CC000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000004', 2, 88.00, '2023-05-10 10:00:00', '2023-05-10 10:20:00', 1),
-- David on Pandas quiz
('DD000001-0001-0001-0001-000000000013', 'CC000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000004', 1, 60.00, '2023-08-01 14:00:00', '2023-08-01 14:40:00', 0),
-- Eva on HTML quiz
('DD000001-0001-0001-0001-000000000014', 'CC000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000005', 1, 95.00, '2023-06-01 10:00:00', '2023-06-01 10:15:00', 1),
-- Eva on CSS quiz
('DD000001-0001-0001-0001-000000000015', 'CC000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000005', 1, 88.00, '2023-07-15 14:00:00', '2023-07-15 14:30:00', 1),
-- Grace on Research Planning quiz
('DD000001-0001-0001-0001-000000000016', 'CC000001-0001-0001-0001-000000000007', 'F0000001-0001-0001-0001-000000000007', 1, 58.00, '2023-07-01 09:00:00', '2023-07-01 09:18:00', 0),
('DD000001-0001-0001-0001-000000000017', 'CC000001-0001-0001-0001-000000000007', 'F0000001-0001-0001-0001-000000000007', 2, 80.00, '2023-07-10 09:00:00', '2023-07-10 09:15:00', 1),
-- Iris on HTML quiz
('DD000001-0001-0001-0001-000000000018', 'CC000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000009', 1, 52.00, '2023-07-15 10:00:00', '2023-07-15 10:28:00', 0),
-- Iris on Mobile-First quiz
('DD000001-0001-0001-0001-000000000019', 'CC000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000009', 1, 76.00, '2023-09-15 14:00:00', '2023-09-15 14:25:00', 1),
-- Jack on Pandas quiz
('DD000001-0001-0001-0001-000000000020', 'CC000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000010', 1, 48.00, '2023-08-15 10:00:00', '2023-08-15 10:42:00', 0),
('DD000001-0001-0001-0001-000000000021', 'CC000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000010', 2, 73.00, '2023-08-25 10:00:00', '2023-08-25 10:38:00', 1);
GO

-- LessonProgress (25+ records)
INSERT INTO sample_lms.LessonProgress (ID, StudentID, LessonID, StartedAt, CompletedAt, TimeSpentMinutes, IsCompleted) VALUES
-- Alice progress in HTML Basics
('EE000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000001', '2023-01-25 09:00:00', '2023-01-25 09:32:00', 32, 1),
('EE000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000002', '2023-01-26 09:00:00', '2023-01-26 09:22:00', 22, 1),
('EE000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000003', '2023-01-27 09:00:00', '2023-01-27 09:50:00', 50, 1),
-- Alice progress in CSS Fundamentals
('EE000001-0001-0001-0001-000000000004', 'F0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000004', '2023-02-01 10:00:00', '2023-02-01 10:38:00', 38, 1),
('EE000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000005', '2023-02-02 10:00:00', '2023-02-02 10:28:00', 28, 1),
-- Bob progress in HTML Basics
('EE000001-0001-0001-0001-000000000006', 'F0000001-0001-0001-0001-000000000002', 'E0000001-0001-0001-0001-000000000001', '2023-02-05 11:00:00', '2023-02-05 11:35:00', 35, 1),
('EE000001-0001-0001-0001-000000000007', 'F0000001-0001-0001-0001-000000000002', 'E0000001-0001-0001-0001-000000000002', '2023-02-06 11:00:00', '2023-02-06 11:25:00', 25, 1),
-- Bob progress in Python Refresher
('EE000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000002', 'E0000001-0001-0001-0001-000000000013', '2023-08-01 10:00:00', '2023-08-01 10:22:00', 22, 1),
('EE000001-0001-0001-0001-000000000009', 'F0000001-0001-0001-0001-000000000002', 'E0000001-0001-0001-0001-000000000014', '2023-08-02 10:00:00', '2023-08-02 10:35:00', 35, 1),
-- Carol progress in Pandas & NumPy
('EE000001-0001-0001-0001-000000000010', 'F0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000015', '2023-05-01 09:00:00', '2023-05-01 09:40:00', 40, 1),
('EE000001-0001-0001-0001-000000000011', 'F0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000016', '2023-05-02 09:00:00', '2023-05-02 09:45:00', 45, 1),
('EE000001-0001-0001-0001-000000000012', 'F0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000017', '2023-05-03 09:00:00', '2023-05-03 10:05:00', 65, 1),
-- Carol progress in Supervised Learning (partial)
('EE000001-0001-0001-0001-000000000013', 'F0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000020', '2023-09-10 14:00:00', '2023-09-10 14:42:00', 42, 1),
('EE000001-0001-0001-0001-000000000014', 'F0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000021', '2023-09-15 14:00:00', NULL, 20, 0),
-- David progress in HTML Basics
('EE000001-0001-0001-0001-000000000015', 'F0000001-0001-0001-0001-000000000004', 'E0000001-0001-0001-0001-000000000001', '2023-04-01 10:00:00', '2023-04-01 10:30:00', 30, 1),
('EE000001-0001-0001-0001-000000000016', 'F0000001-0001-0001-0001-000000000004', 'E0000001-0001-0001-0001-000000000002', '2023-04-02 10:00:00', '2023-04-02 10:20:00', 20, 1),
-- Eva progress in HTML & CSS
('EE000001-0001-0001-0001-000000000017', 'F0000001-0001-0001-0001-000000000005', 'E0000001-0001-0001-0001-000000000001', '2023-04-15 11:00:00', '2023-04-15 11:28:00', 28, 1),
('EE000001-0001-0001-0001-000000000018', 'F0000001-0001-0001-0001-000000000005', 'E0000001-0001-0001-0001-000000000004', '2023-05-01 11:00:00', '2023-05-01 11:38:00', 38, 1),
-- Frank progress in Design Tokens
('EE000001-0001-0001-0001-000000000019', 'F0000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000029', '2023-07-15 10:00:00', '2023-07-15 10:33:00', 33, 1),
('EE000001-0001-0001-0001-000000000020', 'F0000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000030', '2023-07-16 10:00:00', '2023-07-16 10:22:00', 22, 1),
-- Frank progress in Responsive Web
('EE000001-0001-0001-0001-000000000021', 'F0000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000037', '2023-08-20 14:00:00', '2023-08-20 14:32:00', 32, 1),
('EE000001-0001-0001-0001-000000000022', 'F0000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000038', '2023-08-21 14:00:00', '2023-08-21 14:18:00', 18, 1),
-- Grace progress in Research Planning
('EE000001-0001-0001-0001-000000000023', 'F0000001-0001-0001-0001-000000000007', 'E0000001-0001-0001-0001-000000000025', '2023-05-15 09:00:00', '2023-05-15 09:28:00', 28, 1),
('EE000001-0001-0001-0001-000000000024', 'F0000001-0001-0001-0001-000000000007', 'E0000001-0001-0001-0001-000000000026', '2023-05-16 09:00:00', '2023-05-16 09:12:00', 12, 1),
-- Iris progress in HTML (partial)
('EE000001-0001-0001-0001-000000000025', 'F0000001-0001-0001-0001-000000000009', 'E0000001-0001-0001-0001-000000000001', '2023-06-15 10:00:00', '2023-06-15 10:35:00', 35, 1),
('EE000001-0001-0001-0001-000000000026', 'F0000001-0001-0001-0001-000000000009', 'E0000001-0001-0001-0001-000000000002', '2023-06-16 10:00:00', NULL, 15, 0),
-- Jack progress in Python
('EE000001-0001-0001-0001-000000000027', 'F0000001-0001-0001-0001-000000000010', 'E0000001-0001-0001-0001-000000000013', '2023-07-01 11:00:00', '2023-07-01 11:25:00', 25, 1),
('EE000001-0001-0001-0001-000000000028', 'F0000001-0001-0001-0001-000000000010', 'E0000001-0001-0001-0001-000000000014', '2023-07-02 11:00:00', NULL, 18, 0);
GO

PRINT 'sample_lms migration completed successfully.';
GO
