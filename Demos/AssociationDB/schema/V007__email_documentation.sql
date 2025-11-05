/******************************************************************************
 * Association Sample Database - Email Schema Documentation
 * File: V007__email_documentation.sql
 *
 * Extended properties (documentation) for email schema tables.
 * This file is separate to allow optional installation of documentation.
 ******************************************************************************/

-- ============================================================================
-- Extended properties for EmailTemplate
-- ============================================================================
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
    @name = N'MS_Description', @value = N'Template catery (Welcome, Renewal, Event, Newsletter, etc.)',
    @level0type = N'SCHEMA', @level0name = 'email',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Catery';


-- ============================================================================
-- Extended properties for EmailSend
-- ============================================================================
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


-- ============================================================================
-- Extended properties for EmailClick
-- ============================================================================
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


PRINT 'Email schema documentation added successfully!';

