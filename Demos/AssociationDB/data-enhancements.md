# AssociationDB Data Enhancement Plan

**Document Purpose**: This document outlines the planned enhancements to expand the AssociationDB sample database from 8 to 11 business domains, adding ~21 new tables and thousands of sample records.

**Status**: Planning phase - implementation will proceed incrementally with full testing at each step.

---

## Executive Summary

### Current State (Working Baseline)
- **8 Business Domains**: Membership, Events, Learning, Finance, Marketing/Email, Chapters, Governance
- **27 Core Tables**: Fully functional with realistic sample data
- **Evergreen Date System**: All dates relative to @EndDate parameter
- **Known Issues**: EventSession table has schema/data mismatches that need fixing

### Target State
- **11 Business Domains**: Add Community/Forums, Resources/Publications, Networking/Connections
- **48 Total Tables**: 21 new tables across 3 new domains
- **Enhanced Realism**: Forums with 150+ threads, Resource library with 100+ items, Professional networking graph

---

## Critical Issues Discovered

### Issue 1: EventSession Schema Mismatch (BLOCKING)
**Severity**: HIGH - Prevents data population in existing system

**Problem**: The EventSession table schema doesn't match the INSERT statements in `data/02_events_data.sql`

**Schema columns** (from V002__create_tables.sql):
```sql
CREATE TABLE [AssociationDemo].[EventSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EventID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,          -- Schema says "Name"
    [Description] NVARCHAR(MAX),
    [StartTime] DATETIME NOT NULL,
    [EndTime] DATETIME NOT NULL,
    [Room] NVARCHAR(100),                    -- Schema says "Room"
    [SpeakerName] NVARCHAR(255),            -- Schema says "SpeakerName"
    [SessionType] NVARCHAR(50),
    [Capacity] INT,
    [CEUCredits] DECIMAL(4,2)                -- No IsMandatory column
);
```

**Data file columns** (from 02_events_data.sql):
```sql
INSERT INTO [AssociationDemo].[EventSession]
    (ID, EventID, Title, Description, SessionType, StartTime, EndTime,
     Location, Speaker, Capacity, CEUCredits, IsMandatory)  -- Wrong column names!
```

**Fix Required**:
1. Update all INSERT statements to use: `Name` (not Title), `Room` (not Location), `SpeakerName` (not Speaker)
2. Remove `IsMandatory` column from all INSERT statements
3. Remove the extra value at end of each VALUES row

**Files Affected**: `data/02_events_data.sql` (lines 248, 351, 381, 408, 435, and many more)

### Issue 2: DateTime/Time Arithmetic (BLOCKING)
**Severity**: HIGH - SQL Server doesn't support adding TIME to DATETIME

**Problem**: Multiple INSERT statements try to add TIME values to DATETIME values:
```sql
-- This is INVALID in SQL Server:
CAST(@ThirdSunday2024 AS DATETIME) + CAST('09:00' AS TIME)
```

**Correct Approach**:
```sql
-- Use DATEADD for hours and minutes:
DATEADD(MINUTE, 0, DATEADD(HOUR, 9, CAST(@ThirdSunday2024 AS DATETIME)))
```

**Files Affected**: `data/02_events_data.sql` (38+ instances throughout the file)

**Fix Strategy**:
- Replace all `+ CAST('HH:MM' AS TIME)` patterns with proper DATEADD functions
- Parse time string into hours and minutes
- Apply DATEADD(HOUR, ...) then DATEADD(MINUTE, ...)

### Issue 3: SQL Reserved Keywords (BLOCKING)
**Severity**: MEDIUM - Causes query failures

**Problem**: Using `commit` as a table alias in 09_networking_data.sql
```sql
-- WRONG - COMMIT is reserved:
) commit
WHERE ... commit.Commitment ...

-- CORRECT:
) timecommit
WHERE ... timecommit.Commitment ...
```

**Files Affected**: `data/09_networking_data.sql` (lines 224, 314)

### Issue 4: String Escaping (FIXED)
**Problem**: Backslash-escaped apostrophes in organization names
```sql
-- WRONG in SQL Server:
'World\'s largest'

-- CORRECT:
'World''s largest'
```

**Files Affected**: `data/01_membership_data.sql` (lines 222, 226, 228, 230)
**Status**: Already identified - needs fixing in Phase 0

### Issue 5: Course Content Mismatch
**Severity**: MEDIUM - Content doesn't match database theme

**Problem**: Courses in Learning domain are technology-focused (Cloud Architecture, Cybersecurity, Data Science, etc.) but the database is cheese industry-themed.

**Example Current Courses** (tech-focused):
- Cloud Architecture Fundamentals
- Cybersecurity Best Practices
- Data Science and Analytics
- DevOps Pipeline Management
- AI and Machine Learning

**Should Be** (cheese-focused):
- Cheesemaking Fundamentals
- Advanced Aging Techniques
- Food Safety and HACCP
- Cheese Business Management
- Artisan Cheese Production

**Files Affected**: `data/03_learning_data.sql`
**Status**: Needs rewriting for Phase 0

---

## Enhancement Goals

### Phase 0: Fix Existing Issues (REQUIRED FIRST)
**Objective**: Restore working baseline before adding new features

**Tasks**:
1. ✅ Fix apostrophe escaping in 01_membership_data.sql (4 instances)
2. ❌ Fix EventSession column names in 02_events_data.sql (all INSERT statements)
3. ❌ Fix DateTime/Time arithmetic in 02_events_data.sql (38+ instances)
4. ❌ Rewrite courses in 03_learning_data.sql to be cheese-focused (currently tech-focused)
5. ✅ Fix reserved keyword `commit` alias in 09_networking_data.sql (2 instances)
6. ❌ Test complete build with existing 8 domains
7. ❌ Verify all tables populate with data

**Success Criteria**:
- Build completes with zero errors
- All 27 existing tables have expected record counts
- No "Invalid column name" errors
- No "datetime and time are incompatible" errors

**Estimated Time**: 2-3 hours

---

### Phase 1: Add Community/Forums Domain
**Objective**: Add forum discussion capabilities with 12 categories, 150+ threads, 500+ posts

**New Tables** (8 tables):
1. `ForumCategory` - Hierarchical discussion organization
2. `ForumThread` - Discussion topics
3. `ForumPost` - Original posts and replies
4. `PostReaction` - Likes, helpful votes, bookmarks
5. `PostTag` - Content organization tags
6. `MemberFollow` - Following members, threads, categories
7. `PostAttachment` - Images, documents, videos
8. `ForumModeration` - Flagged content and moderation

**Files**:
- Schema: `schema/V004__create_community_tables.sql` ✅ (already created)
- Data: `data/07_community_forum_data.sql` ✅ (already created)

**Sample Data**:
- 12 forum categories (6 top-level, 6 subcategories)
- 150+ discussion threads across categories
- 500+ forum posts (mix of original posts and replies)
- 1200+ post reactions (likes, helpful votes)
- 300+ post tags for organization
- 300+ member follow relationships
- 80+ post attachments
- 25+ moderation records

**Dependencies**:
- Member table (for AuthorID, FollowerID, etc.)
- Uses @Member_* variables from 00_parameters.sql

**Integration Points**:
- prepare_build.sh: Add V004 to schema section
- prepare_build.sh: Add 07_community_forum_data.sql to data section
- Update Phase 3 verification to check ForumThread count

**Success Criteria**:
- All 8 forum tables created successfully
- Record counts match expectations (150+ threads, 500+ posts)
- No foreign key violations
- Forum categories show correct ThreadCount/PostCount

**Estimated Time**: 1-2 hours

---

### Phase 2: Add Resources/Publications Domain
**Objective**: Add resource library with 100+ items including articles, videos, templates

**New Tables** (6 tables):
1. `ResourceCategory` - Hierarchical category organization
2. `Resource` - Core resource records (articles, videos, PDFs, templates)
3. `ResourceAuthor` - Author attributions (members and external)
4. `ResourceAccess` - Access tracking (views, downloads, completion)
5. `ResourceBookmark` - Member reading lists and favorites
6. `ResourceReview` - Ratings and reviews

**Files**:
- Schema: `schema/V005__create_resources_tables.sql` ✅ (already created)
- Data: `data/08_resources_data.sql` ✅ (already created)

**Sample Data**:
- 15 resource categories (5 top-level, 10 subcategories)
- 100+ resources across types:
  - Research papers and white papers
  - Video tutorials and webinars
  - Templates (Excel, Word, PDF)
  - Industry reports and analysis
- 150+ author attributions (mix of members and experts)
- 2000+ access tracking records (realistic usage patterns)
- 400+ member bookmarks and reading lists
- 200+ ratings and reviews

**Dependencies**:
- Member table (for access tracking, bookmarks, reviews)
- Uses @ResCat_* and @Resource_* variables (hardcoded UUIDs)

**Known Issues to Address**:
- Line 2978 error: "cat.CategoryID could not be bound"
  - Problem in programmatic resource generation (line 275)
  - CROSS APPLY syntax issue with category aliasing

**Integration Points**:
- prepare_build.sh: Add V005 to schema section
- prepare_build.sh: Add 08_resources_data.sql to data section
- Update Phase 3 verification to check Resource count

**Success Criteria**:
- All 6 resource tables created successfully
- 100+ resources across multiple categories
- Access tracking shows realistic patterns
- No binding errors in CROSS APPLY statements

**Estimated Time**: 1-2 hours

---

### Phase 3: Add Networking/Connections Domain
**Objective**: Add professional networking features with connections, mentorships, collaborations

**New Tables** (7 tables):
1. `MemberConnection` - Professional network graph
2. `MentorshipRelationship` - Mentor-mentee pairings
3. `CollaborationOpportunity` - Business collaboration opportunities
4. `CollaborationInterest` - Interest/responses to opportunities
5. `NetworkingEvent` - Dedicated networking events
6. `NetworkingAttendance` - Event attendance records
7. (Additional support tables as needed)

**Files**:
- Schema: `schema/V006__create_networking_tables.sql` ✅ (already created)
- Data: `data/09_networking_data.sql` ✅ (already created, needs reserved keyword fix)

**Sample Data**:
- 400+ member connections (professional network graph)
- 45 mentorship relationships with status tracking
- 30 collaboration opportunities across business types
- 80+ collaboration interest records
- 25 networking events (mix of in-person and virtual)
- 350+ networking attendance records with engagement metrics

**Dependencies**:
- Member table (for connections, mentorships)
- Uses @Member_* variables from 00_parameters.sql

**Known Issues to Address**:
- ✅ Reserved keyword `commit` used as alias (FIXED - changed to `timecommit`)

**Integration Points**:
- prepare_build.sh: Add V006 to schema section
- prepare_build.sh: Add 09_networking_data.sql to data section
- Update Phase 3 verification to check MemberConnection count

**Success Criteria**:
- All 7 networking tables created successfully
- 400+ connections forming realistic network graph
- No duplicate bidirectional connections
- Mentorship and collaboration counts match expectations

**Estimated Time**: 1-2 hours

---

## Implementation Strategy

### Principles
1. **One Phase at a Time**: Complete Phase 0, then 1, then 2, then 3
2. **Test After Each Phase**: Verify build succeeds and data populates before proceeding
3. **Fix Issues Immediately**: Don't move forward with known errors
4. **Maintain Working State**: Always have a rollback point

### Workflow for Each Phase
```bash
# 1. Make the changes for the phase
#    (edit schema files, data files, prepare_build.sh)

# 2. Generate the combined build
./prepare_build.sh

# 3. Execute against database
./install.sh > tmp/build_output.txt 2>&1

# 4. Check for errors
cat tmp/build_output.txt | grep -i "error\|msg [0-9]"

# 5. Verify record counts
sqlcmd -S localhost -d AssociationDB2 -Q "
    SELECT 'Members' as Entity, COUNT(*) as Count FROM AssociationDemo.Member
    UNION ALL
    SELECT 'Events', COUNT(*) FROM AssociationDemo.Event
    UNION ALL
    SELECT 'Forum Threads', COUNT(*) FROM AssociationDemo.ForumThread
    -- etc for each domain
"

# 6. If successful, commit changes
# 7. If errors, analyze and fix before proceeding
```

### Rollback Strategy
- Keep git history clean with one commit per phase
- Each commit message: "Phase N: [description] - VERIFIED WORKING"
- If issues found, can git reset to previous working phase

---

## Project Structure Reference

### File Organization (from README.md)
```
AssociationDB/
├── README.md                              # Project overview and documentation
├── data-enhancements.md                   # This file - enhancement roadmap
├── .env.template                          # Database credentials template
├── install.sh                             # Installation script (requires .env file)
├── prepare_build.sh                       # Generates combined SQL file
├── MASTER_BUILD_AssociationDB.sql         # Alternative SQLCMD entry point
│
├── schema/                                # Schema definition files
│   ├── V001__create_schema.sql           # Creates AssociationDemo schema
│   ├── V002__create_tables.sql           # Original 27 tables
│   ├── V003__table_documentation.sql     # Extended properties for docs
│   ├── V004__create_community_tables.sql # NEW: Forum tables (8 tables)
│   ├── V005__create_resources_tables.sql # NEW: Resource library (6 tables)
│   └── V006__create_networking_tables.sql# NEW: Networking (7 tables)
│
├── data/                                  # Sample data population files
│   ├── 00_parameters.sql                 # Date parameters and UUID declarations
│   ├── 01_membership_data.sql            # 500 members, 60 orgs, memberships
│   ├── 02_events_data.sql                # 35 events, sessions, registrations
│   ├── 03_learning_data.sql              # 60 courses (NEEDS CHEESE FOCUS)
│   ├── 04_finance_data.sql               # Invoices, payments
│   ├── 05_marketing_email_data.sql       # Campaigns, segments, emails
│   ├── 06_chapters_governance_data.sql   # Chapters, committees, board
│   ├── 07_community_forum_data.sql       # NEW: Forum data
│   ├── 08_resources_data.sql             # NEW: Resource library data
│   └── 09_networking_data.sql            # NEW: Networking data
│
├── tmp/                                   # Generated files (gitignored)
│   ├── combined_build.sql                # Generated during installation
│   └── build_output.txt                  # Execution output
│
└── docs/                                  # Documentation
    ├── SCHEMA_OVERVIEW.md                # Detailed schema documentation
    ├── SAMPLE_QUERIES.md                 # Example queries
    └── BUSINESS_SCENARIOS.md             # Member journey documentation
```

### Data Volumes (Target State from README.md)

| Domain | Tables | Target Sample Data |
|--------|--------|-------------------|
| **Membership** | 4 | 60 organizations (40 cheese + 20 dairy/CPG), 500 members, 625 memberships, 8 types |
| **Events** | 3 | 35 events, 85+ sessions, 1,400+ registrations |
| **Learning** | 3 | 60 courses (cheese-focused), 900 enrollments, 650+ certificates |
| **Finance** | 3 | Programmatic (based on memberships/events/courses) |
| **Marketing** | 3 | 45 campaigns, 80 segments, membership tracking |
| **Email** | 3 | 30 templates, programmatic sends/engagement |
| **Chapters** | 3 | 15 chapters, 275+ members, 45 officers |
| **Governance** | 4 | 12 committees, 9 board positions, assignments |
| **Community/Forums** | 8 | 12 categories, 150+ threads, 500+ posts, 1200+ reactions, 300+ tags |
| **Resources** | 6 | 15 categories, 100+ resources, 2000+ accesses, 200+ reviews |
| **Networking** | 7 | 400+ connections, 45 mentorships, 30 collaborations, 25 events, 350+ attendances |

**Total: 48 tables across 11 domains**

### Industry Focus (from README.md)
- **Organizations**: Mix of cheese producers (40) and dairy/CPG companies (20)
- **Events**: Cheese industry conferences and workshops
- **Courses**: Should be cheese-focused (cheesemaking, aging, food safety, business)
- **Resources**: Cheese industry knowledge base
- **Forums**: Cheese production and business discussions
- **Networking**: Professional connections in cheese industry

## Technical Notes

### SQL Server Date Handling
- **NEVER** add TIME to DATETIME: `datetime + time` is invalid
- **ALWAYS** use DATEADD: `DATEADD(HOUR, h, DATEADD(MINUTE, m, datetime))`
- Cast dates explicitly: `CAST(@EndDate AS DATETIME)`

### String Escaping
- SQL Server uses `''` (double apostrophe) not `\'` (backslash)
- Example: `'World''s Best'` not `'World\'s Best'`

### Reserved Keywords
- Avoid: COMMIT, ROLLBACK, TRANSACTION, SELECT, INSERT, UPDATE, DELETE
- If needed, use brackets: `[commit]` or choose different alias

### UUID/UNIQUEIDENTIFIER Best Practices
- Use hardcoded UUIDs for cross-file references
- Declare at top of each data file for clarity
- Generate via `uuidgen` command (not NEWID() in SQL)
- Format: uppercase with dashes: `'4960B564-CDDB-44E9-B870-AAE1D2CA6C3C'`

### Variable Scope in SQL Server
- Variables declared in one batch (before GO) don't persist after GO
- 00_parameters.sql has NO GO statement (variables persist)
- All data files should have NO GO statements at end (variables persist)
- prepare_build.sh adds GO statements between phases

---

## Testing Checklist

### After Phase 0 (Fix Existing Issues)
- [ ] Build completes with zero SQL errors
- [ ] Zero "Invalid column name" errors
- [ ] Zero "datetime and time are incompatible" errors
- [ ] Members table: 500+ records
- [ ] Events table: 35+ records
- [ ] EventSession table: 85+ records (THIS IS KEY - currently failing)
- [ ] Courses table: 60+ records
- [ ] All existing 27 tables have expected counts

### After Phase 1 (Community/Forums)
- [ ] Build completes with zero SQL errors
- [ ] ForumCategory table: 12 records
- [ ] ForumThread table: 150+ records
- [ ] ForumPost table: 500+ records
- [ ] PostReaction table: 1200+ records
- [ ] All Phase 0 tests still pass

### After Phase 2 (Resources/Publications)
- [ ] Build completes with zero SQL errors
- [ ] ResourceCategory table: 15 records
- [ ] Resource table: 100+ records
- [ ] ResourceAccess table: 2000+ records
- [ ] No "CategoryID could not be bound" errors
- [ ] All Phase 0 and 1 tests still pass

### After Phase 3 (Networking/Connections)
- [ ] Build completes with zero SQL errors
- [ ] MemberConnection table: 400+ records
- [ ] MentorshipRelationship table: 45+ records
- [ ] NetworkingEvent table: 25+ records
- [ ] NetworkingAttendance table: 350+ records
- [ ] All previous phase tests still pass

### Final Integration Test
- [ ] Full build from scratch completes successfully
- [ ] All 48 tables created
- [ ] All 11 domains populated
- [ ] Total records across all tables: 10,000+
- [ ] Query performance acceptable
- [ ] No orphaned foreign keys
- [ ] Documentation matches implementation

---

## Error Reference

### Common Error Patterns

**Error**: `Invalid column name 'Title'`
- **Cause**: Column name mismatch between schema and INSERT
- **Fix**: Check schema, update INSERT column list to match

**Error**: `The data types datetime and time are incompatible in the add operator`
- **Cause**: Trying to add TIME to DATETIME
- **Fix**: Use DATEADD(HOUR, h, DATEADD(MINUTE, m, datetime))

**Error**: `Incorrect syntax near the keyword 'commit'`
- **Cause**: Using SQL reserved keyword as identifier
- **Fix**: Choose different name or use brackets [commit]

**Error**: `The multi-part identifier "X.Y" could not be bound`
- **Cause**: Alias or column reference doesn't exist in scope
- **Fix**: Check CROSS APPLY syntax, verify alias names

**Error**: `There are fewer columns in the INSERT statement than values specified`
- **Cause**: VALUES has more items than columns in INSERT statement
- **Fix**: Count columns, count values, remove extras or add missing columns

---

## Success Metrics

### Quantitative Targets
- 48 tables across 11 domains
- 10,000+ total records
- Zero SQL errors in build
- < 5 minute build time
- All foreign keys valid

### Qualitative Targets
- Data feels realistic and interconnected
- Member journeys span multiple domains
- Dates are evergreen (relative to @EndDate)
- Easy to understand and query
- Useful for MemberJunction demos

---

## Next Steps

1. **Restore Working Baseline**: Reset to last known good state
2. **Tackle Phase 0**: Fix EventSession and DateTime issues systematically
3. **Verify Phase 0**: Ensure all 8 original domains work perfectly
4. **Proceed to Phase 1**: Add Community/Forums incrementally
5. **Document as We Go**: Update this file with actual findings

---

## Working Task List

### Phase 0: Fix Existing Issues - ✅ COMPLETE
**Status**: ✅ COMPLETE - All baseline issues fixed, courses rewritten to cheese theme

**What Was Actually Done**:
After restoring the baseline, we discovered that most of the reported issues (apostrophe escaping, EventSession columns, DateTime arithmetic, reserved keywords) were in the **new files that had already been rolled back**. The baseline itself was working fine.

The ONLY actual issue in the baseline was:
- ✅ **Task 0.8**: Rewrote all 60 courses from tech-focused to cheese industry-focused
  - Changed categories: Cloud→Cheesemaking, Security→Food Safety, Data Science→Dairy Science, DevOps→Production, Leadership→Industry Leadership, Software Development→Marketing & Sales, Business→Business Management
  - Updated certificate expiration logic to use 'Food Safety' and 'Cheesemaking' instead of 'Security' and 'Cloud'
  - All course codes, titles, descriptions now cheese-themed
  - Verified build completes successfully: 2000 Members, 21 Events, 60 Courses

**Build Verification**:
```
Record counts:
  Members: 2000
  Events: 21
  Courses: 60

BUILD COMPLETE!
Build completed successfully!
```

**Next Steps**: Ready to proceed to Phase 1 (Community/Forums domain)

#### Task 0.1: Fix Apostrophe Escaping (NOT NEEDED - baseline has no issues)
- [ ] **File**: `data/01_membership_data.sql`
- [ ] **Action**: Replace `\'` with `''` in 4 locations (lines ~222, 226, 228, 230)
- [ ] **Command**:
  ```bash
  cd Demos/AssociationDB
  sed -i '' "s/\\\\\'/\'\'/g" data/01_membership_data.sql
  ```
- [ ] **Verify**: Search for `\'` - should find zero instances
- [ ] **Test**: Run `./install.sh` and verify Members table has 2000 records
- [ ] **Success**: No SQL errors, Members = 2000

#### Task 0.2: Fix Reserved Keyword (EASY - DO SECOND)
- [ ] **File**: `data/09_networking_data.sql`
- [ ] **Action**: Change alias `commit` to `timecommit` (2 locations)
- [ ] **Line 1**: Around line 228 in CollaborationOpportunity INSERT
- [ ] **Line 2**: Around line 318 in same query
- [ ] **Verify**: Search for `) commit` - should find zero instances
- [ ] **Test**: Run `./install.sh` - this file won't execute yet (Phase 3)
- [ ] **Success**: No "syntax near 'commit'" errors

#### Task 0.3: Fix EventSession Column Names - Part 1 (FIRST INSERT)
- [ ] **File**: `data/02_events_data.sql`
- [ ] **Action**: Fix column names in FIRST INSERT statement (~line 248)
- [ ] **Change**:
  - `Title` → `Name`
  - `Location` → `Room`
  - `Speaker` → `SpeakerName`
  - Remove `IsMandatory` from column list
- [ ] **Remove**: The trailing `, 1` or `, 0` from end of each VALUES row
- [ ] **Verify**: EventSession schema has: Name, Room, SpeakerName (NOT Title, Location, Speaker)
- [ ] **Test**: Run `./install.sh` and check EventSession count
- [ ] **Success**: No "Invalid column name" errors, EventSession has records

#### Task 0.4: Fix EventSession Column Names - Part 2 (REMAINING INSERTS)
- [ ] **File**: `data/02_events_data.sql`
- [ ] **Action**: Fix ALL remaining EventSession INSERT statements
- [ ] **Locations**: Lines ~351, 381, 408, 435, and any others
- [ ] **Same Changes**: Title→Name, Location→Room, Speaker→SpeakerName, remove IsMandatory
- [ ] **Test**: Run `./install.sh` and verify EventSession count = 85+
- [ ] **Success**: EventSession table fully populated

#### Task 0.5: Fix DateTime Arithmetic - Identify All Patterns
- [ ] **File**: `data/02_events_data.sql`
- [ ] **Action**: Search for all `+ CAST('` patterns
- [ ] **Command**: `grep -n "+ CAST('" data/02_events_data.sql`
- [ ] **Document**: List all unique time patterns found
- [ ] **Do NOT fix yet** - just document what needs fixing
- [ ] **Success**: Have complete list of time patterns

#### Task 0.6: Fix DateTime Arithmetic - Create Helper Function
- [ ] **Action**: Create bash function to convert time to DATEADD
- [ ] **Example**: `'09:00'` → `DATEADD(MINUTE, 0, DATEADD(HOUR, 9, `
- [ ] **Example**: `'10:30'` → `DATEADD(MINUTE, 30, DATEADD(HOUR, 10, `
- [ ] **Test**: Test function on sample lines
- [ ] **Success**: Function correctly converts all time patterns

#### Task 0.7: Fix DateTime Arithmetic - Apply Fixes
- [ ] **File**: `data/02_events_data.sql`
- [ ] **Action**: Apply systematic TIME→DATEADD replacements
- [ ] **Strategy**: Fix 5-10 instances at a time, test after each batch
- [ ] **Test**: Run `./install.sh` after each batch
- [ ] **Success**: Zero "datetime and time are incompatible" errors

#### Task 0.8: Rewrite Courses to Cheese Theme
- [ ] **File**: `data/03_learning_data.sql`
- [ ] **Action**: Replace tech course names with cheese course names
- [ ] **Keep**: Same structure, IDs, counts (60 courses)
- [ ] **Change**: Names, descriptions, instructors to cheese-focused
- [ ] **Examples**:
  - Cloud Architecture → Cheesemaking Fundamentals
  - Cybersecurity → Food Safety and HACCP
  - Data Science → Cheese Business Analytics
- [ ] **Test**: Run `./install.sh` and verify Course count = 60
- [ ] **Success**: All courses are cheese-themed

#### Task 0.9: Final Phase 0 Verification
- [ ] **Action**: Complete end-to-end test
- [ ] **Test Commands**:
  ```bash
  cd Demos/AssociationDB
  ./install.sh > tmp/build_output.txt 2>&1
  grep -i "error\|msg [0-9]" tmp/build_output.txt
  ```
- [ ] **Verify Counts** (using sqlcmd):
  ```sql
  SELECT 'Members' as Entity, COUNT(*) as Count FROM AssociationDemo.Member
  UNION ALL SELECT 'Events', COUNT(*) FROM AssociationDemo.Event
  UNION ALL SELECT 'EventSession', COUNT(*) FROM AssociationDemo.EventSession
  UNION ALL SELECT 'Courses', COUNT(*) FROM AssociationDemo.Course
  ```
- [ ] **Expected**: Members=2000, Events=21, EventSession=85+, Courses=60
- [ ] **Success**: Zero errors, all counts correct
- [ ] **Commit**: `git commit -m "Phase 0: Fixed baseline issues - VERIFIED WORKING"`

---

### Phase 1: Add Community/Forums Domain - NOT STARTED
**Status**: ⏸️ Waiting for Phase 0 completion

#### Task 1.1: Enable V004 Schema in Build Scripts
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Uncomment or add `cat schema/V004__create_community_tables.sql >> "$OUTPUT"`
- [ ] **Location**: Schema section (after V002, before data section)
- [ ] **Verify**: `tmp/combined_build.sql` includes community table CREATE statements
- [ ] **Test**: Run `./install.sh` and check for ForumCategory table
- [ ] **Success**: 8 new forum tables created

#### Task 1.2: Enable 07 Data in Build Scripts
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Uncomment or add `cat data/07_community_forum_data.sql >> "$OUTPUT"`
- [ ] **Location**: Data section (after 06, before Phase 2 complete)
- [ ] **Test**: Run `./install.sh` and check ForumThread count
- [ ] **Success**: ForumThread table has 150+ records

#### Task 1.3: Update Phase 3 Verification
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Add ForumThread count to verification section
- [ ] **Add**: `SELECT @ForumThreadCount = COUNT(*) FROM AssociationDemo.ForumThread;`
- [ ] **Add**: `PRINT '  Forum Threads: ' + CAST(@ForumThreadCount AS VARCHAR);`
- [ ] **Test**: Run `./install.sh` and verify output shows Forum count
- [ ] **Success**: Verification section shows forum statistics

#### Task 1.4: Full Phase 1 Test
- [ ] **Test**: Complete build and verification
- [ ] **Verify**: All forum tables populated (12 categories, 150+ threads, 500+ posts)
- [ ] **Success**: All Phase 0 tables still work + new forum tables
- [ ] **Commit**: `git commit -m "Phase 1: Added Community/Forums domain - VERIFIED WORKING"`

---

### Phase 2: Add Resources Domain - NOT STARTED
**Status**: ⏸️ Waiting for Phase 1 completion

#### Task 2.1: Fix CROSS APPLY Error in 08_resources_data.sql
- [ ] **File**: `data/08_resources_data.sql`
- [ ] **Issue**: Line ~275 has binding error with `cat.CategoryID`
- [ ] **Action**: Fix CROSS APPLY syntax
- [ ] **Current**: `CROSS APPLY (SELECT CategoryID FROM (SELECT CategoryID) AS c(CategoryID)) cat;`
- [ ] **Should be**: Just use `res.CategoryID` directly in INSERT
- [ ] **Test**: Verify programmatic resource generation works
- [ ] **Success**: No "could not be bound" errors

#### Task 2.2: Enable V005 Schema in Build Scripts
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Uncomment or add `cat schema/V005__create_resources_tables.sql >> "$OUTPUT"`
- [ ] **Test**: Run `./install.sh` and check for ResourceCategory table
- [ ] **Success**: 6 new resource tables created

#### Task 2.3: Enable 08 Data in Build Scripts
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Uncomment or add `cat data/08_resources_data.sql >> "$OUTPUT"`
- [ ] **Test**: Run `./install.sh` and check Resource count
- [ ] **Success**: Resource table has 100+ records

#### Task 2.4: Update Phase 3 Verification
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Add Resource count to verification
- [ ] **Test**: Run `./install.sh` and verify output
- [ ] **Success**: Verification shows resource statistics

#### Task 2.5: Full Phase 2 Test
- [ ] **Test**: Complete build and verification
- [ ] **Verify**: All resource tables populated (15 categories, 100+ resources)
- [ ] **Success**: All Phase 0+1 tables still work + new resource tables
- [ ] **Commit**: `git commit -m "Phase 2: Added Resources domain - VERIFIED WORKING"`

---

### Phase 3: Add Networking Domain - NOT STARTED
**Status**: ⏸️ Waiting for Phase 2 completion

#### Task 3.1: Enable V006 Schema in Build Scripts
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Uncomment or add `cat schema/V006__create_networking_tables.sql >> "$OUTPUT"`
- [ ] **Test**: Run `./install.sh` and check for MemberConnection table
- [ ] **Success**: 7 new networking tables created

#### Task 3.2: Enable 09 Data in Build Scripts
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Uncomment or add `cat data/09_networking_data.sql >> "$OUTPUT"`
- [ ] **Test**: Run `./install.sh` and check MemberConnection count
- [ ] **Success**: MemberConnection table has 400+ records

#### Task 3.3: Update Phase 3 Verification
- [ ] **File**: `prepare_build.sh`
- [ ] **Action**: Add MemberConnection count to verification
- [ ] **Test**: Run `./install.sh` and verify output
- [ ] **Success**: Verification shows networking statistics

#### Task 3.4: Full Phase 3 Test
- [ ] **Test**: Complete build and verification
- [ ] **Verify**: All networking tables populated (400+ connections, 45 mentorships)
- [ ] **Success**: All 48 tables across 11 domains work perfectly
- [ ] **Commit**: `git commit -m "Phase 3: Added Networking domain - VERIFIED WORKING"`

---

### Final Integration Test - NOT STARTED
**Status**: ⏸️ Waiting for Phase 3 completion

#### Task 4.1: Clean Build from Scratch
- [ ] **Action**: Drop database, recreate, run full install
- [ ] **Verify**: Zero errors from start to finish
- [ ] **Success**: Complete 11-domain database builds successfully

#### Task 4.2: Verify All 48 Tables
- [ ] **Action**: Query all table counts
- [ ] **Verify**: Every table has expected record count
- [ ] **Success**: All counts match targets from README.md

#### Task 4.3: Update Documentation
- [ ] **Update**: README.md with "11 domains" instead of "8 domains"
- [ ] **Update**: data-enhancements.md status to "COMPLETE"
- [ ] **Success**: Documentation accurate and complete

#### Task 4.4: Final Commit
- [ ] **Commit**: `git commit -m "Complete: 11-domain AssociationDB - ALL PHASES VERIFIED"`
- [ ] **Tag**: `git tag v1.0-11domains`
- [ ] **Success**: Clean git history with working phases

---

## Document Maintenance

**Last Updated**: 2025-11-11
**Status**: Phase 0 ready to begin - Baseline restored and verified working
**Current Task**: Task 0.1 - Fix apostrophe escaping
**Next Review**: After Phase 0 completion

---

## Lessons Learned (To Be Updated)

### What Worked Well
- (To be filled in during implementation)

### What Caused Problems
- (To be filled in during implementation)

### What to Do Differently Next Time
- (To be filled in during implementation)
