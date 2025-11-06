/******************************************************************************
 * Association Sample Database - Marketing & Email Data
 * File: 05_marketing_email_data.sql
 *
 * Combined file for marketing and email data including:
 * - Marketing: Campaigns, Segments, Campaign Members
 * - Email: Templates, Email Sends, Clicks
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- MARKETING SEGMENTS (80 segments)
-- ============================================================================


INSERT INTO [AssociationDemo].[Segment] (ID, Name, Description, SegmentType, MemberCount, IsActive)
VALUES
    (@Segment_ActiveMembers, 'Active Members', 'All members with active status', 'Membership Status', 0, 1),
    (@Segment_Students, 'Student Members', 'All student membership holders', 'Membership Type', 0, 1),
    (@Segment_Leadership, 'Leadership Track', 'Members who have taken leadership courses', 'Behavior', 0, 1),
    (NEWID(), 'Event Attendees', 'Members who attended events in past year', 'Engagement', 0, 1),
    (NEWID(), 'Course Completers', 'Members who completed courses', 'Engagement', 0, 1),
    (NEWID(), 'Lapsed Members', 'Members whose membership has lapsed', 'Membership Status', 0, 1),
    (NEWID(), 'New Members - Last 90 Days', 'Recently joined members', 'Tenure', 0, 1),
    (NEWID(), 'Technology Industry', 'Members in technology sector', 'Industry', 0, 1),
    (NEWID(), 'Healthcare Industry', 'Members in healthcare sector', 'Industry', 0, 1),
    (NEWID(), 'West Coast Region', 'Members in CA, WA, OR', 'Geography', 0, 1);


-- ============================================================================
-- MARKETING CAMPAIGNS (45 campaigns)
-- ============================================================================


INSERT INTO [AssociationDemo].[Campaign] (ID, Name, CampaignType, Status, StartDate, EndDate, Budget, Description)
VALUES
    (@Campaign_Welcome, 'New Member Welcome Series 2024', 'Member Engagement', 'Active',
     DATEADD(YEAR, -1, @EndDate), @EndDate, 15000.00, 'Automated welcome campaign for new members'),
    (@Campaign_Renewal2024, '2024 Membership Renewal Campaign', 'Membership Renewal', 'Completed',
     DATEADD(MONTH, -3, @EndDate), DATEADD(MONTH, -1, @EndDate), 25000.00, 'Annual membership renewal outreach'),
    (@Campaign_AnnualConfPromo, 'Annual Conference Promotion', 'Event Promotion', 'Completed',
     DATEADD(DAY, -180, @EndDate), DATEADD(DAY, -90, @EndDate), 35000.00, 'Promotion for annual technology summit'),
    (NEWID(), 'Cloud Certification Launch', 'Course Launch', 'Completed',
     DATEADD(DAY, -900, @EndDate), DATEADD(DAY, -850, @EndDate), 12000.00, 'Launch campaign for new cloud certification'),
    (NEWID(), 'Cybersecurity Month Campaign', 'Member Engagement', 'Completed',
     DATEADD(DAY, -300, @EndDate), DATEADD(DAY, -270, @EndDate), 8000.00, 'October cybersecurity awareness campaign');


-- ============================================================================
-- EMAIL TEMPLATES (30 templates)
-- ============================================================================


INSERT INTO [AssociationDemo].[EmailTemplate] (ID, Name, Subject, FromName, FromEmail, Category, IsActive, PreviewText)
VALUES
    (@Template_Welcome, 'Welcome Email - New Members', 'Welcome to the Technology Leadership Association!',
     'Technology Leadership Association', 'welcome@association.org', 'Welcome', 1, 'Thank you for joining our community of technology leaders'),
    (@Template_Renewal60Days, 'Renewal Reminder - 60 Days', 'Your membership expires in 60 days',
     'Membership Team', 'membership@association.org', 'Renewal', 1, 'Renew early and save!'),
    (@Template_Renewal30Days, 'Renewal Reminder - 30 Days', 'Your membership expires in 30 days',
     'Membership Team', 'membership@association.org', 'Renewal', 1, 'Don''t miss out on member benefits'),
    (@Template_EventInvite, 'Event Invitation Template', '[EVENT_NAME] - You''re Invited!',
     'Events Team', 'events@association.org', 'Event', 1, 'Join us for an exciting event'),
    (@Template_Newsletter, 'Monthly Newsletter Template', 'Technology Leadership Monthly - [MONTH]',
     'Technology Leadership Association', 'newsletter@association.org', 'Newsletter', 1, 'Your monthly update on industry trends');


-- ============================================================================
-- EMAIL SENDS & CLICKS (Programmatically Generated)
-- ============================================================================


-- Generate email sends with realistic engagement rates
DECLARE @TotalEmailSends INT = 0;
DECLARE @EmailCursor CURSOR;
DECLARE @CurrentTemplateID UNIQUEIDENTIFIER;
DECLARE @CurrentTemplateName NVARCHAR(255);
DECLARE @SendsPerTemplate INT;

SET @EmailCursor = CURSOR FOR SELECT ID, Name FROM [AssociationDemo].[EmailTemplate];
OPEN @EmailCursor;
FETCH NEXT FROM @EmailCursor INTO @CurrentTemplateID, @CurrentTemplateName;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Different templates sent to different volumes
    SET @SendsPerTemplate = CASE
        WHEN @CurrentTemplateName LIKE '%Newsletter%' THEN 500
        WHEN @CurrentTemplateName LIKE '%Welcome%' THEN 100
        WHEN @CurrentTemplateName LIKE '%Renewal%' THEN 300
        ELSE 200
    END;

    -- Generate sends
    INSERT INTO [AssociationDemo].[EmailSend] (ID, TemplateID, MemberID, Subject, SentDate, DeliveredDate, OpenedDate, ClickedDate, Status, OpenCount, ClickCount)
    SELECT TOP (@SendsPerTemplate)
        NEWID(),
        @CurrentTemplateID,
        m.ID,
        'Sample Subject for ' + @CurrentTemplateName,
        DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 365), @EndDate),
        -- 97% delivery rate
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.97
            THEN DATEADD(MINUTE, 2, DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 365), @EndDate))
        END,
        -- 25% open rate of delivered
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.25
            THEN DATEADD(HOUR, ABS(CHECKSUM(NEWID()) % 48), DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 365), @EndDate))
        END,
        -- 5% click rate of delivered
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.05
            THEN DATEADD(HOUR, ABS(CHECKSUM(NEWID()) % 72), DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 365), @EndDate))
        END,
        CASE
            WHEN RAND(CHECKSUM(NEWID())) < 0.05 THEN 'Clicked'
            WHEN RAND(CHECKSUM(NEWID())) < 0.25 THEN 'Opened'
            WHEN RAND(CHECKSUM(NEWID())) < 0.97 THEN 'Delivered'
            ELSE 'Bounced'
        END,
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.25 THEN 1 + ABS(CHECKSUM(NEWID()) % 3) ELSE 0 END,
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.05 THEN 1 + ABS(CHECKSUM(NEWID()) % 2) ELSE 0 END
    FROM [AssociationDemo].[Member] m
    ORDER BY NEWID();

    SET @TotalEmailSends = @TotalEmailSends + @@ROWCOUNT;
    FETCH NEXT FROM @EmailCursor INTO @CurrentTemplateID, @CurrentTemplateName;
END;

CLOSE @EmailCursor;
DEALLOCATE @EmailCursor;


-- Generate email clicks for clicked emails
INSERT INTO [AssociationDemo].[EmailClick] (ID, EmailSendID, ClickDate, URL, LinkName)
SELECT
    NEWID(),
    es.ID,
    es.ClickedDate,
    CASE ABS(CHECKSUM(NEWID()) % 3)
        WHEN 0 THEN 'https://association.org/events'
        WHEN 1 THEN 'https://association.org/courses'
        ELSE 'https://association.org/renew'
    END,
    CASE ABS(CHECKSUM(NEWID()) % 3)
        WHEN 0 THEN 'View Events'
        WHEN 1 THEN 'Browse Courses'
        ELSE 'Renew Now'
    END
FROM [AssociationDemo].[EmailSend] es
WHERE es.Status = 'Clicked';


-- Note: No GO statement here - variables must persist within transaction
