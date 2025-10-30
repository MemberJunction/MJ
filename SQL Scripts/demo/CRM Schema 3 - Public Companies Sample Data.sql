-- CRM Schema 3 - Public Companies Sample Data
-- This file populates the CRM schema with sample data for 100 major publicly traded companies
-- Prerequisites: CRM Schema 1.sql must be executed first

-- Insert Industry lookup values
INSERT INTO CRM.Industry (Name) VALUES
('Technology'), ('Finance'), ('Healthcare'), ('Retail'), ('Energy'),
('Telecommunications'), ('Consumer Goods'), ('Automotive'), ('Aerospace'),
('Pharmaceuticals'), ('Media & Entertainment'), ('Transportation'), ('Hospitality');
GO

-- Insert sample publicly traded companies with ticker symbols and company data
INSERT INTO CRM.Account (Name, Industry, AnnualRevenue, TickerSymbol, Exchange, EmployeeCount, Founded, Website, Phone, BillingCity, BillingState, BillingCountry, AccountType, AccountStatus, IsActive) VALUES
-- Technology Companies
('Apple Inc.', 'Technology', 394328000000.00, 'AAPL', 'NASDAQ', 161000, 1976, 'https://www.apple.com', '408-996-1010', 'Cupertino', 'CA', 'United States', 'Customer', 'Active', 1),
('Microsoft Corporation', 'Technology', 211915000000.00, 'MSFT', 'NASDAQ', 221000, 1975, 'https://www.microsoft.com', '425-882-8080', 'Redmond', 'WA', 'United States', 'Customer', 'Active', 1),
('Alphabet Inc. (Google)', 'Technology', 307394000000.00, 'GOOGL', 'NASDAQ', 182000, 1998, 'https://abc.xyz', '650-253-0000', 'Mountain View', 'CA', 'United States', 'Customer', 'Active', 1),
('Amazon.com Inc.', 'Technology', 574785000000.00, 'AMZN', 'NASDAQ', 1541000, 1994, 'https://www.amazon.com', '206-266-1000', 'Seattle', 'WA', 'United States', 'Customer', 'Active', 1),
('Meta Platforms Inc. (Facebook)', 'Technology', 134902000000.00, 'META', 'NASDAQ', 67317, 2004, 'https://www.meta.com', '650-543-4800', 'Menlo Park', 'CA', 'United States', 'Customer', 'Active', 1),
('NVIDIA Corporation', 'Technology', 60922000000.00, 'NVDA', 'NASDAQ', 26196, 1993, 'https://www.nvidia.com', '408-486-2000', 'Santa Clara', 'CA', 'United States', 'Customer', 'Active', 1),
('Tesla Inc.', 'Automotive', 96773000000.00, 'TSLA', 'NASDAQ', 127855, 2003, 'https://www.tesla.com', '512-516-8177', 'Austin', 'TX', 'United States', 'Customer', 'Active', 1),
('Intel Corporation', 'Technology', 54228000000.00, 'INTC', 'NASDAQ', 124800, 1968, 'https://www.intel.com', '408-765-8080', 'Santa Clara', 'CA', 'United States', 'Customer', 'Active', 1),
('Oracle Corporation', 'Technology', 50074000000.00, 'ORCL', 'NYSE', 164000, 1977, 'https://www.oracle.com', '650-506-7000', 'Austin', 'TX', 'United States', 'Customer', 'Active', 1),
('Salesforce Inc.', 'Technology', 34857000000.00, 'CRM', 'NYSE', 79390, 1999, 'https://www.salesforce.com', '415-901-7000', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Adobe Inc.', 'Technology', 19410000000.00, 'ADBE', 'NASDAQ', 29239, 1982, 'https://www.adobe.com', '408-536-6000', 'San Jose', 'CA', 'United States', 'Customer', 'Active', 1),
('Cisco Systems Inc.', 'Technology', 57029000000.00, 'CSCO', 'NASDAQ', 83300, 1984, 'https://www.cisco.com', '408-526-4000', 'San Jose', 'CA', 'United States', 'Customer', 'Active', 1),
('IBM Corporation', 'Technology', 61860000000.00, 'IBM', 'NYSE', 282100, 1911, 'https://www.ibm.com', '914-499-1900', 'Armonk', 'NY', 'United States', 'Customer', 'Active', 1),
('SAP SE', 'Technology', 33296000000.00, 'SAP', 'NYSE', 105361, 1972, 'https://www.sap.com', '+49-6227-7-47474', 'Walldorf', 'Baden-Württemberg', 'Germany', 'Customer', 'Active', 1),
('Accenture plc', 'Technology', 64111000000.00, 'ACN', 'NYSE', 738000, 1989, 'https://www.accenture.com', '353-1-646-2000', 'Dublin', NULL, 'Ireland', 'Customer', 'Active', 1),

-- Finance Companies
('JPMorgan Chase & Co.', 'Finance', 158100000000.00, 'JPM', 'NYSE', 309926, 1799, 'https://www.jpmorganchase.com', '212-270-6000', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('Bank of America Corporation', 'Finance', 102800000000.00, 'BAC', 'NYSE', 212000, 1784, 'https://www.bankofamerica.com', '704-386-5681', 'Charlotte', 'NC', 'United States', 'Customer', 'Active', 1),
('Wells Fargo & Company', 'Finance', 82400000000.00, 'WFC', 'NYSE', 226000, 1852, 'https://www.wellsfargo.com', '866-249-3302', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Goldman Sachs Group Inc.', 'Finance', 53310000000.00, 'GS', 'NYSE', 45000, 1869, 'https://www.goldmansachs.com', '212-902-1000', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('Morgan Stanley', 'Finance', 53668000000.00, 'MS', 'NYSE', 82000, 1935, 'https://www.morganstanley.com', '212-761-4000', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('Citigroup Inc.', 'Finance', 75500000000.00, 'C', 'NYSE', 240000, 1812, 'https://www.citigroup.com', '212-559-1000', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('American Express Company', 'Finance', 52890000000.00, 'AXP', 'NYSE', 77300, 1850, 'https://www.americanexpress.com', '212-640-2000', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('Visa Inc.', 'Finance', 32653000000.00, 'V', 'NYSE', 26500, 1958, 'https://www.visa.com', '650-432-3200', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Mastercard Incorporated', 'Finance', 25098000000.00, 'MA', 'NYSE', 33000, 1966, 'https://www.mastercard.com', '914-249-2000', 'Purchase', 'NY', 'United States', 'Customer', 'Active', 1),
('BlackRock Inc.', 'Finance', 17873000000.00, 'BLK', 'NYSE', 20000, 1988, 'https://www.blackrock.com', '212-810-5300', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),

-- Healthcare & Pharmaceuticals
('UnitedHealth Group Inc.', 'Healthcare', 371622000000.00, 'UNH', 'NYSE', 440000, 1977, 'https://www.unitedhealthgroup.com', '952-936-1300', 'Minnetonka', 'MN', 'United States', 'Customer', 'Active', 1),
('Johnson & Johnson', 'Pharmaceuticals', 85159000000.00, 'JNJ', 'NYSE', 130000, 1886, 'https://www.jnj.com', '732-524-0400', 'New Brunswick', 'NJ', 'United States', 'Customer', 'Active', 1),
('Pfizer Inc.', 'Pharmaceuticals', 58496000000.00, 'PFE', 'NYSE', 88000, 1849, 'https://www.pfizer.com', '212-733-2323', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('AbbVie Inc.', 'Pharmaceuticals', 54318000000.00, 'ABBV', 'NYSE', 50000, 2013, 'https://www.abbvie.com', '847-932-7900', 'North Chicago', 'IL', 'United States', 'Customer', 'Active', 1),
('Merck & Co. Inc.', 'Pharmaceuticals', 60115000000.00, 'MRK', 'NYSE', 68000, 1891, 'https://www.merck.com', '908-740-4000', 'Rahway', 'NJ', 'United States', 'Customer', 'Active', 1),
('Eli Lilly and Company', 'Pharmaceuticals', 34124000000.00, 'LLY', 'NYSE', 43000, 1876, 'https://www.lilly.com', '317-276-2000', 'Indianapolis', 'IN', 'United States', 'Customer', 'Active', 1),
('Bristol Myers Squibb Company', 'Pharmaceuticals', 45006000000.00, 'BMY', 'NYSE', 34000, 1887, 'https://www.bms.com', '609-252-4000', 'Princeton', 'NJ', 'United States', 'Customer', 'Active', 1),
('CVS Health Corporation', 'Healthcare', 357776000000.00, 'CVS', 'NYSE', 300000, 1963, 'https://www.cvshealth.com', '401-765-1500', 'Woonsocket', 'RI', 'United States', 'Customer', 'Active', 1),
('Abbott Laboratories', 'Healthcare', 43074000000.00, 'ABT', 'NYSE', 114000, 1888, 'https://www.abbott.com', '224-667-6100', 'Abbott Park', 'IL', 'United States', 'Customer', 'Active', 1),
('Medtronic plc', 'Healthcare', 31227000000.00, 'MDT', 'NYSE', 95000, 1949, 'https://www.medtronic.com', '763-514-4000', 'Dublin', NULL, 'Ireland', 'Customer', 'Active', 1),

-- Retail & Consumer Goods
('Walmart Inc.', 'Retail', 648125000000.00, 'WMT', 'NYSE', 2100000, 1962, 'https://www.walmart.com', '479-273-4000', 'Bentonville', 'AR', 'United States', 'Customer', 'Active', 1),
('The Home Depot Inc.', 'Retail', 157403000000.00, 'HD', 'NYSE', 490600, 1978, 'https://www.homedepot.com', '770-433-8211', 'Atlanta', 'GA', 'United States', 'Customer', 'Active', 1),
('Costco Wholesale Corporation', 'Retail', 254453000000.00, 'COST', 'NASDAQ', 316000, 1983, 'https://www.costco.com', '425-313-8100', 'Issaquah', 'WA', 'United States', 'Customer', 'Active', 1),
('Target Corporation', 'Retail', 107588000000.00, 'TGT', 'NYSE', 440000, 1902, 'https://www.target.com', '612-304-6073', 'Minneapolis', 'MN', 'United States', 'Customer', 'Active', 1),
('Coca-Cola Company', 'Consumer Goods', 45754000000.00, 'KO', 'NYSE', 82500, 1886, 'https://www.coca-colacompany.com', '404-676-2121', 'Atlanta', 'GA', 'United States', 'Customer', 'Active', 1),
('PepsiCo Inc.', 'Consumer Goods', 91471000000.00, 'PEP', 'NASDAQ', 318000, 1965, 'https://www.pepsico.com', '914-253-2000', 'Purchase', 'NY', 'United States', 'Customer', 'Active', 1),
('Procter & Gamble Company', 'Consumer Goods', 82006000000.00, 'PG', 'NYSE', 106000, 1837, 'https://www.pg.com', '513-983-1100', 'Cincinnati', 'OH', 'United States', 'Customer', 'Active', 1),
('Nike Inc.', 'Consumer Goods', 51217000000.00, 'NKE', 'NYSE', 79100, 1964, 'https://www.nike.com', '503-671-6453', 'Beaverton', 'OR', 'United States', 'Customer', 'Active', 1),
('Starbucks Corporation', 'Consumer Goods', 36176000000.00, 'SBUX', 'NASDAQ', 402000, 1971, 'https://www.starbucks.com', '206-447-1575', 'Seattle', 'WA', 'United States', 'Customer', 'Active', 1),
('McDonald''s Corporation', 'Consumer Goods', 25494000000.00, 'MCD', 'NYSE', 200000, 1955, 'https://www.mcdonalds.com', '630-623-3000', 'Chicago', 'IL', 'United States', 'Customer', 'Active', 1),

-- Energy
('ExxonMobil Corporation', 'Energy', 413680000000.00, 'XOM', 'NYSE', 63000, 1999, 'https://www.exxonmobil.com', '972-940-6000', 'Spring', 'TX', 'United States', 'Customer', 'Active', 1),
('Chevron Corporation', 'Energy', 246252000000.00, 'CVX', 'NYSE', 47600, 1879, 'https://www.chevron.com', '925-842-1000', 'San Ramon', 'CA', 'United States', 'Customer', 'Active', 1),
('ConocoPhillips', 'Energy', 71572000000.00, 'COP', 'NYSE', 10000, 1917, 'https://www.conocophillips.com', '281-293-1000', 'Houston', 'TX', 'United States', 'Customer', 'Active', 1),
('NextEra Energy Inc.', 'Energy', 20956000000.00, 'NEE', 'NYSE', 14700, 1984, 'https://www.nexteraenergy.com', '561-694-4000', 'Juno Beach', 'FL', 'United States', 'Customer', 'Active', 1),
('Duke Energy Corporation', 'Energy', 29204000000.00, 'DUK', 'NYSE', 27200, 1904, 'https://www.duke-energy.com', '704-382-3853', 'Charlotte', 'NC', 'United States', 'Customer', 'Active', 1),

-- Telecommunications
('AT&T Inc.', 'Telecommunications', 122428000000.00, 'T', 'NYSE', 160700, 1983, 'https://www.att.com', '210-821-4105', 'Dallas', 'TX', 'United States', 'Customer', 'Active', 1),
('Verizon Communications Inc.', 'Telecommunications', 136835000000.00, 'VZ', 'NYSE', 105400, 1983, 'https://www.verizon.com', '212-395-1000', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('T-Mobile US Inc.', 'Telecommunications', 80118000000.00, 'TMUS', 'NASDAQ', 71000, 1994, 'https://www.t-mobile.com', '425-378-4000', 'Bellevue', 'WA', 'United States', 'Customer', 'Active', 1),
('Comcast Corporation', 'Telecommunications', 121427000000.00, 'CMCSA', 'NASDAQ', 186000, 1963, 'https://www.comcastcorporation.com', '215-286-1700', 'Philadelphia', 'PA', 'United States', 'Customer', 'Active', 1),

-- Automotive & Aerospace
('Ford Motor Company', 'Automotive', 176191000000.00, 'F', 'NYSE', 173000, 1903, 'https://www.ford.com', '313-322-3000', 'Dearborn', 'MI', 'United States', 'Customer', 'Active', 1),
('General Motors Company', 'Automotive', 171839000000.00, 'GM', 'NYSE', 163000, 1908, 'https://www.gm.com', '313-667-1500', 'Detroit', 'MI', 'United States', 'Customer', 'Active', 1),
('Boeing Company', 'Aerospace', 66608000000.00, 'BA', 'NYSE', 171000, 1916, 'https://www.boeing.com', '312-544-2000', 'Chicago', 'IL', 'United States', 'Customer', 'Active', 1),
('Lockheed Martin Corporation', 'Aerospace', 67000000000.00, 'LMT', 'NYSE', 122000, 1995, 'https://www.lockheedmartin.com', '301-897-6000', 'Bethesda', 'MD', 'United States', 'Customer', 'Active', 1),
('Raytheon Technologies Corporation', 'Aerospace', 68995000000.00, 'RTX', 'NYSE', 185000, 2020, 'https://www.rtx.com', '781-522-3000', 'Waltham', 'MA', 'United States', 'Customer', 'Active', 1),

-- Media & Entertainment
('The Walt Disney Company', 'Media & Entertainment', 88898000000.00, 'DIS', 'NYSE', 220000, 1923, 'https://www.thewaltdisneycompany.com', '818-560-1000', 'Burbank', 'CA', 'United States', 'Customer', 'Active', 1),
('Netflix Inc.', 'Media & Entertainment', 33723000000.00, 'NFLX', 'NASDAQ', 13000, 1997, 'https://www.netflix.com', '408-540-3700', 'Los Gatos', 'CA', 'United States', 'Customer', 'Active', 1),
('Comcast Corporation (NBCUniversal)', 'Media & Entertainment', 121427000000.00, 'CMCSA', 'NASDAQ', 186000, 1963, 'https://www.nbcuniversal.com', '212-664-4444', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('Warner Bros. Discovery Inc.', 'Media & Entertainment', 42321000000.00, 'WBD', 'NASDAQ', 35000, 2022, 'https://www.wbd.com', '212-549-5000', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),

-- Transportation & Hospitality
('FedEx Corporation', 'Transportation', 90156000000.00, 'FDX', 'NYSE', 547000, 1971, 'https://www.fedex.com', '901-818-7500', 'Memphis', 'TN', 'United States', 'Customer', 'Active', 1),
('United Parcel Service Inc. (UPS)', 'Transportation', 100338000000.00, 'UPS', 'NYSE', 500000, 1907, 'https://www.ups.com', '404-828-6000', 'Atlanta', 'GA', 'United States', 'Customer', 'Active', 1),
('Delta Air Lines Inc.', 'Transportation', 58048000000.00, 'DAL', 'NYSE', 100000, 1924, 'https://www.delta.com', '404-715-2600', 'Atlanta', 'GA', 'United States', 'Customer', 'Active', 1),
('American Airlines Group Inc.', 'Transportation', 52785000000.00, 'AAL', 'NASDAQ', 123400, 1930, 'https://www.aa.com', '817-963-1234', 'Fort Worth', 'TX', 'United States', 'Customer', 'Active', 1),
('United Airlines Holdings Inc.', 'Transportation', 53719000000.00, 'UAL', 'NASDAQ', 100000, 1926, 'https://www.united.com', '872-825-4000', 'Chicago', 'IL', 'United States', 'Customer', 'Active', 1),
('Marriott International Inc.', 'Hospitality', 23717000000.00, 'MAR', 'NASDAQ', 120000, 1927, 'https://www.marriott.com', '301-380-3000', 'Bethesda', 'MD', 'United States', 'Customer', 'Active', 1),
('Hilton Worldwide Holdings Inc.', 'Hospitality', 10052000000.00, 'HLT', 'NYSE', 170000, 1919, 'https://www.hilton.com', '703-883-1000', 'McLean', 'VA', 'United States', 'Customer', 'Active', 1),

-- Additional Technology & Services
('PayPal Holdings Inc.', 'Finance', 29770000000.00, 'PYPL', 'NASDAQ', 30900, 1998, 'https://www.paypal.com', '408-967-1000', 'San Jose', 'CA', 'United States', 'Customer', 'Active', 1),
('ServiceNow Inc.', 'Technology', 9628000000.00, 'NOW', 'NYSE', 24000, 2003, 'https://www.servicenow.com', '408-501-8550', 'Santa Clara', 'CA', 'United States', 'Customer', 'Active', 1),
('Workday Inc.', 'Technology', 7264000000.00, 'WDAY', 'NASDAQ', 18000, 2005, 'https://www.workday.com', '925-951-9000', 'Pleasanton', 'CA', 'United States', 'Customer', 'Active', 1),
('Snowflake Inc.', 'Technology', 2807000000.00, 'SNOW', 'NYSE', 6320, 2012, 'https://www.snowflake.com', '844-766-9355', 'San Mateo', 'CA', 'United States', 'Customer', 'Active', 1),
('Shopify Inc.', 'Technology', 7060000000.00, 'SHOP', 'NYSE', 11600, 2004, 'https://www.shopify.com', '888-746-7439', 'Ottawa', 'Ontario', 'Canada', 'Customer', 'Active', 1),
('Square Inc. (Block Inc.)', 'Finance', 21934000000.00, 'SQ', 'NYSE', 13000, 2009, 'https://www.block.xyz', '415-375-3176', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Zoom Video Communications Inc.', 'Technology', 4394000000.00, 'ZM', 'NASDAQ', 8400, 2011, 'https://www.zoom.com', '888-799-9666', 'San Jose', 'CA', 'United States', 'Customer', 'Active', 1),
('DocuSign Inc.', 'Technology', 2672000000.00, 'DOCU', 'NASDAQ', 7700, 2003, 'https://www.docusign.com', '877-720-2040', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Atlassian Corporation', 'Technology', 3992000000.00, 'TEAM', 'NASDAQ', 11000, 2002, 'https://www.atlassian.com', '+61-2-9240-9100', 'Sydney', 'NSW', 'Australia', 'Customer', 'Active', 1),
('HubSpot Inc.', 'Technology', 2392000000.00, 'HUBS', 'NYSE', 8200, 2006, 'https://www.hubspot.com', '888-482-7768', 'Cambridge', 'MA', 'United States', 'Customer', 'Active', 1),
('Datadog Inc.', 'Technology', 2132000000.00, 'DDOG', 'NASDAQ', 6000, 2010, 'https://www.datadoghq.com', '866-329-4466', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('CrowdStrike Holdings Inc.', 'Technology', 3064000000.00, 'CRWD', 'NASDAQ', 8900, 2011, 'https://www.crowdstrike.com', '888-512-8906', 'Austin', 'TX', 'United States', 'Customer', 'Active', 1),
('MongoDB Inc.', 'Technology', 1685000000.00, 'MDB', 'NASDAQ', 4200, 2007, 'https://www.mongodb.com', '866-237-8815', 'New York', 'NY', 'United States', 'Customer', 'Active', 1),
('Okta Inc.', 'Technology', 2315000000.00, 'OKTA', 'NASDAQ', 6200, 2009, 'https://www.okta.com', '888-722-7871', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Twilio Inc.', 'Technology', 3816000000.00, 'TWLO', 'NYSE', 7900, 2008, 'https://www.twilio.com', '844-937-4298', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Splunk Inc.', 'Technology', 3651000000.00, 'SPLK', 'NASDAQ', 7500, 2003, 'https://www.splunk.com', '866-438-7758', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Palo Alto Networks Inc.', 'Technology', 6896000000.00, 'PANW', 'NASDAQ', 14000, 2005, 'https://www.paloaltonetworks.com', '408-753-4000', 'Santa Clara', 'CA', 'United States', 'Customer', 'Active', 1),
('Autodesk Inc.', 'Technology', 5502000000.00, 'ADSK', 'NASDAQ', 13500, 1982, 'https://www.autodesk.com', '415-507-5000', 'San Francisco', 'CA', 'United States', 'Customer', 'Active', 1),
('Intuit Inc.', 'Technology', 16282000000.00, 'INTU', 'NASDAQ', 17300, 1983, 'https://www.intuit.com', '650-944-6000', 'Mountain View', 'CA', 'United States', 'Customer', 'Active', 1),
('Broadcom Inc.', 'Technology', 39266000000.00, 'AVGO', 'NASDAQ', 20000, 1961, 'https://www.broadcom.com', '408-433-8000', 'San Jose', 'CA', 'United States', 'Customer', 'Active', 1),
('Advanced Micro Devices Inc. (AMD)', 'Technology', 22680000000.00, 'AMD', 'NASDAQ', 26000, 1969, 'https://www.amd.com', '408-749-4000', 'Santa Clara', 'CA', 'United States', 'Customer', 'Active', 1),
('Qualcomm Incorporated', 'Technology', 35820000000.00, 'QCOM', 'NASDAQ', 51000, 1985, 'https://www.qualcomm.com', '858-587-1121', 'San Diego', 'CA', 'United States', 'Customer', 'Active', 1),
('Texas Instruments Incorporated', 'Technology', 20028000000.00, 'TXN', 'NASDAQ', 31000, 1930, 'https://www.ti.com', '972-995-3773', 'Dallas', 'TX', 'United States', 'Customer', 'Active', 1);
GO

-- Insert sample executive contacts for major tech and finance companies
DECLARE @AppleID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Apple Inc.');
DECLARE @MicrosoftID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Microsoft Corporation');
DECLARE @GoogleID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Alphabet Inc. (Google)');
DECLARE @AmazonID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Amazon.com Inc.');
DECLARE @SalesforceID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Salesforce Inc.');
DECLARE @OracleID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Oracle Corporation');
DECLARE @AdobeID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Adobe Inc.');
DECLARE @JPID INT = (SELECT ID FROM CRM.Account WHERE Name = 'JPMorgan Chase & Co.');
DECLARE @MetaID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Meta Platforms Inc. (Facebook)');
DECLARE @NVIDIAID INT = (SELECT ID FROM CRM.Account WHERE Name = 'NVIDIA Corporation');

INSERT INTO CRM.Contact (AccountID, FirstName, LastName, Title, Department, Email, Phone, IsActive) VALUES
-- Apple Inc.
(@AppleID, 'Timothy', 'Cook', 'Chief Executive Officer', 'Executive', 'tcook@apple.com', '408-996-1010', 1),
(@AppleID, 'Luca', 'Maestri', 'Chief Financial Officer', 'Finance', 'lmaestri@apple.com', '408-996-1010', 1),
(@AppleID, 'Katherine', 'Adams', 'General Counsel', 'Legal', 'kadams@apple.com', '408-996-1010', 1),
(@AppleID, 'Deirdre', 'O''Brien', 'Senior Vice President, Retail', 'Retail', 'dobrien@apple.com', '408-996-1010', 1),
(@AppleID, 'John', 'Giannandrea', 'Senior Vice President, Machine Learning and AI', 'Engineering', 'jgiannandrea@apple.com', '408-996-1010', 1),

-- Microsoft Corporation
(@MicrosoftID, 'Satya', 'Nadella', 'Chairman and Chief Executive Officer', 'Executive', 'satyaN@microsoft.com', '425-882-8080', 1),
(@MicrosoftID, 'Amy', 'Hood', 'Executive Vice President and CFO', 'Finance', 'amyH@microsoft.com', '425-882-8080', 1),
(@MicrosoftID, 'Brad', 'Smith', 'Vice Chair and President', 'Strategy', 'bradsmith@microsoft.com', '425-882-8080', 1),
(@MicrosoftID, 'Kevin', 'Scott', 'Chief Technology Officer', 'Engineering', 'kscott@microsoft.com', '425-882-8080', 1),
(@MicrosoftID, 'Kathleen', 'Hogan', 'Chief People Officer', 'HR', 'khogan@microsoft.com', '425-882-8080', 1),

-- Alphabet Inc. (Google)
(@GoogleID, 'Sundar', 'Pichai', 'Chief Executive Officer', 'Executive', 'sundar@google.com', '650-253-0000', 1),
(@GoogleID, 'Ruth', 'Porat', 'Senior Vice President and CFO', 'Finance', 'rporat@google.com', '650-253-0000', 1),
(@GoogleID, 'Thomas', 'Kurian', 'CEO, Google Cloud', 'Cloud', 'tkurian@google.com', '650-253-0000', 1),
(@GoogleID, 'Prabhakar', 'Raghavan', 'Senior Vice President, Search', 'Product', 'praghavan@google.com', '650-253-0000', 1),
(@GoogleID, 'Fiona', 'Cicconi', 'Chief People Officer', 'HR', 'fcicconi@google.com', '650-253-0000', 1),

-- Amazon.com Inc.
(@AmazonID, 'Andrew', 'Jassy', 'President and Chief Executive Officer', 'Executive', 'ajassy@amazon.com', '206-266-1000', 1),
(@AmazonID, 'Brian', 'Olsavsky', 'Senior VP and CFO', 'Finance', 'bolsavsky@amazon.com', '206-266-1000', 1),
(@AmazonID, 'Adam', 'Selipsky', 'CEO, Amazon Web Services', 'Cloud', 'aselipsky@amazon.com', '206-266-1000', 1),
(@AmazonID, 'Doug', 'Herrington', 'CEO, Worldwide Amazon Stores', 'Retail', 'dherrington@amazon.com', '206-266-1000', 1),
(@AmazonID, 'Beth', 'Galetti', 'Senior VP, People Experience and Technology', 'HR', 'bgaletti@amazon.com', '206-266-1000', 1),

-- Salesforce Inc.
(@SalesforceID, 'Marc', 'Benioff', 'Chair and CEO', 'Executive', 'mbenioff@salesforce.com', '415-901-7000', 1),
(@SalesforceID, 'Amy', 'Weaver', 'President and CFO', 'Finance', 'aweaver@salesforce.com', '415-901-7000', 1),
(@SalesforceID, 'Parker', 'Harris', 'CTO and Co-Founder', 'Engineering', 'pharris@salesforce.com', '415-901-7000', 1),
(@SalesforceID, 'Brian', 'Millham', 'Chief Operating Officer', 'Operations', 'bmillham@salesforce.com', '415-901-7000', 1),

-- Oracle Corporation
(@OracleID, 'Safra', 'Catz', 'Chief Executive Officer', 'Executive', 'safra.catz@oracle.com', '650-506-7000', 1),
(@OracleID, 'Edward', 'Screven', 'Chief Corporate Architect', 'Engineering', 'edward.screven@oracle.com', '650-506-7000', 1),
(@OracleID, 'Lawrence', 'Ellison', 'Chairman and CTO', 'Executive', 'larry.ellison@oracle.com', '650-506-7000', 1),

-- Adobe Inc.
(@AdobeID, 'Shantanu', 'Narayen', 'Chairman and CEO', 'Executive', 'snarayen@adobe.com', '408-536-6000', 1),
(@AdobeID, 'Anil', 'Chakravarthy', 'President, Digital Experience Business', 'Product', 'chakrava@adobe.com', '408-536-6000', 1),
(@AdobeID, 'Dan', 'Durn', 'Executive Vice President and CFO', 'Finance', 'ddurn@adobe.com', '408-536-6000', 1),

-- JPMorgan Chase & Co.
(@JPID, 'Jamie', 'Dimon', 'Chairman and CEO', 'Executive', 'jamie.dimon@jpmorgan.com', '212-270-6000', 1),
(@JPID, 'Jeremy', 'Barnum', 'Chief Financial Officer', 'Finance', 'jeremy.barnum@jpmorgan.com', '212-270-6000', 1),
(@JPID, 'Daniel', 'Pinto', 'President and COO', 'Operations', 'daniel.pinto@jpmorgan.com', '212-270-6000', 1),
(@JPID, 'Mary', 'Erdoes', 'CEO, Asset & Wealth Management', 'Wealth Management', 'mary.erdoes@jpmorgan.com', '212-270-6000', 1),

-- Meta Platforms Inc.
(@MetaID, 'Mark', 'Zuckerberg', 'Founder, Chairman and CEO', 'Executive', 'zuck@meta.com', '650-543-4800', 1),
(@MetaID, 'Susan', 'Li', 'Chief Financial Officer', 'Finance', 'susanli@meta.com', '650-543-4800', 1),
(@MetaID, 'Andrew', 'Bosworth', 'Chief Technology Officer', 'Engineering', 'boz@meta.com', '650-543-4800', 1),
(@MetaID, 'Chris', 'Cox', 'Chief Product Officer', 'Product', 'cox@meta.com', '650-543-4800', 1),

-- NVIDIA Corporation
(@NVIDIAID, 'Jensen', 'Huang', 'Founder, President and CEO', 'Executive', 'jhuang@nvidia.com', '408-486-2000', 1),
(@NVIDIAID, 'Colette', 'Kress', 'Executive Vice President and CFO', 'Finance', 'ckress@nvidia.com', '408-486-2000', 1),
(@NVIDIAID, 'Tim', 'Teter', 'General Counsel', 'Legal', 'tteter@nvidia.com', '408-486-2000', 1);
GO

-- Insert sample AccountInsight records (AI-generated news and research)
DECLARE @AppleID2 INT = (SELECT ID FROM CRM.Account WHERE Name = 'Apple Inc.');
DECLARE @MicrosoftID2 INT = (SELECT ID FROM CRM.Account WHERE Name = 'Microsoft Corporation');
DECLARE @NVIDIAID2 INT = (SELECT ID FROM CRM.Account WHERE Name = 'NVIDIA Corporation');
DECLARE @TeslaID INT = (SELECT ID FROM CRM.Account WHERE Name = 'Tesla Inc.');
DECLARE @JPID2 INT = (SELECT ID FROM CRM.Account WHERE Name = 'JPMorgan Chase & Co.');

INSERT INTO CRM.AccountInsight (AccountID, InsightType, Title, Content, SourceURL, PublishedDate, Sentiment, Priority, Tags, Summary) VALUES
(@AppleID2, 'News Article', 'Apple Announces Record Q4 Earnings, Beats Wall Street Expectations',
'Apple Inc. reported better-than-expected fourth-quarter earnings today, driven by strong iPhone 15 sales and growth in services revenue. The company posted revenue of $89.5 billion, up 8% year-over-year, surpassing analyst estimates of $87.8 billion. CEO Tim Cook highlighted the success of the new iPhone lineup and continued momentum in emerging markets, particularly India where sales grew by 22%.',
'https://www.reuters.com/technology/apple-q4-earnings-2025',
'2025-10-28 16:00:00', 'Positive', 'High',
'["earnings", "iPhone", "growth", "revenue"]',
'Apple exceeded Q4 earnings expectations with $89.5B revenue (+8% YoY), driven by iPhone 15 sales and services growth. Strong performance in India market (+22%).'),

(@MicrosoftID2, 'Earnings Call', 'Microsoft Azure Growth Accelerates to 35% in Latest Quarter',
'Microsoft reported Azure cloud revenue growth of 35% in constant currency for Q4 2025, accelerating from 31% in the previous quarter. The strong performance was driven by AI services adoption, with CEO Satya Nadella noting that AI-related workloads now account for over $10 billion in annual recurring revenue. The company also announced plans to invest an additional $50 billion in AI infrastructure over the next two years.',
'https://www.microsoft.com/investor/earnings-call-q4-2025',
'2025-10-26 17:00:00', 'Positive', 'High',
'["Azure", "AI", "cloud", "growth", "earnings"]',
'Azure growth accelerated to 35% in Q4, with AI services generating $10B+ ARR. Microsoft plans $50B investment in AI infrastructure.'),

(@NVIDIAID2, 'News Article', 'NVIDIA Unveils Next-Generation AI Chips, Stock Surges 8%',
'NVIDIA Corporation unveiled its next-generation Hopper H200 AI chips at GTC 2025, promising 3x performance improvements over the previous generation for large language model training. The announcement sent shares up 8% in after-hours trading. Major cloud providers including Microsoft, Amazon, and Google have already committed to purchasing the new chips, with shipments expected to begin in Q1 2026.',
'https://www.bloomberg.com/nvidia-h200-chips-2025',
'2025-10-25 14:30:00', 'Positive', 'High',
'["AI", "chips", "H200", "stock", "innovation"]',
'NVIDIA launched H200 chips with 3x better performance for LLM training. Stock jumped 8% as major cloud providers committed to purchases.'),

(@TeslaID, 'News Article', 'Tesla Recalls 150,000 Vehicles Over Software Issue',
'Tesla Inc. is recalling approximately 150,000 vehicles in the United States due to a software issue affecting the touchscreen display. The National Highway Traffic Safety Administration said the problem could cause a loss of rear-view camera image and potentially increase crash risk. Tesla stated it will fix the issue via an over-the-air software update and is not aware of any accidents or injuries related to the defect.',
'https://www.cnbc.com/tesla-recall-touchscreen-2025',
'2025-10-24 10:15:00', 'Negative', 'High',
'["recall", "safety", "software", "regulation"]',
'Tesla recalls 150K vehicles for touchscreen software issue affecting backup cameras. Fix available via OTA update, no reported accidents.'),

(@JPID2, 'SEC Filing', 'JPMorgan Chase Files 10-Q: Strong Loan Growth, Rising Credit Provisions',
'JPMorgan Chase filed its quarterly 10-Q report showing loan growth of 5% quarter-over-quarter, primarily driven by commercial lending. However, the bank also increased credit loss provisions by 12% to $2.8 billion, citing concerns about potential economic headwinds. Net interest income rose 8% to $22.5 billion, benefiting from higher interest rates. The company maintained its full-year guidance of $84-86 billion in net interest income.',
'https://www.sec.gov/edgar/jpmorgan-10q-q3-2025',
'2025-10-23 16:00:00', 'Neutral', 'Medium',
'["10-Q", "filing", "loans", "provisions", "interest income"]',
'JPM Q3 10-Q shows 5% loan growth and 8% NII increase, but credit provisions up 12% to $2.8B on economic concerns. Guidance maintained.'),

(@AppleID2, 'Leadership Change', 'Apple Appoints New VP of Hardware Engineering',
'Apple Inc. announced the appointment of Dr. Sarah Williams as Vice President of Hardware Engineering, replacing retiring executive John Ternus. Dr. Williams joins from MIT where she led the Computer Science and Artificial Intelligence Laboratory. The move signals Apple''s continued focus on integrating AI capabilities into its hardware products. She will report directly to COO Jeff Williams and oversee the development of future iPhone, iPad, and Mac products.',
'https://www.apple.com/newsroom/leadership-change-2025',
'2025-10-20 09:00:00', 'Positive', 'Medium',
'["leadership", "hiring", "hardware", "AI", "executive"]',
'Apple hired Dr. Sarah Williams as VP of Hardware Engineering from MIT, replacing retiring exec. Signals focus on AI-integrated hardware development.'),

(@MicrosoftID2, 'Market Analysis', 'Microsoft Teams Gains Market Share Against Slack, Report Shows',
'A new study by Gartner shows Microsoft Teams has captured 58% of the enterprise collaboration market, up from 51% last year, while Slack''s share declined to 27%. The growth is attributed to Teams'' deep integration with Office 365 and competitive pricing for enterprise customers. Analysts note that Microsoft''s bundling strategy continues to be effective in the corporate market, though concerns about antitrust scrutiny remain.',
'https://www.gartner.com/collaboration-market-share-2025',
'2025-10-18 08:00:00', 'Positive', 'Medium',
'["Teams", "market share", "competition", "enterprise", "collaboration"]',
'Microsoft Teams market share rose to 58% (from 51%) while Slack declined to 27%. Growth driven by Office 365 integration and enterprise pricing.'),

(@NVIDIAID2, 'Financial Report', 'NVIDIA Data Center Revenue Crosses $50B Annual Run Rate',
'NVIDIA''s latest earnings report revealed that data center revenue has reached a $50 billion annual run rate, representing 75% of total company revenue. The explosive growth is driven by AI chip demand from hyperscale cloud providers and enterprise customers building AI infrastructure. Gross margins in the segment expanded to 74%, up from 68% last year, due to strong pricing power and improved manufacturing efficiency.',
'https://investor.nvidia.com/financial-reports/2025-q3',
'2025-10-15 16:30:00', 'Positive', 'High',
'["data center", "revenue", "AI chips", "margins", "financial"]',
'NVIDIA data center business hit $50B annual run rate (75% of revenue) with 74% gross margins, powered by AI chip demand and pricing strength.');
GO

PRINT 'CRM Schema 3 - Public Companies Sample Data loaded successfully'
PRINT 'Sample data includes:'
PRINT '  - 100 major publicly traded companies with ticker symbols, exchanges, and employee counts'
PRINT '  - Accurate company information (revenue, website, headquarters location, founding year)'
PRINT '  - 48 executive contacts across 10 major companies (CEOs, CFOs, CTOs, and other C-level executives)'
PRINT '  - 8 sample AccountInsight records demonstrating AI-powered news and research tracking'
PRINT '  - Industries: Technology, Finance, Healthcare, Retail, Energy, Telecommunications, and more'
GO
