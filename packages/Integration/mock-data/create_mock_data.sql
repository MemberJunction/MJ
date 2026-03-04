-- =============================================================================
-- mock_data Database Setup
-- =============================================================================
-- Single database with schemas for each source system:
--   hs  = HubSpot CRM
--   sf  = Salesforce CRM
--   ym  = YourMembership AMS
--
-- Usage:
--   sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -i create_mock_data.sql
-- =============================================================================

USE master;
GO

IF EXISTS (SELECT 1 FROM sys.databases WHERE name = 'mock_data')
BEGIN
    ALTER DATABASE mock_data SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE mock_data;
END
GO

CREATE DATABASE mock_data;
GO

USE mock_data;
GO

-- =============================================================================
-- SCHEMA: hs (HubSpot)
-- =============================================================================
CREATE SCHEMA hs;
GO

CREATE TABLE hs.contacts (
    vid BIGINT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(255),
    firstname NVARCHAR(100),
    lastname NVARCHAR(100),
    phone NVARCHAR(50),
    company NVARCHAR(200),
    jobtitle NVARCHAR(200),
    lifecyclestage NVARCHAR(50) DEFAULT 'lead',
    hs_lead_status NVARCHAR(50),
    createdate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    lastmodifieddate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    hs_object_id BIGINT
);
GO

CREATE TABLE hs.companies (
    companyId BIGINT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    domain NVARCHAR(200),
    industry NVARCHAR(100),
    numberofemployees INT,
    annualrevenue DECIMAL(18,2),
    city NVARCHAR(100),
    state NVARCHAR(50),
    country NVARCHAR(100),
    phone NVARCHAR(50),
    createdate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    lastmodifieddate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    hs_object_id BIGINT
);
GO

CREATE TABLE hs.deals (
    dealId BIGINT IDENTITY(1,1) PRIMARY KEY,
    dealname NVARCHAR(200) NOT NULL,
    amount DECIMAL(18,2),
    dealstage NVARCHAR(50),
    pipeline NVARCHAR(100) DEFAULT 'default',
    closedate DATETIMEOFFSET,
    associatedCompanyId BIGINT,
    associatedContactId BIGINT,
    createdate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    lastmodifieddate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    hs_object_id BIGINT,
    FOREIGN KEY (associatedCompanyId) REFERENCES hs.companies(companyId),
    FOREIGN KEY (associatedContactId) REFERENCES hs.contacts(vid)
);
GO

-- =============================================================================
-- SCHEMA: sf (Salesforce)
-- =============================================================================
CREATE SCHEMA sf;
GO

CREATE TABLE sf.Account (
    Id NVARCHAR(18) PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    Industry NVARCHAR(100),
    Type NVARCHAR(50),
    BillingStreet NVARCHAR(255),
    BillingCity NVARCHAR(100),
    BillingState NVARCHAR(50),
    BillingPostalCode NVARCHAR(20),
    BillingCountry NVARCHAR(100),
    Phone NVARCHAR(50),
    Website NVARCHAR(255),
    NumberOfEmployees INT,
    AnnualRevenue DECIMAL(18,2),
    CreatedDate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    LastModifiedDate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    SystemModstamp DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE TABLE sf.Contact (
    Id NVARCHAR(18) PRIMARY KEY,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255),
    Phone NVARCHAR(50),
    Title NVARCHAR(200),
    AccountId NVARCHAR(18),
    MailingStreet NVARCHAR(255),
    MailingCity NVARCHAR(100),
    MailingState NVARCHAR(50),
    MailingPostalCode NVARCHAR(20),
    MailingCountry NVARCHAR(100),
    LeadSource NVARCHAR(100),
    CreatedDate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    LastModifiedDate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    SystemModstamp DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT FK_Contact_Account FOREIGN KEY (AccountId) REFERENCES sf.Account(Id)
);
GO

CREATE TABLE sf.Opportunity (
    Id NVARCHAR(18) PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    Amount DECIMAL(18,2),
    StageName NVARCHAR(50) NOT NULL,
    CloseDate DATE NOT NULL,
    AccountId NVARCHAR(18),
    Probability INT,
    LeadSource NVARCHAR(100),
    Type NVARCHAR(50),
    CreatedDate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    LastModifiedDate DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    SystemModstamp DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    FOREIGN KEY (AccountId) REFERENCES sf.Account(Id)
);
GO

-- =============================================================================
-- SCHEMA: ym (YourMembership)
-- =============================================================================
CREATE SCHEMA ym;
GO

CREATE TABLE ym.membership_types (
    type_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500),
    annual_dues DECIMAL(10,2),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE TABLE ym.members (
    member_id INT IDENTITY(1,1) PRIMARY KEY,
    member_number NVARCHAR(50) UNIQUE,
    first_name NVARCHAR(100),
    last_name NVARCHAR(100) NOT NULL,
    email NVARCHAR(255),
    phone NVARCHAR(50),
    address_line1 NVARCHAR(255),
    city NVARCHAR(100),
    state NVARCHAR(50),
    postal_code NVARCHAR(20),
    country NVARCHAR(100) DEFAULT 'US',
    membership_type_id INT,
    join_date DATE,
    expiration_date DATE,
    status NVARCHAR(20) DEFAULT 'Active',
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT FK_Members_MembershipType FOREIGN KEY (membership_type_id) REFERENCES ym.membership_types(type_id)
);
GO

CREATE TABLE ym.events (
    event_id INT IDENTITY(1,1) PRIMARY KEY,
    title NVARCHAR(200) NOT NULL,
    description NVARCHAR(2000),
    start_date DATETIMEOFFSET,
    end_date DATETIMEOFFSET,
    location NVARCHAR(200),
    max_attendees INT,
    registration_fee DECIMAL(10,2) DEFAULT 0,
    status NVARCHAR(20) DEFAULT 'Open',
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE TABLE ym.event_registrations (
    registration_id INT IDENTITY(1,1) PRIMARY KEY,
    event_id INT NOT NULL,
    member_id INT NOT NULL,
    registration_date DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    status NVARCHAR(20) DEFAULT 'Registered',
    amount_paid DECIMAL(10,2) DEFAULT 0,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    FOREIGN KEY (event_id) REFERENCES ym.events(event_id),
    FOREIGN KEY (member_id) REFERENCES ym.members(member_id)
);
GO

-- =============================================================================
-- SEED DATA: hs.companies (20 rows)
-- =============================================================================
SET IDENTITY_INSERT hs.companies ON;
INSERT INTO hs.companies (companyId, name, domain, industry, numberofemployees, annualrevenue, city, state, country, phone, hs_object_id)
VALUES
(1, 'Acme Corporation', 'acme.com', 'Technology', 500, 50000000.00, 'San Francisco', 'CA', 'US', '415-555-0100', 1001),
(2, 'GlobalTech Solutions', 'globaltech.com', 'Technology', 1200, 120000000.00, 'Austin', 'TX', 'US', '512-555-0200', 1002),
(3, 'Pinnacle Healthcare', 'pinnaclehealth.com', 'Healthcare', 800, 80000000.00, 'Boston', 'MA', 'US', '617-555-0300', 1003),
(4, 'Summit Financial Group', 'summitfin.com', 'Financial Services', 350, 45000000.00, 'New York', 'NY', 'US', '212-555-0400', 1004),
(5, 'Pacific Manufacturing', 'pacmfg.com', 'Manufacturing', 2000, 200000000.00, 'Portland', 'OR', 'US', '503-555-0500', 1005),
(6, 'Horizon Media Partners', 'horizonmedia.com', 'Media', 150, 18000000.00, 'Los Angeles', 'CA', 'US', '310-555-0600', 1006),
(7, 'Atlas Logistics', 'atlaslog.com', 'Transportation', 600, 55000000.00, 'Chicago', 'IL', 'US', '312-555-0700', 1007),
(8, 'Evergreen Education', 'evergreened.com', 'Education', 300, 25000000.00, 'Seattle', 'WA', 'US', '206-555-0800', 1008),
(9, 'Sapphire Consulting', 'sapphireco.com', 'Consulting', 100, 12000000.00, 'Denver', 'CO', 'US', '303-555-0900', 1009),
(10, 'RedRock Energy', 'redrockenergy.com', 'Energy', 450, 60000000.00, 'Houston', 'TX', 'US', '713-555-1000', 1010),
(11, 'BlueSky Analytics', 'blueskydata.com', 'Technology', 75, 8000000.00, 'Nashville', 'TN', 'US', '615-555-1100', 1011),
(12, 'Cascade Construction', 'cascadecon.com', 'Construction', 900, 95000000.00, 'Phoenix', 'AZ', 'US', '602-555-1200', 1012),
(13, 'Meridian Insurance', 'meridianins.com', 'Insurance', 400, 40000000.00, 'Atlanta', 'GA', 'US', '404-555-1300', 1013),
(14, 'Vanguard Biotech', 'vanguardbio.com', 'Biotechnology', 250, 30000000.00, 'San Diego', 'CA', 'US', '619-555-1400', 1014),
(15, 'Northstar Retail', 'northstarretail.com', 'Retail', 1500, 150000000.00, 'Minneapolis', 'MN', 'US', '612-555-1500', 1015),
(16, 'Iron Bridge Capital', 'ironbridgecap.com', 'Financial Services', 80, 10000000.00, 'Charlotte', 'NC', 'US', '704-555-1600', 1016),
(17, 'TerraFirma Agriculture', 'terrafirmaag.com', 'Agriculture', 200, 22000000.00, 'Des Moines', 'IA', 'US', '515-555-1700', 1017),
(18, 'Lighthouse Legal', 'lighthouselaw.com', 'Legal', 60, 7000000.00, 'Philadelphia', 'PA', 'US', '215-555-1800', 1018),
(19, 'Crestview Hospitality', 'crestviewhosp.com', 'Hospitality', 1000, 100000000.00, 'Miami', 'FL', 'US', '305-555-1900', 1019),
(20, 'Quantum Aerospace', 'quantumaero.com', 'Aerospace', 700, 75000000.00, 'Dallas', 'TX', 'US', '214-555-2000', 1020);
SET IDENTITY_INSERT hs.companies OFF;
GO

-- =============================================================================
-- SEED DATA: hs.contacts (50 rows)
-- =============================================================================
SET IDENTITY_INSERT hs.contacts ON;
INSERT INTO hs.contacts (vid, email, firstname, lastname, phone, company, jobtitle, lifecyclestage, hs_lead_status, hs_object_id)
VALUES
(1, 'john.smith@acme.com', 'John', 'Smith', '415-555-0101', 'Acme Corporation', 'VP of Engineering', 'customer', 'Connected', 2001),
(2, 'sarah.johnson@acme.com', 'Sarah', 'Johnson', '415-555-0102', 'Acme Corporation', 'Product Manager', 'customer', 'Connected', 2002),
(3, 'michael.chen@globaltech.com', 'Michael', 'Chen', '512-555-0201', 'GlobalTech Solutions', 'CTO', 'customer', 'Connected', 2003),
(4, 'emily.williams@globaltech.com', 'Emily', 'Williams', '512-555-0202', 'GlobalTech Solutions', 'Director of Sales', 'opportunity', 'Open', 2004),
(5, 'david.brown@pinnaclehealth.com', 'David', 'Brown', '617-555-0301', 'Pinnacle Healthcare', 'CEO', 'customer', 'Connected', 2005),
(6, 'lisa.martinez@pinnaclehealth.com', 'Lisa', 'Martinez', '617-555-0302', 'Pinnacle Healthcare', 'CFO', 'customer', 'Connected', 2006),
(7, 'james.davis@summitfin.com', 'James', 'Davis', '212-555-0401', 'Summit Financial Group', 'Managing Director', 'customer', 'Connected', 2007),
(8, 'jennifer.wilson@summitfin.com', 'Jennifer', 'Wilson', '212-555-0402', 'Summit Financial Group', 'VP of Operations', 'opportunity', 'In Progress', 2008),
(9, 'robert.taylor@pacmfg.com', 'Robert', 'Taylor', '503-555-0501', 'Pacific Manufacturing', 'Plant Manager', 'customer', 'Connected', 2009),
(10, 'amanda.anderson@pacmfg.com', 'Amanda', 'Anderson', '503-555-0502', 'Pacific Manufacturing', 'Quality Director', 'lead', 'New', 2010),
(11, 'william.thomas@horizonmedia.com', 'William', 'Thomas', '310-555-0601', 'Horizon Media Partners', 'Creative Director', 'customer', 'Connected', 2011),
(12, 'jessica.jackson@horizonmedia.com', 'Jessica', 'Jackson', '310-555-0602', 'Horizon Media Partners', 'Account Manager', 'opportunity', 'Open', 2012),
(13, 'daniel.white@atlaslog.com', 'Daniel', 'White', '312-555-0701', 'Atlas Logistics', 'VP of Logistics', 'customer', 'Connected', 2013),
(14, 'ashley.harris@atlaslog.com', 'Ashley', 'Harris', '312-555-0702', 'Atlas Logistics', 'Fleet Manager', 'lead', 'New', 2014),
(15, 'christopher.martin@evergreened.com', 'Christopher', 'Martin', '206-555-0801', 'Evergreen Education', 'Dean', 'customer', 'Connected', 2015),
(16, 'nicole.garcia@evergreened.com', 'Nicole', 'Garcia', '206-555-0802', 'Evergreen Education', 'Registrar', 'customer', 'Connected', 2016),
(17, 'matthew.rodriguez@sapphireco.com', 'Matthew', 'Rodriguez', '303-555-0901', 'Sapphire Consulting', 'Senior Partner', 'customer', 'Connected', 2017),
(18, 'stephanie.lee@sapphireco.com', 'Stephanie', 'Lee', '303-555-0902', 'Sapphire Consulting', 'Analyst', 'lead', 'Open', 2018),
(19, 'andrew.walker@redrockenergy.com', 'Andrew', 'Walker', '713-555-1001', 'RedRock Energy', 'VP of Exploration', 'customer', 'Connected', 2019),
(20, 'rachel.hall@redrockenergy.com', 'Rachel', 'Hall', '713-555-1002', 'RedRock Energy', 'Environmental Mgr', 'opportunity', 'In Progress', 2020),
(21, 'kevin.allen@blueskydata.com', 'Kevin', 'Allen', '615-555-1101', 'BlueSky Analytics', 'Data Scientist', 'lead', 'New', 2021),
(22, 'laura.young@blueskydata.com', 'Laura', 'Young', '615-555-1102', 'BlueSky Analytics', 'CEO', 'customer', 'Connected', 2022),
(23, 'brian.king@cascadecon.com', 'Brian', 'King', '602-555-1201', 'Cascade Construction', 'Project Director', 'customer', 'Connected', 2023),
(24, 'maria.wright@cascadecon.com', 'Maria', 'Wright', '602-555-1202', 'Cascade Construction', 'Safety Officer', 'lead', 'Open', 2024),
(25, 'steven.lopez@meridianins.com', 'Steven', 'Lopez', '404-555-1301', 'Meridian Insurance', 'Underwriter', 'customer', 'Connected', 2025),
(26, 'kimberly.hill@meridianins.com', 'Kimberly', 'Hill', '404-555-1302', 'Meridian Insurance', 'Claims Director', 'customer', 'Connected', 2026),
(27, 'jason.scott@vanguardbio.com', 'Jason', 'Scott', '619-555-1401', 'Vanguard Biotech', 'Research Director', 'customer', 'Connected', 2027),
(28, 'michelle.green@vanguardbio.com', 'Michelle', 'Green', '619-555-1402', 'Vanguard Biotech', 'Lab Manager', 'opportunity', 'Open', 2028),
(29, 'ryan.adams@northstarretail.com', 'Ryan', 'Adams', '612-555-1501', 'Northstar Retail', 'VP of Merchandising', 'customer', 'Connected', 2029),
(30, 'elizabeth.baker@northstarretail.com', 'Elizabeth', 'Baker', '612-555-1502', 'Northstar Retail', 'Store Operations Mgr', 'lead', 'New', 2030),
(31, 'timothy.gonzalez@ironbridgecap.com', 'Timothy', 'Gonzalez', '704-555-1601', 'Iron Bridge Capital', 'Portfolio Manager', 'customer', 'Connected', 2031),
(32, 'rebecca.nelson@ironbridgecap.com', 'Rebecca', 'Nelson', '704-555-1602', 'Iron Bridge Capital', 'Analyst', 'lead', 'Open', 2032),
(33, 'mark.carter@terrafirmaag.com', 'Mark', 'Carter', '515-555-1701', 'TerraFirma Agriculture', 'Farm Manager', 'customer', 'Connected', 2033),
(34, 'samantha.mitchell@terrafirmaag.com', 'Samantha', 'Mitchell', '515-555-1702', 'TerraFirma Agriculture', 'Agronomist', 'opportunity', 'In Progress', 2034),
(35, 'patrick.perez@lighthouselaw.com', 'Patrick', 'Perez', '215-555-1801', 'Lighthouse Legal', 'Partner', 'customer', 'Connected', 2035),
(36, 'angela.roberts@lighthouselaw.com', 'Angela', 'Roberts', '215-555-1802', 'Lighthouse Legal', 'Associate', 'lead', 'New', 2036),
(37, 'eric.turner@crestviewhosp.com', 'Eric', 'Turner', '305-555-1901', 'Crestview Hospitality', 'General Manager', 'customer', 'Connected', 2037),
(38, 'christina.phillips@crestviewhosp.com', 'Christina', 'Phillips', '305-555-1902', 'Crestview Hospitality', 'Events Coordinator', 'opportunity', 'Open', 2038),
(39, 'brandon.campbell@quantumaero.com', 'Brandon', 'Campbell', '214-555-2001', 'Quantum Aerospace', 'Chief Engineer', 'customer', 'Connected', 2039),
(40, 'megan.parker@quantumaero.com', 'Megan', 'Parker', '214-555-2002', 'Quantum Aerospace', 'Program Manager', 'customer', 'Connected', 2040),
(41, 'derek.evans@acme.com', 'Derek', 'Evans', '415-555-0103', 'Acme Corporation', 'Software Engineer', 'lead', 'New', 2041),
(42, 'heather.edwards@globaltech.com', 'Heather', 'Edwards', '512-555-0203', 'GlobalTech Solutions', 'HR Director', 'customer', 'Connected', 2042),
(43, 'scott.collins@pinnaclehealth.com', 'Scott', 'Collins', '617-555-0303', 'Pinnacle Healthcare', 'Medical Director', 'customer', 'Connected', 2043),
(44, 'natalie.stewart@summitfin.com', 'Natalie', 'Stewart', '212-555-0403', 'Summit Financial Group', 'Compliance Officer', 'lead', 'Open', 2044),
(45, 'justin.sanchez@pacmfg.com', 'Justin', 'Sanchez', '503-555-0503', 'Pacific Manufacturing', 'Supply Chain Mgr', 'customer', 'Connected', 2045),
(46, 'victoria.morris@horizonmedia.com', 'Victoria', 'Morris', '310-555-0603', 'Horizon Media Partners', 'Digital Strategist', 'opportunity', 'In Progress', 2046),
(47, 'gregory.rogers@atlaslog.com', 'Gregory', 'Rogers', '312-555-0703', 'Atlas Logistics', 'Dispatch Manager', 'lead', 'New', 2047),
(48, 'diana.reed@evergreened.com', 'Diana', 'Reed', '206-555-0803', 'Evergreen Education', 'Professor', 'customer', 'Connected', 2048),
(49, 'tyler.cook@sapphireco.com', 'Tyler', 'Cook', '303-555-0903', 'Sapphire Consulting', 'Consultant', 'lead', 'Open', 2049),
(50, 'amber.morgan@redrockenergy.com', 'Amber', 'Morgan', '713-555-1003', 'RedRock Energy', 'Geologist', 'opportunity', 'Open', 2050);
SET IDENTITY_INSERT hs.contacts OFF;
GO

-- =============================================================================
-- SEED DATA: hs.deals (30 rows)
-- =============================================================================
SET IDENTITY_INSERT hs.deals ON;
INSERT INTO hs.deals (dealId, dealname, amount, dealstage, pipeline, closedate, associatedCompanyId, associatedContactId, hs_object_id)
VALUES
(1, 'Acme Enterprise License', 150000.00, 'closedwon', 'default', '2025-12-15', 1, 1, 3001),
(2, 'GlobalTech Platform Upgrade', 250000.00, 'qualifiedtobuy', 'default', '2026-03-30', 2, 3, 3002),
(3, 'Pinnacle EMR Integration', 180000.00, 'closedwon', 'default', '2025-11-20', 3, 5, 3003),
(4, 'Summit Risk Analytics', 95000.00, 'appointmentscheduled', 'default', '2026-04-15', 4, 7, 3004),
(5, 'Pacific IoT Sensors', 320000.00, 'closedwon', 'default', '2025-10-01', 5, 9, 3005),
(6, 'Horizon Digital Campaign', 45000.00, 'qualifiedtobuy', 'default', '2026-02-28', 6, 11, 3006),
(7, 'Atlas Fleet Tracking', 200000.00, 'closedwon', 'default', '2025-09-15', 7, 13, 3007),
(8, 'Evergreen LMS Deployment', 75000.00, 'appointmentscheduled', 'default', '2026-05-01', 8, 15, 3008),
(9, 'Sapphire Strategy Retainer', 60000.00, 'closedwon', 'default', '2025-08-01', 9, 17, 3009),
(10, 'RedRock Pipeline Monitoring', 280000.00, 'qualifiedtobuy', 'default', '2026-06-30', 10, 19, 3010),
(11, 'BlueSky ML Platform', 120000.00, 'appointmentscheduled', 'default', '2026-04-01', 11, 21, 3011),
(12, 'Cascade Project Suite', 190000.00, 'closedwon', 'default', '2025-07-15', 12, 23, 3012),
(13, 'Meridian Claims Portal', 85000.00, 'qualifiedtobuy', 'default', '2026-03-15', 13, 25, 3013),
(14, 'Vanguard Lab System', 210000.00, 'closedwon', 'default', '2025-06-01', 14, 27, 3014),
(15, 'Northstar POS Rollout', 400000.00, 'closedwon', 'default', '2025-05-15', 15, 29, 3015),
(16, 'IronBridge Portfolio Tool', 55000.00, 'appointmentscheduled', 'default', '2026-07-01', 16, 31, 3016),
(17, 'TerraFirma Precision Ag', 130000.00, 'qualifiedtobuy', 'default', '2026-05-15', 17, 33, 3017),
(18, 'Lighthouse Case Mgmt', 70000.00, 'closedwon', 'default', '2025-04-01', 18, 35, 3018),
(19, 'Crestview Booking Engine', 160000.00, 'closedlost', 'default', '2025-12-01', 19, 37, 3019),
(20, 'Quantum Sim Platform', 350000.00, 'closedwon', 'default', '2025-03-15', 20, 39, 3020),
(21, 'Acme Cloud Migration', 220000.00, 'qualifiedtobuy', 'default', '2026-08-01', 1, 2, 3021),
(22, 'GlobalTech Security Audit', 80000.00, 'closedwon', 'default', '2025-11-01', 2, 4, 3022),
(23, 'Pinnacle Telehealth', 140000.00, 'appointmentscheduled', 'default', '2026-06-15', 3, 6, 3023),
(24, 'Summit Wealth Portal', 110000.00, 'closedlost', 'default', '2025-10-15', 4, 8, 3024),
(25, 'Pacific Quality Control', 175000.00, 'qualifiedtobuy', 'default', '2026-04-30', 5, 10, 3025),
(26, 'Horizon Brand Refresh', 35000.00, 'closedwon', 'default', '2025-09-01', 6, 12, 3026),
(27, 'Atlas Route Optimization', 240000.00, 'appointmentscheduled', 'default', '2026-07-15', 7, 14, 3027),
(28, 'Cascade Safety Platform', 90000.00, 'closedwon', 'default', '2025-08-15', 12, 24, 3028),
(29, 'Vanguard Clinical Trial', 300000.00, 'qualifiedtobuy', 'default', '2026-09-01', 14, 28, 3029),
(30, 'Quantum Propulsion R&D', 500000.00, 'appointmentscheduled', 'default', '2026-12-01', 20, 40, 3030);
SET IDENTITY_INSERT hs.deals OFF;
GO

-- =============================================================================
-- SEED DATA: sf.Account (20 rows)
-- =============================================================================
INSERT INTO sf.Account (Id, Name, Industry, Type, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry, Phone, Website, NumberOfEmployees, AnnualRevenue)
VALUES
('001000000000001AA', 'TechVista Inc', 'Technology', 'Customer', '100 Innovation Dr', 'San Jose', 'CA', '95110', 'US', '408-555-0100', 'techvista.com', 400, 42000000.00),
('001000000000002AA', 'HealthFirst Systems', 'Healthcare', 'Customer', '200 Medical Pkwy', 'Dallas', 'TX', '75201', 'US', '214-555-0200', 'healthfirst.com', 650, 68000000.00),
('001000000000003AA', 'Sterling Partners', 'Financial Services', 'Prospect', '300 Wall St', 'New York', 'NY', '10005', 'US', '212-555-0300', 'sterlingpartners.com', 120, 15000000.00),
('001000000000004AA', 'GreenLeaf Energy', 'Energy', 'Customer', '400 Solar Blvd', 'Phoenix', 'AZ', '85001', 'US', '602-555-0400', 'greenleafenergy.com', 280, 35000000.00),
('001000000000005AA', 'Coastal Media Group', 'Media', 'Partner', '500 Ocean Ave', 'Miami', 'FL', '33101', 'US', '305-555-0500', 'coastalmedia.com', 90, 11000000.00),
('001000000000006AA', 'Alpine Manufacturing', 'Manufacturing', 'Customer', '600 Factory Ln', 'Denver', 'CO', '80201', 'US', '303-555-0600', 'alpinemfg.com', 1100, 110000000.00),
('001000000000007AA', 'DataStream Analytics', 'Technology', 'Customer', '700 Data Center Rd', 'Seattle', 'WA', '98101', 'US', '206-555-0700', 'datastream.com', 200, 24000000.00),
('001000000000008AA', 'Premier Education', 'Education', 'Prospect', '800 Campus Dr', 'Boston', 'MA', '02101', 'US', '617-555-0800', 'premiered.com', 350, 32000000.00),
('001000000000009AA', 'Titan Logistics', 'Transportation', 'Customer', '900 Freight Way', 'Memphis', 'TN', '38101', 'US', '901-555-0900', 'titanlog.com', 500, 52000000.00),
('001000000000010AA', 'NovaPharm Research', 'Biotechnology', 'Customer', '1000 Research Park', 'Raleigh', 'NC', '27601', 'US', '919-555-1000', 'novapharm.com', 180, 22000000.00),
('001000000000011AA', 'Skyline Properties', 'Real Estate', 'Prospect', '1100 Tower Blvd', 'Chicago', 'IL', '60601', 'US', '312-555-1100', 'skylineprop.com', 70, 9000000.00),
('001000000000012AA', 'Forge Industrial', 'Manufacturing', 'Customer', '1200 Steel Mill Rd', 'Pittsburgh', 'PA', '15201', 'US', '412-555-1200', 'forgeindustrial.com', 800, 85000000.00),
('001000000000013AA', 'Bright Horizons Care', 'Healthcare', 'Customer', '1300 Care Center Dr', 'Orlando', 'FL', '32801', 'US', '407-555-1300', 'brighthorizons.com', 420, 44000000.00),
('001000000000014AA', 'Apex Legal Services', 'Legal', 'Partner', '1400 Justice Ln', 'Washington', 'DC', '20001', 'US', '202-555-1400', 'apexlegal.com', 55, 6500000.00),
('001000000000015AA', 'Summit Retail Corp', 'Retail', 'Customer', '1500 Mall Dr', 'Atlanta', 'GA', '30301', 'US', '404-555-1500', 'summitretail.com', 2200, 220000000.00),
('001000000000016AA', 'Velocity Sports', 'Sports', 'Prospect', '1600 Stadium Way', 'Kansas City', 'MO', '64101', 'US', '816-555-1600', 'velocitysports.com', 130, 16000000.00),
('001000000000017AA', 'Aurora Telecom', 'Telecommunications', 'Customer', '1700 Signal Ave', 'San Antonio', 'TX', '78201', 'US', '210-555-1700', 'auroratelecom.com', 950, 98000000.00),
('001000000000018AA', 'Heritage Hotels', 'Hospitality', 'Customer', '1800 Resort Blvd', 'Las Vegas', 'NV', '89101', 'US', '702-555-1800', 'heritagehotels.com', 1400, 140000000.00),
('001000000000019AA', 'Pacific Ag Solutions', 'Agriculture', 'Prospect', '1900 Farm Rd', 'Sacramento', 'CA', '95801', 'US', '916-555-1900', 'pacificag.com', 160, 20000000.00),
('001000000000020AA', 'Pinnacle Defense', 'Aerospace', 'Customer', '2000 Defense Dr', 'Huntsville', 'AL', '35801', 'US', '256-555-2000', 'pinnacledef.com', 600, 65000000.00);
GO

-- =============================================================================
-- SEED DATA: sf.Contact (50 rows)
-- =============================================================================
INSERT INTO sf.Contact (Id, FirstName, LastName, Email, Phone, Title, AccountId, MailingCity, MailingState, MailingPostalCode, MailingCountry, LeadSource)
VALUES
('003000000000001AA', 'Alex', 'Rivera', 'alex.rivera@techvista.com', '408-555-0101', 'CTO', '001000000000001AA', 'San Jose', 'CA', '95110', 'US', 'Web'),
('003000000000002AA', 'Maria', 'Santos', 'maria.santos@techvista.com', '408-555-0102', 'VP Engineering', '001000000000001AA', 'San Jose', 'CA', '95110', 'US', 'Referral'),
('003000000000003AA', 'Thomas', 'Wagner', 'thomas.wagner@healthfirst.com', '214-555-0201', 'CEO', '001000000000002AA', 'Dallas', 'TX', '75201', 'US', 'Trade Show'),
('003000000000004AA', 'Patricia', 'Kim', 'patricia.kim@healthfirst.com', '214-555-0202', 'CMO', '001000000000002AA', 'Dallas', 'TX', '75201', 'US', 'Web'),
('003000000000005AA', 'Marcus', 'Blackwell', 'marcus.blackwell@sterlingpartners.com', '212-555-0301', 'Managing Partner', '001000000000003AA', 'New York', 'NY', '10005', 'US', 'Referral'),
('003000000000006AA', 'Diana', 'Frost', 'diana.frost@sterlingpartners.com', '212-555-0302', 'Associate', '001000000000003AA', 'New York', 'NY', '10005', 'US', 'Web'),
('003000000000007AA', 'Carlos', 'Mendez', 'carlos.mendez@greenleafenergy.com', '602-555-0401', 'VP Operations', '001000000000004AA', 'Phoenix', 'AZ', '85001', 'US', 'Partner'),
('003000000000008AA', 'Hannah', 'Brooks', 'hannah.brooks@greenleafenergy.com', '602-555-0402', 'Sustainability Dir', '001000000000004AA', 'Phoenix', 'AZ', '85001', 'US', 'Web'),
('003000000000009AA', 'Victor', 'Ruiz', 'victor.ruiz@coastalmedia.com', '305-555-0501', 'Creative Director', '001000000000005AA', 'Miami', 'FL', '33101', 'US', 'Social Media'),
('003000000000010AA', 'Grace', 'Patel', 'grace.patel@coastalmedia.com', '305-555-0502', 'Producer', '001000000000005AA', 'Miami', 'FL', '33101', 'US', 'Referral'),
('003000000000011AA', 'Nathan', 'Fischer', 'nathan.fischer@alpinemfg.com', '303-555-0601', 'Plant Director', '001000000000006AA', 'Denver', 'CO', '80201', 'US', 'Trade Show'),
('003000000000012AA', 'Olivia', 'Harper', 'olivia.harper@alpinemfg.com', '303-555-0602', 'Quality Manager', '001000000000006AA', 'Denver', 'CO', '80201', 'US', 'Web'),
('003000000000013AA', 'Ethan', 'Murray', 'ethan.murray@datastream.com', '206-555-0701', 'Chief Data Officer', '001000000000007AA', 'Seattle', 'WA', '98101', 'US', 'Web'),
('003000000000014AA', 'Sophia', 'Warren', 'sophia.warren@datastream.com', '206-555-0702', 'ML Engineer', '001000000000007AA', 'Seattle', 'WA', '98101', 'US', 'Referral'),
('003000000000015AA', 'Adrian', 'Cole', 'adrian.cole@premiered.com', '617-555-0801', 'Provost', '001000000000008AA', 'Boston', 'MA', '02101', 'US', 'Trade Show'),
('003000000000016AA', 'Chloe', 'Barrett', 'chloe.barrett@premiered.com', '617-555-0802', 'IT Director', '001000000000008AA', 'Boston', 'MA', '02101', 'US', 'Web'),
('003000000000017AA', 'Derek', 'Simmons', 'derek.simmons@titanlog.com', '901-555-0901', 'VP Logistics', '001000000000009AA', 'Memphis', 'TN', '38101', 'US', 'Referral'),
('003000000000018AA', 'Vanessa', 'Price', 'vanessa.price@titanlog.com', '901-555-0902', 'Route Planner', '001000000000009AA', 'Memphis', 'TN', '38101', 'US', 'Web'),
('003000000000019AA', 'Ian', 'Crawford', 'ian.crawford@novapharm.com', '919-555-1001', 'Head of Research', '001000000000010AA', 'Raleigh', 'NC', '27601', 'US', 'Trade Show'),
('003000000000020AA', 'Maya', 'Reeves', 'maya.reeves@novapharm.com', '919-555-1002', 'Lab Director', '001000000000010AA', 'Raleigh', 'NC', '27601', 'US', 'Referral'),
('003000000000021AA', 'Logan', 'Pierce', 'logan.pierce@skylineprop.com', '312-555-1101', 'VP Development', '001000000000011AA', 'Chicago', 'IL', '60601', 'US', 'Web'),
('003000000000022AA', 'Avery', 'Fox', 'avery.fox@skylineprop.com', '312-555-1102', 'Property Manager', '001000000000011AA', 'Chicago', 'IL', '60601', 'US', 'Referral'),
('003000000000023AA', 'Owen', 'Blake', 'owen.blake@forgeindustrial.com', '412-555-1201', 'Operations VP', '001000000000012AA', 'Pittsburgh', 'PA', '15201', 'US', 'Trade Show'),
('003000000000024AA', 'Lily', 'Spencer', 'lily.spencer@forgeindustrial.com', '412-555-1202', 'Safety Director', '001000000000012AA', 'Pittsburgh', 'PA', '15201', 'US', 'Web'),
('003000000000025AA', 'Caleb', 'Hunt', 'caleb.hunt@brighthorizons.com', '407-555-1301', 'Medical Director', '001000000000013AA', 'Orlando', 'FL', '32801', 'US', 'Referral'),
('003000000000026AA', 'Ella', 'Grant', 'ella.grant@brighthorizons.com', '407-555-1302', 'Nurse Manager', '001000000000013AA', 'Orlando', 'FL', '32801', 'US', 'Web'),
('003000000000027AA', 'Noah', 'Wells', 'noah.wells@apexlegal.com', '202-555-1401', 'Senior Partner', '001000000000014AA', 'Washington', 'DC', '20001', 'US', 'Referral'),
('003000000000028AA', 'Zoe', 'Chambers', 'zoe.chambers@apexlegal.com', '202-555-1402', 'Associate', '001000000000014AA', 'Washington', 'DC', '20001', 'US', 'Web'),
('003000000000029AA', 'Lucas', 'Mason', 'lucas.mason@summitretail.com', '404-555-1501', 'VP Retail Ops', '001000000000015AA', 'Atlanta', 'GA', '30301', 'US', 'Trade Show'),
('003000000000030AA', 'Aria', 'Fleming', 'aria.fleming@summitretail.com', '404-555-1502', 'Buyer', '001000000000015AA', 'Atlanta', 'GA', '30301', 'US', 'Web'),
('003000000000031AA', 'Gabriel', 'Dunn', 'gabriel.dunn@velocitysports.com', '816-555-1601', 'Marketing Director', '001000000000016AA', 'Kansas City', 'MO', '64101', 'US', 'Social Media'),
('003000000000032AA', 'Naomi', 'Cross', 'naomi.cross@velocitysports.com', '816-555-1602', 'Events Coordinator', '001000000000016AA', 'Kansas City', 'MO', '64101', 'US', 'Web'),
('003000000000033AA', 'Isaiah', 'Webb', 'isaiah.webb@auroratelecom.com', '210-555-1701', 'CTO', '001000000000017AA', 'San Antonio', 'TX', '78201', 'US', 'Referral'),
('003000000000034AA', 'Stella', 'Floyd', 'stella.floyd@auroratelecom.com', '210-555-1702', 'Network Engineer', '001000000000017AA', 'San Antonio', 'TX', '78201', 'US', 'Web'),
('003000000000035AA', 'Dominic', 'Hayes', 'dominic.hayes@heritagehotels.com', '702-555-1801', 'General Manager', '001000000000018AA', 'Las Vegas', 'NV', '89101', 'US', 'Trade Show'),
('003000000000036AA', 'Iris', 'Lambert', 'iris.lambert@heritagehotels.com', '702-555-1802', 'Concierge Director', '001000000000018AA', 'Las Vegas', 'NV', '89101', 'US', 'Web'),
('003000000000037AA', 'Felix', 'Hawkins', 'felix.hawkins@pacificag.com', '916-555-1901', 'Farm Manager', '001000000000019AA', 'Sacramento', 'CA', '95801', 'US', 'Partner'),
('003000000000038AA', 'Ruby', 'Palmer', 'ruby.palmer@pacificag.com', '916-555-1902', 'Agronomist', '001000000000019AA', 'Sacramento', 'CA', '95801', 'US', 'Web'),
('003000000000039AA', 'Miles', 'Burke', 'miles.burke@pinnacledef.com', '256-555-2001', 'Program Director', '001000000000020AA', 'Huntsville', 'AL', '35801', 'US', 'Trade Show'),
('003000000000040AA', 'Lena', 'Casey', 'lena.casey@pinnacledef.com', '256-555-2002', 'Systems Engineer', '001000000000020AA', 'Huntsville', 'AL', '35801', 'US', 'Referral'),
('003000000000041AA', 'Joel', 'Dixon', 'joel.dixon@techvista.com', '408-555-0103', 'DevOps Lead', '001000000000001AA', 'San Jose', 'CA', '95110', 'US', 'Web'),
('003000000000042AA', 'Penelope', 'Carr', 'penelope.carr@healthfirst.com', '214-555-0203', 'IT Manager', '001000000000002AA', 'Dallas', 'TX', '75201', 'US', 'Web'),
('003000000000043AA', 'Tristan', 'Love', 'tristan.love@greenleafenergy.com', '602-555-0403', 'Solar Engineer', '001000000000004AA', 'Phoenix', 'AZ', '85001', 'US', 'Web'),
('003000000000044AA', 'Serena', 'Moss', 'serena.moss@alpinemfg.com', '303-555-0603', 'Supply Chain Dir', '001000000000006AA', 'Denver', 'CO', '80201', 'US', 'Referral'),
('003000000000045AA', 'Bryce', 'Walton', 'bryce.walton@titanlog.com', '901-555-0903', 'Fleet Manager', '001000000000009AA', 'Memphis', 'TN', '38101', 'US', 'Web'),
('003000000000046AA', 'Nora', 'Rice', 'nora.rice@forgeindustrial.com', '412-555-1203', 'HR Director', '001000000000012AA', 'Pittsburgh', 'PA', '15201', 'US', 'Referral'),
('003000000000047AA', 'Damian', 'Hale', 'damian.hale@summitretail.com', '404-555-1503', 'Store Manager', '001000000000015AA', 'Atlanta', 'GA', '30301', 'US', 'Web'),
('003000000000048AA', 'Fiona', 'Juarez', 'fiona.juarez@auroratelecom.com', '210-555-1703', 'Product Manager', '001000000000017AA', 'San Antonio', 'TX', '78201', 'US', 'Trade Show'),
('003000000000049AA', 'Vincent', 'Lane', 'vincent.lane@heritagehotels.com', '702-555-1803', 'Revenue Manager', '001000000000018AA', 'Las Vegas', 'NV', '89101', 'US', 'Web'),
('003000000000050AA', 'Jade', 'Stokes', 'jade.stokes@pinnacledef.com', '256-555-2003', 'Contracts Specialist', '001000000000020AA', 'Huntsville', 'AL', '35801', 'US', 'Referral');
GO

-- =============================================================================
-- SEED DATA: sf.Opportunity (30 rows)
-- =============================================================================
INSERT INTO sf.Opportunity (Id, Name, Amount, StageName, CloseDate, AccountId, Probability, LeadSource, Type)
VALUES
('006000000000001AA', 'TechVista Cloud Suite', 185000.00, 'Closed Won', '2025-11-15', '001000000000001AA', 100, 'Web', 'New Business'),
('006000000000002AA', 'HealthFirst EHR Upgrade', 240000.00, 'Qualification', '2026-04-30', '001000000000002AA', 40, 'Trade Show', 'Existing Business'),
('006000000000003AA', 'Sterling Portfolio Tool', 65000.00, 'Prospecting', '2026-06-15', '001000000000003AA', 10, 'Referral', 'New Business'),
('006000000000004AA', 'GreenLeaf Solar Monitor', 195000.00, 'Closed Won', '2025-10-01', '001000000000004AA', 100, 'Partner', 'New Business'),
('006000000000005AA', 'Coastal CMS Platform', 42000.00, 'Negotiation', '2026-03-15', '001000000000005AA', 70, 'Social Media', 'New Business'),
('006000000000006AA', 'Alpine MES Deployment', 310000.00, 'Closed Won', '2025-09-15', '001000000000006AA', 100, 'Trade Show', 'Existing Business'),
('006000000000007AA', 'DataStream Analytics Pro', 155000.00, 'Qualification', '2026-05-01', '001000000000007AA', 30, 'Web', 'New Business'),
('006000000000008AA', 'Premier SIS Integration', 88000.00, 'Prospecting', '2026-07-01', '001000000000008AA', 10, 'Trade Show', 'New Business'),
('006000000000009AA', 'Titan TMS Upgrade', 270000.00, 'Closed Won', '2025-08-01', '001000000000009AA', 100, 'Referral', 'Existing Business'),
('006000000000010AA', 'NovaPharm LIMS', 175000.00, 'Negotiation', '2026-04-15', '001000000000010AA', 60, 'Trade Show', 'New Business'),
('006000000000011AA', 'Skyline PropTech', 52000.00, 'Prospecting', '2026-08-01', '001000000000011AA', 10, 'Web', 'New Business'),
('006000000000012AA', 'Forge ERP Phase 2', 225000.00, 'Closed Won', '2025-07-15', '001000000000012AA', 100, 'Trade Show', 'Existing Business'),
('006000000000013AA', 'BrightHorizons Patient Portal', 98000.00, 'Qualification', '2026-03-30', '001000000000013AA', 40, 'Referral', 'New Business'),
('006000000000014AA', 'Apex Case Management', 48000.00, 'Closed Won', '2025-06-01', '001000000000014AA', 100, 'Referral', 'New Business'),
('006000000000015AA', 'Summit Omnichannel POS', 450000.00, 'Closed Won', '2025-05-15', '001000000000015AA', 100, 'Trade Show', 'Existing Business'),
('006000000000016AA', 'Velocity Fan Engagement', 72000.00, 'Prospecting', '2026-09-01', '001000000000016AA', 10, 'Social Media', 'New Business'),
('006000000000017AA', 'Aurora 5G Rollout', 380000.00, 'Negotiation', '2026-06-30', '001000000000017AA', 70, 'Referral', 'Existing Business'),
('006000000000018AA', 'Heritage Booking System', 165000.00, 'Closed Won', '2025-12-01', '001000000000018AA', 100, 'Trade Show', 'New Business'),
('006000000000019AA', 'PacificAg Precision', 115000.00, 'Qualification', '2026-05-15', '001000000000019AA', 30, 'Partner', 'New Business'),
('006000000000020AA', 'Pinnacle Sim Engine', 420000.00, 'Closed Won', '2025-04-01', '001000000000020AA', 100, 'Trade Show', 'Existing Business'),
('006000000000021AA', 'TechVista AI Assistant', 135000.00, 'Qualification', '2026-07-15', '001000000000001AA', 40, 'Web', 'Existing Business'),
('006000000000022AA', 'Alpine Quality Analytics', 190000.00, 'Negotiation', '2026-04-01', '001000000000006AA', 60, 'Trade Show', 'Existing Business'),
('006000000000023AA', 'Titan Warehouse WMS', 295000.00, 'Qualification', '2026-08-15', '001000000000009AA', 30, 'Referral', 'New Business'),
('006000000000024AA', 'HealthFirst Telehealth', 155000.00, 'Closed Lost', '2025-11-30', '001000000000002AA', 0, 'Web', 'New Business'),
('006000000000025AA', 'Forge Safety Platform', 82000.00, 'Closed Won', '2025-10-15', '001000000000012AA', 100, 'Trade Show', 'Existing Business'),
('006000000000026AA', 'NovaPharm Drug Discovery', 340000.00, 'Prospecting', '2026-12-01', '001000000000010AA', 10, 'Referral', 'New Business'),
('006000000000027AA', 'Summit Loyalty Program', 210000.00, 'Negotiation', '2026-05-30', '001000000000015AA', 60, 'Web', 'Existing Business'),
('006000000000028AA', 'Aurora Network Security', 125000.00, 'Closed Won', '2025-09-30', '001000000000017AA', 100, 'Referral', 'Existing Business'),
('006000000000029AA', 'Heritage Revenue Mgmt', 78000.00, 'Qualification', '2026-06-15', '001000000000018AA', 30, 'Trade Show', 'Existing Business'),
('006000000000030AA', 'Pinnacle UAV Program', 550000.00, 'Prospecting', '2026-11-01', '001000000000020AA', 20, 'Trade Show', 'New Business');
GO

-- =============================================================================
-- SEED DATA: ym.membership_types (5 rows)
-- =============================================================================
SET IDENTITY_INSERT ym.membership_types ON;
INSERT INTO ym.membership_types (type_id, name, description, annual_dues)
VALUES
(1, 'Individual', 'Standard individual membership with full benefits', 150.00),
(2, 'Family', 'Family membership covering primary member plus dependents', 250.00),
(3, 'Student', 'Discounted membership for full-time students', 50.00),
(4, 'Corporate', 'Corporate membership for business entities', 500.00),
(5, 'Lifetime', 'One-time payment for permanent membership', 2500.00);
SET IDENTITY_INSERT ym.membership_types OFF;
GO

-- =============================================================================
-- SEED DATA: ym.members (50 rows)
-- =============================================================================
SET IDENTITY_INSERT ym.members ON;
INSERT INTO ym.members (member_id, member_number, first_name, last_name, email, phone, address_line1, city, state, postal_code, country, membership_type_id, join_date, expiration_date, status)
VALUES
(1, 'MEM-001', 'Alice', 'Monroe', 'alice.monroe@email.com', '555-0001', '101 Oak St', 'Portland', 'OR', '97201', 'US', 1, '2024-01-15', '2027-01-15', 'Active'),
(2, 'MEM-002', 'Bob', 'Harrison', 'bob.harrison@email.com', '555-0002', '202 Pine Ave', 'Seattle', 'WA', '98101', 'US', 1, '2024-02-01', '2027-02-01', 'Active'),
(3, 'MEM-003', 'Carol', 'Chang', 'carol.chang@email.com', '555-0003', '303 Elm Dr', 'San Francisco', 'CA', '94102', 'US', 2, '2023-06-15', '2026-06-15', 'Active'),
(4, 'MEM-004', 'Daniel', 'Okonkwo', 'daniel.okonkwo@email.com', '555-0004', '404 Maple Ln', 'Austin', 'TX', '78701', 'US', 1, '2024-03-01', '2027-03-01', 'Active'),
(5, 'MEM-005', 'Elena', 'Petrov', 'elena.petrov@email.com', '555-0005', '505 Cedar Ct', 'Denver', 'CO', '80201', 'US', 3, '2025-01-10', '2026-01-10', 'Active'),
(6, 'MEM-006', 'Frank', 'Nguyen', 'frank.nguyen@email.com', '555-0006', '606 Birch Rd', 'Chicago', 'IL', '60601', 'US', 4, '2023-09-01', '2026-09-01', 'Active'),
(7, 'MEM-007', 'Grace', 'Sullivan', 'grace.sullivan@email.com', '555-0007', '707 Walnut St', 'Boston', 'MA', '02101', 'US', 1, '2024-04-15', '2027-04-15', 'Active'),
(8, 'MEM-008', 'Henry', 'Yamamoto', 'henry.yamamoto@email.com', '555-0008', '808 Spruce Ave', 'Los Angeles', 'CA', '90001', 'US', 5, '2020-01-01', '2099-12-31', 'Active'),
(9, 'MEM-009', 'Irene', 'Kowalski', 'irene.kowalski@email.com', '555-0009', '909 Ash Ln', 'Phoenix', 'AZ', '85001', 'US', 1, '2024-05-01', '2027-05-01', 'Active'),
(10, 'MEM-010', 'Jake', 'Thompson', 'jake.thompson@email.com', '555-0010', '1010 Cherry Dr', 'Nashville', 'TN', '37201', 'US', 2, '2023-11-15', '2026-11-15', 'Active'),
(11, 'MEM-011', 'Karen', 'Morales', 'karen.morales@email.com', '555-0011', '1111 Willow Ct', 'Miami', 'FL', '33101', 'US', 1, '2024-06-01', '2027-06-01', 'Active'),
(12, 'MEM-012', 'Leo', 'Becker', 'leo.becker@email.com', '555-0012', '1212 Poplar Rd', 'Dallas', 'TX', '75201', 'US', 3, '2025-02-01', '2026-02-01', 'Active'),
(13, 'MEM-013', 'Mia', 'Johansson', 'mia.johansson@email.com', '555-0013', '1313 Cypress St', 'Minneapolis', 'MN', '55401', 'US', 1, '2024-07-15', '2027-07-15', 'Active'),
(14, 'MEM-014', 'Nathan', 'Ali', 'nathan.ali@email.com', '555-0014', '1414 Fir Ave', 'Atlanta', 'GA', '30301', 'US', 4, '2023-12-01', '2026-12-01', 'Active'),
(15, 'MEM-015', 'Olivia', 'Brennan', 'olivia.brennan@email.com', '555-0015', '1515 Dogwood Ln', 'Philadelphia', 'PA', '19101', 'US', 1, '2024-08-01', '2027-08-01', 'Active'),
(16, 'MEM-016', 'Pablo', 'Fernandez', 'pablo.fernandez@email.com', '555-0016', '1616 Juniper Dr', 'San Diego', 'CA', '92101', 'US', 2, '2024-01-20', '2027-01-20', 'Active'),
(17, 'MEM-017', 'Quinn', 'OBrien', 'quinn.obrien@email.com', '555-0017', '1717 Redwood Ct', 'Raleigh', 'NC', '27601', 'US', 1, '2024-09-15', '2027-09-15', 'Active'),
(18, 'MEM-018', 'Rosa', 'Dimitrov', 'rosa.dimitrov@email.com', '555-0018', '1818 Hemlock Rd', 'Charlotte', 'NC', '28201', 'US', 3, '2025-03-01', '2026-03-01', 'Active'),
(19, 'MEM-019', 'Sam', 'Watts', 'sam.watts@email.com', '555-0019', '1919 Magnolia St', 'Orlando', 'FL', '32801', 'US', 1, '2024-10-01', '2027-10-01', 'Active'),
(20, 'MEM-020', 'Tara', 'Ibrahim', 'tara.ibrahim@email.com', '555-0020', '2020 Sequoia Ave', 'Houston', 'TX', '77001', 'US', 5, '2021-06-01', '2099-12-31', 'Active'),
(21, 'MEM-021', 'Uriel', 'Park', 'uriel.park@email.com', '555-0021', '2121 Aspen Ln', 'San Jose', 'CA', '95101', 'US', 1, '2024-11-01', '2027-11-01', 'Active'),
(22, 'MEM-022', 'Vera', 'Hoffman', 'vera.hoffman@email.com', '555-0022', '2222 Chestnut Dr', 'Kansas City', 'MO', '64101', 'US', 2, '2024-02-15', '2027-02-15', 'Active'),
(23, 'MEM-023', 'Wyatt', 'Singh', 'wyatt.singh@email.com', '555-0023', '2323 Beech Ct', 'Salt Lake City', 'UT', '84101', 'US', 1, '2024-12-01', '2027-12-01', 'Active'),
(24, 'MEM-024', 'Xena', 'Larsen', 'xena.larsen@email.com', '555-0024', '2424 Palm Rd', 'New Orleans', 'LA', '70101', 'US', 4, '2024-03-15', '2027-03-15', 'Active'),
(25, 'MEM-025', 'Yuri', 'Costa', 'yuri.costa@email.com', '555-0025', '2525 Sycamore St', 'Pittsburgh', 'PA', '15201', 'US', 1, '2025-01-01', '2028-01-01', 'Active'),
(26, 'MEM-026', 'Zara', 'Novak', 'zara.novak@email.com', '555-0026', '2626 Hickory Ave', 'Tampa', 'FL', '33601', 'US', 3, '2025-04-01', '2026-04-01', 'Active'),
(27, 'MEM-027', 'Adam', 'Shah', 'adam.shah@email.com', '555-0027', '2727 Linden Ln', 'Detroit', 'MI', '48201', 'US', 1, '2023-07-01', '2026-07-01', 'Active'),
(28, 'MEM-028', 'Beth', 'Cruz', 'beth.cruz@email.com', '555-0028', '2828 Ivy Dr', 'Memphis', 'TN', '38101', 'US', 2, '2024-04-01', '2027-04-01', 'Active'),
(29, 'MEM-029', 'Cody', 'Pham', 'cody.pham@email.com', '555-0029', '2929 Laurel Ct', 'Las Vegas', 'NV', '89101', 'US', 1, '2024-05-15', '2027-05-15', 'Active'),
(30, 'MEM-030', 'Dana', 'Reyes', 'dana.reyes@email.com', '555-0030', '3030 Alder Rd', 'Sacramento', 'CA', '95801', 'US', 1, '2024-06-15', '2027-06-15', 'Active'),
(31, 'MEM-031', 'Evan', 'Meyer', 'evan.meyer@email.com', '555-0031', '3131 Hazel St', 'Washington', 'DC', '20001', 'US', 4, '2024-07-01', '2027-07-01', 'Active'),
(32, 'MEM-032', 'Faye', 'Lo', 'faye.lo@email.com', '555-0032', '3232 Olive Ave', 'Honolulu', 'HI', '96801', 'US', 1, '2024-08-15', '2027-08-15', 'Active'),
(33, 'MEM-033', 'Glen', 'Rao', 'glen.rao@email.com', '555-0033', '3333 Fig Ln', 'Indianapolis', 'IN', '46201', 'US', 1, '2024-09-01', '2027-09-01', 'Active'),
(34, 'MEM-034', 'Hope', 'Tanaka', 'hope.tanaka@email.com', '555-0034', '3434 Vine Dr', 'Columbus', 'OH', '43201', 'US', 2, '2023-10-01', '2026-10-01', 'Active'),
(35, 'MEM-035', 'Ivan', 'Dupont', 'ivan.dupont@email.com', '555-0035', '3535 Rose Ct', 'Richmond', 'VA', '23219', 'US', 1, '2024-10-15', '2027-10-15', 'Active'),
(36, 'MEM-036', 'Jill', 'Gupta', 'jill.gupta@email.com', '555-0036', '3636 Peach Rd', 'Tucson', 'AZ', '85701', 'US', 3, '2025-05-01', '2026-05-01', 'Active'),
(37, 'MEM-037', 'Kurt', 'Santos', 'kurt.santos@email.com', '555-0037', '3737 Plum St', 'Albuquerque', 'NM', '87101', 'US', 1, '2024-11-15', '2027-11-15', 'Active'),
(38, 'MEM-038', 'Luna', 'Roth', 'luna.roth@email.com', '555-0038', '3838 Berry Ave', 'Milwaukee', 'WI', '53201', 'US', 5, '2022-03-01', '2099-12-31', 'Active'),
(39, 'MEM-039', 'Max', 'Keller', 'max.keller@email.com', '555-0039', '3939 Grape Ln', 'Louisville', 'KY', '40201', 'US', 1, '2024-12-15', '2027-12-15', 'Active'),
(40, 'MEM-040', 'Nadia', 'Franco', 'nadia.franco@email.com', '555-0040', '4040 Pecan Dr', 'Oklahoma City', 'OK', '73101', 'US', 2, '2024-01-05', '2027-01-05', 'Active'),
(41, 'MEM-041', 'Oscar', 'Hahn', 'oscar.hahn@email.com', '555-0041', '4141 Acorn Ct', 'Hartford', 'CT', '06101', 'US', 1, '2025-01-15', '2028-01-15', 'Active'),
(42, 'MEM-042', 'Priya', 'Lindgren', 'priya.lindgren@email.com', '555-0042', '4242 Moss Rd', 'Baltimore', 'MD', '21201', 'US', 4, '2024-02-20', '2027-02-20', 'Active'),
(43, 'MEM-043', 'Reed', 'Blanco', 'reed.blanco@email.com', '555-0043', '4343 Fern St', 'Jacksonville', 'FL', '32201', 'US', 1, '2024-03-10', '2027-03-10', 'Active'),
(44, 'MEM-044', 'Suki', 'Adler', 'suki.adler@email.com', '555-0044', '4444 Holly Ave', 'Providence', 'RI', '02901', 'US', 3, '2025-06-01', '2026-06-01', 'Active'),
(45, 'MEM-045', 'Troy', 'Kemp', 'troy.kemp@email.com', '555-0045', '4545 Clover Ln', 'Boise', 'ID', '83701', 'US', 1, '2024-04-20', '2027-04-20', 'Active'),
(46, 'MEM-046', 'Uma', 'Voss', 'uma.voss@email.com', '555-0046', '4646 Nettle Dr', 'Anchorage', 'AK', '99501', 'US', 1, '2024-05-10', '2027-05-10', 'Active'),
(47, 'MEM-047', 'Vince', 'Nagle', 'vince.nagle@email.com', '555-0047', '4747 Thistle Ct', 'Burlington', 'VT', '05401', 'US', 2, '2024-06-25', '2027-06-25', 'Active'),
(48, 'MEM-048', 'Wren', 'Stone', 'wren.stone@email.com', '555-0048', '4848 Bramble Rd', 'Des Moines', 'IA', '50301', 'US', 1, '2024-07-20', '2027-07-20', 'Active'),
(49, 'MEM-049', 'Xavier', 'Day', 'xavier.day@email.com', '555-0049', '4949 Rush St', 'Little Rock', 'AR', '72201', 'US', 1, '2024-08-30', '2027-08-30', 'Active'),
(50, 'MEM-050', 'Yolanda', 'Chu', 'yolanda.chu@email.com', '555-0050', '5050 Reed Ave', 'Madison', 'WI', '53701', 'US', 4, '2024-09-20', '2027-09-20', 'Active');
SET IDENTITY_INSERT ym.members OFF;
GO

-- =============================================================================
-- SEED DATA: ym.events (10 rows)
-- =============================================================================
SET IDENTITY_INSERT ym.events ON;
INSERT INTO ym.events (event_id, title, description, start_date, end_date, location, max_attendees, registration_fee, status)
VALUES
(1, 'Annual Conference 2026', 'Our flagship annual conference with keynotes and workshops', '2026-06-15 09:00:00', '2026-06-17 17:00:00', 'Portland Convention Center', 500, 350.00, 'Open'),
(2, 'Spring Networking Mixer', 'Casual networking event for members', '2026-04-10 18:00:00', '2026-04-10 21:00:00', 'Downtown Hotel Ballroom', 100, 25.00, 'Open'),
(3, 'Leadership Workshop', 'Two-day intensive leadership development workshop', '2026-05-20 08:00:00', '2026-05-21 16:00:00', 'Training Center Suite A', 40, 200.00, 'Open'),
(4, 'Summer Golf Tournament', 'Charity golf tournament for members', '2026-07-12 07:00:00', '2026-07-12 15:00:00', 'Pinecrest Golf Club', 80, 150.00, 'Open'),
(5, 'Tech Innovation Summit', 'One-day summit on emerging technologies', '2026-08-05 09:00:00', '2026-08-05 17:00:00', 'Tech Hub Auditorium', 200, 100.00, 'Open'),
(6, 'Fall Gala Dinner', 'Black-tie fundraising gala', '2026-10-18 18:00:00', '2026-10-18 23:00:00', 'Grand Ballroom', 300, 250.00, 'Open'),
(7, 'Regional Chapter Meeting - West', 'Quarterly meeting for western region chapters', '2026-03-25 10:00:00', '2026-03-25 14:00:00', 'San Francisco Office', 50, 0.00, 'Open'),
(8, 'Regional Chapter Meeting - East', 'Quarterly meeting for eastern region chapters', '2026-03-27 10:00:00', '2026-03-27 14:00:00', 'New York Office', 50, 0.00, 'Open'),
(9, 'Professional Development Day', 'Full day of career development sessions', '2026-09-15 08:00:00', '2026-09-15 17:00:00', 'University Center', 150, 75.00, 'Open'),
(10, 'Holiday Party', 'End-of-year celebration for members', '2026-12-12 18:00:00', '2026-12-12 22:00:00', 'Members Club', 200, 50.00, 'Open');
SET IDENTITY_INSERT ym.events OFF;
GO

-- =============================================================================
-- SEED DATA: ym.event_registrations (40 rows)
-- =============================================================================
SET IDENTITY_INSERT ym.event_registrations ON;
INSERT INTO ym.event_registrations (registration_id, event_id, member_id, status, amount_paid)
VALUES
(1, 1, 1, 'Registered', 350.00),
(2, 1, 3, 'Registered', 350.00),
(3, 1, 5, 'Registered', 175.00),
(4, 1, 7, 'Registered', 350.00),
(5, 1, 10, 'Registered', 350.00),
(6, 1, 14, 'Registered', 500.00),
(7, 1, 20, 'Registered', 350.00),
(8, 1, 25, 'Registered', 350.00),
(9, 2, 2, 'Registered', 25.00),
(10, 2, 4, 'Registered', 25.00),
(11, 2, 8, 'Registered', 25.00),
(12, 2, 11, 'Registered', 25.00),
(13, 2, 15, 'Registered', 25.00),
(14, 3, 6, 'Registered', 500.00),
(15, 3, 9, 'Registered', 200.00),
(16, 3, 13, 'Registered', 200.00),
(17, 3, 17, 'Registered', 200.00),
(18, 4, 1, 'Registered', 150.00),
(19, 4, 10, 'Registered', 150.00),
(20, 4, 16, 'Registered', 150.00),
(21, 4, 22, 'Registered', 150.00),
(22, 5, 3, 'Registered', 100.00),
(23, 5, 7, 'Registered', 100.00),
(24, 5, 12, 'Registered', 50.00),
(25, 5, 21, 'Registered', 100.00),
(26, 5, 30, 'Registered', 100.00),
(27, 6, 8, 'Registered', 250.00),
(28, 6, 14, 'Registered', 500.00),
(29, 6, 20, 'Registered', 250.00),
(30, 6, 24, 'Registered', 500.00),
(31, 6, 38, 'Registered', 250.00),
(32, 7, 21, 'Registered', 0.00),
(33, 7, 30, 'Registered', 0.00),
(34, 7, 32, 'Registered', 0.00),
(35, 8, 15, 'Registered', 0.00),
(36, 8, 25, 'Registered', 0.00),
(37, 8, 35, 'Registered', 0.00),
(38, 9, 5, 'Registered', 37.50),
(39, 9, 18, 'Registered', 37.50),
(40, 9, 26, 'Registered', 37.50);
SET IDENTITY_INSERT ym.event_registrations OFF;
GO
