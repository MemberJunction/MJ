-- Create the Events Schema
-- This schema provides comprehensive event management capabilities including abstract submissions,
-- speaker management, automated evaluation, and review workflows
-- Prerequisites: CRM Schema must be created first for Account and Contact references

-- =============================================
-- Create Schema
-- =============================================
CREATE SCHEMA Events;
GO

-- =============================================
-- Events Schema - Event & Conference Management
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Event and Conference Management Schema - Comprehensive event management system for conferences, seminars, and abstract submission workflows. Manages complete event lifecycle including conference planning, call for proposals (CFP), abstract submissions, speaker management, automated evaluation workflows, and multi-reviewer coordination. Features include hierarchical event structures (multi-day conferences), session format management, submission deadline tracking, automated scoring with configurable rubrics, review committee workflows, external form integration (Typeform), document management (Box), and notification systems. Supports complex academic and professional conference scenarios with speaker bios, co-presenter relationships, conflict of interest tracking, and detailed evaluation criteria.',
    @level0type = N'SCHEMA',
    @level0name = N'Events';
GO

-- =============================================
-- Event Table
-- =============================================
CREATE TABLE Events.Event (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ParentID UNIQUEIDENTIFIER NULL,
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX),
    ConferenceTheme NVARCHAR(500),
    TargetAudience NVARCHAR(500),
    StartDate DATETIME NOT NULL,
    EndDate DATETIME NOT NULL,
    Location NVARCHAR(200),
    Status NVARCHAR(50) NOT NULL,
    SubmissionDeadline DATETIME NOT NULL,
    NotificationDate DATETIME,
    EvaluationRubric NVARCHAR(MAX),
    BaselinePassingScore DECIMAL(5,2),
    ReviewCommitteeEmails NVARCHAR(MAX),
    TypeformID NVARCHAR(100),
    TypeformMonitorEnabled BIT DEFAULT 0,
    TypeformCheckFrequencyMinutes INT DEFAULT 60,
    BoxFolderID NVARCHAR(100),
    SessionFormats NVARCHAR(MAX),
    AccountID INT NULL,
    CONSTRAINT FK_Event_Parent FOREIGN KEY (ParentID) REFERENCES Events.Event(ID),
    CONSTRAINT FK_Event_Account FOREIGN KEY (AccountID) REFERENCES CRM.Account(ID),
    CONSTRAINT CHK_Event_Status CHECK (Status IN ('Planning', 'Open for Submissions', 'Review', 'Closed', 'Completed', 'Canceled')),
    CONSTRAINT CHK_Event_PassingScore CHECK (BaselinePassingScore >= 0 AND BaselinePassingScore <= 100)
);
GO

-- Event table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Master table for events, conferences, and call for proposals',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the event',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Parent event ID for multi-day or related events',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'ParentID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the event or conference',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full description of the event',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Main theme or focus area of the conference',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'ConferenceTheme';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of target audience and their expertise levels',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'TargetAudience';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Start date and time of the event',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'StartDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'End date and time of the event',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'EndDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Physical or virtual location of the event',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'Location';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the event (Planning, Open for Submissions, Review, Closed, Completed, Canceled)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Deadline for submitting proposals',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'SubmissionDeadline';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when speakers will be notified of acceptance/rejection',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'NotificationDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI prompt/rubric for evaluating submissions (JSON or text)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'EvaluationRubric';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Minimum score required to pass initial screening (0-100)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'BaselinePassingScore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of review committee member email addresses',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'ReviewCommitteeEmails';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Typeform form ID for submission intake',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'TypeformID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether automated Typeform monitoring is enabled',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'TypeformMonitorEnabled';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How often to check Typeform for new submissions (minutes)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'TypeformCheckFrequencyMinutes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Box.com folder ID where submission files are stored',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'BoxFolderID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of allowed session formats (Workshop, Keynote, Panel, Lightning Talk, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'SessionFormats';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to CRM Account for event organization',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Event',
    @level2type = N'COLUMN', @level2name = N'AccountID';
GO

-- =============================================
-- Speaker Table
-- =============================================
CREATE TABLE Events.Speaker (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ContactID INT NULL,
    FullName NVARCHAR(200) NOT NULL,
    Email NVARCHAR(100) NOT NULL,
    PhoneNumber NVARCHAR(20),
    Title NVARCHAR(100),
    Organization NVARCHAR(200),
    Bio NVARCHAR(MAX),
    LinkedInURL NVARCHAR(255),
    TwitterHandle NVARCHAR(50),
    WebsiteURL NVARCHAR(255),
    PhotoURL NVARCHAR(255),
    SpeakingExperience NVARCHAR(MAX),
    DossierResearchedAt DATETIME NULL,
    DossierJSON NVARCHAR(MAX),
    DossierSummary NVARCHAR(MAX),
    CredibilityScore DECIMAL(5,2),
    SpeakingHistory NVARCHAR(MAX),
    Expertise NVARCHAR(MAX),
    PublicationsCount INT DEFAULT 0,
    SocialMediaReach INT DEFAULT 0,
    RedFlags NVARCHAR(MAX),
    CONSTRAINT FK_Speaker_Contact FOREIGN KEY (ContactID) REFERENCES CRM.Contact(ID),
    CONSTRAINT CHK_Speaker_CredibilityScore CHECK (CredibilityScore >= 0 AND CredibilityScore <= 100)
);
GO

-- Speaker table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Master table for speakers and presenters, with AI-enhanced research dossiers',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the speaker',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to CRM Contact record',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'ContactID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full name of the speaker',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'FullName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary email address',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'Email';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Contact phone number',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'PhoneNumber';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Professional title or position',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'Title';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Company or organization affiliation',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'Organization';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Speaker biography as submitted',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'Bio';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'LinkedIn profile URL',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'LinkedInURL';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Twitter/X handle',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'TwitterHandle';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Personal or professional website URL',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'WebsiteURL';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to speaker headshot or profile photo',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'PhotoURL';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of previous speaking experience as submitted',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'SpeakingExperience';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when AI research was last performed on this speaker',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'DossierResearchedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Comprehensive JSON research results from web searches and social media',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'DossierJSON';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI-generated summary of speaker background and credibility',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'DossierSummary';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI-calculated credibility score based on research (0-100)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'CredibilityScore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of previous speaking engagements discovered through research',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'SpeakingHistory';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of expertise topics and domains',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'Expertise';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of publications, articles, or blog posts discovered',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'PublicationsCount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total social media followers/reach across platforms',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'SocialMediaReach';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of any concerns or red flags identified during research',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Speaker',
    @level2type = N'COLUMN', @level2name = N'RedFlags';
GO

-- =============================================
-- Submission Table
-- =============================================
CREATE TABLE Events.Submission (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EventID UNIQUEIDENTIFIER NOT NULL,
    TypeformResponseID NVARCHAR(100),
    SubmittedAt DATETIME NOT NULL DEFAULT GETDATE(),
    Status NVARCHAR(50) NOT NULL DEFAULT 'New',
    SubmissionTitle NVARCHAR(500) NOT NULL,
    SubmissionAbstract NVARCHAR(MAX) NOT NULL,
    SubmissionSummary NVARCHAR(MAX),
    SessionFormat NVARCHAR(50),
    Duration INT,
    TargetAudienceLevel NVARCHAR(50),
    KeyTopics NVARCHAR(MAX),
    PresentationFileURL NVARCHAR(500),
    PresentationFileSummary NVARCHAR(MAX),
    AdditionalMaterialsURLs NVARCHAR(MAX),
    SpecialRequirements NVARCHAR(MAX),
    AIEvaluationScore DECIMAL(5,2),
    AIEvaluationReasoning NVARCHAR(MAX),
    AIEvaluationDimensions NVARCHAR(MAX),
    PassedInitialScreening BIT DEFAULT 0,
    FailureReasons NVARCHAR(MAX),
    IsFixable BIT,
    ResubmissionOfID UNIQUEIDENTIFIER NULL,
    ReviewNotes NVARCHAR(MAX),
    FinalDecision NVARCHAR(50),
    FinalDecisionDate DATETIME,
    FinalDecisionReasoning NVARCHAR(MAX),
    CONSTRAINT FK_Submission_Event FOREIGN KEY (EventID) REFERENCES Events.Event(ID),
    CONSTRAINT FK_Submission_Resubmission FOREIGN KEY (ResubmissionOfID) REFERENCES Events.Submission(ID),
    CONSTRAINT CHK_Submission_Status CHECK (Status IN ('New', 'Analyzing', 'Passed Initial', 'Failed Initial', 'Under Review', 'Accepted', 'Rejected', 'Waitlisted', 'Resubmitted')),
    CONSTRAINT CHK_Submission_SessionFormat CHECK (SessionFormat IN ('Workshop', 'Keynote', 'Panel', 'Lightning Talk', 'Tutorial', 'Presentation', 'Roundtable', 'Other')),
    CONSTRAINT CHK_Submission_AudienceLevel CHECK (TargetAudienceLevel IN ('Beginner', 'Intermediate', 'Advanced', 'All Levels')),
    CONSTRAINT CHK_Submission_FinalDecision CHECK (FinalDecision IN (NULL, 'Accepted', 'Rejected', 'Waitlisted')),
    CONSTRAINT CHK_Submission_AIScore CHECK (AIEvaluationScore >= 0 AND AIEvaluationScore <= 100)
);
GO

-- Submission table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Abstract submissions for events with AI-powered evaluation and human review tracking',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the submission',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Event this submission is for',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'EventID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'External response ID from Typeform',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'TypeformResponseID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when submission was received',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'SubmittedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status in workflow (New, Analyzing, Passed Initial, Failed Initial, Under Review, Accepted, Rejected, Waitlisted, Resubmitted)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Title of the proposed session or talk',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'SubmissionTitle';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full abstract or proposal text as submitted',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'SubmissionAbstract';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI-generated concise summary of the abstract',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'SubmissionSummary';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Format of the proposed session (Workshop, Keynote, Panel, Lightning Talk, Tutorial, Presentation, Roundtable, Other)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'SessionFormat';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Duration in minutes',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'Duration';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Target audience expertise level (Beginner, Intermediate, Advanced, All Levels)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'TargetAudienceLevel';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of key topics extracted by AI',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'KeyTopics';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to presentation file in Box.com',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'PresentationFileURL';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI-generated summary of presentation slides/materials',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'PresentationFileSummary';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of additional material URLs',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'AdditionalMaterialsURLs';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Any special requirements (AV equipment, accessibility needs, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'SpecialRequirements';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Overall AI evaluation score (0-100)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'AIEvaluationScore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed AI explanation of evaluation and score',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'AIEvaluationReasoning';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object with scores per rubric dimension (relevance, quality, experience, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'AIEvaluationDimensions';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether submission passed baseline screening criteria',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'PassedInitialScreening';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of specific failure reasons if screening failed',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'FailureReasons';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether identified issues can be fixed via resubmission',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'IsFixable';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to original submission if this is a resubmission',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'ResubmissionOfID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Notes added by human reviewers during evaluation',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'ReviewNotes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Final decision on submission (Accepted, Rejected, Waitlisted)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'FinalDecision';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when final decision was made',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'FinalDecisionDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Explanation for final decision',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'Submission',
    @level2type = N'COLUMN', @level2name = N'FinalDecisionReasoning';
GO

-- =============================================
-- SubmissionSpeaker Junction Table
-- =============================================
CREATE TABLE Events.SubmissionSpeaker (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SubmissionID UNIQUEIDENTIFIER NOT NULL,
    SpeakerID UNIQUEIDENTIFIER NOT NULL,
    IsPrimaryContact BIT DEFAULT 0,
    Role NVARCHAR(50),
    CONSTRAINT FK_SubmissionSpeaker_Submission FOREIGN KEY (SubmissionID) REFERENCES Events.Submission(ID),
    CONSTRAINT FK_SubmissionSpeaker_Speaker FOREIGN KEY (SpeakerID) REFERENCES Events.Speaker(ID),
    CONSTRAINT CHK_SubmissionSpeaker_Role CHECK (Role IN ('Presenter', 'Co-Presenter', 'Moderator', 'Panelist'))
);
GO

-- SubmissionSpeaker table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Junction table linking submissions to speakers (many-to-many relationship)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionSpeaker';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the relationship',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionSpeaker',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the submission',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionSpeaker',
    @level2type = N'COLUMN', @level2name = N'SubmissionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the speaker',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionSpeaker',
    @level2type = N'COLUMN', @level2name = N'SpeakerID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this speaker is the primary contact for the submission',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionSpeaker',
    @level2type = N'COLUMN', @level2name = N'IsPrimaryContact';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Role of speaker in this submission (Presenter, Co-Presenter, Moderator, Panelist)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionSpeaker',
    @level2type = N'COLUMN', @level2name = N'Role';
GO

-- =============================================
-- SubmissionReview Table
-- =============================================
CREATE TABLE Events.SubmissionReview (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SubmissionID UNIQUEIDENTIFIER NOT NULL,
    ReviewerContactID INT NOT NULL,
    ReviewedAt DATETIME NOT NULL DEFAULT GETDATE(),
    OverallScore DECIMAL(3,1),
    RelevanceScore DECIMAL(3,1),
    QualityScore DECIMAL(3,1),
    SpeakerExperienceScore DECIMAL(3,1),
    Comments NVARCHAR(MAX),
    Recommendation NVARCHAR(50),
    CONSTRAINT FK_SubmissionReview_Submission FOREIGN KEY (SubmissionID) REFERENCES Events.Submission(ID),
    CONSTRAINT FK_SubmissionReview_Reviewer FOREIGN KEY (ReviewerContactID) REFERENCES CRM.Contact(ID),
    CONSTRAINT CHK_SubmissionReview_OverallScore CHECK (OverallScore >= 0 AND OverallScore <= 10),
    CONSTRAINT CHK_SubmissionReview_RelevanceScore CHECK (RelevanceScore >= 0 AND RelevanceScore <= 10),
    CONSTRAINT CHK_SubmissionReview_QualityScore CHECK (QualityScore >= 0 AND QualityScore <= 10),
    CONSTRAINT CHK_SubmissionReview_ExperienceScore CHECK (SpeakerExperienceScore >= 0 AND SpeakerExperienceScore <= 10),
    CONSTRAINT CHK_SubmissionReview_Recommendation CHECK (Recommendation IN ('Accept', 'Reject', 'Waitlist', 'Needs Discussion'))
);
GO

-- SubmissionReview table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human reviews and scoring of submissions by review committee members',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the review',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Submission being reviewed',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'SubmissionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'CRM Contact ID of the reviewer',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'ReviewerContactID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when review was submitted',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'ReviewedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Overall score from 0-10',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'OverallScore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Relevance to conference theme score (0-10)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'RelevanceScore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quality of abstract and proposed content score (0-10)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'QualityScore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Speaker experience and credibility score (0-10)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'SpeakerExperienceScore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reviewer comments and feedback',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'Comments';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reviewer recommendation (Accept, Reject, Waitlist, Needs Discussion)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionReview',
    @level2type = N'COLUMN', @level2name = N'Recommendation';
GO

-- =============================================
-- SubmissionNotification Table
-- =============================================
CREATE TABLE Events.SubmissionNotification (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SubmissionID UNIQUEIDENTIFIER NOT NULL,
    NotificationType NVARCHAR(50) NOT NULL,
    SentAt DATETIME NOT NULL DEFAULT GETDATE(),
    RecipientEmail NVARCHAR(100) NOT NULL,
    Subject NVARCHAR(500),
    MessageBody NVARCHAR(MAX),
    DeliveryStatus NVARCHAR(50) DEFAULT 'Pending',
    ClickedAt DATETIME NULL,
    CONSTRAINT FK_SubmissionNotification_Submission FOREIGN KEY (SubmissionID) REFERENCES Events.Submission(ID),
    CONSTRAINT CHK_SubmissionNotification_Type CHECK (NotificationType IN ('Initial Received', 'Failed Screening', 'Passed to Review', 'Request Resubmission', 'Accepted', 'Rejected', 'Waitlisted', 'Reminder')),
    CONSTRAINT CHK_SubmissionNotification_DeliveryStatus CHECK (DeliveryStatus IN ('Pending', 'Sent', 'Delivered', 'Bounced', 'Failed'))
);
GO

-- SubmissionNotification table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Audit trail of all notifications sent to speakers regarding their submissions',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the notification',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Submission this notification is about',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'SubmissionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of notification (Initial Received, Failed Screening, Passed to Review, Request Resubmission, Accepted, Rejected, Waitlisted, Reminder)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'NotificationType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when notification was sent',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'SentAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email address of recipient',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'RecipientEmail';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email subject line',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'Subject';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full email message body',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'MessageBody';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Delivery status from email system (Pending, Sent, Delivered, Bounced, Failed)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'DeliveryStatus';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when recipient clicked a link in the email (for engagement tracking)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'SubmissionNotification',
    @level2type = N'COLUMN', @level2name = N'ClickedAt';
GO

-- =============================================
-- EventReviewTask Table
-- =============================================
CREATE TABLE Events.EventReviewTask (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EventID UNIQUEIDENTIFIER NOT NULL,
    SubmissionID UNIQUEIDENTIFIER NOT NULL,
    AssignedToContactID INT NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
    Priority NVARCHAR(20) DEFAULT 'Normal',
    DueDate DATETIME,
    CompletedAt DATETIME NULL,
    CONSTRAINT FK_EventReviewTask_Event FOREIGN KEY (EventID) REFERENCES Events.Event(ID),
    CONSTRAINT FK_EventReviewTask_Submission FOREIGN KEY (SubmissionID) REFERENCES Events.Submission(ID),
    CONSTRAINT FK_EventReviewTask_Assignee FOREIGN KEY (AssignedToContactID) REFERENCES CRM.Contact(ID),
    CONSTRAINT CHK_EventReviewTask_Status CHECK (Status IN ('Pending', 'In Progress', 'Completed', 'Canceled')),
    CONSTRAINT CHK_EventReviewTask_Priority CHECK (Priority IN ('High', 'Normal', 'Low'))
);
GO

-- EventReviewTask table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Work queue for review committee members with task tracking',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the review task',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Event this review task is for',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask',
    @level2type = N'COLUMN', @level2name = N'EventID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Submission to be reviewed',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask',
    @level2type = N'COLUMN', @level2name = N'SubmissionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'CRM Contact ID of assigned reviewer (NULL if unassigned)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask',
    @level2type = N'COLUMN', @level2name = N'AssignedToContactID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the review task (Pending, In Progress, Completed, Canceled)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Priority level (High, Normal, Low)',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask',
    @level2type = N'COLUMN', @level2name = N'Priority';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Due date for completing the review',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask',
    @level2type = N'COLUMN', @level2name = N'DueDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when task was completed',
    @level0type = N'SCHEMA', @level0name = N'Events',
    @level1type = N'TABLE',  @level1name = N'EventReviewTask',
    @level2type = N'COLUMN', @level2name = N'CompletedAt';
GO

-- =============================================
-- Sample Data
-- =============================================

-- Insert sample events
DECLARE @Event1ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Event2ID UNIQUEIDENTIFIER = NEWID();

INSERT INTO Events.Event (ID, Name, Description, ConferenceTheme, TargetAudience, StartDate, EndDate, Location, Status, SubmissionDeadline, NotificationDate, BaselinePassingScore, TypeformID, TypeformMonitorEnabled, TypeformCheckFrequencyMinutes, SessionFormats)
VALUES
(@Event1ID, 'Tech Summit 2026', 'Annual technology conference featuring the latest innovations in software development, AI, and cloud computing', 'AI, Cloud, DevOps, and Modern Software Architecture', 'Software engineers, architects, CTOs, and technical leaders', '2026-05-15 09:00:00', '2026-05-17 17:00:00', 'San Francisco, CA', 'Open for Submissions', '2026-02-15 23:59:59', '2026-03-15 00:00:00', 65.0, 'DEMO_FORM_123', 1, 60, '["Keynote", "Workshop", "Panel", "Lightning Talk", "Tutorial"]'),
(@Event2ID, 'DevOps Days 2026', 'Community-driven conference focusing on DevOps practices, culture, and tooling', 'DevOps Culture, CI/CD, Infrastructure as Code, Observability', 'DevOps engineers, SREs, platform engineers', '2026-09-20 09:00:00', '2026-09-21 17:00:00', 'Austin, TX', 'Planning', '2026-06-30 23:59:59', '2026-07-31 00:00:00', 70.0, 'DEMO_FORM_456', 0, 120, '["Presentation", "Workshop", "Panel", "Lightning Talk"]');

-- Insert sample speakers
DECLARE @Speaker1ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Speaker2ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Speaker3ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Speaker4ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Speaker5ID UNIQUEIDENTIFIER = NEWID();

INSERT INTO Events.Speaker (ID, FullName, Email, PhoneNumber, Title, Organization, Bio, LinkedInURL, TwitterHandle, SpeakingExperience, CredibilityScore, PublicationsCount, SocialMediaReach)
VALUES
(@Speaker1ID, 'Sarah Chen', 'sarah.chen@techcorp.com', '415-555-0101', 'VP of Engineering', 'TechCorp Inc', 'Sarah is a seasoned engineering leader with 15 years of experience building scalable systems. She has led teams at major tech companies and is passionate about cloud architecture and AI/ML applications.', 'https://linkedin.com/in/sarahchen', '@sarahchen', 'Keynote speaker at CloudConf 2024, AWS re:Invent 2023, PyCon 2022. Regular speaker at local meetups and corporate events.', 92.5, 25, 15000),
(@Speaker2ID, 'Marcus Johnson', 'mjohnson@devtools.io', '512-555-0202', 'Principal Software Engineer', 'DevTools.io', 'Marcus specializes in developer experience and tooling. Creator of several popular open-source projects with over 50K GitHub stars combined. Regular contributor to tech publications.', 'https://linkedin.com/in/marcusjohnson', '@marcusj_dev', 'Speaker at GitHub Universe, JSConf EU, and various developer conferences. First-time speaker at major conferences, but extensive workshop experience.', 85.0, 40, 8500),
(@Speaker3ID, 'Dr. Aisha Patel', 'aisha@airesearch.edu', '650-555-0303', 'Research Scientist', 'Stanford AI Lab', 'Dr. Patel leads cutting-edge research in machine learning interpretability and AI ethics. Published author with numerous peer-reviewed papers in top-tier conferences.', 'https://linkedin.com/in/aishah-patel', '@drai_patel', 'Regular speaker at NeurIPS, ICML, academic conferences. New to industry conference speaking but highly regarded in academic circles.', 95.0, 60, 12000),
(@Speaker4ID, 'James Rodriguez', 'james.r@startup.com', '415-555-0404', 'CTO', 'CloudScale Startup', 'James has scaled infrastructure at three successful startups, two of which went through IPO. Expert in cloud cost optimization and infrastructure automation.', 'https://linkedin.com/in/jamesrodriguez', '@jamesrtech', 'Occasional conference speaker, mostly panel discussions. Strong technical blog following with 50K+ monthly readers.', 78.0, 15, 52000),
(@Speaker5ID, 'Emily Zhang', 'emily.zhang@consulting.com', '', 'Senior Consultant', 'Tech Consulting Group', 'Emily helps Fortune 500 companies with their digital transformation initiatives. Specializes in legacy system modernization and change management.', 'https://linkedin.com/in/emilyzhang', '', 'Some speaking experience at client events and regional conferences. Looking to expand presence in the tech community.', 65.0, 5, 1200);

-- Insert sample submissions
DECLARE @Submission1ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Submission2ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Submission3ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Submission4ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Submission5ID UNIQUEIDENTIFIER = NEWID();
DECLARE @Submission6ID UNIQUEIDENTIFIER = NEWID();

INSERT INTO Events.Submission (ID, EventID, TypeformResponseID, SubmittedAt, Status, SubmissionTitle, SubmissionAbstract, SubmissionSummary, SessionFormat, Duration, TargetAudienceLevel, KeyTopics, AIEvaluationScore, AIEvaluationReasoning, PassedInitialScreening)
VALUES
(@Submission1ID, @Event1ID, 'TF_RESP_001', '2025-12-15 14:30:00', 'Under Review',
'Building Resilient AI Systems: Lessons from Production',
'This talk explores real-world challenges of deploying AI systems at scale, covering monitoring, observability, failure modes, and recovery strategies. I will share lessons learned from running ML models serving 100M+ requests per day, including how we achieved 99.99% uptime through careful system design and operational practices. Topics include model versioning, A/B testing infrastructure, data drift detection, and incident response playbooks specifically tailored for AI systems.',
'Practical guide to production AI systems covering monitoring, failure handling, and achieving high availability at massive scale.',
'Presentation', 45, 'Intermediate', '["AI/ML", "Production Systems", "Observability", "Reliability Engineering"]',
88.5, 'Highly relevant to conference theme. Speaker has strong credentials and production experience. Abstract is well-structured with specific technical details and outcomes. Target audience clearly defined. Strong practical value.', 1),

(@Submission2ID, @Event1ID, 'TF_RESP_002', '2025-12-18 09:15:00', 'Under Review',
'Interactive Workshop: Hands-on Kubernetes Security',
'A 3-hour hands-on workshop where participants will learn to secure Kubernetes clusters from the ground up. We will cover pod security policies, network policies, RBAC, secrets management, image scanning, and runtime security. Participants will work through real attack scenarios and learn to defend against them. Requires laptop with Docker installed.',
'Comprehensive hands-on workshop teaching Kubernetes security best practices through practical exercises and attack/defense scenarios.',
'Workshop', 180, 'Intermediate', '["Kubernetes", "Security", "DevOps", "Cloud Native"]',
82.0, 'Good technical content and interactive format. Speaker background in security is solid. Workshop format adds value. Slightly concerned about 3-hour duration and setup requirements. May need to verify speaker can manage large workshop effectively.', 1),

(@Submission3ID, @Event1ID, 'TF_RESP_003', '2025-12-20 16:45:00', 'Passed Initial',
'The Future of Interpretable AI: Making Black Boxes Transparent',
'Machine learning models are increasingly making critical decisions, yet understanding how they reach conclusions remains challenging. This keynote explores the latest breakthroughs in AI interpretability, including attention mechanisms, SHAP values, counterfactual explanations, and emerging techniques from recent research. I will demonstrate practical tools and share case studies from healthcare and finance where interpretability is not just nice-to-have but legally required.',
'Keynote on cutting-edge AI interpretability techniques with real-world case studies from regulated industries.',
'Keynote', 45, 'All Levels',
'["AI/ML", "Ethics", "Explainability", "Research"]',
94.0, 'Exceptional submission from highly credentialed speaker. Research background combined with practical applications. Keynote-worthy content that aligns perfectly with conference values. Topics are timely and important. Speaker has strong academic track record.', 1),

(@Submission4ID, @Event1ID, 'TF_RESP_004', '2025-12-22 11:20:00', 'Failed Initial',
'Introduction to HTML and CSS for Beginners',
'This session will teach the basics of HTML and CSS for people who are new to web development. We will cover HTML tags, CSS selectors, the box model, and how to build a simple webpage. Perfect for anyone wanting to learn web development from scratch.',
'Beginner-friendly introduction to HTML and CSS fundamentals.',
'Presentation', 45, 'Beginner',
'["HTML", "CSS", "Web Development"]',
45.0, 'Content is too basic for this conference audience. Topic does not align with conference theme of AI, Cloud, and Modern Software Architecture. Better suited for a beginner coding bootcamp or introductory workshop series. Speaker experience does not indicate expertise beyond basic web development.', 0),

(@Submission5ID, @Event1ID, 'TF_RESP_005', '2025-12-23 08:30:00', 'Analyzing',
'Cost Optimization at Scale: How We Reduced AWS Spend by 70%',
'Share our journey of reducing AWS infrastructure costs from $2M/year to $600K/year while improving performance and reliability. Topics include: right-sizing instances, leveraging spot instances, optimizing data transfer, implementing caching strategies, and building a cost-aware culture. Includes specific tools, scripts, and organizational strategies that enabled these savings.',
'Case study on dramatic AWS cost reduction through technical optimizations and organizational culture change.',
'Presentation', 45, 'Intermediate',
'["Cloud", "AWS", "Cost Optimization", "Infrastructure"]',
NULL, NULL, NULL),

(@Submission6ID, @Event2ID, 'TF_RESP_006', '2025-12-10 13:00:00', 'New',
'Lightning Talk: My Favorite DevOps Tools in 2026',
'Quick overview of 10 amazing DevOps tools I discovered this year. Fast-paced, opinionated tour of what is working well in my workflow.',
'Rapid-fire overview of useful DevOps tools.',
'Lightning Talk', 10, 'All Levels',
'["Tools", "DevOps", "Productivity"]',
NULL, NULL, NULL);

-- Link speakers to submissions
INSERT INTO Events.SubmissionSpeaker (SubmissionID, SpeakerID, IsPrimaryContact, Role)
VALUES
(@Submission1ID, @Speaker1ID, 1, 'Presenter'),
(@Submission2ID, @Speaker2ID, 1, 'Presenter'),
(@Submission3ID, @Speaker3ID, 1, 'Presenter'),
(@Submission4ID, @Speaker5ID, 1, 'Presenter'),
(@Submission5ID, @Speaker4ID, 1, 'Presenter'),
(@Submission6ID, @Speaker2ID, 1, 'Presenter');

-- Insert sample reviews (for submissions that are under review)
-- Reviews spread across November and December 2024 for better timeline visualization
INSERT INTO Events.SubmissionReview (SubmissionID, ReviewerContactID, ReviewedAt, OverallScore, RelevanceScore, QualityScore, SpeakerExperienceScore, Comments, Recommendation)
VALUES
-- Submission 1 reviews (Building Resilient AI Systems)
(@Submission1ID, 1, '2024-11-18 10:30:00', 8.5, 9.0, 8.5, 9.0, 'Excellent submission with strong technical depth. Sarah has proven experience and the topic is highly relevant. Would be great as a main-track presentation.', 'Accept'),
(@Submission1ID, 2, '2024-11-20 14:20:00', 7.5, 8.0, 7.0, 8.0, 'Solid proposal. Production ML experience is valuable. Would like to see more specific examples of failure modes and recovery strategies in the final talk.', 'Accept'),
(@Submission1ID, 3, '2024-11-22 09:15:00', 8.0, 8.5, 8.0, 8.5, 'Good balance of theory and practice. Speaker credentials are strong. Recommend for main track.', 'Accept'),

-- Submission 3 reviews (Interpretable AI keynote)
(@Submission3ID, 1, '2024-11-25 14:15:00', 9.5, 10.0, 9.0, 10.0, 'Outstanding keynote material from a top-tier researcher. This would be a highlight of the conference. Strong recommend for keynote slot.', 'Accept'),
(@Submission3ID, 2, '2024-11-26 11:30:00', 9.0, 9.5, 9.0, 9.5, 'Excellent research credentials. Topic is critical and timely. Will appeal to broad audience. Keynote-worthy.', 'Accept'),

-- Submission 2 reviews (Kubernetes Security Workshop)
(@Submission2ID, 1, '2024-12-01 08:45:00', 8.0, 8.5, 8.0, 7.5, 'Good workshop content. Security topics are important. Slightly concerned about 3-hour duration management. Would accept with suggestion to have co-facilitator.', 'Needs Discussion'),
(@Submission2ID, 3, '2024-12-02 15:30:00', 8.5, 9.0, 8.5, 8.0, 'Strong security expertise evident. Hands-on format is valuable. Setup requirements need to be communicated clearly pre-conference.', 'Accept'),
(@Submission2ID, 2, '2024-12-03 10:00:00', 7.0, 8.0, 7.5, 7.0, 'Workshop has merit but needs refinement. Consider breaking into 2x90-minute sessions to improve retention and reduce setup burden.', 'Needs Discussion'),

-- Submission 4 reviews (HTML/CSS - will be rejected)
(@Submission4ID, 1, '2024-12-05 13:20:00', 4.0, 3.0, 5.0, 4.0, 'Content is too basic for this conference. Does not align with AI/Cloud focus. Better suited for beginner bootcamp.', 'Reject'),
(@Submission4ID, 2, '2024-12-05 16:45:00', 4.5, 3.5, 5.0, 4.0, 'Agree with previous reviewer. Topic misalignment with conference theme. Speaker profile does not indicate advanced expertise.', 'Reject');

-- Insert sample notifications
INSERT INTO Events.SubmissionNotification (SubmissionID, NotificationType, SentAt, RecipientEmail, Subject, MessageBody, DeliveryStatus)
VALUES
(@Submission1ID, 'Initial Received', '2025-12-15 14:31:00', 'sarah.chen@techcorp.com',
'Tech Summit 2026 - Submission Received',
'Thank you for submitting your proposal "Building Resilient AI Systems: Lessons from Production" to Tech Summit 2026. Your submission has been received and will be reviewed by our program committee. You can expect to hear back from us by March 15, 2026.',
'Delivered'),

(@Submission2ID, 'Initial Received', '2025-12-18 09:16:00', 'mjohnson@devtools.io',
'Tech Summit 2026 - Submission Received',
'Thank you for submitting your workshop proposal "Interactive Workshop: Hands-on Kubernetes Security" to Tech Summit 2026. Your submission has been received and will be reviewed by our program committee. You can expect to hear back from us by March 15, 2026.',
'Delivered'),

(@Submission3ID, 'Initial Received', '2025-12-20 16:46:00', 'aisha@airesearch.edu',
'Tech Summit 2026 - Submission Received',
'Thank you for submitting your keynote proposal "The Future of Interpretable AI: Making Black Boxes Transparent" to Tech Summit 2026. Your submission has been received and will be reviewed by our program committee. You can expect to hear back from us by March 15, 2026.',
'Delivered'),

(@Submission3ID, 'Passed to Review', '2025-12-21 08:00:00', 'aisha@airesearch.edu',
'Tech Summit 2026 - Your Submission is Under Review',
'Good news! Your submission has passed our initial screening and is now under detailed review by our program committee. This means your proposal aligns well with our conference themes and standards.',
'Delivered'),

(@Submission4ID, 'Initial Received', '2025-12-22 11:21:00', 'emily.zhang@consulting.com',
'Tech Summit 2026 - Submission Received',
'Thank you for submitting your proposal "Introduction to HTML and CSS for Beginners" to Tech Summit 2026. Your submission has been received and will be reviewed by our program committee. You can expect to hear back from us by March 15, 2026.',
'Delivered'),

(@Submission4ID, 'Failed Screening', '2025-12-23 09:00:00', 'emily.zhang@consulting.com',
'Tech Summit 2026 - Submission Update',
'Thank you for your submission "Introduction to HTML and CSS for Beginners" to Tech Summit 2026. After careful review, we have determined that this topic is not aligned with our conference focus on AI, Cloud, and Modern Software Architecture. We recommend submitting this content to conferences focused on web development fundamentals or beginner programming tracks. We appreciate your interest and encourage you to consider submitting a different topic that aligns with our theme.',
'Delivered');

-- Insert sample review tasks
INSERT INTO Events.EventReviewTask (EventID, SubmissionID, AssignedToContactID, Status, Priority, DueDate)
VALUES
(@Event1ID, @Submission1ID, 1, 'In Progress', 'Normal', '2026-01-10 23:59:59'),
(@Event1ID, @Submission2ID, 1, 'Pending', 'Normal', '2026-01-10 23:59:59'),
(@Event1ID, @Submission3ID, 1, 'In Progress', 'High', '2026-01-05 23:59:59'),
(@Event1ID, @Submission5ID, NULL, 'Pending', 'Normal', '2026-01-15 23:59:59');

GO

PRINT 'Events schema created successfully with sample data'
PRINT 'Sample data includes:'
PRINT '  - 2 Events (Tech Summit 2026, DevOps Days 2026)'
PRINT '  - 5 Speakers with varying experience levels'
PRINT '  - 6 Submissions in various states of review'
PRINT '  - 2 Human reviews'
PRINT '  - 6 Notification records'
PRINT '  - 4 Review tasks'
GO
