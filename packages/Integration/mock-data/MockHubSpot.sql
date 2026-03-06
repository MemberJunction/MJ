-- MockHubSpot Database
-- Creates a mock HubSpot-like database with realistic data for Integration Engine testing
-- Tables: hs_Owners (20), hs_Companies (100), hs_Contacts (300), hs_Deals (150)

USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = 'MockHubSpot')
BEGIN
    ALTER DATABASE MockHubSpot SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE MockHubSpot;
END
GO

CREATE DATABASE MockHubSpot;
GO

USE MockHubSpot;
GO

----------------------------------------------------------------------
-- TABLES
----------------------------------------------------------------------

CREATE TABLE dbo.hs_Owners (
    owner_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    email           NVARCHAR(255)    NOT NULL,
    firstname       NVARCHAR(100)    NOT NULL,
    lastname        NVARCHAR(100)    NOT NULL,
    userid          NVARCHAR(100)    NOT NULL,
    createdat       DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updatedat       DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    archived        BIT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_hs_Owners PRIMARY KEY (owner_id)
);

CREATE TABLE dbo.hs_Companies (
    hs_object_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    name                NVARCHAR(255)    NOT NULL,
    domain              NVARCHAR(255)    NULL,
    industry            NVARCHAR(100)    NULL,
    city                NVARCHAR(100)    NULL,
    state               NVARCHAR(50)     NULL,
    numberofemployees   INT              NULL,
    annualrevenue       DECIMAL(18,2)    NULL,
    lifecyclestage      NVARCHAR(50)     NULL,
    createdate          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    lastmodifieddate    DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    hs_is_deleted       BIT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_hs_Companies PRIMARY KEY (hs_object_id)
);

CREATE TABLE dbo.hs_Contacts (
    hs_object_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    firstname           NVARCHAR(100)    NOT NULL,
    lastname            NVARCHAR(100)    NOT NULL,
    email               NVARCHAR(255)    NOT NULL,
    phone               NVARCHAR(50)     NULL,
    company             NVARCHAR(255)    NULL,
    lifecyclestage      NVARCHAR(50)     NULL,
    hs_lead_status      NVARCHAR(50)     NULL,
    createdate          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    lastmodifieddate    DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    hs_email_optout     BIT              NOT NULL DEFAULT 0,
    city                NVARCHAR(100)    NULL,
    state               NVARCHAR(50)     NULL,
    zip                 NVARCHAR(20)     NULL,
    country             NVARCHAR(50)     NULL,
    hs_is_deleted       BIT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_hs_Contacts PRIMARY KEY (hs_object_id),
    CONSTRAINT UQ_hs_Contacts_email UNIQUE (email)
);

CREATE TABLE dbo.hs_Deals (
    hs_object_id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    dealname                NVARCHAR(255)    NOT NULL,
    amount                  DECIMAL(18,2)    NULL,
    dealstage               NVARCHAR(50)     NULL,
    closedate               DATE             NULL,
    pipeline                NVARCHAR(100)    NULL,
    hubspot_owner_id        UNIQUEIDENTIFIER NULL,
    associated_company_id   UNIQUEIDENTIFIER NULL,
    associated_contact_id   UNIQUEIDENTIFIER NULL,
    createdate              DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    lastmodifieddate        DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    hs_is_deleted           BIT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_hs_Deals PRIMARY KEY (hs_object_id),
    CONSTRAINT FK_hs_Deals_Owner FOREIGN KEY (hubspot_owner_id) REFERENCES dbo.hs_Owners(owner_id),
    CONSTRAINT FK_hs_Deals_Company FOREIGN KEY (associated_company_id) REFERENCES dbo.hs_Companies(hs_object_id),
    CONSTRAINT FK_hs_Deals_Contact FOREIGN KEY (associated_contact_id) REFERENCES dbo.hs_Contacts(hs_object_id)
);
GO

----------------------------------------------------------------------
-- SEED DATA
----------------------------------------------------------------------

-- Helper: random date between 2023-01-01 and 2025-12-31
-- We'll use DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01')

----------------------------------------------------------------------
-- hs_Owners (20 rows)
----------------------------------------------------------------------
INSERT INTO dbo.hs_Owners (email, firstname, lastname, userid, createdat, updatedat) VALUES
('james.wilson@acmecorp.com',      'James',     'Wilson',      'jwilson01',   DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('sarah.johnson@acmecorp.com',     'Sarah',     'Johnson',     'sjohnson02',  DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('michael.chen@acmecorp.com',      'Michael',   'Chen',        'mchen03',     DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('emily.rodriguez@acmecorp.com',   'Emily',     'Rodriguez',   'erodriguez04',DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('david.thompson@acmecorp.com',    'David',     'Thompson',    'dthompson05', DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('jessica.martinez@acmecorp.com',  'Jessica',   'Martinez',    'jmartinez06', DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('robert.garcia@acmecorp.com',     'Robert',    'Garcia',      'rgarcia07',   DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('amanda.lee@acmecorp.com',        'Amanda',    'Lee',         'alee08',      DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('christopher.brown@acmecorp.com', 'Christopher','Brown',      'cbrown09',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('stephanie.davis@acmecorp.com',   'Stephanie', 'Davis',       'sdavis10',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('daniel.miller@acmecorp.com',     'Daniel',    'Miller',      'dmiller11',   DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('nicole.taylor@acmecorp.com',     'Nicole',    'Taylor',      'ntaylor12',   DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('matthew.anderson@acmecorp.com',  'Matthew',   'Anderson',    'manderson13', DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('ashley.thomas@acmecorp.com',     'Ashley',    'Thomas',      'athomas14',   DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('kevin.jackson@acmecorp.com',     'Kevin',     'Jackson',     'kjackson15',  DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('rachel.white@acmecorp.com',      'Rachel',    'White',       'rwhite16',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('brian.harris@acmecorp.com',      'Brian',     'Harris',      'bharris17',   DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('megan.clark@acmecorp.com',       'Megan',     'Clark',       'mclark18',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('jason.lewis@acmecorp.com',       'Jason',     'Lewis',       'jlewis19',    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01')),
('laura.walker@acmecorp.com',      'Laura',     'Walker',      'lwalker20',   DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2023-01-01'), DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2024-06-01'));
GO

----------------------------------------------------------------------
-- hs_Companies (100 rows)
----------------------------------------------------------------------
-- Use a CTE with numbered rows to generate 100 companies
;WITH CompanyNames AS (
    SELECT * FROM (VALUES
        ('Apex Technology Solutions','apextech.com','Technology','Austin','TX',450,15000000.00,'customer'),
        ('BlueStar Financial','bluestarfin.com','Financial Services','New York','NY',1200,85000000.00,'customer'),
        ('Cascade Manufacturing','cascademfg.com','Manufacturing','Seattle','WA',800,42000000.00,'customer'),
        ('Delta Healthcare Group','deltahcg.com','Healthcare','Boston','MA',2500,120000000.00,'customer'),
        ('Emerald Energy Corp','emeraldenergy.com','Energy','Houston','TX',350,28000000.00,'lead'),
        ('Frontier Logistics','frontierlog.com','Transportation','Denver','CO',600,35000000.00,'lead'),
        ('Granite Construction Co','graniteco.com','Construction','Phoenix','AZ',1500,95000000.00,'customer'),
        ('Harbor Consulting LLC','harborconsult.com','Professional Services','San Francisco','CA',200,12000000.00,'opportunity'),
        ('Ironclad Security','ironcladsec.com','Security','Dallas','TX',300,18000000.00,'lead'),
        ('Juniper Networks Inc','junipernetworks.com','Technology','San Jose','CA',3000,200000000.00,'customer'),
        ('Keystone Real Estate','keystonere.com','Real Estate','Chicago','IL',150,22000000.00,'lead'),
        ('Lakewood Media Group','lakewoodmedia.com','Media','Los Angeles','CA',400,30000000.00,'customer'),
        ('Meridian Pharmaceuticals','meridianpharma.com','Pharmaceuticals','Philadelphia','PA',1800,150000000.00,'customer'),
        ('Northstar Education','northstaredu.com','Education','Minneapolis','MN',500,25000000.00,'opportunity'),
        ('Oceanic Shipping Lines','oceanicship.com','Transportation','Miami','FL',700,55000000.00,'customer'),
        ('Pinnacle Software','pinnaclesw.com','Technology','Portland','OR',350,20000000.00,'lead'),
        ('Quantum Analytics','quantumanalytics.com','Technology','San Diego','CA',250,16000000.00,'opportunity'),
        ('Redwood Capital Partners','redwoodcapital.com','Financial Services','Charlotte','NC',180,40000000.00,'customer'),
        ('Summit Healthcare','summithc.com','Healthcare','Nashville','TN',900,65000000.00,'customer'),
        ('Titan Industrial','titanind.com','Manufacturing','Detroit','MI',1100,78000000.00,'lead'),
        ('United Bio Sciences','unitedbio.com','Biotechnology','San Diego','CA',600,45000000.00,'customer'),
        ('Vista Marketing Agency','vistamarketing.com','Marketing','Atlanta','GA',120,8000000.00,'lead'),
        ('Westfield Insurance','westfieldins.com','Insurance','Columbus','OH',2000,110000000.00,'customer'),
        ('Xenon Technologies','xenontech.com','Technology','Raleigh','NC',280,14000000.00,'opportunity'),
        ('Yellowstone Renewables','yellowstonerenew.com','Energy','Salt Lake City','UT',400,32000000.00,'lead'),
        ('Zenith Aerospace','zenithaero.com','Aerospace','Huntsville','AL',1500,180000000.00,'customer'),
        ('Alpine Retail Group','alpineretail.com','Retail','Denver','CO',3500,250000000.00,'customer'),
        ('Beacon Legal Services','beaconlegal.com','Legal','Washington','DC',100,15000000.00,'lead'),
        ('Crimson Data Systems','crimsondata.com','Technology','Austin','TX',200,11000000.00,'opportunity'),
        ('Dominion Power Solutions','dominionpower.com','Energy','Richmond','VA',800,60000000.00,'customer'),
        ('Eclipse Software Labs','eclipselabs.com','Technology','Seattle','WA',150,9000000.00,'lead'),
        ('Falcon Aerospace','falconaero.com','Aerospace','Wichita','KS',2200,160000000.00,'customer'),
        ('Gateway Commerce','gatewaycom.com','Retail','St. Louis','MO',900,70000000.00,'customer'),
        ('Horizon Telecom','horizontele.com','Telecommunications','Kansas City','MO',1300,95000000.00,'customer'),
        ('Ivory Tower Education','ivorytower.com','Education','Cambridge','MA',300,20000000.00,'lead'),
        ('Jupiter Financial','jupiterfin.com','Financial Services','Jersey City','NJ',500,55000000.00,'opportunity'),
        ('Kestrel Mining Corp','kestrelmining.com','Mining','Billings','MT',600,48000000.00,'lead'),
        ('Liberty Mutual Services','libertymutualsvcs.com','Insurance','Boston','MA',4000,300000000.00,'customer'),
        ('Magnolia Properties','magnoliaprop.com','Real Estate','Memphis','TN',80,6000000.00,'lead'),
        ('Noble Gas Industries','noblegas.com','Chemical','Baton Rouge','LA',450,38000000.00,'customer'),
        ('Orion Cloud Services','orioncloud.com','Technology','San Francisco','CA',320,22000000.00,'customer'),
        ('Pacific Coast Foods','paccoastfoods.com','Food & Beverage','Sacramento','CA',700,50000000.00,'customer'),
        ('Quartz Engineering','quartzeng.com','Engineering','Houston','TX',550,42000000.00,'lead'),
        ('Riviera Hospitality','rivierahosp.com','Hospitality','Orlando','FL',1200,85000000.00,'customer'),
        ('Silverline Technologies','silverlinetech.com','Technology','Boise','ID',180,10000000.00,'opportunity'),
        ('Trident Defense','tridentdef.com','Defense','Arlington','VA',2800,220000000.00,'customer'),
        ('Urbanscape Architecture','urbanarch.com','Architecture','Portland','OR',90,7000000.00,'lead'),
        ('Vertex Biomedical','vertexbiomed.com','Biotechnology','Cambridge','MA',400,35000000.00,'customer'),
        ('Windmill Energy','windmillenergy.com','Energy','Oklahoma City','OK',250,19000000.00,'lead'),
        ('Axiom Data Corp','axiomdata.com','Technology','Reston','VA',600,46000000.00,'customer'),
        ('Brightpath Solutions','brightpath.com','Consulting','Atlanta','GA',150,12000000.00,'opportunity'),
        ('Cypress Health Systems','cypresshealthsys.com','Healthcare','Tampa','FL',1000,72000000.00,'customer'),
        ('Driftwood Ventures','driftwoodventures.com','Venture Capital','Palo Alto','CA',30,500000000.00,'customer'),
        ('Ember Creative Agency','embercreative.com','Marketing','Brooklyn','NY',60,4000000.00,'lead'),
        ('Forge Metal Works','forgemetalworks.com','Manufacturing','Pittsburgh','PA',800,58000000.00,'customer'),
        ('Glacier National Labs','glacierlabs.com','Research','Boulder','CO',200,15000000.00,'lead'),
        ('Helix Genetics','helixgenetics.com','Biotechnology','Durham','NC',350,28000000.00,'opportunity'),
        ('Indigo Software','indigosw.com','Technology','Nashville','TN',230,17000000.00,'lead'),
        ('Jade Cosmetics','jadecosmetics.com','Consumer Goods','New York','NY',500,40000000.00,'customer'),
        ('Krypton Cybersecurity','kryptoncyber.com','Technology','McLean','VA',180,14000000.00,'customer'),
        ('Lakeshore Partners','lakeshorepartners.com','Financial Services','Milwaukee','WI',120,20000000.00,'lead'),
        ('Metro Transit Authority','metrotransit.com','Government','Washington','DC',5000,100000000.00,'customer'),
        ('Nighthawk Aviation','nighthawkair.com','Aviation','Dallas','TX',400,32000000.00,'lead'),
        ('Oakwood Properties','oakwoodprop.com','Real Estate','Charlotte','NC',60,8000000.00,'opportunity'),
        ('Prism Optics','prismoptics.com','Manufacturing','Rochester','NY',300,24000000.00,'customer'),
        ('Quest Diagnostics Labs','questdiaglab.com','Healthcare','Secaucus','NJ',1500,110000000.00,'customer'),
        ('Rosewood Hotels','rosewoodhotels.com','Hospitality','Dallas','TX',2000,150000000.00,'customer'),
        ('Sapphire Analytics','sapphireanalytics.com','Technology','Chicago','IL',140,10000000.00,'lead'),
        ('Thunderbolt Logistics','thunderboltlog.com','Transportation','Memphis','TN',900,68000000.00,'customer'),
        ('Ultraviolet Labs','uvlabs.com','Research','Pasadena','CA',100,8000000.00,'opportunity'),
        ('Vanguard Investments','vanguardinvest.com','Financial Services','Malvern','PA',8000,600000000.00,'customer'),
        ('Willow Creek Farms','willowcreekfarms.com','Agriculture','Des Moines','IA',200,18000000.00,'lead'),
        ('Xcel Performance','xcelperformance.com','Sports','Scottsdale','AZ',80,5000000.00,'lead'),
        ('York Manufacturing','yorkmfg.com','Manufacturing','York','PA',650,50000000.00,'customer'),
        ('Zephyr Renewable Energy','zephyrrenew.com','Energy','Denver','CO',300,25000000.00,'opportunity'),
        ('Aether Space Systems','aetherspace.com','Aerospace','Cape Canaveral','FL',500,80000000.00,'customer'),
        ('Birchwood Financial','birchwoodfin.com','Financial Services','Hartford','CT',250,30000000.00,'lead'),
        ('Cobalt Mining Corp','cobaltmining.com','Mining','Tucson','AZ',400,35000000.00,'customer'),
        ('Dynamo Electric','dynamoelectric.com','Energy','Tulsa','OK',600,48000000.00,'lead'),
        ('Evergreen Solutions','evergreensol.com','Environmental','Eugene','OR',100,7000000.00,'opportunity'),
        ('Firebird Technologies','firebirdtech.com','Technology','Austin','TX',280,20000000.00,'customer'),
        ('Golden State Solar','goldenstatesolar.com','Energy','Fresno','CA',350,26000000.00,'lead'),
        ('Highland Spirits','highlandspirits.com','Food & Beverage','Louisville','KY',200,15000000.00,'customer'),
        ('Ironwood Construction','ironwoodconst.com','Construction','Las Vegas','NV',500,38000000.00,'customer'),
        ('Jasper AI Systems','jasperai.com','Technology','San Francisco','CA',60,3000000.00,'lead'),
        ('Kodiak Industries','kodiakindustries.com','Manufacturing','Anchorage','AK',300,22000000.00,'lead'),
        ('Lighthouse Marine','lighthousemarine.com','Marine','Norfolk','VA',150,12000000.00,'opportunity'),
        ('Monarch Healthcare','monarchhc.com','Healthcare','Cleveland','OH',1800,130000000.00,'customer'),
        ('Nexus Financial Group','nexusfg.com','Financial Services','San Antonio','TX',400,35000000.00,'customer'),
        ('Osprey Defense Systems','ospreydefense.com','Defense','San Diego','CA',1000,90000000.00,'customer'),
        ('Paladin Security Group','paladinsec.com','Security','Phoenix','AZ',500,40000000.00,'lead'),
        ('Radiance Beauty','radiancebeauty.com','Consumer Goods','Miami','FL',120,9000000.00,'opportunity'),
        ('Sequoia Digital','sequoiadigital.com','Technology','Santa Clara','CA',200,14000000.00,'customer'),
        ('Tundra Logistics','tundralog.com','Transportation','Fargo','ND',350,28000000.00,'lead'),
        ('Unified Health Partners','unifiedhp.com','Healthcare','Indianapolis','IN',700,55000000.00,'customer'),
        ('Velocity Sports Tech','velocitysports.com','Technology','Austin','TX',90,6000000.00,'lead'),
        ('Whistler Resorts','whistlerresorts.com','Hospitality','Aspen','CO',300,22000000.00,'customer'),
        ('Xenith Electronics','xenithelectronics.com','Electronics','San Jose','CA',450,35000000.00,'customer'),
        ('Yosemite Adventures','yosemiteadv.com','Travel','Fresno','CA',50,3000000.00,'lead'),
        ('Zirconia Digital Media','zirconiadigital.com','Media','Nashville','TN',110,7500000.00,'customer')
    ) AS v(name, domain, industry, city, state, numberofemployees, annualrevenue, lifecyclestage)
)
INSERT INTO dbo.hs_Companies (name, domain, industry, city, state, numberofemployees, annualrevenue, lifecyclestage, createdate, lastmodifieddate)
SELECT name, domain, industry, city, state, numberofemployees, annualrevenue, lifecyclestage,
       DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
       DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2025-01-01')
FROM CompanyNames;
GO

----------------------------------------------------------------------
-- hs_Contacts (300 rows)
-- We generate them using cross-joins of first/last name arrays
----------------------------------------------------------------------
;WITH FirstNames AS (
    SELECT * FROM (VALUES
        ('Alexander'),('Brianna'),('Carlos'),('Diana'),('Ethan'),
        ('Fiona'),('Gregory'),('Hannah'),('Ivan'),('Julia'),
        ('Kyle'),('Lillian'),('Marcus'),('Natalie'),('Oscar'),
        ('Patricia'),('Quincy'),('Rebecca'),('Samuel'),('Tiffany'),
        ('Ulysses'),('Vanessa'),('Walter'),('Xena'),('Yolanda'),
        ('Zachary'),('Abigail'),('Brandon'),('Catherine'),('Derek')
    ) AS v(fn)
),
LastNames AS (
    SELECT * FROM (VALUES
        ('Adams'),('Baker'),('Carter'),('Douglas'),('Edwards'),
        ('Fisher'),('Grant'),('Howard'),('Ingram'),('Jensen')
    ) AS v(ln)
),
NumberedContacts AS (
    SELECT
        fn, ln,
        ROW_NUMBER() OVER (ORDER BY NEWID()) AS rn
    FROM FirstNames CROSS JOIN LastNames
),
LifecycleStages AS (
    SELECT * FROM (VALUES ('subscriber'),('lead'),('marketingqualifiedlead'),('salesqualifiedlead'),('opportunity'),('customer'),('evangelist')) AS v(stage)
),
LeadStatuses AS (
    SELECT * FROM (VALUES ('New'),('Open'),('In Progress'),('Unqualified'),('Attempted to Contact'),('Connected'),('Bad Timing')) AS v(status)
),
Cities AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS cid FROM (VALUES
        ('New York','NY','10001','US'),('Los Angeles','CA','90001','US'),('Chicago','IL','60601','US'),
        ('Houston','TX','77001','US'),('Phoenix','AZ','85001','US'),('Philadelphia','PA','19101','US'),
        ('San Antonio','TX','78201','US'),('San Diego','CA','92101','US'),('Dallas','TX','75201','US'),
        ('San Jose','CA','95101','US'),('Austin','TX','73301','US'),('Jacksonville','FL','32099','US'),
        ('Columbus','OH','43085','US'),('Charlotte','NC','28201','US'),('Indianapolis','IN','46201','US'),
        ('Seattle','WA','98101','US'),('Denver','CO','80201','US'),('Boston','MA','02101','US'),
        ('Nashville','TN','37201','US'),('Portland','OR','97201','US')
    ) AS v(city, state, zip, country)
)
INSERT INTO dbo.hs_Contacts (firstname, lastname, email, phone, company, lifecyclestage, hs_lead_status,
    createdate, lastmodifieddate, hs_email_optout, city, state, zip, country)
SELECT TOP 300
    nc.fn,
    nc.ln,
    LOWER(nc.fn) + '.' + LOWER(nc.ln) + CAST(nc.rn AS NVARCHAR(10)) + '@example.com',
    '(' + RIGHT('000' + CAST(200 + (ABS(CHECKSUM(NEWID())) % 800) AS VARCHAR), 3) + ') '
        + RIGHT('000' + CAST(200 + (ABS(CHECKSUM(NEWID())) % 800) AS VARCHAR), 3) + '-'
        + RIGHT('0000' + CAST(1000 + (ABS(CHECKSUM(NEWID())) % 9000) AS VARCHAR), 4),
    c.name,
    (SELECT TOP 1 stage FROM LifecycleStages ORDER BY NEWID()),
    (SELECT TOP 1 status FROM LeadStatuses ORDER BY NEWID()),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2025-01-01'),
    CASE WHEN ABS(CHECKSUM(NEWID())) % 10 = 0 THEN 1 ELSE 0 END,
    ci.city, ci.state, ci.zip, ci.country
FROM NumberedContacts nc
CROSS APPLY (SELECT TOP 1 name FROM dbo.hs_Companies ORDER BY NEWID()) c
CROSS APPLY (SELECT TOP 1 city, state, zip, country FROM Cities ORDER BY NEWID()) ci
WHERE nc.rn <= 300;
GO

----------------------------------------------------------------------
-- hs_Deals (150 rows)
----------------------------------------------------------------------
;WITH DealStages AS (
    SELECT * FROM (VALUES ('appointmentscheduled'),('qualifiedtobuy'),('presentationscheduled'),
        ('decisionmakerboughtin'),('contractsent'),('closedwon'),('closedlost')) AS v(stage)
),
DealPipelines AS (
    SELECT * FROM (VALUES ('default'),('enterprise'),('smb'),('partner')) AS v(pipeline)
),
OwnerIDs AS (
    SELECT owner_id, ROW_NUMBER() OVER (ORDER BY owner_id) AS rn FROM dbo.hs_Owners
),
CompanyIDs AS (
    SELECT hs_object_id, name, ROW_NUMBER() OVER (ORDER BY hs_object_id) AS rn FROM dbo.hs_Companies
),
ContactIDs AS (
    SELECT hs_object_id, ROW_NUMBER() OVER (ORDER BY hs_object_id) AS rn FROM dbo.hs_Contacts
),
Numbers AS (
    SELECT TOP 150 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.objects a CROSS JOIN sys.objects b
)
INSERT INTO dbo.hs_Deals (dealname, amount, dealstage, closedate, pipeline, hubspot_owner_id,
    associated_company_id, associated_contact_id, createdate, lastmodifieddate)
SELECT
    comp.name + ' - Deal #' + CAST(nums.n AS NVARCHAR(10)),
    CAST(500 + (ABS(CHECKSUM(NEWID())) % 249500) AS DECIMAL(18,2)),
    (SELECT TOP 1 stage FROM DealStages ORDER BY NEWID()),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    (SELECT TOP 1 pipeline FROM DealPipelines ORDER BY NEWID()),
    own.owner_id,
    comp.hs_object_id,
    cont.hs_object_id,
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 1095, '2023-01-01'),
    DATEADD(DAY, ABS(CHECKSUM(NEWID())) % 365, '2025-01-01')
FROM Numbers nums
INNER JOIN OwnerIDs own ON own.rn = ((nums.n - 1) % 20) + 1
INNER JOIN CompanyIDs comp ON comp.rn = ((nums.n - 1) % 100) + 1
INNER JOIN ContactIDs cont ON cont.rn = ((nums.n - 1) % 300) + 1;
GO

----------------------------------------------------------------------
-- STORED PROCEDURE: sp_MockDataSummary
----------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_MockDataSummary
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 'hs_Owners' AS TableName, COUNT(*) AS [RowCount] FROM dbo.hs_Owners
    UNION ALL
    SELECT 'hs_Companies', COUNT(*) FROM dbo.hs_Companies
    UNION ALL
    SELECT 'hs_Contacts', COUNT(*) FROM dbo.hs_Contacts
    UNION ALL
    SELECT 'hs_Deals', COUNT(*) FROM dbo.hs_Deals;
END;
GO

PRINT 'MockHubSpot database created successfully.';
GO
