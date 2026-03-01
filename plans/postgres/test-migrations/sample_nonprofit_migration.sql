/* ============================================================
   Sample Nonprofit / Charity Management Database
   Schema: sample_npo
   
   Tables: Campaign, Donor, Donation, Volunteer, Event,
           EventAttendee, VolunteerLog, Grant_
   Views:  vwCampaignProgress, vwDonorSummary,
           vwUpcomingEvents, vwVolunteerLeaderboard
   ============================================================ */

USE SampleNPO;
GO

-- Create the schema for Nonprofit operations
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_npo')
    EXEC('CREATE SCHEMA sample_npo');
GO

/* ============================================================
   Table: Campaign
   Fundraising campaigns with goals and timelines
   ============================================================ */
CREATE TABLE sample_npo.Campaign (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NOT NULL,
    GoalAmount DECIMAL(12,2) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Planning',
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Campaign PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT CK_Campaign_Status CHECK (Status IN ('Planning', 'Active', 'Completed', 'Cancelled')),
    CONSTRAINT CK_Campaign_GoalAmount CHECK (GoalAmount > 0)
);
GO

/* ============================================================
   Table: Donor
   Individual, Corporate, and Foundation donors
   ============================================================ */
CREATE TABLE sample_npo.Donor (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    Phone VARCHAR(20) NULL,
    Address NVARCHAR(300) NULL,
    City NVARCHAR(100) NULL,
    State VARCHAR(2) NULL,
    ZipCode VARCHAR(10) NULL,
    DonorType VARCHAR(20) NOT NULL DEFAULT 'Individual',
    IsAnonymous BIT NOT NULL DEFAULT 0,
    FirstDonationDate DATETIME NULL,
    Notes NVARCHAR(MAX) NULL,
    RegisteredAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Donor PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Donor_Email UNIQUE (Email),
    CONSTRAINT CK_Donor_DonorType CHECK (DonorType IN ('Individual', 'Corporate', 'Foundation'))
);
GO

-- Table: Donation - Financial contributions from donors
CREATE TABLE sample_npo.Donation (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    DonorID UNIQUEIDENTIFIER NOT NULL,
    CampaignID UNIQUEIDENTIFIER NULL,
    Amount DECIMAL(10,2) NOT NULL,
    DonationDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    PaymentMethod VARCHAR(20) NOT NULL,
    IsRecurring BIT NOT NULL DEFAULT 0,
    ReceiptNumber VARCHAR(30) NOT NULL,
    TaxDeductible BIT NOT NULL DEFAULT 1,
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Donation PRIMARY KEY (ID),
    CONSTRAINT FK_Donation_Donor FOREIGN KEY (DonorID) REFERENCES sample_npo.Donor(ID),
    CONSTRAINT FK_Donation_Campaign FOREIGN KEY (CampaignID) REFERENCES sample_npo.Campaign(ID),
    CONSTRAINT UQ_Donation_Receipt UNIQUE (ReceiptNumber),
    CONSTRAINT CK_Donation_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Donation_PaymentMethod CHECK (PaymentMethod IN ('Credit', 'Check', 'Cash', 'Wire', 'ACH', 'Stock'))
);
GO

/* Table: Volunteer - People who donate their time */
CREATE TABLE sample_npo.Volunteer (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    Phone VARCHAR(20) NOT NULL,
    Skills NVARCHAR(MAX) NULL,
    AvailableDays VARCHAR(50) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    JoinDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    TotalHours DECIMAL(8,1) NOT NULL DEFAULT 0,
    CONSTRAINT PK_Volunteer PRIMARY KEY (ID),
    CONSTRAINT UQ_Volunteer_Email UNIQUE (Email)
);
GO

-- Table: Event - Fundraising and community events
CREATE TABLE sample_npo.Event (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    CampaignID UNIQUEIDENTIFIER NULL,
    EventDate DATE NOT NULL,
    StartTime TIME NOT NULL,
    EndTime TIME NOT NULL,
    Location NVARCHAR(300) NOT NULL,
    MaxAttendees INT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Upcoming',
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_Event PRIMARY KEY (ID),
    CONSTRAINT FK_Event_Campaign FOREIGN KEY (CampaignID) REFERENCES sample_npo.Campaign(ID),
    CONSTRAINT CK_Event_Status CHECK (Status IN ('Upcoming', 'InProgress', 'Completed', 'Cancelled'))
);
GO

/* ============================================================
   Table: EventAttendee
   Links donors and volunteers to events with composite unique constraints
   ============================================================ */
CREATE TABLE sample_npo.EventAttendee (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EventID UNIQUEIDENTIFIER NOT NULL,
    DonorID UNIQUEIDENTIFIER NULL,
    VolunteerID UNIQUEIDENTIFIER NULL,
    AttendeeType VARCHAR(20) NOT NULL,
    CheckedIn BIT NOT NULL DEFAULT 0,
    RegisteredAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_EventAttendee PRIMARY KEY (ID),
    CONSTRAINT FK_EventAttendee_Event FOREIGN KEY (EventID) REFERENCES sample_npo.Event(ID),
    CONSTRAINT FK_EventAttendee_Donor FOREIGN KEY (DonorID) REFERENCES sample_npo.Donor(ID),
    CONSTRAINT FK_EventAttendee_Volunteer FOREIGN KEY (VolunteerID) REFERENCES sample_npo.Volunteer(ID),
    -- Note: filtered unique indexes used below for nullable columns
    CONSTRAINT CK_EventAttendee_Type CHECK (AttendeeType IN ('Donor', 'Volunteer', 'Guest'))
);
GO

-- Table: VolunteerLog - Tracks volunteer hours and tasks
CREATE TABLE sample_npo.VolunteerLog (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VolunteerID UNIQUEIDENTIFIER NOT NULL,
    EventID UNIQUEIDENTIFIER NULL,
    LogDate DATE NOT NULL,
    HoursWorked DECIMAL(4,1) NOT NULL,
    TaskDescription NVARCHAR(500) NOT NULL,
    ApprovedBy NVARCHAR(200) NULL,
    IsApproved BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_VolunteerLog PRIMARY KEY (ID),
    CONSTRAINT FK_VolunteerLog_Volunteer FOREIGN KEY (VolunteerID) REFERENCES sample_npo.Volunteer(ID),
    CONSTRAINT FK_VolunteerLog_Event FOREIGN KEY (EventID) REFERENCES sample_npo.Event(ID),
    CONSTRAINT CK_VolunteerLog_Hours CHECK (HoursWorked > 0)
);
GO

/* Table: Grant_ - Grants applied for and received */
CREATE TABLE sample_npo.Grant_ (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    GrantorName NVARCHAR(200) NOT NULL,
    Title NVARCHAR(300) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Amount DECIMAL(12,2) NOT NULL,
    ApplicationDate DATE NOT NULL,
    AwardDate DATE NULL,
    ExpirationDate DATE NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Applied',
    RequirementsNotes NVARCHAR(MAX) NULL,
    CampaignID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_Grant PRIMARY KEY (ID),
    CONSTRAINT FK_Grant_Campaign FOREIGN KEY (CampaignID) REFERENCES sample_npo.Campaign(ID),
    CONSTRAINT CK_Grant_Status CHECK (Status IN ('Applied', 'Awarded', 'Rejected', 'Completed'))
);
GO

/* ============================================================
   Filtered Unique Indexes for Nullable Composite Keys
   ============================================================ */
CREATE UNIQUE INDEX UQ_EventAttendee ON sample_npo.EventAttendee (EventID, DonorID) WHERE DonorID IS NOT NULL;
GO

CREATE UNIQUE INDEX UQ_EventVolunteer ON sample_npo.EventAttendee (EventID, VolunteerID) WHERE VolunteerID IS NOT NULL;
GO

/* ============================================================
   ALTER TABLE CHECK Constraints
   ============================================================ */
ALTER TABLE sample_npo.Donation
    ADD CONSTRAINT CK_Donation_ReceiptLen CHECK (LEN(ReceiptNumber) >= 5);
GO

ALTER TABLE sample_npo.Volunteer
    ADD CONSTRAINT CK_Volunteer_TotalHours CHECK (TotalHours >= 0);
GO

/* ============================================================
   Extended Properties for Documentation
   ============================================================ */
-- Campaign table and key columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Fundraising campaigns with goals and timelines', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Campaign';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the campaign', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Campaign', @level2type = N'COLUMN', @level2name = N'ID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Target fundraising amount for the campaign', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Campaign', @level2type = N'COLUMN', @level2name = N'GoalAmount';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current status: Planning, Active, Completed, or Cancelled', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Campaign', @level2type = N'COLUMN', @level2name = N'Status';
GO

-- Donor table and key columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Individual, corporate, and foundation donors', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Donor';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the donor', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Donor', @level2type = N'COLUMN', @level2name = N'ID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Type of donor: Individual, Corporate, or Foundation', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Donor', @level2type = N'COLUMN', @level2name = N'DonorType';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether the donor prefers to remain anonymous', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Donor', @level2type = N'COLUMN', @level2name = N'IsAnonymous';
GO

-- Donation table and key columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Financial contributions from donors', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Donation';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Donation amount in dollars', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Donation', @level2type = N'COLUMN', @level2name = N'Amount';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this is a tax-deductible contribution', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Donation', @level2type = N'COLUMN', @level2name = N'TaxDeductible';
GO

-- Volunteer table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'People who donate their time to the organization', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Volunteer';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Cumulative hours volunteered', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Volunteer', @level2type = N'COLUMN', @level2name = N'TotalHours';
GO

-- Event table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Fundraising and community events', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Event';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Event start time', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Event', @level2type = N'COLUMN', @level2name = N'StartTime';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Event end time', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Event', @level2type = N'COLUMN', @level2name = N'EndTime';
GO

-- EventAttendee table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Links donors and volunteers to events', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'EventAttendee';
GO

-- VolunteerLog table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Tracks volunteer hours and task descriptions', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'VolunteerLog';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Number of hours worked on this task', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'VolunteerLog', @level2type = N'COLUMN', @level2name = N'HoursWorked';
GO

-- Grant_ table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Grants applied for and received from external organizations', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Grant_';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Grant amount in dollars', @level0type = N'SCHEMA', @level0name = N'sample_npo', @level1type = N'TABLE', @level1name = N'Grant_', @level2type = N'COLUMN', @level2name = N'Amount';
GO

/* ============================================================
   Views
   ============================================================ */

-- View: vwCampaignProgress
-- Shows campaign progress with total raised, donor count, and percentage of goal
CREATE VIEW sample_npo.vwCampaignProgress AS
SELECT
    c.ID AS CampaignID,
    c.Name AS CampaignName,
    c.GoalAmount,
    c.StartDate,
    c.EndDate,
    c.Status,
    ISNULL(SUM(d.Amount), 0) AS TotalRaised,
    COUNT(DISTINCT d.DonorID) AS UniqueDonors,
    COUNT(d.ID) AS DonationCount,
    /* Calculate percentage of goal reached using ROUND and CASE WHEN */
    CASE WHEN c.GoalAmount > 0
        THEN ROUND((ISNULL(SUM(d.Amount), 0) / c.GoalAmount) * 100, 2)
        ELSE 0
    END AS PercentOfGoal,
    -- Calculate days remaining using DATEDIFF
    IIF(c.EndDate >= CAST(GETUTCDATE() AS DATE),
        DATEDIFF(DAY, CAST(GETUTCDATE() AS DATE), c.EndDate),
        0) AS DaysRemaining,
    c.IsActive
FROM sample_npo.Campaign c
LEFT JOIN sample_npo.Donation d ON d.CampaignID = c.ID
GROUP BY c.ID, c.Name, c.GoalAmount, c.StartDate, c.EndDate, c.Status, c.IsActive;
GO

/* View: vwDonorSummary
   Donor statistics including total donated, donation count, and averages */
CREATE VIEW sample_npo.vwDonorSummary AS
SELECT
    dn.ID AS DonorID,
    dn.FirstName,
    dn.LastName,
    dn.Email,
    dn.DonorType,
    dn.IsAnonymous,
    COALESCE(SUM(d.Amount), 0) AS TotalDonated,
    COUNT(d.ID) AS DonationCount,
    -- Average donation using ISNULL for safety
    ISNULL(AVG(d.Amount), 0) AS AverageDonation,
    MAX(d.DonationDate) AS LastDonationDate,
    YEAR(dn.RegisteredAt) AS RegistrationYear,
    /* Sum of tax-deductible amounts using numeric + */
    COALESCE(SUM(CASE WHEN d.TaxDeductible = 1 THEN d.Amount ELSE 0 END), 0) AS TotalTaxDeductible,
    ISNULL(SUM(CASE WHEN d.IsRecurring = 1 THEN d.Amount ELSE 0 END), 0) AS RecurringTotal
FROM sample_npo.Donor dn
LEFT JOIN sample_npo.Donation d ON d.DonorID = dn.ID
GROUP BY dn.ID, dn.FirstName, dn.LastName, dn.Email, dn.DonorType, dn.IsAnonymous, dn.RegisteredAt;
GO

-- View: vwUpcomingEvents
-- Shows upcoming events with campaign name, attendee and volunteer counts
CREATE VIEW sample_npo.vwUpcomingEvents AS
SELECT
    e.ID AS EventID,
    e.Name AS EventName,
    e.EventDate,
    e.StartTime,
    e.EndTime,
    e.Location,
    e.Status,
    e.MaxAttendees,
    ISNULL(c.Name, N'No Campaign') AS CampaignName,
    /* Count attendees by type */
    COUNT(CASE WHEN ea.AttendeeType = 'Donor' THEN 1 END) AS DonorAttendees,
    COUNT(CASE WHEN ea.AttendeeType = 'Volunteer' THEN 1 END) AS VolunteerAttendees,
    COUNT(ea.ID) AS TotalAttendees,
    -- Days until event using DATEDIFF with current date
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), e.EventDate) AS DaysUntilEvent,
    /* Calculate hours between StartTime and EndTime using DATEDIFF with TIME */
    DATEDIFF(MINUTE, e.StartTime, e.EndTime) / 60.0 AS EventDurationHours
FROM sample_npo.Event e
LEFT JOIN sample_npo.Campaign c ON c.ID = e.CampaignID
LEFT JOIN sample_npo.EventAttendee ea ON ea.EventID = e.ID
GROUP BY e.ID, e.Name, e.EventDate, e.StartTime, e.EndTime, e.Location, e.Status, e.MaxAttendees, c.Name;
GO

/* View: vwVolunteerLeaderboard
   Volunteers ordered by total hours with event counts, filtered by HAVING */
CREATE VIEW sample_npo.vwVolunteerLeaderboard AS
SELECT
    v.ID AS VolunteerID,
    v.FirstName,
    v.LastName,
    v.Email,
    v.IsActive,
    SUM(vl.HoursWorked) AS TotalApprovedHours,
    COUNT(DISTINCT vl.ID) AS TotalLogEntries,
    COUNT(DISTINCT ea.EventID) AS EventsAttended,
    -- Month of joining using MONTH()
    MONTH(v.JoinDate) AS JoinMonth,
    YEAR(v.JoinDate) AS JoinYear,
    /* Calculate average hours per log entry */
    ROUND(SUM(vl.HoursWorked) / NULLIF(COUNT(vl.ID), 0), 1) AS AvgHoursPerEntry
FROM sample_npo.Volunteer v
LEFT JOIN sample_npo.VolunteerLog vl ON vl.VolunteerID = v.ID AND vl.IsApproved = 1
LEFT JOIN sample_npo.EventAttendee ea ON ea.VolunteerID = v.ID
GROUP BY v.ID, v.FirstName, v.LastName, v.Email, v.IsActive, v.JoinDate
HAVING SUM(vl.HoursWorked) > 0 OR COUNT(ea.EventID) > 0;
GO

/* ============================================================
   Security: Create Role and Grant Permissions
   ============================================================ */
CREATE ROLE [NpoReader];
GO

GRANT SELECT ON SCHEMA::sample_npo TO [NpoReader];
GO

/* ============================================================
   Sample Data: Campaigns
   ============================================================ */
INSERT INTO sample_npo.Campaign (ID, Name, Description, GoalAmount, StartDate, EndDate, Status, IsActive)
VALUES
    ('A0000001-0001-0001-0001-000000000001', N'Annual Fund Drive 2025', N'Our primary annual fundraising campaign to support general operations and community programs.', 500000.00, '2025-01-15', '2025-12-31', 'Active', 1),
    ('A0000001-0001-0001-0001-000000000002', N'Youth Education Initiative', N'Fundraising for after-school tutoring, scholarships, and STEM programs for local youth.', 150000.00, '2025-03-01', '2025-09-30', 'Active', 1),
    ('A0000001-0001-0001-0001-000000000003', N'Emergency Relief Fund', N'Rapid-response fund for natural disaster relief and community emergencies.', 75000.00, '2025-02-01', '2025-06-30', 'Active', 1),
    ('A0000001-0001-0001-0001-000000000004', N'Community Garden Project', N'Building sustainable community gardens in three underserved neighborhoods.', 25000.00, '2024-06-01', '2024-12-31', 'Completed', 0),
    ('A0000001-0001-0001-0001-000000000005', N'Holiday Giving Campaign', N'Seasonal campaign for holiday meals, gifts, and winter necessities for families in need.', 100000.00, '2025-10-01', '2025-12-25', 'Planning', 1);
GO

/* ============================================================
   Sample Data: Donors (15)
   ============================================================ */
INSERT INTO sample_npo.Donor (ID, FirstName, LastName, Email, Phone, Address, City, State, ZipCode, DonorType, IsAnonymous, FirstDonationDate, Notes)
VALUES
    ('B0000001-0001-0001-0001-000000000001', N'Margaret', N'Thompson', N'margaret.thompson@email.com', '555-0101', N'123 Oak Lane', N'Portland', 'OR', '97201', 'Individual', 0, '2023-03-15', N'Long-time supporter since 2023'),
    ('B0000001-0001-0001-0001-000000000002', N'Robert', N'Chen', N'robert.chen@email.com', '555-0102', N'456 Maple Ave', N'Seattle', 'WA', '98101', 'Individual', 0, '2024-01-10', NULL),
    ('B0000001-0001-0001-0001-000000000003', N'Acme Industries', N'Corp', N'giving@acmeindustries.com', '555-0103', N'789 Business Blvd', N'San Francisco', 'CA', '94102', 'Corporate', 0, '2024-06-01', N'Corporate matching program active'),
    ('B0000001-0001-0001-0001-000000000004', N'Sarah', N'Williams', N'sarah.w@email.com', '555-0104', N'321 Birch St', N'Denver', 'CO', '80201', 'Individual', 1, '2024-08-20', N'Prefers anonymous donations'),
    ('B0000001-0001-0001-0001-000000000005', N'Johnson Family', N'Foundation', N'grants@johnsonfoundation.org', '555-0105', N'100 Foundation Way', N'Chicago', 'IL', '60601', 'Foundation', 0, '2023-01-05', N'Annual grant partner'),
    ('B0000001-0001-0001-0001-000000000006', N'David', N'Martinez', N'david.m@email.com', '555-0106', N'555 Pine Rd', N'Austin', 'TX', '73301', 'Individual', 0, '2025-01-20', NULL),
    ('B0000001-0001-0001-0001-000000000007', N'Emily', N'Nakamura', N'emily.n@email.com', '555-0107', N'777 Cedar Ct', N'Portland', 'OR', '97202', 'Individual', 0, '2024-11-15', N'Interested in youth programs'),
    ('B0000001-0001-0001-0001-000000000008', N'TechForGood', N'Inc', N'csr@techforgood.com', '555-0108', N'200 Innovation Dr', N'San Jose', 'CA', '95101', 'Corporate', 0, '2024-03-01', N'Technology company CSR program'),
    ('B0000001-0001-0001-0001-000000000009', N'Patricia', N'O''Brien', N'patricia.ob@email.com', '555-0109', N'888 Elm Way', N'Boston', 'MA', '02101', 'Individual', 0, '2023-07-22', NULL),
    ('B0000001-0001-0001-0001-000000000010', N'Green Earth', N'Foundation', N'info@greenearthfdn.org', '555-0110', N'50 Nature Lane', N'Eugene', 'OR', '97401', 'Foundation', 0, '2024-04-10', N'Environmental focus grants'),
    ('B0000001-0001-0001-0001-000000000011', N'James', N'Washington', N'james.w@email.com', '555-0111', NULL, NULL, NULL, NULL, 'Individual', 1, '2025-02-01', N'Anonymous donor'),
    ('B0000001-0001-0001-0001-000000000012', N'Lisa', N'Patel', N'lisa.patel@email.com', '555-0112', N'432 Walnut Blvd', N'Phoenix', 'AZ', '85001', 'Individual', 0, '2024-09-05', NULL),
    ('B0000001-0001-0001-0001-000000000013', N'Community Builders', N'LLC', N'donate@communitybuilders.com', '555-0113', N'600 Main St', N'Portland', 'OR', '97203', 'Corporate', 0, '2023-11-20', N'Local business supporter'),
    ('B0000001-0001-0001-0001-000000000014', N'Michael', N'Kim', N'michael.kim@email.com', '555-0114', N'175 Spruce Ave', N'Seattle', 'WA', '98102', 'Individual', 0, '2025-03-10', N'New donor, referred by Margaret'),
    ('B0000001-0001-0001-0001-000000000015', N'Anna', N'Rosenberg', N'anna.r@email.com', NULL, N'290 Oak Park Dr', N'Minneapolis', 'MN', '55401', 'Individual', 0, '2024-05-18', N'Monthly recurring donor');
GO

/* ============================================================
   Sample Data: Donations (30)
   ============================================================ */
INSERT INTO sample_npo.Donation (ID, DonorID, CampaignID, Amount, DonationDate, PaymentMethod, IsRecurring, ReceiptNumber, TaxDeductible, Notes)
VALUES
    ('C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', 5000.00, '2025-01-20', 'Credit', 0, 'RCP-2025-00001', 1, N'Annual gift'),
    ('C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000001', 250.00, '2025-01-25', 'Credit', 1, 'RCP-2025-00002', 1, NULL),
    ('C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000001', 25000.00, '2025-02-01', 'Wire', 0, 'RCP-2025-00003', 1, N'Corporate matching donation'),
    ('C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000002', 1000.00, '2025-02-15', 'Check', 0, 'RCP-2025-00004', 1, N'Anonymous gift for youth programs'),
    ('C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000002', 50000.00, '2025-03-05', 'Wire', 0, 'RCP-2025-00005', 1, N'Foundation annual grant'),
    ('C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000003', 2500.00, '2025-02-10', 'Credit', 0, 'RCP-2025-00006', 1, N'Emergency relief contribution'),
    ('C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000006', 'A0000001-0001-0001-0001-000000000001', 100.00, '2025-02-20', 'Cash', 0, 'RCP-2025-00007', 1, NULL),
    ('C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000002', 500.00, '2025-03-01', 'Credit', 1, 'RCP-2025-00008', 1, N'Monthly for youth education'),
    ('C0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000001', 10000.00, '2025-03-10', 'ACH', 0, 'RCP-2025-00009', 1, N'CSR quarterly donation'),
    ('C0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000009', NULL, 750.00, '2025-03-15', 'Check', 0, 'RCP-2025-00010', 1, N'General fund'),
    ('C0000001-0001-0001-0001-000000000011', 'B0000001-0001-0001-0001-000000000010', 'A0000001-0001-0001-0001-000000000004', 15000.00, '2024-07-01', 'Wire', 0, 'RCP-2024-00011', 1, N'Garden project grant'),
    ('C0000001-0001-0001-0001-000000000012', 'B0000001-0001-0001-0001-000000000011', 'A0000001-0001-0001-0001-000000000003', 500.00, '2025-02-28', 'Cash', 0, 'RCP-2025-00012', 0, N'Anonymous cash donation'),
    ('C0000001-0001-0001-0001-000000000013', 'B0000001-0001-0001-0001-000000000012', 'A0000001-0001-0001-0001-000000000001', 200.00, '2025-03-20', 'Credit', 1, 'RCP-2025-00013', 1, NULL),
    ('C0000001-0001-0001-0001-000000000014', 'B0000001-0001-0001-0001-000000000013', 'A0000001-0001-0001-0001-000000000001', 5000.00, '2025-01-30', 'Check', 0, 'RCP-2025-00014', 1, N'Community builders annual gift'),
    ('C0000001-0001-0001-0001-000000000015', 'B0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000001', 250.00, '2025-02-25', 'Credit', 1, 'RCP-2025-00015', 1, N'Monthly recurring'),
    ('C0000001-0001-0001-0001-000000000016', 'B0000001-0001-0001-0001-000000000014', 'A0000001-0001-0001-0001-000000000002', 300.00, '2025-03-15', 'Credit', 0, 'RCP-2025-00016', 1, N'First donation'),
    ('C0000001-0001-0001-0001-000000000017', 'B0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000001', 150.00, '2025-01-15', 'ACH', 1, 'RCP-2025-00017', 1, N'Monthly recurring'),
    ('C0000001-0001-0001-0001-000000000018', 'B0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000001', 150.00, '2025-02-15', 'ACH', 1, 'RCP-2025-00018', 1, N'Monthly recurring'),
    ('C0000001-0001-0001-0001-000000000019', 'B0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000001', 150.00, '2025-03-15', 'ACH', 1, 'RCP-2025-00019', 1, N'Monthly recurring'),
    ('C0000001-0001-0001-0001-000000000020', 'B0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000002', 3000.00, '2025-03-25', 'Credit', 0, 'RCP-2025-00020', 1, N'Youth education support'),
    ('C0000001-0001-0001-0001-000000000021', 'B0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000003', 10000.00, '2025-03-01', 'Wire', 0, 'RCP-2025-00021', 1, N'Emergency fund corporate match'),
    ('C0000001-0001-0001-0001-000000000022', 'B0000001-0001-0001-0001-000000000006', 'A0000001-0001-0001-0001-000000000002', 150.00, '2025-03-28', 'Credit', 0, 'RCP-2025-00022', 1, NULL),
    ('C0000001-0001-0001-0001-000000000023', 'B0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000002', 500.00, '2025-04-01', 'Credit', 1, 'RCP-2025-00023', 1, N'Monthly for youth education'),
    ('C0000001-0001-0001-0001-000000000024', 'B0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000001', 1000.00, '2025-04-05', 'Check', 0, 'RCP-2025-00024', 1, NULL),
    ('C0000001-0001-0001-0001-000000000025', 'B0000001-0001-0001-0001-000000000004', NULL, 2000.00, '2025-04-10', 'Wire', 0, 'RCP-2025-00025', 1, N'General unrestricted'),
    ('C0000001-0001-0001-0001-000000000026', 'B0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000002', 7500.00, '2025-04-15', 'ACH', 0, 'RCP-2025-00026', 1, N'Tech education sponsorship'),
    ('C0000001-0001-0001-0001-000000000027', 'B0000001-0001-0001-0001-000000000012', 'A0000001-0001-0001-0001-000000000003', 100.00, '2025-03-05', 'Credit', 0, 'RCP-2025-00027', 1, NULL),
    ('C0000001-0001-0001-0001-000000000028', 'B0000001-0001-0001-0001-000000000013', 'A0000001-0001-0001-0001-000000000004', 3000.00, '2024-08-15', 'Check', 0, 'RCP-2024-00028', 1, N'Garden project support'),
    ('C0000001-0001-0001-0001-000000000029', 'B0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000001', 25000.00, '2025-04-20', 'Wire', 0, 'RCP-2025-00029', 1, N'Foundation mid-year grant'),
    ('C0000001-0001-0001-0001-000000000030', 'B0000001-0001-0001-0001-000000000014', 'A0000001-0001-0001-0001-000000000003', 500.00, '2025-04-22', 'Stock', 0, 'RCP-2025-00030', 1, N'Stock donation for emergency fund');
GO

/* ============================================================
   Sample Data: Volunteers (10)
   ============================================================ */
INSERT INTO sample_npo.Volunteer (ID, FirstName, LastName, Email, Phone, Skills, AvailableDays, IsActive, TotalHours)
VALUES
    ('D0000001-0001-0001-0001-000000000001', N'Carlos', N'Rivera', N'carlos.r@email.com', '555-0201', N'Event planning, Photography', 'Mon,Wed,Fri', 1, 45.5),
    ('D0000001-0001-0001-0001-000000000002', N'Jessica', N'Liu', N'jessica.liu@email.com', '555-0202', N'Teaching, Mentoring, Tutoring', 'Tue,Thu,Sat', 1, 120.0),
    ('D0000001-0001-0001-0001-000000000003', N'Ahmed', N'Hassan', N'ahmed.h@email.com', '555-0203', N'Construction, Landscaping', 'Sat,Sun', 1, 80.0),
    ('D0000001-0001-0001-0001-000000000004', N'Rachel', N'Green', N'rachel.g@email.com', '555-0204', N'Cooking, Food service', 'Wed,Sat', 1, 35.0),
    ('D0000001-0001-0001-0001-000000000005', N'Thomas', N'Wright', N'thomas.w@email.com', '555-0205', N'IT support, Web development', 'Mon,Tue,Wed', 1, 60.5),
    ('D0000001-0001-0001-0001-000000000006', N'Maria', N'Gonzalez', N'maria.g@email.com', '555-0206', N'Translation, Community outreach', 'Mon,Thu,Fri', 1, 95.0),
    ('D0000001-0001-0001-0001-000000000007', N'Kevin', N'Park', N'kevin.p@email.com', '555-0207', N'Graphic design, Social media', 'Fri,Sat,Sun', 1, 25.0),
    ('D0000001-0001-0001-0001-000000000008', N'Susan', N'Baker', N'susan.b@email.com', '555-0208', N'Accounting, Data entry', 'Mon,Wed', 0, 15.0),
    ('D0000001-0001-0001-0001-000000000009', N'Daniel', N'Foster', N'daniel.f@email.com', '555-0209', N'First aid, CPR certified', 'Sat,Sun', 1, 40.0),
    ('D0000001-0001-0001-0001-000000000010', N'Sophie', N'Anderson', N'sophie.a@email.com', '555-0210', N'Music, Entertainment', 'Fri,Sat', 1, 18.0);
GO

-- Sample Data: Events (8)
INSERT INTO sample_npo.Event (ID, Name, Description, CampaignID, EventDate, StartTime, EndTime, Location, MaxAttendees, Status)
VALUES
    ('E0000001-0001-0001-0001-000000000001', N'Spring Gala Fundraiser', N'Annual black-tie gala dinner with silent auction and live entertainment.', 'A0000001-0001-0001-0001-000000000001', '2025-04-15', '18:00:00', '23:00:00', N'Grand Ballroom, Portland Convention Center', 300, 'Completed'),
    ('E0000001-0001-0001-0001-000000000002', N'Youth STEM Workshop', N'Hands-on science and technology workshop for kids ages 8-14.', 'A0000001-0001-0001-0001-000000000002', '2025-05-10', '09:00:00', '15:00:00', N'Community Center, 500 Learning Way', 50, 'Upcoming'),
    ('E0000001-0001-0001-0001-000000000003', N'Emergency Supply Drive', N'Collection event for emergency supplies, blankets, and food items.', 'A0000001-0001-0001-0001-000000000003', '2025-03-22', '08:00:00', '16:00:00', N'Warehouse District, 100 Storage Blvd', NULL, 'Completed'),
    ('E0000001-0001-0001-0001-000000000004', N'Community Garden Planting Day', N'Volunteers plant seedlings and install irrigation in the new community garden.', 'A0000001-0001-0001-0001-000000000004', '2024-09-15', '07:00:00', '14:00:00', N'Riverside Park Community Garden', 40, 'Completed'),
    ('E0000001-0001-0001-0001-000000000005', N'Summer 5K Charity Run', N'Annual charity run through downtown with prizes and post-race celebration.', 'A0000001-0001-0001-0001-000000000001', '2025-07-04', '06:30:00', '11:00:00', N'Pioneer Courthouse Square, Portland', 500, 'Upcoming'),
    ('E0000001-0001-0001-0001-000000000006', N'Donor Appreciation Dinner', N'Thank-you dinner for top donors and long-term supporters.', 'A0000001-0001-0001-0001-000000000001', '2025-06-20', '19:00:00', '22:00:00', N'The Garden Restaurant, 250 Fine Dining Ave', 75, 'Upcoming'),
    ('E0000001-0001-0001-0001-000000000007', N'Back-to-School Supply Giveaway', N'Free school supplies for children in underserved communities.', 'A0000001-0001-0001-0001-000000000002', '2025-08-20', '10:00:00', '14:00:00', N'Lincoln Elementary School Gymnasium', 200, 'Upcoming'),
    ('E0000001-0001-0001-0001-000000000008', N'Holiday Toy Collection Kickoff', N'Launch event for the holiday giving campaign toy collection drive.', 'A0000001-0001-0001-0001-000000000005', '2025-10-15', '11:00:00', '17:00:00', N'Central Mall Atrium', 150, 'Upcoming');
GO

/* ============================================================
   Sample Data: EventAttendees
   ============================================================ */
INSERT INTO sample_npo.EventAttendee (ID, EventID, DonorID, VolunteerID, AttendeeType, CheckedIn)
VALUES
    -- Spring Gala attendees
    ('F0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', NULL, 'Donor', 1),
    ('F0000001-0001-0001-0001-000000000002', 'E0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000003', NULL, 'Donor', 1),
    ('F0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000005', NULL, 'Donor', 1),
    ('F0000001-0001-0001-0001-000000000004', 'E0000001-0001-0001-0001-000000000001', NULL, 'D0000001-0001-0001-0001-000000000001', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000005', 'E0000001-0001-0001-0001-000000000001', NULL, 'D0000001-0001-0001-0001-000000000007', 'Volunteer', 1),
    -- STEM Workshop attendees
    ('F0000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000007', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000007', 'E0000001-0001-0001-0001-000000000002', NULL, 'D0000001-0001-0001-0001-000000000002', 'Volunteer', 0),
    ('F0000001-0001-0001-0001-000000000008', 'E0000001-0001-0001-0001-000000000002', NULL, 'D0000001-0001-0001-0001-000000000005', 'Volunteer', 0),
    -- Emergency Supply Drive
    ('F0000001-0001-0001-0001-000000000009', 'E0000001-0001-0001-0001-000000000003', NULL, 'D0000001-0001-0001-0001-000000000003', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000010', 'E0000001-0001-0001-0001-000000000003', NULL, 'D0000001-0001-0001-0001-000000000006', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000011', 'E0000001-0001-0001-0001-000000000003', NULL, 'D0000001-0001-0001-0001-000000000009', 'Volunteer', 1),
    -- Garden Planting Day
    ('F0000001-0001-0001-0001-000000000012', 'E0000001-0001-0001-0001-000000000004', NULL, 'D0000001-0001-0001-0001-000000000003', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000013', 'E0000001-0001-0001-0001-000000000004', NULL, 'D0000001-0001-0001-0001-000000000004', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000014', 'E0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000010', NULL, 'Donor', 1),
    -- 5K Run
    ('F0000001-0001-0001-0001-000000000015', 'E0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000002', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000016', 'E0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000012', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000017', 'E0000001-0001-0001-0001-000000000005', NULL, 'D0000001-0001-0001-0001-000000000009', 'Volunteer', 0),
    -- Donor Appreciation Dinner
    ('F0000001-0001-0001-0001-000000000018', 'E0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000001', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000019', 'E0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000005', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000020', 'E0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000009', NULL, 'Donor', 0);
GO

/* ============================================================
   Sample Data: VolunteerLog
   ============================================================ */
INSERT INTO sample_npo.VolunteerLog (ID, VolunteerID, EventID, LogDate, HoursWorked, TaskDescription, ApprovedBy, IsApproved)
VALUES
    ('A1000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000001', '2025-04-15', 6.0, N'Event photography and setup coordination', N'Margaret Thompson', 1),
    ('A1000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000002', NULL, '2025-04-18', 3.0, N'After-school tutoring session - math and science', N'Emily Nakamura', 1),
    ('A1000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000003', '2025-03-22', 8.0, N'Loading and organizing emergency supplies', N'Carlos Rivera', 1),
    ('A1000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000004', '2024-09-15', 7.0, N'Digging garden beds and installing drip irrigation', N'Rachel Green', 1),
    ('A1000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000004', 'E0000001-0001-0001-0001-000000000004', '2024-09-15', 5.0, N'Planting seedlings and preparing compost areas', N'Ahmed Hassan', 1),
    ('A1000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000005', NULL, '2025-04-01', 4.0, N'Website maintenance and donor portal updates', N'Thomas Wright', 1),
    ('A1000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000003', '2025-03-22', 8.0, N'Spanish translation and community liaison', N'Carlos Rivera', 1),
    ('A1000001-0001-0001-0001-000000000008', 'D0000001-0001-0001-0001-000000000007', 'E0000001-0001-0001-0001-000000000001', '2025-04-15', 5.0, N'Designed event materials and managed social media coverage', N'Margaret Thompson', 1),
    ('A1000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000009', 'E0000001-0001-0001-0001-000000000003', '2025-03-22', 6.0, N'First aid station management during supply drive', N'Maria Gonzalez', 1),
    ('A1000001-0001-0001-0001-000000000010', 'D0000001-0001-0001-0001-000000000002', NULL, '2025-04-22', 2.5, N'One-on-one mentoring session with high school student', NULL, 0),
    ('A1000001-0001-0001-0001-000000000011', 'D0000001-0001-0001-0001-000000000006', NULL, '2025-04-20', 3.0, N'Community outreach flyer distribution', N'Jessica Liu', 1),
    ('A1000001-0001-0001-0001-000000000012', 'D0000001-0001-0001-0001-000000000010', NULL, '2025-04-12', 2.0, N'Performed at community center open mic night', NULL, 0);
GO

-- Sample Data: Grants (3)
INSERT INTO sample_npo.Grant_ (ID, GrantorName, Title, Description, Amount, ApplicationDate, AwardDate, ExpirationDate, Status, RequirementsNotes, CampaignID)
VALUES
    ('A2000001-0001-0001-0001-000000000001', N'National Education Foundation', N'Youth STEM Advancement Grant', N'Grant to fund after-school STEM programs, equipment, and instructor stipends for underserved communities.', 75000.00, '2025-01-15', '2025-03-01', '2026-03-01', 'Awarded', N'Quarterly progress reports required. Must serve minimum 100 students per semester.', 'A0000001-0001-0001-0001-000000000002'),
    ('A2000001-0001-0001-0001-000000000002', N'City of Portland Community Fund', N'Neighborhood Resilience Initiative', N'Funding for emergency preparedness programs and community resilience infrastructure.', 30000.00, '2025-02-20', NULL, NULL, 'Applied', N'Must demonstrate community partnerships. Matching funds preferred.', 'A0000001-0001-0001-0001-000000000003'),
    ('A2000001-0001-0001-0001-000000000003', N'Pacific Northwest Environmental Trust', N'Urban Green Spaces Program', N'Support for expanding community garden network and urban agriculture education.', 20000.00, '2024-04-10', '2024-06-15', '2025-06-15', 'Completed', N'Final report submitted. All deliverables met.', 'A0000001-0001-0001-0001-000000000004');
GO

PRINT N'Sample nonprofit database setup complete.';
GO
