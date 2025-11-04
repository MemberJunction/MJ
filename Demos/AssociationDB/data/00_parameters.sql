/******************************************************************************
 * Association Sample Database - Parameters and UUID Declarations
 * File: 00_parameters.sql
 *
 * This file defines the date parameters that make all sample data "evergreen"
 * and declares hardcoded UUIDs for cross-referencing between tables.
 *
 * USAGE: Modify @EndDate to be the current date when running this script.
 *        All other dates will be calculated relative to this anchor.
 ******************************************************************************/

PRINT '=================================================================';
PRINT 'ASSOCIATION SAMPLE DATABASE - PARAMETERS';
PRINT '=================================================================';
PRINT '';

-- ============================================================================
-- DATE PARAMETERS (Modify these to control the data time window)
-- ============================================================================

DECLARE @EndDate DATE = GETDATE();                              -- "Today"
DECLARE @StartDate DATE = DATEADD(YEAR, -5, @EndDate);         -- 5 years of history

PRINT 'Date Parameters:';
PRINT '  Start Date: ' + CONVERT(VARCHAR, @StartDate, 101);
PRINT '  End Date: ' + CONVERT(VARCHAR, @EndDate, 101);
PRINT '  Data Window: ' + CAST(DATEDIFF(DAY, @StartDate, @EndDate) AS VARCHAR) + ' days';
PRINT '';

-- Derived date anchors for various data generation needs
DECLARE @FiveYearsAgo DATE = DATEADD(YEAR, -5, @EndDate);
DECLARE @FourYearsAgo DATE = DATEADD(YEAR, -4, @EndDate);
DECLARE @ThreeYearsAgo DATE = DATEADD(YEAR, -3, @EndDate);
DECLARE @TwoYearsAgo DATE = DATEADD(YEAR, -2, @EndDate);
DECLARE @OneYearAgo DATE = DATEADD(YEAR, -1, @EndDate);
DECLARE @SixMonthsAgo DATE = DATEADD(MONTH, -6, @EndDate);
DECLARE @ThreeMonthsAgo DATE = DATEADD(MONTH, -3, @EndDate);
DECLARE @TwoMonthsAgo DATE = DATEADD(MONTH, -2, @EndDate);
DECLARE @OneMonthAgo DATE = DATEADD(MONTH, -1, @EndDate);
DECLARE @TwoWeeksAgo DATE = DATEADD(DAY, -14, @EndDate);
DECLARE @OneWeekAgo DATE = DATEADD(DAY, -7, @EndDate);
DECLARE @Tomorrow DATE = DATEADD(DAY, 1, @EndDate);
DECLARE @OneWeekFromNow DATE = DATEADD(DAY, 7, @EndDate);
DECLARE @TwoWeeksFromNow DATE = DATEADD(DAY, 14, @EndDate);
DECLARE @OneMonthFromNow DATE = DATEADD(MONTH, 1, @EndDate);
DECLARE @ThreeMonthsFromNow DATE = DATEADD(MONTH, 3, @EndDate);
DECLARE @SixMonthsFromNow DATE = DATEADD(MONTH, 6, @EndDate);

-- ============================================================================
-- MEMBERSHIP SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Membership Types (8 types)
DECLARE @MembershipType_Individual UNIQUEIDENTIFIER = 'A1111111-1111-1111-1111-000000000001';
DECLARE @MembershipType_Student UNIQUEIDENTIFIER = 'A1111111-1111-1111-1111-000000000002';
DECLARE @MembershipType_Corporate UNIQUEIDENTIFIER = 'A1111111-1111-1111-1111-000000000003';
DECLARE @MembershipType_Lifetime UNIQUEIDENTIFIER = 'A1111111-1111-1111-1111-000000000004';
DECLARE @MembershipType_Retired UNIQUEIDENTIFIER = 'A1111111-1111-1111-1111-000000000005';
DECLARE @MembershipType_EarlyCareer UNIQUEIDENTIFIER = 'A1111111-1111-1111-1111-000000000006';
DECLARE @MembershipType_International UNIQUEIDENTIFIER = 'A1111111-1111-1111-1111-000000000007';
DECLARE @MembershipType_Honorary UNIQUEIDENTIFIER = 'A1111111-1111-1111-1111-000000000008';

-- Key Organizations (20 selected for member associations)
DECLARE @Org_TechVentures UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000001';
DECLARE @Org_CloudScale UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000002';
DECLARE @Org_DataDriven UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000003';
DECLARE @Org_CyberShield UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000004';
DECLARE @Org_HealthTech UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000005';
DECLARE @Org_FinancialEdge UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000006';
DECLARE @Org_RetailInnovate UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000007';
DECLARE @Org_EduTech UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000008';
DECLARE @Org_ManufacturePro UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000009';
DECLARE @Org_LogisticsPrime UNIQUEIDENTIFIER = 'B1111111-2222-3333-4444-000000000010';

-- Key Members for journeys and relationships (30 key members)
DECLARE @Member_SarahChen UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000001';
DECLARE @Member_MichaelJohnson UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000002';
DECLARE @Member_EmilyRodriguez UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000003';
DECLARE @Member_DavidKim UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000004';
DECLARE @Member_JessicaLee UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000005';
DECLARE @Member_RobertBrown UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000006';
DECLARE @Member_LisaAnderson UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000007';
DECLARE @Member_JamesPatel UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000008';
DECLARE @Member_MariaGarcia UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000009';
DECLARE @Member_JohnSmith UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000010';
DECLARE @Member_AlexTaylor UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000011';
DECLARE @Member_RachelWilson UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000012';
DECLARE @Member_KevinMartinez UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000013';
DECLARE @Member_AmandaClark UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000014';
DECLARE @Member_DanielNguyen UNIQUEIDENTIFIER = 'C1111111-3333-4444-5555-000000000015';

-- ============================================================================
-- EVENTS SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Major Events (35 events over 5 years - declare key ones)
DECLARE @Event_AnnualConf2020 UNIQUEIDENTIFIER = 'D1111111-4444-5555-6666-000000000001';
DECLARE @Event_AnnualConf2021 UNIQUEIDENTIFIER = 'D1111111-4444-5555-6666-000000000002';
DECLARE @Event_AnnualConf2022 UNIQUEIDENTIFIER = 'D1111111-4444-5555-6666-000000000003';
DECLARE @Event_AnnualConf2023 UNIQUEIDENTIFIER = 'D1111111-4444-5555-6666-000000000004';
DECLARE @Event_AnnualConf2024 UNIQUEIDENTIFIER = 'D1111111-4444-5555-6666-000000000005';
DECLARE @Event_VirtualSummit2024 UNIQUEIDENTIFIER = 'D1111111-4444-5555-6666-000000000006';
DECLARE @Event_LeadershipWorkshop UNIQUEIDENTIFIER = 'D1111111-4444-5555-6666-000000000007';

-- ============================================================================
-- LEARNING SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Course Categories and Key Courses (60 courses - declare important ones)
DECLARE @Course_CloudArchitect UNIQUEIDENTIFIER = 'E1111111-5555-6666-7777-000000000001';
DECLARE @Course_CyberSecurity UNIQUEIDENTIFIER = 'E1111111-5555-6666-7777-000000000002';
DECLARE @Course_DataScience UNIQUEIDENTIFIER = 'E1111111-5555-6666-7777-000000000003';
DECLARE @Course_Leadership UNIQUEIDENTIFIER = 'E1111111-5555-6666-7777-000000000004';
DECLARE @Course_DevOps UNIQUEIDENTIFIER = 'E1111111-5555-6666-7777-000000000005';
DECLARE @Course_AIFundamentals UNIQUEIDENTIFIER = 'E1111111-5555-6666-7777-000000000006';

-- ============================================================================
-- MARKETING SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Key Campaigns (45 campaigns)
DECLARE @Campaign_Welcome UNIQUEIDENTIFIER = 'F1111111-6666-7777-8888-000000000001';
DECLARE @Campaign_Renewal2024 UNIQUEIDENTIFIER = 'F1111111-6666-7777-8888-000000000002';
DECLARE @Campaign_AnnualConfPromo UNIQUEIDENTIFIER = 'F1111111-6666-7777-8888-000000000003';

-- Key Segments (80 segments)
DECLARE @Segment_ActiveMembers UNIQUEIDENTIFIER = 'G1111111-7777-8888-9999-000000000001';
DECLARE @Segment_Students UNIQUEIDENTIFIER = 'G1111111-7777-8888-9999-000000000002';
DECLARE @Segment_Leadership UNIQUEIDENTIFIER = 'G1111111-7777-8888-9999-000000000003';

-- ============================================================================
-- EMAIL SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Email Templates (30 templates)
DECLARE @Template_Welcome UNIQUEIDENTIFIER = 'H1111111-8888-9999-AAAA-000000000001';
DECLARE @Template_Renewal60Days UNIQUEIDENTIFIER = 'H1111111-8888-9999-AAAA-000000000002';
DECLARE @Template_Renewal30Days UNIQUEIDENTIFIER = 'H1111111-8888-9999-AAAA-000000000003';
DECLARE @Template_EventInvite UNIQUEIDENTIFIER = 'H1111111-8888-9999-AAAA-000000000004';
DECLARE @Template_Newsletter UNIQUEIDENTIFIER = 'H1111111-8888-9999-AAAA-000000000005';

-- ============================================================================
-- CHAPTERS SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Chapters (15 chapters)
DECLARE @Chapter_SiliconValley UNIQUEIDENTIFIER = 'I1111111-9999-AAAA-BBBB-000000000001';
DECLARE @Chapter_Boston UNIQUEIDENTIFIER = 'I1111111-9999-AAAA-BBBB-000000000002';
DECLARE @Chapter_Austin UNIQUEIDENTIFIER = 'I1111111-9999-AAAA-BBBB-000000000003';
DECLARE @Chapter_Seattle UNIQUEIDENTIFIER = 'I1111111-9999-AAAA-BBBB-000000000004';
DECLARE @Chapter_NYC UNIQUEIDENTIFIER = 'I1111111-9999-AAAA-BBBB-000000000005';
DECLARE @Chapter_WomenInTech UNIQUEIDENTIFIER = 'I1111111-9999-AAAA-BBBB-000000000006';
DECLARE @Chapter_EarlyCareer UNIQUEIDENTIFIER = 'I1111111-9999-AAAA-BBBB-000000000007';

-- ============================================================================
-- GOVERNANCE SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Committees (12 committees)
DECLARE @Committee_Executive UNIQUEIDENTIFIER = 'J1111111-AAAA-BBBB-CCCC-000000000001';
DECLARE @Committee_Finance UNIQUEIDENTIFIER = 'J1111111-AAAA-BBBB-CCCC-000000000002';
DECLARE @Committee_Membership UNIQUEIDENTIFIER = 'J1111111-AAAA-BBBB-CCCC-000000000003';
DECLARE @Committee_Events UNIQUEIDENTIFIER = 'J1111111-AAAA-BBBB-CCCC-000000000004';
DECLARE @Committee_Education UNIQUEIDENTIFIER = 'J1111111-AAAA-BBBB-CCCC-000000000005';

-- Board Positions (9 positions)
DECLARE @BoardPos_President UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000001';
DECLARE @BoardPos_VicePresident UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000002';
DECLARE @BoardPos_Treasurer UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000003';
DECLARE @BoardPos_Secretary UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000004';
DECLARE @BoardPos_Director1 UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000005';
DECLARE @BoardPos_Director2 UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000006';
DECLARE @BoardPos_Director3 UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000007';
DECLARE @BoardPos_Director4 UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000008';
DECLARE @BoardPos_Director5 UNIQUEIDENTIFIER = 'K1111111-BBBB-CCCC-DDDD-000000000009';

-- ============================================================================

PRINT 'UUID Declarations: Loaded';
PRINT '  Membership Types: 8';
PRINT '  Key Organizations: 10';
PRINT '  Key Members: 15';
PRINT '  Key Events: 7';
PRINT '  Key Courses: 6';
PRINT '  Chapters: 7';
PRINT '  Committees: 5';
PRINT '  Board Positions: 9';
PRINT '';
PRINT 'Parameters file loaded successfully!';
PRINT 'Ready to execute data population scripts.';
PRINT '';
GO
