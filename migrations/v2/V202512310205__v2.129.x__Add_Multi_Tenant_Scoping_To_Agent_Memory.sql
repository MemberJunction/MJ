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

-- ============================================================================
-- 2. AIAgentRun - Add scope columns to record context for each run
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun ADD
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL,
    PrimaryScopeRecordID NVARCHAR(100) NULL,
    SecondaryScopes NVARCHAR(MAX) NULL;

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun ADD CONSTRAINT
    FK_AIAgentRun_PrimaryScopeEntity FOREIGN KEY (PrimaryScopeEntityID)
    REFERENCES ${flyway:defaultSchema}.Entity(ID);

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

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD CONSTRAINT
    FK_AIAgentNote_PrimaryScopeEntity FOREIGN KEY (PrimaryScopeEntityID)
    REFERENCES ${flyway:defaultSchema}.Entity(ID);

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

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIAgentExample ADD CONSTRAINT
    FK_AIAgentExample_PrimaryScopeEntity FOREIGN KEY (PrimaryScopeEntityID)
    REFERENCES ${flyway:defaultSchema}.Entity(ID);

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
