-- =====================================================================
-- Corrective seed for the Integrations app UI
-- =====================================================================
-- The earlier seed migration (V202605112030) gracefully skipped because
-- the Company table was empty on fresh dev DBs. This migration:
--   1. Inserts a "Demo Company" if no Companies exist yet
--   2. Resolves catalog Integrations (Salesforce, HubSpot, etc.) BY NAME
--      so we don't collide with the UNIQUE(Name) constraint on rows that
--      already shipped with the DB (e.g. Salesforce is sometimes pre-seeded)
--   3. Seeds Company Integrations + Runs + Run Details against the
--      resolved IDs
-- Idempotent via hardcoded UUIDs on the Company Integrations/Runs/Details.
-- =====================================================================

DECLARE @CompanyID UNIQUEIDENTIFIER;
DECLARE @UserID UNIQUEIDENTIFIER;
DECLARE @Now DATETIMEOFFSET = SYSDATETIMEOFFSET();

-- Ensure at least one Company exists.
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Company])
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[Company] (ID, Name, Description, Website, Domain)
    VALUES ('F1000000-0000-0000-0000-000000000001', 'Demo Company', 'Sample tenant for development & UI testing', 'https://example.com', 'example.com');
END;

SELECT TOP 1 @CompanyID = ID FROM [${flyway:defaultSchema}].[Company] ORDER BY __mj_CreatedAt;
SELECT TOP 1 @UserID    = ID FROM [${flyway:defaultSchema}].[User]    ORDER BY __mj_CreatedAt;

IF @CompanyID IS NULL OR @UserID IS NULL
BEGIN
    PRINT 'Skipping Integrations seed — still missing Company or User after seed attempt.';
END
ELSE
BEGIN
    -- =================================================================
    -- 1. Integration Source Types — keyed by Name (UNIQUE constraint).
    -- =================================================================
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[IntegrationSourceType] WHERE Name = 'REST API')
        INSERT INTO [${flyway:defaultSchema}].[IntegrationSourceType] (ID, Name, Description, DriverClass, IconClass, Status)
        VALUES ('F1A00001-0000-0000-0000-000000000001', 'REST API', 'Generic HTTP REST integration', 'RestApiSource', 'fa-solid fa-cloud', 'Active');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[IntegrationSourceType] WHERE Name = 'Database')
        INSERT INTO [${flyway:defaultSchema}].[IntegrationSourceType] (ID, Name, Description, DriverClass, IconClass, Status)
        VALUES ('F1A00002-0000-0000-0000-000000000002', 'Database', 'Direct database connection', 'DatabaseSourceDriver', 'fa-solid fa-database', 'Active');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[IntegrationSourceType] WHERE Name = 'File Drop')
        INSERT INTO [${flyway:defaultSchema}].[IntegrationSourceType] (ID, Name, Description, DriverClass, IconClass, Status)
        VALUES ('F1A00003-0000-0000-0000-000000000003', 'File Drop', 'CSV/JSON file ingestion', 'FileSourceDriver', 'fa-solid fa-file-import', 'Active');

    -- Resolve REST API source type ID (used by every Company Integration below).
    DECLARE @RestApiTypeID UNIQUEIDENTIFIER;
    SELECT @RestApiTypeID = ID FROM [${flyway:defaultSchema}].[IntegrationSourceType] WHERE Name = 'REST API';

    -- =================================================================
    -- 2. Integrations catalog — keyed by Name (UNIQUE constraint).
    --    Salesforce/HubSpot/etc. may already be seeded with different IDs.
    -- =================================================================
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'Salesforce')
        INSERT INTO [${flyway:defaultSchema}].[Integration] (ID, Name, Description, NavigationBaseURL, ClassName)
        VALUES ('F1B00001-0000-0000-0000-000000000001', 'Salesforce', 'Salesforce CRM sync', 'https://login.salesforce.com', 'SalesforceIntegration');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'HubSpot')
        INSERT INTO [${flyway:defaultSchema}].[Integration] (ID, Name, Description, NavigationBaseURL, ClassName)
        VALUES ('F1B00002-0000-0000-0000-000000000002', 'HubSpot', 'HubSpot marketing & CRM', 'https://app.hubspot.com', 'HubspotIntegration');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'Marketo')
        INSERT INTO [${flyway:defaultSchema}].[Integration] (ID, Name, Description, NavigationBaseURL, ClassName)
        VALUES ('F1B00003-0000-0000-0000-000000000003', 'Marketo', 'Marketo marketing automation', 'https://app.marketo.com', 'MarketoIntegration');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'Mailchimp')
        INSERT INTO [${flyway:defaultSchema}].[Integration] (ID, Name, Description, NavigationBaseURL, ClassName)
        VALUES ('F1B00004-0000-0000-0000-000000000004', 'Mailchimp', 'Mailchimp email marketing', 'https://login.mailchimp.com', 'MailchimpIntegration');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'Stripe')
        INSERT INTO [${flyway:defaultSchema}].[Integration] (ID, Name, Description, NavigationBaseURL, ClassName)
        VALUES ('F1B00005-0000-0000-0000-000000000005', 'Stripe', 'Stripe payments & subscriptions', 'https://dashboard.stripe.com', 'StripeIntegration');

    -- Resolve each Integration's actual ID (handles pre-existing rows with different UUIDs).
    DECLARE @SalesforceID UNIQUEIDENTIFIER, @HubSpotID UNIQUEIDENTIFIER, @MarketoID UNIQUEIDENTIFIER, @MailchimpID UNIQUEIDENTIFIER, @StripeID UNIQUEIDENTIFIER;
    SELECT @SalesforceID = ID FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'Salesforce';
    SELECT @HubSpotID    = ID FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'HubSpot';
    SELECT @MarketoID    = ID FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'Marketo';
    SELECT @MailchimpID  = ID FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'Mailchimp';
    SELECT @StripeID     = ID FROM [${flyway:defaultSchema}].[Integration] WHERE Name = 'Stripe';

    -- =================================================================
    -- 3. Company Integrations — instances. Hardcoded IDs (idempotent).
    -- =================================================================
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegration] WHERE ID = 'F1C00001-0000-0000-0000-000000000001')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (ID, CompanyID, IntegrationID, Name, IsActive, SourceTypeID, ExternalSystemID,
             ScheduleEnabled, ScheduleType, ScheduleIntervalMinutes, NextScheduledRunAt, LastScheduledRunAt)
        VALUES ('F1C00001-0000-0000-0000-000000000001', @CompanyID, @SalesforceID,
                'Salesforce — Production', 1, @RestApiTypeID, 'sfprod-org',
                1, 'Interval', 60, DATEADD(MINUTE, 45, @Now), DATEADD(MINUTE, -15, @Now));

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegration] WHERE ID = 'F1C00002-0000-0000-0000-000000000002')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (ID, CompanyID, IntegrationID, Name, IsActive, SourceTypeID, ExternalSystemID,
             ScheduleEnabled, ScheduleType, ScheduleIntervalMinutes, NextScheduledRunAt, LastScheduledRunAt)
        VALUES ('F1C00002-0000-0000-0000-000000000002', @CompanyID, @HubSpotID,
                'HubSpot — Marketing Hub', 1, @RestApiTypeID, 'hubspot-1234567',
                1, 'Interval', 240, DATEADD(HOUR, 3, @Now), DATEADD(HOUR, -1, @Now));

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegration] WHERE ID = 'F1C00003-0000-0000-0000-000000000003')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (ID, CompanyID, IntegrationID, Name, IsActive, SourceTypeID, ExternalSystemID,
             ScheduleEnabled, ScheduleType, ScheduleIntervalMinutes, NextScheduledRunAt, LastScheduledRunAt)
        VALUES ('F1C00003-0000-0000-0000-000000000003', @CompanyID, @MarketoID,
                'Marketo — Lead Sync', 1, @RestApiTypeID, 'mkto-987-AAA-654',
                1, 'Cron', NULL, DATEADD(HOUR, 12, @Now), DATEADD(HOUR, -8, @Now));

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegration] WHERE ID = 'F1C00004-0000-0000-0000-000000000004')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (ID, CompanyID, IntegrationID, Name, IsActive, SourceTypeID, ExternalSystemID, ScheduleEnabled, LastScheduledRunAt)
        VALUES ('F1C00004-0000-0000-0000-000000000004', @CompanyID, @MailchimpID,
                'Mailchimp — Newsletter List', 1, @RestApiTypeID, 'mc-us21', 0, DATEADD(DAY, -3, @Now));

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegration] WHERE ID = 'F1C00005-0000-0000-0000-000000000005')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (ID, CompanyID, IntegrationID, Name, IsActive, SourceTypeID, ExternalSystemID, ScheduleEnabled)
        VALUES ('F1C00005-0000-0000-0000-000000000005', @CompanyID, @StripeID,
                'Stripe — Subscription Sync', 0, @RestApiTypeID, 'sub-prod-acct', 0);

    -- =================================================================
    -- 4. Company Integration Runs — 20 across last 14 days.
    -- =================================================================
    -- Salesforce runs (8)
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00001-0000-0000-0000-000000000001')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00001-0000-0000-0000-000000000001', 'F1C00001-0000-0000-0000-000000000001', @UserID,
                DATEADD(MINUTE, -15, @Now), DATEADD(MINUTE, -12, @Now), 142, 'Success', 'Scheduled hourly sync — Contacts');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00002-0000-0000-0000-000000000002')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00002-0000-0000-0000-000000000002', 'F1C00001-0000-0000-0000-000000000001', @UserID,
                DATEADD(HOUR, -1, @Now), DATEADD(HOUR, -1, DATEADD(MINUTE, 4, @Now)), 87, 'Success', 'Scheduled hourly sync — Accounts');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00003-0000-0000-0000-000000000003')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments, ErrorLog)
        VALUES ('F1D00003-0000-0000-0000-000000000003', 'F1C00001-0000-0000-0000-000000000001', @UserID,
                DATEADD(HOUR, -3, @Now), DATEADD(HOUR, -3, DATEADD(MINUTE, 2, @Now)), 23, 'Failed',
                'Scheduled hourly sync — Opportunities',
                '401 Unauthorized — access token expired. Refresh token attempted but failed.');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00004-0000-0000-0000-000000000004')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00004-0000-0000-0000-000000000004', 'F1C00001-0000-0000-0000-000000000001', @UserID,
                DATEADD(HOUR, -6, @Now), DATEADD(HOUR, -6, DATEADD(MINUTE, 3, @Now)), 198, 'Success', 'Scheduled hourly sync');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00005-0000-0000-0000-000000000005')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00005-0000-0000-0000-000000000005', 'F1C00001-0000-0000-0000-000000000001', @UserID,
                DATEADD(DAY, -1, @Now), DATEADD(DAY, -1, DATEADD(MINUTE, 5, @Now)), 211, 'Success', 'Scheduled hourly sync');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00006-0000-0000-0000-000000000006')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00006-0000-0000-0000-000000000006', 'F1C00001-0000-0000-0000-000000000001', @UserID,
                DATEADD(DAY, -3, @Now), DATEADD(DAY, -3, DATEADD(MINUTE, 6, @Now)), 167, 'Success', 'Scheduled hourly sync');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00007-0000-0000-0000-000000000007')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00007-0000-0000-0000-000000000007', 'F1C00001-0000-0000-0000-000000000001', @UserID,
                DATEADD(DAY, -7, @Now), DATEADD(DAY, -7, DATEADD(MINUTE, 4, @Now)), 99, 'Success', 'Scheduled hourly sync');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00008-0000-0000-0000-000000000008')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00008-0000-0000-0000-000000000008', 'F1C00001-0000-0000-0000-000000000001', @UserID,
                DATEADD(DAY, -12, @Now), DATEADD(DAY, -12, DATEADD(MINUTE, 5, @Now)), 318, 'Success', 'Initial backfill');

    -- HubSpot runs (5)
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00009-0000-0000-0000-000000000009')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00009-0000-0000-0000-000000000009', 'F1C00002-0000-0000-0000-000000000002', @UserID,
                DATEADD(HOUR, -1, @Now), DATEADD(HOUR, -1, DATEADD(MINUTE, 2, @Now)), 56, 'Success', 'Contacts + Companies sync');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D0000A-0000-0000-0000-00000000000A')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D0000A-0000-0000-0000-00000000000A', 'F1C00002-0000-0000-0000-000000000002', @UserID,
                DATEADD(HOUR, -5, @Now), DATEADD(HOUR, -5, DATEADD(MINUTE, 2, @Now)), 73, 'Success', 'Contacts + Companies sync');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D0000B-0000-0000-0000-00000000000B')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments, ErrorLog)
        VALUES ('F1D0000B-0000-0000-0000-00000000000B', 'F1C00002-0000-0000-0000-000000000002', @UserID,
                DATEADD(DAY, -1, @Now), DATEADD(DAY, -1, DATEADD(MINUTE, 1, @Now)), 8, 'Failed',
                'Contacts + Companies sync',
                'Rate limit exceeded — 100 requests per 10 seconds. Retry-After: 30s.');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D0000C-0000-0000-0000-00000000000C')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D0000C-0000-0000-0000-00000000000C', 'F1C00002-0000-0000-0000-000000000002', @UserID,
                DATEADD(DAY, -2, @Now), DATEADD(DAY, -2, DATEADD(MINUTE, 3, @Now)), 145, 'Success', 'Contacts + Companies sync');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D0000D-0000-0000-0000-00000000000D')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D0000D-0000-0000-0000-00000000000D', 'F1C00002-0000-0000-0000-000000000002', @UserID,
                DATEADD(DAY, -5, @Now), DATEADD(DAY, -5, DATEADD(MINUTE, 4, @Now)), 89, 'Success', 'Contacts + Companies sync');

    -- Marketo runs (4 including 1 In Progress)
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D0000E-0000-0000-0000-00000000000E')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D0000E-0000-0000-0000-00000000000E', 'F1C00003-0000-0000-0000-000000000003', @UserID,
                DATEADD(HOUR, -8, @Now), DATEADD(HOUR, -8, DATEADD(MINUTE, 7, @Now)), 412, 'Success', 'Lead sync — incremental');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D0000F-0000-0000-0000-00000000000F')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D0000F-0000-0000-0000-00000000000F', 'F1C00003-0000-0000-0000-000000000003', @UserID,
                DATEADD(DAY, -1, DATEADD(HOUR, -8, @Now)), DATEADD(DAY, -1, DATEADD(HOUR, -8, DATEADD(MINUTE, 6, @Now))), 387, 'Success', 'Lead sync — incremental');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00010-0000-0000-0000-000000000010')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00010-0000-0000-0000-000000000010', 'F1C00003-0000-0000-0000-000000000003', @UserID,
                DATEADD(MINUTE, -2, @Now), NULL, 0, 'In Progress', 'Lead sync — incremental (running)');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00011-0000-0000-0000-000000000011')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00011-0000-0000-0000-000000000011', 'F1C00003-0000-0000-0000-000000000003', @UserID,
                DATEADD(DAY, -4, @Now), DATEADD(DAY, -4, DATEADD(MINUTE, 8, @Now)), 521, 'Success', 'Lead sync — full');

    -- Mailchimp runs (3 — integration now paused)
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00012-0000-0000-0000-000000000012')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00012-0000-0000-0000-000000000012', 'F1C00004-0000-0000-0000-000000000004', @UserID,
                DATEADD(DAY, -3, @Now), DATEADD(DAY, -3, DATEADD(MINUTE, 2, @Now)), 1280, 'Success', 'Newsletter subscribers export');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00013-0000-0000-0000-000000000013')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments)
        VALUES ('F1D00013-0000-0000-0000-000000000013', 'F1C00004-0000-0000-0000-000000000004', @UserID,
                DATEADD(DAY, -10, @Now), DATEADD(DAY, -10, DATEADD(MINUTE, 3, @Now)), 1175, 'Success', 'Newsletter subscribers export');

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRun] WHERE ID = 'F1D00014-0000-0000-0000-000000000014')
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun] (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments, ErrorLog)
        VALUES ('F1D00014-0000-0000-0000-000000000014', 'F1C00004-0000-0000-0000-000000000004', @UserID,
                DATEADD(DAY, -13, @Now), DATEADD(DAY, -13, DATEADD(MINUTE, 1, @Now)), 0, 'Failed',
                'Newsletter subscribers export',
                'API key revoked. Re-authentication required before next run.');

    -- =================================================================
    -- 5. Company Integration Run Details — drill-down for 3 recent runs.
    -- =================================================================
    DECLARE @SampleEntityID UNIQUEIDENTIFIER;
    SELECT TOP 1 @SampleEntityID = ID FROM [${flyway:defaultSchema}].[Entity] WHERE Name = 'Users' ORDER BY __mj_CreatedAt;
    IF @SampleEntityID IS NULL
        SELECT TOP 1 @SampleEntityID = ID FROM [${flyway:defaultSchema}].[Entity] ORDER BY __mj_CreatedAt;

    IF @SampleEntityID IS NOT NULL
    BEGIN
        -- Salesforce most recent run — 8 records, all success
        IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE ID = 'F1E00001-0000-0000-0000-000000000001')
        BEGIN
            INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] (ID, CompanyIntegrationRunID, EntityID, RecordID, Action, ExecutedAt, IsSuccess) VALUES
                ('F1E00001-0000-0000-0000-000000000001', 'F1D00001-0000-0000-0000-000000000001', @SampleEntityID, 'sf-001', 'Create', DATEADD(MINUTE, -14, @Now), 1),
                ('F1E00002-0000-0000-0000-000000000002', 'F1D00001-0000-0000-0000-000000000001', @SampleEntityID, 'sf-002', 'Update', DATEADD(MINUTE, -14, @Now), 1),
                ('F1E00003-0000-0000-0000-000000000003', 'F1D00001-0000-0000-0000-000000000001', @SampleEntityID, 'sf-003', 'Update', DATEADD(MINUTE, -14, @Now), 1),
                ('F1E00004-0000-0000-0000-000000000004', 'F1D00001-0000-0000-0000-000000000001', @SampleEntityID, 'sf-004', 'Create', DATEADD(MINUTE, -13, @Now), 1),
                ('F1E00005-0000-0000-0000-000000000005', 'F1D00001-0000-0000-0000-000000000001', @SampleEntityID, 'sf-005', 'Update', DATEADD(MINUTE, -13, @Now), 1),
                ('F1E00006-0000-0000-0000-000000000006', 'F1D00001-0000-0000-0000-000000000001', @SampleEntityID, 'sf-006', 'Update', DATEADD(MINUTE, -13, @Now), 1),
                ('F1E00007-0000-0000-0000-000000000007', 'F1D00001-0000-0000-0000-000000000001', @SampleEntityID, 'sf-007', 'Create', DATEADD(MINUTE, -12, @Now), 1),
                ('F1E00008-0000-0000-0000-000000000008', 'F1D00001-0000-0000-0000-000000000001', @SampleEntityID, 'sf-008', 'Update', DATEADD(MINUTE, -12, @Now), 1);
        END;

        -- HubSpot rate-limit failed run — 8 records, half success/half fail
        IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE ID = 'F1E00010-0000-0000-0000-000000000010')
        BEGIN
            INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] (ID, CompanyIntegrationRunID, EntityID, RecordID, Action, ExecutedAt, IsSuccess) VALUES
                ('F1E00010-0000-0000-0000-000000000010', 'F1D0000B-0000-0000-0000-00000000000B', @SampleEntityID, 'hs-101', 'Create', DATEADD(DAY, -1, @Now), 1),
                ('F1E00011-0000-0000-0000-000000000011', 'F1D0000B-0000-0000-0000-00000000000B', @SampleEntityID, 'hs-102', 'Update', DATEADD(DAY, -1, @Now), 1),
                ('F1E00012-0000-0000-0000-000000000012', 'F1D0000B-0000-0000-0000-00000000000B', @SampleEntityID, 'hs-103', 'Update', DATEADD(DAY, -1, @Now), 1),
                ('F1E00013-0000-0000-0000-000000000013', 'F1D0000B-0000-0000-0000-00000000000B', @SampleEntityID, 'hs-104', 'Create', DATEADD(DAY, -1, @Now), 1),
                ('F1E00014-0000-0000-0000-000000000014', 'F1D0000B-0000-0000-0000-00000000000B', @SampleEntityID, 'hs-105', 'Update', DATEADD(DAY, -1, @Now), 0),
                ('F1E00015-0000-0000-0000-000000000015', 'F1D0000B-0000-0000-0000-00000000000B', @SampleEntityID, 'hs-106', 'Update', DATEADD(DAY, -1, @Now), 0),
                ('F1E00016-0000-0000-0000-000000000016', 'F1D0000B-0000-0000-0000-00000000000B', @SampleEntityID, 'hs-107', 'Update', DATEADD(DAY, -1, @Now), 0),
                ('F1E00017-0000-0000-0000-000000000017', 'F1D0000B-0000-0000-0000-00000000000B', @SampleEntityID, 'hs-108', 'Update', DATEADD(DAY, -1, @Now), 0);
        END;

        -- Marketo most recent success — 6 records
        IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE ID = 'F1E00020-0000-0000-0000-000000000020')
        BEGIN
            INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] (ID, CompanyIntegrationRunID, EntityID, RecordID, Action, ExecutedAt, IsSuccess) VALUES
                ('F1E00020-0000-0000-0000-000000000020', 'F1D0000E-0000-0000-0000-00000000000E', @SampleEntityID, 'mkt-201', 'Create', DATEADD(HOUR, -8, @Now), 1),
                ('F1E00021-0000-0000-0000-000000000021', 'F1D0000E-0000-0000-0000-00000000000E', @SampleEntityID, 'mkt-202', 'Update', DATEADD(HOUR, -8, @Now), 1),
                ('F1E00022-0000-0000-0000-000000000022', 'F1D0000E-0000-0000-0000-00000000000E', @SampleEntityID, 'mkt-203', 'Update', DATEADD(HOUR, -8, @Now), 1),
                ('F1E00023-0000-0000-0000-000000000023', 'F1D0000E-0000-0000-0000-00000000000E', @SampleEntityID, 'mkt-204', 'Create', DATEADD(HOUR, -8, @Now), 1),
                ('F1E00024-0000-0000-0000-000000000024', 'F1D0000E-0000-0000-0000-00000000000E', @SampleEntityID, 'mkt-205', 'Update', DATEADD(HOUR, -8, @Now), 1),
                ('F1E00025-0000-0000-0000-000000000025', 'F1D0000E-0000-0000-0000-00000000000E', @SampleEntityID, 'mkt-206', 'Update', DATEADD(HOUR, -8, @Now), 1);
        END;
    END;

    PRINT 'Integrations dummy data seeded successfully.';
END
