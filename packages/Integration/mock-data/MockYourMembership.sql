-- MockYourMembership Database
-- Creates a mock YourMembership-like database with realistic data for Integration Engine testing
-- Tables: ym_Chapters (15), ym_MembershipLevels (10), ym_Members (300), ym_Events (50), ym_EventRegistrations (200)

USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = 'MockYourMembership')
BEGIN
    ALTER DATABASE MockYourMembership SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE MockYourMembership;
END
GO

CREATE DATABASE MockYourMembership;
GO

USE MockYourMembership;
GO

----------------------------------------------------------------------
-- TABLES
----------------------------------------------------------------------

CREATE TABLE dbo.ym_Chapters (
    chapter_id      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    name            NVARCHAR(255)    NOT NULL,
    description     NVARCHAR(500)    NULL,
    state           NVARCHAR(50)     NULL,
    is_active       BIT              NOT NULL DEFAULT 1,
    created_at      DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_ym_Chapters PRIMARY KEY (chapter_id)
);

CREATE TABLE dbo.ym_MembershipLevels (
    level_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    name            NVARCHAR(100)    NOT NULL,
    description     NVARCHAR(500)    NULL,
    annual_fee      DECIMAL(10,2)    NOT NULL,
    duration_months INT              NOT NULL,
    is_active       BIT              NOT NULL DEFAULT 1,
    CONSTRAINT PK_ym_MembershipLevels PRIMARY KEY (level_id)
);

CREATE TABLE dbo.ym_Members (
    member_id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    email               NVARCHAR(255)    NOT NULL,
    first_name          NVARCHAR(100)    NOT NULL,
    last_name           NVARCHAR(100)    NOT NULL,
    membership_level_id UNIQUEIDENTIFIER NOT NULL,
    join_date           DATE             NOT NULL,
    expiration_date     DATE             NOT NULL,
    status              NVARCHAR(20)     NOT NULL,
    phone               NVARCHAR(50)     NULL,
    chapter_id          UNIQUEIDENTIFIER NOT NULL,
    created_at          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_ym_Members PRIMARY KEY (member_id),
    CONSTRAINT FK_ym_Members_Level FOREIGN KEY (membership_level_id) REFERENCES dbo.ym_MembershipLevels(level_id),
    CONSTRAINT FK_ym_Members_Chapter FOREIGN KEY (chapter_id) REFERENCES dbo.ym_Chapters(chapter_id),
    CONSTRAINT CK_ym_Members_Status CHECK (status IN ('Active', 'Expired', 'Pending')),
    CONSTRAINT UQ_ym_Members_Email UNIQUE (email)
);

CREATE TABLE dbo.ym_Events (
    event_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    title           NVARCHAR(255)    NOT NULL,
    description     NVARCHAR(1000)   NULL,
    start_date      DATETIMEOFFSET   NOT NULL,
    end_date        DATETIMEOFFSET   NOT NULL,
    location        NVARCHAR(255)    NULL,
    max_capacity    INT              NOT NULL,
    current_capacity INT             NOT NULL DEFAULT 0,
    status          NVARCHAR(50)     NOT NULL,
    chapter_id      UNIQUEIDENTIFIER NOT NULL,
    created_at      DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_ym_Events PRIMARY KEY (event_id),
    CONSTRAINT FK_ym_Events_Chapter FOREIGN KEY (chapter_id) REFERENCES dbo.ym_Chapters(chapter_id)
);

CREATE TABLE dbo.ym_EventRegistrations (
    registration_id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    event_id        UNIQUEIDENTIFIER NOT NULL,
    member_id       UNIQUEIDENTIFIER NOT NULL,
    registration_date DATE           NOT NULL,
    status          NVARCHAR(50)     NOT NULL,
    amount_paid     DECIMAL(10,2)    NULL,
    created_at      DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_ym_EventRegistrations PRIMARY KEY (registration_id),
    CONSTRAINT FK_ym_EventRegistrations_Event FOREIGN KEY (event_id) REFERENCES dbo.ym_Events(event_id),
    CONSTRAINT FK_ym_EventRegistrations_Member FOREIGN KEY (member_id) REFERENCES dbo.ym_Members(member_id)
);
GO

----------------------------------------------------------------------
-- SEED DATA
----------------------------------------------------------------------

----------------------------------------------------------------------
-- ym_Chapters (15 rows)
----------------------------------------------------------------------
INSERT INTO dbo.ym_Chapters (name, description, state, is_active, created_at) VALUES
('Northeast Chapter',      'Serving members in the northeastern United States',       'NY', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Southeast Chapter',      'Serving members in the southeastern United States',       'GA', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Midwest Chapter',        'Serving members in the midwestern United States',         'IL', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Southwest Chapter',      'Serving members in the southwestern United States',       'TX', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Pacific Northwest',      'Serving members in the Pacific Northwest',                'WA', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('California Chapter',     'Serving members throughout California',                   'CA', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Mountain West Chapter',  'Serving members in the Rocky Mountain region',            'CO', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Great Lakes Chapter',    'Serving members around the Great Lakes',                  'MI', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Mid-Atlantic Chapter',   'Serving members in the Mid-Atlantic states',              'PA', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('New England Chapter',    'Serving members in New England states',                   'MA', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Gulf Coast Chapter',     'Serving members along the Gulf Coast',                    'FL', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Plains States Chapter',  'Serving members in the Great Plains region',              'KS', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Capital Region Chapter', 'Serving members in the DC metro area',                    'VA', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Carolinas Chapter',      'Serving members in North and South Carolina',             'NC', 1, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Tri-State Chapter',      'Serving members in NY, NJ, and CT area',                  'NJ', 0, DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'));
GO

----------------------------------------------------------------------
-- ym_MembershipLevels (10 rows)
----------------------------------------------------------------------
INSERT INTO dbo.ym_MembershipLevels (name, description, annual_fee, duration_months, is_active) VALUES
('Student',          'For currently enrolled students with valid student ID',                       25.00,  12, 1),
('Individual',       'Standard individual membership with basic benefits',                         75.00,  12, 1),
('Professional',     'Professional-level membership with enhanced networking',                    150.00,  12, 1),
('Premium',          'Premium membership with all benefits and priority access',                  250.00,  12, 1),
('Corporate Basic',  'Basic corporate membership for small businesses (up to 5 seats)',           500.00,  12, 1),
('Corporate Plus',   'Enhanced corporate membership for mid-size companies (up to 15 seats)',    1000.00,  12, 1),
('Enterprise',       'Full enterprise membership with unlimited seats and custom benefits',      2500.00,  12, 1),
('Lifetime',         'One-time payment for lifetime individual membership',                      1500.00, 999, 1),
('Retiree',          'Discounted membership for retired professionals',                            50.00,  12, 1),
('Introductory',     'Trial membership for first-year members (auto-converts to Individual)',       0.00,   6, 1);
GO

----------------------------------------------------------------------
-- ym_Members (300 rows)
----------------------------------------------------------------------
;WITH FirstNames AS (
    SELECT * FROM (VALUES
        ('Addison'),('Bennett'),('Cameron'),('Dakota'),('Emerson'),
        ('Finley'),('Graham'),('Harper'),('Indigo'),('Jordan'),
        ('Kennedy'),('Logan'),('Morgan'),('Nolan'),('Parker'),
        ('Quinn'),('Riley'),('Sawyer'),('Taylor'),('Avery'),
        ('Bailey'),('Carter'),('Dylan'),('Elliot'),('Frankie'),
        ('Greyson'),('Hayden'),('Ivy'),('Jesse'),('Kendall')
    ) AS v(fn)
),
LastNames AS (
    SELECT * FROM (VALUES
        ('Anderson'),('Barrett'),('Collins'),('Davidson'),('Evans'),
        ('Ferguson'),('Greene'),('Harper'),('Iverson'),('Jennings')
    ) AS v(ln)
),
NumberedMembers AS (
    SELECT fn, ln, ROW_NUMBER() OVER (ORDER BY NEWID()) AS rn
    FROM FirstNames CROSS JOIN LastNames
),
ChapterIDs AS (
    SELECT chapter_id, ROW_NUMBER() OVER (ORDER BY chapter_id) AS rn FROM dbo.ym_Chapters
),
LevelIDs AS (
    SELECT level_id, ROW_NUMBER() OVER (ORDER BY level_id) AS rn FROM dbo.ym_MembershipLevels
)
INSERT INTO dbo.ym_Members (email, first_name, last_name, membership_level_id, join_date, expiration_date,
    status, phone, chapter_id, created_at, updated_at)
SELECT TOP 300
    LOWER(nm.fn) + '.' + LOWER(nm.ln) + CAST(nm.rn AS NVARCHAR(10)) + '@membermail.com',
    nm.fn,
    nm.ln,
    lvl.level_id,
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2024-06-01'),
    CASE
        WHEN nm.rn % 5 IN (0, 1, 2) THEN 'Active'
        WHEN nm.rn % 5 = 3 THEN 'Expired'
        ELSE 'Pending'
    END,
    '(' + RIGHT('000' + CAST(200 + (ABS(CHECKSUM(NEWID())) % 800) AS VARCHAR), 3) + ') '
        + RIGHT('000' + CAST(200 + (ABS(CHECKSUM(NEWID())) % 800) AS VARCHAR), 3) + '-'
        + RIGHT('0000' + CAST(1000 + (ABS(CHECKSUM(NEWID())) % 9000) AS VARCHAR), 4),
    ch.chapter_id,
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2025-01-01')
FROM NumberedMembers nm
INNER JOIN ChapterIDs ch ON ch.rn = ((nm.rn - 1) % 15) + 1
INNER JOIN LevelIDs lvl ON lvl.rn = ((nm.rn - 1) % 10) + 1
WHERE nm.rn <= 300;
GO

----------------------------------------------------------------------
-- ym_Events (50 rows)
----------------------------------------------------------------------
;WITH ChapterIDs AS (
    SELECT chapter_id, ROW_NUMBER() OVER (ORDER BY chapter_id) AS rn FROM dbo.ym_Chapters WHERE is_active = 1
),
ActiveChapterCount AS (
    SELECT COUNT(*) AS cnt FROM dbo.ym_Chapters WHERE is_active = 1
),
EventData AS (
    SELECT * FROM (VALUES
        ('Annual Membership Gala', 'Black-tie annual gala celebrating our community achievements', 'Grand Ballroom, Marriott Hotel', 200, 'Completed'),
        ('Spring Networking Mixer', 'Casual networking event for new and existing members', 'Downtown Conference Center', 100, 'Completed'),
        ('Leadership Summit 2024', 'Two-day summit featuring industry thought leaders', 'Convention Center, Main Hall', 500, 'Completed'),
        ('Professional Development Workshop', 'Hands-on workshop for career advancement skills', 'Community Learning Center', 50, 'Completed'),
        ('Summer Charity Golf Tournament', 'Annual golf tournament raising funds for scholarships', 'Pebble Creek Golf Club', 120, 'Completed'),
        ('New Member Orientation', 'Welcome session for new members joining the organization', 'Chapter Office, Suite 200', 30, 'Completed'),
        ('Technology Trends Forum', 'Panel discussion on emerging technology trends', 'Tech Hub Auditorium', 150, 'Completed'),
        ('Holiday Celebration', 'End-of-year celebration with awards and entertainment', 'Hilton Grand Ballroom', 250, 'Completed'),
        ('Women in Leadership Conference', 'Annual conference focused on women in professional leadership', 'University Conference Center', 300, 'Completed'),
        ('Industry Roundtable', 'Invitation-only roundtable for senior professionals', 'Private Dining Room, Capital Grille', 25, 'Completed'),
        ('Board Elections Town Hall', 'Town hall meeting for annual board of directors elections', 'Chapter Office, Main Hall', 80, 'Completed'),
        ('Mentorship Program Kickoff', 'Launch event for the annual mentorship matching program', 'Coworking Space, Floor 3', 60, 'Completed'),
        ('Financial Planning Seminar', 'Educational seminar on personal and business finance', 'Library Auditorium', 75, 'Completed'),
        ('Community Service Day', 'Volunteer day at local food bank and community centers', 'Multiple Locations', 100, 'Completed'),
        ('Emerging Leaders Award Dinner', 'Dinner honoring outstanding emerging professionals', 'Rooftop Restaurant', 80, 'Completed'),
        ('Fall Career Fair', 'Career fair connecting members with top employers', 'Exhibition Hall A', 400, 'Completed'),
        ('Healthcare Innovation Summit', 'Summit exploring innovations in healthcare delivery', 'Medical Center Auditorium', 200, 'Completed'),
        ('Small Business Bootcamp', 'Intensive bootcamp for entrepreneurs and small business owners', 'Business Incubator Space', 40, 'Completed'),
        ('Legislative Advocacy Day', 'Day at the state capitol meeting with legislators', 'State Capitol Building', 60, 'Completed'),
        ('Chapter Presidents Meeting', 'Quarterly meeting of all chapter presidents', 'Virtual / Zoom', 20, 'Completed'),
        ('Marketing Masterclass', 'Advanced marketing strategies workshop', 'Digital Media Lab', 35, 'Upcoming'),
        ('Annual Strategic Planning Retreat', 'Two-day retreat for organizational strategic planning', 'Mountain Lodge Resort', 50, 'Upcoming'),
        ('Cybersecurity Awareness Workshop', 'Hands-on cybersecurity best practices', 'IT Training Center', 45, 'Upcoming'),
        ('Member Appreciation Luncheon', 'Luncheon honoring long-standing members', 'Country Club Dining Room', 100, 'Upcoming'),
        ('Innovation Hackathon', '48-hour hackathon solving real industry challenges', 'Tech Campus, Building B', 150, 'Upcoming'),
        ('Executive Roundtable Q2', 'Quarterly executive networking and discussion', 'Private Club, Members Lounge', 30, 'Upcoming'),
        ('Data Analytics Workshop', 'Introduction to data analytics for business professionals', 'University Computer Lab', 40, 'Upcoming'),
        ('Sustainability Forum', 'Forum on sustainable business practices and ESG', 'Green Building Conference Room', 80, 'Upcoming'),
        ('Regional Chapter Meetup', 'Informal meetup for regional chapter members', 'Local Brewery Event Space', 60, 'Upcoming'),
        ('Artificial Intelligence Seminar', 'Exploring AI applications in professional settings', 'Innovation Hub', 120, 'Upcoming'),
        ('Diversity & Inclusion Summit', 'Annual D&I summit with speakers and workshops', 'Cultural Center Auditorium', 250, 'Upcoming'),
        ('Young Professionals Mixer', 'Social mixer for members under 35', 'Rooftop Bar & Lounge', 75, 'Upcoming'),
        ('Retirement Planning Workshop', 'Financial planning workshop for mid-career professionals', 'Financial Advisory Center', 50, 'Upcoming'),
        ('Public Speaking Bootcamp', 'Intensive training on presentation and public speaking', 'Media Studio', 25, 'Upcoming'),
        ('International Trade Conference', 'Conference on global trade opportunities', 'Port Authority Conference Center', 200, 'Upcoming'),
        ('Ethics in Business Symposium', 'Symposium on ethical business practices', 'Law School Moot Courtroom', 100, 'Upcoming'),
        ('Annual Awards Ceremony', 'Ceremony recognizing outstanding member contributions', 'Theater Grand Hall', 350, 'Upcoming'),
        ('Real Estate Investment Forum', 'Forum on real estate investment strategies', 'Real Estate Office, Conference Room', 40, 'Upcoming'),
        ('Health & Wellness Fair', 'Health screenings, fitness demos, and wellness resources', 'Recreation Center', 150, 'Upcoming'),
        ('Volunteer Coordinator Training', 'Training session for chapter volunteer coordinators', 'Virtual / Teams', 30, 'Upcoming'),
        ('End of Year Review Meeting', 'Annual review of organizational goals and achievements', 'Chapter Office, Board Room', 40, 'Upcoming'),
        ('Startup Pitch Competition', 'Competition for members with innovative startup ideas', 'Venture Capital Office', 80, 'Upcoming'),
        ('Nonprofit Management Workshop', 'Workshop on effective nonprofit administration', 'Nonprofit Center', 35, 'Upcoming'),
        ('Legal Update Briefing', 'Quarterly legal and regulatory update for members', 'Law Firm Conference Room', 50, 'Upcoming'),
        ('Supply Chain Summit', 'Summit on supply chain optimization and resilience', 'Logistics Center Auditorium', 100, 'Upcoming'),
        ('Photography & Media Workshop', 'Workshop on content creation and professional photography', 'Art Studio', 20, 'Upcoming'),
        ('Member Benefits Info Session', 'Information session on maximizing membership benefits', 'Virtual / Zoom', 100, 'Upcoming'),
        ('Construction Industry Roundtable', 'Roundtable discussion on construction industry trends', 'Trade Center Meeting Room', 45, 'Upcoming'),
        ('Year-End Networking Social', 'Casual end-of-year networking and celebration', 'Hotel Ballroom', 200, 'Upcoming'),
        ('New Year Kickoff Breakfast', 'New year planning breakfast for chapter leaders', 'Breakfast Cafe, Private Room', 30, 'Upcoming')
    ) AS v(title, description, location, max_capacity, status)
),
NumberedEvents AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS rn FROM EventData
)
INSERT INTO dbo.ym_Events (title, description, start_date, end_date, location, max_capacity, current_capacity,
    status, chapter_id, created_at)
SELECT
    ne.title,
    ne.description,
    DATEADD(HOUR, 9 + (ABS(CHECKSUM(NEWID())) % 8), CAST(DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01') AS DATETIMEOFFSET)),
    DATEADD(HOUR, 12 + (ABS(CHECKSUM(NEWID())) % 8), CAST(DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01') AS DATETIMEOFFSET)),
    ne.location,
    ne.max_capacity,
    CASE WHEN ne.status = 'Completed' THEN ne.max_capacity * (50 + ABS(CHECKSUM(NEWID())) % 50) / 100 ELSE 0 END,
    ne.status,
    ch.chapter_id,
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01')
FROM NumberedEvents ne
INNER JOIN ChapterIDs ch ON ch.rn = ((ne.rn - 1) % (SELECT cnt FROM ActiveChapterCount)) + 1;
GO

----------------------------------------------------------------------
-- ym_EventRegistrations (200 rows)
----------------------------------------------------------------------
;WITH EventIDs AS (
    SELECT event_id, ROW_NUMBER() OVER (ORDER BY event_id) AS rn FROM dbo.ym_Events
),
MemberIDs AS (
    SELECT member_id, ROW_NUMBER() OVER (ORDER BY member_id) AS rn FROM dbo.ym_Members
),
RegStatuses AS (
    SELECT * FROM (VALUES ('Confirmed'),('Attended'),('Cancelled'),('No Show'),('Waitlisted')) AS v(status)
),
Numbers AS (
    SELECT TOP 200 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.objects a CROSS JOIN sys.objects b
)
INSERT INTO dbo.ym_EventRegistrations (event_id, member_id, registration_date, status, amount_paid, created_at)
SELECT
    ev.event_id,
    mem.member_id,
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    (SELECT TOP 1 status FROM RegStatuses ORDER BY NEWID()),
    CAST(ABS(CHECKSUM(NEWID())) % 200 AS DECIMAL(10,2)),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01')
FROM Numbers nums
INNER JOIN EventIDs ev ON ev.rn = ((nums.n - 1) % 50) + 1
INNER JOIN MemberIDs mem ON mem.rn = ((nums.n - 1) % 300) + 1;
GO

----------------------------------------------------------------------
-- STORED PROCEDURE: sp_MockDataSummary
----------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_MockDataSummary
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 'ym_Chapters' AS TableName, COUNT(*) AS [RowCount] FROM dbo.ym_Chapters
    UNION ALL
    SELECT 'ym_MembershipLevels', COUNT(*) FROM dbo.ym_MembershipLevels
    UNION ALL
    SELECT 'ym_Members', COUNT(*) FROM dbo.ym_Members
    UNION ALL
    SELECT 'ym_Events', COUNT(*) FROM dbo.ym_Events
    UNION ALL
    SELECT 'ym_EventRegistrations', COUNT(*) FROM dbo.ym_EventRegistrations;
END;
GO

----------------------------------------------------------------------
-- ORPHAN CHECK
----------------------------------------------------------------------
-- Run this to verify zero orphans:
-- SELECT 'Orphan Members (Level)' AS CheckType, COUNT(*) AS OrphanCount
-- FROM dbo.ym_Members m LEFT JOIN dbo.ym_MembershipLevels l ON m.membership_level_id = l.level_id WHERE l.level_id IS NULL
-- UNION ALL
-- SELECT 'Orphan Members (Chapter)', COUNT(*)
-- FROM dbo.ym_Members m LEFT JOIN dbo.ym_Chapters c ON m.chapter_id = c.chapter_id WHERE c.chapter_id IS NULL
-- UNION ALL
-- SELECT 'Orphan Events (Chapter)', COUNT(*)
-- FROM dbo.ym_Events e LEFT JOIN dbo.ym_Chapters c ON e.chapter_id = c.chapter_id WHERE c.chapter_id IS NULL
-- UNION ALL
-- SELECT 'Orphan Registrations (Event)', COUNT(*)
-- FROM dbo.ym_EventRegistrations r LEFT JOIN dbo.ym_Events e ON r.event_id = e.event_id WHERE e.event_id IS NULL
-- UNION ALL
-- SELECT 'Orphan Registrations (Member)', COUNT(*)
-- FROM dbo.ym_EventRegistrations r LEFT JOIN dbo.ym_Members m ON r.member_id = m.member_id WHERE m.member_id IS NULL;

PRINT 'MockYourMembership database created successfully.';
GO
