/*******************************************************************************
 * Migration: Add Multi-Tenant Scoping to Agent Memory
 *
 * Purpose: Enable multi-tenant SaaS applications to scope agent notes and
 *          examples by custom entity hierarchies (Organization → Contact, etc.)
 *          without hardcoding any specific entity schema.
 *
 * Changes:
 *   1. AIAgent - Add ScopeConfig JSON column for agent-level scope definition
 *   2. AIAgentRun - Add scope columns to record context for each run
 *   3. AIAgentNote - Add scope columns for tenant-aware note storage
 *   4. AIAgentExample - Add scope columns for tenant-aware example storage
 *
 * Design:
 *   - PrimaryScopeEntityID: FK to Entity table (which entity type is the scope)
 *   - PrimaryScopeRecordID: The actual record ID (indexed for fast filtering)
 *   - SecondaryScopes: JSON for additional scope dimensions
 *
 * Query Pattern:
 *   - Primary scope is indexed for fast filtering (millions → thousands)
 *   - Secondary scopes use JSON functions for fine-grained filtering
 *
 * Scope Levels:
 *   - Global: PrimaryScopeRecordID IS NULL
 *   - Primary-only: PrimaryScopeRecordID set, SecondaryScopes empty
 *   - Fully-scoped: Both primary and secondary scopes set
 ******************************************************************************/

-- ============================================================================
-- 1. AIAgent - Add ScopeConfig for agent-level scope definition
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    ScopeConfig NVARCHAR(MAX) NULL;
GO

-- ============================================================================
-- 2. AIAgentRun - Add scope columns to record context for each run
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun ADD
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL,
    PrimaryScopeRecordID NVARCHAR(100) NULL,
    SecondaryScopes NVARCHAR(MAX) NULL;
GO

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun ADD CONSTRAINT
    FK_AIAgentRun_PrimaryScopeEntity FOREIGN KEY (PrimaryScopeEntityID)
    REFERENCES ${flyway:defaultSchema}.Entity(ID);
GO

-- Add index for primary scope lookup
CREATE NONCLUSTERED INDEX IX_AIAgentRun_PrimaryScope
    ON ${flyway:defaultSchema}.AIAgentRun(PrimaryScopeEntityID, PrimaryScopeRecordID)
    WHERE PrimaryScopeRecordID IS NOT NULL;

-- ============================================================================
-- 3. AIAgentNote - Add scope columns for tenant-aware note storage
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL,
    PrimaryScopeRecordID NVARCHAR(100) NULL,
    SecondaryScopes NVARCHAR(MAX) NULL;
GO

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD CONSTRAINT
    FK_AIAgentNote_PrimaryScopeEntity FOREIGN KEY (PrimaryScopeEntityID)
    REFERENCES ${flyway:defaultSchema}.Entity(ID);
GO

-- Add index for primary scope lookup (critical for query performance)
CREATE NONCLUSTERED INDEX IX_AIAgentNote_PrimaryScope
    ON ${flyway:defaultSchema}.AIAgentNote(AgentID, PrimaryScopeEntityID, PrimaryScopeRecordID)
    WHERE PrimaryScopeRecordID IS NOT NULL;

-- ============================================================================
-- 4. AIAgentExample - Add scope columns for tenant-aware example storage
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgentExample ADD
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL,
    PrimaryScopeRecordID NVARCHAR(100) NULL,
    SecondaryScopes NVARCHAR(MAX) NULL;
GO

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIAgentExample ADD CONSTRAINT
    FK_AIAgentExample_PrimaryScopeEntity FOREIGN KEY (PrimaryScopeEntityID)
    REFERENCES ${flyway:defaultSchema}.Entity(ID);
GO

-- Add index for primary scope lookup
CREATE NONCLUSTERED INDEX IX_AIAgentExample_PrimaryScope
    ON ${flyway:defaultSchema}.AIAgentExample(AgentID, PrimaryScopeEntityID, PrimaryScopeRecordID)
    WHERE PrimaryScopeRecordID IS NOT NULL;

-- ============================================================================
-- Extended Properties - Column Descriptions
-- ============================================================================

-- AIAgent.ScopeConfig
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration defining scope dimensions for multi-tenant deployments. Example: {"dimensions":[{"name":"OrganizationID","entityId":"...","isPrimary":true,"required":true},{"name":"ContactID","entityId":"...","isPrimary":false,"required":false}],"inheritanceMode":"cascading"}',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'ScopeConfig';

-- AIAgentRun scope columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Entity table identifying which entity type is used for primary scoping (e.g., Organizations, Tenants)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'PrimaryScopeEntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The record ID within the primary scope entity (e.g., the specific OrganizationID). Indexed for fast multi-tenant filtering.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'PrimaryScopeRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing additional scope dimensions beyond the primary scope. Example: {"ContactID":"abc-123","TeamID":"team-456"}',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'SecondaryScopes';

-- AIAgentNote scope columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Entity table identifying which entity type is used for primary scoping. NULL means this is a global note.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentNote',
    @level2type = N'COLUMN', @level2name = 'PrimaryScopeEntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The record ID within the primary scope entity. NULL means global note. When set with empty SecondaryScopes, indicates primary-scope-only note.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentNote',
    @level2type = N'COLUMN', @level2name = 'PrimaryScopeRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing additional scope dimensions. Empty/NULL with PrimaryScopeRecordID set = org-level note. Populated = fully-scoped note.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentNote',
    @level2type = N'COLUMN', @level2name = 'SecondaryScopes';

-- AIAgentExample scope columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Entity table identifying which entity type is used for primary scoping. NULL means this is a global example.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentExample',
    @level2type = N'COLUMN', @level2name = 'PrimaryScopeEntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The record ID within the primary scope entity. NULL means global example. When set with empty SecondaryScopes, indicates primary-scope-only example.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentExample',
    @level2type = N'COLUMN', @level2name = 'PrimaryScopeRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing additional scope dimensions. Empty/NULL with PrimaryScopeRecordID set = org-level example. Populated = fully-scoped example.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentExample',
    @level2type = N'COLUMN', @level2name = 'SecondaryScopes';

































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b0f924e4-a919-4ae5-a0e6-f5d4847926d6'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'PrimaryScopeEntityID')
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
            'b0f924e4-a919-4ae5-a0e6-f5d4847926d6',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100095,
            'PrimaryScopeEntityID',
            'Primary Scope Entity ID',
            'Foreign key to Entity table identifying which entity type is used for primary scoping (e.g., Organizations, Tenants)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c6602391-0b0c-4ecb-8a16-3a8b019b5c3d'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'PrimaryScopeRecordID')
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
            'c6602391-0b0c-4ecb-8a16-3a8b019b5c3d',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100096,
            'PrimaryScopeRecordID',
            'Primary Scope Record ID',
            'The record ID within the primary scope entity (e.g., the specific OrganizationID). Indexed for fast multi-tenant filtering.',
            'nvarchar',
            200,
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
         WHERE ID = '21fc62f2-f9cc-40c4-a1ba-462699ccd289'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'SecondaryScopes')
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
            '21fc62f2-f9cc-40c4-a1ba-462699ccd289',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100097,
            'SecondaryScopes',
            'Secondary Scopes',
            'JSON object containing additional scope dimensions beyond the primary scope. Example: {"ContactID":"abc-123","TeamID":"team-456"}',
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
         WHERE ID = 'f644a0dd-0c7d-44e5-a2d5-0dae4f0455ad'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ScopeConfig')
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
            'f644a0dd-0c7d-44e5-a2d5-0dae4f0455ad',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100111,
            'ScopeConfig',
            'Scope Config',
            'JSON configuration defining scope dimensions for multi-tenant deployments. Example: {"dimensions":[{"name":"OrganizationID","entityId":"...","isPrimary":true,"required":true},{"name":"ContactID","entityId":"...","isPrimary":false,"required":false}],"inheritanceMode":"cascading"}',
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
         WHERE ID = '1f1e84fe-99c5-4aeb-817e-6b03bb6fd5bc'  OR 
               (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'PrimaryScopeEntityID')
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
            '1f1e84fe-99c5-4aeb-817e-6b03bb6fd5bc',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: AI Agent Notes
            100041,
            'PrimaryScopeEntityID',
            'Primary Scope Entity ID',
            'Foreign key to Entity table identifying which entity type is used for primary scoping. NULL means this is a global note.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '702f4025-07e3-458e-9b93-82313a52dbd0'  OR 
               (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'PrimaryScopeRecordID')
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
            '702f4025-07e3-458e-9b93-82313a52dbd0',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: AI Agent Notes
            100042,
            'PrimaryScopeRecordID',
            'Primary Scope Record ID',
            'The record ID within the primary scope entity. NULL means global note. When set with empty SecondaryScopes, indicates primary-scope-only note.',
            'nvarchar',
            200,
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
         WHERE ID = '513178c8-f947-4a4f-9a9c-678648e51368'  OR 
               (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'SecondaryScopes')
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
            '513178c8-f947-4a4f-9a9c-678648e51368',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: AI Agent Notes
            100043,
            'SecondaryScopes',
            'Secondary Scopes',
            'JSON object containing additional scope dimensions. Empty/NULL with PrimaryScopeRecordID set = org-level note. Populated = fully-scoped note.',
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
         WHERE ID = 'cfa8ec69-9be6-4022-9d6d-e773285172d0'  OR 
               (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'PrimaryScopeEntityID')
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
            'cfa8ec69-9be6-4022-9d6d-e773285172d0',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            100042,
            'PrimaryScopeEntityID',
            'Primary Scope Entity ID',
            'Foreign key to Entity table identifying which entity type is used for primary scoping. NULL means this is a global example.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f71559c8-c0fb-4271-b195-e3df78171027'  OR 
               (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'PrimaryScopeRecordID')
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
            'f71559c8-c0fb-4271-b195-e3df78171027',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            100043,
            'PrimaryScopeRecordID',
            'Primary Scope Record ID',
            'The record ID within the primary scope entity. NULL means global example. When set with empty SecondaryScopes, indicates primary-scope-only example.',
            'nvarchar',
            200,
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
         WHERE ID = '8464f63a-25b8-485f-9d0e-114c5cc7852e'  OR 
               (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'SecondaryScopes')
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
            '8464f63a-25b8-485f-9d0e-114c5cc7852e',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            100044,
            'SecondaryScopes',
            'Secondary Scopes',
            'JSON object containing additional scope dimensions. Empty/NULL with PrimaryScopeRecordID set = org-level example. Populated = fully-scoped example.',
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f7fe88f3-7f88-4b08-ba1d-d8c4d37023a2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f7fe88f3-7f88-4b08-ba1d-d8c4d37023a2', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A24EF5EC-D32C-4A53-85A9-364E322451E6', 'PrimaryScopeEntityID', 'One To Many', 1, 1, 'AI Agent Notes', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '927a1491-3889-44cf-96e3-b674fbd1e069'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('927a1491-3889-44cf-96e3-b674fbd1e069', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'PrimaryScopeEntityID', 'One To Many', 1, 1, 'MJ: AI Agent Runs', 6);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ce38c009-ed22-4ec8-8cfd-4599bbf64a3c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ce38c009-ed22-4ec8-8cfd-4599bbf64a3c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '3A139346-CC48-479A-A53B-8892664F5DFD', 'PrimaryScopeEntityID', 'One To Many', 1, 1, 'MJ: AI Agent Examples', 1);
   END
                              

/* Index for Foreign Keys for AIAgentNote */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_AgentID ON [${flyway:defaultSchema}].[AIAgentNote] ([AgentID]);

-- Index for foreign key AgentNoteTypeID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_AgentNoteTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_AgentNoteTypeID ON [${flyway:defaultSchema}].[AIAgentNote] ([AgentNoteTypeID]);

-- Index for foreign key UserID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_UserID ON [${flyway:defaultSchema}].[AIAgentNote] ([UserID]);

-- Index for foreign key SourceConversationID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_SourceConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_SourceConversationID ON [${flyway:defaultSchema}].[AIAgentNote] ([SourceConversationID]);

-- Index for foreign key SourceConversationDetailID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_SourceConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_SourceConversationDetailID ON [${flyway:defaultSchema}].[AIAgentNote] ([SourceConversationDetailID]);

-- Index for foreign key SourceAIAgentRunID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_SourceAIAgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_SourceAIAgentRunID ON [${flyway:defaultSchema}].[AIAgentNote] ([SourceAIAgentRunID]);

-- Index for foreign key CompanyID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_CompanyID ON [${flyway:defaultSchema}].[AIAgentNote] ([CompanyID]);

-- Index for foreign key EmbeddingModelID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_EmbeddingModelID ON [${flyway:defaultSchema}].[AIAgentNote] ([EmbeddingModelID]);

-- Index for foreign key PrimaryScopeEntityID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_PrimaryScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_PrimaryScopeEntityID ON [${flyway:defaultSchema}].[AIAgentNote] ([PrimaryScopeEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 1F1E84FE-99C5-4AEB-817E-6B03BB6FD5BC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1F1E84FE-99C5-4AEB-817E-6B03BB6FD5BC',
         @RelatedEntityNameFieldMap='PrimaryScopeEntity'

/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ParentID ON [${flyway:defaultSchema}].[AIAgent] ([ParentID]);

-- Index for foreign key ContextCompressionPromptID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID ON [${flyway:defaultSchema}].[AIAgent] ([ContextCompressionPromptID]);

-- Index for foreign key TypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_TypeID ON [${flyway:defaultSchema}].[AIAgent] ([TypeID]);

-- Index for foreign key DefaultArtifactTypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultArtifactTypeID]);

-- Index for foreign key OwnerUserID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID ON [${flyway:defaultSchema}].[AIAgent] ([OwnerUserID]);

/* Root ID Function SQL for AI Agents.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: fnAIAgentParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgent].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Base View SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    AIAgent_ParentID.[Name] AS [Parent],
    AIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    AIAgentType_TypeID.[Name] AS [Type],
    ArtifactType_DefaultArtifactTypeID.[Name] AS [DefaultArtifactType],
    User_OwnerUserID.[Name] AS [OwnerUser],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_ParentID
  ON
    [a].[ParentID] = AIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = AIPrompt_ContextCompressionPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentType] AS AIAgentType_TypeID
  ON
    [a].[TypeID] = AIAgentType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_DefaultArtifactTypeID
  ON
    [a].[DefaultArtifactTypeID] = ArtifactType_DefaultArtifactTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_OwnerUserID
  ON
    [a].[OwnerUserID] = User_OwnerUserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths nvarchar(MAX),
    @PayloadSelfWritePaths nvarchar(MAX),
    @PayloadScope nvarchar(MAX),
    @FinalPayloadValidation nvarchar(MAX),
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun decimal(10, 4),
    @MaxTokensPerRun int,
    @MaxIterationsPerRun int,
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @StartingPayloadValidation nvarchar(MAX),
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel int,
    @ChatHandlingOption nvarchar(30),
    @DefaultArtifactTypeID uniqueidentifier,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages int,
    @ScopeConfig nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [ID],
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [ScopeConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @IconClass,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID,
                CASE @OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                @FunctionalRequirements,
                @TechnicalDesign,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                @MaxMessages,
                @ScopeConfig
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [ScopeConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @IconClass,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID,
                CASE @OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                @FunctionalRequirements,
                @TechnicalDesign,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                @MaxMessages,
                @ScopeConfig
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50),
    @PayloadDownstreamPaths nvarchar(MAX),
    @PayloadUpstreamPaths nvarchar(MAX),
    @PayloadSelfReadPaths nvarchar(MAX),
    @PayloadSelfWritePaths nvarchar(MAX),
    @PayloadScope nvarchar(MAX),
    @FinalPayloadValidation nvarchar(MAX),
    @FinalPayloadValidationMode nvarchar(25),
    @FinalPayloadValidationMaxRetries int,
    @MaxCostPerRun decimal(10, 4),
    @MaxTokensPerRun int,
    @MaxIterationsPerRun int,
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @StartingPayloadValidation nvarchar(MAX),
    @StartingPayloadValidationMode nvarchar(25),
    @DefaultPromptEffortLevel int,
    @ChatHandlingOption nvarchar(30),
    @DefaultArtifactTypeID uniqueidentifier,
    @OwnerUserID uniqueidentifier,
    @InvocationMode nvarchar(20),
    @ArtifactCreationMode nvarchar(20),
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @InjectNotes bit,
    @MaxNotesToInject int,
    @NoteInjectionStrategy nvarchar(20),
    @InjectExamples bit,
    @MaxExamplesToInject int,
    @ExampleInjectionStrategy nvarchar(20),
    @IsRestricted bit,
    @MessageMode nvarchar(50),
    @MaxMessages int,
    @ScopeConfig nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [LogoURL] = @LogoURL,
        [ParentID] = @ParentID,
        [ExposeAsAction] = @ExposeAsAction,
        [ExecutionOrder] = @ExecutionOrder,
        [ExecutionMode] = @ExecutionMode,
        [EnableContextCompression] = @EnableContextCompression,
        [ContextCompressionMessageThreshold] = @ContextCompressionMessageThreshold,
        [ContextCompressionPromptID] = @ContextCompressionPromptID,
        [ContextCompressionMessageRetentionCount] = @ContextCompressionMessageRetentionCount,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [IconClass] = @IconClass,
        [ModelSelectionMode] = @ModelSelectionMode,
        [PayloadDownstreamPaths] = @PayloadDownstreamPaths,
        [PayloadUpstreamPaths] = @PayloadUpstreamPaths,
        [PayloadSelfReadPaths] = @PayloadSelfReadPaths,
        [PayloadSelfWritePaths] = @PayloadSelfWritePaths,
        [PayloadScope] = @PayloadScope,
        [FinalPayloadValidation] = @FinalPayloadValidation,
        [FinalPayloadValidationMode] = @FinalPayloadValidationMode,
        [FinalPayloadValidationMaxRetries] = @FinalPayloadValidationMaxRetries,
        [MaxCostPerRun] = @MaxCostPerRun,
        [MaxTokensPerRun] = @MaxTokensPerRun,
        [MaxIterationsPerRun] = @MaxIterationsPerRun,
        [MaxTimePerRun] = @MaxTimePerRun,
        [MinExecutionsPerRun] = @MinExecutionsPerRun,
        [MaxExecutionsPerRun] = @MaxExecutionsPerRun,
        [StartingPayloadValidation] = @StartingPayloadValidation,
        [StartingPayloadValidationMode] = @StartingPayloadValidationMode,
        [DefaultPromptEffortLevel] = @DefaultPromptEffortLevel,
        [ChatHandlingOption] = @ChatHandlingOption,
        [DefaultArtifactTypeID] = @DefaultArtifactTypeID,
        [OwnerUserID] = @OwnerUserID,
        [InvocationMode] = @InvocationMode,
        [ArtifactCreationMode] = @ArtifactCreationMode,
        [FunctionalRequirements] = @FunctionalRequirements,
        [TechnicalDesign] = @TechnicalDesign,
        [InjectNotes] = @InjectNotes,
        [MaxNotesToInject] = @MaxNotesToInject,
        [NoteInjectionStrategy] = @NoteInjectionStrategy,
        [InjectExamples] = @InjectExamples,
        [MaxExamplesToInject] = @MaxExamplesToInject,
        [ExampleInjectionStrategy] = @ExampleInjectionStrategy,
        [IsRestricted] = @IsRestricted,
        [MessageMode] = @MessageMode,
        [MaxMessages] = @MaxMessages,
        [ScopeConfig] = @ScopeConfig
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]



/* Base View SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agent Notes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentNotes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentNotes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentNotes]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIAgentNoteType_AgentNoteTypeID.[Name] AS [AgentNoteType],
    User_UserID.[Name] AS [User],
    Conversation_SourceConversationID.[Name] AS [SourceConversation],
    ConversationDetail_SourceConversationDetailID.[Message] AS [SourceConversationDetail],
    AIAgentRun_SourceAIAgentRunID.[RunName] AS [SourceAIAgentRun],
    Company_CompanyID.[Name] AS [Company],
    AIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    Entity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity]
FROM
    [${flyway:defaultSchema}].[AIAgentNote] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentNoteType] AS AIAgentNoteType_AgentNoteTypeID
  ON
    [a].[AgentNoteTypeID] = AIAgentNoteType_AgentNoteTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_SourceConversationID
  ON
    [a].[SourceConversationID] = Conversation_SourceConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS ConversationDetail_SourceConversationDetailID
  ON
    [a].[SourceConversationDetailID] = ConversationDetail_SourceConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS AIAgentRun_SourceAIAgentRunID
  ON
    [a].[SourceAIAgentRunID] = AIAgentRun_SourceAIAgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS Company_CompanyID
  ON
    [a].[CompanyID] = Company_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_EmbeddingModelID
  ON
    [a].[EmbeddingModelID] = AIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = Entity_PrimaryScopeEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: Permissions for vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spCreateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX),
    @UserID uniqueidentifier,
    @Type nvarchar(20) = NULL,
    @IsAutoGenerated bit = NULL,
    @Comments nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @SourceConversationID uniqueidentifier,
    @SourceConversationDetailID uniqueidentifier,
    @SourceAIAgentRunID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @PrimaryScopeEntityID uniqueidentifier,
    @PrimaryScopeRecordID nvarchar(100),
    @SecondaryScopes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentNote]
            (
                [ID],
                [AgentID],
                [AgentNoteTypeID],
                [Note],
                [UserID],
                [Type],
                [IsAutoGenerated],
                [Comments],
                [Status],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [CompanyID],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @AgentNoteTypeID,
                @Note,
                @UserID,
                ISNULL(@Type, 'Preference'),
                ISNULL(@IsAutoGenerated, 0),
                @Comments,
                ISNULL(@Status, 'Active'),
                @SourceConversationID,
                @SourceConversationDetailID,
                @SourceAIAgentRunID,
                @CompanyID,
                @EmbeddingVector,
                @EmbeddingModelID,
                @PrimaryScopeEntityID,
                @PrimaryScopeRecordID,
                @SecondaryScopes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentNote]
            (
                [AgentID],
                [AgentNoteTypeID],
                [Note],
                [UserID],
                [Type],
                [IsAutoGenerated],
                [Comments],
                [Status],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [CompanyID],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @AgentNoteTypeID,
                @Note,
                @UserID,
                ISNULL(@Type, 'Preference'),
                ISNULL(@IsAutoGenerated, 0),
                @Comments,
                ISNULL(@Status, 'Active'),
                @SourceConversationID,
                @SourceConversationDetailID,
                @SourceAIAgentRunID,
                @CompanyID,
                @EmbeddingVector,
                @EmbeddingModelID,
                @PrimaryScopeEntityID,
                @PrimaryScopeRecordID,
                @SecondaryScopes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spUpdateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX),
    @UserID uniqueidentifier,
    @Type nvarchar(20),
    @IsAutoGenerated bit,
    @Comments nvarchar(MAX),
    @Status nvarchar(20),
    @SourceConversationID uniqueidentifier,
    @SourceConversationDetailID uniqueidentifier,
    @SourceAIAgentRunID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @PrimaryScopeEntityID uniqueidentifier,
    @PrimaryScopeRecordID nvarchar(100),
    @SecondaryScopes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        [AgentID] = @AgentID,
        [AgentNoteTypeID] = @AgentNoteTypeID,
        [Note] = @Note,
        [UserID] = @UserID,
        [Type] = @Type,
        [IsAutoGenerated] = @IsAutoGenerated,
        [Comments] = @Comments,
        [Status] = @Status,
        [SourceConversationID] = @SourceConversationID,
        [SourceConversationDetailID] = @SourceConversationDetailID,
        [SourceAIAgentRunID] = @SourceAIAgentRunID,
        [CompanyID] = @CompanyID,
        [EmbeddingVector] = @EmbeddingVector,
        [EmbeddingModelID] = @EmbeddingModelID,
        [PrimaryScopeEntityID] = @PrimaryScopeEntityID,
        [PrimaryScopeRecordID] = @PrimaryScopeRecordID,
        [SecondaryScopes] = @SecondaryScopes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentNotes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentNote]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentNote];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentNote
ON [${flyway:defaultSchema}].[AIAgentNote]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentNote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spDeleteAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNote]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentNote]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentExample */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentExample
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentExample_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentExample]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentExample_AgentID ON [${flyway:defaultSchema}].[AIAgentExample] ([AgentID]);

-- Index for foreign key UserID in table AIAgentExample
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentExample_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentExample]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentExample_UserID ON [${flyway:defaultSchema}].[AIAgentExample] ([UserID]);

-- Index for foreign key CompanyID in table AIAgentExample
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentExample_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentExample]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentExample_CompanyID ON [${flyway:defaultSchema}].[AIAgentExample] ([CompanyID]);

-- Index for foreign key SourceConversationID in table AIAgentExample
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentExample_SourceConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentExample]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentExample_SourceConversationID ON [${flyway:defaultSchema}].[AIAgentExample] ([SourceConversationID]);

-- Index for foreign key SourceConversationDetailID in table AIAgentExample
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentExample_SourceConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentExample]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentExample_SourceConversationDetailID ON [${flyway:defaultSchema}].[AIAgentExample] ([SourceConversationDetailID]);

-- Index for foreign key SourceAIAgentRunID in table AIAgentExample
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentExample_SourceAIAgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentExample]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentExample_SourceAIAgentRunID ON [${flyway:defaultSchema}].[AIAgentExample] ([SourceAIAgentRunID]);

-- Index for foreign key EmbeddingModelID in table AIAgentExample
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentExample_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentExample]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentExample_EmbeddingModelID ON [${flyway:defaultSchema}].[AIAgentExample] ([EmbeddingModelID]);

-- Index for foreign key PrimaryScopeEntityID in table AIAgentExample
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentExample_PrimaryScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentExample]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentExample_PrimaryScopeEntityID ON [${flyway:defaultSchema}].[AIAgentExample] ([PrimaryScopeEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID CFA8EC69-9BE6-4022-9D6D-E773285172D0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CFA8EC69-9BE6-4022-9D6D-E773285172D0',
         @RelatedEntityNameFieldMap='PrimaryScopeEntity'

/* Base View SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: vwAIAgentExamples
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Examples
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentExample
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentExamples]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentExamples];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentExamples]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    User_UserID.[Name] AS [User],
    Company_CompanyID.[Name] AS [Company],
    Conversation_SourceConversationID.[Name] AS [SourceConversation],
    ConversationDetail_SourceConversationDetailID.[Message] AS [SourceConversationDetail],
    AIAgentRun_SourceAIAgentRunID.[RunName] AS [SourceAIAgentRun],
    AIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    Entity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity]
FROM
    [${flyway:defaultSchema}].[AIAgentExample] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS Company_CompanyID
  ON
    [a].[CompanyID] = Company_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_SourceConversationID
  ON
    [a].[SourceConversationID] = Conversation_SourceConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS ConversationDetail_SourceConversationDetailID
  ON
    [a].[SourceConversationDetailID] = ConversationDetail_SourceConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS AIAgentRun_SourceAIAgentRunID
  ON
    [a].[SourceAIAgentRunID] = AIAgentRun_SourceAIAgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_EmbeddingModelID
  ON
    [a].[EmbeddingModelID] = AIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = Entity_PrimaryScopeEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentExamples] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: Permissions for vwAIAgentExamples
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentExamples] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spCreateAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentExample
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentExample]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentExample];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentExample]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @UserID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @Type nvarchar(20) = NULL,
    @ExampleInput nvarchar(MAX),
    @ExampleOutput nvarchar(MAX),
    @IsAutoGenerated bit = NULL,
    @SourceConversationID uniqueidentifier,
    @SourceConversationDetailID uniqueidentifier,
    @SourceAIAgentRunID uniqueidentifier,
    @SuccessScore decimal(5, 2),
    @Comments nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @PrimaryScopeEntityID uniqueidentifier,
    @PrimaryScopeRecordID nvarchar(100),
    @SecondaryScopes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentExample]
            (
                [ID],
                [AgentID],
                [UserID],
                [CompanyID],
                [Type],
                [ExampleInput],
                [ExampleOutput],
                [IsAutoGenerated],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [SuccessScore],
                [Comments],
                [Status],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @UserID,
                @CompanyID,
                ISNULL(@Type, 'Example'),
                @ExampleInput,
                @ExampleOutput,
                ISNULL(@IsAutoGenerated, 0),
                @SourceConversationID,
                @SourceConversationDetailID,
                @SourceAIAgentRunID,
                @SuccessScore,
                @Comments,
                ISNULL(@Status, 'Active'),
                @EmbeddingVector,
                @EmbeddingModelID,
                @PrimaryScopeEntityID,
                @PrimaryScopeRecordID,
                @SecondaryScopes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentExample]
            (
                [AgentID],
                [UserID],
                [CompanyID],
                [Type],
                [ExampleInput],
                [ExampleOutput],
                [IsAutoGenerated],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [SuccessScore],
                [Comments],
                [Status],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @UserID,
                @CompanyID,
                ISNULL(@Type, 'Example'),
                @ExampleInput,
                @ExampleOutput,
                ISNULL(@IsAutoGenerated, 0),
                @SourceConversationID,
                @SourceConversationDetailID,
                @SourceAIAgentRunID,
                @SuccessScore,
                @Comments,
                ISNULL(@Status, 'Active'),
                @EmbeddingVector,
                @EmbeddingModelID,
                @PrimaryScopeEntityID,
                @PrimaryScopeRecordID,
                @SecondaryScopes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentExamples] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentExample] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Examples */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentExample] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spUpdateAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentExample
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentExample]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentExample];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentExample]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @UserID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @Type nvarchar(20),
    @ExampleInput nvarchar(MAX),
    @ExampleOutput nvarchar(MAX),
    @IsAutoGenerated bit,
    @SourceConversationID uniqueidentifier,
    @SourceConversationDetailID uniqueidentifier,
    @SourceAIAgentRunID uniqueidentifier,
    @SuccessScore decimal(5, 2),
    @Comments nvarchar(MAX),
    @Status nvarchar(20),
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @PrimaryScopeEntityID uniqueidentifier,
    @PrimaryScopeRecordID nvarchar(100),
    @SecondaryScopes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentExample]
    SET
        [AgentID] = @AgentID,
        [UserID] = @UserID,
        [CompanyID] = @CompanyID,
        [Type] = @Type,
        [ExampleInput] = @ExampleInput,
        [ExampleOutput] = @ExampleOutput,
        [IsAutoGenerated] = @IsAutoGenerated,
        [SourceConversationID] = @SourceConversationID,
        [SourceConversationDetailID] = @SourceConversationDetailID,
        [SourceAIAgentRunID] = @SourceAIAgentRunID,
        [SuccessScore] = @SuccessScore,
        [Comments] = @Comments,
        [Status] = @Status,
        [EmbeddingVector] = @EmbeddingVector,
        [EmbeddingModelID] = @EmbeddingModelID,
        [PrimaryScopeEntityID] = @PrimaryScopeEntityID,
        [PrimaryScopeRecordID] = @PrimaryScopeRecordID,
        [SecondaryScopes] = @SecondaryScopes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentExamples] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentExamples]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentExample] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentExample table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentExample]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentExample];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentExample
ON [${flyway:defaultSchema}].[AIAgentExample]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentExample]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentExample] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Examples */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentExample] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spDeleteAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentExample
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentExample]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentExample];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentExample]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentExample]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentExample] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Examples */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentExample] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID ON [${flyway:defaultSchema}].[AIAgentRun] ([AgentID]);

-- Index for foreign key ParentRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ParentRunID]);

-- Index for foreign key ConversationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationID]);

-- Index for foreign key UserID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_UserID ON [${flyway:defaultSchema}].[AIAgentRun] ([UserID]);

-- Index for foreign key ConversationDetailID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationDetailID]);

-- Index for foreign key LastRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([LastRunID]);

-- Index for foreign key ConfigurationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConfigurationID]);

-- Index for foreign key OverrideModelID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID ON [${flyway:defaultSchema}].[AIAgentRun] ([OverrideModelID]);

-- Index for foreign key OverrideVendorID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID ON [${flyway:defaultSchema}].[AIAgentRun] ([OverrideVendorID]);

-- Index for foreign key ScheduledJobRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ScheduledJobRunID]);

-- Index for foreign key TestRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_TestRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([TestRunID]);

-- Index for foreign key PrimaryScopeEntityID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_PrimaryScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_PrimaryScopeEntityID ON [${flyway:defaultSchema}].[AIAgentRun] ([PrimaryScopeEntityID]);

/* Root ID Function SQL for MJ: AI Agent Runs.ParentRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRun].[ParentRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentRunID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentRunID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Root ID Function SQL for MJ: AI Agent Runs.LastRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunLastRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRun].[LastRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [LastRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until LastRunID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[LastRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[LastRunID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [LastRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID B0F924E4-A919-4AE5-A0E6-F5D4847926D6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B0F924E4-A919-4AE5-A0E6-F5D4847926D6',
         @RelatedEntityNameFieldMap='PrimaryScopeEntity'

/* Base View SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRuns]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIAgentRun_ParentRunID.[RunName] AS [ParentRun],
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User],
    ConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    AIAgentRun_LastRunID.[RunName] AS [LastRun],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration],
    AIModel_OverrideModelID.[Name] AS [OverrideModel],
    AIVendor_OverrideVendorID.[Name] AS [OverrideVendor],
    ScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun],
    TestRun_TestRunID.[Test] AS [TestRun],
    Entity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity],
    root_ParentRunID.RootID AS [RootParentRunID],
    root_LastRunID.RootID AS [RootLastRunID]
FROM
    [${flyway:defaultSchema}].[AIAgentRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS AIAgentRun_ParentRunID
  ON
    [a].[ParentRunID] = AIAgentRun_ParentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [a].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS ConversationDetail_ConversationDetailID
  ON
    [a].[ConversationDetailID] = ConversationDetail_ConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS AIAgentRun_LastRunID
  ON
    [a].[LastRunID] = AIAgentRun_LastRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_OverrideModelID
  ON
    [a].[OverrideModelID] = AIModel_OverrideModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_OverrideVendorID
  ON
    [a].[OverrideVendorID] = AIVendor_OverrideVendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS ScheduledJobRun_ScheduledJobRunID
  ON
    [a].[ScheduledJobRunID] = ScheduledJobRun_ScheduledJobRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS TestRun_TestRunID
  ON
    [a].[TestRunID] = TestRun_TestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = Entity_PrimaryScopeEntityID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]([a].[ID], [a].[ParentRunID]) AS root_ParentRunID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]([a].[ID], [a].[LastRunID]) AS root_LastRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8),
    @ConversationDetailID uniqueidentifier,
    @ConversationDetailSequence int,
    @CancellationReason nvarchar(30),
    @FinalStep nvarchar(30),
    @FinalPayload nvarchar(MAX),
    @Message nvarchar(MAX),
    @LastRunID uniqueidentifier,
    @StartingPayload nvarchar(MAX),
    @TotalPromptIterations int = NULL,
    @ConfigurationID uniqueidentifier,
    @OverrideModelID uniqueidentifier,
    @OverrideVendorID uniqueidentifier,
    @Data nvarchar(MAX),
    @Verbose bit,
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @ScheduledJobRunID uniqueidentifier,
    @TestRunID uniqueidentifier,
    @PrimaryScopeEntityID uniqueidentifier,
    @PrimaryScopeRecordID nvarchar(100),
    @SecondaryScopes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [ID],
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ParentRunID,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @ConversationID,
                @UserID,
                @Result,
                @AgentState,
                @TotalTokensUsed,
                @TotalCost,
                @TotalPromptTokensUsed,
                @TotalCompletionTokensUsed,
                @TotalTokensUsedRollup,
                @TotalPromptTokensUsedRollup,
                @TotalCompletionTokensUsedRollup,
                @TotalCostRollup,
                @ConversationDetailID,
                @ConversationDetailSequence,
                @CancellationReason,
                @FinalStep,
                @FinalPayload,
                @Message,
                @LastRunID,
                @StartingPayload,
                ISNULL(@TotalPromptIterations, 0),
                @ConfigurationID,
                @OverrideModelID,
                @OverrideVendorID,
                @Data,
                @Verbose,
                @EffortLevel,
                @RunName,
                @Comments,
                @ScheduledJobRunID,
                @TestRunID,
                @PrimaryScopeEntityID,
                @PrimaryScopeRecordID,
                @SecondaryScopes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ParentRunID,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @ConversationID,
                @UserID,
                @Result,
                @AgentState,
                @TotalTokensUsed,
                @TotalCost,
                @TotalPromptTokensUsed,
                @TotalCompletionTokensUsed,
                @TotalTokensUsedRollup,
                @TotalPromptTokensUsedRollup,
                @TotalCompletionTokensUsedRollup,
                @TotalCostRollup,
                @ConversationDetailID,
                @ConversationDetailSequence,
                @CancellationReason,
                @FinalStep,
                @FinalPayload,
                @Message,
                @LastRunID,
                @StartingPayload,
                ISNULL(@TotalPromptIterations, 0),
                @ConfigurationID,
                @OverrideModelID,
                @OverrideVendorID,
                @Data,
                @Verbose,
                @EffortLevel,
                @RunName,
                @Comments,
                @ScheduledJobRunID,
                @TestRunID,
                @PrimaryScopeEntityID,
                @PrimaryScopeRecordID,
                @SecondaryScopes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8),
    @ConversationDetailID uniqueidentifier,
    @ConversationDetailSequence int,
    @CancellationReason nvarchar(30),
    @FinalStep nvarchar(30),
    @FinalPayload nvarchar(MAX),
    @Message nvarchar(MAX),
    @LastRunID uniqueidentifier,
    @StartingPayload nvarchar(MAX),
    @TotalPromptIterations int,
    @ConfigurationID uniqueidentifier,
    @OverrideModelID uniqueidentifier,
    @OverrideVendorID uniqueidentifier,
    @Data nvarchar(MAX),
    @Verbose bit,
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @ScheduledJobRunID uniqueidentifier,
    @TestRunID uniqueidentifier,
    @PrimaryScopeEntityID uniqueidentifier,
    @PrimaryScopeRecordID nvarchar(100),
    @SecondaryScopes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        [AgentID] = @AgentID,
        [ParentRunID] = @ParentRunID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ConversationID] = @ConversationID,
        [UserID] = @UserID,
        [Result] = @Result,
        [AgentState] = @AgentState,
        [TotalTokensUsed] = @TotalTokensUsed,
        [TotalCost] = @TotalCost,
        [TotalPromptTokensUsed] = @TotalPromptTokensUsed,
        [TotalCompletionTokensUsed] = @TotalCompletionTokensUsed,
        [TotalTokensUsedRollup] = @TotalTokensUsedRollup,
        [TotalPromptTokensUsedRollup] = @TotalPromptTokensUsedRollup,
        [TotalCompletionTokensUsedRollup] = @TotalCompletionTokensUsedRollup,
        [TotalCostRollup] = @TotalCostRollup,
        [ConversationDetailID] = @ConversationDetailID,
        [ConversationDetailSequence] = @ConversationDetailSequence,
        [CancellationReason] = @CancellationReason,
        [FinalStep] = @FinalStep,
        [FinalPayload] = @FinalPayload,
        [Message] = @Message,
        [LastRunID] = @LastRunID,
        [StartingPayload] = @StartingPayload,
        [TotalPromptIterations] = @TotalPromptIterations,
        [ConfigurationID] = @ConfigurationID,
        [OverrideModelID] = @OverrideModelID,
        [OverrideVendorID] = @OverrideVendorID,
        [Data] = @Data,
        [Verbose] = @Verbose,
        [EffortLevel] = @EffortLevel,
        [RunName] = @RunName,
        [Comments] = @Comments,
        [ScheduledJobRunID] = @ScheduledJobRunID,
        [TestRunID] = @TestRunID,
        [PrimaryScopeEntityID] = @PrimaryScopeEntityID,
        [PrimaryScopeRecordID] = @PrimaryScopeRecordID,
        [SecondaryScopes] = @SecondaryScopes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRun
ON [${flyway:defaultSchema}].[AIAgentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]



/* spDelete SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @AIAgentNotesID uniqueidentifier
    DECLARE @AIAgentNotes_AgentID uniqueidentifier
    DECLARE @AIAgentNotes_AgentNoteTypeID uniqueidentifier
    DECLARE @AIAgentNotes_Note nvarchar(MAX)
    DECLARE @AIAgentNotes_UserID uniqueidentifier
    DECLARE @AIAgentNotes_Type nvarchar(20)
    DECLARE @AIAgentNotes_IsAutoGenerated bit
    DECLARE @AIAgentNotes_Comments nvarchar(MAX)
    DECLARE @AIAgentNotes_Status nvarchar(20)
    DECLARE @AIAgentNotes_SourceConversationID uniqueidentifier
    DECLARE @AIAgentNotes_SourceConversationDetailID uniqueidentifier
    DECLARE @AIAgentNotes_SourceAIAgentRunID uniqueidentifier
    DECLARE @AIAgentNotes_CompanyID uniqueidentifier
    DECLARE @AIAgentNotes_EmbeddingVector nvarchar(MAX)
    DECLARE @AIAgentNotes_EmbeddingModelID uniqueidentifier
    DECLARE @AIAgentNotes_PrimaryScopeEntityID uniqueidentifier
    DECLARE @AIAgentNotes_PrimaryScopeRecordID nvarchar(100)
    DECLARE @AIAgentNotes_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_AIAgentNotes_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_AIAgentNotes_cursor
    FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID, @AIAgentNotes_PrimaryScopeEntityID, @AIAgentNotes_PrimaryScopeRecordID, @AIAgentNotes_SecondaryScopes
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @AIAgentNotes_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @AIAgentNotesID, @AgentID = @AIAgentNotes_AgentID, @AgentNoteTypeID = @AIAgentNotes_AgentNoteTypeID, @Note = @AIAgentNotes_Note, @UserID = @AIAgentNotes_UserID, @Type = @AIAgentNotes_Type, @IsAutoGenerated = @AIAgentNotes_IsAutoGenerated, @Comments = @AIAgentNotes_Comments, @Status = @AIAgentNotes_Status, @SourceConversationID = @AIAgentNotes_SourceConversationID, @SourceConversationDetailID = @AIAgentNotes_SourceConversationDetailID, @SourceAIAgentRunID = @AIAgentNotes_SourceAIAgentRunID, @CompanyID = @AIAgentNotes_CompanyID, @EmbeddingVector = @AIAgentNotes_EmbeddingVector, @EmbeddingModelID = @AIAgentNotes_EmbeddingModelID, @PrimaryScopeEntityID = @AIAgentNotes_PrimaryScopeEntityID, @PrimaryScopeRecordID = @AIAgentNotes_PrimaryScopeRecordID, @SecondaryScopes = @AIAgentNotes_SecondaryScopes
        
        FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID, @AIAgentNotes_PrimaryScopeEntityID, @AIAgentNotes_PrimaryScopeRecordID, @AIAgentNotes_SecondaryScopes
    END
    
    CLOSE cascade_update_AIAgentNotes_cursor
    DEALLOCATE cascade_update_AIAgentNotes_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ParentID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJ_AIAgentExamplesID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_UserID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_CompanyID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_Type nvarchar(20)
    DECLARE @MJ_AIAgentExamples_ExampleInput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_ExampleOutput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_IsAutoGenerated bit
    DECLARE @MJ_AIAgentExamples_SourceConversationID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SuccessScore decimal(5, 2)
    DECLARE @MJ_AIAgentExamples_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_Status nvarchar(20)
    DECLARE @MJ_AIAgentExamples_EmbeddingVector nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_EmbeddingModelID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJ_AIAgentExamples_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_MJ_AIAgentExamples_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentExamples_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID, @MJ_AIAgentExamples_PrimaryScopeEntityID, @MJ_AIAgentExamples_PrimaryScopeRecordID, @MJ_AIAgentExamples_SecondaryScopes
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentExamples_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJ_AIAgentExamplesID, @AgentID = @MJ_AIAgentExamples_AgentID, @UserID = @MJ_AIAgentExamples_UserID, @CompanyID = @MJ_AIAgentExamples_CompanyID, @Type = @MJ_AIAgentExamples_Type, @ExampleInput = @MJ_AIAgentExamples_ExampleInput, @ExampleOutput = @MJ_AIAgentExamples_ExampleOutput, @IsAutoGenerated = @MJ_AIAgentExamples_IsAutoGenerated, @SourceConversationID = @MJ_AIAgentExamples_SourceConversationID, @SourceConversationDetailID = @MJ_AIAgentExamples_SourceConversationDetailID, @SourceAIAgentRunID = @MJ_AIAgentExamples_SourceAIAgentRunID, @SuccessScore = @MJ_AIAgentExamples_SuccessScore, @Comments = @MJ_AIAgentExamples_Comments, @Status = @MJ_AIAgentExamples_Status, @EmbeddingVector = @MJ_AIAgentExamples_EmbeddingVector, @EmbeddingModelID = @MJ_AIAgentExamples_EmbeddingModelID, @PrimaryScopeEntityID = @MJ_AIAgentExamples_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJ_AIAgentExamples_PrimaryScopeRecordID, @SecondaryScopes = @MJ_AIAgentExamples_SecondaryScopes
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID, @MJ_AIAgentExamples_PrimaryScopeEntityID, @MJ_AIAgentExamples_PrimaryScopeRecordID, @MJ_AIAgentExamples_SecondaryScopes
    END
    
    CLOSE cascade_update_MJ_AIAgentExamples_cursor
    DEALLOCATE cascade_update_MJ_AIAgentExamples_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_TestRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJ_AIAgentRuns_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID, @MJ_AIAgentRuns_PrimaryScopeEntityID, @MJ_AIAgentRuns_PrimaryScopeRecordID, @MJ_AIAgentRuns_SecondaryScopes
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID, @TestRunID = @MJ_AIAgentRuns_TestRunID, @PrimaryScopeEntityID = @MJ_AIAgentRuns_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJ_AIAgentRuns_PrimaryScopeRecordID, @SecondaryScopes = @MJ_AIAgentRuns_SecondaryScopes
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID, @MJ_AIAgentRuns_PrimaryScopeEntityID, @MJ_AIAgentRuns_PrimaryScopeRecordID, @MJ_AIAgentRuns_SecondaryScopes
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJ_ConversationDetailArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJ_ConversationDetailArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJ_ConversationDetailRatingsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailRatings_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailRatings_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJ_ConversationDetailRatingsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailRatings_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailRatings_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJ_TasksID uniqueidentifier
    DECLARE @MJ_Tasks_ParentID uniqueidentifier
    DECLARE @MJ_Tasks_Name nvarchar(255)
    DECLARE @MJ_Tasks_Description nvarchar(MAX)
    DECLARE @MJ_Tasks_TypeID uniqueidentifier
    DECLARE @MJ_Tasks_EnvironmentID uniqueidentifier
    DECLARE @MJ_Tasks_ProjectID uniqueidentifier
    DECLARE @MJ_Tasks_ConversationDetailID uniqueidentifier
    DECLARE @MJ_Tasks_UserID uniqueidentifier
    DECLARE @MJ_Tasks_AgentID uniqueidentifier
    DECLARE @MJ_Tasks_Status nvarchar(50)
    DECLARE @MJ_Tasks_PercentComplete int
    DECLARE @MJ_Tasks_DueAt datetimeoffset
    DECLARE @MJ_Tasks_StartedAt datetimeoffset
    DECLARE @MJ_Tasks_CompletedAt datetimeoffset
    DECLARE cascade_update_MJ_Tasks_cursor CURSOR FOR 
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_Tasks_cursor
    FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_Tasks_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJ_TasksID, @ParentID = @MJ_Tasks_ParentID, @Name = @MJ_Tasks_Name, @Description = @MJ_Tasks_Description, @TypeID = @MJ_Tasks_TypeID, @EnvironmentID = @MJ_Tasks_EnvironmentID, @ProjectID = @MJ_Tasks_ProjectID, @ConversationDetailID = @MJ_Tasks_ConversationDetailID, @UserID = @MJ_Tasks_UserID, @AgentID = @MJ_Tasks_AgentID, @Status = @MJ_Tasks_Status, @PercentComplete = @MJ_Tasks_PercentComplete, @DueAt = @MJ_Tasks_DueAt, @StartedAt = @MJ_Tasks_StartedAt, @CompletedAt = @MJ_Tasks_CompletedAt
        
        FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    END
    
    CLOSE cascade_update_MJ_Tasks_cursor
    DEALLOCATE cascade_update_MJ_Tasks_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spDelete SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @AIAgentNotesID uniqueidentifier
    DECLARE @AIAgentNotes_AgentID uniqueidentifier
    DECLARE @AIAgentNotes_AgentNoteTypeID uniqueidentifier
    DECLARE @AIAgentNotes_Note nvarchar(MAX)
    DECLARE @AIAgentNotes_UserID uniqueidentifier
    DECLARE @AIAgentNotes_Type nvarchar(20)
    DECLARE @AIAgentNotes_IsAutoGenerated bit
    DECLARE @AIAgentNotes_Comments nvarchar(MAX)
    DECLARE @AIAgentNotes_Status nvarchar(20)
    DECLARE @AIAgentNotes_SourceConversationID uniqueidentifier
    DECLARE @AIAgentNotes_SourceConversationDetailID uniqueidentifier
    DECLARE @AIAgentNotes_SourceAIAgentRunID uniqueidentifier
    DECLARE @AIAgentNotes_CompanyID uniqueidentifier
    DECLARE @AIAgentNotes_EmbeddingVector nvarchar(MAX)
    DECLARE @AIAgentNotes_EmbeddingModelID uniqueidentifier
    DECLARE @AIAgentNotes_PrimaryScopeEntityID uniqueidentifier
    DECLARE @AIAgentNotes_PrimaryScopeRecordID nvarchar(100)
    DECLARE @AIAgentNotes_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_AIAgentNotes_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationID] = @ID
    
    OPEN cascade_update_AIAgentNotes_cursor
    FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID, @AIAgentNotes_PrimaryScopeEntityID, @AIAgentNotes_PrimaryScopeRecordID, @AIAgentNotes_SecondaryScopes
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @AIAgentNotes_SourceConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @AIAgentNotesID, @AgentID = @AIAgentNotes_AgentID, @AgentNoteTypeID = @AIAgentNotes_AgentNoteTypeID, @Note = @AIAgentNotes_Note, @UserID = @AIAgentNotes_UserID, @Type = @AIAgentNotes_Type, @IsAutoGenerated = @AIAgentNotes_IsAutoGenerated, @Comments = @AIAgentNotes_Comments, @Status = @AIAgentNotes_Status, @SourceConversationID = @AIAgentNotes_SourceConversationID, @SourceConversationDetailID = @AIAgentNotes_SourceConversationDetailID, @SourceAIAgentRunID = @AIAgentNotes_SourceAIAgentRunID, @CompanyID = @AIAgentNotes_CompanyID, @EmbeddingVector = @AIAgentNotes_EmbeddingVector, @EmbeddingModelID = @AIAgentNotes_EmbeddingModelID, @PrimaryScopeEntityID = @AIAgentNotes_PrimaryScopeEntityID, @PrimaryScopeRecordID = @AIAgentNotes_PrimaryScopeRecordID, @SecondaryScopes = @AIAgentNotes_SecondaryScopes
        
        FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID, @AIAgentNotes_PrimaryScopeEntityID, @AIAgentNotes_PrimaryScopeRecordID, @AIAgentNotes_SecondaryScopes
    END
    
    CLOSE cascade_update_AIAgentNotes_cursor
    DEALLOCATE cascade_update_AIAgentNotes_cursor
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE cascade_delete_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_ConversationDetails_cursor
    FETCH NEXT FROM cascade_delete_ConversationDetails_cursor INTO @ConversationDetailsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetail] @ID = @ConversationDetailsID
        
        FETCH NEXT FROM cascade_delete_ConversationDetails_cursor INTO @ConversationDetailsID
    END
    
    CLOSE cascade_delete_ConversationDetails_cursor
    DEALLOCATE cascade_delete_ConversationDetails_cursor
    
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJ_AIAgentExamplesID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_UserID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_CompanyID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_Type nvarchar(20)
    DECLARE @MJ_AIAgentExamples_ExampleInput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_ExampleOutput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_IsAutoGenerated bit
    DECLARE @MJ_AIAgentExamples_SourceConversationID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SuccessScore decimal(5, 2)
    DECLARE @MJ_AIAgentExamples_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_Status nvarchar(20)
    DECLARE @MJ_AIAgentExamples_EmbeddingVector nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_EmbeddingModelID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJ_AIAgentExamples_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_MJ_AIAgentExamples_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentExamples_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID, @MJ_AIAgentExamples_PrimaryScopeEntityID, @MJ_AIAgentExamples_PrimaryScopeRecordID, @MJ_AIAgentExamples_SecondaryScopes
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentExamples_SourceConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJ_AIAgentExamplesID, @AgentID = @MJ_AIAgentExamples_AgentID, @UserID = @MJ_AIAgentExamples_UserID, @CompanyID = @MJ_AIAgentExamples_CompanyID, @Type = @MJ_AIAgentExamples_Type, @ExampleInput = @MJ_AIAgentExamples_ExampleInput, @ExampleOutput = @MJ_AIAgentExamples_ExampleOutput, @IsAutoGenerated = @MJ_AIAgentExamples_IsAutoGenerated, @SourceConversationID = @MJ_AIAgentExamples_SourceConversationID, @SourceConversationDetailID = @MJ_AIAgentExamples_SourceConversationDetailID, @SourceAIAgentRunID = @MJ_AIAgentExamples_SourceAIAgentRunID, @SuccessScore = @MJ_AIAgentExamples_SuccessScore, @Comments = @MJ_AIAgentExamples_Comments, @Status = @MJ_AIAgentExamples_Status, @EmbeddingVector = @MJ_AIAgentExamples_EmbeddingVector, @EmbeddingModelID = @MJ_AIAgentExamples_EmbeddingModelID, @PrimaryScopeEntityID = @MJ_AIAgentExamples_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJ_AIAgentExamples_PrimaryScopeRecordID, @SecondaryScopes = @MJ_AIAgentExamples_SecondaryScopes
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID, @MJ_AIAgentExamples_PrimaryScopeEntityID, @MJ_AIAgentExamples_PrimaryScopeRecordID, @MJ_AIAgentExamples_SecondaryScopes
    END
    
    CLOSE cascade_update_MJ_AIAgentExamples_cursor
    DEALLOCATE cascade_update_MJ_AIAgentExamples_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_TestRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJ_AIAgentRuns_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID, @MJ_AIAgentRuns_PrimaryScopeEntityID, @MJ_AIAgentRuns_PrimaryScopeRecordID, @MJ_AIAgentRuns_SecondaryScopes
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID, @TestRunID = @MJ_AIAgentRuns_TestRunID, @PrimaryScopeEntityID = @MJ_AIAgentRuns_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJ_AIAgentRuns_PrimaryScopeRecordID, @SecondaryScopes = @MJ_AIAgentRuns_SecondaryScopes
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID, @MJ_AIAgentRuns_PrimaryScopeEntityID, @MJ_AIAgentRuns_PrimaryScopeRecordID, @MJ_AIAgentRuns_SecondaryScopes
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact
    DECLARE @MJ_ConversationArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifact]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifacts_cursor INTO @MJ_ConversationArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifact] @ID = @MJ_ConversationArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifacts_cursor INTO @MJ_ConversationArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifacts_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Conversation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '69527622-1aab-4245-bcd5-e49be2af576b'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TestRun')
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
            '69527622-1aab-4245-bcd5-e49be2af576b',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100111,
            'TestRun',
            'Test Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'ecfa16c9-1005-4b07-90cb-690623428037'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'PrimaryScopeEntity')
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
            'ecfa16c9-1005-4b07-90cb-690623428037',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100112,
            'PrimaryScopeEntity',
            'Primary Scope Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '22c21c2a-acab-4dbb-8152-4017f2ac3a92'  OR 
               (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'SourceConversationDetail')
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
            '22c21c2a-acab-4dbb-8152-4017f2ac3a92',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: AI Agent Notes
            100051,
            'SourceConversationDetail',
            'Source Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '1c198087-022d-46ba-bd30-b17c8ac7537c'  OR 
               (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'SourceAIAgentRun')
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
            '1c198087-022d-46ba-bd30-b17c8ac7537c',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: AI Agent Notes
            100052,
            'SourceAIAgentRun',
            'Source AI Agent Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '79fad22e-7080-4283-b3dd-ed140949e39a'  OR 
               (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'PrimaryScopeEntity')
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
            '79fad22e-7080-4283-b3dd-ed140949e39a',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: AI Agent Notes
            100055,
            'PrimaryScopeEntity',
            'Primary Scope Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'c1eea573-c0a7-4c99-a03c-a85f98a53a6d'  OR 
               (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'SourceConversationDetail')
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
            'c1eea573-c0a7-4c99-a03c-a85f98a53a6d',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            100052,
            'SourceConversationDetail',
            'Source Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '61daa1c3-80eb-4d5b-85a4-ce516e4e9700'  OR 
               (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'SourceAIAgentRun')
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
            '61daa1c3-80eb-4d5b-85a4-ce516e4e9700',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            100053,
            'SourceAIAgentRun',
            'Source AI Agent Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '2273625c-67fc-40e6-96f7-ff4cc09bbaa9'  OR 
               (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'PrimaryScopeEntity')
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
            '2273625c-67fc-40e6-96f7-ff4cc09bbaa9',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            100055,
            'PrimaryScopeEntity',
            'Primary Scope Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '68D6F8C2-3A54-4D7A-92DD-F90792348295'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C769307F-0D9E-4ED3-9FE1-9DD39E9D8F8C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '68D6F8C2-3A54-4D7A-92DD-F90792348295'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4B625830-85B2-4ECF-84CE-2F4D55A8AF4D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F8B14370-C3EF-4C1F-A65D-EFB8205A38DE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C60AA966-1839-4F47-A009-F08FBE3B2885'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C769307F-0D9E-4ED3-9FE1-9DD39E9D8F8C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '68D6F8C2-3A54-4D7A-92DD-F90792348295'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4B625830-85B2-4ECF-84CE-2F4D55A8AF4D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C60AA966-1839-4F47-A009-F08FBE3B2885'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B59DCB05-35E9-4A99-BFB6-82A4048ECEAD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B4B8F3E8-9E36-4347-A842-B7BFD5126F65'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D1A921A6-F7D5-4037-89E3-1FCCEB101D5F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '51A944B0-A282-4ED0-9D4E-1EE41498065A'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '025D0895-4A17-4168-8B38-9B9C6D68CFD8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '80FAFCF2-539E-4A38-86CD-9E9395C8664F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B3C8FBEA-CA05-462D-94E5-7B4875446A79'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '34F910FE-C31E-42FE-9A9E-08407AF79BDB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '51A944B0-A282-4ED0-9D4E-1EE41498065A'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '057C84E7-BAD3-405A-B2B9-5D13551EFCD4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0B55CD7D-06C3-485C-9FC0-CF4C33D66DF5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '51A944B0-A282-4ED0-9D4E-1EE41498065A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6962DE96-798F-4E1C-AE87-489429927C4C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4AB03803-B3E2-4482-986B-13A5EBB70E76'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4AB03803-B3E2-4482-986B-13A5EBB70E76'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C01717BE-FF5A-4C92-820A-A547324F6F1B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '70B237B2-D508-4C19-8838-850ACC9961F1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4EB4FD5F-749F-4A11-B5C4-8F70995DAC3C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B5569F04-CBF7-4660-8BA5-CA0D1EAB75CF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C43547D2-E1F3-4AE5-9A2B-9C63ADBE2365'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4AB03803-B3E2-4482-986B-13A5EBB70E76'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C01717BE-FF5A-4C92-820A-A547324F6F1B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '70B237B2-D508-4C19-8838-850ACC9961F1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4EB4FD5F-749F-4A11-B5C4-8F70995DAC3C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B5569F04-CBF7-4660-8BA5-CA0D1EAB75CF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C43547D2-E1F3-4AE5-9A2B-9C63ADBE2365'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '090830CE-4073-486C-BBF2-E2105BEADD91'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '52E74C81-D246-4B52-B7A7-91757C299671'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 29 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '225421C0-34B7-466F-95C9-74DE8432B137'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '54E9381D-F8B7-4AE2-BE4D-B8BA612E2923'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Note Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '324755A2-657E-42A0-A339-620F7379397D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Note Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Note',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4AB03803-B3E2-4482-986B-13A5EBB70E76'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7CF765EF-9212-427B-B7BA-2CA57E27CD22'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B2B427D-3F97-494F-94D6-AB18FD7E83CA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B8B8C7B4-2F27-4555-80F1-FEF0D2F662C3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Note Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C01717BE-FF5A-4C92-820A-A547324F6F1B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Note Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Auto Generated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A9FC5B8-D931-4741-91FE-1C40ABF4B1AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Note Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '93CEF268-8B79-4985-9E7F-5F584B7F1D14'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Note Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '70B237B2-D508-4C19-8838-850ACC9961F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A96D7811-B4EF-47B3-B044-C5F1D0658AAB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8C2C7801-F008-49D7-A663-1A16BE929C5B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source AI Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A343B2F0-D157-4574-BADD-0520A2D9C4A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4796734A-9D50-4726-A04A-59010C91A3E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Embedding & AI Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Vector',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7309EF51-3A04-4AE1-A7DC-B999BB0044A3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Embedding & AI Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '55BA7B81-7947-4990-928B-083BE2BFC916'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1F1E84FE-99C5-4AEB-817E-6B03BB6FD5BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '702F4025-07E3-458E-9B93-82313A52DBD0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Secondary Scopes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '513178C8-F947-4A4F-9A9C-678648E51368'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4EB4FD5F-749F-4A11-B5C4-8F70995DAC3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Note Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '45946792-C4FA-4D0B-81C9-C1C764E185BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B5569F04-CBF7-4660-8BA5-CA0D1EAB75CF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0FCB492C-5AFA-492B-8E6C-B56A269BD486'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '22C21C2A-ACAB-4DBB-8152-4017F2AC3A92'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source AI Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C198087-022D-46BA-BD30-B17C8AC7537C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C43547D2-E1F3-4AE5-9A2B-9C63ADBE2365'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Embedding & AI Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '728A2DC6-ED02-4841-B9D2-B2641A4BF107'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79FAD22E-7080-4283-B3DD-ED140949E39A'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('86083b14-f1fe-4aa1-b459-5a7e722dcd11', 'A24EF5EC-D32C-4A53-85A9-364E322451E6', 'FieldCategoryInfo', '{"Scope & References":{"icon":"fa fa-database","description":""},"Note Details":{"icon":"fa fa-file-alt","description":""},"Embedding & AI Data":{"icon":"fa fa-cog","description":""},"System Metadata":{"icon":"fa fa-clock","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Scope & References":"fa fa-database","Note Details":"fa fa-file-alt","Embedding & AI Data":"fa fa-cog","System Metadata":"fa fa-clock"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 29 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2290C50-5F77-42C9-87CC-BA48AB0C5F05'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2EB80CB8-563E-4B99-ABF2-43A06B6D31CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '21A77BE8-4968-47AD-BE2C-6F4B6FBAE2A8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9AD840C2-9F6B-4772-B411-ABA7826AA8FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CD983747-712D-4FCA-B447-51C1E20A0BC6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C5F5BA2A-EDE9-473D-917F-E639A4AA5CB3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CFA8EC69-9BE6-4022-9D6D-E773285172D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F71559C8-C0FB-4271-B195-E3DF78171027'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Secondary Scopes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8464F63A-25B8-485F-9D0E-114C5CC7852E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B59DCB05-35E9-4A99-BFB6-82A4048ECEAD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4B8F3E8-9E36-4347-A842-B7BFD5126F65'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D1A921A6-F7D5-4037-89E3-1FCCEB101D5F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2273625C-67FC-40E6-96F7-FF4CC09BBAA9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Example Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Example Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C769307F-0D9E-4ED3-9FE1-9DD39E9D8F8C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Example Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Example Input',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68D6F8C2-3A54-4D7A-92DD-F90792348295'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Example Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Example Output',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B625830-85B2-4ECF-84CE-2F4D55A8AF4D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Example Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Generated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C7EF8BB-5304-4690-BE16-8E5C103A0ED4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Example Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8B14370-C3EF-4C1F-A65D-EFB8205A38DE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Example Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '59A000BE-5A98-4DCA-A730-BCE65B4E4F11'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Example Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C60AA966-1839-4F47-A009-F08FBE3B2885'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Provenance',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '07161F6A-9744-45BE-962A-B49FF252F408'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Provenance',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2AEAB8EC-707E-4693-9D16-628F22A73A1D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Provenance',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source AI Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4ABD7D8F-8C67-49A2-A2DB-6C6B3DBBE8E2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Provenance',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D95DC09C-A09B-4E8D-901B-C54F0237DD85'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Provenance',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C1EEA573-C0A7-4C99-A03C-A85F98A53A6D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Provenance',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source AI Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '61DAA1C3-80EB-4D5B-85A4-CE516E4E9700'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Semantic Indexing',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Vector',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E6192A47-269C-4E1E-B7FB-46086CB6BD8F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Semantic Indexing',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C15EE751-6715-48BD-BBD1-0D3C36F27A15'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Semantic Indexing',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8758A7B9-7FBA-4F76-BBC3-039DECF15B85'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0b185317-6fe4-4689-ad84-8e69add5a3ad', '3A139346-CC48-479A-A53B-8892664F5DFD', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-cog","description":""},"Ownership & Scope":{"icon":"fa fa-users","description":""},"Source Provenance":{"icon":"fa fa-link","description":""},"Semantic Indexing":{"icon":"fa fa-search","description":""},"Example Details":{"icon":"fa fa-file-alt","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":"fa fa-cog","Ownership & Scope":"fa fa-users","Source Provenance":"fa fa-link","Semantic Indexing":"fa fa-search","Example Details":"fa fa-file-alt"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 58 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0CDCEFDE-FBFE-44CD-ACAF-A1543F309EC4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B5B91C2-2D8D-441D-9281-19089EF7B21E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8BE780BC-757D-4AC0-9ECC-5C9FFBAA38FD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '44D62D04-D013-4C3B-A535-555E3AA388BB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '51A944B0-A282-4ED0-9D4E-1EE41498065A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scheduled Job Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '77918E52-6BA1-4FA6-9AE1-F5987906D0C8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A860DAE5-5AA8-4EBE-9C5F-914AFDD0E3C6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Last Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D3B3BBE7-627B-4A67-BFC3-81C2F248B9ED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D94F2321-5DCA-4B11-8E17-57DC851BFDC5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2996B20E-9DFD-41C8-A810-B0EC3038622B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scheduled Job Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C30AB32-15A4-460D-9955-DD89EDEF5F62'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '025D0895-4A17-4168-8B38-9B9C6D68CFD8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '80FAFCF2-539E-4A38-86CD-9E9395C8664F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B3C8FBEA-CA05-462D-94E5-7B4875446A79'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '057C84E7-BAD3-405A-B2B9-5D13551EFCD4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '974746E9-53D2-484B-AFF3-9B7D9292D6B7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent State',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6FF56877-27AE-47D9-A6CD-641088C2458E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cancellation Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '14A76D05-D24C-4EE0-B24E-B840DD330F60'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Step',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6FFF2754-A03E-4DFD-AC17-FB16CDAD5346'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B55CD7D-06C3-485C-9FC0-CF4C33D66DF5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Starting Payload',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B106357D-347F-45BE-89AA-B96298ED1DDA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Prompt Iterations',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7411D673-9C57-4419-96BA-1C607B77DA43'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '08037344-3952-4EBE-BA34-F87BD670C61A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Verbose',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '07CD2EF5-1737-4662-BE76-301A3E88BD9D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6962DE96-798F-4E1C-AE87-489429927C4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4FF245A3-C823-49F8-B20A-31A64D0E6E77'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '625FE9E6-9058-4FDD-8970-4595336C60D3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8505597E-558F-4222-ABF7-5BA4E163A97D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D4896B2F-D530-4844-8C96-A0016F0A81D4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '38A3F73F-9364-428E-A195-5DF74B9F9ACB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8FAF86E8-F74E-4D76-972A-197FBB245478'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9FEAEC67-96DB-4551-9954-AC631C8ADF0A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '66AAF27B-995D-4F5F-8149-BE6E35C7694C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resource Usage & Cost',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Tokens Used',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A7C0AFAA-E27C-41DA-8FAA-0B48E276089D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resource Usage & Cost',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Cost',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '34F910FE-C31E-42FE-9A9E-08407AF79BDB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resource Usage & Cost',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Prompt Tokens Used',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '69B7EB99-3409-4B84-B979-877E992964DC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resource Usage & Cost',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Completion Tokens Used',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4BE28D8A-2E06-460D-BDD7-34E5BEB5DBB0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resource Usage & Cost',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Tokens Used Rollup',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A60033A0-D13C-4954-8EF3-6BB8A5618126'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resource Usage & Cost',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Prompt Tokens Used Rollup',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FCD5864B-65BB-4E9F-A3FE-2C09D3461364'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resource Usage & Cost',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Completion Tokens Used Rollup',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B1401167-0C3B-4D14-9633-6A3A1DC429A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resource Usage & Cost',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Cost Rollup',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F9928463-5F2B-46C0-8DA3-6EEF2FA816EF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '13198D22-60EB-4694-B420-7BDB4E3E9BB8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B025CDE5-5300-46DA-BC49-7130D0689E81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration & Overrides',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '038B0DB2-EB71-4E8D-945E-EBA1AA570391'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration & Overrides',
       GeneratedFormSection = 'Category',
       DisplayName = 'Override Model ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E95FDE6B-12E3-4A41-AA15-9EAD7695B266'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration & Overrides',
       GeneratedFormSection = 'Category',
       DisplayName = 'Override Vendor ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8747D24-8E7D-4D12-BCF8-8CD9F7749566'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration & Overrides',
       GeneratedFormSection = 'Category',
       DisplayName = 'Effort Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B16B5B36-7238-4A90-ABAD-DA64ED8FADCA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration & Overrides',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2F32D57F-954A-4DDD-BE50-A52E7E9FA1FF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration & Overrides',
       GeneratedFormSection = 'Category',
       DisplayName = 'Override Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F27EECF4-14ED-4338-9ABE-3E472415CE2B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration & Overrides',
       GeneratedFormSection = 'Category',
       DisplayName = 'Override Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E8614CB-65CB-4C28-9D0B-198CBA49CBBF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Testing & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7685B81B-FD95-40F8-A3D6-4EB710DB054D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Testing & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '69527622-1AAB-4245-BCD5-E49BE2AF576B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & Multi‑Tenant',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B0F924E4-A919-4AE5-A0E6-F5D4847926D6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & Multi‑Tenant',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C6602391-0B0C-4ECB-8A16-3A8B019B5C3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & Multi‑Tenant',
       GeneratedFormSection = 'Category',
       DisplayName = 'Secondary Scopes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '21FC62F2-F9CC-40C4-A1BA-462699CCD289'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope & Multi‑Tenant',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Scope Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ECFA16C9-1005-4B07-90CB-690623428037'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f4d93028-6b17-4f6b-a187-583702ad07e4', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'FieldCategoryInfo', '{"Testing & Validation":{"icon":"fa fa-vial","description":"Fields related to test runs and validation of agent executions."},"Scope & Multi‑Tenant":{"icon":"fa fa-layer-group","description":"Multi‑tenant scoping and additional dimension attributes for agent runs."},"Run Identification & Hierarchy":{"icon":"fa fa-sitemap","description":""},"Execution Details & Outcome":{"icon":"fa fa-clipboard-list","description":""},"Resource Usage & Cost":{"icon":"fa fa-chart-line","description":""},"Configuration & Overrides":{"icon":"fa fa-sliders-h","description":""},"Contextual Relationships":{"icon":"fa fa-users","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Testing & Validation":"fa fa-vial","Scope & Multi‑Tenant":"fa fa-layer-group","Run Identification & Hierarchy":"fa fa-sitemap","Execution Details & Outcome":"fa fa-clipboard-list","Resource Usage & Cost":"fa fa-chart-line","Configuration & Overrides":"fa fa-sliders-h","Contextual Relationships":"fa fa-users","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 59 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Logo URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '77845738-5781-458B-AD3C-5DAE745373C2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3177830D-10A0-4003-B95D-8514974BA846'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expose As Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '090830CE-4073-486C-BBF2-E2105BEADD91'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8261D630-2560-4C03-BE14-C8A9682ABBB4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enable Context Compression',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '09AFE563-63E3-4F2B-B6F1-5945432FF07B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Message Threshold',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '451D5C8F-6749-4789-A158-658B38A74AE4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFD209C5-48F3-45D1-9094-E76EC832EA07'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Message Retention Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73A50D68-976F-49A7-9737-12D1D26C6011'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '91CA077D-3F59-48E1-A593-AF8686276115'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Selection Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Downstream Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '85B6AA86-796D-4970-9E35-5A483498B517'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Upstream Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA784B76-66CD-434B-90BD-DEC808917E68'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Self Read Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Self Write Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E542986-0164-4B9E-8457-06826A4AB892'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C7959AE-F48B-4858-8383-28C3F4706314'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8931DE12-4048-4DEB-A2A3-E821354CFFB2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Max Retries',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Cost Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '23850C5A-311A-4271-AE53-BD36921C5AA5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Tokens Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Iterations Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Time Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Min Executions Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Executions Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Starting Payload Validation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Starting Payload Validation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0947203D-A5CA-4ED2-895B-17A8007323FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt Effort Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Chat Handling Option',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Artifact Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F58EA638-CE95-4D2A-9095-9909149B83C7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Owner User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Creation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4371BED0-7C4A-4D24-9E07-17E15D617607'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Functional Requirements',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Technical Design',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CAEA2872-B089-4192-8FA8-1737FF357FFD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inject Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Notes To Inject',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Note Injection Strategy',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inject Examples',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Examples To Inject',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Example Injection Strategy',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '291FEE7A-1245-4C82-A470-07EEB8847F1E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Restricted',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E5B17B79-282F-4F19-9656-246DE119D588'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '445C1618-EADB-4B34-B318-40C662141FE1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Messages',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8924303-D53A-43B0-B70F-5B74FA6248D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope Config',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent (Name)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '52E74C81-D246-4B52-B7A7-91757C299671'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD36EF69-1494-409C-A97E-FE73669DD28A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Artifact Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Owner User (Name)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '644AA4B2-1044-430C-BCBA-245644294E02'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('fdaebb26-5b26-4820-b46e-8f15bd6cb9a6', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'FieldCategoryInfo', '{"Scope Configuration":{"icon":"fa fa-sliders-h","description":"Multi‑tenant scope settings that define dimension inheritance and requirements"},"Agent Identity & Presentation":{"icon":"fa fa-id-card","description":""},"Hierarchy & Invocation":{"icon":"fa fa-sitemap","description":""},"Runtime Limits & Execution Settings":{"icon":"fa fa-tachometer-alt","description":""},"Payload & Data Flow":{"icon":"fa fa-exchange-alt","description":""},"Context Compression":{"icon":"fa fa-compress","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Scope Configuration":"fa fa-sliders-h","Agent Identity & Presentation":"fa fa-id-card","Hierarchy & Invocation":"fa fa-sitemap","Runtime Limits & Execution Settings":"fa fa-tachometer-alt","Payload & Data Flow":"fa fa-exchange-alt","Context Compression":"fa fa-compress"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'FieldCategoryIcons'
            





















































































-- SECOND CODE GEN RUN




/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'be3f36fd-8d3b-4f75-9db6-dafd154e394c'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PromptRun')
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
            'be3f36fd-8d3b-4f75-9db6-dafd154e394c',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            100041,
            'PromptRun',
            'Prompt Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'de11f887-716d-4ae1-bd9c-ff68b08c536b'  OR 
               (EntityID = 'D7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'de11f887-716d-4ae1-bd9c-ff68b08c536b',
            'D7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Company Integrations
            100016,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'c2a3cb66-4281-44b6-9385-72c66610a612'  OR 
               (EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'c2a3cb66-4281-44b6-9385-72c66610a612',
            'D8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Roles
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '37d1df6a-56dd-4c8e-b1b9-7301f6109b7c'  OR 
               (EntityID = 'D9238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            '37d1df6a-56dd-4c8e-b1b9-7301f6109b7c',
            'D9238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Skills
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'dadc4a7f-e41d-4f9c-9eb4-40d1ef5a42a1'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRun')
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
            'dadc4a7f-e41d-4f9c-9eb4-40d1ef5a42a1',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100023,
            'CompanyIntegrationRun',
            'Company Integration Run',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'e2563f0d-f316-4e35-996e-2ab8c2ed60ff'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRunDetail')
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
            'e2563f0d-f316-4e35-996e-2ab8c2ed60ff',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100024,
            'CompanyIntegrationRunDetail',
            'Company Integration Run Detail',
            NULL,
            'nvarchar',
            900,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'da37d025-f1a8-47cd-9bb0-584578ae0ff3'  OR 
               (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ReplayRun')
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
            'da37d025-f1a8-47cd-9bb0-584578ae0ff3',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Changes
            100040,
            'ReplayRun',
            'Replay Run',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'b38d889b-c155-45e4-bd38-5ccbbba863d9'  OR 
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ConversationDetail')
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
            'b38d889b-c155-45e4-bd38-5ccbbba863d9',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Reports
            100053,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '7e3a3e64-1041-4c2b-b410-ebc9b8e7598b'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TestRun')
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
            '7e3a3e64-1041-4c2b-b410-ebc9b8e7598b',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100045,
            'TestRun',
            'Test Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'f5c02f03-f85a-44c4-a27e-624f3f6c0d10'  OR 
               (EntityID = '18248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMergeLog')
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
            'f5c02f03-f85a-44c4-a27e-624f3f6c0d10',
            '18248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Merge Deletion Logs
            100015,
            'RecordMergeLog',
            'Record Merge Log',
            NULL,
            'nvarchar',
            900,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'a6b75b54-a434-40a4-a8b8-31373f808e71'  OR 
               (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DuplicateRun')
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
            'a6b75b54-a434-40a4-a8b8-31373f808e71',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Duplicate Run Details
            100021,
            'DuplicateRun',
            'Duplicate Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '29a457bd-0135-420f-8f46-b808ffa4dcbe'  OR 
               (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '29a457bd-0135-420f-8f46-b808ffa4dcbe',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Invocations
            100014,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '70ab3055-7bac-4cf3-b134-62f5fcb040c5'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '70ab3055-7bac-4cf3-b134-62f5fcb040c5',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100015,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '5317573a-d081-4f8c-bb85-f14211a4fda0'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ActionFilter')
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
            '5317573a-d081-4f8c-bb85-f14211a4fda0',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100016,
            'ActionFilter',
            'Action Filter',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'd6b57bf0-6ef5-4b02-bdb3-25a8741bab38'  OR 
               (EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TemplateContent')
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
            'd6b57bf0-6ef5-4b02-bdb3-25a8741bab38',
            '4B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Template Params
            100037,
            'TemplateContent',
            'Template Content',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'c3167fe4-6281-4006-850b-4c95de880348'  OR 
               (EntityID = '4D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecommendationRun')
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
            'c3167fe4-6281-4006-850b-4c95de880348',
            '4D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendations
            100014,
            'RecommendationRun',
            'Recommendation Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'd3951a2c-a9df-49b1-803d-e6b4af35b856'  OR 
               (EntityID = '50248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Recommendation')
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
            'd3951a2c-a9df-49b1-803d-e6b4af35b856',
            '50248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendation Items
            100016,
            'Recommendation',
            'Recommendation',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'e1162014-dfcb-4926-bf43-bd2bce9cdd32'  OR 
               (EntityID = '52248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityCommunicationMessageType')
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
            'e1162014-dfcb-4926-bf43-bd2bce9cdd32',
            '52248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Communication Fields
            100013,
            'EntityCommunicationMessageType',
            'Entity Communication Message Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '1cd99fe8-5c31-4e77-be85-c592fed2b103'  OR 
               (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '1cd99fe8-5c31-4e77-be85-c592fed2b103',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Params
            100018,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '7ee6d961-5b30-4f88-a367-94f69724bbbe'  OR 
               (EntityID = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E' AND Name = 'ConversationDetail')
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
            '7ee6d961-5b30-4f88-a367-94f69724bbbe',
            'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E', -- Entity: MJ: Conversation Detail Ratings
            100016,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'bbdee6f7-fd63-4138-b1d4-48c0af19b5c5'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'AgentRun')
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
            'bbdee6f7-fd63-4138-b1d4-48c0af19b5c5',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100046,
            'AgentRun',
            'Agent Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'bab09cf3-64c5-4f58-8a31-714b74d458e6'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'Parent')
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
            'bab09cf3-64c5-4f58-8a31-714b74d458e6',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100047,
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '8f39be39-f850-4f08-8653-90ef9d04783f'  OR 
               (EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'ConversationDetail')
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
            '8f39be39-f850-4f08-8653-90ef9d04783f',
            '16AB21D1-8047-41B9-8AEA-CD253DED9743', -- Entity: MJ: Conversation Detail Artifacts
            100014,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = '87a5306d-6f17-4d27-a4be-60f1d93fa9dc'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ConversationDetail')
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
            '87a5306d-6f17-4d27-a4be-60f1d93fa9dc',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100046,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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

