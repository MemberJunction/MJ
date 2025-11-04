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

PRINT '=================================================================';
PRINT 'POPULATING MEMBERSHIP DATA';
PRINT '=================================================================';
PRINT '';

-- Load parameters from 00_parameters.sql
:r 00_parameters.sql

-- ============================================================================
-- MEMBERSHIP TYPES (8 Types)
-- ============================================================================

PRINT 'Inserting Membership Types...';

INSERT INTO [membership].[MembershipType] (ID, Name, Description, AnnualDues, RenewalPeriodMonths, IsActive, AllowAutoRenew, RequiresApproval, Benefits, DisplayOrder)
VALUES
    (@MembershipType_Individual, 'Individual Professional', 'Standard individual membership for technology professionals', 295.00, 12, 1, 1, 0, 'Full access to events, courses, and resources. Includes monthly newsletter, member directory access, and discounts on conferences.', 1),
    (@MembershipType_Student, 'Student', 'Discounted membership for full-time students', 95.00, 12, 1, 1, 1, 'Access to educational resources, webinars, and student networking events. Requires verification of student status.', 2),
    (@MembershipType_Corporate, 'Corporate', 'Enterprise membership for organizations with multiple employees', 2500.00, 12, 1, 1, 0, 'Covers up to 10 employees. Includes all individual benefits plus corporate branding opportunities and dedicated account management.', 3),
    (@MembershipType_Lifetime, 'Lifetime Member', 'One-time payment for lifetime membership', 5000.00, 1200, 1, 0, 0, 'All Individual Professional benefits for life. Recognition in member directory and special lifetime member events.', 4),
    (@MembershipType_Retired, 'Retired Professional', 'Reduced rate for retired industry professionals', 150.00, 12, 1, 1, 0, 'Full member benefits at a reduced rate for retired professionals. Includes emeritus status recognition.', 5),
    (@MembershipType_EarlyCareer, 'Early Career Professional', 'Special rate for professionals with less than 5 years experience', 195.00, 12, 1, 1, 0, 'Full member benefits with additional mentorship program access and career development resources.', 6),
    (@MembershipType_International, 'International Member', 'Membership for professionals outside North America', 350.00, 12, 1, 1, 0, 'All Individual Professional benefits with international event access and global member directory.', 7),
    (@MembershipType_Honorary, 'Honorary Member', 'Complimentary membership for distinguished contributors', 0.00, 12, 1, 0, 1, 'Awarded by the board for outstanding contributions to the field. Includes all member benefits with special recognition.', 8);

PRINT '  Membership Types: 8 inserted';
PRINT '';

-- ============================================================================
-- ORGANIZATIONS (40 Organizations)
-- ============================================================================

PRINT 'Inserting Organizations...';

INSERT INTO [membership].[Organization] (ID, Name, Industry, EmployeeCount, AnnualRevenue, Website, Description, YearFounded, City, State, Country, Phone)
VALUES
    -- Technology Companies (15)
    (@Org_TechVentures, 'TechVentures Inc.', 'Software & SaaS', 450, 125000000.00, 'https://www.techventures.com', 'Leading provider of enterprise cloud solutions and digital transformation services', 2015, 'Austin', 'TX', 'United States', '512-555-0101'),
    (@Org_CloudScale, 'CloudScale Systems', 'Cloud Infrastructure', 850, 285000000.00, 'https://www.cloudscale.io', 'Cloud infrastructure and platform services for global enterprises', 2012, 'Seattle', 'WA', 'United States', '206-555-0102'),
    (@Org_DataDriven, 'DataDriven Analytics', 'Data & AI', 320, 95000000.00, 'https://www.datadriven.ai', 'AI-powered analytics platform for business intelligence', 2017, 'San Francisco', 'CA', 'United States', '415-555-0103'),
    (@Org_CyberShield, 'CyberShield Security', 'Cybersecurity', 580, 175000000.00, 'https://www.cybershield.com', 'Enterprise cybersecurity solutions and managed security services', 2014, 'Boston', 'MA', 'United States', '617-555-0104'),
    (@Org_HealthTech, 'HealthTech Solutions', 'Healthcare Technology', 1200, 580000000.00, 'https://www.healthtech-solutions.com', 'Healthcare technology platform connecting providers and patients', 2010, 'Chicago', 'IL', 'United States', '312-555-0105'),
    (@Org_FinancialEdge, 'FinancialEdge Systems', 'FinTech', 420, 145000000.00, 'https://www.financialedge.com', 'Financial technology platform for banking and payments', 2016, 'New York', 'NY', 'United States', '212-555-0106'),
    (@Org_RetailInnovate, 'RetailInnovate Technologies', 'Retail Technology', 290, 78000000.00, 'https://www.retailinnovate.com', 'E-commerce and retail technology solutions', 2018, 'Denver', 'CO', 'United States', '303-555-0107'),
    (@Org_EduTech, 'EduTech Learning', 'Education Technology', 380, 112000000.00, 'https://www.edutech.com', 'Online learning platform and educational software', 2015, 'Palo Alto', 'CA', 'United States', '650-555-0108'),
    (@Org_ManufacturePro, 'ManufacturePro Systems', 'Manufacturing Software', 510, 165000000.00, 'https://www.manufacturepro.com', 'Manufacturing execution and supply chain software', 2011, 'Detroit', 'MI', 'United States', '313-555-0109'),
    (@Org_LogisticsPrime, 'LogisticsPrime Technologies', 'Logistics & Supply Chain', 670, 220000000.00, 'https://www.logisticsprime.com', 'Supply chain optimization and logistics management software', 2013, 'Atlanta', 'GA', 'United States', '404-555-0110'),
    (NEWID(), 'DevOps Masters', 'DevOps Tools', 180, 52000000.00, 'https://www.devopsmasters.io', 'Continuous integration and deployment automation platform', 2019, 'Portland', 'OR', 'United States', '503-555-0111'),
    (NEWID(), 'CodeCraft Studios', 'Software Development', 125, 28000000.00, 'https://www.codecraft.dev', 'Custom software development and engineering services', 2018, 'Boulder', 'CO', 'United States', '720-555-0112'),
    (NEWID(), 'APIGate Solutions', 'API Management', 95, 22000000.00, 'https://www.apigate.com', 'API management and integration platform', 2020, 'San Jose', 'CA', 'United States', '408-555-0113'),
    (NEWID(), 'MobileFirst Apps', 'Mobile Development', 160, 45000000.00, 'https://www.mobilefirst.app', 'Mobile application development and deployment platform', 2017, 'Los Angeles', 'CA', 'United States', '213-555-0114'),
    (NEWID(), 'Quantum Computing Labs', 'Emerging Technology', 85, 35000000.00, 'https://www.quantumlabs.tech', 'Quantum computing research and applications', 2021, 'Cambridge', 'MA', 'United States', '617-555-0115'),

    -- Healthcare Organizations (5)
    (NEWID(), 'MediConnect Systems', 'Healthcare IT', 420, 135000000.00, 'https://www.mediconnect.health', 'Healthcare interoperability and data exchange platform', 2014, 'Nashville', 'TN', 'United States', '615-555-0116'),
    (NEWID(), 'PatientFirst Technology', 'Patient Engagement', 210, 68000000.00, 'https://www.patientfirst.com', 'Patient engagement and communication platform', 2016, 'Minneapolis', 'MN', 'United States', '612-555-0117'),
    (NEWID(), 'PharmaTech Solutions', 'Pharmaceutical IT', 340, 98000000.00, 'https://www.pharmatech.com', 'Pharmaceutical research and compliance software', 2013, 'Philadelphia', 'PA', 'United States', '215-555-0118'),
    (NEWID(), 'HealthAnalytics Pro', 'Healthcare Analytics', 190, 55000000.00, 'https://www.healthanalytics.com', 'Healthcare data analytics and population health management', 2017, 'Phoenix', 'AZ', 'United States', '602-555-0119'),
    (NEWID(), 'TeleMed Connect', 'Telemedicine', 145, 42000000.00, 'https://www.telemed.health', 'Telemedicine platform and remote care solutions', 2020, 'San Diego', 'CA', 'United States', '619-555-0120'),

    -- Financial Services (5)
    (NEWID(), 'PaymentStream Inc.', 'Payment Processing', 520, 185000000.00, 'https://www.paymentstream.com', 'Payment processing and merchant services', 2012, 'Charlotte', 'NC', 'United States', '704-555-0121'),
    (NEWID(), 'InsurTech Innovations', 'Insurance Technology', 280, 88000000.00, 'https://www.insurtech.com', 'Insurance technology and underwriting platform', 2015, 'Hartford', 'CT', 'United States', '860-555-0122'),
    (NEWID(), 'WealthManage Systems', 'Wealth Management', 165, 62000000.00, 'https://www.wealthmanage.com', 'Wealth management and financial planning software', 2016, 'Dallas', 'TX', 'United States', '214-555-0123'),
    (NEWID(), 'CryptoSecure Technologies', 'Blockchain & Crypto', 95, 38000000.00, 'https://www.cryptosecure.io', 'Cryptocurrency security and blockchain solutions', 2019, 'Miami', 'FL', 'United States', '305-555-0124'),
    (NEWID(), 'RegTech Compliance', 'Regulatory Technology', 140, 48000000.00, 'https://www.regtech.com', 'Regulatory compliance and risk management software', 2017, 'Washington', 'DC', 'United States', '202-555-0125'),

    -- Consulting & Services (5)
    (NEWID(), 'Digital Transform Partners', 'IT Consulting', 350, 125000000.00, 'https://www.digitaltransform.com', 'Digital transformation consulting and implementation services', 2011, 'New York', 'NY', 'United States', '212-555-0126'),
    (NEWID(), 'CloudMigrate Consulting', 'Cloud Consulting', 180, 68000000.00, 'https://www.cloudmigrate.com', 'Cloud migration and optimization consulting', 2015, 'San Francisco', 'CA', 'United States', '415-555-0127'),
    (NEWID(), 'AgileCoach Group', 'Agile Consulting', 85, 28000000.00, 'https://www.agilecoach.com', 'Agile transformation and coaching services', 2016, 'Austin', 'TX', 'United States', '512-555-0128'),
    (NEWID(), 'DataStrategy Advisors', 'Data Consulting', 120, 45000000.00, 'https://www.datastrategy.com', 'Data strategy and analytics consulting', 2014, 'Chicago', 'IL', 'United States', '312-555-0129'),
    (NEWID(), 'SecurityFirst Consulting', 'Security Consulting', 95, 35000000.00, 'https://www.securityfirst.com', 'Cybersecurity consulting and penetration testing', 2017, 'Seattle', 'WA', 'United States', '206-555-0130'),

    -- International Companies (5)
    (NEWID(), 'GlobalTech Solutions', 'Global IT Services', 2400, 850000000.00, 'https://www.globaltech.com', 'Multinational IT services and consulting', 2005, 'Toronto', 'Ontario', 'Canada', '+1-416-555-0131'),
    (NEWID(), 'EuroSoft Systems', 'Enterprise Software', 680, 245000000.00, 'https://www.eurosoft.eu', 'European enterprise software provider', 2008, 'London', NULL, 'United Kingdom', '+44-20-5555-0132'),
    (NEWID(), 'Asia Pacific Technologies', 'Technology Services', 1200, 420000000.00, 'https://www.apactech.com', 'Asia Pacific technology services and solutions', 2010, 'Singapore', NULL, 'Singapore', '+65-6555-0133'),
    (NEWID(), 'MexTech Innovations', 'Software Development', 320, 92000000.00, 'https://www.mextech.mx', 'Latin American software development and services', 2014, 'Mexico City', NULL, 'Mexico', '+52-55-5555-0134'),
    (NEWID(), 'AussieTech Group', 'Technology Consulting', 280, 78000000.00, 'https://www.aussietech.com.au', 'Australian technology consulting and services', 2013, 'Sydney', 'NSW', 'Australia', '+61-2-5555-0135'),

    -- Startups & Emerging Companies (5)
    (NEWID(), 'AIStartup Labs', 'Artificial Intelligence', 42, 8500000.00, 'https://www.aistartup.ai', 'Early-stage AI research and development', 2022, 'Palo Alto', 'CA', 'United States', '650-555-0136'),
    (NEWID(), 'BlockChain Builders', 'Blockchain', 28, 5200000.00, 'https://www.blockchainbuilders.io', 'Blockchain development and consulting startup', 2021, 'Austin', 'TX', 'United States', '512-555-0137'),
    (NEWID(), 'GreenTech Innovations', 'Sustainability Tech', 35, 6800000.00, 'https://www.greentech.eco', 'Sustainable technology solutions for climate change', 2022, 'Portland', 'OR', 'United States', '503-555-0138'),
    (NEWID(), 'EdTech Pioneers', 'Education', 31, 5900000.00, 'https://www.edtechpioneers.com', 'Innovative educational technology for K-12', 2021, 'Boston', 'MA', 'United States', '617-555-0139'),
    (NEWID(), 'IoT Innovations Inc.', 'Internet of Things', 48, 9200000.00, 'https://www.iot-innovations.com', 'IoT platform and connected device solutions', 2020, 'San Jose', 'CA', 'United States', '408-555-0140');

PRINT '  Organizations: 40 inserted';
PRINT '';

-- ============================================================================
-- MEMBERS (500 Members)
-- ============================================================================

PRINT 'Inserting Members...';

-- Key Members with Full Details (15 members used in journeys and leadership)
INSERT INTO [membership].[Member] (ID, Email, FirstName, LastName, Title, OrganizationID, Industry, JobFunction, YearsInProfession, JoinDate, City, State, Country, Phone, LinkedInURL)
VALUES
    (@Member_SarahChen, 'sarah.chen@techventures.com', 'Sarah', 'Chen', 'VP of Engineering', @Org_TechVentures, 'Software & SaaS', 'Engineering Leadership', 15, DATEADD(DAY, -1460, @EndDate), 'Austin', 'TX', 'United States', '512-555-1001', 'https://linkedin.com/in/sarahchen'),
    (@Member_MichaelJohnson, 'michael.johnson@cloudscale.io', 'Michael', 'Johnson', 'Chief Technology Officer', @Org_CloudScale, 'Cloud Infrastructure', 'Executive', 20, DATEADD(DAY, -1825, @EndDate), 'Seattle', 'WA', 'United States', '206-555-1002', 'https://linkedin.com/in/michaeljohnson'),
    (@Member_EmilyRodriguez, 'emily.rodriguez@datadriven.ai', 'Emily', 'Rodriguez', 'Director of Data Science', @Org_DataDriven, 'Data & AI', 'Data Science', 12, DATEADD(DAY, -1095, @EndDate), 'San Francisco', 'CA', 'United States', '415-555-1003', 'https://linkedin.com/in/emilyrodriguez'),
    (@Member_DavidKim, 'david.kim@cybershield.com', 'David', 'Kim', 'Senior Security Architect', @Org_CyberShield, 'Cybersecurity', 'Security Architecture', 18, DATEADD(DAY, -1680, @EndDate), 'Boston', 'MA', 'United States', '617-555-1004', 'https://linkedin.com/in/davidkim'),
    (@Member_JessicaLee, 'jessica.lee@healthtech-solutions.com', 'Jessica', 'Lee', 'Product Manager', @Org_HealthTech, 'Healthcare Technology', 'Product Management', 8, DATEADD(DAY, -730, @EndDate), 'Chicago', 'IL', 'United States', '312-555-1005', 'https://linkedin.com/in/jessicalee'),
    (@Member_RobertBrown, 'robert.brown@financialedge.com', 'Robert', 'Brown', 'Chief Financial Officer', @Org_FinancialEdge, 'FinTech', 'Executive', 22, DATEADD(DAY, -1950, @EndDate), 'New York', 'NY', 'United States', '212-555-1006', 'https://linkedin.com/in/robertbrown'),
    (@Member_LisaAnderson, 'lisa.anderson@retailinnovate.com', 'Lisa', 'Anderson', 'Head of Technology', @Org_RetailInnovate, 'Retail Technology', 'Technology Leadership', 14, DATEADD(DAY, -1280, @EndDate), 'Denver', 'CO', 'United States', '303-555-1007', 'https://linkedin.com/in/lisaanderson'),
    (@Member_JamesPatel, 'james.patel@edutech.com', 'James', 'Patel', 'Software Engineering Manager', @Org_EduTech, 'Education Technology', 'Engineering Leadership', 10, DATEADD(DAY, -900, @EndDate), 'Palo Alto', 'CA', 'United States', '650-555-1008', 'https://linkedin.com/in/jamespatel'),
    (@Member_MariaGarcia, 'maria.garcia@manufacturepro.com', 'Maria', 'Garcia', 'Solutions Architect', @Org_ManufacturePro, 'Manufacturing Software', 'Solutions Architecture', 11, DATEADD(DAY, -1020, @EndDate), 'Detroit', 'MI', 'United States', '313-555-1009', 'https://linkedin.com/in/mariagarcia'),
    (@Member_JohnSmith, 'john.smith@logisticsprime.com', 'John', 'Smith', 'Director of Engineering', @Org_LogisticsPrime, 'Logistics & Supply Chain', 'Engineering Leadership', 16, DATEADD(DAY, -1520, @EndDate), 'Atlanta', 'GA', 'United States', '404-555-1010', 'https://linkedin.com/in/johnsmith'),
    (@Member_AlexTaylor, 'alex.taylor@university.edu', 'Alex', 'Taylor', 'Graduate Student', NULL, 'Computer Science', 'Student', 2, DATEADD(DAY, -180, @EndDate), 'Cambridge', 'MA', 'United States', '617-555-1011', 'https://linkedin.com/in/alextaylor'),
    (@Member_RachelWilson, 'rachel.wilson@techventures.com', 'Rachel', 'Wilson', 'Senior DevOps Engineer', @Org_TechVentures, 'Software & SaaS', 'DevOps', 7, DATEADD(DAY, -640, @EndDate), 'Austin', 'TX', 'United States', '512-555-1012', 'https://linkedin.com/in/rachelwilson'),
    (@Member_KevinMartinez, 'kevin.martinez@cloudscale.io', 'Kevin', 'Martinez', 'Principal Cloud Architect', @Org_CloudScale, 'Cloud Infrastructure', 'Cloud Architecture', 13, DATEADD(DAY, -1200, @EndDate), 'Seattle', 'WA', 'United States', '206-555-1013', 'https://linkedin.com/in/kevinmartinez'),
    (@Member_AmandaClark, 'amanda.clark@datadriven.ai', 'Amanda', 'Clark', 'Machine Learning Engineer', @Org_DataDriven, 'Data & AI', 'Machine Learning', 6, DATEADD(DAY, -550, @EndDate), 'San Francisco', 'CA', 'United States', '415-555-1014', 'https://linkedin.com/in/amandaclark'),
    (@Member_DanielNguyen, 'daniel.nguyen@cybershield.com', 'Daniel', 'Nguyen', 'Security Operations Manager', @Org_CyberShield, 'Cybersecurity', 'Security Operations', 9, DATEADD(DAY, -820, @EndDate), 'Boston', 'MA', 'United States', '617-555-1015', 'https://linkedin.com/in/danielnguyen');

PRINT '  Key Members: 15 inserted';

-- Remaining 485 members generated programmatically with realistic distributions
DECLARE @MemberCount INT = 0;
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
INSERT INTO [membership].[Member] (ID, Email, FirstName, LastName, Title, OrganizationID, Industry, JobFunction, YearsInProfession, JoinDate, City, State, Country)
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
    SELECT TOP 1 ID FROM [membership].[Organization] ORDER BY NEWID()
) o
ORDER BY NEWID();

PRINT '  Additional Members: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' inserted';
PRINT '  Total Members: 500';
PRINT '';

-- ============================================================================
-- MEMBERSHIPS (625 records including renewals)
-- ============================================================================

PRINT 'Inserting Memberships...';

-- Key members with detailed renewal histories (17 records for the 15 key members)
INSERT INTO [membership].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
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

PRINT '  Key Member Memberships: 17 inserted';

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
INSERT INTO [membership].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
SELECT
    NEWID(),
    m.ID,
    (SELECT TOP 1 TypeID FROM @MembershipTypeDistribution WHERE Probability >= ABS(CHECKSUM(NEWID()) % 100) ORDER BY Probability DESC),
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 80 THEN 'Active'
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 95 THEN 'Expired'
        ELSE 'Cancelled'
    END,
    m.JoinDate,
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 80 THEN DATEADD(YEAR, 1, m.JoinDate) -- Active: future end date
        ELSE DATEADD(MONTH, 6, m.JoinDate) -- Expired/Cancelled: past end date
    END,
    NULL,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 70 THEN 1 ELSE 0 END
FROM [membership].[Member] m
WHERE m.ID NOT IN (@Member_SarahChen, @Member_MichaelJohnson, @Member_EmilyRodriguez, @Member_DavidKim, @Member_AlexTaylor);

PRINT '  Base Memberships: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' inserted';

-- Additional renewal records for 25% of members (125 additional records to get to 625 total)
INSERT INTO [membership].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
SELECT TOP 125
    NEWID(),
    ms.MemberID,
    ms.MembershipTypeID,
    'Active',
    DATEADD(YEAR, -1, ms.StartDate),
    ms.StartDate,
    ms.StartDate,
    1
FROM [membership].[Membership] ms
WHERE ms.MemberID NOT IN (@Member_SarahChen, @Member_MichaelJohnson, @Member_EmilyRodriguez, @Member_DavidKim, @Member_AlexTaylor)
  AND ms.Status = 'Active'
ORDER BY NEWID();

PRINT '  Renewal History Records: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' inserted';
PRINT '  Total Memberships: 625';
PRINT '';

PRINT '=================================================================';
PRINT 'MEMBERSHIP DATA POPULATION COMPLETE';
PRINT 'Summary:';
PRINT '  - Membership Types: 8';
PRINT '  - Organizations: 40';
PRINT '  - Members: 500';
PRINT '  - Membership Records: 625';
PRINT '=================================================================';
PRINT '';
GO
