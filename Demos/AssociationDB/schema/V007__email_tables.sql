/******************************************************************************
 * Association Sample Database - Email Schema Tables
 * File: V007__email_tables.sql
 *
 * Creates email tracking and management tables including:
 * - EmailTemplate: Reusable email templates
 * - EmailSend: Individual email send tracking
 * - EmailClick: Click tracking for links in emails
 ******************************************************************************/

-- ============================================================================
-- EmailTemplate Table
-- ============================================================================
CREATE TABLE [email].[EmailTemplate] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Subject] NVARCHAR(500),
    [FromName] NVARCHAR(255),
    [FromEmail] NVARCHAR(255),
    [ReplyToEmail] NVARCHAR(255),
    [HtmlBody] NVARCHAR(MAX),
    [TextBody] NVARCHAR(MAX),
    [Category] NVARCHAR(100),
    [IsActive] BIT NOT NULL DEFAULT 1,
    [PreviewText] NVARCHAR(255),
    [Tags] NVARCHAR(500)
);
GO

-- ============================================================================
-- EmailSend Table
-- ============================================================================
CREATE TABLE [email].[EmailSend] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [TemplateID] UNIQUEIDENTIFIER,
    [CampaignID] UNIQUEIDENTIFIER,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [Subject] NVARCHAR(500),
    [SentDate] DATETIME NOT NULL,
    [DeliveredDate] DATETIME,
    [OpenedDate] DATETIME,
    [OpenCount] INT DEFAULT 0,
    [ClickedDate] DATETIME,
    [ClickCount] INT DEFAULT 0,
    [BouncedDate] DATETIME,
    [BounceType] NVARCHAR(20),
    [BounceReason] NVARCHAR(MAX),
    [UnsubscribedDate] DATETIME,
    [SpamReportedDate] DATETIME,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Queued', 'Sent', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Spam', 'Unsubscribed', 'Failed')),
    [ExternalMessageID] NVARCHAR(255),
    CONSTRAINT FK_EmailSend_Template FOREIGN KEY ([TemplateID])
        REFERENCES [email].[EmailTemplate]([ID]),
    CONSTRAINT FK_EmailSend_Campaign FOREIGN KEY ([CampaignID])
        REFERENCES [marketing].[Campaign]([ID]),
    CONSTRAINT FK_EmailSend_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- ============================================================================
-- EmailClick Table
-- ============================================================================
CREATE TABLE [email].[EmailClick] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EmailSendID] UNIQUEIDENTIFIER NOT NULL,
    [ClickDate] DATETIME NOT NULL,
    [URL] NVARCHAR(2000) NOT NULL,
    [LinkName] NVARCHAR(255),
    [IPAddress] NVARCHAR(50),
    [UserAgent] NVARCHAR(500),
    CONSTRAINT FK_EmailClick_Send FOREIGN KEY ([EmailSendID])
        REFERENCES [email].[EmailSend]([ID])
);
GO

PRINT 'Email schema tables created successfully!';
PRINT 'Tables: EmailTemplate, EmailSend, EmailClick';
GO
