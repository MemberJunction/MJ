/******************************************************************************
 * Association Sample Database - Membership Data
 * File: 01_membership_data.sql
 *
 * Generates comprehensive membership data including:
 * - 8 Membership Types
 * - 200 Organizations (cheese industry: producers, farms, distributors, retailers)
 * - 2,000 Members
 * - 2,500 Membership records (includes renewal history)
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
-- ORGANIZATIONS (200 Organizations - Cheese Industry Focus)
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
    (NEWID(), 'GreenTech Innovations', 'Sustainability Tech', 35, 6800000.00, NULL, NULL, NULL, 'https://www.greentech.eco', 'Sustainable technology solutions for climate change', 2022, 'Portland', 'OR', 'United States', '503-555-0138'),

    -- Cheese Industry Organizations (160 total - producers, farms, distributors, retailers, suppliers)

    -- Major Cheese Producers (25)
    (NEWID(), 'Alpine Creamery Co.', 'Cheese Production', 320, 125000000.00, NULL, NULL, NULL, 'https://www.alpinecreamery.com', 'Artisan Swiss and Alpine-style cheese producer', 1987, 'Monroe', 'WI', 'United States', '608-555-2001'),
    (NEWID(), 'Cascade Cheese Works', 'Cheese Production', 285, 98000000.00, NULL, NULL, NULL, 'https://www.cascadecheese.com', 'Pacific Northwest cheddar and specialty cheese manufacturer', 1992, 'Tillamook', 'OR', 'United States', '503-555-2002'),
    (NEWID(), 'Vermont Artisan Cheese', 'Cheese Production', 145, 42000000.00, NULL, NULL, NULL, 'https://www.vermontartisan.com', 'Small-batch aged cheddar and farmstead cheese', 1995, 'Burlington', 'VT', 'United States', '802-555-2003'),
    (NEWID(), 'Golden State Creamery', 'Cheese Production', 425, 156000000.00, NULL, NULL, NULL, 'https://www.goldenstatecreamery.com', 'California jack, monterey, and pepper jack producer', 1978, 'Modesto', 'CA', 'United States', '209-555-2004'),
    (NEWID(), 'Great Lakes Cheese Company', 'Cheese Production', 580, 245000000.00, NULL, NULL, NULL, 'https://www.greatlakescheese.com', 'Large-scale mozzarella and Italian cheese producer', 1958, 'Cleveland', 'OH', 'United States', '216-555-2005'),
    (NEWID(), 'Brie & Beyond Creamery', 'Cheese Production', 95, 28000000.00, NULL, NULL, NULL, 'https://www.briebeyond.com', 'French-style soft cheese and brie specialist', 2005, 'Petaluma', 'CA', 'United States', '707-555-2006'),
    (NEWID(), 'Feta Traditions', 'Cheese Production', 110, 35000000.00, NULL, NULL, NULL, 'https://www.fetatraditions.com', 'Greek-style feta and Mediterranean cheese producer', 2001, 'Chicago', 'IL', 'United States', '312-555-2007'),
    (NEWID(), 'Swiss Valley Cheese', 'Cheese Production', 195, 68000000.00, NULL, NULL, NULL, 'https://www.swissvalley.com', 'Traditional Swiss cheese and emmental producer', 1985, 'Davenport', 'IA', 'United States', '563-555-2008'),
    (NEWID(), 'Blue Moon Creamery', 'Cheese Production', 75, 22000000.00, NULL, NULL, NULL, 'https://www.bluemooncreamery.com', 'Blue cheese and gorgonzola specialist', 2008, 'Rogue River', 'OR', 'United States', '541-555-2009'),
    (NEWID(), 'Gouda Gold Producers', 'Cheese Production', 165, 52000000.00, NULL, NULL, NULL, 'https://www.goudagold.com', 'Dutch-style gouda and edam cheese maker', 1998, 'Holland', 'MI', 'United States', '616-555-2010'),
    (NEWID(), 'Mozzarella Masters', 'Cheese Production', 245, 89000000.00, NULL, NULL, NULL, 'https://www.mozzarellamasters.com', 'Fresh mozzarella and burrata producer', 1982, 'Buffalo', 'NY', 'United States', '716-555-2011'),
    (NEWID(), 'Parmesan Palace', 'Cheese Production', 135, 48000000.00, NULL, NULL, NULL, 'https://www.parmesanpalace.com', 'Aged parmesan, romano, and hard Italian cheeses', 1975, 'Denver', 'CO', 'United States', '303-555-2012'),
    (NEWID(), 'Colby Corner Cheese', 'Cheese Production', 88, 25000000.00, NULL, NULL, NULL, 'https://www.colbycorner.com', 'Colby and colby-jack cheese specialist', 2003, 'Colby', 'WI', 'United States', '715-555-2013'),
    (NEWID(), 'Pepper Jack Productions', 'Cheese Production', 125, 38000000.00, NULL, NULL, NULL, 'https://www.pepperjackpro.com', 'Spicy cheese varieties and jalapeño cheese', 2006, 'Santa Fe', 'NM', 'United States', '505-555-2014'),
    (NEWID(), 'Creamy Dream Dairy', 'Cheese Production', 210, 72000000.00, NULL, NULL, NULL, 'https://www.creamydream.com', 'Cream cheese, mascarpone, and soft spreads', 1991, 'Philadelphia', 'PA', 'United States', '215-555-2015'),
    (NEWID(), 'Mountain Peak Cheese', 'Cheese Production', 155, 55000000.00, NULL, NULL, NULL, 'https://www.mountainpeakcheese.com', 'Alpine-style and mountain cheese varieties', 2000, 'Bozeman', 'MT', 'United States', '406-555-2016'),
    (NEWID(), 'Coastal Creamery Co.', 'Cheese Production', 180, 64000000.00, NULL, NULL, NULL, 'https://www.coastalcreamery.com', 'Sea-salted and coastal-inspired cheese flavors', 2004, 'Charleston', 'SC', 'United States', '843-555-2017'),
    (NEWID(), 'Heritage Cheese Makers', 'Cheese Production', 95, 29000000.00, NULL, NULL, NULL, 'https://www.heritagecheese.com', 'Traditional farmhouse and heritage cheese varieties', 2007, 'Lancaster', 'PA', 'United States', '717-555-2018'),
    (NEWID(), 'Smoked Cheese Specialists', 'Cheese Production', 68, 18000000.00, NULL, NULL, NULL, 'https://www.smokedcheese.com', 'Smoked gouda, cheddar, and specialty smoked cheeses', 2010, 'Asheville', 'NC', 'United States', '828-555-2019'),
    (NEWID(), 'String Cheese Supply', 'Cheese Production', 195, 68000000.00, NULL, NULL, NULL, 'https://www.stringcheese.com', 'String cheese and mozzarella snacks', 1996, 'Fresno', 'CA', 'United States', '559-555-2020'),
    (NEWID(), 'Aged & Bold Cheese Co.', 'Cheese Production', 105, 32000000.00, NULL, NULL, NULL, 'https://www.agedandbold.com', 'Extra-aged cheddar and vintage cheese specialist', 2002, 'Cabot', 'VT', 'United States', '802-555-2021'),
    (NEWID(), 'Ricotta Royale', 'Cheese Production', 85, 24000000.00, NULL, NULL, NULL, 'https://www.ricottaroyale.com', 'Fresh ricotta and Italian soft cheese producer', 2009, 'Providence', 'RI', 'United States', '401-555-2022'),
    (NEWID(), 'Sheep & Goat Cheese Guild', 'Cheese Production', 52, 14000000.00, NULL, NULL, NULL, 'https://www.sheepgoatcheese.com', 'Specialty sheep and goat milk cheese varieties', 2012, 'Asheville', 'NC', 'United States', '828-555-2023'),
    (NEWID(), 'Provolone Producers Inc.', 'Cheese Production', 145, 48000000.00, NULL, NULL, NULL, 'https://www.provolonepro.com', 'Provolone, provoletta, and Italian semi-hard cheese', 1988, 'Pittsburgh', 'PA', 'United States', '412-555-2024'),
    (NEWID(), 'International Cheese Imports', 'Cheese Production', 225, 95000000.00, NULL, NULL, NULL, 'https://www.intlcheese.com', 'Imported European cheese distributor and aging facility', 1972, 'New York', 'NY', 'United States', '212-555-2025'),

    -- Dairy Farms & Milk Producers (30)
    (NEWID(), 'Sunrise Dairy Farm', 'Dairy Farming', 45, 8500000.00, NULL, NULL, NULL, 'https://www.sunrisedairy.com', 'Family-owned dairy farm producing grade-A milk', 1952, 'Lancaster', 'PA', 'United States', '717-555-3001'),
    (NEWID(), 'Green Pastures Dairy', 'Dairy Farming', 65, 12000000.00, NULL, NULL, NULL, 'https://www.greenpastures.com', 'Grass-fed dairy operation specializing in organic milk', 1968, 'Tillamook', 'OR', 'United States', '503-555-3002'),
    (NEWID(), 'Valley View Farms', 'Dairy Farming', 38, 6200000.00, NULL, NULL, NULL, 'https://www.valleyviewfarms.com', 'Small-batch artisan milk for cheese production', 1995, 'Middlebury', 'VT', 'United States', '802-555-3003'),
    (NEWID(), 'Holstein Heritage Dairy', 'Dairy Farming', 52, 9800000.00, NULL, NULL, NULL, 'https://www.holsteinheritage.com', 'Premium Holstein milk producer', 1978, 'Fond du Lac', 'WI', 'United States', '920-555-3004'),
    (NEWID(), 'Clover Hill Creamery', 'Dairy Farming', 28, 4500000.00, NULL, NULL, NULL, 'https://www.cloverhill.com', 'Organic certified dairy farm', 2005, 'Stowe', 'VT', 'United States', '802-555-3005'),
    (NEWID(), 'Golden Guernsey Dairy', 'Dairy Farming', 42, 7800000.00, NULL, NULL, NULL, 'https://www.goldenguernsey.com', 'Guernsey milk with high butterfat content', 1983, 'Spring Grove', 'MN', 'United States', '507-555-3006'),
    (NEWID(), 'Mountain Meadow Farms', 'Dairy Farming', 55, 10500000.00, NULL, NULL, NULL, 'https://www.mountainmeadow.com', 'Alpine dairy farming at high elevation', 1990, 'Steamboat Springs', 'CO', 'United States', '970-555-3007'),
    (NEWID(), 'Jersey Pride Dairy', 'Dairy Farming', 35, 6800000.00, NULL, NULL, NULL, 'https://www.jerseypride.com', 'Jersey cow milk for premium cheese', 1999, 'Tillamook', 'OR', 'United States', '503-555-3008'),
    (NEWID(), 'Riverside Dairy Collective', 'Dairy Farming', 72, 15000000.00, NULL, NULL, NULL, 'https://www.riversidedairy.com', 'Cooperative of family dairy farms', 1965, 'La Crosse', 'WI', 'United States', '608-555-3009'),
    (NEWID(), 'Happy Cow Dairy Farm', 'Dairy Farming', 48, 8900000.00, NULL, NULL, NULL, 'https://www.happycowdairy.com', 'Humane certified pasture-raised dairy', 2008, 'Petaluma', 'CA', 'United States', '707-555-3010'),
    (NEWID(), 'Prairie Star Dairy', 'Dairy Farming', 62, 11500000.00, NULL, NULL, NULL, 'https://www.prairiestardairy.com', 'Midwest family dairy farm', 1975, 'Sioux Falls', 'SD', 'United States', '605-555-3011'),
    (NEWID(), 'Maple Grove Dairy', 'Dairy Farming', 32, 5500000.00, NULL, NULL, NULL, 'https://www.maplegrovedairy.com', 'Small-scale sustainable dairy operation', 2010, 'Woodstock', 'VT', 'United States', '802-555-3012'),
    (NEWID(), 'Bluegrass Dairy Farms', 'Dairy Farming', 58, 10800000.00, NULL, NULL, NULL, 'https://www.bluegrassdairy.com', 'Kentucky dairy farm with traditional methods', 1982, 'Lexington', 'KY', 'United States', '859-555-3013'),
    (NEWID(), 'Cascade Crest Dairy', 'Dairy Farming', 45, 8200000.00, NULL, NULL, NULL, 'https://www.cascadecrestdairy.com', 'Pacific Northwest organic dairy', 2003, 'Eugene', 'OR', 'United States', '541-555-3014'),
    (NEWID(), 'Goat Hill Farm', 'Dairy Farming', 22, 3200000.00, NULL, NULL, NULL, 'https://www.goathill.com', 'Specialty goat milk dairy', 2007, 'Asheville', 'NC', 'United States', '828-555-3015'),
    (NEWID(), 'Sheep Meadow Dairy', 'Dairy Farming', 18, 2800000.00, NULL, NULL, NULL, 'https://www.sheepmeadow.com', 'Artisan sheep milk producer', 2011, 'Ithaca', 'NY', 'United States', '607-555-3016'),
    (NEWID(), 'Rolling Hills Dairy', 'Dairy Farming', 68, 13200000.00, NULL, NULL, NULL, 'https://www.rollinghillsdairy.com', 'Large-scale conventional dairy operation', 1970, 'Tulare', 'CA', 'United States', '559-555-3017'),
    (NEWID(), 'Wildflower Dairy Farm', 'Dairy Farming', 28, 4800000.00, NULL, NULL, NULL, 'https://www.wildflowerdairy.com', 'Seasonal grazing dairy with wildflower pastures', 2009, 'Boise', 'ID', 'United States', '208-555-3018'),
    (NEWID(), 'Twin Oaks Dairy', 'Dairy Farming', 52, 9500000.00, NULL, NULL, NULL, 'https://www.twinoaksdairy.com', 'Third-generation family dairy farm', 1955, 'Dubuque', 'IA', 'United States', '563-555-3019'),
    (NEWID(), 'Sunrise Valley Creamery', 'Dairy Farming', 42, 7500000.00, NULL, NULL, NULL, 'https://www.sunrisevalley.com', 'Certified humane dairy farm', 2004, 'Corvallis', 'OR', 'United States', '541-555-3020'),
    (NEWID(), 'Heritage Dairy Cooperative', 'Dairy Farming', 95, 18500000.00, NULL, NULL, NULL, 'https://www.heritagedairy.com', 'Cooperative of 15 family farms', 1958, 'Eau Claire', 'WI', 'United States', '715-555-3021'),
    (NEWID(), 'Cloverleaf Dairy Farm', 'Dairy Farming', 38, 6500000.00, NULL, NULL, NULL, 'https://www.cloverleafdairy.com', 'Regenerative agriculture dairy', 2012, 'Burlington', 'VT', 'United States', '802-555-3022'),
    (NEWID(), 'Pinecrest Dairy', 'Dairy Farming', 48, 8800000.00, NULL, NULL, NULL, 'https://www.pinecrestdairy.com', 'Mountain dairy with artesian well water', 1988, 'Bozeman', 'MT', 'United States', '406-555-3023'),
    (NEWID(), 'Organic Valley Dairy', 'Dairy Farming', 82, 16200000.00, NULL, NULL, NULL, 'https://www.organicvalleydairy.com', 'Certified organic dairy collective', 1992, 'Viroqua', 'WI', 'United States', '608-555-3024'),
    (NEWID(), 'Buttercup Dairy Farm', 'Dairy Farming', 35, 6200000.00, NULL, NULL, NULL, 'https://www.buttercupdairy.com', 'Small-batch raw milk producer', 2006, 'Grants Pass', 'OR', 'United States', '541-555-3025'),
    (NEWID(), 'Highland Dairy', 'Dairy Farming', 58, 10500000.00, NULL, NULL, NULL, 'https://www.highlanddairy.com', 'Highland and heritage breed dairy', 1997, 'Highlands', 'NC', 'United States', '828-555-3026'),
    (NEWID(), 'Cedar Creek Dairy', 'Dairy Farming', 44, 7900000.00, NULL, NULL, NULL, 'https://www.cedarcreekdairy.com', 'Creek-side pasture dairy farm', 2001, 'Bellingham', 'WA', 'United States', '360-555-3027'),
    (NEWID(), 'Meadowbrook Farms', 'Dairy Farming', 62, 11800000.00, NULL, NULL, NULL, 'https://www.meadowbrookfarms.com', 'Multi-generational dairy operation', 1948, 'Waterloo', 'IA', 'United States', '319-555-3028'),
    (NEWID(), 'Hillside Dairy Collective', 'Dairy Farming', 75, 14500000.00, NULL, NULL, NULL, 'https://www.hillsidedairy.com', 'Regional dairy cooperative', 1972, 'Montpelier', 'VT', 'United States', '802-555-3029'),
    (NEWID(), 'Buffalo milk Dairy Farm', 'Dairy Farming', 28, 4200000.00, NULL, NULL, NULL, 'https://www.buffalomilk.com', 'Water buffalo milk for mozzarella', 2013, 'Ramona', 'CA', 'United States', '760-555-3030'),

    -- Cheese Distributors (25)
    (NEWID(), 'National Cheese Distributors', 'Food Distribution', 185, 98000000.00, NULL, NULL, NULL, 'https://www.nationalcheese.com', 'Nationwide cheese distribution network', 1982, 'Chicago', 'IL', 'United States', '312-555-4001'),
    (NEWID(), 'Fresh Dairy Logistics', 'Food Distribution', 145, 72000000.00, NULL, NULL, NULL, 'https://www.freshdairylogistics.com', 'Temperature-controlled dairy distribution', 1995, 'Memphis', 'TN', 'United States', '901-555-4002'),
    (NEWID(), 'Premium Cheese Partners', 'Food Distribution', 98, 45000000.00, NULL, NULL, NULL, 'https://www.premiumcheese.com', 'Specialty and artisan cheese distributor', 2001, 'Portland', 'OR', 'United States', '503-555-4003'),
    (NEWID(), 'Coast to Coast Cheese', 'Food Distribution', 220, 125000000.00, NULL, NULL, NULL, 'https://www.coasttocoastcheese.com', 'Major US cheese distribution company', 1978, 'Kansas City', 'MO', 'United States', '816-555-4004'),
    (NEWID(), 'Regional Dairy Supply', 'Food Distribution', 75, 32000000.00, NULL, NULL, NULL, 'https://www.regionaldairy.com', 'Regional distribution for independent retailers', 2004, 'Denver', 'CO', 'United States', '303-555-4005'),
    (NEWID(), 'Artisan Cheese Network', 'Food Distribution', 42, 18000000.00, NULL, NULL, NULL, 'https://www.artisancheesenetwork.com', 'Small-batch cheese distribution to restaurants', 2008, 'San Francisco', 'CA', 'United States', '415-555-4006'),
    (NEWID(), 'Wholesale Cheese Supply', 'Food Distribution', 165, 88000000.00, NULL, NULL, NULL, 'https://www.wholesalecheese.com', 'Bulk cheese supplier to food service', 1985, 'Atlanta', 'GA', 'United States', '404-555-4007'),
    (NEWID(), 'Gourmet Food Distributors', 'Food Distribution', 135, 65000000.00, NULL, NULL, NULL, 'https://www.gourmetfooddist.com', 'Specialty cheese and gourmet foods', 1998, 'Seattle', 'WA', 'United States', '206-555-4008'),
    (NEWID(), 'Midwest Dairy Distribution', 'Food Distribution', 92, 42000000.00, NULL, NULL, NULL, 'https://www.midwestdairydist.com', 'Regional distributor serving midwest markets', 1990, 'Milwaukee', 'WI', 'United States', '414-555-4009'),
    (NEWID(), 'Express Cheese Logistics', 'Food Distribution', 58, 24000000.00, NULL, NULL, NULL, 'https://www.expresscheese.com', 'Rapid distribution to urban markets', 2006, 'New York', 'NY', 'United States', '212-555-4010'),
    (NEWID(), 'Farm Fresh Distribution', 'Food Distribution', 68, 28000000.00, NULL, NULL, NULL, 'https://www.farmfreshdist.com', 'Direct-from-farm dairy distribution', 2003, 'Burlington', 'VT', 'United States', '802-555-4011'),
    (NEWID(), 'Southwest Cheese Supply', 'Food Distribution', 82, 36000000.00, NULL, NULL, NULL, 'https://www.southwestcheese.com', 'Regional distributor for southwest US', 1996, 'Phoenix', 'AZ', 'United States', '602-555-4012'),
    (NEWID(), 'European Cheese Imports', 'Food Distribution', 48, 22000000.00, NULL, NULL, NULL, 'https://www.eurocheeseimports.com', 'Imported European cheese specialist', 2005, 'Boston', 'MA', 'United States', '617-555-4013'),
    (NEWID(), 'Pacific Rim Dairy', 'Food Distribution', 95, 48000000.00, NULL, NULL, NULL, 'https://www.pacificrimdairy.com', 'West coast dairy and cheese distributor', 1988, 'Los Angeles', 'CA', 'United States', '213-555-4014'),
    (NEWID(), 'Independent Cheese Brokers', 'Food Distribution', 32, 14000000.00, NULL, NULL, NULL, 'https://www.indcheese.com', 'Cheese brokerage and distribution', 2009, 'Minneapolis', 'MN', 'United States', '612-555-4015'),
    (NEWID(), 'Foodservice Dairy Partners', 'Food Distribution', 125, 68000000.00, NULL, NULL, NULL, 'https://www.foodservicedairy.com', 'Restaurant and foodservice cheese supply', 1992, 'Dallas', 'TX', 'United States', '214-555-4016'),
    (NEWID(), 'Heritage Cheese Distribution', 'Food Distribution', 52, 23000000.00, NULL, NULL, NULL, 'https://www.heritagecheesedist.com', 'Traditional and heritage cheese varieties', 2007, 'Lancaster', 'PA', 'United States', '717-555-4017'),
    (NEWID(), 'Mountain States Dairy', 'Food Distribution', 72, 32000000.00, NULL, NULL, NULL, 'https://www.mountainstatesdairy.com', 'Rocky Mountain region distributor', 1994, 'Salt Lake City', 'UT', 'United States', '801-555-4018'),
    (NEWID(), 'Cheese & More Logistics', 'Food Distribution', 88, 42000000.00, NULL, NULL, NULL, 'https://www.cheeseandmore.com', 'Multi-category dairy product distribution', 2000, 'Nashville', 'TN', 'United States', '615-555-4019'),
    (NEWID(), 'Quality Cheese Partners', 'Food Distribution', 105, 55000000.00, NULL, NULL, NULL, 'https://www.qualitycheese.com', 'Premium cheese distribution network', 1987, 'Columbus', 'OH', 'United States', '614-555-4020'),
    (NEWID(), 'Cold Chain Dairy', 'Food Distribution', 62, 28000000.00, NULL, NULL, NULL, 'https://www.coldchaindairy.com', 'Advanced cold-chain logistics for dairy', 2010, 'Indianapolis', 'IN', 'United States', '317-555-4021'),
    (NEWID(), 'Specialty Foods Network', 'Food Distribution', 78, 38000000.00, NULL, NULL, NULL, 'https://www.specialtyfoodsnet.com', 'Gourmet and specialty cheese distribution', 2002, 'Philadelphia', 'PA', 'United States', '215-555-4022'),
    (NEWID(), 'New England Cheese Co.', 'Food Distribution', 58, 25000000.00, NULL, NULL, NULL, 'https://www.newenglandcheese.com', 'Regional distributor for New England', 1996, 'Providence', 'RI', 'United States', '401-555-4023'),
    (NEWID(), 'Great Plains Dairy', 'Food Distribution', 68, 30000000.00, NULL, NULL, NULL, 'https://www.greatplainsdairy.com', 'Central plains regional distributor', 1991, 'Omaha', 'NE', 'United States', '402-555-4024'),
    (NEWID(), 'Urban Cheese Supply', 'Food Distribution', 45, 19000000.00, NULL, NULL, NULL, 'https://www.urbancheese.com', 'Metro area cheese distributor', 2011, 'Brooklyn', 'NY', 'United States', '718-555-4025'),

    -- Cheese Retailers & Specialty Shops (40)
    (NEWID(), 'The Cheese Shop', 'Specialty Retail', 8, 1200000.00, NULL, NULL, NULL, 'https://www.thecheeseshop.com', 'Artisan cheese retail and tasting room', 2005, 'Burlington', 'VT', 'United States', '802-555-5001'),
    (NEWID(), 'Fromagerie Boutique', 'Specialty Retail', 12, 1800000.00, NULL, NULL, NULL, 'https://www.fromageriebtq.com', 'French cheese shop and bistro', 2008, 'San Francisco', 'CA', 'United States', '415-555-5002'),
    (NEWID(), 'Cheese Please Market', 'Specialty Retail', 6, 850000.00, NULL, NULL, NULL, 'https://www.cheeseplease.com', 'Local cheese and gourmet foods', 2010, 'Portland', 'OR', 'United States', '503-555-5003'),
    (NEWID(), 'The Cheddar Box', 'Specialty Retail', 10, 1500000.00, NULL, NULL, NULL, 'https://www.cheddarbox.com', 'Cheddar specialty shop with online sales', 2006, 'Madison', 'WI', 'United States', '608-555-5004'),
    (NEWID(), 'Artisan Cheese Gallery', 'Specialty Retail', 15, 2200000.00, NULL, NULL, NULL, 'https://www.cheesegallery.com', 'Curated artisan cheese selection', 2003, 'Seattle', 'WA', 'United States', '206-555-5005'),
    (NEWID(), 'Cheese & Wine Cellars', 'Specialty Retail', 18, 2800000.00, NULL, NULL, NULL, 'https://www.cheesewinecellars.com', 'Cheese and wine pairing shop', 2000, 'Napa', 'CA', 'United States', '707-555-5006'),
    (NEWID(), 'The Dairy Emporium', 'Specialty Retail', 14, 1900000.00, NULL, NULL, NULL, 'https://www.dairyemporium.com', 'Full-service cheese and dairy shop', 2007, 'Boulder', 'CO', 'United States', '303-555-5007'),
    (NEWID(), 'Gourmet Cheese Market', 'Specialty Retail', 22, 3500000.00, NULL, NULL, NULL, 'https://www.gourmetcheesemarket.com', 'Upscale cheese and charcuterie', 1998, 'Chicago', 'IL', 'United States', '312-555-5008'),
    (NEWID(), 'The Cheese Board', 'Specialty Retail', 25, 3800000.00, NULL, NULL, NULL, 'https://www.cheeseboard.com', 'Worker-owned cheese cooperative', 1971, 'Berkeley', 'CA', 'United States', '510-555-5009'),
    (NEWID(), 'Say Cheese!', 'Specialty Retail', 9, 1300000.00, NULL, NULL, NULL, 'https://www.saycheeseshop.com', 'Neighborhood cheese shop', 2009, 'Austin', 'TX', 'United States', '512-555-5010'),
    (NEWID(), 'The Cheese Monger', 'Specialty Retail', 16, 2400000.00, NULL, NULL, NULL, 'https://www.cheesemonger.com', 'Expert cheese selection and education', 2004, 'Boston', 'MA', 'United States', '617-555-5011'),
    (NEWID(), 'Fromage Fine Foods', 'Specialty Retail', 11, 1600000.00, NULL, NULL, NULL, 'https://www.fromagefine.com', 'European-style cheese shop', 2011, 'New York', 'NY', 'United States', '212-555-5012'),
    (NEWID(), 'The Cheese Cave', 'Specialty Retail', 7, 950000.00, NULL, NULL, NULL, 'https://www.cheesecave.com', 'Aged cheese specialist', 2012, 'Asheville', 'NC', 'United States', '828-555-5013'),
    (NEWID(), 'Melted Dreams', 'Specialty Retail', 13, 1750000.00, NULL, NULL, NULL, 'https://www.melteddreams.com', 'Grilled cheese cafe and cheese shop', 2013, 'Denver', 'CO', 'United States', '720-555-5014'),
    (NEWID(), 'The Cheese Counter', 'Specialty Retail', 10, 1400000.00, NULL, NULL, NULL, 'https://www.cheesecounter.com', 'Artisan cheese and provisions', 2008, 'Raleigh', 'NC', 'United States', '919-555-5015'),
    (NEWID(), 'Curds & Whey Shop', 'Specialty Retail', 8, 1100000.00, NULL, NULL, NULL, 'https://www.curdsandwhey.com', 'Fresh cheese and dairy products', 2014, 'Nashville', 'TN', 'United States', '615-555-5016'),
    (NEWID(), 'The Cheese Plate', 'Specialty Retail', 19, 2900000.00, NULL, NULL, NULL, 'https://www.cheeseplateshop.com', 'Cheese platters and catering', 2002, 'Philadelphia', 'PA', 'United States', '215-555-5017'),
    (NEWID(), 'Formaggio Kitchen', 'Specialty Retail', 28, 4200000.00, NULL, NULL, NULL, 'https://www.formaggiokitchen.com', 'Premier cheese and specialty foods', 1978, 'Cambridge', 'MA', 'United States', '617-555-5018'),
    (NEWID(), 'The Cheese Store', 'Specialty Retail', 12, 1700000.00, NULL, NULL, NULL, 'https://www.cheesestore.com', 'Local and imported cheese selection', 2006, 'Portland', 'ME', 'United States', '207-555-5019'),
    (NEWID(), 'Artisan Cheese Exchange', 'Specialty Retail', 15, 2100000.00, NULL, NULL, NULL, 'https://www.cheeseexchange.com', 'Cheese tasting and retail', 2009, 'Charlottesville', 'VA', 'United States', '434-555-5020'),
    (NEWID(), 'The Cheese Cellar', 'Specialty Retail', 14, 1950000.00, NULL, NULL, NULL, 'https://www.cheesecellar.com', 'Temperature-controlled cheese aging room', 2010, 'Traverse City', 'MI', 'United States', '231-555-5021'),
    (NEWID(), 'Cheese & Crackers Co.', 'Specialty Retail', 9, 1250000.00, NULL, NULL, NULL, 'https://www.cheesecrackers.com', 'Cheese and accompaniments shop', 2012, 'Bend', 'OR', 'United States', '541-555-5022'),
    (NEWID(), 'The Dairy Bar', 'Specialty Retail', 17, 2500000.00, NULL, NULL, NULL, 'https://www.dairybarshop.com', 'Fresh dairy products and cheese', 2001, 'Ithaca', 'NY', 'United States', '607-555-5023'),
    (NEWID(), 'Cheese Boutique', 'Specialty Retail', 20, 3100000.00, NULL, NULL, NULL, 'https://www.cheeseboutique.com', 'Luxury cheese and gourmet gifts', 1995, 'Toronto', 'Ontario', 'Canada', '416-555-5024'),
    (NEWID(), 'The Cheese Lady', 'Specialty Retail', 6, 800000.00, NULL, NULL, NULL, 'https://www.cheeselady.com', 'Personal cheese shopping service', 2015, 'Tacoma', 'WA', 'United States', '253-555-5025'),
    (NEWID(), 'Fromagerie Artisanale', 'Specialty Retail', 11, 1550000.00, NULL, NULL, NULL, 'https://www.fromagerieartisan.com', 'French artisan cheese shop', 2007, 'Montreal', 'Quebec', 'Canada', '514-555-5026'),
    (NEWID(), 'Cheese Central', 'Specialty Retail', 16, 2300000.00, NULL, NULL, NULL, 'https://www.cheesecentral.com', 'Downtown cheese market', 2005, 'Des Moines', 'IA', 'United States', '515-555-5027'),
    (NEWID(), 'The Cheese Shop of Salem', 'Specialty Retail', 8, 1150000.00, NULL, NULL, NULL, 'https://www.cheeseshopofsalem.com', 'Historic cheese shop', 1989, 'Salem', 'MA', 'United States', '978-555-5028'),
    (NEWID(), 'Aged to Perfection', 'Specialty Retail', 13, 1850000.00, NULL, NULL, NULL, 'https://www.agedtoperfection.com', 'Vintage and aged cheese specialist', 2011, 'Savannah', 'GA', 'United States', '912-555-5029'),
    (NEWID(), 'The Cheese Wheel', 'Specialty Retail', 10, 1450000.00, NULL, NULL, NULL, 'https://www.cheesewheel.com', 'Whole cheese wheels and cuts', 2013, 'Boise', 'ID', 'United States', '208-555-5030'),
    (NEWID(), 'Dairy Delights Market', 'Specialty Retail', 18, 2700000.00, NULL, NULL, NULL, 'https://www.dairydelights.com', 'Complete dairy products market', 2003, 'Green Bay', 'WI', 'United States', '920-555-5031'),
    (NEWID(), 'The Cheese Loft', 'Specialty Retail', 12, 1700000.00, NULL, NULL, NULL, 'https://www.cheeseloft.com', 'Upstairs cheese boutique', 2008, 'Santa Fe', 'NM', 'United States', '505-555-5032'),
    (NEWID(), 'Creamery Collection', 'Specialty Retail', 14, 1980000.00, NULL, NULL, NULL, 'https://www.creamerycollection.com', 'Curated creamery products', 2010, 'Lexington', 'KY', 'United States', '859-555-5033'),
    (NEWID(), 'The Cheese Haven', 'Specialty Retail', 9, 1300000.00, NULL, NULL, NULL, 'https://www.cheesehaven.com', 'Cozy neighborhood cheese shop', 2014, 'Providence', 'RI', 'United States', '401-555-5034'),
    (NEWID(), 'Artisan Dairy Market', 'Specialty Retail', 21, 3200000.00, NULL, NULL, NULL, 'https://www.artisandairymarket.com', 'Farm-to-table dairy marketplace', 2000, 'Missoula', 'MT', 'United States', '406-555-5035'),
    (NEWID(), 'The Cheese Factor', 'Specialty Retail', 7, 950000.00, NULL, NULL, NULL, 'https://www.cheesefactor.com', 'Industrial-chic cheese shop', 2015, 'Detroit', 'MI', 'United States', '313-555-5036'),
    (NEWID(), 'Fromagerie du Village', 'Specialty Retail', 10, 1400000.00, NULL, NULL, NULL, 'https://www.fromagerievillage.com', 'Village-style cheese shop', 2009, 'Quebec City', 'Quebec', 'Canada', '418-555-5037'),
    (NEWID(), 'The Cheese Place', 'Specialty Retail', 11, 1550000.00, NULL, NULL, NULL, 'https://www.cheeseplace.com', 'Friendly neighborhood cheese shop', 2012, 'Eugene', 'OR', 'United States', '541-555-5038'),
    (NEWID(), 'Gourmet Cheese Co.', 'Specialty Retail', 15, 2150000.00, NULL, NULL, NULL, 'https://www.gourmetcheeseco.com', 'Premium cheese and accessories', 2006, 'Charleston', 'SC', 'United States', '843-555-5039'),
    (NEWID(), 'The Cheese Emporium', 'Specialty Retail', 24, 3700000.00, NULL, NULL, NULL, 'https://www.cheeseemporium.com', 'Large format cheese superstore', 1992, 'Milwaukee', 'WI', 'United States', '414-555-5040'),

    -- Cheese Industry Suppliers & Services (40)
    (NEWID(), 'Dairy Equipment Solutions', 'Manufacturing Equipment', 125, 52000000.00, NULL, NULL, NULL, 'https://www.dairyequip.com', 'Cheese production equipment and automation', 1985, 'Green Bay', 'WI', 'United States', '920-555-6001'),
    (NEWID(), 'Packaging Innovations Inc.', 'Packaging', 95, 38000000.00, NULL, NULL, NULL, 'https://www.packaginginnovations.com', 'Cheese packaging and labeling systems', 1998, 'Chicago', 'IL', 'United States', '312-555-6002'),
    (NEWID(), 'Cold Storage Systems', 'Refrigeration', 88, 35000000.00, NULL, NULL, NULL, 'https://www.coldstoragesys.com', 'Industrial refrigeration for cheese aging', 1990, 'Atlanta', 'GA', 'United States', '404-555-6003'),
    (NEWID(), 'Dairy Lab Testing Services', 'Laboratory Services', 45, 12000000.00, NULL, NULL, NULL, 'https://www.dairylabtest.com', 'Milk and cheese quality testing', 2002, 'Madison', 'WI', 'United States', '608-555-6004'),
    (NEWID(), 'Cheese Cultures Inc.', 'Ingredients', 62, 22000000.00, NULL, NULL, NULL, 'https://www.cheesecultures.com', 'Starter cultures and enzymes for cheesemaking', 1995, 'Milwaukee', 'WI', 'United States', '414-555-6005'),
    (NEWID(), 'Rennet & Coagulants Co.', 'Ingredients', 35, 15000000.00, NULL, NULL, NULL, 'https://www.rennetco.com', 'Cheese coagulants and additives', 2000, 'Fond du Lac', 'WI', 'United States', '920-555-6006'),
    (NEWID(), 'Dairy Logistics Consulting', 'Consulting', 28, 8500000.00, NULL, NULL, NULL, 'https://www.dairylogistics.com', 'Supply chain optimization for dairy', 2005, 'Minneapolis', 'MN', 'United States', '612-555-6007'),
    (NEWID(), 'Cheese Safety Solutions', 'Food Safety', 52, 18000000.00, NULL, NULL, NULL, 'https://www.cheesesafety.com', 'HACCP and food safety consulting', 2003, 'Denver', 'CO', 'United States', '303-555-6008'),
    (NEWID(), 'Artisan Cheesemaking Supplies', 'Ingredients', 22, 6500000.00, NULL, NULL, NULL, 'https://www.artisansupplies.com', 'Small-batch cheesemaking equipment', 2008, 'Asheville', 'NC', 'United States', '828-555-6009'),
    (NEWID(), 'Dairy Pumps & Valves', 'Equipment', 68, 25000000.00, NULL, NULL, NULL, 'https://www.dairypumps.com', 'Sanitary pumps and valves for dairy', 1987, 'Syracuse', 'NY', 'United States', '315-555-6010'),
    (NEWID(), 'Cheese Wax & Coatings', 'Ingredients', 18, 5200000.00, NULL, NULL, NULL, 'https://www.cheesewax.com', 'Cheese wax and protective coatings', 2006, 'Portland', 'OR', 'United States', '503-555-6011'),
    (NEWID(), 'Dairy Automation Systems', 'Automation', 95, 42000000.00, NULL, NULL, NULL, 'https://www.dairyautomation.com', 'Robotic systems for cheese production', 1999, 'Seattle', 'WA', 'United States', '206-555-6012'),
    (NEWID(), 'Cheese Mold Makers', 'Equipment', 38, 11000000.00, NULL, NULL, NULL, 'https://www.cheesemolds.com', 'Custom cheese molds and forms', 2001, 'Lancaster', 'PA', 'United States', '717-555-6013'),
    (NEWID(), 'Dairy Sanitation Services', 'Cleaning Services', 72, 22000000.00, NULL, NULL, NULL, 'https://www.dairysanitation.com', 'Industrial cleaning for dairy facilities', 1993, 'Tulare', 'CA', 'United States', '559-555-6014'),
    (NEWID(), 'Cheese Aging Rooms Inc.', 'Construction', 45, 15000000.00, NULL, NULL, NULL, 'https://www.cheeseagingrooms.com', 'Cave and aging room construction', 2004, 'Boulder', 'CO', 'United States', '303-555-6015'),
    (NEWID(), 'Dairy Ingredient Suppliers', 'Ingredients', 58, 28000000.00, NULL, NULL, NULL, 'https://www.dairyingredients.com', 'Salt, spices, and cheese additives', 1996, 'Dallas', 'TX', 'United States', '214-555-6016'),
    (NEWID(), 'Cheese Wrapping Solutions', 'Packaging', 32, 9500000.00, NULL, NULL, NULL, 'https://www.cheesewrapping.com', 'Specialty cheese wrapping materials', 2007, 'Philadelphia', 'PA', 'United States', '215-555-6017'),
    (NEWID(), 'Dairy Quality Assurance', 'Consulting', 42, 14000000.00, NULL, NULL, NULL, 'https://www.dairyqa.com', 'Quality control and compliance consulting', 2002, 'Sacramento', 'CA', 'United States', '916-555-6018'),
    (NEWID(), 'Cheese Marketing Agency', 'Marketing', 35, 10500000.00, NULL, NULL, NULL, 'https://www.cheesemarketingagency.com', 'Branding and marketing for cheese producers', 2009, 'New York', 'NY', 'United States', '212-555-6019'),
    (NEWID(), 'Dairy Processing Consultants', 'Consulting', 28, 8200000.00, NULL, NULL, NULL, 'https://www.dairyprocessing.com', 'Process optimization for cheesemakers', 2005, 'Portland', 'OR', 'United States', '503-555-6020'),
    (NEWID(), 'Cheese Label Design', 'Design Services', 15, 3500000.00, NULL, NULL, NULL, 'https://www.cheeselabeldesign.com', 'Custom label design for cheese brands', 2011, 'San Francisco', 'CA', 'United States', '415-555-6021'),
    (NEWID(), 'Dairy Wastewater Treatment', 'Environmental Services', 65, 24000000.00, NULL, NULL, NULL, 'https://www.dairywaste.com', 'Wastewater treatment for dairy plants', 1994, 'Columbus', 'OH', 'United States', '614-555-6022'),
    (NEWID(), 'Cheese Tasting Events Co.', 'Event Services', 12, 2800000.00, NULL, NULL, NULL, 'https://www.cheesetastingevents.com', 'Cheese tasting and education events', 2012, 'Napa', 'CA', 'United States', '707-555-6023'),
    (NEWID(), 'Dairy Insurance Group', 'Insurance', 52, 16000000.00, NULL, NULL, NULL, 'https://www.dairyinsurance.com', 'Specialized insurance for dairy operations', 1988, 'Des Moines', 'IA', 'United States', '515-555-6024'),
    (NEWID(), 'Cheese Cutting Equipment', 'Equipment', 48, 17000000.00, NULL, NULL, NULL, 'https://www.cheesecutting.com', 'Industrial cheese cutting machinery', 1997, 'Green Bay', 'WI', 'United States', '920-555-6025'),
    (NEWID(), 'Dairy Certification Services', 'Consulting', 38, 11500000.00, NULL, NULL, NULL, 'https://www.dairycert.com', 'Organic and specialty certification', 2006, 'Burlington', 'VT', 'United States', '802-555-6026'),
    (NEWID(), 'Cheese Photography Studio', 'Photography', 8, 1200000.00, NULL, NULL, NULL, 'https://www.cheesephotography.com', 'Professional food photography for cheese', 2013, 'Brooklyn', 'NY', 'United States', '718-555-6027'),
    (NEWID(), 'Dairy Farm Management Software', 'Software', 55, 18500000.00, NULL, NULL, NULL, 'https://www.dairyfarmsoft.com', 'Farm management and tracking software', 2004, 'Madison', 'WI', 'United States', '608-555-6028'),
    (NEWID(), 'Cheese Ecommerce Solutions', 'Software', 42, 14500000.00, NULL, NULL, NULL, 'https://www.cheeseecom.com', 'Online sales platform for cheese producers', 2010, 'Austin', 'TX', 'United States', '512-555-6029'),
    (NEWID(), 'Dairy Nutrition Research', 'Research', 32, 9200000.00, NULL, NULL, NULL, 'https://www.dairynutrition.com', 'Dairy nutrition and health research', 2007, 'Ithaca', 'NY', 'United States', '607-555-6030'),
    (NEWID(), 'Cheese Export Services', 'Logistics', 68, 28000000.00, NULL, NULL, NULL, 'https://www.cheeseexport.com', 'International cheese export and customs', 1991, 'Seattle', 'WA', 'United States', '206-555-6031'),
    (NEWID(), 'Dairy Breeding Services', 'Genetics', 45, 13500000.00, NULL, NULL, NULL, 'https://www.dairybreeding.com', 'Dairy cow genetics and breeding', 1986, 'Rochester', 'MN', 'United States', '507-555-6032'),
    (NEWID(), 'Cheese Education Institute', 'Education', 22, 6500000.00, NULL, NULL, NULL, 'https://www.cheeseedu.com', 'Cheesemaking courses and certifications', 2008, 'San Francisco', 'CA', 'United States', '415-555-6033'),
    (NEWID(), 'Dairy Financial Services', 'Financial Services', 38, 11000000.00, NULL, NULL, NULL, 'https://www.dairyfinancial.com', 'Lending and financing for dairy farms', 1995, 'Kansas City', 'MO', 'United States', '816-555-6034'),
    (NEWID(), 'Cheese Transport Logistics', 'Transportation', 125, 48000000.00, NULL, NULL, NULL, 'https://www.cheesetransport.com', 'Specialized refrigerated cheese transport', 1989, 'Memphis', 'TN', 'United States', '901-555-6035'),
    (NEWID(), 'Dairy Veterinary Services', 'Veterinary', 58, 19500000.00, NULL, NULL, NULL, 'https://www.dairyvet.com', 'Veterinary care for dairy herds', 1984, 'Tulare', 'CA', 'United States', '559-555-6036'),
    (NEWID(), 'Cheese Trade Association', 'Trade Association', 15, 4200000.00, NULL, NULL, NULL, 'https://www.cheesetrade.org', 'Industry advocacy and trade promotion', 1972, 'Washington', 'DC', 'United States', '202-555-6037'),
    (NEWID(), 'Dairy Energy Solutions', 'Energy Services', 48, 16500000.00, NULL, NULL, NULL, 'https://www.dairyenergy.com', 'Energy efficiency for dairy facilities', 2005, 'Indianapolis', 'IN', 'United States', '317-555-6038'),
    (NEWID(), 'Cheese Subscription Services', 'Ecommerce', 25, 7800000.00, NULL, NULL, NULL, 'https://www.cheesesubscription.com', 'Monthly cheese delivery subscriptions', 2014, 'Portland', 'OR', 'United States', '503-555-6039'),
    (NEWID(), 'Dairy Sustainability Advisors', 'Consulting', 32, 9800000.00, NULL, NULL, NULL, 'https://www.dairysustain.com', 'Sustainability consulting for dairy producers', 2010, 'Boulder', 'CO', 'United States', '720-555-6040');


-- ============================================================================
-- MEMBERS (2,000 Members)
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


-- Remaining 1,985 members generated programmatically with realistic distributions
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

-- Generate 1,985 additional members
INSERT INTO [AssociationDemo].[Member] (ID, Email, FirstName, LastName, Title, OrganizationID, Industry, JobFunction, YearsInProfession, JoinDate, City, State, Country)
SELECT TOP 1985
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
-- MEMBERSHIPS (2,500 records including renewals)
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


-- Generate memberships for all remaining members (2,483 more to reach 2,500)
-- 80% will be Active, 15% Lapsed, 5% Cancelled
-- 25% will have renewal history (multiple records)
DECLARE @MembershipTypeDistribution TABLE (TypeID UNIQUEIDENTIFIER, Probability INT);
INSERT INTO @MembershipTypeDistribution VALUES
    (@MembershipType_Individual, 60),      -- 60% Individual
    (@MembershipType_Student, 10),          -- 10% Student
    (@MembershipType_Corporate, 15),        -- 15% Corporate
    (@MembershipType_EarlyCareer, 10),      -- 10% Early Career
    (@MembershipType_Retired, 3),           -- 3% Retired
    (@MembershipType_International, 2);     -- 2% International

-- First membership for each remaining member (1,983 members = 1,983 records)
INSERT INTO [AssociationDemo].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
SELECT
    NEWID(),
    m.ID,
    -- Use weighted random selection based on cumulative probabilities
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 60 THEN @MembershipType_Individual
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 70 THEN @MembershipType_Student
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 85 THEN @MembershipType_Corporate
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 95 THEN @MembershipType_EarlyCareer
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 98 THEN @MembershipType_Retired
        ELSE @MembershipType_International
    END,
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
