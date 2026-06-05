-- Migration: User Feedback Submission tracking for email notifications
--
-- Adds the UserFeedbackSubmission table which records each piece of feedback
-- that was successfully filed as a GitHub issue. The row maps the submitter's
-- email address back to (owner, repo, issueNumber) so MJAPI can send
-- notification emails when GitHub fires webhook events for that issue
-- (confirmation on creation, status changes, new comments).
--
-- Rows are only created when the submitter provided an email address — without
-- an email there is nothing to notify, so the row would have no purpose.

CREATE TABLE ${flyway:defaultSchema}.UserFeedbackSubmission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    UserID UNIQUEIDENTIFIER NULL,
    Email NVARCHAR(255) NOT NULL,
    Name NVARCHAR(200) NULL,
    GitHubOwner NVARCHAR(100) NOT NULL,
    GitHubRepo NVARCHAR(100) NOT NULL,
    IssueNumber INT NOT NULL,
    IssueTitle NVARCHAR(500) NOT NULL,
    IssueURL NVARCHAR(500) NOT NULL,
    Category NVARCHAR(50) NULL,
    Severity NVARCHAR(50) NULL,
    CONSTRAINT PK_UserFeedbackSubmission PRIMARY KEY (ID),
    CONSTRAINT FK_UserFeedbackSubmission_User
        FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT UQ_UserFeedbackSubmission_Issue
        UNIQUE (GitHubOwner, GitHubRepo, IssueNumber)
);

------------------------------------------------------------------------
-- Extended properties — table and column documentation for CodeGen
-- (PK and FK columns are intentionally omitted; CodeGen handles those.)
------------------------------------------------------------------------

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Records each user feedback submission that was successfully filed as a GitHub issue, mapping the submitter''s contact info back to (owner, repo, issueNumber) so MJAPI can send notification emails when GitHub webhooks report status changes or new comments on the issue.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email address of the submitter. All notification emails for this issue are sent here. Required because the row exists solely to drive notifications.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'Email';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional display name of the submitter, used to personalize notification emails (e.g., "Hi Jane,").',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'GitHub organization or user account that owns the repository where the issue was filed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'GitHubOwner';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'GitHub repository name where the issue was filed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'GitHubRepo';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'GitHub issue number. Together with GitHubOwner and GitHubRepo this uniquely identifies the issue and is the lookup key the webhook handler uses to find the matching submission row.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'IssueNumber';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Issue title at the time of creation. Cached locally so notification email subject lines do not require a round-trip to the GitHub API.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'IssueTitle';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Direct URL to the GitHub issue. Included in notification emails when the repository is publicly visible to the submitter; for private repos the link will not be reachable and emails should rely on inlined content instead.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'IssueURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'LLM-classified category of the original submission (e.g., bug, feature, question, other). Mirrors the category label applied to the GitHub issue.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'Category';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'LLM-classified severity of the original submission (e.g., critical, major, minor, trivial). Mirrors the severity label applied to the GitHub issue.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserFeedbackSubmission',
    @level2type = N'COLUMN', @level2name = 'Severity';
