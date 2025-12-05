-- =============================================
-- MemberJunction Demo: Recruiting Pipeline
-- HR Schema
-- =============================================
-- This schema supports a complete recruiting pipeline including:
-- - Job requisition management
-- - Candidate tracking
-- - Application processing with AI evaluation
-- - Audio prescreening integration
-- - Interview management and feedback
-- =============================================

-- Create HR schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'HR')
BEGIN
    EXEC('CREATE SCHEMA HR')
END
GO

-- =============================================
-- Table: HR.JobRequisition
-- Represents job openings/positions to be filled
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.JobRequisition') AND type in (N'U'))
BEGIN
    CREATE TABLE HR.JobRequisition (
        ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        Title NVARCHAR(255) NOT NULL,
        Description NVARCHAR(MAX) NOT NULL,
        Department NVARCHAR(100) NULL,
        RequiredSkills NVARCHAR(MAX) NULL, -- JSON array
        PreferredSkills NVARCHAR(MAX) NULL, -- JSON array
        MinimumYearsExperience INT NULL,
        SalaryRangeMin DECIMAL(18,2) NULL,
        SalaryRangeMax DECIMAL(18,2) NULL,
        Location NVARCHAR(200) NULL,
        EmploymentType NVARCHAR(50) NOT NULL DEFAULT 'Full-Time',
        Status NVARCHAR(50) NOT NULL DEFAULT 'Draft',
        TypeformID NVARCHAR(255) NULL,
        TypeformMonitorEnabled BIT NOT NULL DEFAULT 0,
        TypeformCheckFrequencyMinutes INT NULL DEFAULT 15,
        EvaluationRubric NVARCHAR(MAX) NULL, -- JSON object with evaluation criteria
        BaselinePassingScore DECIMAL(5,2) NULL DEFAULT 70.0,
        HiringManagerEmail NVARCHAR(255) NULL,
        OpenedDate DATETIME NULL,
        ClosedDate DATETIME NULL,
        __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CK_JobRequisition_Status CHECK (Status IN ('Draft', 'Open', 'Paused', 'Filled', 'Closed', 'Canceled')),
        CONSTRAINT CK_JobRequisition_EmploymentType CHECK (EmploymentType IN ('Full-Time', 'Part-Time', 'Contract', 'Temporary', 'Internship'))
    )

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Job requisitions/openings to be filled',
        @level0type = N'SCHEMA', @level0name = 'HR',
        @level1type = N'TABLE', @level1name = 'JobRequisition'

    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'ID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Job title', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'Title'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Detailed job description', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'Description'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Department or team', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'Department'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Required skills as JSON array', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'RequiredSkills'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Preferred/nice-to-have skills as JSON array', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'PreferredSkills'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Minimum years of experience required', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'MinimumYearsExperience'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Minimum salary range', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'SalaryRangeMin'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Maximum salary range', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'SalaryRangeMax'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Job location', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'Location'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Employment type', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'EmploymentType'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current status of the requisition', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'Status'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'TypeForm form ID for application collection', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'TypeformID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether to monitor TypeForm for new submissions', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'TypeformMonitorEnabled'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How often to check TypeForm for new submissions (in minutes)', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'TypeformCheckFrequencyMinutes'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Evaluation criteria as JSON object', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'EvaluationRubric'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Minimum score required to pass initial screening', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'BaselinePassingScore'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Email of hiring manager for notifications', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'JobRequisition', @level2type = N'COLUMN', @level2name = 'HiringManagerEmail'
END
GO

-- =============================================
-- Table: HR.Candidate
-- Represents individual candidates (people applying)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.Candidate') AND type in (N'U'))
BEGIN
    CREATE TABLE HR.Candidate (
        ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        FullName NVARCHAR(255) NOT NULL,
        Email NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(50) NULL,
        ResumeURL NVARCHAR(1000) NULL,
        LinkedInProfile NVARCHAR(500) NULL,
        CurrentTitle NVARCHAR(255) NULL,
        CurrentCompany NVARCHAR(255) NULL,
        YearsExperience INT NULL,
        SkillsList NVARCHAR(MAX) NULL, -- JSON array
        Notes NVARCHAR(MAX) NULL,
        __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_Candidate_Email UNIQUE (Email)
    )

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Individual candidates (people applying for positions)',
        @level0type = N'SCHEMA', @level0name = 'HR',
        @level1type = N'TABLE', @level1name = 'Candidate'

    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'ID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Full name', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'FullName'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Email address (unique)', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'Email'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Phone number', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'Phone'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to resume document', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'ResumeURL'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'LinkedIn profile URL', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'LinkedInProfile'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current job title', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'CurrentTitle'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current employer', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'CurrentCompany'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Total years of experience', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'YearsExperience'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'List of skills as JSON array', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'SkillsList'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Additional notes about the candidate', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Candidate', @level2type = N'COLUMN', @level2name = 'Notes'
END
GO

-- =============================================
-- Table: HR.Application
-- Represents a candidate's application to a specific job
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.Application') AND type in (N'U'))
BEGIN
    CREATE TABLE HR.Application (
        ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        JobRequisitionID UNIQUEIDENTIFIER NOT NULL,
        CandidateID UNIQUEIDENTIFIER NOT NULL,
        TypeformResponseID NVARCHAR(255) NULL,
        SubmittedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CurrentStage NVARCHAR(50) NOT NULL DEFAULT 'Application',
        Status NVARCHAR(50) NOT NULL DEFAULT 'New',

        -- Resume Evaluation Fields
        ResumeEvaluationScore DECIMAL(5,2) NULL,
        ResumeEvaluationReasoning NVARCHAR(MAX) NULL,
        ResumeEvaluationDimensions NVARCHAR(MAX) NULL, -- JSON object
        PassedResumeScreening BIT NULL,

        -- Audio Prescreening Fields
        AudioAgentSessionID NVARCHAR(255) NULL,
        AudioAgentSessionURL NVARCHAR(1000) NULL,
        AudioRecordingURL NVARCHAR(1000) NULL,
        AudioTranscriptURL NVARCHAR(1000) NULL,
        AudioEvaluationScore DECIMAL(5,2) NULL,
        AudioEvaluationReasoning NVARCHAR(MAX) NULL,
        AudioEvaluationDimensions NVARCHAR(MAX) NULL, -- JSON object
        PassedAudioScreening BIT NULL,

        -- Interview Fields
        InterviewSchedulingLink NVARCHAR(1000) NULL,

        -- Final Decision
        FinalDecision NVARCHAR(50) NULL,
        FinalDecisionDate DATETIME NULL,
        FinalDecisionNotes NVARCHAR(MAX) NULL,

        __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_Application_JobRequisition FOREIGN KEY (JobRequisitionID) REFERENCES HR.JobRequisition(ID),
        CONSTRAINT FK_Application_Candidate FOREIGN KEY (CandidateID) REFERENCES HR.Candidate(ID),
        CONSTRAINT UQ_Application_TypeformResponse UNIQUE (TypeformResponseID),
        CONSTRAINT CK_Application_CurrentStage CHECK (CurrentStage IN ('Application', 'ResumeScreening', 'AudioScreening', 'PreliminaryInterview', 'TechnicalInterview', 'FinalInterview', 'Offer', 'Closed')),
        CONSTRAINT CK_Application_Status CHECK (Status IN ('New', 'Screening', 'AudioScheduled', 'AudioCompleted', 'InterviewScheduled', 'InterviewCompleted', 'OfferExtended', 'OfferAccepted', 'Rejected', 'Withdrawn')),
        CONSTRAINT CK_Application_FinalDecision CHECK (FinalDecision IS NULL OR FinalDecision IN ('Hire', 'Reject', 'Hold', 'Withdrawn'))
    )

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Candidate applications to job requisitions',
        @level0type = N'SCHEMA', @level0name = 'HR',
        @level1type = N'TABLE', @level1name = 'Application'

    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'ID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Job requisition being applied to', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'JobRequisitionID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Candidate submitting the application', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'CandidateID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'TypeForm response ID for deduplication', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'TypeformResponseID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the application was submitted', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'SubmittedAt'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current pipeline stage', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'CurrentStage'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current application status', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'Status'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'AI evaluation score for resume (0-100)', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'ResumeEvaluationScore'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'AI reasoning for resume evaluation', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'ResumeEvaluationReasoning'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Resume evaluation dimensions as JSON', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'ResumeEvaluationDimensions'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether candidate passed resume screening', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'PassedResumeScreening'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Audio agent session identifier', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'AudioAgentSessionID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL for candidate to access audio agent', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'AudioAgentSessionURL'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to audio recording file', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'AudioRecordingURL'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to audio transcript file', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'AudioTranscriptURL'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'AI evaluation score for audio screening (0-100)', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'AudioEvaluationScore'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'AI reasoning for audio evaluation', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'AudioEvaluationReasoning'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Audio evaluation dimensions as JSON', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'AudioEvaluationDimensions'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether candidate passed audio screening', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'PassedAudioScreening'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Link for candidate to schedule interview', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'InterviewSchedulingLink'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Final hiring decision', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'FinalDecision'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date of final decision', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'FinalDecisionDate'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Notes about final decision', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Application', @level2type = N'COLUMN', @level2name = 'FinalDecisionNotes'

    -- Create indexes for foreign keys
    CREATE INDEX IX_Application_JobRequisitionID ON HR.Application(JobRequisitionID)
    CREATE INDEX IX_Application_CandidateID ON HR.Application(CandidateID)
    CREATE INDEX IX_Application_Status ON HR.Application(Status)
    CREATE INDEX IX_Application_CurrentStage ON HR.Application(CurrentStage)
END
GO

-- =============================================
-- Table: HR.Interview
-- Represents individual interview sessions
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.Interview') AND type in (N'U'))
BEGIN
    CREATE TABLE HR.Interview (
        ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        ApplicationID UNIQUEIDENTIFIER NOT NULL,
        InterviewType NVARCHAR(50) NOT NULL,
        ScheduledDateTime DATETIME NULL,
        CompletedDateTime DATETIME NULL,
        InterviewerEmails NVARCHAR(MAX) NULL, -- JSON array
        Status NVARCHAR(50) NOT NULL DEFAULT 'Scheduled',
        FeedbackScore INT NULL,
        FeedbackNotes NVARCHAR(MAX) NULL,
        Recommendation NVARCHAR(50) NULL,
        NextSteps NVARCHAR(MAX) NULL,
        __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_Interview_Application FOREIGN KEY (ApplicationID) REFERENCES HR.Application(ID),
        CONSTRAINT CK_Interview_Type CHECK (InterviewType IN ('Phone', 'Preliminary', 'Technical', 'Behavioral', 'Panel', 'Final', 'Other')),
        CONSTRAINT CK_Interview_Status CHECK (Status IN ('Scheduled', 'Completed', 'Canceled', 'NoShow', 'Rescheduled')),
        CONSTRAINT CK_Interview_Recommendation CHECK (Recommendation IS NULL OR Recommendation IN ('StrongYes', 'Yes', 'Maybe', 'No', 'StrongNo')),
        CONSTRAINT CK_Interview_FeedbackScore CHECK (FeedbackScore IS NULL OR (FeedbackScore >= 1 AND FeedbackScore <= 5))
    )

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Individual interview sessions for applications',
        @level0type = N'SCHEMA', @level0name = 'HR',
        @level1type = N'TABLE', @level1name = 'Interview'

    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'ID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Application being interviewed', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'ApplicationID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Type of interview', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'InterviewType'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When interview is scheduled', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'ScheduledDateTime'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When interview was completed', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'CompletedDateTime'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Interviewers as JSON array of emails', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'InterviewerEmails'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current interview status', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'Status'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Overall interview score (1-5)', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'FeedbackScore'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Interview feedback notes', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'FeedbackNotes'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Interviewer recommendation', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'Recommendation'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Suggested next steps', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'Interview', @level2type = N'COLUMN', @level2name = 'NextSteps'

    -- Create index for foreign key
    CREATE INDEX IX_Interview_ApplicationID ON HR.Interview(ApplicationID)
    CREATE INDEX IX_Interview_Status ON HR.Interview(Status)
END
GO

-- =============================================
-- Table: HR.ApplicationNote
-- Tracks notes and activity on applications
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.ApplicationNote') AND type in (N'U'))
BEGIN
    CREATE TABLE HR.ApplicationNote (
        ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        ApplicationID UNIQUEIDENTIFIER NOT NULL,
        NoteText NVARCHAR(MAX) NOT NULL,
        NoteType NVARCHAR(50) NOT NULL DEFAULT 'General',
        CreatedByUserID UNIQUEIDENTIFIER NULL,
        IsSystemGenerated BIT NOT NULL DEFAULT 0,
        __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_ApplicationNote_Application FOREIGN KEY (ApplicationID) REFERENCES HR.Application(ID),
        CONSTRAINT CK_ApplicationNote_Type CHECK (NoteType IN ('General', 'ResumeEvaluation', 'AudioEvaluation', 'InterviewFeedback', 'StatusChange', 'Communication', 'System'))
    )

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Notes and activity tracking for applications',
        @level0type = N'SCHEMA', @level0name = 'HR',
        @level1type = N'TABLE', @level1name = 'ApplicationNote'

    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'ApplicationNote', @level2type = N'COLUMN', @level2name = 'ID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Application the note is for', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'ApplicationNote', @level2type = N'COLUMN', @level2name = 'ApplicationID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Note content', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'ApplicationNote', @level2type = N'COLUMN', @level2name = 'NoteText'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Type/category of note', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'ApplicationNote', @level2type = N'COLUMN', @level2name = 'NoteType'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'User who created the note', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'ApplicationNote', @level2type = N'COLUMN', @level2name = 'CreatedByUserID'
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether note was created by system/automation', @level0type = N'SCHEMA', @level0name = 'HR', @level1type = N'TABLE', @level1name = 'ApplicationNote', @level2type = N'COLUMN', @level2name = 'IsSystemGenerated'

    -- Create index for foreign key
    CREATE INDEX IX_ApplicationNote_ApplicationID ON HR.ApplicationNote(ApplicationID)
END
GO

PRINT 'HR Schema created successfully'
GO
