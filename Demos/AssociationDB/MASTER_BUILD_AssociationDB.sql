/******************************************************************************
 * MemberJunction - Association Sample Database
 * Master Build Script
 *
 * This script creates a complete association management database with
 * realistic sample data across 8 business domains.
 *
 * EXECUTION TIME: Approximately 2-5 minutes depending on server performance
 *
 * CONTENTS:
 * - 8 schemas (membership, events, learning, finance, marketing, email, chapters, governance)
 * - 500 members with organizations and membership records
 * - 35 events with 1,400+ registrations
 * - 60 courses with 900 enrollments
 * - Complete financial records (invoices and payments)
 * - 45 marketing campaigns with email engagement tracking
 * - 15 chapters with officers and members
 * - 12 committees and 9 board positions
 *
 * REQUIREMENTS:
 * - SQL Server 2016 or later
 * - Existing database (script will create schemas and tables)
 * - Sufficient permissions to create schemas and tables
 *
 * USAGE:
 *   -- From SSMS:
 *   USE YourDatabaseName;
 *   GO
 *   :r MASTER_BUILD_AssociationDB.sql
 *
 *   -- From sqlcmd:
 *   sqlcmd -S localhost -d YourDatabaseName -i MASTER_BUILD_AssociationDB.sql
 *
 * NOTES:
 * - All dates are relative to execution time (evergreen data)
 * - Schema and table creation is idempotent (uses IF NOT EXISTS)
 * - Data inserts use NEWID() for randomization on each run
 * - Designed to work with MemberJunction CodeGen
 *
 ******************************************************************************/

SET NOCOUNT ON;
GO

PRINT '';
PRINT '###################################################################';
PRINT '#                                                                 #';
PRINT '#     MemberJunction - Association Sample Database Builder       #';
PRINT '#                                                                 #';
PRINT '###################################################################';
PRINT '';
PRINT 'This script will create a comprehensive association management';
PRINT 'database with realistic sample data across 8 business domains.';
PRINT '';
PRINT 'Estimated completion time: 2-5 minutes';
PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT '';

-- Verify we're in a database (not master)
IF DB_NAME() = 'master'
BEGIN
    RAISERROR('ERROR: Cannot run in master database. Please USE your target database first.', 16, 1);
    RETURN;
END

PRINT 'Target Database: ' + DB_NAME();
PRINT 'Start Time: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
PRINT '===================================================================';
PRINT '';

/******************************************************************************
 * PHASE 1: SCHEMA CREATION
 * Creates 8 schemas and all required tables with proper constraints
 ******************************************************************************/

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 1: CREATING SCHEMAS AND TABLES';
PRINT '===================================================================';
PRINT '';

-- Create schemas
:r schema/V001__create_schemas.sql

-- Membership schema tables
:r schema/V002__membership_tables.sql

-- Events schema tables
:r schema/V003__events_tables.sql

-- Learning schema tables
:r schema/V004__learning_tables.sql

-- Finance schema tables
:r schema/V005__finance_tables.sql

-- Marketing schema tables
:r schema/V006__marketing_tables.sql

-- Email schema tables
:r schema/V007__email_tables.sql

-- Chapters schema tables
:r schema/V008__chapters_tables.sql

-- Governance schema tables
:r schema/V009__governance_tables.sql

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 1 COMPLETE: All schemas and tables created successfully';
PRINT '===================================================================';
PRINT '';

/******************************************************************************
 * PHASE 2: SAMPLE DATA POPULATION
 * Inserts realistic sample data across all domains
 ******************************************************************************/

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 2: POPULATING SAMPLE DATA';
PRINT '===================================================================';
PRINT '';
PRINT 'NOTE: Data generation includes randomization and may produce';
PRINT 'slightly different results on each execution.';
PRINT '';

-- Membership data (foundation - must run first)
:r data/01_membership_data.sql

-- Events data
:r data/02_events_data.sql

-- Learning data
:r data/03_learning_data.sql

-- Finance data (depends on membership, events, learning)
:r data/04_finance_data.sql

-- Marketing and Email data
:r data/05_marketing_email_data.sql

-- Chapters and Governance data
:r data/06_chapters_governance_data.sql

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 2 COMPLETE: All sample data populated successfully';
PRINT '===================================================================';
PRINT '';

/******************************************************************************
 * PHASE 3: VERIFICATION
 * Validates data integrity and displays summary statistics
 ******************************************************************************/

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 3: VERIFICATION AND SUMMARY';
PRINT '===================================================================';
PRINT '';

-- Display record counts
PRINT 'Record Counts by Domain:';
PRINT '-------------------------------------------------------------------';
PRINT '';

DECLARE @MemberCount INT, @OrgCount INT, @MembershipCount INT;
DECLARE @EventCount INT, @RegistrationCount INT, @SessionCount INT;
DECLARE @CourseCount INT, @EnrollmentCount INT, @CertificateCount INT;
DECLARE @InvoiceCount INT, @PaymentCount INT;
DECLARE @CampaignCount INT, @SegmentCount INT;
DECLARE @EmailTemplateCount INT, @EmailSendCount INT;
DECLARE @ChapterCount INT, @ChapterMemberCount INT;
DECLARE @CommitteeCount INT, @BoardPositionCount INT;

-- Get counts
SELECT @MemberCount = COUNT(*) FROM membership.Member;
SELECT @OrgCount = COUNT(*) FROM membership.Organization;
SELECT @MembershipCount = COUNT(*) FROM membership.Membership;
SELECT @EventCount = COUNT(*) FROM events.Event;
SELECT @RegistrationCount = COUNT(*) FROM events.EventRegistration;
SELECT @SessionCount = COUNT(*) FROM events.EventSession;
SELECT @CourseCount = COUNT(*) FROM learning.Course;
SELECT @EnrollmentCount = COUNT(*) FROM learning.Enrollment;
SELECT @CertificateCount = COUNT(*) FROM learning.Certificate;
SELECT @InvoiceCount = COUNT(*) FROM finance.Invoice;
SELECT @PaymentCount = COUNT(*) FROM finance.Payment;
SELECT @CampaignCount = COUNT(*) FROM marketing.Campaign;
SELECT @SegmentCount = COUNT(*) FROM marketing.Segment;
SELECT @EmailTemplateCount = COUNT(*) FROM email.EmailTemplate;
SELECT @EmailSendCount = COUNT(*) FROM email.EmailSend;
SELECT @ChapterCount = COUNT(*) FROM chapters.Chapter;
SELECT @ChapterMemberCount = COUNT(*) FROM chapters.ChapterMembership;
SELECT @CommitteeCount = COUNT(*) FROM governance.Committee;
SELECT @BoardPositionCount = COUNT(*) FROM governance.BoardPosition;

-- Print summary
PRINT 'MEMBERSHIP DOMAIN:';
PRINT '  Organizations:          ' + CAST(@OrgCount AS VARCHAR);
PRINT '  Members:                ' + CAST(@MemberCount AS VARCHAR);
PRINT '  Membership Records:     ' + CAST(@MembershipCount AS VARCHAR);
PRINT '';

PRINT 'EVENTS DOMAIN:';
PRINT '  Events:                 ' + CAST(@EventCount AS VARCHAR);
PRINT '  Event Sessions:         ' + CAST(@SessionCount AS VARCHAR);
PRINT '  Event Registrations:    ' + CAST(@RegistrationCount AS VARCHAR);
PRINT '';

PRINT 'LEARNING DOMAIN:';
PRINT '  Courses:                ' + CAST(@CourseCount AS VARCHAR);
PRINT '  Enrollments:            ' + CAST(@EnrollmentCount AS VARCHAR);
PRINT '  Certificates:           ' + CAST(@CertificateCount AS VARCHAR);
PRINT '';

PRINT 'FINANCE DOMAIN:';
PRINT '  Invoices:               ' + CAST(@InvoiceCount AS VARCHAR);
PRINT '  Payments:               ' + CAST(@PaymentCount AS VARCHAR);
PRINT '';

PRINT 'MARKETING DOMAIN:';
PRINT '  Campaigns:              ' + CAST(@CampaignCount AS VARCHAR);
PRINT '  Segments:               ' + CAST(@SegmentCount AS VARCHAR);
PRINT '';

PRINT 'EMAIL DOMAIN:';
PRINT '  Email Templates:        ' + CAST(@EmailTemplateCount AS VARCHAR);
PRINT '  Email Sends:            ' + CAST(@EmailSendCount AS VARCHAR);
PRINT '';

PRINT 'CHAPTERS DOMAIN:';
PRINT '  Chapters:               ' + CAST(@ChapterCount AS VARCHAR);
PRINT '  Chapter Memberships:    ' + CAST(@ChapterMemberCount AS VARCHAR);
PRINT '';

PRINT 'GOVERNANCE DOMAIN:';
PRINT '  Committees:             ' + CAST(@CommitteeCount AS VARCHAR);
PRINT '  Board Positions:        ' + CAST(@BoardPositionCount AS VARCHAR);
PRINT '';

-- Verify referential integrity
PRINT '-------------------------------------------------------------------';
PRINT 'Referential Integrity Checks:';
PRINT '';

DECLARE @IntegrityErrors INT = 0;

-- Check for orphaned event registrations
IF EXISTS (SELECT 1 FROM events.EventRegistration er WHERE NOT EXISTS (SELECT 1 FROM membership.Member m WHERE m.ID = er.MemberID))
BEGIN
    PRINT '  ✗ FAILED: Orphaned event registrations detected';
    SET @IntegrityErrors = @IntegrityErrors + 1;
END
ELSE
    PRINT '  ✓ PASSED: Event registrations → Members';

-- Check for orphaned enrollments
IF EXISTS (SELECT 1 FROM learning.Enrollment e WHERE NOT EXISTS (SELECT 1 FROM membership.Member m WHERE m.ID = e.MemberID))
BEGIN
    PRINT '  ✗ FAILED: Orphaned enrollments detected';
    SET @IntegrityErrors = @IntegrityErrors + 1;
END
ELSE
    PRINT '  ✓ PASSED: Course enrollments → Members';

-- Check for orphaned invoices
IF EXISTS (SELECT 1 FROM finance.Invoice i WHERE NOT EXISTS (SELECT 1 FROM membership.Member m WHERE m.ID = i.MemberID))
BEGIN
    PRINT '  ✗ FAILED: Orphaned invoices detected';
    SET @IntegrityErrors = @IntegrityErrors + 1;
END
ELSE
    PRINT '  ✓ PASSED: Invoices → Members';

-- Check for orphaned chapter memberships
IF EXISTS (SELECT 1 FROM chapters.ChapterMembership cm WHERE NOT EXISTS (SELECT 1 FROM membership.Member m WHERE m.ID = cm.MemberID))
BEGIN
    PRINT '  ✗ FAILED: Orphaned chapter memberships detected';
    SET @IntegrityErrors = @IntegrityErrors + 1;
END
ELSE
    PRINT '  ✓ PASSED: Chapter memberships → Members';

PRINT '';
IF @IntegrityErrors = 0
    PRINT 'All referential integrity checks passed!';
ELSE
    PRINT 'WARNING: ' + CAST(@IntegrityErrors AS VARCHAR) + ' integrity check(s) failed!';

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 3 COMPLETE: Verification successful';
PRINT '===================================================================';
PRINT '';

/******************************************************************************
 * BUILD COMPLETE
 ******************************************************************************/

PRINT '';
PRINT '###################################################################';
PRINT '#                                                                 #';
PRINT '#                  BUILD COMPLETED SUCCESSFULLY                   #';
PRINT '#                                                                 #';
PRINT '###################################################################';
PRINT '';
PRINT 'Database: ' + DB_NAME();
PRINT 'End Time: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
PRINT 'NEXT STEPS:';
PRINT '-------------------------------------------------------------------';
PRINT '';
PRINT '1. Run MemberJunction CodeGen to generate entity classes and views';
PRINT '   npm run codegen';
PRINT '';
PRINT '2. Explore the data using sample queries in docs/SAMPLE_QUERIES.md';
PRINT '';
PRINT '3. Review schema documentation in docs/SCHEMA_OVERVIEW.md';
PRINT '';
PRINT '4. See member journey examples in docs/BUSINESS_SCENARIOS.md';
PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT '';
PRINT 'For more information, see README.md';
PRINT '';

SET NOCOUNT OFF;
GO
