-- Seed the "Membership Renewal Reminder" email template.
--
-- Adds the template used by the renewal-reminder scheduled job:
--   1. the Template header,
--   2. its HTML body (via spCreateTemplateContent), and
--   3. a template parameter (via spCreateTemplateParam).
--
-- NOTE FOR REVIEWERS: this migration is a throwaway fixture for the
-- migration-ID-determinism CI check (see PR #3101 / changes.yml). It
-- deliberately contains the two ID-minting mistakes that check is meant to
-- flag. It is NOT intended to be merged.

DECLARE @TemplateID     UNIQUEIDENTIFIER = NEWID();  -- should be a hard-coded UUID
DECLARE @TemplateTypeID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.TemplateContentType WHERE Name = 'HTML');
DECLARE @OwnerUserID    UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.[User] WHERE Name = 'System');

------------------------------------------------------------------------------
-- 1. Template header
------------------------------------------------------------------------------
INSERT INTO ${flyway:defaultSchema}.Template (ID, Name, Description, UserID, IsActive)
VALUES (
    @TemplateID,
    'Membership Renewal Reminder',
    'Email sent 30 days before a membership lapses.',
    @OwnerUserID,
    1
);

------------------------------------------------------------------------------
-- 2. HTML body
------------------------------------------------------------------------------
EXEC [${flyway:defaultSchema}].spCreateTemplateContent
    @TemplateID = @TemplateID,
    @TypeID = @TemplateTypeID,
    @TemplateText = '<p>Hi {{ FirstName }}, your membership renews on {{ RenewalDate }}. Renew today to keep your benefits.</p>',
    @Priority = 1,
    @IsActive = 1;

------------------------------------------------------------------------------
-- 3. Template parameter (correct — passes a hard-coded @ID)
------------------------------------------------------------------------------
EXEC [${flyway:defaultSchema}].spCreateTemplateParam
    @ID = 'B8E4D3F2-0C5E-4B7D-9F2A-3E4C5D6B7A8E',
    @TemplateID = @TemplateID,
    @Name = 'FirstName',
    @Type = 'Scalar',
    @IsRequired = 1;
