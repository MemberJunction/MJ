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

-- ============================================================================
-- DATE PARAMETERS (Modify these to control the data time window)
-- ============================================================================

DECLARE @EndDate DATE = GETDATE();                              -- "Today"
DECLARE @StartDate DATE = DATEADD(YEAR, -5, @EndDate);         -- 5 years of history


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
DECLARE @MembershipType_Individual UNIQUEIDENTIFIER = '0B76F9ED-A512-49B3-9D46-18771891A895';
DECLARE @MembershipType_Student UNIQUEIDENTIFIER = '0A04020D-1AA1-495C-8D90-26784F4A5830';
DECLARE @MembershipType_Corporate UNIQUEIDENTIFIER = '2468E717-05E6-4B55-8F0D-C3E07AAAEF36';
DECLARE @MembershipType_Lifetime UNIQUEIDENTIFIER = '357408F6-1CC0-4C0D-9D68-84A0AE942463';
DECLARE @MembershipType_Retired UNIQUEIDENTIFIER = '351B7B97-C0B0-440B-8A25-5B82E6BE32E9';
DECLARE @MembershipType_EarlyCareer UNIQUEIDENTIFIER = '765DFC28-9E53-4C15-86AA-2ECB02065A7C';
DECLARE @MembershipType_International UNIQUEIDENTIFIER = '9DC53781-6675-43C1-AEC2-8A93847A68CB';
DECLARE @MembershipType_Honorary UNIQUEIDENTIFIER = 'E3469BA4-CD7D-47F9-B571-E9E3A08D6344';

-- Key Organizations (20 selected for member associations)
DECLARE @Org_TechVentures UNIQUEIDENTIFIER = '830433B7-C43D-4EA8-8EB0-5C4FDDF48E33';
DECLARE @Org_CloudScale UNIQUEIDENTIFIER = 'C8120B7A-39F9-4951-8163-624D2272EEDC';
DECLARE @Org_DataDriven UNIQUEIDENTIFIER = 'C19F9A6C-D2B0-45E1-AA80-763CA8BDB41D';
DECLARE @Org_CyberShield UNIQUEIDENTIFIER = 'EA34CDDD-8E5C-4FD3-8774-19E649EEEA74';
DECLARE @Org_HealthTech UNIQUEIDENTIFIER = 'BA015638-95F6-4491-8000-E8A9A500A179';
DECLARE @Org_FinancialEdge UNIQUEIDENTIFIER = '0A3D6DED-2EC5-43A1-B65D-FA9FD1181702';
DECLARE @Org_RetailInnovate UNIQUEIDENTIFIER = '1F72B3E1-EDF1-4160-9260-9E1D385ACFAD';
DECLARE @Org_EduTech UNIQUEIDENTIFIER = '094B0FF7-8294-410C-A2CF-C3458D211C84';
DECLARE @Org_ManufacturePro UNIQUEIDENTIFIER = 'BF820704-5A17-407F-8E91-9940B50B47ED';
DECLARE @Org_LogisticsPrime UNIQUEIDENTIFIER = '4E735B7F-39B8-4133-9C76-247BA30DDF6B';

-- Key Members for journeys and relationships (30 key members)
DECLARE @Member_SarahChen UNIQUEIDENTIFIER = '4C271DA3-5D80-4861-BCF2-7DA0083EE59D';
DECLARE @Member_MichaelJohnson UNIQUEIDENTIFIER = 'AAFD653B-DC7A-45EB-8F91-16B64ADA2D07';
DECLARE @Member_EmilyRodriguez UNIQUEIDENTIFIER = '89EF541B-B85D-4513-AD12-4997DE320A4E';
DECLARE @Member_DavidKim UNIQUEIDENTIFIER = 'F3832C62-46E5-453D-8423-878537F269AA';
DECLARE @Member_JessicaLee UNIQUEIDENTIFIER = 'FB84A180-E31C-4B2C-B206-6C6BF90CD223';
DECLARE @Member_RobertBrown UNIQUEIDENTIFIER = '33C6C9ED-CE11-4039-BF9D-EB5CBD401E2F';
DECLARE @Member_LisaAnderson UNIQUEIDENTIFIER = 'C80FE932-6AF2-4690-90CB-A9F19E4AFF7C';
DECLARE @Member_JamesPatel UNIQUEIDENTIFIER = '044A066A-F391-47FA-9A2C-F594BB29EA1E';
DECLARE @Member_MariaGarcia UNIQUEIDENTIFIER = 'FD75AC87-EC0D-475D-85CC-63C28B134524';
DECLARE @Member_JohnSmith UNIQUEIDENTIFIER = '4FE6BF5D-1200-44E5-9D78-23C1B3717759';
DECLARE @Member_AlexTaylor UNIQUEIDENTIFIER = '70FDF3D8-E9A0-4CE5-B0D9-579F9354E7E9';
DECLARE @Member_RachelWilson UNIQUEIDENTIFIER = 'CF7FB98A-AEA1-4516-9295-9DE30B3D1C24';
DECLARE @Member_KevinMartinez UNIQUEIDENTIFIER = '0A35406A-5631-4AEC-A7D0-02F24705B5C5';
DECLARE @Member_AmandaClark UNIQUEIDENTIFIER = 'D7E974ED-69DB-4DC3-AE22-AEDC0F9A5B8D';
DECLARE @Member_DanielNguyen UNIQUEIDENTIFIER = '1FA7C165-DE2A-495B-A5EC-4A0514455BA3';

-- ============================================================================
-- EVENTS SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Major Events (35 events over 5 years - declare key ones)
DECLARE @Event_AnnualConf2020 UNIQUEIDENTIFIER = '39F84FC0-004C-4EB6-9735-97A0D588D0E4';
DECLARE @Event_AnnualConf2021 UNIQUEIDENTIFIER = '4C561110-3C9E-4F10-A75B-E17C1B32F39E';
DECLARE @Event_AnnualConf2022 UNIQUEIDENTIFIER = 'B99C823E-F892-439C-AF4F-115AC76A8077';
DECLARE @Event_AnnualConf2023 UNIQUEIDENTIFIER = 'A6B2F811-A90B-422B-A08A-EC315533D5B0';
DECLARE @Event_AnnualConf2024 UNIQUEIDENTIFIER = '2CB19F1E-7CAB-41E1-969D-FAEB5F734A18';
DECLARE @Event_VirtualSummit2024 UNIQUEIDENTIFIER = 'BE99CE5C-5F69-49E1-A744-7029E36DB151';
DECLARE @Event_LeadershipWorkshop UNIQUEIDENTIFIER = '1FC55931-A72E-4ECD-926F-39F6372EDAC5';

-- ============================================================================
-- LEARNING SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Course Categories and Key Courses (60 courses - declare important ones)
DECLARE @Course_CloudArchitect UNIQUEIDENTIFIER = '075AECB8-0914-4B53-A8F5-3609C8ADE64E';
DECLARE @Course_CyberSecurity UNIQUEIDENTIFIER = 'C47973E4-1934-4690-AAD6-3A2FF7A197B0';
DECLARE @Course_DataScience UNIQUEIDENTIFIER = '61B9762B-9467-494F-9CB8-F1F375376023';
DECLARE @Course_Leadership UNIQUEIDENTIFIER = '1BA6CF1F-DEB3-4AED-87FC-C36B3DA2F45E';
DECLARE @Course_DevOps UNIQUEIDENTIFIER = 'DD2FB315-D929-472B-A74A-86DE6E923B24';
DECLARE @Course_AIFundamentals UNIQUEIDENTIFIER = 'F9AD32A4-1982-4C39-8E03-EB16BAE521F8';

-- ============================================================================
-- MARKETING SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Key Campaigns (45 campaigns)
DECLARE @Campaign_Welcome UNIQUEIDENTIFIER = '90FC1D81-2447-436B-B29E-CC200F75D74C';
DECLARE @Campaign_Renewal2024 UNIQUEIDENTIFIER = 'C3D3C165-CB08-4A52-BA47-3D3B439EF5F3';
DECLARE @Campaign_AnnualConfPromo UNIQUEIDENTIFIER = '2DB950D2-1AE5-43E2-BA01-4AB38A73A0DD';

-- Key Segments (80 segments)
DECLARE @Segment_ActiveMembers UNIQUEIDENTIFIER = '854C98A3-49B7-4968-BC82-848A39779AA9';
DECLARE @Segment_Students UNIQUEIDENTIFIER = '7718A1EC-575B-4D52-A908-8AA24C85106E';
DECLARE @Segment_Leadership UNIQUEIDENTIFIER = 'FBBF8FEE-2D85-4ED4-BD47-E1EB1CB4C3BE';

-- ============================================================================
-- EMAIL SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Email Templates (30 templates)
DECLARE @Template_Welcome UNIQUEIDENTIFIER = '27EE327A-B797-4442-A4E3-56D5BCCA1A99';
DECLARE @Template_Renewal60Days UNIQUEIDENTIFIER = '126D9691-DE95-4560-8503-66AD4A4126B1';
DECLARE @Template_Renewal30Days UNIQUEIDENTIFIER = '4E4C11B0-4D82-47BB-B7A5-A24AC925BD8C';
DECLARE @Template_EventInvite UNIQUEIDENTIFIER = '5650FDB1-3805-4066-969D-DD4D27ECF76D';
DECLARE @Template_Newsletter UNIQUEIDENTIFIER = 'C795BBD9-3BA8-4CA4-AE57-11B2FC0D911D';

-- ============================================================================
-- CHAPTERS SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Chapters (15 chapters)
DECLARE @Chapter_SiliconValley UNIQUEIDENTIFIER = 'F6B82C02-4178-4663-BE22-70550443ADFC';
DECLARE @Chapter_Boston UNIQUEIDENTIFIER = '938CD893-143F-4AA8-ACBD-61AC89F0FB4B';
DECLARE @Chapter_Austin UNIQUEIDENTIFIER = 'EB4401DC-0D9D-49E3-8D80-CFADE625FFDF';
DECLARE @Chapter_Seattle UNIQUEIDENTIFIER = 'BF151516-44C4-4D96-9470-CC8DE238ED10';
DECLARE @Chapter_NYC UNIQUEIDENTIFIER = 'A4142042-1792-4E9C-A5A6-CBBA0D64DEAC';
DECLARE @Chapter_WomenInTech UNIQUEIDENTIFIER = '56C83D3F-A83A-4C47-B866-5B978931D793';
DECLARE @Chapter_EarlyCareer UNIQUEIDENTIFIER = 'C0175BA9-0F93-4B26-9798-C950ACCA1C86';

-- ============================================================================
-- GOVERNANCE SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Committees (12 committees)
DECLARE @Committee_Executive UNIQUEIDENTIFIER = 'A80EF20A-29DC-47D4-BEB9-69C8A25F3243';
DECLARE @Committee_Finance UNIQUEIDENTIFIER = 'B608DF1F-F62C-4E77-B209-B76061192377';
DECLARE @Committee_Membership UNIQUEIDENTIFIER = 'F76AAA1B-A210-4213-9625-74DFC81E680E';
DECLARE @Committee_Events UNIQUEIDENTIFIER = '0B76F9ED-A512-49B3-9D46-18771891A895';
DECLARE @Committee_Education UNIQUEIDENTIFIER = '0A04020D-1AA1-495C-8D90-26784F4A5830';

-- Board Positions (9 positions)
DECLARE @BoardPos_President UNIQUEIDENTIFIER = '2468E717-05E6-4B55-8F0D-C3E07AAAEF36';
DECLARE @BoardPos_VicePresident UNIQUEIDENTIFIER = '357408F6-1CC0-4C0D-9D68-84A0AE942463';
DECLARE @BoardPos_Treasurer UNIQUEIDENTIFIER = '351B7B97-C0B0-440B-8A25-5B82E6BE32E9';
DECLARE @BoardPos_Secretary UNIQUEIDENTIFIER = '765DFC28-9E53-4C15-86AA-2ECB02065A7C';
DECLARE @BoardPos_Director1 UNIQUEIDENTIFIER = '9DC53781-6675-43C1-AEC2-8A93847A68CB';
DECLARE @BoardPos_Director2 UNIQUEIDENTIFIER = 'E3469BA4-CD7D-47F9-B571-E9E3A08D6344';
DECLARE @BoardPos_Director3 UNIQUEIDENTIFIER = '830433B7-C43D-4EA8-8EB0-5C4FDDF48E33';
DECLARE @BoardPos_Director4 UNIQUEIDENTIFIER = 'C8120B7A-39F9-4951-8163-624D2272EEDC';
DECLARE @BoardPos_Director5 UNIQUEIDENTIFIER = 'C19F9A6C-D2B0-45E1-AA80-763CA8BDB41D';

-- ============================================================================

-- Note: No GO statement here - variables must persist into parent script
-- Note: No PRINT statements here - they cause syntax errors when included
