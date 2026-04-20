-- MockSalesforce Database
-- Creates a mock Salesforce-like database with realistic data for Integration Engine testing
-- Tables: sf_User (20), sf_Account (100), sf_Contact (300), sf_Opportunity (150)

USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = 'MockSalesforce')
BEGIN
    ALTER DATABASE MockSalesforce SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE MockSalesforce;
END
GO

CREATE DATABASE MockSalesforce;
GO

USE MockSalesforce;
GO

----------------------------------------------------------------------
-- TABLES
----------------------------------------------------------------------

CREATE TABLE dbo.sf_User (
    Id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName       NVARCHAR(100)    NOT NULL,
    LastName        NVARCHAR(100)    NOT NULL,
    Email           NVARCHAR(255)    NOT NULL,
    Username        NVARCHAR(255)    NOT NULL,
    IsActive        BIT              NOT NULL DEFAULT 1,
    Title           NVARCHAR(100)    NULL,
    Department      NVARCHAR(100)    NULL,
    CreatedDate     DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_sf_User PRIMARY KEY (Id)
);

CREATE TABLE dbo.sf_Account (
    Id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                NVARCHAR(255)    NOT NULL,
    Industry            NVARCHAR(100)    NULL,
    Type                NVARCHAR(50)     NULL,
    BillingCity         NVARCHAR(100)    NULL,
    BillingState        NVARCHAR(50)     NULL,
    NumberOfEmployees   INT              NULL,
    AnnualRevenue       DECIMAL(18,2)    NULL,
    Phone               NVARCHAR(50)     NULL,
    CreatedDate         DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    LastModifiedDate    DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    IsDeleted           BIT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_sf_Account PRIMARY KEY (Id)
);

CREATE TABLE dbo.sf_Contact (
    Id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName           NVARCHAR(100)    NOT NULL,
    LastName            NVARCHAR(100)    NOT NULL,
    Email               NVARCHAR(255)    NOT NULL,
    Phone               NVARCHAR(50)     NULL,
    AccountId           UNIQUEIDENTIFIER NOT NULL,
    Title               NVARCHAR(100)    NULL,
    Department          NVARCHAR(100)    NULL,
    MailingCity         NVARCHAR(100)    NULL,
    MailingState        NVARCHAR(50)     NULL,
    MailingCountry      NVARCHAR(50)     NULL,
    CreatedDate         DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    LastModifiedDate    DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    IsDeleted           BIT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_sf_Contact PRIMARY KEY (Id),
    CONSTRAINT FK_sf_Contact_Account FOREIGN KEY (AccountId) REFERENCES dbo.sf_Account(Id),
    CONSTRAINT UQ_sf_Contact_Email UNIQUE (Email)
);

CREATE TABLE dbo.sf_Opportunity (
    Id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                NVARCHAR(255)    NOT NULL,
    Amount              DECIMAL(18,2)    NULL,
    StageName           NVARCHAR(50)     NULL,
    CloseDate           DATE             NULL,
    AccountId           UNIQUEIDENTIFIER NOT NULL,
    OwnerId             UNIQUEIDENTIFIER NOT NULL,
    Probability         INT              NULL,
    Type                NVARCHAR(50)     NULL,
    ForecastCategory    NVARCHAR(50)     NULL,
    CreatedDate         DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    LastModifiedDate    DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    IsDeleted           BIT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_sf_Opportunity PRIMARY KEY (Id),
    CONSTRAINT FK_sf_Opportunity_Account FOREIGN KEY (AccountId) REFERENCES dbo.sf_Account(Id),
    CONSTRAINT FK_sf_Opportunity_User FOREIGN KEY (OwnerId) REFERENCES dbo.sf_User(Id)
);
GO

----------------------------------------------------------------------
-- SEED DATA
----------------------------------------------------------------------

----------------------------------------------------------------------
-- sf_User (20 rows)
----------------------------------------------------------------------
INSERT INTO dbo.sf_User (FirstName, LastName, Email, Username, IsActive, Title, Department, CreatedDate) VALUES
('Andrew',    'Mitchell',  'andrew.mitchell@globalsales.com',    'amitchell@globalsales.com',   1, 'VP of Sales',              'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Brittany',  'Cooper',    'brittany.cooper@globalsales.com',    'bcooper@globalsales.com',     1, 'Account Executive',        'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Charles',   'Rivera',    'charles.rivera@globalsales.com',     'crivera@globalsales.com',     1, 'Sales Manager',            'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Danielle',  'Foster',    'danielle.foster@globalsales.com',    'dfoster@globalsales.com',     1, 'SDR Lead',                 'Sales Dev',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Edward',    'Simmons',   'edward.simmons@globalsales.com',     'esimmons@globalsales.com',    1, 'Enterprise AE',            'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Faith',     'Bennett',   'faith.bennett@globalsales.com',      'fbennett@globalsales.com',    1, 'Customer Success Manager', 'CS',           DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('George',    'Patterson', 'george.patterson@globalsales.com',   'gpatterson@globalsales.com',  1, 'Director of Operations',   'Operations',   DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Heather',   'Ross',      'heather.ross@globalsales.com',       'hross@globalsales.com',       1, 'Marketing Manager',        'Marketing',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Ian',       'Price',     'ian.price@globalsales.com',          'iprice@globalsales.com',      1, 'Solutions Engineer',       'Pre-Sales',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Jennifer',  'Murphy',    'jennifer.murphy@globalsales.com',    'jmurphy@globalsales.com',     1, 'Account Executive',        'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Kenneth',   'Long',      'kenneth.long@globalsales.com',       'klong@globalsales.com',       1, 'Regional Manager',         'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Lauren',    'Barnes',    'lauren.barnes@globalsales.com',      'lbarnes@globalsales.com',     1, 'SDR',                      'Sales Dev',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Michael',   'Griffin',   'michael.griffin@globalsales.com',     'mgriffin@globalsales.com',    1, 'Account Executive',        'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Nancy',     'Diaz',      'nancy.diaz@globalsales.com',         'ndiaz@globalsales.com',       1, 'Sales Ops Analyst',        'Sales Ops',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Oliver',    'Hayes',     'oliver.hayes@globalsales.com',       'ohayes@globalsales.com',      1, 'Channel Manager',          'Partnerships', DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Pamela',    'Bryant',    'pamela.bryant@globalsales.com',      'pbryant@globalsales.com',     0, 'Former AE',               'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Richard',   'Alexander', 'richard.alexander@globalsales.com',  'ralexander@globalsales.com',  1, 'VP of Marketing',          'Marketing',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Samantha',  'Russell',   'samantha.russell@globalsales.com',   'srussell@globalsales.com',    1, 'BDR Manager',              'Sales Dev',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Thomas',    'Wood',      'thomas.wood@globalsales.com',        'twood@globalsales.com',       1, 'Account Executive',        'Sales',        DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01')),
('Victoria',  'Sanders',   'victoria.sanders@globalsales.com',   'vsanders@globalsales.com',    0, 'Former SDR',              'Sales Dev',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'));
GO

----------------------------------------------------------------------
-- sf_Account (100 rows)
----------------------------------------------------------------------
;WITH AccountData AS (
    SELECT * FROM (VALUES
        ('TechForward Inc','Technology','Customer - Direct','San Francisco','CA',500,25000000.00,'(415) 555-0101'),
        ('Pinnacle Health Systems','Healthcare','Customer - Direct','Boston','MA',2000,120000000.00,'(617) 555-0102'),
        ('Midwest Manufacturing Co','Manufacturing','Customer - Channel','Detroit','MI',1500,85000000.00,'(313) 555-0103'),
        ('Pacific Rim Trading','Retail','Prospect','Los Angeles','CA',300,18000000.00,'(310) 555-0104'),
        ('Summit Financial Advisors','Financial Services','Customer - Direct','New York','NY',800,60000000.00,'(212) 555-0105'),
        ('Green Valley Agriculture','Agriculture','Customer - Channel','Des Moines','IA',200,12000000.00,'(515) 555-0106'),
        ('Coastal Engineering Group','Engineering','Prospect','Houston','TX',400,30000000.00,'(713) 555-0107'),
        ('Northwind Traders','Retail','Customer - Direct','Seattle','WA',150,9000000.00,'(206) 555-0108'),
        ('Contoso Pharmaceuticals','Pharmaceuticals','Customer - Direct','Philadelphia','PA',3000,200000000.00,'(215) 555-0109'),
        ('Adventure Works Industries','Manufacturing','Customer - Channel','Pittsburgh','PA',1200,75000000.00,'(412) 555-0110'),
        ('Lucerne Publishing','Media','Prospect','New York','NY',100,6000000.00,'(212) 555-0111'),
        ('Fabrikam Corporation','Technology','Customer - Direct','Redmond','WA',2500,150000000.00,'(425) 555-0112'),
        ('Woodgrove Bank','Banking','Customer - Direct','Charlotte','NC',5000,500000000.00,'(704) 555-0113'),
        ('Tailspin Toys','Consumer Goods','Prospect','Chicago','IL',80,4000000.00,'(312) 555-0114'),
        ('Proseware Technologies','Technology','Customer - Direct','San Jose','CA',600,40000000.00,'(408) 555-0115'),
        ('A. Datum Corporation','Technology','Customer - Channel','Raleigh','NC',350,22000000.00,'(919) 555-0116'),
        ('Trey Research','Research','Prospect','Cambridge','MA',250,15000000.00,'(617) 555-0117'),
        ('Humongous Insurance','Insurance','Customer - Direct','Columbus','OH',4000,300000000.00,'(614) 555-0118'),
        ('Litware Inc','Technology','Customer - Direct','Portland','OR',180,11000000.00,'(503) 555-0119'),
        ('Margie Travel','Travel','Prospect','Miami','FL',60,3500000.00,'(305) 555-0120'),
        ('Consolidated Messenger','Logistics','Customer - Channel','Memphis','TN',900,65000000.00,'(901) 555-0121'),
        ('Graphic Design Institute','Education','Prospect','Denver','CO',120,8000000.00,'(720) 555-0122'),
        ('Wide World Importers','Retail','Customer - Direct','San Antonio','TX',250,16000000.00,'(210) 555-0123'),
        ('Adatum Corp','Technology','Customer - Direct','Austin','TX',400,28000000.00,'(512) 555-0124'),
        ('Alpine Ski House','Hospitality','Prospect','Aspen','CO',75,5000000.00,'(970) 555-0125'),
        ('Blue Yonder Airlines','Transportation','Customer - Direct','Dallas','TX',8000,600000000.00,'(214) 555-0126'),
        ('City Power & Light','Utilities','Customer - Channel','Phoenix','AZ',1500,100000000.00,'(602) 555-0127'),
        ('Coho Winery','Food & Beverage','Prospect','Napa','CA',50,2500000.00,'(707) 555-0128'),
        ('Datum Corp','Technology','Customer - Direct','San Diego','CA',300,20000000.00,'(619) 555-0129'),
        ('Fourth Coffee','Food & Beverage','Prospect','Seattle','WA',200,12000000.00,'(206) 555-0130'),
        ('Relecloud Solutions','Technology','Customer - Direct','Atlanta','GA',450,32000000.00,'(404) 555-0131'),
        ('VanArsdel Ltd','Consumer Goods','Customer - Channel','Minneapolis','MN',350,25000000.00,'(612) 555-0132'),
        ('Wingtip Toys','Consumer Goods','Prospect','Orlando','FL',100,7000000.00,'(407) 555-0133'),
        ('Baldwins Fine Foods','Food & Beverage','Customer - Direct','Louisville','KY',150,10000000.00,'(502) 555-0134'),
        ('Cronus Corp','Technology','Customer - Direct','Nashville','TN',500,35000000.00,'(615) 555-0135'),
        ('Delphi Consulting','Consulting','Prospect','Washington','DC',80,6000000.00,'(202) 555-0136'),
        ('Eagle Security','Security','Customer - Channel','McLean','VA',600,45000000.00,'(703) 555-0137'),
        ('Falcon Electronics','Electronics','Customer - Direct','San Jose','CA',750,50000000.00,'(408) 555-0138'),
        ('Galaxy Space Systems','Aerospace','Prospect','Huntsville','AL',1000,80000000.00,'(256) 555-0139'),
        ('Heron Investments','Financial Services','Customer - Direct','Jersey City','NJ',200,30000000.00,'(201) 555-0140'),
        ('Infinity Healthcare','Healthcare','Customer - Direct','Cleveland','OH',1800,130000000.00,'(216) 555-0141'),
        ('Jupiter Mining Corp','Mining','Prospect','Billings','MT',500,40000000.00,'(406) 555-0142'),
        ('Kepler Analytics','Technology','Customer - Direct','Boulder','CO',120,8000000.00,'(303) 555-0143'),
        ('Lakeshore Properties','Real Estate','Prospect','Milwaukee','WI',40,3000000.00,'(414) 555-0144'),
        ('Marathon Petroleum','Energy','Customer - Direct','Tulsa','OK',2000,150000000.00,'(918) 555-0145'),
        ('Neptune Marine','Marine','Customer - Channel','Norfolk','VA',300,22000000.00,'(757) 555-0146'),
        ('Olympus Medical','Healthcare','Customer - Direct','Tampa','FL',900,70000000.00,'(813) 555-0147'),
        ('Phoenix Renewables','Energy','Prospect','Tucson','AZ',250,18000000.00,'(520) 555-0148'),
        ('Quasar Technologies','Technology','Customer - Direct','Reston','VA',350,24000000.00,'(571) 555-0149'),
        ('Ridgeline Construction','Construction','Customer - Channel','Las Vegas','NV',600,45000000.00,'(702) 555-0150'),
        ('Starlight Entertainment','Entertainment','Prospect','Los Angeles','CA',150,10000000.00,'(323) 555-0151'),
        ('Tradewind Logistics','Logistics','Customer - Direct','Savannah','GA',400,30000000.00,'(912) 555-0152'),
        ('Ultratech Solutions','Technology','Customer - Direct','Boise','ID',200,14000000.00,'(208) 555-0153'),
        ('Vortex Software','Technology','Prospect','Salt Lake City','UT',100,6000000.00,'(801) 555-0154'),
        ('Watershed Environmental','Environmental','Customer - Channel','Eugene','OR',80,5000000.00,'(541) 555-0155'),
        ('Zenith Microsystems','Technology','Customer - Direct','Santa Clara','CA',700,48000000.00,'(408) 555-0156'),
        ('Acacia Financial Group','Financial Services','Prospect','Hartford','CT',300,25000000.00,'(860) 555-0157'),
        ('Birchwood Software','Technology','Customer - Direct','Madison','WI',150,10000000.00,'(608) 555-0158'),
        ('Cedar Health Partners','Healthcare','Customer - Direct','Indianapolis','IN',1200,90000000.00,'(317) 555-0159'),
        ('Dogwood Legal Services','Legal','Prospect','Richmond','VA',60,4000000.00,'(804) 555-0160'),
        ('Elm Street Capital','Financial Services','Customer - Direct','Greenwich','CT',100,20000000.00,'(203) 555-0161'),
        ('Fern Valley Organics','Agriculture','Customer - Channel','Sacramento','CA',180,12000000.00,'(916) 555-0162'),
        ('Ginkgo Bioworks','Biotechnology','Prospect','Durham','NC',250,18000000.00,'(919) 555-0163'),
        ('Hawthorn Industries','Manufacturing','Customer - Direct','Akron','OH',800,55000000.00,'(330) 555-0164'),
        ('Ivy League Tutoring','Education','Prospect','New Haven','CT',30,1500000.00,'(203) 555-0165'),
        ('Jasmine Hotels','Hospitality','Customer - Direct','Scottsdale','AZ',400,28000000.00,'(480) 555-0166'),
        ('Karst Engineering','Engineering','Customer - Channel','Albuquerque','NM',200,14000000.00,'(505) 555-0167'),
        ('Laurel Defense Systems','Defense','Customer - Direct','Arlington','VA',1500,120000000.00,'(571) 555-0168'),
        ('Maple Data Analytics','Technology','Customer - Direct','Ann Arbor','MI',100,7000000.00,'(734) 555-0169'),
        ('Nutmeg Retail Corp','Retail','Prospect','Stamford','CT',500,35000000.00,'(203) 555-0170'),
        ('Orchid Cosmetics','Consumer Goods','Customer - Direct','Miami','FL',300,20000000.00,'(786) 555-0171'),
        ('Pine Ridge Mining','Mining','Customer - Channel','Denver','CO',400,32000000.00,'(303) 555-0172'),
        ('Quince Telecom','Telecommunications','Customer - Direct','Kansas City','MO',600,42000000.00,'(816) 555-0173'),
        ('Rosemary Foods','Food & Beverage','Prospect','Nashville','TN',250,15000000.00,'(615) 555-0174'),
        ('Sage Advisory Services','Consulting','Customer - Direct','Chicago','IL',150,12000000.00,'(312) 555-0175'),
        ('Teak Construction','Construction','Customer - Channel','Fort Worth','TX',700,50000000.00,'(817) 555-0176'),
        ('Umber Design Studio','Design','Prospect','Brooklyn','NY',40,2500000.00,'(718) 555-0177'),
        ('Violet Biomedical','Biotechnology','Customer - Direct','San Francisco','CA',350,26000000.00,'(415) 555-0178'),
        ('Willow Creek Software','Technology','Prospect','Beaverton','OR',120,8000000.00,'(503) 555-0179'),
        ('Xylem Water Tech','Utilities','Customer - Direct','Cincinnati','OH',500,38000000.00,'(513) 555-0180'),
        ('Yarrow Health Clinics','Healthcare','Customer - Channel','Omaha','NE',200,14000000.00,'(402) 555-0181'),
        ('Zinnia Media Group','Media','Prospect','Austin','TX',80,5000000.00,'(512) 555-0182'),
        ('Alder Energy Corp','Energy','Customer - Direct','Oklahoma City','OK',350,28000000.00,'(405) 555-0183'),
        ('Bamboo Networks','Technology','Customer - Direct','San Jose','CA',200,15000000.00,'(408) 555-0184'),
        ('Clover Insurance','Insurance','Customer - Channel','Des Moines','IA',1000,75000000.00,'(515) 555-0185'),
        ('Daisy Chain Logistics','Logistics','Prospect','Louisville','KY',300,22000000.00,'(502) 555-0186'),
        ('Eucalyptus Pharma','Pharmaceuticals','Customer - Direct','Princeton','NJ',800,60000000.00,'(609) 555-0187'),
        ('Foxglove Technologies','Technology','Prospect','Raleigh','NC',150,9000000.00,'(984) 555-0188'),
        ('Gardenia Properties','Real Estate','Customer - Direct','Charlotte','NC',70,5000000.00,'(980) 555-0189'),
        ('Holly Systems','Technology','Customer - Channel','Dallas','TX',250,18000000.00,'(469) 555-0190'),
        ('Ironwood Consulting','Consulting','Prospect','Washington','DC',100,8000000.00,'(202) 555-0191'),
        ('Juniper Health','Healthcare','Customer - Direct','Portland','OR',600,42000000.00,'(971) 555-0192'),
        ('Kumquat Foods','Food & Beverage','Customer - Direct','Kansas City','MO',180,10000000.00,'(816) 555-0193'),
        ('Lavender Spa Group','Hospitality','Prospect','Sedona','AZ',50,3000000.00,'(928) 555-0194'),
        ('Mahogany Ventures','Venture Capital','Customer - Direct','Palo Alto','CA',25,400000000.00,'(650) 555-0195'),
        ('Nettle Cybersecurity','Technology','Customer - Direct','Bethesda','MD',300,24000000.00,'(301) 555-0196'),
        ('Olive Tech Solutions','Technology','Prospect','San Antonio','TX',100,6000000.00,'(210) 555-0197'),
        ('Poplar Aerospace','Aerospace','Customer - Direct','Pasadena','CA',900,70000000.00,'(626) 555-0198'),
        ('Redwood National Labs','Research','Customer - Channel','Berkeley','CA',200,15000000.00,'(510) 555-0199'),
        ('Sycamore Services','Professional Services','Customer - Direct','Atlanta','GA',350,25000000.00,'(470) 555-0200')
    ) AS v(Name, Industry, Type, BillingCity, BillingState, NumberOfEmployees, AnnualRevenue, Phone)
)
INSERT INTO dbo.sf_Account (Name, Industry, Type, BillingCity, BillingState, NumberOfEmployees, AnnualRevenue, Phone, CreatedDate, LastModifiedDate)
SELECT Name, Industry, Type, BillingCity, BillingState, NumberOfEmployees, AnnualRevenue, Phone,
       DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
       DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2025-01-01')
FROM AccountData;
GO

----------------------------------------------------------------------
-- sf_Contact (300 rows)
----------------------------------------------------------------------
;WITH FirstNames AS (
    SELECT * FROM (VALUES
        ('Aaron'),('Beth'),('Craig'),('Donna'),('Eric'),
        ('Felicia'),('Gerald'),('Holly'),('Isaac'),('Jane'),
        ('Keith'),('Linda'),('Martin'),('Nora'),('Owen'),
        ('Paula'),('Quinn'),('Rita'),('Scott'),('Teresa'),
        ('Umar'),('Vera'),('Wayne'),('Xiao'),('Yvette'),
        ('Zane'),('Alicia'),('Blake'),('Cynthia'),('Drew')
    ) AS v(fn)
),
LastNames AS (
    SELECT * FROM (VALUES
        ('Armstrong'),('Brooks'),('Chambers'),('Dawson'),('Ellis'),
        ('Flores'),('Gibson'),('Hamilton'),('Irving'),('Jordan')
    ) AS v(ln)
),
NumberedContacts AS (
    SELECT fn, ln, ROW_NUMBER() OVER (ORDER BY NEWID()) AS rn
    FROM FirstNames CROSS JOIN LastNames
),
Titles AS (
    SELECT * FROM (VALUES
        ('CEO'),('CFO'),('CTO'),('VP Engineering'),('Director of Sales'),
        ('Marketing Manager'),('Product Manager'),('Software Engineer'),('Data Analyst'),('Operations Manager'),
        ('HR Director'),('Legal Counsel'),('IT Manager'),('Account Manager'),('Business Analyst')
    ) AS v(title)
),
Departments AS (
    SELECT * FROM (VALUES
        ('Engineering'),('Sales'),('Marketing'),('Finance'),('Operations'),
        ('Human Resources'),('Legal'),('IT'),('Product'),('Executive')
    ) AS v(dept)
),
Cities AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS cid FROM (VALUES
        ('New York','NY','US'),('Los Angeles','CA','US'),('Chicago','IL','US'),
        ('Houston','TX','US'),('Phoenix','AZ','US'),('Philadelphia','PA','US'),
        ('San Antonio','TX','US'),('San Diego','CA','US'),('Dallas','TX','US'),
        ('San Jose','CA','US'),('Austin','TX','US'),('Jacksonville','FL','US'),
        ('Columbus','OH','US'),('Charlotte','NC','US'),('Indianapolis','IN','US'),
        ('Seattle','WA','US'),('Denver','CO','US'),('Boston','MA','US'),
        ('Nashville','TN','US'),('Portland','OR','US')
    ) AS v(city, state, country)
),
AccountIDs AS (
    SELECT Id, ROW_NUMBER() OVER (ORDER BY Id) AS rn FROM dbo.sf_Account
)
INSERT INTO dbo.sf_Contact (FirstName, LastName, Email, Phone, AccountId, Title, Department,
    MailingCity, MailingState, MailingCountry, CreatedDate, LastModifiedDate)
SELECT TOP 300
    nc.fn,
    nc.ln,
    LOWER(nc.fn) + '.' + LOWER(nc.ln) + CAST(nc.rn AS NVARCHAR(10)) + '@sfcontact.com',
    '(' + RIGHT('000' + CAST(200 + (ABS(CHECKSUM(NEWID())) % 800) AS VARCHAR), 3) + ') '
        + RIGHT('000' + CAST(200 + (ABS(CHECKSUM(NEWID())) % 800) AS VARCHAR), 3) + '-'
        + RIGHT('0000' + CAST(1000 + (ABS(CHECKSUM(NEWID())) % 9000) AS VARCHAR), 4),
    acct.Id,
    (SELECT TOP 1 title FROM Titles ORDER BY NEWID()),
    (SELECT TOP 1 dept FROM Departments ORDER BY NEWID()),
    ci.city, ci.state, ci.country,
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2025-01-01')
FROM NumberedContacts nc
INNER JOIN AccountIDs acct ON acct.rn = ((nc.rn - 1) % 100) + 1
CROSS APPLY (SELECT TOP 1 city, state, country FROM Cities ORDER BY NEWID()) ci
WHERE nc.rn <= 300;
GO

----------------------------------------------------------------------
-- sf_Opportunity (150 rows)
----------------------------------------------------------------------
;WITH StageData AS (
    SELECT * FROM (VALUES
        ('Prospecting', 10, 'Pipeline'),
        ('Qualification', 20, 'Pipeline'),
        ('Needs Analysis', 40, 'Pipeline'),
        ('Value Proposition', 50, 'Pipeline'),
        ('Id. Decision Makers', 60, 'Pipeline'),
        ('Perception Analysis', 70, 'Best Case'),
        ('Proposal/Price Quote', 75, 'Best Case'),
        ('Negotiation/Review', 90, 'Commit'),
        ('Closed Won', 100, 'Closed'),
        ('Closed Lost', 0, 'Omitted')
    ) AS v(StageName, Probability, ForecastCategory)
),
OppTypes AS (
    SELECT * FROM (VALUES ('Existing Customer - Upgrade'),('Existing Customer - Replacement'),('New Customer'),('Existing Customer - Downgrade')) AS v(OppType)
),
AccountIDs AS (
    SELECT Id, Name, ROW_NUMBER() OVER (ORDER BY Id) AS rn FROM dbo.sf_Account
),
UserIDs AS (
    SELECT Id, ROW_NUMBER() OVER (ORDER BY Id) AS rn FROM dbo.sf_User WHERE IsActive = 1
),
ActiveUserCount AS (
    SELECT COUNT(*) AS cnt FROM dbo.sf_User WHERE IsActive = 1
),
Numbers AS (
    SELECT TOP 150 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.objects a CROSS JOIN sys.objects b
)
INSERT INTO dbo.sf_Opportunity (Name, Amount, StageName, CloseDate, AccountId, OwnerId,
    Probability, Type, ForecastCategory, CreatedDate, LastModifiedDate)
SELECT
    acct.Name + ' - ' + CASE WHEN nums.n % 4 = 0 THEN 'Expansion' WHEN nums.n % 4 = 1 THEN 'Renewal' WHEN nums.n % 4 = 2 THEN 'New Business' ELSE 'Upgrade' END,
    CAST(500 + (ABS(CHECKSUM(NEWID())) % 249500) AS DECIMAL(18,2)),
    sd.StageName,
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    acct.Id,
    usr.Id,
    sd.Probability,
    (SELECT TOP 1 OppType FROM OppTypes ORDER BY NEWID()),
    sd.ForecastCategory,
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2025-01-01')
FROM Numbers nums
INNER JOIN AccountIDs acct ON acct.rn = ((nums.n - 1) % 100) + 1
INNER JOIN UserIDs usr ON usr.rn = ((nums.n - 1) % (SELECT cnt FROM ActiveUserCount)) + 1
CROSS APPLY (SELECT TOP 1 StageName, Probability, ForecastCategory FROM StageData ORDER BY NEWID()) sd;
GO

----------------------------------------------------------------------
-- STORED PROCEDURE: sp_MockDataSummary
----------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_MockDataSummary
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 'sf_User' AS TableName, COUNT(*) AS [RowCount] FROM dbo.sf_User
    UNION ALL
    SELECT 'sf_Account', COUNT(*) FROM dbo.sf_Account
    UNION ALL
    SELECT 'sf_Contact', COUNT(*) FROM dbo.sf_Contact
    UNION ALL
    SELECT 'sf_Opportunity', COUNT(*) FROM dbo.sf_Opportunity;
END;
GO

----------------------------------------------------------------------
-- FK ORPHAN CHECK QUERY
----------------------------------------------------------------------
-- This can be run manually to verify zero orphans
-- SELECT 'Orphan Contacts' AS CheckType, COUNT(*) AS OrphanCount
-- FROM dbo.sf_Contact c LEFT JOIN dbo.sf_Account a ON c.AccountId = a.Id WHERE a.Id IS NULL
-- UNION ALL
-- SELECT 'Orphan Opportunities (Account)', COUNT(*)
-- FROM dbo.sf_Opportunity o LEFT JOIN dbo.sf_Account a ON o.AccountId = a.Id WHERE a.Id IS NULL
-- UNION ALL
-- SELECT 'Orphan Opportunities (Owner)', COUNT(*)
-- FROM dbo.sf_Opportunity o LEFT JOIN dbo.sf_User u ON o.OwnerId = u.Id WHERE u.Id IS NULL;

PRINT 'MockSalesforce database created successfully.';
GO
