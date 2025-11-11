/******************************************************************************
 * Association Sample Database - Legislative Tracking Data
 * File: 11_legislative_tracking_data.sql
 *
 * Populates the Legislative Tracking & Advocacy domain with realistic data
 * for a cheese industry association including federal and state legislative
 * bodies, bills, regulations, policy positions, government contacts,
 * advocacy actions, and regulatory comments.
 *
 * Data includes:
 * - Legislative bodies (Congress, FDA, state legislatures)
 * - Legislative issues (food safety, labeling, raw milk, trade)
 * - Policy positions on key issues
 * - Government contacts (legislators, regulators)
 * - Member advocacy actions
 * - Regulatory comments submitted
 ******************************************************************************/

USE AssociationDB2;
GO

DECLARE @EndDate DATE = GETDATE();

-- ============================================================================
-- LEGISLATIVE BODIES
-- ============================================================================

PRINT 'Populating Legislative Bodies...';

INSERT INTO [AssociationDemo].[LegislativeBody]
    ([ID], [Name], [BodyType], [Level], [State], [Country], [Description], [Website], [IsActive])
VALUES
    -- Federal Bodies
    ('D9ACFADB-D0E5-4383-8EAA-68C5632F761B', 'United States Senate', 'Federal Congress', 'Federal', NULL, 'United States',
     'Upper chamber of the United States Congress', 'https://www.senate.gov', 1),
    ('E48246E6-7B0D-4ACD-B506-8BAA2467C7B9', 'United States House of Representatives', 'Federal Congress', 'Federal', NULL, 'United States',
     'Lower chamber of the United States Congress', 'https://www.house.gov', 1),
    ('D04DFA9B-74B1-496C-938D-99384AC91563', 'Food and Drug Administration', 'Federal Agency', 'Federal', NULL, 'United States',
     'Federal agency responsible for food safety and labeling regulations', 'https://www.fda.gov', 1),
    ('97EB5AB3-E2B4-4B9F-A75D-BD56D3989154', 'U.S. Department of Agriculture', 'Federal Agency', 'Federal', NULL, 'United States',
     'Federal agency overseeing agricultural policy and dairy pricing', 'https://www.usda.gov', 1),

    -- State Bodies (Wisconsin - major dairy state)
    ('33177B28-2203-4548-9F56-9EA8D82FB3E7', 'Wisconsin State Senate', 'State Legislature', 'State', 'WI', 'United States',
     'Upper chamber of Wisconsin Legislature', 'https://legis.wisconsin.gov/senate', 1),
    ('164B4BC2-D7EB-4115-A110-90D0565DBA74', 'Wisconsin State Assembly', 'State Legislature', 'State', 'WI', 'United States',
     'Lower chamber of Wisconsin Legislature', 'https://legis.wisconsin.gov/assembly', 1),
    ('A3708D4C-7D18-4BD0-B63A-5FC0EC6D9BB6', 'Wisconsin Department of Agriculture', 'State Agency', 'State', 'WI', 'United States',
     'State agency regulating dairy and cheese production', 'https://datcp.wi.gov', 1),

    -- State Bodies (California - large dairy state)
    ('C13E8584-2251-4F00-BD67-028A8CFAA846', 'California State Senate', 'State Legislature', 'State', 'CA', 'United States',
     'Upper chamber of California Legislature', 'https://www.senate.ca.gov', 1),
    ('E6ED0401-D6AF-47B3-A365-0EFF27CD2C97', 'California State Assembly', 'State Legislature', 'State', 'CA', 'United States',
     'Lower chamber of California Legislature', 'https://www.assembly.ca.gov', 1),

    -- State Bodies (Vermont - artisan cheese)
    ('F8AB41C1-D72B-4E0F-9D1F-367148614044', 'Vermont General Assembly', 'State Legislature', 'State', 'VT', 'United States',
     'Vermont state legislature', 'https://legislature.vermont.gov', 1);
GO

-- ============================================================================
-- LEGISLATIVE ISSUES
-- ============================================================================

PRINT 'Populating Legislative Issues...';

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

INSERT INTO [AssociationDemo].[LegislativeIssue]
    ([ID], [LegislativeBodyID], [Title], [IssueType], [BillNumber], [Status], [IntroducedDate], [LastActionDate],
     [Summary], [ImpactLevel], [ImpactDescription], [Category], [Sponsor], [IsActive])
VALUES
    -- Federal Issues
    ('FCB4704A-351B-49E0-9A69-99B87F0B2FC8', 'E48246E6-7B0D-4ACD-B506-8BAA2467C7B9',
     'Food Labeling Modernization Act', 'Bill', 'H.R. 1547',
     'In Committee', DATEADD(MONTH, -8, @EndDate), DATEADD(DAY, -45, @EndDate),
     'Comprehensive update to food labeling requirements including origin labeling for dairy products and standardized cheese classifications',
     'High', 'Would require updated labeling on all cheese products, affecting packaging costs and compliance',
     'Labeling', 'Rep. Agriculture Committee', 1),

    ('9D65FEA4-C804-427E-882F-6D9213CA77A8', 'D04DFA9B-74B1-496C-938D-99384AC91563',
     'Raw Milk Cheese Aging Requirements', 'Regulation', '21 CFR 133',
     'Comment Period', DATEADD(MONTH, -4, @EndDate), DATEADD(DAY, -15, @EndDate),
     'Proposed rule to extend mandatory aging period for raw milk cheese from 60 to 90 days',
     'Critical', 'Would significantly impact artisan cheesemakers and traditional cheese varieties',
     'Food Safety', 'FDA Center for Food Safety', 1),

    ('166CD14E-655E-4664-BB1B-13C4EC475866', 'D9ACFADB-D0E5-4383-8EAA-68C5632F761B',
     'Dairy Pricing Reform Act', 'Bill', 'S. 729',
     'Passed Committee', DATEADD(MONTH, -11, @EndDate), DATEADD(DAY, -30, @EndDate),
     'Reform of federal milk pricing system to provide more stability for dairy producers',
     'High', 'Changes to milk pricing could affect cheese production costs',
     'Dairy Pricing', 'Sen. Agricultural Committee Chair', 1),

    ('50825E24-EA49-4608-8B03-1BB2FEA48AE0', '97EB5AB3-E2B4-4B9F-A75D-BD56D3989154',
     'Organic Dairy Standards Update', 'Rule', 'USDA-AMS-2025-0012',
     'Final Rule', DATEADD(MONTH, -2, @EndDate), DATEADD(DAY, -5, @EndDate),
     'Updated organic certification standards for dairy operations including pasture requirements',
     'Medium', 'Affects organic cheese producers and certification costs',
     'Organic Standards', 'USDA Agricultural Marketing Service', 1),

    ('0D11A907-4E12-4692-86C0-15926EED0919', 'E48246E6-7B0D-4ACD-B506-8BAA2467C7B9',
     'Import Cheese Tariff Reduction', 'Bill', 'H.R. 2893',
     'Introduced', DATEADD(MONTH, -3, @EndDate), DATEADD(DAY, -20, @EndDate),
     'Reduction of tariffs on imported European cheeses as part of trade agreement',
     'Critical', 'Could increase competition from imported cheeses, affecting domestic producers',
     'Import/Export', 'Rep. Ways and Means Committee', 1),

    ('17E46884-1BC4-4E26-B051-E24FD466F0BD', 'D04DFA9B-74B1-496C-938D-99384AC91563',
     'Listeria Control in Cheese Production', 'Regulation', '21 CFR 117',
     'Enacted', DATEADD(MONTH, -6, @EndDate), DATEADD(DAY, -60, @EndDate),
     'Enhanced environmental monitoring and control measures for Listeria in cheese facilities',
     'High', 'Requires additional testing and environmental controls, increasing compliance costs',
     'Food Safety', 'FDA', 1),

    -- Wisconsin State Issues
    ('107366AC-B8A3-4BF4-8789-6CD88EA08EFE', '33177B28-2203-4548-9F56-9EA8D82FB3E7',
     'Wisconsin Raw Milk Sales Expansion', 'Bill', 'SB 145',
     'Passed Senate', DATEADD(MONTH, -5, @EndDate), DATEADD(DAY, -25, @EndDate),
     'Allows direct-to-consumer sales of raw milk for cheesemaking from licensed facilities',
     'Medium', 'Expands market for artisan cheesemakers using raw milk',
     'Raw Milk', 'Sen. District 14', 1),

    ('1CDCC8E1-8C29-468D-9C1E-E78F264CA417', '164B4BC2-D7EB-4115-A110-90D0565DBA74',
     'Master Cheesemaker Program Funding', 'Bill', 'AB 287',
     'Signed', DATEADD(MONTH, -9, @EndDate), DATEADD(DAY, -90, @EndDate),
     'Increased state funding for Wisconsin Master Cheesemaker certification program',
     'Medium', 'Expands training opportunities and promotes Wisconsin cheese industry',
     'Other', 'Rep. Assembly Agriculture Committee', 1),

    ('75D58C2A-8BBB-43EE-9647-5320E95BC90E', 'A3708D4C-7D18-4BD0-B63A-5FC0EC6D9BB6',
     'Dairy Farm Environmental Standards', 'Regulation', 'WI ATCP 51',
     'Comment Period', DATEADD(MONTH, -2, @EndDate), DATEADD(DAY, -10, @EndDate),
     'New environmental standards for dairy farm waste management and water quality',
     'High', 'Affects cheese producers with on-farm operations, requiring infrastructure investment',
     'Environmental', 'WI Dept of Ag', 1),

    -- California State Issues
    ('905B1604-B8CD-4E8B-9F42-9A79A5901E04', 'C13E8584-2251-4F00-BD67-028A8CFAA846',
     'California Animal Welfare Standards', 'Bill', 'SB 501',
     'In Committee', DATEADD(MONTH, -7, @EndDate), DATEADD(DAY, -35, @EndDate),
     'Enhanced animal welfare standards for dairy cattle including space and pasture requirements',
     'High', 'Would increase production costs for California dairy operations',
     'Animal Welfare', 'Sen. Environmental Quality Committee', 1),

    ('B08F4A47-CBDB-49E3-AC4F-4DA2F2DB674D', 'E6ED0401-D6AF-47B3-A365-0EFF27CD2C97',
     'Artisan Cheese Facility Licensing', 'Bill', 'AB 1156',
     'Passed House', DATEADD(MONTH, -4, @EndDate), DATEADD(DAY, -18, @EndDate),
     'Streamlined licensing process for small-scale artisan cheese producers',
     'Medium', 'Reduces regulatory burden for small cheesemakers',
     'Other', 'Rep. District 28', 1),

    -- Vermont State Issues
    ('EBF0F0EA-1084-4D57-B01B-7FFE5A55C645', 'F8AB41C1-D72B-4E0F-9D1F-367148614044',
     'Vermont Cheese Heritage Protection', 'Bill', 'H. 203',
     'Signed', DATEADD(MONTH, -12, @EndDate), DATEADD(DAY, -120, @EndDate),
     'Protects traditional Vermont cheese names and production methods',
     'Low', 'Promotes Vermont cheese identity and prevents misuse of regional names',
     'Labeling', 'House Agriculture Committee', 1);
GO

-- ============================================================================
-- POLICY POSITIONS
-- ============================================================================

PRINT 'Populating Policy Positions...';

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

INSERT INTO [AssociationDemo].[PolicyPosition]
    ([ID], [LegislativeIssueID], [Position], [PositionStatement], [Rationale], [AdoptedDate], [AdoptedBy], [Priority], [IsPublic])
VALUES
    ('4E755F03-0826-4638-883E-5F7BC06BD2BE', 'FCB4704A-351B-49E0-9A69-99B87F0B2FC8',
     'Support with Amendments',
     'The American Cheese Association supports modernizing food labeling requirements but requests exemptions for small-batch artisan producers and adequate implementation timeline.',
     'While supporting consumer transparency, we must ensure small producers are not unduly burdened by compliance costs. Recommend 24-month implementation period.',
     DATEADD(DAY, -30, @EndDate), 'Board of Directors', 'High', 1),

    ('188ABE78-AFF2-438B-A767-A68EBD960211', '9D65FEA4-C804-427E-882F-6D9213CA77A8',
     'Oppose',
     'The American Cheese Association strongly opposes extending raw milk cheese aging requirements from 60 to 90 days.',
     'No scientific evidence supports extended aging for food safety. Would eliminate many traditional cheese varieties and harm artisan producers. Current 60-day standard is adequate and science-based.',
     DATEADD(DAY, -20, @EndDate), 'Board of Directors', 'Critical', 1),

    ('1D773C0A-16D7-4062-823D-0F8C8E5BD430', '166CD14E-655E-4664-BB1B-13C4EC475866',
     'Support',
     'The American Cheese Association supports the Dairy Pricing Reform Act to provide greater price stability for dairy producers.',
     'Volatile milk prices create uncertainty for cheese producers. Reform would provide more predictable input costs and support long-term business planning.',
     DATEADD(DAY, -40, @EndDate), 'Board of Directors', 'High', 1),

    ('5747C716-0E7F-4062-A0C1-763904330E73', '0D11A907-4E12-4692-86C0-15926EED0919',
     'Oppose',
     'The American Cheese Association opposes reductions in imported cheese tariffs without reciprocal market access for U.S. cheese exports.',
     'Domestic producers face stringent regulations that increase costs. Tariff reductions without addressing trade barriers for U.S. exports would create unfair competition.',
     DATEADD(DAY, -25, @EndDate), 'Board of Directors', 'Critical', 1),

    ('55B8F113-B7B3-4DFF-8731-1CD928DAA8DA', '17E46884-1BC4-4E26-B051-E24FD466F0BD',
     'Support',
     'The American Cheese Association supports enhanced Listeria control measures while requesting technical assistance for small producers.',
     'Food safety is paramount. We support science-based controls while ensuring small producers have access to guidance and resources for compliance.',
     DATEADD(DAY, -70, @EndDate), 'Board of Directors', 'High', 1),

    ('067071C2-4EF3-4DE7-9C42-FF9E75D52E8E', '107366AC-B8A3-4BF4-8789-6CD88EA08EFE',
     'Support',
     'The Wisconsin Cheese Makers Association supports expanded raw milk sales for licensed cheesemakers.',
     'Provides market opportunities for artisan producers while maintaining food safety through licensing requirements.',
     DATEADD(DAY, -35, @EndDate), 'Wisconsin Chapter Board', 'Medium', 1),

    ('E93F0ACA-0150-43E4-91DE-8BA737132E6C', '905B1604-B8CD-4E8B-9F42-9A79A5901E04',
     'Support with Amendments',
     'Support animal welfare improvements with science-based standards and adequate transition time.',
     'We support humane treatment but standards must be achievable and based on veterinary science. Request 3-year implementation period for infrastructure changes.',
     DATEADD(DAY, -42, @EndDate), 'California Chapter Board', 'High', 1);
GO

-- ============================================================================
-- GOVERNMENT CONTACTS
-- ============================================================================

PRINT 'Populating Government Contacts...';

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

INSERT INTO [AssociationDemo].[GovernmentContact]
    ([ID], [LegislativeBodyID], [FirstName], [LastName], [Title], [ContactType], [Party], [District], [Committee],
     [Email], [Phone], [Website], [TermStart], [TermEnd], [IsActive])
VALUES
    -- Federal Contacts
    ('092E1BB0-FB36-45CF-B279-6EF51570D129', 'E48246E6-7B0D-4ACD-B506-8BAA2467C7B9',
     'Patricia', 'Morrison', 'Representative, 3rd District Wisconsin', 'Representative', 'Democratic', 'WI-3', 'Agriculture Committee',
     'rep.morrison@mail.house.gov', '202-555-0141', 'https://morrison.house.gov',
     DATEADD(YEAR, -4, @EndDate), DATEADD(YEAR, 2, @EndDate), 1),

    ('7EA4655D-5B4D-4DA5-A873-553FB2D53817', 'D9ACFADB-D0E5-4383-8EAA-68C5632F761B',
     'Robert', 'Chen', 'Senator from Wisconsin', 'Senator', 'Republican', 'Wisconsin', 'Agriculture, Nutrition, and Forestry Committee',
     'senator.chen@senate.gov', '202-555-0198', 'https://chen.senate.gov',
     DATEADD(YEAR, -6, @EndDate), DATEADD(YEAR, 0, @EndDate), 1),

    ('D638169C-6843-40F3-8850-981EF7D1F7CB', 'D04DFA9B-74B1-496C-938D-99384AC91563',
     'Jennifer', 'Rodriguez', 'Director, Center for Food Safety and Applied Nutrition', 'Agency Head', NULL, NULL, NULL,
     'jennifer.rodriguez@fda.hhs.gov', '301-555-0167', 'https://www.fda.gov/food',
     DATEADD(YEAR, -3, @EndDate), NULL, 1),

    ('9DC5C5CE-514B-4E7D-AA34-27F29470ABD5', '97EB5AB3-E2B4-4B9F-A75D-BD56D3989154',
     'Michael', 'Patterson', 'Administrator, Agricultural Marketing Service', 'Agency Head', NULL, NULL, NULL,
     'michael.patterson@usda.gov', '202-555-0189', 'https://www.ams.usda.gov',
     DATEADD(YEAR, -2, @EndDate), NULL, 1),

    -- Wisconsin State Contacts
    ('1F963EFA-817A-48A7-8D1E-F6A5225358B1', '33177B28-2203-4548-9F56-9EA8D82FB3E7',
     'Sarah', 'Thompson', 'State Senator, District 14', 'Legislator', 'Republican', 'District 14', 'Agriculture and Revenue Committee',
     'sen.thompson@legis.wisconsin.gov', '608-555-0123', 'https://legis.wisconsin.gov/senate/14',
     DATEADD(YEAR, -5, @EndDate), DATEADD(YEAR, 3, @EndDate), 1),

    ('1031D5A9-4B71-4D03-9F1E-F59B125A4B7B', '164B4BC2-D7EB-4115-A110-90D0565DBA74',
     'James', 'Kowalski', 'State Representative, District 48', 'Legislator', 'Democratic', 'District 48', 'Agriculture Committee Chair',
     'rep.kowalski@legis.wisconsin.gov', '608-555-0156', 'https://legis.wisconsin.gov/assembly/48',
     DATEADD(YEAR, -3, @EndDate), DATEADD(YEAR, 1, @EndDate), 1),

    ('30CE2F41-F0D2-46EC-BEC9-D4C44AB5E4DF', 'A3708D4C-7D18-4BD0-B63A-5FC0EC6D9BB6',
     'Amanda', 'Miller', 'Secretary, Department of Agriculture, Trade and Consumer Protection', 'Agency Head', NULL, NULL, NULL,
     'amanda.miller@wisconsin.gov', '608-555-0178', 'https://datcp.wi.gov',
     DATEADD(YEAR, -4, @EndDate), NULL, 1),

    -- California State Contacts
    ('872CD833-2416-46F8-BC90-AEDD37E39740', 'C13E8584-2251-4F00-BD67-028A8CFAA846',
     'David', 'Martinez', 'State Senator, District 12', 'Legislator', 'Democratic', 'District 12', 'Environmental Quality Committee',
     'senator.martinez@senate.ca.gov', '916-555-0134', 'https://sd12.senate.ca.gov',
     DATEADD(YEAR, -6, @EndDate), DATEADD(YEAR, 2, @EndDate), 1),

    ('D11946AD-EA67-4197-ABC4-AFDA34AA4EAE', 'E6ED0401-D6AF-47B3-A365-0EFF27CD2C97',
     'Lisa', 'Nakamura', 'Assembly Member, District 28', 'Legislator', 'Democratic', 'District 28', 'Agriculture Committee',
     'assemblymember.nakamura@assembly.ca.gov', '916-555-0145', 'https://a28.assembly.ca.gov',
     DATEADD(YEAR, -2, @EndDate), DATEADD(YEAR, 2, @EndDate), 1),

    -- Vermont Contacts
    ('3AB7B268-8633-499C-986A-2F5136013373', 'F8AB41C1-D72B-4E0F-9D1F-367148614044',
     'Emily', 'Bradford', 'State Representative, Chittenden District', 'Legislator', 'Democratic', 'Chittenden', 'House Agriculture Committee',
     'ebradford@leg.state.vt.us', '802-555-0167', 'https://legislature.vermont.gov',
     DATEADD(YEAR, -4, @EndDate), DATEADD(YEAR, 0, @EndDate), 1);
GO

-- ============================================================================
-- ADVOCACY ACTIONS
-- ============================================================================

PRINT 'Populating Advocacy Actions...';

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

-- Member advocacy actions on critical issues
INSERT INTO [AssociationDemo].[AdvocacyAction]
    ([ID], [LegislativeIssueID], [MemberID], [GovernmentContactID], [ActionType], [ActionDate], [Description], [Outcome])
SELECT TOP 150
    NEWID(),
    -- Focus on critical issues
    CASE (ABS(CHECKSUM(NEWID())) % 6)
        WHEN 0 THEN '9D65FEA4-C804-427E-882F-6D9213CA77A8' -- Raw milk aging
        WHEN 1 THEN '0D11A907-4E12-4692-86C0-15926EED0919' -- Import tariffs
        WHEN 2 THEN 'FCB4704A-351B-49E0-9A69-99B87F0B2FC8' -- Labeling
        WHEN 3 THEN '166CD14E-655E-4664-BB1B-13C4EC475866' -- Dairy pricing
        WHEN 4 THEN '905B1604-B8CD-4E8B-9F42-9A79A5901E04' -- Animal welfare
        ELSE '17E46884-1BC4-4E26-B051-E24FD466F0BD' -- Listeria control
    END,
    m.ID,
    -- Assign government contact
    CASE (ABS(CHECKSUM(NEWID())) % 10)
        WHEN 0 THEN '092E1BB0-FB36-45CF-B279-6EF51570D129'
        WHEN 1 THEN '7EA4655D-5B4D-4DA5-A873-553FB2D53817'
        WHEN 2 THEN 'D638169C-6843-40F3-8850-981EF7D1F7CB'
        WHEN 3 THEN '1F963EFA-817A-48A7-8D1E-F6A5225358B1'
        WHEN 4 THEN '1031D5A9-4B71-4D03-9F1E-F59B125A4B7B'
        WHEN 5 THEN '872CD833-2416-46F8-BC90-AEDD37E39740'
        WHEN 6 THEN 'D11946AD-EA67-4197-ABC4-AFDA34AA4EAE'
        WHEN 7 THEN '3AB7B268-8633-499C-986A-2F5136013373'
        WHEN 8 THEN '30CE2F41-F0D2-46EC-BEC9-D4C44AB5E4DF'
        ELSE '9DC5C5CE-514B-4E7D-AA34-27F29470ABD5'
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 6)
        WHEN 0 THEN 'Email'
        WHEN 1 THEN 'Phone Call'
        WHEN 2 THEN 'Letter'
        WHEN 3 THEN 'Meeting'
        WHEN 4 THEN 'Social Media'
        ELSE 'Testimony'
    END,
    DATEADD(DAY, -(ABS(CHECKSUM(NEWID())) % 90), @EndDate),
    CASE (ABS(CHECKSUM(NEWID())) % 8)
        WHEN 0 THEN 'Contacted representative to express opposition to proposed regulation changes affecting small cheese producers'
        WHEN 1 THEN 'Sent letter supporting legislative reform to provide price stability for dairy industry'
        WHEN 2 THEN 'Called office to request meeting regarding impact on artisan cheesemakers'
        WHEN 3 THEN 'Provided testimony at committee hearing on food safety regulations'
        WHEN 4 THEN 'Met with legislative staff to discuss concerns about compliance costs'
        WHEN 5 THEN 'Submitted written comments during public comment period'
        WHEN 6 THEN 'Participated in industry day at state capitol to educate legislators'
        ELSE 'Shared industry position on social media and tagged representatives'
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 5)
        WHEN 0 THEN 'Received acknowledgment from representative office'
        WHEN 1 THEN 'Representative agreed to review concerns with committee'
        WHEN 2 THEN 'Scheduled follow-up meeting with legislative staff'
        WHEN 3 THEN 'Comments included in official record'
        ELSE 'Awaiting response'
    END
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();
GO

-- ============================================================================
-- REGULATORY COMMENTS
-- ============================================================================

PRINT 'Populating Regulatory Comments...';

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

INSERT INTO [AssociationDemo].[RegulatoryComment]
    ([ID], [LegislativeIssueID], [DocketNumber], [CommentPeriodStart], [CommentPeriodEnd], [SubmittedDate],
     [SubmittedBy], [CommentText], [CommentType], [Status])
VALUES
    ('7B86EEB5-0AF7-4BD7-8345-3B7D21628B3B', '9D65FEA4-C804-427E-882F-6D9213CA77A8',
     'FDA-2025-N-0847', DATEADD(DAY, -60, @EndDate), DATEADD(DAY, -15, @EndDate), DATEADD(DAY, -20, @EndDate),
     'American Cheese Association',
     'The American Cheese Association opposes the proposed extension of raw milk cheese aging requirements from 60 to 90 days. The current 60-day aging requirement is science-based and has proven effective in ensuring food safety for over 70 years. The proposed 90-day requirement lacks scientific justification and would eliminate many traditional cheese varieties that require shorter aging periods. This change would disproportionately harm small artisan producers who specialize in these traditional varieties. We urge FDA to maintain the current 60-day standard which adequately addresses food safety concerns while preserving cheese diversity and small business viability.',
     'Organization', 'Submitted');
GO

PRINT 'Legislative Tracking & Advocacy data population complete!';
PRINT '';
GO
