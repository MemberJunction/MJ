-- Contacts Demo Application Schema
-- This migration creates the Contacts schema for a demo contact tracking application
-- with AI-powered sentiment analysis and auto-tagging capabilities

-- Create the Contacts schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'Contacts')
BEGIN
    EXEC('CREATE SCHEMA [Contacts]')
END
GO

--------------------------------------------------------------------------------
-- Contact Table
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[Contact](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [FirstName] [nvarchar](100) NOT NULL,
    [LastName] [nvarchar](100) NOT NULL,
    [Email] [nvarchar](255) NULL,
    [Phone] [nvarchar](50) NULL,
    [Company] [nvarchar](255) NULL,
    [Title] [nvarchar](150) NULL,
    [Status] [nvarchar](20) NOT NULL DEFAULT 'Active'
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores contact information for people being tracked in the CRM system',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Contact';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'First name of the contact',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'FirstName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Last name of the contact',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'LastName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary email address for the contact',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Email';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary phone number for the contact',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Phone';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Company or organization the contact is associated with',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Company';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Job title or role of the contact',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Title';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the contact (Active or Inactive)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Status';

-- Status constraint
ALTER TABLE [Contacts].[Contact]
ADD CONSTRAINT [CK_Contact_Status] CHECK ([Status] IN ('Active', 'Inactive'));


--------------------------------------------------------------------------------
-- ActivityType Table (Lookup)
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[ActivityType](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [Name] [nvarchar](100) NOT NULL,
    [Description] [nvarchar](500) NULL,
    [Icon] [nvarchar](100) NULL
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lookup table defining types of activities (Phone Call, Email, Meeting, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityType';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the activity type',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of what this activity type represents',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Font Awesome or similar icon class for UI display',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityType',
    @level2type = N'COLUMN', @level2name = N'Icon';

-- Unique constraint on Name
ALTER TABLE [Contacts].[ActivityType] ADD CONSTRAINT [UQ_ActivityType_Name] UNIQUE ([Name]);


--------------------------------------------------------------------------------
-- Activity Table
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[Activity](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [ContactID] [uniqueidentifier] NOT NULL,
    [ActivityTypeID] [uniqueidentifier] NOT NULL,
    [UserID] [uniqueidentifier] NOT NULL,
    [Subject] [nvarchar](255) NOT NULL,
    [Description] [nvarchar](max) NULL,
    [RawContent] [nvarchar](max) NULL,
    [ActivityDate] [datetimeoffset](7) NOT NULL DEFAULT (getutcdate()),
    [DurationMinutes] [int] NULL,
    [Status] [nvarchar](20) NOT NULL DEFAULT 'Completed',
    [UrgencyLevel] [nvarchar](20) NULL,
    [UrgencyScore] [decimal](5,4) NULL,
    [RequiresFollowUp] [bit] NOT NULL DEFAULT (0),
    [FollowUpDate] [date] NULL,
    [ProcessedByAI] [bit] NOT NULL DEFAULT (0)
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Records interactions and activities with contacts (calls, emails, meetings, notes)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the contact this activity is associated with',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'ContactID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of activity (Phone Call, Email, Meeting, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'ActivityTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'MemberJunction user who performed or logged this activity',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Brief subject line or title for the activity',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Subject';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description or notes about the activity',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full raw content of the activity (email body, call transcript, etc.) used for AI analysis',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'RawContent';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time when the activity occurred',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'ActivityDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Duration of the activity in minutes (for calls, meetings)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'DurationMinutes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the activity (Planned, Completed, Cancelled)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI-detected urgency level (Low, Medium, High, Critical)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'UrgencyLevel';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Numeric urgency score from AI analysis (0.0000 to 1.0000)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'UrgencyScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if this activity requires a follow-up action',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'RequiresFollowUp';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Suggested or scheduled date for follow-up',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'FollowUpDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if this activity has been processed by AI for sentiment/tagging',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'ProcessedByAI';

-- Foreign keys
ALTER TABLE [Contacts].[Activity]
ADD CONSTRAINT [FK_Activity_Contact]
FOREIGN KEY ([ContactID]) REFERENCES [Contacts].[Contact] ([ID]);

ALTER TABLE [Contacts].[Activity]
ADD CONSTRAINT [FK_Activity_ActivityType]
FOREIGN KEY ([ActivityTypeID]) REFERENCES [Contacts].[ActivityType] ([ID]);

ALTER TABLE [Contacts].[Activity]
ADD CONSTRAINT [FK_Activity_User]
FOREIGN KEY ([UserID]) REFERENCES [${flyway:defaultSchema}].[User] ([ID]);

-- Status constraint
ALTER TABLE [Contacts].[Activity]
ADD CONSTRAINT [CK_Activity_Status] CHECK ([Status] IN ('Planned', 'Completed', 'Cancelled'));

-- Urgency level constraint
ALTER TABLE [Contacts].[Activity]
ADD CONSTRAINT [CK_Activity_UrgencyLevel] CHECK ([UrgencyLevel] IS NULL OR [UrgencyLevel] IN ('Low', 'Medium', 'High', 'Critical'));


--------------------------------------------------------------------------------
-- ContactTag Table
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[ContactTag](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [Name] [nvarchar](100) NOT NULL,
    [Color] [nvarchar](50) NULL
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tags for categorizing and grouping contacts (VIP, Lead, Customer, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactTag';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the tag',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactTag',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hex color code or color name for UI display',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactTag',
    @level2type = N'COLUMN', @level2name = N'Color';

-- Unique constraint on Name
ALTER TABLE [Contacts].[ContactTag] ADD CONSTRAINT [UQ_ContactTag_Name] UNIQUE ([Name]);


--------------------------------------------------------------------------------
-- ContactTagLink Table (Many-to-Many)
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[ContactTagLink](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [ContactID] [uniqueidentifier] NOT NULL,
    [ContactTagID] [uniqueidentifier] NOT NULL
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Join table linking contacts to their tags (many-to-many relationship)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactTagLink';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the contact being tagged',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactTagLink',
    @level2type = N'COLUMN', @level2name = N'ContactID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the tag being applied',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactTagLink',
    @level2type = N'COLUMN', @level2name = N'ContactTagID';

-- Foreign keys
ALTER TABLE [Contacts].[ContactTagLink]
ADD CONSTRAINT [FK_ContactTagLink_Contact]
FOREIGN KEY ([ContactID]) REFERENCES [Contacts].[Contact] ([ID]);

ALTER TABLE [Contacts].[ContactTagLink]
ADD CONSTRAINT [FK_ContactTagLink_ContactTag]
FOREIGN KEY ([ContactTagID]) REFERENCES [Contacts].[ContactTag] ([ID]);

-- Unique constraint to prevent duplicate tag assignments
ALTER TABLE [Contacts].[ContactTagLink]
ADD CONSTRAINT [UQ_ContactTagLink_Contact_Tag] UNIQUE ([ContactID], [ContactTagID]);


--------------------------------------------------------------------------------
-- ActivitySentiment Table (AI-Generated)
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[ActivitySentiment](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [ActivityID] [uniqueidentifier] NOT NULL,
    [OverallSentiment] [nvarchar](20) NOT NULL,
    [SentimentScore] [decimal](5,4) NOT NULL,
    [EmotionCategory] [nvarchar](50) NULL,
    [ConfidenceScore] [decimal](5,4) NOT NULL,
    [AnalyzedAt] [datetimeoffset](7) NOT NULL DEFAULT (getutcdate()),
    [AIModelUsed] [nvarchar](255) NULL
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores AI-generated sentiment analysis results for activities',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivitySentiment';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the activity that was analyzed',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivitySentiment',
    @level2type = N'COLUMN', @level2name = N'ActivityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Overall sentiment classification (Positive, Neutral, Negative)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivitySentiment',
    @level2type = N'COLUMN', @level2name = N'OverallSentiment';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Numeric sentiment score from -1.0000 (negative) to 1.0000 (positive)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivitySentiment',
    @level2type = N'COLUMN', @level2name = N'SentimentScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detected emotion category (Happy, Frustrated, Confused, Urgent, Grateful, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivitySentiment',
    @level2type = N'COLUMN', @level2name = N'EmotionCategory';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI confidence in the analysis (0.0000 to 1.0000)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivitySentiment',
    @level2type = N'COLUMN', @level2name = N'ConfidenceScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the AI analysis was performed',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivitySentiment',
    @level2type = N'COLUMN', @level2name = N'AnalyzedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name or identifier of the AI model used for analysis',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivitySentiment',
    @level2type = N'COLUMN', @level2name = N'AIModelUsed';

-- Foreign key
ALTER TABLE [Contacts].[ActivitySentiment]
ADD CONSTRAINT [FK_ActivitySentiment_Activity]
FOREIGN KEY ([ActivityID]) REFERENCES [Contacts].[Activity] ([ID]);

-- Sentiment constraint
ALTER TABLE [Contacts].[ActivitySentiment]
ADD CONSTRAINT [CK_ActivitySentiment_OverallSentiment] CHECK ([OverallSentiment] IN ('Positive', 'Neutral', 'Negative'));


--------------------------------------------------------------------------------
-- ActivityTag Table
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[ActivityTag](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [Name] [nvarchar](100) NOT NULL,
    [Description] [nvarchar](500) NULL,
    [Color] [nvarchar](50) NULL,
    [IsAutoGenerated] [bit] NOT NULL DEFAULT (0)
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tags specific to activities, including AI-generated tags (Complaint, Feature Request, Billing Issue, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTag';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the activity tag',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTag',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of what this tag represents',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTag',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hex color code or color name for UI display',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTag',
    @level2type = N'COLUMN', @level2name = N'Color';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if this tag was created by AI vs manually by a user',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTag',
    @level2type = N'COLUMN', @level2name = N'IsAutoGenerated';

-- Unique constraint on Name
ALTER TABLE [Contacts].[ActivityTag] ADD CONSTRAINT [UQ_ActivityTag_Name] UNIQUE ([Name]);


--------------------------------------------------------------------------------
-- ActivityTagLink Table (Many-to-Many with AI metadata)
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[ActivityTagLink](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [ActivityID] [uniqueidentifier] NOT NULL,
    [ActivityTagID] [uniqueidentifier] NOT NULL,
    [ConfidenceScore] [decimal](5,4) NULL,
    [AppliedByAI] [bit] NOT NULL DEFAULT (0),
    [AppliedAt] [datetimeoffset](7) NOT NULL DEFAULT (getutcdate())
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Join table linking activities to tags with AI confidence metadata',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTagLink';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the activity being tagged',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTagLink',
    @level2type = N'COLUMN', @level2name = N'ActivityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the tag being applied',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTagLink',
    @level2type = N'COLUMN', @level2name = N'ActivityTagID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI confidence score for this tag assignment (0.0000 to 1.0000), NULL for manual tags',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTagLink',
    @level2type = N'COLUMN', @level2name = N'ConfidenceScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if this tag was applied by AI vs manually by a user',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTagLink',
    @level2type = N'COLUMN', @level2name = N'AppliedByAI';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the tag was applied to the activity',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTagLink',
    @level2type = N'COLUMN', @level2name = N'AppliedAt';

-- Foreign keys
ALTER TABLE [Contacts].[ActivityTagLink]
ADD CONSTRAINT [FK_ActivityTagLink_Activity]
FOREIGN KEY ([ActivityID]) REFERENCES [Contacts].[Activity] ([ID]);

ALTER TABLE [Contacts].[ActivityTagLink]
ADD CONSTRAINT [FK_ActivityTagLink_ActivityTag]
FOREIGN KEY ([ActivityTagID]) REFERENCES [Contacts].[ActivityTag] ([ID]);

-- Unique constraint to prevent duplicate tag assignments
ALTER TABLE [Contacts].[ActivityTagLink]
ADD CONSTRAINT [UQ_ActivityTagLink_Activity_Tag] UNIQUE ([ActivityID], [ActivityTagID]);


--------------------------------------------------------------------------------
-- Topic Table (Hierarchical)
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[Topic](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [Name] [nvarchar](100) NOT NULL,
    [Description] [nvarchar](500) NULL,
    [ParentTopicID] [uniqueidentifier] NULL
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hierarchical topic/theme categories detected in activities (Pricing, Support, Partnership, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Topic';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the topic',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Topic',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of what this topic covers',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Topic',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to parent topic for hierarchical organization',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'Topic',
    @level2type = N'COLUMN', @level2name = N'ParentTopicID';

-- Self-referencing foreign key
ALTER TABLE [Contacts].[Topic]
ADD CONSTRAINT [FK_Topic_ParentTopic]
FOREIGN KEY ([ParentTopicID]) REFERENCES [Contacts].[Topic] ([ID]);

-- Unique constraint on Name
ALTER TABLE [Contacts].[Topic] ADD CONSTRAINT [UQ_Topic_Name] UNIQUE ([Name]);


--------------------------------------------------------------------------------
-- ActivityTopic Table (Many-to-Many with relevance ranking)
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[ActivityTopic](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [ActivityID] [uniqueidentifier] NOT NULL,
    [TopicID] [uniqueidentifier] NOT NULL,
    [ConfidenceScore] [decimal](5,4) NOT NULL,
    [RelevanceRank] [int] NOT NULL DEFAULT (1)
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links activities to detected topics with confidence and relevance ranking',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTopic';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the activity',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTopic',
    @level2type = N'COLUMN', @level2name = N'ActivityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the detected topic',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTopic',
    @level2type = N'COLUMN', @level2name = N'TopicID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI confidence score for this topic detection (0.0000 to 1.0000)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTopic',
    @level2type = N'COLUMN', @level2name = N'ConfidenceScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Relevance ranking (1 = primary topic, 2 = secondary, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ActivityTopic',
    @level2type = N'COLUMN', @level2name = N'RelevanceRank';

-- Foreign keys
ALTER TABLE [Contacts].[ActivityTopic]
ADD CONSTRAINT [FK_ActivityTopic_Activity]
FOREIGN KEY ([ActivityID]) REFERENCES [Contacts].[Activity] ([ID]);

ALTER TABLE [Contacts].[ActivityTopic]
ADD CONSTRAINT [FK_ActivityTopic_Topic]
FOREIGN KEY ([TopicID]) REFERENCES [Contacts].[Topic] ([ID]);

-- Unique constraint to prevent duplicate topic assignments
ALTER TABLE [Contacts].[ActivityTopic]
ADD CONSTRAINT [UQ_ActivityTopic_Activity_Topic] UNIQUE ([ActivityID], [TopicID]);


--------------------------------------------------------------------------------
-- ContactInsight Table (Aggregated AI insights per contact)
--------------------------------------------------------------------------------
CREATE TABLE [Contacts].[ContactInsight](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()) PRIMARY KEY,
    [ContactID] [uniqueidentifier] NOT NULL,
    [OverallSentimentTrend] [nvarchar](20) NULL,
    [AverageSentimentScore] [decimal](5,4) NULL,
    [TopTopics] [nvarchar](max) NULL,
    [EngagementLevel] [nvarchar](20) NULL,
    [ChurnRiskScore] [decimal](5,4) NULL,
    [LastAnalyzedAt] [datetimeoffset](7) NOT NULL DEFAULT (getutcdate())
);

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Aggregated AI-generated insights rolled up at the contact level',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactInsight';

-- Column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the contact these insights are about',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactInsight',
    @level2type = N'COLUMN', @level2name = N'ContactID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Trend of sentiment over time (Improving, Stable, Declining)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactInsight',
    @level2type = N'COLUMN', @level2name = N'OverallSentimentTrend';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Average sentiment score across all activities (-1.0000 to 1.0000)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactInsight',
    @level2type = N'COLUMN', @level2name = N'AverageSentimentScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of the most common topics for this contact',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactInsight',
    @level2type = N'COLUMN', @level2name = N'TopTopics';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Overall engagement level based on activity frequency (Low, Medium, High)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactInsight',
    @level2type = N'COLUMN', @level2name = N'EngagementLevel';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI-predicted churn risk score (0.0000 to 1.0000)',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactInsight',
    @level2type = N'COLUMN', @level2name = N'ChurnRiskScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when insights were last recalculated',
    @level0type = N'SCHEMA', @level0name = N'Contacts',
    @level1type = N'TABLE',  @level1name = N'ContactInsight',
    @level2type = N'COLUMN', @level2name = N'LastAnalyzedAt';

-- Foreign key
ALTER TABLE [Contacts].[ContactInsight]
ADD CONSTRAINT [FK_ContactInsight_Contact]
FOREIGN KEY ([ContactID]) REFERENCES [Contacts].[Contact] ([ID]);

-- Sentiment trend constraint
ALTER TABLE [Contacts].[ContactInsight]
ADD CONSTRAINT [CK_ContactInsight_OverallSentimentTrend] CHECK ([OverallSentimentTrend] IS NULL OR [OverallSentimentTrend] IN ('Improving', 'Stable', 'Declining'));

-- Engagement level constraint
ALTER TABLE [Contacts].[ContactInsight]
ADD CONSTRAINT [CK_ContactInsight_EngagementLevel] CHECK ([EngagementLevel] IS NULL OR [EngagementLevel] IN ('Low', 'Medium', 'High'));

-- One insight record per contact
ALTER TABLE [Contacts].[ContactInsight]
ADD CONSTRAINT [UQ_ContactInsight_Contact] UNIQUE ([ContactID]);


--------------------------------------------------------------------------------
-- Seed Data: Default Activity Types
--------------------------------------------------------------------------------
INSERT INTO [Contacts].[ActivityType] ([ID], [Name], [Description], [Icon])
VALUES
    ('175826E7-D105-4142-B8D4-2B4AE56E99B3', 'Phone Call', 'Inbound or outbound phone conversation', 'fa-solid fa-phone'),
    ('69D07382-F986-4602-99D3-2900E23A5C65', 'Email', 'Email correspondence', 'fa-solid fa-envelope'),
    ('A0211288-2747-4FA5-BE0C-40B4E3A6BC80', 'Meeting', 'In-person or virtual meeting', 'fa-solid fa-users'),
    ('9AD0F0C7-E378-40DE-B7FF-CD4E27D32959', 'Note', 'Internal note or observation', 'fa-solid fa-sticky-note'),
    ('F9FB1E64-4797-4172-9E54-E7F51FE0BA59', 'Task', 'Follow-up task or action item', 'fa-solid fa-check-square'),
    ('40AF9381-F2E9-4E90-B43D-D2119D87B0C4', 'Chat', 'Live chat or instant message conversation', 'fa-solid fa-comments');


--------------------------------------------------------------------------------
-- Seed Data: Default Activity Tags
--------------------------------------------------------------------------------
INSERT INTO [Contacts].[ActivityTag] ([ID], [Name], [Description], [Color], [IsAutoGenerated])
VALUES
    ('B1111CA9-EDB0-4846-BC8C-419DE0479502', 'Complaint', 'Customer expressing dissatisfaction', '#dc3545', 0),
    ('9605C622-926C-47C3-A77D-E151DE8C5AB9', 'Feature Request', 'Request for new functionality', '#17a2b8', 0),
    ('1D479272-6F2A-4A5A-AAF6-70B2E9C31FA2', 'Billing Issue', 'Question or problem with billing', '#ffc107', 0),
    ('2120761A-1858-486D-9DF3-602EFF83AA55', 'Praise', 'Positive feedback or compliment', '#28a745', 0),
    ('29562890-9D39-4A07-88FD-93645F3BE700', 'Technical Support', 'Technical issue or question', '#6c757d', 0),
    ('1EBC0F62-3861-46B2-BEC8-6B961DEDF580', 'Sales Inquiry', 'Interest in purchasing or upgrading', '#007bff', 0);


--------------------------------------------------------------------------------
-- Seed Data: Default Topics
--------------------------------------------------------------------------------
INSERT INTO [Contacts].[Topic] ([ID], [Name], [Description], [ParentTopicID])
VALUES
    ('F7EA2037-7932-4F45-A972-A27B1185BB45', 'Pricing', 'Discussions about pricing, costs, and payment terms', NULL),
    ('4CCBFA72-71A4-4D3A-91B1-355295768784', 'Support', 'Technical support and troubleshooting', NULL),
    ('7BDDA63A-1265-4ABC-9E2A-ABFA0E2A430D', 'Partnership', 'Partnership and collaboration opportunities', NULL),
    ('FE16A885-5E03-448D-81B5-48A04100C93D', 'Renewal', 'Contract renewal and subscription discussions', NULL),
    ('AFD40B46-8587-4A4C-B8CF-D9C1DCF4A136', 'Product', 'Product features, roadmap, and feedback', NULL),
    ('66048775-4508-4099-AA8F-5EE97F18AFDF', 'Onboarding', 'New customer setup and training', NULL);


--------------------------------------------------------------------------------
-- Seed Data: Default Contact Tags
--------------------------------------------------------------------------------
INSERT INTO [Contacts].[ContactTag] ([ID], [Name], [Color])
VALUES
    ('37435702-DC91-426E-86FC-4F14BFE114C4', 'VIP', '#ffd700'),
    ('AAA25849-094A-4D7A-A7D7-F20273BC66BB', 'Lead', '#17a2b8'),
    ('4386143B-A9BE-4845-BBE0-8BED7AC2DB3E', 'Customer', '#28a745'),
    ('E409EFBF-9D6C-45E0-A344-3B2D81AF1515', 'Partner', '#6f42c1'),
    ('F6A893EE-3578-4E81-A43E-0CAAC13E5F3A', 'Prospect', '#fd7e14'),
    ('30A7EAA7-C28C-4F2E-924C-823A69A5F7A2', 'Churned', '#dc3545');


--------------------------------------------------------------------------------
-- Seed Data: Sample Contacts
--------------------------------------------------------------------------------
INSERT INTO [Contacts].[Contact] ([ID], [FirstName], [LastName], [Email], [Phone], [Company], [Title], [Status])
VALUES
    ('24ED57D3-10C0-45C7-830B-78AEF88D3EE2', 'Sarah', 'Chen', 'sarah.chen@techcorp.com', '(415) 555-0101', 'TechCorp Industries', 'VP of Engineering', 'Active'),
    ('6792AD4F-720F-4128-B786-CC5E5E6BB3B5', 'Michael', 'Rodriguez', 'mrodriguez@innovate.io', '(312) 555-0202', 'Innovate.io', 'CTO', 'Active'),
    ('E532E75C-E71A-4D50-BA38-A7FF070BC2FE', 'Emily', 'Thompson', 'emily.t@globalsoft.com', '(650) 555-0303', 'GlobalSoft Solutions', 'Director of Operations', 'Active'),
    ('F0BEC6C0-9962-406C-9FCB-F594F1A3B5AA', 'David', 'Kim', 'dkim@nexustech.net', '(206) 555-0404', 'Nexus Technologies', 'Senior Architect', 'Active'),
    ('3B6BA612-C585-47DD-B49B-5CDB864D699E', 'Amanda', 'Foster', 'amanda.foster@datadriven.co', '(512) 555-0505', 'DataDriven Co', 'Head of Product', 'Active'),
    ('6A3EA618-B1E2-48A9-AE13-1F32BA2BD090', 'James', 'Wilson', 'jwilson@cloudpeak.io', '(303) 555-0606', 'CloudPeak Systems', 'Engineering Manager', 'Active'),
    ('433FAF7B-AC29-4B96-8AEF-A66643C3CB23', 'Jennifer', 'Martinez', 'jmartinez@brightpath.com', '(617) 555-0707', 'BrightPath Analytics', 'Data Science Lead', 'Active'),
    ('87BFE70C-47CB-4036-B3B9-DB9FEBCF9988', 'Robert', 'Anderson', 'randerson@velocityai.com', '(408) 555-0808', 'Velocity AI', 'CEO', 'Active'),
    ('82BE0CE6-145D-4D44-9E39-5791D79D4401', 'Lisa', 'Nguyen', 'lnguyen@quantumleap.tech', '(619) 555-0909', 'QuantumLeap Tech', 'Product Manager', 'Active'),
    ('0E2C0807-EB92-4ADC-B97F-1353C915A4DA', 'Christopher', 'Brown', 'cbrown@synergysys.com', '(214) 555-1010', 'Synergy Systems', 'Technical Lead', 'Active'),
    ('0E7C5B80-52FC-45F2-88B8-797AE7787321', 'Rachel', 'Davis', 'rdavis@futureforge.io', '(720) 555-1111', 'FutureForge Inc', 'VP of Sales', 'Active'),
    ('8CA22A58-886D-43E7-8531-E9EADB64209D', 'Daniel', 'Lee', 'dlee@alphawave.com', '(925) 555-1212', 'AlphaWave Solutions', 'Solutions Architect', 'Inactive'),
    ('A0B3EC12-3D96-4083-8D93-74C4977F7DEA', 'Michelle', 'Taylor', 'mtaylor@codecraft.dev', '(503) 555-1313', 'CodeCraft Development', 'Engineering Director', 'Active'),
    ('3F001D2D-2921-4A70-B367-9FCD2C450C72', 'Kevin', 'White', 'kwhite@digitalpulse.io', '(480) 555-1414', 'Digital Pulse', 'Chief Architect', 'Active'),
    ('D5AF212A-0090-4BFA-9744-A4E37C2B31D6', 'Stephanie', 'Harris', 'sharris@nimbletech.com', '(858) 555-1515', 'NimbleTech', 'Program Manager', 'Active');


--------------------------------------------------------------------------------
-- Seed Data: Contact Tag Links (connecting contacts to their tags)
--------------------------------------------------------------------------------
-- VIP Tag: '37435702-DC91-426E-86FC-4F14BFE114C4'
-- Lead Tag: 'AAA25849-094A-4D7A-A7D7-F20273BC66BB'
-- Customer Tag: '4386143B-A9BE-4845-BBE0-8BED7AC2DB3E'
-- Partner Tag: 'E409EFBF-9D6C-45E0-A344-3B2D81AF1515'
-- Prospect Tag: 'F6A893EE-3578-4E81-A43E-0CAAC13E5F3A'
-- Churned Tag: '30A7EAA7-C28C-4F2E-924C-823A69A5F7A2'

INSERT INTO [Contacts].[ContactTagLink] ([ID], [ContactID], [TagID])
VALUES
    -- Sarah Chen: VIP + Customer
    ('78DF5744-A122-4C76-9BF6-EA8449B6C1B2', '24ED57D3-10C0-45C7-830B-78AEF88D3EE2', '37435702-DC91-426E-86FC-4F14BFE114C4'),
    ('BD8BA0CF-3D45-4767-BFDA-C88441F30679', '24ED57D3-10C0-45C7-830B-78AEF88D3EE2', '4386143B-A9BE-4845-BBE0-8BED7AC2DB3E'),
    -- Michael Rodriguez: VIP + Partner
    ('2624B619-1742-498D-9B62-47915AAD2EC6', '6792AD4F-720F-4128-B786-CC5E5E6BB3B5', '37435702-DC91-426E-86FC-4F14BFE114C4'),
    ('05C821E0-9B3F-4344-BCA4-95148B063E85', '6792AD4F-720F-4128-B786-CC5E5E6BB3B5', 'E409EFBF-9D6C-45E0-A344-3B2D81AF1515'),
    -- Emily Thompson: Customer
    ('E842F23F-6EE8-4D85-A967-5BAF9FF6A909', 'E532E75C-E71A-4D50-BA38-A7FF070BC2FE', '4386143B-A9BE-4845-BBE0-8BED7AC2DB3E'),
    -- David Kim: Customer
    ('9B9952B9-A81F-4586-9931-DAECDB4204ED', 'F0BEC6C0-9962-406C-9FCB-F594F1A3B5AA', '4386143B-A9BE-4845-BBE0-8BED7AC2DB3E'),
    -- Amanda Foster: Lead
    ('96DADEE2-6479-48FB-A2F8-10329859BA5D', '3B6BA612-C585-47DD-B49B-5CDB864D699E', 'AAA25849-094A-4D7A-A7D7-F20273BC66BB'),
    -- James Wilson: Customer
    ('BDDF2DB8-2757-4F8C-A553-5F33674295CF', '6A3EA618-B1E2-48A9-AE13-1F32BA2BD090', '4386143B-A9BE-4845-BBE0-8BED7AC2DB3E'),
    -- Jennifer Martinez: VIP + Customer
    ('BF7099C1-37B1-47AD-8C3A-2CF9E4103F7F', '433FAF7B-AC29-4B96-8AEF-A66643C3CB23', '37435702-DC91-426E-86FC-4F14BFE114C4'),
    ('D6939825-F2A4-4D86-97BF-8532F07AE2DD', '433FAF7B-AC29-4B96-8AEF-A66643C3CB23', '4386143B-A9BE-4845-BBE0-8BED7AC2DB3E'),
    -- Robert Anderson: VIP + Partner
    ('17EF86CF-C190-4BC3-9C2E-52A0605B4431', '87BFE70C-47CB-4036-B3B9-DB9FEBCF9988', '37435702-DC91-426E-86FC-4F14BFE114C4'),
    ('D4AA9B93-E948-475E-B62E-03913F29D698', '87BFE70C-47CB-4036-B3B9-DB9FEBCF9988', 'E409EFBF-9D6C-45E0-A344-3B2D81AF1515'),
    -- Lisa Nguyen: Prospect
    ('7F2A7919-B9D9-4DC7-9EDA-F780F667BD40', '82BE0CE6-145D-4D44-9E39-5791D79D4401', 'F6A893EE-3578-4E81-A43E-0CAAC13E5F3A'),
    -- Christopher Brown: Customer
    ('9E7CB811-4727-49C0-A43D-5F414853DED6', '0E2C0807-EB92-4ADC-B97F-1353C915A4DA', '4386143B-A9BE-4845-BBE0-8BED7AC2DB3E'),
    -- Rachel Davis: Lead
    ('B4FA2DD6-1A98-4290-B0AE-1200FA81340E', '0E7C5B80-52FC-45F2-88B8-797AE7787321', 'AAA25849-094A-4D7A-A7D7-F20273BC66BB');


--------------------------------------------------------------------------------
-- Seed Data: Contact Insights (AI-generated insights for contacts)
--------------------------------------------------------------------------------
INSERT INTO [Contacts].[ContactInsight] ([ID], [ContactID], [OverallSentimentTrend], [AverageSentimentScore], [TopTopics], [EngagementLevel], [ChurnRiskScore], [LastAnalyzedAt])
VALUES
    -- Sarah Chen: High engagement, improving sentiment, low churn risk (VIP Customer)
    ('C1A11111-1111-1111-1111-111111111111', '24ED57D3-10C0-45C7-830B-78AEF88D3EE2', 'Improving', 0.7500, '["Product", "Partnership", "Pricing"]', 'High', 0.0500, '2025-01-10 14:30:00'),
    -- Michael Rodriguez: High engagement, stable sentiment (VIP Partner)
    ('C2A22222-2222-2222-2222-222222222222', '6792AD4F-720F-4128-B786-CC5E5E6BB3B5', 'Stable', 0.6200, '["Partnership", "Product", "Support"]', 'High', 0.1000, '2025-01-10 14:30:00'),
    -- Emily Thompson: Medium engagement, declining sentiment, higher churn risk
    ('C3A33333-3333-3333-3333-333333333333', 'E532E75C-E71A-4D50-BA38-A7FF070BC2FE', 'Declining', -0.1500, '["Support", "Pricing", "Renewal"]', 'Medium', 0.4500, '2025-01-10 14:30:00'),
    -- David Kim: Medium engagement, stable sentiment
    ('C4A44444-4444-4444-4444-444444444444', 'F0BEC6C0-9962-406C-9FCB-F594F1A3B5AA', 'Stable', 0.3500, '["Product", "Support", "Onboarding"]', 'Medium', 0.2000, '2025-01-10 14:30:00'),
    -- Amanda Foster: Low engagement, stable (new lead)
    ('C5A55555-5555-5555-5555-555555555555', '3B6BA612-C585-47DD-B49B-5CDB864D699E', 'Stable', 0.4000, '["Pricing", "Product"]', 'Low', 0.3000, '2025-01-10 14:30:00'),
    -- James Wilson: High engagement, improving sentiment
    ('C6A66666-6666-6666-6666-666666666666', '6A3EA618-B1E2-48A9-AE13-1F32BA2BD090', 'Improving', 0.8200, '["Product", "Onboarding", "Support"]', 'High', 0.0800, '2025-01-10 14:30:00'),
    -- Jennifer Martinez: High engagement, stable sentiment (VIP Customer)
    ('C7A77777-7777-7777-7777-777777777777', '433FAF7B-AC29-4B96-8AEF-A66643C3CB23', 'Stable', 0.5500, '["Product", "Partnership", "Renewal"]', 'High', 0.1200, '2025-01-10 14:30:00'),
    -- Robert Anderson: Medium engagement, improving sentiment (VIP Partner)
    ('C8A88888-8888-8888-8888-888888888888', '87BFE70C-47CB-4036-B3B9-DB9FEBCF9988', 'Improving', 0.6800, '["Partnership", "Pricing", "Product"]', 'Medium', 0.1500, '2025-01-10 14:30:00'),
    -- Lisa Nguyen: Low engagement (new prospect)
    ('C9A99999-9999-9999-9999-999999999999', '82BE0CE6-145D-4D44-9E39-5791D79D4401', 'Stable', 0.2500, '["Pricing", "Onboarding"]', 'Low', 0.3500, '2025-01-10 14:30:00'),
    -- Christopher Brown: Medium engagement, declining sentiment, at-risk
    ('CAAAAAA0-AAAA-AAAA-AAAA-AAAAAAAAAAAA', '0E2C0807-EB92-4ADC-B97F-1353C915A4DA', 'Declining', -0.2500, '["Support", "Pricing", "Renewal"]', 'Medium', 0.6500, '2025-01-10 14:30:00'),
    -- Rachel Davis: Low engagement (new lead)
    ('CBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', '0E7C5B80-52FC-45F2-88B8-797AE7787321', 'Stable', 0.3000, '["Pricing", "Product"]', 'Low', 0.2500, '2025-01-10 14:30:00'),
    -- Daniel Lee: Low engagement, declining (churned/inactive contact)
    ('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', '8CA22A58-886D-43E7-8531-E9EADB64209D', 'Declining', -0.4500, '["Support", "Pricing"]', 'Low', 0.8500, '2025-01-10 14:30:00'),
    -- Michelle Taylor: High engagement, improving sentiment
    ('CDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD', 'A0B3EC12-3D96-4083-8D93-74C4977F7DEA', 'Improving', 0.7000, '["Product", "Support", "Partnership"]', 'High', 0.1000, '2025-01-10 14:30:00'),
    -- Kevin White: Medium engagement, stable
    ('CEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE', '3F001D2D-2921-4A70-B367-9FCD2C450C72', 'Stable', 0.4500, '["Product", "Support"]', 'Medium', 0.2200, '2025-01-10 14:30:00'),
    -- Stephanie Harris: Medium engagement, improving
    ('CFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', 'D5AF212A-0090-4BFA-9744-A4E37C2B31D6', 'Improving', 0.5800, '["Onboarding", "Product", "Support"]', 'Medium', 0.1800, '2025-01-10 14:30:00');
