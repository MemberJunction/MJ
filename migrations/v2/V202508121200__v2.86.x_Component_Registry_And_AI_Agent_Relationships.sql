-- =====================================================
-- Migration: Component Registry and AI Agent Relationships
-- Version: 2.86.x
-- Description: Creates component registry infrastructure for storing, versioning, and discovering 
--              reusable components across MemberJunction instances. Also adds AI Agent relationship tracking.
-- =====================================================

-- =====================================================
-- SECTION 1: Create ComponentRegistry table
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.ComponentRegistry (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    URI NVARCHAR(500) NULL,
    Type NVARCHAR(50) NULL,
    APIVersion NVARCHAR(50) NULL,
    Status NVARCHAR(50) NULL,
    CONSTRAINT PK_ComponentRegistry PRIMARY KEY (ID)
);

-- Add CHECK constraint for ComponentRegistry Status
ALTER TABLE ${flyway:defaultSchema}.ComponentRegistry
ADD CONSTRAINT CK_ComponentRegistry_Status CHECK (Status IN ('Active', 'Deprecated', 'Offline'));

-- Add CHECK constraint for ComponentRegistry Type
ALTER TABLE ${flyway:defaultSchema}.ComponentRegistry
ADD CONSTRAINT CK_ComponentRegistry_Type CHECK (Type IN ('Public', 'Private', 'Internal'));

-- =====================================================
-- SECTION 2: Create Component table
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.Component (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Namespace NVARCHAR(MAX) NULL,
    Name NVARCHAR(500) NOT NULL,
    Version NVARCHAR(50) NOT NULL,
    VersionSequence INT NOT NULL DEFAULT 0,
    Title NVARCHAR(1000) NULL,
    Description NVARCHAR(MAX) NULL,
    Type NVARCHAR(255) NULL,
    Status NVARCHAR(50) NULL,
    DeveloperName NVARCHAR(255) NULL,
    DeveloperEmail NVARCHAR(255) NULL,
    DeveloperOrganization NVARCHAR(255) NULL,
    SourceRegistryID UNIQUEIDENTIFIER NULL,
    ReplicatedAt DATETIMEOFFSET NULL,
    LastSyncedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_Component PRIMARY KEY (ID),
    CONSTRAINT FK_Component_SourceRegistry FOREIGN KEY (SourceRegistryID) REFERENCES ${flyway:defaultSchema}.ComponentRegistry(ID)
);

-- Add CHECK constraint for Component Status
ALTER TABLE ${flyway:defaultSchema}.Component
ADD CONSTRAINT CK_Component_Status CHECK (Status IN ('Draft', 'Published', 'Deprecated'));

-- Add CHECK constraint for Component Type
ALTER TABLE ${flyway:defaultSchema}.Component
ADD CONSTRAINT CK_Component_Type CHECK (Type IN ('Report', 'Dashboard', 'Form', 'Table', 'Chart', 'Navigation', 'Search', 'Widget', 'Utility', 'Other'));

-- Create unique constraint for Component namespace + name + version combination
CREATE UNIQUE NONCLUSTERED INDEX UX_Component_Namespace_Name_Version 
ON ${flyway:defaultSchema}.Component(Namespace, Name, Version) 
WHERE Namespace IS NOT NULL;
 
-- =====================================================
-- SECTION 10: Create AIAgentRelationship table
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentRelationship (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID UNIQUEIDENTIFIER NOT NULL,
    SubAgentID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    CONSTRAINT PK_AIAgentRelationship PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentRelationship_Agent FOREIGN KEY (AgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AIAgentRelationship_SubAgent FOREIGN KEY (SubAgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID)
);

-- Add CHECK constraint for Status
ALTER TABLE ${flyway:defaultSchema}.AIAgentRelationship
ADD CONSTRAINT CK_AIAgentRelationship_Status CHECK (Status IN ('Pending', 'Active', 'Revoked'));

-- Prevent duplicate relationships
CREATE UNIQUE NONCLUSTERED INDEX UX_AIAgentRelationship_Agent_SubAgent 
ON ${flyway:defaultSchema}.AIAgentRelationship(AgentID, SubAgentID);

-- =====================================================
-- SECTION 11: Add Extended Properties for ComponentRegistry
-- =====================================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Registry catalog for component sources, similar to NPM registry but supporting multiple sources',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentRegistry';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Primary key for the component registry',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentRegistry',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Name of the registry (e.g., MemberJunction Registry, NPM, Internal Registry)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentRegistry',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Description of the registry and its purpose',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentRegistry',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Registry endpoint URI (e.g., https://registry.memberjunction.org)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentRegistry',
    @level2type = N'COLUMN', @level2name = 'URI';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of registry: public, private, or internal',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentRegistry',
    @level2type = N'COLUMN', @level2name = 'Type';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'API version supported by the registry for compatibility',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentRegistry',
    @level2type = N'COLUMN', @level2name = 'APIVersion';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Current status of the registry: active, deprecated, or offline',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentRegistry',
    @level2type = N'COLUMN', @level2name = 'Status';

-- =====================================================
-- SECTION 12: Add Extended Properties for Component
-- =====================================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Main catalog of reusable components with versioning and registry support',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Immutable UUID that remains the same across all systems',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Hierarchical namespace path (e.g., dashboards/sales for local, @memberjunction/dashboards/financial for external)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'Namespace';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Component name within the namespace (e.g., revenue-tracker)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Semantic version number (e.g., 1.0.0, 1.2.3-beta)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'Version';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Numeric sequence for sorting versions',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'VersionSequence';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'User-friendly display title for the component',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'Title';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Detailed description of the component functionality',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Component type: report, dashboard, form, table, chart, navigation, search, widget, utility, or other',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'Type';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Publication status: draft, published, or deprecated',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Name of the component developer or author',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'DeveloperName';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Contact email for the component developer',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'DeveloperEmail';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Organization name of the component developer',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'DeveloperOrganization';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Foreign key to ComponentRegistry - NULL for local components, populated for replicated ones',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'SourceRegistryID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp when the component was replicated from external registry (NULL for local components)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'ReplicatedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Last synchronization timestamp with the source registry',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Component',
    @level2type = N'COLUMN', @level2name = 'LastSyncedAt';
 
-- =====================================================
-- SECTION 20: Add Extended Properties for AIAgentRelationship
-- =====================================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Tracks relationships between AI agents for sub-agent orchestration',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRelationship';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Primary key for AI agent relationships',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRelationship',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Foreign key to parent AIAgent that can invoke the sub-agent',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRelationship',
    @level2type = N'COLUMN', @level2name = 'AgentID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Foreign key to sub-agent AIAgent that can be invoked',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRelationship',
    @level2type = N'COLUMN', @level2name = 'SubAgentID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Status of the relationship: Pending (awaiting approval), Active (can invoke), or Revoked (no longer allowed)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRelationship',
    @level2type = N'COLUMN', @level2name = 'Status';