/******************************************************************************
 * Association Sample Database - Membership Data
 * File: 01_membership_data.sql
 *
 * Generates comprehensive membership data including:
 * - 8 Membership Types
 * - 40 Organizations
 * - 500 Members
 * - 625 Membership records (includes renewal history)
 *
 * All dates are relative to parameters defined in 00_parameters.sql
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- MEMBERSHIP TYPES (8 Types)
-- ============================================================================


INSERT INTO [AssociationDemo].[MembershipType] (ID, Name, Description, AnnualDues, RenewalPeriodMonths, IsActive, AllowAutoRenew, RequiresApproval, Benefits, DisplayOrder)
VALUES
    (@MembershipType_Individual, 'Individual Professional', 'Standard individual membership for technology professionals', 295.00, 12, 1, 1, 0, 'Full access to events, courses, and resources. Includes monthly newsletter, member directory access, and discounts on conferences.', 1),
    (@MembershipType_Student, 'Student', 'Discounted membership for full-time students', 95.00, 12, 1, 1, 1, 'Access to educational resources, webinars, and student networking events. Requires verification of student status.', 2),
    (@MembershipType_Corporate, 'Corporate', 'Enterprise membership for organizations with multiple employees', 2500.00, 12, 1, 1, 0, 'Covers up to 10 employees. Includes all individual benefits plus corporate branding opportunities and dedicated account management.', 3),
    (@MembershipType_Lifetime, 'Lifetime Member', 'One-time payment for lifetime membership', 5000.00, 1200, 1, 0, 0, 'All Individual Professional benefits for life. Recognition in member directory and special lifetime member events.', 4),
    (@MembershipType_Retired, 'Retired Professional', 'Reduced rate for retired industry professionals', 150.00, 12, 1, 1, 0, 'Full member benefits at a reduced rate for retired professionals. Includes emeritus status recognition.', 5),
    (@MembershipType_EarlyCareer, 'Early Career Professional', 'Special rate for professionals with less than 5 years experience', 195.00, 12, 1, 1, 0, 'Full member benefits with additional mentorship program access and career development resources.', 6),
    (@MembershipType_International, 'International Member', 'Membership for professionals outside North America', 350.00, 12, 1, 1, 0, 'All Individual Professional benefits with international event access and global member directory.', 7),
    (@MembershipType_Honorary, 'Honorary Member', 'Complimentary membership for distinguished contributors', 0.00, 12, 1, 0, 1, 'Awarded by the board for outstanding contributions to the field. Includes all member benefits with special recognition.', 8);


-- ============================================================================
-- ORGANIZATIONS (40 Organizations)
-- ============================================================================


INSERT INTO [AssociationDemo].[Organization] (ID, Name, Industry, EmployeeCount, AnnualRevenue, MarketCapitalization, TickerSymbol, Exchange, Website, Description, YearFounded, City, State, Country, Phone)
VALUES
    -- Real Public Technology Companies (10)
    (@Org_TechVentures, 'Microsoft Corporation', 'Cloud & AI', 238000, 245000000000.00, 3100000000000.00, 'MSFT', 'NASDAQ', 'https://www.microsoft.com', 'Global technology company providing cloud computing, software, and AI services', 1975, 'Redmond', 'WA', 'United States', '425-882-8080'),
    (@Org_CloudScale, 'Salesforce, Inc.', 'Cloud Software', 79000, 34850000000.00, 245000000000.00, 'CRM', 'NYSE', 'https://www.salesforce.com', 'Leading customer relationship management (CRM) and enterprise cloud computing company', 1999, 'San Francisco', 'CA', 'United States', '415-901-7000'),
    (@Org_DataDriven, 'NVIDIA Corporation', 'AI & Semiconductors', 29600, 60920000000.00, 2900000000000.00, 'NVDA', 'NASDAQ', 'https://www.nvidia.com', 'AI computing company and leader in graphics processing units (GPUs)', 1993, 'Santa Clara', 'CA', 'United States', '408-486-2000'),
    (@Org_CyberShield, 'Palo Alto Networks', 'Cybersecurity', 14000, 6900000000.00, 120000000000.00, 'PANW', 'NASDAQ', 'https://www.paloaltonetworks.com', 'Global cybersecurity leader providing network security and cloud security solutions', 2005, 'Santa Clara', 'CA', 'United States', '408-753-4000'),
    (@Org_HealthTech, 'Oracle Corporation', 'Enterprise Software', 164000, 50000000000.00, 380000000000.00, 'ORCL', 'NYSE', 'https://www.oracle.com', 'Multi-national computer technology company specializing in database software and cloud computing', 1977, 'Austin', 'TX', 'United States', '650-506-7000'),
    (@Org_FinancialEdge, 'ServiceNow, Inc.', 'Enterprise Software', 24000, 9300000000.00, 170000000000.00, 'NOW', 'NYSE', 'https://www.servicenow.com', 'Cloud computing platform helping enterprises digitize and unify customer operations', 2003, 'Santa Clara', 'CA', 'United States', '408-501-8550'),
    (@Org_RetailInnovate, 'Shopify Inc.', 'E-Commerce', 11600, 7060000000.00, 80000000000.00, 'SHOP', 'NYSE', 'https://www.shopify.com', 'E-commerce platform enabling businesses to create online stores', 2006, 'Ottawa', 'Ontario', 'Canada', '+1-888-746-7439'),
    (@Org_EduTech, 'Adobe Inc.', 'Digital Media Software', 29000, 19410000000.00, 220000000000.00, 'ADBE', 'NASDAQ', 'https://www.adobe.com', 'Multinational computer software company known for creative and digital marketing solutions', 1982, 'San Jose', 'CA', 'United States', '408-536-6000'),
    (@Org_ManufacturePro, 'Workday, Inc.', 'Enterprise Cloud', 18000, 7260000000.00, 65000000000.00, 'WDAY', 'NASDAQ', 'https://www.workday.com', 'Enterprise cloud applications for finance, HR, and planning', 2005, 'Pleasanton', 'CA', 'United States', '925-951-9000'),
    (@Org_LogisticsPrime, 'Snowflake Inc.', 'Data Cloud', 6800, 2670000000.00, 52000000000.00, 'SNOW', 'NYSE', 'https://www.snowflake.com', 'Cloud-based data warehouse platform enabling data storage and analytics', 2012, 'Bozeman', 'MT', 'United States', '844-766-9355'),

    -- Real Public Financial Services & Healthcare (5)
    (NEWID(), 'JPMorgan Chase & Co.', 'Banking & Financial Services', 308669, 158100000000.00, 580000000000.00, 'JPM', 'NYSE', 'https://www.jpmorganchase.com', 'Global financial services firm and the largest bank in the United States', 1799, 'New York', 'NY', 'United States', '212-270-6000'),
    (NEWID(), 'Goldman Sachs Group, Inc.', 'Investment Banking', 45000, 46540000000.00, 155000000000.00, 'GS', 'NYSE', 'https://www.goldmansachs.com', 'Leading global investment banking, securities, and investment management firm', 1869, 'New York', 'NY', 'United States', '212-902-1000'),
    (NEWID(), 'UnitedHealth Group Inc.', 'Healthcare Services', 440000, 371600000000.00, 520000000000.00, 'UNH', 'NYSE', 'https://www.unitedhealthgroup.com', 'Diversified healthcare company providing health insurance and healthcare services', 1977, 'Minnetonka', 'MN', 'United States', '952-936-1300'),
    (NEWID(), 'CVS Health Corporation', 'Healthcare', 300000, 357000000000.00, 82000000000.00, 'CVS', 'NYSE', 'https://www.cvshealth.com', 'Integrated pharmacy healthcare company with retail locations and PBM services', 1963, 'Woonsocket', 'RI', 'United States', '401-765-1500'),
    (NEWID(), 'Visa Inc.', 'Payment Technology', 26500, 35900000000.00, 580000000000.00, 'V', 'NYSE', 'https://www.visa.com', 'Global payments technology company enabling electronic fund transfers worldwide', 1958, 'San Francisco', 'CA', 'United States', '650-432-3200'),

    -- Real Public Consulting & Services (3)
    (NEWID(), 'Accenture plc', 'Professional Services', 738000, 64100000000.00, 220000000000.00, 'ACN', 'NYSE', 'https://www.accenture.com', 'Global professional services company providing strategy, consulting, and technology services', 1989, 'Dublin', NULL, 'Ireland', '+353-1-646-2000'),
    (NEWID(), 'Cognizant Technology Solutions', 'IT Services', 347700, 19400000000.00, 38000000000.00, 'CTSH', 'NASDAQ', 'https://www.cognizant.com', 'Multinational IT services and consulting company specializing in digital transformation', 1994, 'Teaneck', 'NJ', 'United States', '201-801-0233'),
    (NEWID(), 'Atlassian Corporation', 'Collaboration Software', 12000, 3500000000.00, 52000000000.00, 'TEAM', 'NASDAQ', 'https://www.atlassian.com', 'Australian software company specializing in collaboration and productivity software', 2002, 'Sydney', 'NSW', 'Australia', '+61-2-9256-9600'),

    -- Fictional Private Companies (22) - Mix with real companies for variety
    (NEWID(), 'DevOps Masters', 'DevOps Tools', 180, 52000000.00, NULL, NULL, NULL, 'https://www.devopsmasters.io', 'Continuous integration and deployment automation platform', 2019, 'Portland', 'OR', 'United States', '503-555-0111'),
    (NEWID(), 'CodeCraft Studios', 'Software Development', 125, 28000000.00, NULL, NULL, NULL, 'https://www.codecraft.dev', 'Custom software development and engineering services', 2018, 'Boulder', 'CO', 'United States', '720-555-0112'),
    (NEWID(), 'APIGate Solutions', 'API Management', 95, 22000000.00, NULL, NULL, NULL, 'https://www.apigate.com', 'API management and integration platform', 2020, 'San Jose', 'CA', 'United States', '408-555-0113'),
    (NEWID(), 'MobileFirst Apps', 'Mobile Development', 160, 45000000.00, NULL, NULL, NULL, 'https://www.mobilefirst.app', 'Mobile application development and deployment platform', 2017, 'Los Angeles', 'CA', 'United States', '213-555-0114'),
    (NEWID(), 'Quantum Computing Labs', 'Emerging Technology', 85, 35000000.00, NULL, NULL, NULL, 'https://www.quantumlabs.tech', 'Quantum computing research and applications', 2021, 'Cambridge', 'MA', 'United States', '617-555-0115'),
    (NEWID(), 'MediConnect Systems', 'Healthcare IT', 420, 135000000.00, NULL, NULL, NULL, 'https://www.mediconnect.health', 'Healthcare interoperability and data exchange platform', 2014, 'Nashville', 'TN', 'United States', '615-555-0116'),
    (NEWID(), 'PatientFirst Technology', 'Patient Engagement', 210, 68000000.00, NULL, NULL, NULL, 'https://www.patientfirst.com', 'Patient engagement and communication platform', 2016, 'Minneapolis', 'MN', 'United States', '612-555-0117'),
    (NEWID(), 'PharmaTech Solutions', 'Pharmaceutical IT', 340, 98000000.00, NULL, NULL, NULL, 'https://www.pharmatech.com', 'Pharmaceutical research and compliance software', 2013, 'Philadelphia', 'PA', 'United States', '215-555-0118'),
    (NEWID(), 'HealthAnalytics Pro', 'Healthcare Analytics', 190, 55000000.00, NULL, NULL, NULL, 'https://www.healthanalytics.com', 'Healthcare data analytics and population health management', 2017, 'Phoenix', 'AZ', 'United States', '602-555-0119'),
    (NEWID(), 'TeleMed Connect', 'Telemedicine', 145, 42000000.00, NULL, NULL, NULL, 'https://www.telemed.health', 'Telemedicine platform and remote care solutions', 2020, 'San Diego', 'CA', 'United States', '619-555-0120'),
    (NEWID(), 'PaymentStream Inc.', 'Payment Processing', 520, 185000000.00, NULL, NULL, NULL, 'https://www.paymentstream.com', 'Payment processing and merchant services', 2012, 'Charlotte', 'NC', 'United States', '704-555-0121'),
    (NEWID(), 'InsurTech Innovations', 'Insurance Technology', 280, 88000000.00, NULL, NULL, NULL, 'https://www.insurtech.com', 'Insurance technology and underwriting platform', 2015, 'Hartford', 'CT', 'United States', '860-555-0122'),
    (NEWID(), 'WealthManage Systems', 'Wealth Management', 165, 62000000.00, NULL, NULL, NULL, 'https://www.wealthmanage.com', 'Wealth management and financial planning software', 2016, 'Dallas', 'TX', 'United States', '214-555-0123'),
    (NEWID(), 'CryptoSecure Technologies', 'Blockchain & Crypto', 95, 38000000.00, NULL, NULL, NULL, 'https://www.cryptosecure.io', 'Cryptocurrency security and blockchain solutions', 2019, 'Miami', 'FL', 'United States', '305-555-0124'),
    (NEWID(), 'RegTech Compliance', 'Regulatory Technology', 140, 48000000.00, NULL, NULL, NULL, 'https://www.regtech.com', 'Regulatory compliance and risk management software', 2017, 'Washington', 'DC', 'United States', '202-555-0125'),
    (NEWID(), 'Digital Transform Partners', 'IT Consulting', 350, 125000000.00, NULL, NULL, NULL, 'https://www.digitaltransform.com', 'Digital transformation consulting and implementation services', 2011, 'New York', 'NY', 'United States', '212-555-0126'),
    (NEWID(), 'CloudMigrate Consulting', 'Cloud Consulting', 180, 68000000.00, NULL, NULL, NULL, 'https://www.cloudmigrate.com', 'Cloud migration and optimization consulting', 2015, 'San Francisco', 'CA', 'United States', '415-555-0127'),
    (NEWID(), 'AgileCoach Group', 'Agile Consulting', 85, 28000000.00, NULL, NULL, NULL, 'https://www.agilecoach.com', 'Agile transformation and coaching services', 2016, 'Austin', 'TX', 'United States', '512-555-0128'),
    (NEWID(), 'DataStrategy Advisors', 'Data Consulting', 120, 45000000.00, NULL, NULL, NULL, 'https://www.datastrategy.com', 'Data strategy and analytics consulting', 2014, 'Chicago', 'IL', 'United States', '312-555-0129'),
    (NEWID(), 'SecurityFirst Consulting', 'Security Consulting', 95, 35000000.00, NULL, NULL, NULL, 'https://www.securityfirst.com', 'Cybersecurity consulting and penetration testing', 2017, 'Seattle', 'WA', 'United States', '206-555-0130'),
    (NEWID(), 'AIStartup Labs', 'Artificial Intelligence', 42, 8500000.00, NULL, NULL, NULL, 'https://www.aistartup.ai', 'Early-stage AI research and development', 2022, 'Palo Alto', 'CA', 'United States', '650-555-0136'),
    (NEWID(), 'GreenTech Innovations', 'Sustainability Tech', 35, 6800000.00, NULL, NULL, NULL, 'https://www.greentech.eco', 'Sustainable technology solutions for climate change', 2022, 'Portland', 'OR', 'United States', '503-555-0138');


-- ============================================================================
-- MEMBERS (500 Members)
-- ============================================================================


-- Key Members with Full Details (Mix of real executives from public companies and fictional members)
INSERT INTO [AssociationDemo].[Member] (ID, Email, FirstName, LastName, Title, OrganizationID, Industry, JobFunction, YearsInProfession, JoinDate, City, State, Country, Phone, LinkedInURL)
VALUES
    -- Real Executives from Public Companies
    (@Member_SarahChen, 'satya.nadella@microsoft.com', 'Satya', 'Nadella', 'Chairman and Chief Executive Officer', @Org_TechVentures, 'Cloud & AI', 'Executive', 33, DATEADD(DAY, -1825, @EndDate), 'Redmond', 'WA', 'United States', '425-882-8080', 'https://linkedin.com/in/satyanadella'),
    (@Member_MichaelJohnson, 'marc.benioff@salesforce.com', 'Marc', 'Benioff', 'Chair and Chief Executive Officer', @Org_CloudScale, 'Cloud Software', 'Executive', 40, DATEADD(DAY, -1950, @EndDate), 'San Francisco', 'CA', 'United States', '415-901-7000', 'https://linkedin.com/in/marcbenioff'),
    (@Member_EmilyRodriguez, 'jensen.huang@nvidia.com', 'Jensen', 'Huang', 'Founder, President and Chief Executive Officer', @Org_DataDriven, 'AI & Semiconductors', 'Executive', 30, DATEADD(DAY, -1680, @EndDate), 'Santa Clara', 'CA', 'United States', '408-486-2000', 'https://linkedin.com/in/jensenh'),
    (@Member_DavidKim, 'nikesh.arora@paloaltonetworks.com', 'Nikesh', 'Arora', 'Chairman and Chief Executive Officer', @Org_CyberShield, 'Cybersecurity', 'Executive', 35, DATEADD(DAY, -1460, @EndDate), 'Santa Clara', 'CA', 'United States', '408-753-4000', 'https://linkedin.com/in/nikesharora'),
    (@Member_JessicaLee, 'safra.catz@oracle.com', 'Safra', 'Catz', 'Chief Executive Officer', @Org_HealthTech, 'Enterprise Software', 'Executive', 25, DATEADD(DAY, -1280, @EndDate), 'Austin', 'TX', 'United States', '650-506-7000', 'https://linkedin.com/in/safracatz'),
    (@Member_RobertBrown, 'bill.mcdermott@servicenow.com', 'Bill', 'McDermott', 'Chairman and Chief Executive Officer', @Org_FinancialEdge, 'Enterprise Software', 'Executive', 40, DATEADD(DAY, -1825, @EndDate), 'Santa Clara', 'CA', 'United States', '408-501-8550', 'https://linkedin.com/in/williammcdermott'),
    (@Member_LisaAnderson, 'tobi.lutke@shopify.com', 'Tobi', 'Lütke', 'Founder and Chief Executive Officer', @Org_RetailInnovate, 'E-Commerce', 'Executive', 20, DATEADD(DAY, -1095, @EndDate), 'Ottawa', 'Ontario', 'Canada', '+1-888-746-7439', 'https://linkedin.com/in/tobi'),
    (@Member_JamesPatel, 'shantanu.narayen@adobe.com', 'Shantanu', 'Narayen', 'Chairman and Chief Executive Officer', @Org_EduTech, 'Digital Media Software', 'Executive', 32, DATEADD(DAY, -1680, @EndDate), 'San Jose', 'CA', 'United States', '408-536-6000', 'https://linkedin.com/in/shantanunarayen'),
    (@Member_MariaGarcia, 'aneel.bhusri@workday.com', 'Aneel', 'Bhusri', 'Co-Founder and Executive Chairman', @Org_ManufacturePro, 'Enterprise Cloud', 'Executive', 25, DATEADD(DAY, -1460, @EndDate), 'Pleasanton', 'CA', 'United States', '925-951-9000', 'https://linkedin.com/in/aneelbhusri'),
    (@Member_JohnSmith, 'frank.slootman@snowflake.com', 'Frank', 'Slootman', 'Chairman and Chief Executive Officer', @Org_LogisticsPrime, 'Data Cloud', 'Executive', 40, DATEADD(DAY, -1280, @EndDate), 'Bozeman', 'MT', 'United States', '844-766-9355', 'https://linkedin.com/in/frankslootman'),

    -- Fictional Members (mix of different roles and experience levels)
    (@Member_AlexTaylor, 'alex.taylor@university.edu', 'Alex', 'Taylor', 'Graduate Student', NULL, 'Computer Science', 'Student', 2, DATEADD(DAY, -180, @EndDate), 'Cambridge', 'MA', 'United States', '617-555-1011', 'https://linkedin.com/in/alextaylor'),
    (@Member_RachelWilson, 'rachel.wilson@microsoft.com', 'Rachel', 'Wilson', 'Senior DevOps Engineer', @Org_TechVentures, 'Cloud & AI', 'DevOps', 7, DATEADD(DAY, -640, @EndDate), 'Redmond', 'WA', 'United States', '425-555-1012', 'https://linkedin.com/in/rachelwilson'),
    (@Member_KevinMartinez, 'kevin.martinez@salesforce.com', 'Kevin', 'Martinez', 'Principal Cloud Architect', @Org_CloudScale, 'Cloud Software', 'Cloud Architecture', 13, DATEADD(DAY, -1200, @EndDate), 'San Francisco', 'CA', 'United States', '415-555-1013', 'https://linkedin.com/in/kevinmartinez'),
    (@Member_AmandaClark, 'amanda.clark@nvidia.com', 'Amanda', 'Clark', 'Machine Learning Engineer', @Org_DataDriven, 'AI & Semiconductors', 'Machine Learning', 6, DATEADD(DAY, -550, @EndDate), 'Santa Clara', 'CA', 'United States', '408-555-1014', 'https://linkedin.com/in/amandaclark'),
    (@Member_DanielNguyen, 'daniel.nguyen@paloaltonetworks.com', 'Daniel', 'Nguyen', 'Security Operations Manager', @Org_CyberShield, 'Cybersecurity', 'Security Operations', 9, DATEADD(DAY, -820, @EndDate), 'Santa Clara', 'CA', 'United States', '408-555-1015', 'https://linkedin.com/in/danielnguyen');


-- Remaining 485 members generated programmatically with realistic distributions
DECLARE @CurrentOrg UNIQUEIDENTIFIER;
DECLARE @MemberJoinDaysAgo INT;
DECLARE @FirstNames TABLE (FirstName NVARCHAR(50));
DECLARE @LastNames TABLE (LastName NVARCHAR(50));
DECLARE @Titles TABLE (Title NVARCHAR(100), JobFunction NVARCHAR(100), YearsMin INT, YearsMax INT);
DECLARE @Cities TABLE (City NVARCHAR(100), State NVARCHAR(50), Country NVARCHAR(100));

-- Populate name pools
INSERT INTO @FirstNames VALUES
('Jennifer'),('Thomas'),('Patricia'),('Christopher'),('Michelle'),
('Brandon'),('Rebecca'),('Andrew'),('Stephanie'),('Joshua'),
('Nicole'),('Ryan'),('Angela'),('Justin'),('Melissa'),
('Adam'),('Katherine'),('Brian'),('Amy'),('Jason'),
('Samantha'),('Matthew'),('Laura'),('Anthony'),('Elizabeth'),
('Jonathan'),('Ashley'),('William'),('Heather'),('Joseph'),
('Anna'),('Daniel'),('Kimberly'),('Charles'),('Brittany'),
('Eric'),('Amanda'),('Gregory'),('Lauren'),('Benjamin'),
('Megan'),('Kenneth'),('Rachel'),('Steven'),('Danielle'),
('Timothy'),('Christina'),('Nathan'),('Crystal'),('Jeffrey');

INSERT INTO @LastNames VALUES
('Smith'),('Johnson'),('Williams'),('Brown'),('Jones'),
('Garcia'),('Miller'),('Davis'),('Rodriguez'),('Martinez'),
('Hernandez'),('Lopez'),('Gonzalez'),('Wilson'),('Anderson'),
('Thomas'),('Taylor'),('Moore'),('Jackson'),('Martin'),
('Lee'),('Perez'),('Thompson'),('White'),('Harris'),
('Sanchez'),('Clark'),('Ramirez'),('Lewis'),('Robinson'),
('Walker'),('Young'),('Allen'),('King'),('Wright'),
('Scott'),('Torres'),('Nguyen'),('Hill'),('Flores'),
('Green'),('Adams'),('Nelson'),('Baker'),('Hall'),
('Rivera'),('Campbell'),('Mitchell'),('Carter'),('Roberts');

INSERT INTO @Titles VALUES
('Software Engineer', 'Software Development', 2, 8),
('Senior Software Engineer', 'Software Development', 5, 12),
('Principal Engineer', 'Software Development', 10, 20),
('Engineering Manager', 'Engineering Leadership', 8, 15),
('Director of Engineering', 'Engineering Leadership', 12, 20),
('VP of Engineering', 'Engineering Leadership', 15, 25),
('Product Manager', 'Product Management', 3, 10),
('Senior Product Manager', 'Product Management', 6, 15),
('Data Scientist', 'Data Science', 2, 8),
('Senior Data Scientist', 'Data Science', 5, 12),
('Machine Learning Engineer', 'Machine Learning', 3, 10),
('DevOps Engineer', 'DevOps', 2, 8),
('Senior DevOps Engineer', 'DevOps', 5, 12),
('Cloud Architect', 'Cloud Architecture', 6, 15),
('Solutions Architect', 'Solutions Architecture', 5, 12),
('Security Engineer', 'Security', 3, 10),
('Security Architect', 'Security Architecture', 8, 15),
('QA Engineer', 'Quality Assurance', 2, 8),
('Senior QA Engineer', 'Quality Assurance', 5, 12),
('UX Designer', 'Design', 2, 8),
('Senior UX Designer', 'Design', 5, 12),
('UI/UX Lead', 'Design', 8, 15),
('Data Analyst', 'Data Analysis', 2, 6),
('Business Analyst', 'Business Analysis', 3, 8),
('Scrum Master', 'Agile', 3, 10),
('Technical Lead', 'Technical Leadership', 6, 12),
('Team Lead', 'Team Leadership', 5, 10),
('CTO', 'Executive', 15, 30),
('VP of Technology', 'Executive', 12, 25),
('Chief Architect', 'Architecture', 15, 25);

INSERT INTO @Cities VALUES
('Austin', 'TX', 'United States'),('Seattle', 'WA', 'United States'),
('San Francisco', 'CA', 'United States'),('Boston', 'MA', 'United States'),
('Chicago', 'IL', 'United States'),('New York', 'NY', 'United States'),
('Denver', 'CO', 'United States'),('Los Angeles', 'CA', 'United States'),
('Portland', 'OR', 'United States'),('Atlanta', 'GA', 'United States'),
('Dallas', 'TX', 'United States'),('Phoenix', 'AZ', 'United States'),
('San Diego', 'CA', 'United States'),('Charlotte', 'NC', 'United States'),
('Miami', 'FL', 'United States'),('Minneapolis', 'MN', 'United States'),
('Detroit', 'MI', 'United States'),('Nashville', 'TN', 'United States'),
('Philadelphia', 'PA', 'United States'),('Washington', 'DC', 'United States'),
('Toronto', 'Ontario', 'Canada'),('Vancouver', 'BC', 'Canada'),
('London', NULL, 'United Kingdom'),('Singapore', NULL, 'Singapore'),
('Sydney', 'NSW', 'Australia');

-- Generate 485 additional members
INSERT INTO [AssociationDemo].[Member] (ID, Email, FirstName, LastName, Title, OrganizationID, Industry, JobFunction, YearsInProfession, JoinDate, City, State, Country)
SELECT TOP 485
    NEWID(),
    LOWER(fn.FirstName + '.' + ln.LastName + CAST(ABS(CHECKSUM(NEWID()) % 1000) AS NVARCHAR(10)) + '@' +
        CASE ABS(CHECKSUM(NEWID()) % 10)
            WHEN 0 THEN 'techventures.com'
            WHEN 1 THEN 'cloudscale.io'
            WHEN 2 THEN 'example.com'
            WHEN 3 THEN 'company.com'
            WHEN 4 THEN 'tech.io'
            WHEN 5 THEN 'software.com'
            WHEN 6 THEN 'solutions.com'
            WHEN 7 THEN 'consulting.com'
            WHEN 8 THEN 'systems.com'
            ELSE 'services.com'
        END
    ),
    fn.FirstName,
    ln.LastName,
    t.Title,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 70 THEN o.ID ELSE NULL END, -- 70% have organization
    CASE ABS(CHECKSUM(NEWID()) % 12)
        WHEN 0 THEN 'Software & SaaS'
        WHEN 1 THEN 'Cloud Infrastructure'
        WHEN 2 THEN 'Data & AI'
        WHEN 3 THEN 'Cybersecurity'
        WHEN 4 THEN 'Healthcare Technology'
        WHEN 5 THEN 'FinTech'
        WHEN 6 THEN 'Consulting'
        WHEN 7 THEN 'Education Technology'
        WHEN 8 THEN 'Manufacturing Software'
        WHEN 9 THEN 'Logistics & Supply Chain'
        WHEN 10 THEN 'Retail Technology'
        ELSE 'Technology Services'
    END,
    t.JobFunction,
    t.YearsMin + ABS(CHECKSUM(NEWID()) % (t.YearsMax - t.YearsMin + 1)),
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 1825), @EndDate), -- Join dates spread over 5 years
    c.City,
    c.State,
    c.Country
FROM @FirstNames fn
CROSS JOIN @LastNames ln
CROSS JOIN @Titles t
CROSS JOIN @Cities c
CROSS APPLY (
    SELECT TOP 1 ID FROM [AssociationDemo].[Organization] ORDER BY NEWID()
) o
ORDER BY NEWID();


-- ============================================================================
-- MEMBERSHIPS (625 records including renewals)
-- ============================================================================


-- Key members with detailed renewal histories (17 records for the 15 key members)
INSERT INTO [AssociationDemo].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
VALUES
    -- Sarah Chen - Active Individual Member with 4 renewals
    (NEWID(), @Member_SarahChen, @MembershipType_Individual, 'Active', DATEADD(DAY, -1460, @EndDate), DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -1095, @EndDate), 1),
    (NEWID(), @Member_SarahChen, @MembershipType_Individual, 'Active', DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -730, @EndDate), 1),
    (NEWID(), @Member_SarahChen, @MembershipType_Individual, 'Active', DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -365, @EndDate), DATEADD(DAY, -365, @EndDate), 1),
    (NEWID(), @Member_SarahChen, @MembershipType_Individual, 'Active', DATEADD(DAY, -365, @EndDate), DATEADD(DAY, 365, @EndDate), NULL, 1),

    -- Michael Johnson - Active Corporate Member with 5 renewals
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -1825, @EndDate), DATEADD(DAY, -1460, @EndDate), DATEADD(DAY, -1460, @EndDate), 1),
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -1460, @EndDate), DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -1095, @EndDate), 1),
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -730, @EndDate), 1),
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -365, @EndDate), DATEADD(DAY, -365, @EndDate), 1),
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -365, @EndDate), DATEADD(DAY, 365, @EndDate), NULL, 1),

    -- Emily Rodriguez - Active Individual Member with 3 renewals
    (NEWID(), @Member_EmilyRodriguez, @MembershipType_Individual, 'Active', DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -730, @EndDate), 1),
    (NEWID(), @Member_EmilyRodriguez, @MembershipType_Individual, 'Active', DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -365, @EndDate), DATEADD(DAY, -365, @EndDate), 1),
    (NEWID(), @Member_EmilyRodriguez, @MembershipType_Individual, 'Active', DATEADD(DAY, -365, @EndDate), DATEADD(DAY, 365, @EndDate), NULL, 1),

    -- David Kim - Active Individual Member with 4 renewals
    (NEWID(), @Member_DavidKim, @MembershipType_Individual, 'Active', DATEADD(DAY, -1680, @EndDate), DATEADD(DAY, -1315, @EndDate), DATEADD(DAY, -1315, @EndDate), 1),
    (NEWID(), @Member_DavidKim, @MembershipType_Individual, 'Active', DATEADD(DAY, -1315, @EndDate), DATEADD(DAY, -950, @EndDate), DATEADD(DAY, -950, @EndDate), 1),
    (NEWID(), @Member_DavidKim, @MembershipType_Individual, 'Active', DATEADD(DAY, -950, @EndDate), DATEADD(DAY, -585, @EndDate), DATEADD(DAY, -585, @EndDate), 1),
    (NEWID(), @Member_DavidKim, @MembershipType_Individual, 'Active', DATEADD(DAY, -585, @EndDate), DATEADD(DAY, 365, @EndDate), NULL, 1),

    -- Alex Taylor - Student Member (joined 6 months ago)
    (NEWID(), @Member_AlexTaylor, @MembershipType_Student, 'Active', DATEADD(DAY, -180, @EndDate), DATEADD(DAY, 185, @EndDate), NULL, 1);


-- Generate memberships for all remaining members (608 more to reach 625)
-- 80% will be Active, 15% Expired, 5% Cancelled
-- 25% will have renewal history (multiple records)
DECLARE @MembershipTypeDistribution TABLE (TypeID UNIQUEIDENTIFIER, Probability INT);
INSERT INTO @MembershipTypeDistribution VALUES
    (@MembershipType_Individual, 60),      -- 60% Individual
    (@MembershipType_Student, 10),          -- 10% Student
    (@MembershipType_Corporate, 15),        -- 15% Corporate
    (@MembershipType_EarlyCareer, 10),      -- 10% Early Career
    (@MembershipType_Retired, 3),           -- 3% Retired
    (@MembershipType_International, 2);     -- 2% International

-- First membership for each remaining member (483 members = 483 records)
INSERT INTO [AssociationDemo].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
SELECT
    NEWID(),
    m.ID,
    -- Use weighted random selection with COALESCE to ensure non-NULL
    COALESCE(
        (SELECT TOP 1 TypeID FROM @MembershipTypeDistribution
         WHERE Probability >= ABS(CHECKSUM(NEWID()) % 100)
         ORDER BY Probability DESC),
        @MembershipType_Individual  -- Fallback to Individual if no match
    ),
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 80 THEN 'Active'
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 95 THEN 'Lapsed'
        ELSE 'Cancelled'
    END,
    m.JoinDate,
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 80 THEN DATEADD(YEAR, 1, m.JoinDate) -- Active: future end date
        ELSE DATEADD(MONTH, 6, m.JoinDate) -- Expired/Cancelled: past end date
    END,
    NULL,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 70 THEN 1 ELSE 0 END
FROM [AssociationDemo].[Member] m
WHERE m.ID NOT IN (@Member_SarahChen, @Member_MichaelJohnson, @Member_EmilyRodriguez, @Member_DavidKim, @Member_AlexTaylor);


-- Additional renewal records for 25% of members (125 additional records to get to 625 total)
INSERT INTO [AssociationDemo].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
SELECT TOP 125
    NEWID(),
    ms.MemberID,
    ms.MembershipTypeID,
    'Active',
    DATEADD(YEAR, -1, ms.StartDate),
    ms.StartDate,
    ms.StartDate,
    1
FROM [AssociationDemo].[Membership] ms
WHERE ms.MemberID NOT IN (@Member_SarahChen, @Member_MichaelJohnson, @Member_EmilyRodriguez, @Member_DavidKim, @Member_AlexTaylor)
  AND ms.Status = 'Active'
ORDER BY NEWID();


-- Note: No GO statement here - variables must persist within transaction
