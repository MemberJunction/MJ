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

-- Extended properties for EmailTemplate
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Reusable email templates for automated communications',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailTemplate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template name for identification',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email subject line (may contain merge fields)',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Subject';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTML version of email body',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'HtmlBody';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Plain text version of email body',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'TextBody';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template category (Welcome, Renewal, Event, Newsletter, etc.)',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Category';
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

-- Extended properties for EmailSend
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual email send tracking with delivery and engagement metrics',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template used for this email',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'TemplateID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign this email is part of',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'CampaignID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member receiving the email',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was sent',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'SentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was delivered to inbox',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'DeliveredDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was first opened',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'OpenedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total number of opens',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'OpenCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date a link was first clicked',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'ClickedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total number of clicks',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'ClickCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email status: Queued, Sent, Delivered, Opened, Clicked, Bounced, Spam, Unsubscribed, or Failed',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'Status';
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

-- Extended properties for EmailClick
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual click tracking for links within emails',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailClick';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email send this click is associated with',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'EmailSendID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date and time link was clicked',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'ClickDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'URL that was clicked',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'URL';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Friendly name for the link',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'LinkName';
GO

PRINT 'Email schema tables created successfully!';
PRINT 'Tables: EmailTemplate, EmailSend, EmailClick';
GO
