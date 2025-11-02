-- Demo Schema for Legislative Tracking System
-- This creates a simple test table that an agent could populate with research findings

BEGIN TRANSACTION;
GO
-- Create schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'demo')
BEGIN
    EXEC('CREATE SCHEMA demo')
END
GO

-- Drop table if it exists (for testing/reset)
IF OBJECT_ID('demo.LegislativeFindings', 'U') IS NOT NULL
    DROP TABLE demo.LegislativeFindings
GO

-- Main table for tracking legislative items
CREATE TABLE demo.LegislativeFindings (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),

    -- Bill/Rule Identification
    ItemNumber NVARCHAR(50) NULL,              -- e.g., "HB 1234", "SB 567", "DESE Rule 5.120"
    Title NVARCHAR(500) NOT NULL,              -- Short title of the bill/rule

    -- Content
    Summary NVARCHAR(MAX) NOT NULL,            -- What it does and why it matters
    FullText NVARCHAR(MAX) NULL,               -- Full text if available
    SourceURL NVARCHAR(1000) NULL,             -- Link to official source

    -- Classification
    Category NVARCHAR(100) NULL,               -- e.g., "Funding", "Teacher Rights", "Curriculum"
    PriorityLevel NVARCHAR(20) NULL,           -- e.g., "High", "Medium", "Low", "Critical"
    ItemType NVARCHAR(50) NULL,                -- e.g., "Bill", "Rule", "News", "Policy"

    -- Notes
    Notes NVARCHAR(MAX) NULL,                  -- Team notes and comments
    ActionItems NVARCHAR(MAX) NULL,            -- What actions to take
)
GO

-- Create indexes for common queries
CREATE INDEX IX_LegislativeFindings_Category ON demo.LegislativeFindings(Category)
CREATE INDEX IX_LegislativeFindings_PriorityLevel ON demo.LegislativeFindings(PriorityLevel)
GO

-- Insert sample legislative data for testing
INSERT INTO demo.LegislativeFindings (ItemNumber, Title, Summary, SourceURL, Category, PriorityLevel, ItemType, Notes, ActionItems)
VALUES
(
    'HB 1234',
    'Teacher Salary Increase and Retention Act',
    'Proposes a minimum 5% salary increase for all public school teachers statewide, with an additional 3% increase for teachers in rural and underserved districts. Includes retention bonuses for teachers with 5+ years of service. This directly impacts MSTA members'' compensation and could significantly improve teacher retention across Missouri.',
    'https://www.house.mo.gov/Bill.aspx?bill=HB1234&year=2024&code=R',
    'Funding',
    'High',
    'Bill',
    'Strong support from MSTA leadership. Currently in House Education Committee.',
    'Monitor committee hearings; prepare testimony; mobilize member support; coordinate with district representatives.'
),
(
    'SB 567',
    'Missouri Learning Standards Update',
    'Updates state learning standards for K-12 mathematics and science curricula to align with current research and workforce needs. Requires professional development for implementation. Affects how teachers plan lessons and assess student learning. Implementation timeline: Fall 2025.',
    'https://www.senate.mo.gov/24info/BillList/Bill.aspx?SessionType=R&BillID=567',
    'Curriculum',
    'Medium',
    'Bill',
    'Mixed feedback from members - concerns about PD time and resources.',
    'Survey members on implementation concerns; request adequate training timeline.'
),
(
    'DESE Rule 5.120',
    'Updated Professional Development Requirements for Educators',
    'DESE proposes changes to continuing education requirements: increases annual PD hours from 15 to 20, adds mandatory mental health training (2 hours), and allows 50% of hours to be completed online. Affects teacher certification renewal and professional growth plans.',
    'https://dese.mo.gov/communications/rules/5csr80-120',
    'Teacher Rights',
    'High',
    'Rule',
    'Public comment period ends March 15, 2024. Several members expressed concerns about additional time burden.',
    'Submit formal comment on behalf of MSTA; recommend flexible implementation timeline; advocate for state-funded PD options.'
),
(
    'HB 890',
    'Charter School Expansion and Funding Reform',
    'Expands charter school authorization to additional counties and modifies funding formula to redirect per-pupil funding from traditional public schools. Could significantly impact school district budgets and teacher positions. Controversial bill with strong opposition from public education advocates.',
    'https://www.house.mo.gov/Bill.aspx?bill=HB890&year=2024&code=R',
    'Policy',
    'Critical',
    'Bill',
    'URGENT: Fast-tracked bill, floor vote expected within 2 weeks. Significant threat to public education funding.',
    'IMMEDIATE: Mobilize grassroots opposition; contact legislators; prepare fact sheets on funding impact; coordinate media response.'
),
(
    'NEWS-2024-02',
    'Governor Announces $50M Education Budget Increase',
    'Governor announced proposed budget includes $50 million increase for K-12 education, with emphasis on special education funding and technology infrastructure. Budget proposal awaiting legislative approval. If approved, could provide additional resources for schools serving high-needs populations.',
    'https://governor.mo.gov/press-releases/archive/governor-announces-education-budget',
    'Funding',
    'Medium',
    'News',
    'Positive development but contingent on legislative budget process.',
    'Track budget amendments; advocate for equitable distribution across districts.'
),
(
    'SB 223',
    'Classroom Safety and School Resource Officer Mandate',
    'Requires all public schools with enrollment over 500 to employ at least one certified School Resource Officer. Provides partial state funding (60%) with districts responsible for remaining costs. Raises concerns about unfunded mandates and resource allocation. Affects school budgets and safety policies.',
    'https://www.senate.mo.gov/24info/BillList/Bill.aspx?SessionType=R&BillID=223',
    'Policy',
    'High',
    'Bill',
    'Cost concerns from smaller districts; questions about training requirements and oversight.',
    'Analyze fiscal impact on member districts; recommend full state funding amendment.'
),
(
    'DESE Rule 3.045',
    'Teacher Evaluation System Modifications',
    'Proposes changes to teacher evaluation criteria, adding student growth measures (30% weight) and peer observation requirements (15% weight). Modifies current evaluation timeline and appeals process. Could significantly change how teachers are assessed for performance and advancement.',
    'https://dese.mo.gov/communications/rules/5csr80-045',
    'Teacher Rights',
    'Critical',
    'Rule',
    'Major concern from membership - evaluation criteria may not adequately account for diverse student populations and teaching contexts.',
    'PRIORITY: Organize member feedback sessions; prepare detailed response to DESE; consider legal review of appeals process changes.'
)
GO

COMMIT TRANSACTION;
PRINT 'Transaction committed successfully!'
PRINT 'Sample legislative data inserted: 7 records'
GO
