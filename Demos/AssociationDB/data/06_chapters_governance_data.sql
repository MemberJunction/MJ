/******************************************************************************
 * Association Sample Database - Chapters & Governance Data
 * File: 06_chapters_governance_data.sql
 *
 * Combined file for chapters and governance data including:
 * - Chapters: Chapters, Memberships, Officers
 * - Governance: Committees, Committee Memberships, Board Positions & Members
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- CHAPTERS (15 chapters)
-- ============================================================================


INSERT INTO [AssociationDemo].[Chapter] (ID, Name, ChapterType, Region, City, State, Country, FoundedDate, IsActive, MeetingFrequency, Description)
VALUES
    (@Chapter_SiliconValley, 'Silicon Valley Chapter', 'Geographic', 'West Coast', 'Palo Alto', 'CA', 'United States',
     DATEADD(YEAR, -8, @EndDate), 1, 'Monthly', 'Serving technology leaders in the San Francisco Bay Area'),
    (@Chapter_Boston, 'Boston/Cambridge Chapter', 'Geographic', 'Northeast', 'Boston', 'MA', 'United States',
     DATEADD(YEAR, -10, @EndDate), 1, 'Monthly', 'New England technology leadership community'),
    (@Chapter_Austin, 'Austin Chapter', 'Geographic', 'Southwest', 'Austin', 'TX', 'United States',
     DATEADD(YEAR, -6, @EndDate), 1, 'Monthly', 'Central Texas technology professionals'),
    (@Chapter_Seattle, 'Seattle Chapter', 'Geographic', 'Northwest', 'Seattle', 'WA', 'United States',
     DATEADD(YEAR, -7, @EndDate), 1, 'Monthly', 'Pacific Northwest chapter'),
    (@Chapter_NYC, 'New York City Chapter', 'Geographic', 'Northeast', 'New York', 'NY', 'United States',
     DATEADD(YEAR, -12, @EndDate), 1, 'Monthly', 'NYC metro area chapter'),
    (@Chapter_WomenInTech, 'Women in Technology Leadership', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -5, @EndDate), 1, 'Quarterly', 'Supporting women technology leaders'),
    (@Chapter_EarlyCareer, 'Early Career Professionals', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -3, @EndDate), 1, 'Monthly', 'Mentorship and development for early career professionals'),
    (NEWID(), 'Chicago Chapter', 'Geographic', 'Midwest', 'Chicago', 'IL', 'United States',
     DATEADD(YEAR, -9, @EndDate), 1, 'Monthly', 'Midwest technology leadership'),
    (NEWID(), 'Denver Chapter', 'Geographic', 'Mountain', 'Denver', 'CO', 'United States',
     DATEADD(YEAR, -4, @EndDate), 1, 'Quarterly', 'Rocky Mountain region chapter'),
    (NEWID(), 'Atlanta Chapter', 'Geographic', 'Southeast', 'Atlanta', 'GA', 'United States',
     DATEADD(YEAR, -5, @EndDate), 1, 'Monthly', 'Southeast technology professionals'),
    (NEWID(), 'AI & Machine Learning SIG', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -2, @EndDate), 1, 'Quarterly', 'AI and ML practitioners'),
    (NEWID(), 'Cloud Architecture SIG', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -3, @EndDate), 1, 'Quarterly', 'Cloud architects and engineers'),
    (NEWID(), 'CyberSecurity SIG', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -4, @EndDate), 1, 'Monthly', 'Security professionals and CISOs'),
    (NEWID(), 'DevOps Practitioners', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -3, @EndDate), 1, 'Quarterly', 'DevOps and platform engineering'),
    (NEWID(), 'Toronto Chapter', 'Geographic', 'Canada', 'Toronto', 'Ontario', 'Canada',
     DATEADD(YEAR, -6, @EndDate), 1, 'Quarterly', 'Canadian technology leaders');


-- ============================================================================
-- CHAPTER MEMBERSHIPS & OFFICERS (Generated Programmatically)
-- ============================================================================


-- Random chapter memberships
INSERT INTO [AssociationDemo].[ChapterMembership] (ID, ChapterID, MemberID, JoinDate, Status, Role)
SELECT TOP 275
    NEWID(),
    c.ID,
    m.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 1000), @EndDate),
    'Active',
    'Member'
FROM [AssociationDemo].[Chapter] c
CROSS JOIN [AssociationDemo].[Member] m
ORDER BY NEWID();


-- Chapter officers (3 per chapter = 45 total)
INSERT INTO [AssociationDemo].[ChapterOfficer] (ID, ChapterID, MemberID, Position, StartDate, IsActive)
SELECT
    NEWID(),
    c.ID,
    cm.MemberID,
    CASE ROW_NUMBER() OVER (PARTITION BY c.ID ORDER BY NEWID())
        WHEN 1 THEN 'President'
        WHEN 2 THEN 'Vice President'
        ELSE 'Secretary'
    END,
    c.FoundedDate,
    1
FROM [AssociationDemo].[Chapter] c
CROSS APPLY (
    SELECT TOP 3 MemberID
    FROM [AssociationDemo].[ChapterMembership]
    WHERE ChapterID = c.ID
    ORDER BY NEWID()
) cm;


-- ============================================================================
-- GOVERNANCE - COMMITTEES
-- ============================================================================


INSERT INTO [AssociationDemo].[Committee] (ID, Name, CommitteeType, Purpose, MeetingFrequency, IsActive, FormedDate, MaxMembers)
VALUES
    (@Committee_Executive, 'Executive Committee', 'Standing', 'Strategic direction and oversight of the association', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 7),
    (@Committee_Finance, 'Finance Committee', 'Standing', 'Financial oversight and budget management', 'Quarterly', 1, DATEADD(YEAR, -15, @EndDate), 5),
    (@Committee_Membership, 'Membership Committee', 'Standing', 'Member recruitment, retention, and engagement', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 8),
    (@Committee_Events, 'Events Committee', 'Standing', 'Planning and executing association events', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 10),
    (@Committee_Education, 'Education and Certification Committee', 'Standing', 'Course development and certification programs', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 8),
    (NEWID(), 'Marketing Committee', 'Standing', 'Marketing strategy and member communications', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 6),
    (NEWID(), 'Technology Committee', 'Standing', 'Association technology infrastructure', 'Quarterly', 1, DATEADD(YEAR, -10, @EndDate), 5),
    (NEWID(), 'Governance Committee', 'Standing', 'Bylaws and governance policies', 'Quarterly', 1, DATEADD(YEAR, -15, @EndDate), 5),
    (NEWID(), 'Strategic Planning Task Force', 'Ad Hoc', '2025-2030 strategic plan development', 'Monthly', 1, DATEADD(MONTH, -6, @EndDate), 8),
    (NEWID(), 'Technology Upgrade Project', 'Task Force', 'Website and member portal modernization', 'Bi-Weekly', 1, DATEADD(MONTH, -3, @EndDate), 6),
    (NEWID(), 'DEI Initiative Committee', 'Ad Hoc', 'Diversity, equity, and inclusion programs', 'Monthly', 1, DATEADD(MONTH, -12, @EndDate), 7),
    (NEWID(), 'Sponsorship Committee', 'Standing', 'Corporate sponsorship relationships', 'Quarterly', 1, DATEADD(YEAR, -8, @EndDate), 5);


-- ============================================================================
-- COMMITTEE MEMBERSHIPS (Generated Programmatically)
-- ============================================================================


-- Random committee assignments (5-8 members per committee)
INSERT INTO [AssociationDemo].[CommitteeMembership] (ID, CommitteeID, MemberID, Role, StartDate, IsActive)
SELECT
    NEWID(),
    com.ID,
    m.ID,
    CASE ROW_NUMBER() OVER (PARTITION BY com.ID ORDER BY NEWID())
        WHEN 1 THEN 'Chair'
        WHEN 2 THEN 'Vice Chair'
        ELSE 'Member'
    END,
    com.FormedDate,
    1
FROM [AssociationDemo].[Committee] com
CROSS APPLY (
    SELECT TOP (5 + ABS(CHECKSUM(NEWID()) % 4)) ID
    FROM [AssociationDemo].[Member]
    ORDER BY NEWID()
) m;


-- ============================================================================
-- BOARD POSITIONS & MEMBERS
-- ============================================================================


INSERT INTO [AssociationDemo].[BoardPosition] (ID, PositionTitle, PositionOrder, TermLengthYears, IsOfficer, IsActive)
VALUES
    (@BoardPos_President, 'President', 1, 2, 1, 1),
    (@BoardPos_VicePresident, 'Vice President', 2, 2, 1, 1),
    (@BoardPos_Treasurer, 'Treasurer', 3, 2, 1, 1),
    (@BoardPos_Secretary, 'Secretary', 4, 2, 1, 1),
    (@BoardPos_Director1, 'Director at Large #1', 5, 3, 0, 1),
    (@BoardPos_Director2, 'Director at Large #2', 6, 3, 0, 1),
    (@BoardPos_Director3, 'Director at Large #3', 7, 3, 0, 1),
    (@BoardPos_Director4, 'Director at Large #4', 8, 3, 0, 1),
    (@BoardPos_Director5, 'Director at Large #5', 9, 3, 0, 1);


-- Current board members
INSERT INTO [AssociationDemo].[BoardMember] (ID, BoardPositionID, MemberID, StartDate, IsActive, ElectionDate)
SELECT
    NEWID(),
    bp.ID,
    m.ID,
    DATEADD(YEAR, -1, @EndDate),
    1,
    DATEADD(DAY, -10, DATEADD(YEAR, -1, @EndDate))
FROM [AssociationDemo].[BoardPosition] bp
CROSS APPLY (
    SELECT TOP 1 ID
    FROM [AssociationDemo].[Member]
    ORDER BY NEWID()
) m;


-- Note: No GO statement here - variables must persist within transaction
