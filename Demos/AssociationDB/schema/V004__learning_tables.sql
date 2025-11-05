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

PRINT 'Learning schema tables created successfully!';
PRINT 'Tables: Course, Enrollment, Certificate';
GO
