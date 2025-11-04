/******************************************************************************
 * Association Sample Database - Learning Schema Tables
 * File: V004__learning_tables.sql
 *
 * Creates learning management system (LMS) tables including:
 * - Course: Educational courses and certifications
 * - Enrollment: Member course enrollments and progress
 * - Certificate: Completion certificates
 ******************************************************************************/

-- ============================================================================
-- Course Table
-- ============================================================================
CREATE TABLE [learning].[Course] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Code] NVARCHAR(50) NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [Category] NVARCHAR(100),
    [Level] NVARCHAR(20) NOT NULL CHECK ([Level] IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
    [DurationHours] DECIMAL(5,2),
    [CEUCredits] DECIMAL(4,2),
    [Price] DECIMAL(10,2),
    [MemberPrice] DECIMAL(10,2),
    [IsActive] BIT NOT NULL DEFAULT 1,
    [PublishedDate] DATE,
    [InstructorName] NVARCHAR(255),
    [PrerequisiteCourseID] UNIQUEIDENTIFIER,
    [ThumbnailURL] NVARCHAR(500),
    [LearningObjectives] NVARCHAR(MAX),
    CONSTRAINT FK_Course_Prerequisite FOREIGN KEY ([PrerequisiteCourseID])
        REFERENCES [learning].[Course]([ID])
);
GO

-- Create unique index on course code
CREATE UNIQUE INDEX IX_Course_Code ON [learning].[Course]([Code]);
GO

-- Create indexes for common queries
CREATE INDEX IX_Course_Category ON [learning].[Course]([Category]);
CREATE INDEX IX_Course_Level ON [learning].[Course]([Level]);
GO

-- Extended properties for Course
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Educational courses and certification programs offered by the association',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique course code',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Code';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course title',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Title';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course difficulty level: Beginner, Intermediate, Advanced, or Expert',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Level';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Estimated duration in hours',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'DurationHours';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Continuing Education Unit credits awarded',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'CEUCredits';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Standard price for non-members',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Price';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Discounted price for members',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'MemberPrice';
GO

-- ============================================================================
-- Enrollment Table
-- ============================================================================
CREATE TABLE [learning].[Enrollment] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CourseID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [EnrollmentDate] DATETIME NOT NULL,
    [StartDate] DATETIME,
    [CompletionDate] DATETIME,
    [ExpirationDate] DATETIME,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Enrolled', 'In Progress', 'Completed', 'Failed', 'Withdrawn', 'Expired')),
    [ProgressPercentage] INT DEFAULT 0 CHECK ([ProgressPercentage] BETWEEN 0 AND 100),
    [LastAccessedDate] DATETIME,
    [TimeSpentMinutes] INT DEFAULT 0,
    [FinalScore] DECIMAL(5,2),
    [PassingScore] DECIMAL(5,2) DEFAULT 70.00,
    [Passed] BIT,
    [InvoiceID] UNIQUEIDENTIFIER,
    CONSTRAINT FK_Enrollment_Course FOREIGN KEY ([CourseID])
        REFERENCES [learning].[Course]([ID]),
    CONSTRAINT FK_Enrollment_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Enrollment_Course ON [learning].[Enrollment]([CourseID]);
CREATE INDEX IX_Enrollment_Member ON [learning].[Enrollment]([MemberID]);
CREATE INDEX IX_Enrollment_Status ON [learning].[Enrollment]([Status]);
GO

-- Extended properties for Enrollment
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member course enrollments and progress tracking',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course being taken',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'CourseID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member taking the course',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member enrolled',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'EnrollmentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Enrollment status: Enrolled, In Progress, Completed, Failed, Withdrawn, or Expired',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course completion progress (0-100%)',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'ProgressPercentage';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Final exam or assessment score',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'FinalScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether the member passed the course',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'Passed';
GO

-- ============================================================================
-- Certificate Table
-- ============================================================================
CREATE TABLE [learning].[Certificate] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EnrollmentID] UNIQUEIDENTIFIER NOT NULL,
    [CertificateNumber] NVARCHAR(50) NOT NULL,
    [IssuedDate] DATE NOT NULL,
    [ExpirationDate] DATE,
    [CertificatePDFURL] NVARCHAR(500),
    [VerificationCode] NVARCHAR(100),
    CONSTRAINT FK_Certificate_Enrollment FOREIGN KEY ([EnrollmentID])
        REFERENCES [learning].[Enrollment]([ID])
);
GO

-- Create unique indexes
CREATE UNIQUE INDEX IX_Certificate_Number ON [learning].[Certificate]([CertificateNumber]);
CREATE UNIQUE INDEX IX_Certificate_VerificationCode ON [learning].[Certificate]([VerificationCode]);
GO

-- Create index for enrollment lookups
CREATE INDEX IX_Certificate_Enrollment ON [learning].[Certificate]([EnrollmentID]);
GO

-- Extended properties for Certificate
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Completion certificates issued to members',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course enrollment this certificate is for',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'EnrollmentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique certificate number',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'CertificateNumber';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date certificate was issued',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'IssuedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'URL to downloadable PDF certificate',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'CertificatePDFURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique verification code for authenticity checking',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'VerificationCode';
GO

PRINT 'Learning schema tables created successfully!';
PRINT 'Tables: Course, Enrollment, Certificate';
GO
