-- ════════════════════════════════════════════════════════════════════════════════════════
-- Prune the pre-consolidation Computer Use regression tests (T01-T25)
--
-- The v5 baselines seeded 25 Computer Use tests and their memberships in the MJ Explorer
-- Regression Suite. The regression corpus has since been consolidated into T001-T155 and
-- moved out of the base instance to metadata-optional/regression-test, so standard MJ now
-- ships only the 'Computer Use' TestType definition. These 25 rows are obsolete on every
-- instance that still carries them.
--
-- WHY A MIGRATION RATHER THAN METADATA DELETE RECORDS
-- A deleteRecord directive stamps deletedAt back into its own file after a successful
-- delete, and re-stamps it on any database where the row is still present. CI rebuilds from
-- the baselines on every run, so the rows are always present, the files are always rewritten,
-- and the CodeGen drift gate can never be green. A migration runs once per database and
-- leaves the committed tree untouched.
--
-- WHY THE TEST DELETE IS CONDITIONAL
-- Suite memberships go unconditionally -- a junction row carries nothing of its own. A test
-- row goes only when nothing recorded a run against it. TestRun carries AIAgentRun,
-- AIPromptRun, Conversation, ConversationDetail, TestRunFeedback and TestRunOutput behind it,
-- and discarding that history to remove an unused test row is the wrong trade. An instance
-- that ran one of these keeps the row -- out of every suite, so it can never run again.
--
-- Idempotent: every statement is a no-op once its rows are gone.
-- ════════════════════════════════════════════════════════════════════════════════════════

SET XACT_ABORT ON;

DECLARE @ObsoleteTests TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);

INSERT INTO @ObsoleteTests (ID) VALUES
    ('2F4CAED9-0916-433E-8A63-70C4B71B337B'), -- T01 - Login Smoke
    ('5FF83062-9015-4E5E-8BD7-3C38F22A5356'), -- T02 - Home Application Load
    ('010D3E19-FFE9-4D91-A68B-5300F0CABE92'), -- T03 - Application Switcher
    ('F83547E5-E480-424E-BF85-999324FB8DB4'), -- T04 - Data Explorer Browse Entities
    ('2BB830E5-AAB2-4537-BC35-366E5F7D9D31'), -- T05 - Data Explorer Open Entity Record
    ('8D4FF31A-B6D0-4E02-9528-4F0D0E240851'), -- T06 - Data Explorer Search
    ('BBC02CFF-554C-4587-915B-FE55FF351AC5'), -- T07 - Entity Form View Record Details
    ('8F37873C-FD30-4C2C-A875-716DCE7C9E77'), -- T08 - Navigation and Tab Management
    ('5F97BC52-9D41-4152-B8DA-1E3A6C07E66E'), -- T09 - Entity Form Create New Record
    ('E3EDE599-BBCB-4AB0-947E-76E933261185'), -- T10 - Entity Form Edit and Save Record
    ('A5174558-E08A-4A33-982C-2ADCACC01100'), -- T11 - Run a Saved Query
    ('9E9BED5F-AEF5-42FE-A892-2CF09EF44952'), -- T12 - Admin Dashboard ERD Viewer
    ('3881D46F-D7C9-46DE-B3E3-D54FB8DA4566'), -- T13 - Admin Dashboard User Management
    ('566E4865-BB38-49D0-921F-D32E7CE451AA'), -- T14 - AI Application Agent List View
    ('92255EB2-CC3D-4FF2-8652-EE2CFB5D8A6D'), -- T15 - AI Application Prompt Management
    ('5BE50BF7-D0C4-4A02-A441-41C8ECF08CF6'), -- T16 - Lists Create and Populate
    ('D94781D3-F117-4832-B497-3CDB9CE2296E'), -- T17 - Settings Page Navigation
    ('3CEF8310-6CDD-493F-824D-C13EB9BB9217'), -- T18 - Communication Templates View
    ('F89CF3DF-CDC1-4460-9BD1-C98E750C163F'), -- T19 - Query Browser Execute Query
    ('4069DC55-B2BB-452C-8AD2-599802D90E6B'), -- T20 - Dashboard Browser
    ('7F861EDC-EDEF-4333-8EFE-C9B6F2209404'), -- T21 - AI Monitor Dashboard
    ('5266CE50-884B-4AAD-B450-07098B547C8D'), -- T22 - Integrations Overview
    ('36A5AAA2-25B8-42FC-A06A-DF19BFEA56F0'), -- T23 - Handle Invalid Navigation Gracefully
    ('C2496941-0035-4B09-9E5C-C4D53822F940'), -- T24 - Session Persistence Reload Page
    ('98B5BFE9-41F3-465E-9C68-25CBD4B7E48A'); -- T25 - Multiple Tab Workflow

-- Memberships first: FK_TestSuiteTest_Test blocks the test delete while they stand.
DELETE FROM [${flyway:defaultSchema}].[TestSuiteTest]
WHERE [TestID] IN (SELECT [ID] FROM @ObsoleteTests);

DELETE t
FROM [${flyway:defaultSchema}].[Test] AS t
WHERE t.[ID] IN (SELECT [ID] FROM @ObsoleteTests)
  AND NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[TestRun] AS tr WHERE tr.[TestID] = t.[ID]
  );
