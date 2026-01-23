/*
 * Migration: Add execution context fields to TestRun and TestSuiteRun entities
 * Version: 3.1.x
 * Purpose: Enable cross-server aggregation of test results without requiring user ID migration.
 *
 * These fields capture:
 *   - MachineName: Hostname of the machine running tests
 *   - MachineID: Unique machine identifier (MAC address) for deduplication
 *   - RunByUserName: Denormalized user name for cross-server identification
 *   - RunByUserEmail: Denormalized user email (unique across systems)
 *   - RunContextDetails: Extensible JSON blob for OS, runtime, and CI/CD context
 *
 * The denormalized user fields (RunByUserName, RunByUserEmail) allow test results
 * to be exported and aggregated across different MemberJunction instances where
 * user IDs will differ but email addresses remain consistent.
 */


-- Ensure metadata is in sync from previous migrations
EXEC [${flyway:defaultSchema}].spRecompileAllViews

EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1

GO

-- =============================================================================
-- Add execution context columns to TestRun table
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.TestRun
ADD MachineName NVARCHAR(255) NULL,
    MachineID NVARCHAR(255) NULL,
    RunByUserName NVARCHAR(255) NULL,
    RunByUserEmail NVARCHAR(255) NULL,
    RunContextDetails NVARCHAR(MAX) NULL;
GO

-- =============================================================================
-- Add execution context columns to TestSuiteRun table
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.TestSuiteRun
ADD MachineName NVARCHAR(255) NULL,
    MachineID NVARCHAR(255) NULL,
    RunByUserName NVARCHAR(255) NULL,
    RunByUserEmail NVARCHAR(255) NULL,
    RunContextDetails NVARCHAR(MAX) NULL;
GO

-- =============================================================================
-- Extended properties for TestRun columns
-- =============================================================================

-- TestRun.MachineName
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hostname of the machine that executed this test. Used for identifying the execution environment and debugging infrastructure-specific issues.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'MachineName';

-- TestRun.MachineID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique machine identifier (typically MAC address) for the execution host. Enables deduplication and tracking of test execution across different machines.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'MachineID';

-- TestRun.RunByUserName
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized user name who ran the test. Stored separately from RunByUserID to enable cross-server aggregation where user IDs differ but names remain consistent.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'RunByUserName';

-- TestRun.RunByUserEmail
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized email address of the user who ran the test. Primary identifier for cross-server aggregation since email addresses are unique across MemberJunction instances.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'RunByUserEmail';

-- TestRun.RunContextDetails
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing extensible execution context: osType, osVersion, nodeVersion, timezone, locale, ipAddress, and CI/CD metadata (ciProvider, pipelineId, buildNumber, branch, prNumber). Allows detailed environment tracking without schema changes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'RunContextDetails';

-- =============================================================================
-- Extended properties for TestSuiteRun columns
-- =============================================================================

-- TestSuiteRun.MachineName
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hostname of the machine that executed this suite. Used for identifying the execution environment and debugging infrastructure-specific issues.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestSuiteRun',
    @level2type = N'COLUMN', @level2name = 'MachineName';

-- TestSuiteRun.MachineID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique machine identifier (typically MAC address) for the execution host. Enables deduplication and tracking of suite execution across different machines.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestSuiteRun',
    @level2type = N'COLUMN', @level2name = 'MachineID';

-- TestSuiteRun.RunByUserName
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized user name who ran the suite. Stored separately from RunByUserID to enable cross-server aggregation where user IDs differ but names remain consistent.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestSuiteRun',
    @level2type = N'COLUMN', @level2name = 'RunByUserName';

-- TestSuiteRun.RunByUserEmail
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized email address of the user who ran the suite. Primary identifier for cross-server aggregation since email addresses are unique across MemberJunction instances.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestSuiteRun',
    @level2type = N'COLUMN', @level2name = 'RunByUserEmail';

-- TestSuiteRun.RunContextDetails
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing extensible execution context: osType, osVersion, nodeVersion, timezone, locale, ipAddress, and CI/CD metadata (ciProvider, pipelineId, buildNumber, branch, prNumber). Allows detailed environment tracking without schema changes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestSuiteRun',
    @level2type = N'COLUMN', @level2name = 'RunContextDetails';


























































-- CODE GEN RUN 
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bd83bc2c-b532-4869-bb34-ae35a7a7ff1a'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'MachineName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bd83bc2c-b532-4869-bb34-ae35a7a7ff1a',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100059,
            'MachineName',
            'Machine Name',
            'Hostname of the machine that executed this test. Used for identifying the execution environment and debugging infrastructure-specific issues.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cc0f088a-8b90-4b4c-afa9-7c1a3e03b959'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'MachineID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cc0f088a-8b90-4b4c-afa9-7c1a3e03b959',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100060,
            'MachineID',
            'Machine ID',
            'Unique machine identifier (typically MAC address) for the execution host. Enables deduplication and tracking of test execution across different machines.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '685b3477-69e7-49c9-bde2-be09d15bf115'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'RunByUserName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '685b3477-69e7-49c9-bde2-be09d15bf115',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100061,
            'RunByUserName',
            'Run By User Name',
            'Denormalized user name who ran the test. Stored separately from RunByUserID to enable cross-server aggregation where user IDs differ but names remain consistent.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f0098b66-6b25-4cdb-8737-88238597a2d9'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'RunByUserEmail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f0098b66-6b25-4cdb-8737-88238597a2d9',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100062,
            'RunByUserEmail',
            'Run By User Email',
            'Denormalized email address of the user who ran the test. Primary identifier for cross-server aggregation since email addresses are unique across MemberJunction instances.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fa2957ee-1af9-4a48-863b-856fce0cfe60'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'RunContextDetails')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fa2957ee-1af9-4a48-863b-856fce0cfe60',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100063,
            'RunContextDetails',
            'Run Context Details',
            'JSON object containing extensible execution context: osType, osVersion, nodeVersion, timezone, locale, ipAddress, and CI/CD metadata (ciProvider, pipelineId, buildNumber, branch, prNumber). Allows detailed environment tracking without schema changes.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '205a19ee-861a-4c33-a8cd-af0ac7706462'  OR 
               (EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'MachineName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '205a19ee-861a-4c33-a8cd-af0ac7706462',
            '61438D17-BE0C-4BFF-A1B3-C014279A3BA7', -- Entity: MJ: Test Suite Runs
            100054,
            'MachineName',
            'Machine Name',
            'Hostname of the machine that executed this suite. Used for identifying the execution environment and debugging infrastructure-specific issues.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9cef3982-9e86-49a6-975a-cf932380c4de'  OR 
               (EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'MachineID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9cef3982-9e86-49a6-975a-cf932380c4de',
            '61438D17-BE0C-4BFF-A1B3-C014279A3BA7', -- Entity: MJ: Test Suite Runs
            100055,
            'MachineID',
            'Machine ID',
            'Unique machine identifier (typically MAC address) for the execution host. Enables deduplication and tracking of suite execution across different machines.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'af786503-ae28-437e-9c27-7954906fdd7b'  OR 
               (EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'RunByUserName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'af786503-ae28-437e-9c27-7954906fdd7b',
            '61438D17-BE0C-4BFF-A1B3-C014279A3BA7', -- Entity: MJ: Test Suite Runs
            100056,
            'RunByUserName',
            'Run By User Name',
            'Denormalized user name who ran the suite. Stored separately from RunByUserID to enable cross-server aggregation where user IDs differ but names remain consistent.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4e6deb91-0d3a-468a-a6ca-058e8b14262c'  OR 
               (EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'RunByUserEmail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4e6deb91-0d3a-468a-a6ca-058e8b14262c',
            '61438D17-BE0C-4BFF-A1B3-C014279A3BA7', -- Entity: MJ: Test Suite Runs
            100057,
            'RunByUserEmail',
            'Run By User Email',
            'Denormalized email address of the user who ran the suite. Primary identifier for cross-server aggregation since email addresses are unique across MemberJunction instances.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1cd9ec90-0256-404e-82e4-1edc01fad3c4'  OR 
               (EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'RunContextDetails')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1cd9ec90-0256-404e-82e4-1edc01fad3c4',
            '61438D17-BE0C-4BFF-A1B3-C014279A3BA7', -- Entity: MJ: Test Suite Runs
            100058,
            'RunContextDetails',
            'Run Context Details',
            'JSON object containing extensible execution context: osType, osVersion, nodeVersion, timezone, locale, ipAddress, and CI/CD metadata (ciProvider, pipelineId, buildNumber, branch, prNumber). Allows detailed environment tracking without schema changes.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* Index for Foreign Keys for TestRunFeedback */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TestRunID in table TestRunFeedback
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunFeedback_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRunFeedback]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRunFeedback_TestRunID ON [${flyway:defaultSchema}].[TestRunFeedback] ([TestRunID]);

-- Index for foreign key ReviewerUserID in table TestRunFeedback
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunFeedback_ReviewerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRunFeedback]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRunFeedback_ReviewerUserID ON [${flyway:defaultSchema}].[TestRunFeedback] ([ReviewerUserID]);

/* Index for Foreign Keys for TestRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TestID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_TestID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_TestID ON [${flyway:defaultSchema}].[TestRun] ([TestID]);

-- Index for foreign key TestSuiteRunID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_TestSuiteRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_TestSuiteRunID ON [${flyway:defaultSchema}].[TestRun] ([TestSuiteRunID]);

-- Index for foreign key RunByUserID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_RunByUserID ON [${flyway:defaultSchema}].[TestRun] ([RunByUserID]);

/* Index for Foreign Keys for TestSuiteRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SuiteID in table TestSuiteRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestSuiteRun_SuiteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestSuiteRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestSuiteRun_SuiteID ON [${flyway:defaultSchema}].[TestSuiteRun] ([SuiteID]);

-- Index for foreign key RunByUserID in table TestSuiteRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestSuiteRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestSuiteRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestSuiteRun_RunByUserID ON [${flyway:defaultSchema}].[TestSuiteRun] ([RunByUserID]);

/* Base View SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: vwTestRunFeedbacks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Run Feedbacks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestRunFeedback
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestRunFeedbacks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestRunFeedbacks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestRunFeedbacks]
AS
SELECT
    t.*,
    TestRun_TestRunID.[Test] AS [TestRun],
    User_ReviewerUserID.[Name] AS [ReviewerUser]
FROM
    [${flyway:defaultSchema}].[TestRunFeedback] AS t
INNER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS TestRun_TestRunID
  ON
    [t].[TestRunID] = TestRun_TestRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_ReviewerUserID
  ON
    [t].[ReviewerUserID] = User_ReviewerUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunFeedbacks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: Permissions for vwTestRunFeedbacks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunFeedbacks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spCreateTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunFeedback]
    @ID uniqueidentifier = NULL,
    @TestRunID uniqueidentifier,
    @ReviewerUserID uniqueidentifier,
    @Rating int,
    @IsCorrect bit,
    @CorrectionSummary nvarchar(MAX),
    @Comments nvarchar(MAX),
    @ReviewedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRunFeedback]
            (
                [ID],
                [TestRunID],
                [ReviewerUserID],
                [Rating],
                [IsCorrect],
                [CorrectionSummary],
                [Comments],
                [ReviewedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestRunID,
                @ReviewerUserID,
                @Rating,
                @IsCorrect,
                @CorrectionSummary,
                @Comments,
                ISNULL(@ReviewedAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRunFeedback]
            (
                [TestRunID],
                [ReviewerUserID],
                [Rating],
                [IsCorrect],
                [CorrectionSummary],
                [Comments],
                [ReviewedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestRunID,
                @ReviewerUserID,
                @Rating,
                @IsCorrect,
                @CorrectionSummary,
                @Comments,
                ISNULL(@ReviewedAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestRunFeedbacks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spUpdateTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunFeedback]
    @ID uniqueidentifier,
    @TestRunID uniqueidentifier,
    @ReviewerUserID uniqueidentifier,
    @Rating int,
    @IsCorrect bit,
    @CorrectionSummary nvarchar(MAX),
    @Comments nvarchar(MAX),
    @ReviewedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunFeedback]
    SET
        [TestRunID] = @TestRunID,
        [ReviewerUserID] = @ReviewerUserID,
        [Rating] = @Rating,
        [IsCorrect] = @IsCorrect,
        [CorrectionSummary] = @CorrectionSummary,
        [Comments] = @Comments,
        [ReviewedAt] = @ReviewedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestRunFeedbacks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestRunFeedbacks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRunFeedback table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRunFeedback]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRunFeedback];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRunFeedback
ON [${flyway:defaultSchema}].[TestRunFeedback]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunFeedback]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRunFeedback] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spDeleteTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunFeedback]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestRunFeedback]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunFeedback] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunFeedback] TO [cdp_Integration]



/* Base View SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: vwTestRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestRuns]
AS
SELECT
    t.*,
    Test_TestID.[Name] AS [Test],
    TestSuiteRun_TestSuiteRunID.[Suite] AS [TestSuiteRun],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[TestRun] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Test] AS Test_TestID
  ON
    [t].[TestID] = Test_TestID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestSuiteRuns] AS TestSuiteRun_TestSuiteRunID
  ON
    [t].[TestSuiteRunID] = TestSuiteRun_TestSuiteRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [t].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: Permissions for vwTestRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spCreateTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRun]
    @ID uniqueidentifier = NULL,
    @TestID uniqueidentifier,
    @TestSuiteRunID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Sequence int,
    @TargetType nvarchar(100),
    @TargetLogID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @DurationSeconds decimal(10, 3),
    @InputData nvarchar(MAX),
    @ExpectedOutputData nvarchar(MAX),
    @ActualOutputData nvarchar(MAX),
    @PassedChecks int,
    @FailedChecks int,
    @TotalChecks int,
    @Score decimal(5, 4),
    @CostUSD decimal(10, 6),
    @ErrorMessage nvarchar(MAX),
    @ResultDetails nvarchar(MAX),
    @Log nvarchar(MAX),
    @Tags nvarchar(MAX),
    @MachineName nvarchar(255),
    @MachineID nvarchar(255),
    @RunByUserName nvarchar(255),
    @RunByUserEmail nvarchar(255),
    @RunContextDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRun]
            (
                [ID],
                [TestID],
                [TestSuiteRunID],
                [RunByUserID],
                [Sequence],
                [TargetType],
                [TargetLogID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationSeconds],
                [InputData],
                [ExpectedOutputData],
                [ActualOutputData],
                [PassedChecks],
                [FailedChecks],
                [TotalChecks],
                [Score],
                [CostUSD],
                [ErrorMessage],
                [ResultDetails],
                [Log],
                [Tags],
                [MachineName],
                [MachineID],
                [RunByUserName],
                [RunByUserEmail],
                [RunContextDetails]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestID,
                @TestSuiteRunID,
                @RunByUserID,
                @Sequence,
                @TargetType,
                @TargetLogID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @DurationSeconds,
                @InputData,
                @ExpectedOutputData,
                @ActualOutputData,
                @PassedChecks,
                @FailedChecks,
                @TotalChecks,
                @Score,
                @CostUSD,
                @ErrorMessage,
                @ResultDetails,
                @Log,
                @Tags,
                @MachineName,
                @MachineID,
                @RunByUserName,
                @RunByUserEmail,
                @RunContextDetails
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRun]
            (
                [TestID],
                [TestSuiteRunID],
                [RunByUserID],
                [Sequence],
                [TargetType],
                [TargetLogID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationSeconds],
                [InputData],
                [ExpectedOutputData],
                [ActualOutputData],
                [PassedChecks],
                [FailedChecks],
                [TotalChecks],
                [Score],
                [CostUSD],
                [ErrorMessage],
                [ResultDetails],
                [Log],
                [Tags],
                [MachineName],
                [MachineID],
                [RunByUserName],
                [RunByUserEmail],
                [RunContextDetails]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestID,
                @TestSuiteRunID,
                @RunByUserID,
                @Sequence,
                @TargetType,
                @TargetLogID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @DurationSeconds,
                @InputData,
                @ExpectedOutputData,
                @ActualOutputData,
                @PassedChecks,
                @FailedChecks,
                @TotalChecks,
                @Score,
                @CostUSD,
                @ErrorMessage,
                @ResultDetails,
                @Log,
                @Tags,
                @MachineName,
                @MachineID,
                @RunByUserName,
                @RunByUserEmail,
                @RunContextDetails
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spUpdateTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRun]
    @ID uniqueidentifier,
    @TestID uniqueidentifier,
    @TestSuiteRunID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Sequence int,
    @TargetType nvarchar(100),
    @TargetLogID uniqueidentifier,
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @DurationSeconds decimal(10, 3),
    @InputData nvarchar(MAX),
    @ExpectedOutputData nvarchar(MAX),
    @ActualOutputData nvarchar(MAX),
    @PassedChecks int,
    @FailedChecks int,
    @TotalChecks int,
    @Score decimal(5, 4),
    @CostUSD decimal(10, 6),
    @ErrorMessage nvarchar(MAX),
    @ResultDetails nvarchar(MAX),
    @Log nvarchar(MAX),
    @Tags nvarchar(MAX),
    @MachineName nvarchar(255),
    @MachineID nvarchar(255),
    @RunByUserName nvarchar(255),
    @RunByUserEmail nvarchar(255),
    @RunContextDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRun]
    SET
        [TestID] = @TestID,
        [TestSuiteRunID] = @TestSuiteRunID,
        [RunByUserID] = @RunByUserID,
        [Sequence] = @Sequence,
        [TargetType] = @TargetType,
        [TargetLogID] = @TargetLogID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [DurationSeconds] = @DurationSeconds,
        [InputData] = @InputData,
        [ExpectedOutputData] = @ExpectedOutputData,
        [ActualOutputData] = @ActualOutputData,
        [PassedChecks] = @PassedChecks,
        [FailedChecks] = @FailedChecks,
        [TotalChecks] = @TotalChecks,
        [Score] = @Score,
        [CostUSD] = @CostUSD,
        [ErrorMessage] = @ErrorMessage,
        [ResultDetails] = @ResultDetails,
        [Log] = @Log,
        [Tags] = @Tags,
        [MachineName] = @MachineName,
        [MachineID] = @MachineID,
        [RunByUserName] = @RunByUserName,
        [RunByUserEmail] = @RunByUserEmail,
        [RunContextDetails] = @RunContextDetails
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRun
ON [${flyway:defaultSchema}].[TestRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spDeleteTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRun] TO [cdp_Integration]



/* Base View SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: vwTestSuiteRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Suite Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestSuiteRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestSuiteRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestSuiteRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestSuiteRuns]
AS
SELECT
    t.*,
    TestSuite_SuiteID.[Name] AS [Suite],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[TestSuiteRun] AS t
INNER JOIN
    [${flyway:defaultSchema}].[TestSuite] AS TestSuite_SuiteID
  ON
    [t].[SuiteID] = TestSuite_SuiteID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [t].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuiteRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: Permissions for vwTestSuiteRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuiteRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spCreateTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuiteRun]
    @ID uniqueidentifier = NULL,
    @SuiteID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Environment nvarchar(50),
    @TriggerType nvarchar(50),
    @GitCommit nvarchar(100),
    @AgentVersion nvarchar(100),
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @TotalTests int,
    @PassedTests int,
    @FailedTests int,
    @SkippedTests int,
    @ErrorTests int,
    @TotalDurationSeconds decimal(10, 3),
    @TotalCostUSD decimal(10, 6),
    @Configuration nvarchar(MAX),
    @ResultSummary nvarchar(MAX),
    @ErrorMessage nvarchar(MAX),
    @Tags nvarchar(MAX),
    @MachineName nvarchar(255),
    @MachineID nvarchar(255),
    @RunByUserName nvarchar(255),
    @RunByUserEmail nvarchar(255),
    @RunContextDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestSuiteRun]
            (
                [ID],
                [SuiteID],
                [RunByUserID],
                [Environment],
                [TriggerType],
                [GitCommit],
                [AgentVersion],
                [Status],
                [StartedAt],
                [CompletedAt],
                [TotalTests],
                [PassedTests],
                [FailedTests],
                [SkippedTests],
                [ErrorTests],
                [TotalDurationSeconds],
                [TotalCostUSD],
                [Configuration],
                [ResultSummary],
                [ErrorMessage],
                [Tags],
                [MachineName],
                [MachineID],
                [RunByUserName],
                [RunByUserEmail],
                [RunContextDetails]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SuiteID,
                @RunByUserID,
                @Environment,
                @TriggerType,
                @GitCommit,
                @AgentVersion,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @TotalTests,
                @PassedTests,
                @FailedTests,
                @SkippedTests,
                @ErrorTests,
                @TotalDurationSeconds,
                @TotalCostUSD,
                @Configuration,
                @ResultSummary,
                @ErrorMessage,
                @Tags,
                @MachineName,
                @MachineID,
                @RunByUserName,
                @RunByUserEmail,
                @RunContextDetails
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestSuiteRun]
            (
                [SuiteID],
                [RunByUserID],
                [Environment],
                [TriggerType],
                [GitCommit],
                [AgentVersion],
                [Status],
                [StartedAt],
                [CompletedAt],
                [TotalTests],
                [PassedTests],
                [FailedTests],
                [SkippedTests],
                [ErrorTests],
                [TotalDurationSeconds],
                [TotalCostUSD],
                [Configuration],
                [ResultSummary],
                [ErrorMessage],
                [Tags],
                [MachineName],
                [MachineID],
                [RunByUserName],
                [RunByUserEmail],
                [RunContextDetails]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SuiteID,
                @RunByUserID,
                @Environment,
                @TriggerType,
                @GitCommit,
                @AgentVersion,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @TotalTests,
                @PassedTests,
                @FailedTests,
                @SkippedTests,
                @ErrorTests,
                @TotalDurationSeconds,
                @TotalCostUSD,
                @Configuration,
                @ResultSummary,
                @ErrorMessage,
                @Tags,
                @MachineName,
                @MachineID,
                @RunByUserName,
                @RunByUserEmail,
                @RunContextDetails
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestSuiteRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spUpdateTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuiteRun]
    @ID uniqueidentifier,
    @SuiteID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Environment nvarchar(50),
    @TriggerType nvarchar(50),
    @GitCommit nvarchar(100),
    @AgentVersion nvarchar(100),
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @TotalTests int,
    @PassedTests int,
    @FailedTests int,
    @SkippedTests int,
    @ErrorTests int,
    @TotalDurationSeconds decimal(10, 3),
    @TotalCostUSD decimal(10, 6),
    @Configuration nvarchar(MAX),
    @ResultSummary nvarchar(MAX),
    @ErrorMessage nvarchar(MAX),
    @Tags nvarchar(MAX),
    @MachineName nvarchar(255),
    @MachineID nvarchar(255),
    @RunByUserName nvarchar(255),
    @RunByUserEmail nvarchar(255),
    @RunContextDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuiteRun]
    SET
        [SuiteID] = @SuiteID,
        [RunByUserID] = @RunByUserID,
        [Environment] = @Environment,
        [TriggerType] = @TriggerType,
        [GitCommit] = @GitCommit,
        [AgentVersion] = @AgentVersion,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [TotalTests] = @TotalTests,
        [PassedTests] = @PassedTests,
        [FailedTests] = @FailedTests,
        [SkippedTests] = @SkippedTests,
        [ErrorTests] = @ErrorTests,
        [TotalDurationSeconds] = @TotalDurationSeconds,
        [TotalCostUSD] = @TotalCostUSD,
        [Configuration] = @Configuration,
        [ResultSummary] = @ResultSummary,
        [ErrorMessage] = @ErrorMessage,
        [Tags] = @Tags,
        [MachineName] = @MachineName,
        [MachineID] = @MachineID,
        [RunByUserName] = @RunByUserName,
        [RunByUserEmail] = @RunByUserEmail,
        [RunContextDetails] = @RunContextDetails
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestSuiteRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestSuiteRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestSuiteRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestSuiteRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestSuiteRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestSuiteRun
ON [${flyway:defaultSchema}].[TestSuiteRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuiteRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestSuiteRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spDeleteTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuiteRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestSuiteRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuiteRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuiteRun] TO [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '65595F32-31AA-4816-B077-9488CCFE677C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DB8DDD2E-89AC-4582-8BEA-641661E86438'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5BDC96C5-0413-443A-ABF8-77650EBFD284'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '685B3477-69E7-49C9-BDE2-BE09D15BF115'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '96A90EF2-FD85-45EB-880B-A5A129DFDDFF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '685B3477-69E7-49C9-BDE2-BE09D15BF115'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F0098B66-6B25-4CDB-8737-88238597A2D9'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2AFAE6A-85C8-4F86-AAF6-3E2C80F26426'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C82EE5E6-31FA-4B8B-B8E2-7348FF39B59B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1EA0915F-754B-4E6B-B83D-E33C027B75BC'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BCA7B1C6-36B3-4635-9822-45C9CE51811C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5752BA11-C1FA-4A45-8761-4396E9D9165B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '58F57666-1327-4F93-8E57-85DE91AA141A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F6306495-EE6F-447A-9F9D-6455EEE10355'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AF786503-AE28-437E-9C27-7954906FDD7B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4E6DEB91-0D3A-468A-A6CA-058E8B14262C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D2AFAE6A-85C8-4F86-AAF6-3E2C80F26426'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C82EE5E6-31FA-4B8B-B8E2-7348FF39B59B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AD40479B-D912-44D0-96BA-237C2D44179C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3522C611-90AE-438D-87F4-3747E36EF94F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2BFACAE1-586A-4682-BF69-D029EA451485'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '205A19EE-861A-4C33-A8CD-AF0AC7706462'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF786503-AE28-437E-9C27-7954906FDD7B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4E6DEB91-0D3A-468A-A6CA-058E8B14262C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'EED41ED3-16BF-4FC2-B333-241CCB366587'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6237F9DB-DE75-4867-8F2D-C4F02992D728'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5CF03A74-A899-4393-B270-6F03AE3E8690'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DF28BEC8-CB67-42E7-A7A6-0A060D8F1C22'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EED41ED3-16BF-4FC2-B333-241CCB366587'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '43350AA7-95CB-4903-863A-7DB5C6E4361E'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '45B5576A-D6C5-4798-9E4A-801DFB999420'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EED41ED3-16BF-4FC2-B333-241CCB366587'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '43350AA7-95CB-4903-863A-7DB5C6E4361E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5F7A6E9C-83E2-4801-A8A2-8B25ACA186BE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2114C507-DB13-4864-8CF8-76B205F55FE3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Reviewer',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C1D5A2EF-26DA-4DAA-9133-0F24A8181872'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Feedback Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rating',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6237F9DB-DE75-4867-8F2D-C4F02992D728'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Feedback Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Correct',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5CF03A74-A899-4393-B270-6F03AE3E8690'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Feedback Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Correction Summary',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '45B5576A-D6C5-4798-9E4A-801DFB999420'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Feedback Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D826D87-CCFB-4753-B6FD-193621FFA498'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Reviewed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF28BEC8-CB67-42E7-A7A6-0A060D8F1C22'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D68692E0-7BD0-4F6E-A0A1-683FA45B58FE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '67B00A5A-4470-4AB9-8171-50F3CDD8FA88'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EED41ED3-16BF-4FC2-B333-241CCB366587'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Reviewer User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '43350AA7-95CB-4903-863A-7DB5C6E4361E'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Feedback Content":{"icon":"fa fa-comment-dots","description":"Reviewer ratings, correctness flag, and detailed correction notes"},"Review Context":{"icon":"fa fa-user","description":"Information about which test run was reviewed, who reviewed it, and when"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and primary identifier"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '99B00220-BABA-4C42-BC7C-00E1EE14651C' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Feedback Content":"fa fa-comment-dots","Review Context":"fa fa-user","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '99B00220-BABA-4C42-BC7C-00E1EE14651C' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 33 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '198553FB-E3EB-44EA-9B0F-9255D20A837A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '690BF97C-3C43-45AC-BF0F-519E37E34847'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '313268F4-A069-46E8-8EE5-977F962EE18F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '217D524D-8C3E-4EAC-8F5A-5F83EA4FE66A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A67615F-FFD9-40F2-8BB4-6488ED7889A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '685B3477-69E7-49C9-BDE2-BE09D15BF115'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'F0098B66-6B25-4CDB-8737-88238597A2D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '96A90EF2-FD85-45EB-880B-A5A129DFDDFF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C05BE7DE-C0A5-4A5A-9CC0-EBF0AC47BA7B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0FEB23F7-390A-4252-8552-3FB743E916AF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Suite Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '474B4535-FEF5-4F52-AB4B-0FF00D355F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Suite Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF46472C-28A2-4352-8699-D29597540B8D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '088A8796-A0C6-4EDE-82E9-8E0BF053423F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '65595F32-31AA-4816-B077-9488CCFE677C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB8DDD2E-89AC-4582-8BEA-641661E86438'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C612E089-6D4B-48A0-A602-5CE28FCDF9B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration Seconds',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC65C4D6-DF53-4ADF-8E89-52D8758E1FC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tags',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '397883C9-1EF4-4110-990F-B2D20AB70EF8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Machine Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BD83BC2C-B532-4869-BB34-AE35A7A7FF1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Machine ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CC0F088A-8B90-4B4C-AFA9-7C1A3E03B959'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run Context Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA2957EE-1AF9-4A48-863B-856FCE0CFE60'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Input & Expected Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F3A5CA76-8028-40BE-A9E6-3D64B28B63E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Input & Expected Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expected Output Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C25A0964-8F7C-4524-93AC-8FE405F81984'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Input & Expected Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Actual Output Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '10DC4732-7E88-4011-A7DA-DC61A9C4E9E0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Passed Checks',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '103DC144-D077-4AE9-9F8C-DB5DB9CBB006'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failed Checks',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9529238-E9DE-4272-893F-C5896EE0E2B4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Checks',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0AF62261-73BC-4F22-BE99-206342B98760'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5BDC96C5-0413-443A-ABF8-77650EBFD284'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cost USD',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '27FBF8EA-72D5-4ED0-B8A9-5E112B8DCB88'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3427E9D3-A19A-462F-9D42-7A3F8242A9C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '806F24FE-646E-4AC4-968F-14E067DC43BD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DBDFAA6B-C4B1-4540-B301-CECDC1BFF1D5'
   AND AutoUpdateCategory = 1

/* Set categories for 30 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '520BD647-B226-4D88-852D-754E18B10CDD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B947CA05-E3D0-4A60-BADF-946EDFDAB6E4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D88912D-6C51-4E18-888D-8F576F342969'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Suite',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F9DC6CA0-D197-4BC1-843C-4FB72EA118E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A0C22922-47CD-427D-B0A4-8C0C047FDE70'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2AFAE6A-85C8-4F86-AAF6-3E2C80F26426'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Trigger Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C82EE5E6-31FA-4B8B-B8E2-7348FF39B59B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Git Commit',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD40479B-D912-44D0-96BA-237C2D44179C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3522C611-90AE-438D-87F4-3747E36EF94F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tags',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2BFACAE1-586A-4682-BF69-D029EA451485'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Suite',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EA9BC0FD-B87E-479D-940E-C872CF8A1C8A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1EA0915F-754B-4E6B-B83D-E33C027B75BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BCA7B1C6-36B3-4635-9822-45C9CE51811C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B3AD9C4-0DF8-4128-A90E-9449FF3D53BE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5752BA11-C1FA-4A45-8761-4396E9D9165B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Passed Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '58F57666-1327-4F93-8E57-85DE91AA141A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failed Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F6306495-EE6F-447A-9F9D-6455EEE10355'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skipped Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E3C00A2-5683-4532-A717-CB994DE9B501'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC2EA1C2-B5DF-46BD-AB72-9A4B6FA3E5B5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Duration (seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8C6DEC81-DA98-4581-9735-67100444919B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Cost (USD)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '503FA777-2E62-45B3-8D4D-6E054F574C28'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D07688B-F6F8-4281-A4BA-A45533E0ECCA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result Summary',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B651E95D-9675-464F-B2F6-CC71234A1A17'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '760DA45F-0330-4776-8E30-27118035581D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Host',
       GeneratedFormSection = 'Category',
       DisplayName = 'Machine Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '205A19EE-861A-4C33-A8CD-AF0AC7706462'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Host',
       GeneratedFormSection = 'Category',
       DisplayName = 'Machine ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9CEF3982-9E86-49A6-975A-CF932380C4DE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF786503-AE28-437E-9C27-7954906FDD7B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '4E6DEB91-0D3A-468A-A6CA-058E8B14262C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run Context Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1CD9EC90-0256-404E-82E4-1EDC01FAD3C4'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record creation and modification"},"Test & Target Info":{"icon":"fa fa-bullseye","description":"Identifiers and descriptive fields linking the run to its test definition and execution target"},"Run Metadata":{"icon":"fa fa-clock","description":"Timing, status and sequencing information that describes how and when the test was executed"},"Input & Expected Output":{"icon":"fa fa-database","description":"JSON payloads representing inputs supplied to the test and the expected versus actual outputs"},"Result Analysis":{"icon":"fa fa-chart-line","description":"Validation metrics, scores, cost and diagnostic details produced by the test execution"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":"fa fa-cog","Test & Target Info":"fa fa-bullseye","Run Metadata":"fa fa-clock","Input & Expected Output":"fa fa-database","Result Analysis":"fa fa-chart-line"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'FieldCategoryIcons'
            

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Execution Host":{"icon":"fa fa-server","description":"Details about the physical or virtual machine that executed the suite run"},"User Details":{"icon":"fa fa-user","description":"Denormalized user information and extended execution context for the run initiator"},"Run Identification":{"icon":"fa fa-play-circle","description":"Key identifiers and context for the suite execution such as suite reference, trigger, environment, and version details"},"Execution Timeline & Status":{"icon":"fa fa-clock","description":"Lifecycle timestamps and current status of the suite run"},"Test Metrics":{"icon":"fa fa-chart-line","description":"Aggregated counts, durations, and cost information for the executed tests"},"Technical Output":{"icon":"fa fa-file-code","description":"Raw configuration, result JSON and any error messages generated by the run"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and primary identifier"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Execution Host":"fa fa-server","User Details":"fa fa-user","Run Identification":"fa fa-play-circle","Execution Timeline & Status":"fa fa-clock","Test Metrics":"fa fa-chart-line","Technical Output":"fa fa-file-code","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'FieldCategoryIcons'
            

