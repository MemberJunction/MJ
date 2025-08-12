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
-- SECTION 3: Create ComponentLibrary table for third-party libraries
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.ComponentLibrary (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(500) NOT NULL,
    DisplayName NVARCHAR(500) NULL,
    Version NVARCHAR(100) NULL,
    GlobalVariable NVARCHAR(255) NULL,
    Category NVARCHAR(100) NULL,
    CDNUrl NVARCHAR(1000) NULL,
    CDNCssUrl NVARCHAR(1000) NULL,
    Description NVARCHAR(MAX) NULL,
    CONSTRAINT PK_ComponentLibrary PRIMARY KEY (ID)
);

-- Add CHECK constraint for ComponentLibrary Category
ALTER TABLE ${flyway:defaultSchema}.ComponentLibrary
ADD CONSTRAINT CK_ComponentLibrary_Category CHECK (Category IN ('Core', 'Runtime', 'UI', 'Charting', 'Utility', 'Other'));

-- Create unique constraint for ComponentLibrary name + version combination
CREATE UNIQUE NONCLUSTERED INDEX UX_ComponentLibrary_Name_Version 
ON ${flyway:defaultSchema}.ComponentLibrary(Name, Version);

-- =====================================================
-- SECTION 4: Create ComponentDependency table for component-to-component dependencies
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.ComponentDependency (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ComponentID UNIQUEIDENTIFIER NOT NULL,
    DependencyComponentID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_ComponentDependency PRIMARY KEY (ID),
    CONSTRAINT FK_ComponentDependency_Component FOREIGN KEY (ComponentID) REFERENCES ${flyway:defaultSchema}.Component(ID) ON DELETE CASCADE,
    CONSTRAINT FK_ComponentDependency_DependencyComponent FOREIGN KEY (DependencyComponentID) REFERENCES ${flyway:defaultSchema}.Component(ID)
);

-- Prevent duplicate component dependencies
CREATE UNIQUE NONCLUSTERED INDEX UX_ComponentDependency_Component_Dependency 
ON ${flyway:defaultSchema}.ComponentDependency(ComponentID, DependencyComponentID);

-- =====================================================
-- SECTION 5: Create ComponentLibraryLink table for component-to-library dependencies
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.ComponentLibraryLink (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ComponentID UNIQUEIDENTIFIER NOT NULL,
    LibraryID UNIQUEIDENTIFIER NOT NULL,
    MinVersion NVARCHAR(100) NULL,
    CONSTRAINT PK_ComponentLibraryLink PRIMARY KEY (ID),
    CONSTRAINT FK_ComponentLibraryLink_Component FOREIGN KEY (ComponentID) REFERENCES ${flyway:defaultSchema}.Component(ID) ON DELETE CASCADE,
    CONSTRAINT FK_ComponentLibraryLink_Library FOREIGN KEY (LibraryID) REFERENCES ${flyway:defaultSchema}.ComponentLibrary(ID)
);

-- Prevent duplicate component-library relationships
CREATE UNIQUE NONCLUSTERED INDEX UX_ComponentLibraryLink_Component_Library 
ON ${flyway:defaultSchema}.ComponentLibraryLink(ComponentID, LibraryID);

-- =====================================================
-- SECTION 6: Add Extended Properties for ComponentLibrary
-- =====================================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Catalog of third-party JavaScript libraries that components can depend on',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Primary key for the component library',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'NPM-style package name (e.g., recharts, lodash, @memberjunction/lib-name)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'User-friendly display name for the library',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'DisplayName';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Library version number',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'Version';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Global variable name when loaded (e.g., _ for lodash, React for react)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'GlobalVariable';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Library category: Core, Runtime, UI, Charting, Utility, or Other',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'Category';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'CDN URL for loading the library JavaScript',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'CDNUrl';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional CDN URL for loading library CSS',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'CDNCssUrl';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Description of the library and its capabilities',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'Description';

-- =====================================================
-- SECTION 7: Add Extended Properties for ComponentDependency
-- =====================================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Tracks component-to-component dependencies for composition',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentDependency';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Primary key for component dependency',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentDependency',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Foreign key to parent Component that has the dependency',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentDependency',
    @level2type = N'COLUMN', @level2name = 'ComponentID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Foreign key to the Component that is depended upon',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentDependency',
    @level2type = N'COLUMN', @level2name = 'DependencyComponentID';

-- =====================================================
-- SECTION 8: Add Extended Properties for ComponentLibraryLink
-- =====================================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Links components to their third-party library dependencies',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibraryLink';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Primary key for component-library relationship',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibraryLink',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Foreign key to Component that depends on the library',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibraryLink',
    @level2type = N'COLUMN', @level2name = 'ComponentID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Foreign key to ComponentLibrary that the component depends on',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibraryLink',
    @level2type = N'COLUMN', @level2name = 'LibraryID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Minimum version requirement using semantic versioning (e.g., ^1.0.0, ~2.5.0)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ComponentLibraryLink',
    @level2type = N'COLUMN', @level2name = 'MinVersion';

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














































/**** CODE GEN RUN ****/
/* SQL generated to create new entity MJ: Component Library Links */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '928eb491-cfe1-46f3-b8c6-bd4034ef3e6b',
         'MJ: Component Library Links',
         'Component Library Links',
         NULL,
         NULL,
         'ComponentLibraryLink',
         'vwComponentLibraryLinks',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Component Library Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '928eb491-cfe1-46f3-b8c6-bd4034ef3e6b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Component Library Links for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('928eb491-cfe1-46f3-b8c6-bd4034ef3e6b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Component Library Links for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('928eb491-cfe1-46f3-b8c6-bd4034ef3e6b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Component Library Links for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('928eb491-cfe1-46f3-b8c6-bd4034ef3e6b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Component Registries */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '57595d6e-e653-4185-be59-0411bd025f75',
         'MJ: Component Registries',
         'Component Registries',
         NULL,
         NULL,
         'ComponentRegistry',
         'vwComponentRegistries',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Component Registries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '57595d6e-e653-4185-be59-0411bd025f75', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Component Registries for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('57595d6e-e653-4185-be59-0411bd025f75', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Component Registries for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('57595d6e-e653-4185-be59-0411bd025f75', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Component Registries for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('57595d6e-e653-4185-be59-0411bd025f75', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Components */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '0fb98a1d-c6ae-4427-b66c-7b31e669756f',
         'MJ: Components',
         'Components',
         NULL,
         NULL,
         'Component',
         'vwComponents',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Components to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0fb98a1d-c6ae-4427-b66c-7b31e669756f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Components for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0fb98a1d-c6ae-4427-b66c-7b31e669756f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Components for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0fb98a1d-c6ae-4427-b66c-7b31e669756f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Components for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0fb98a1d-c6ae-4427-b66c-7b31e669756f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Agent Relationships */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '24f8e069-1acd-4dc4-b013-b6d5ce47eea7',
         'MJ: AI Agent Relationships',
         'AI Agent Relationships',
         NULL,
         NULL,
         'AIAgentRelationship',
         'vwAIAgentRelationships',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: AI Agent Relationships to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '24f8e069-1acd-4dc4-b013-b6d5ce47eea7', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Agent Relationships for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('24f8e069-1acd-4dc4-b013-b6d5ce47eea7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Relationships for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('24f8e069-1acd-4dc4-b013-b6d5ce47eea7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Relationships for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('24f8e069-1acd-4dc4-b013-b6d5ce47eea7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Component Libraries */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '2264aa9a-2197-48e2-bb3d-a498006b37a5',
         'MJ: Component Libraries',
         'Component Libraries',
         NULL,
         NULL,
         'ComponentLibrary',
         'vwComponentLibraries',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Component Libraries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2264aa9a-2197-48e2-bb3d-a498006b37a5', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Component Libraries for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2264aa9a-2197-48e2-bb3d-a498006b37a5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Component Libraries for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2264aa9a-2197-48e2-bb3d-a498006b37a5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Component Libraries for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2264aa9a-2197-48e2-bb3d-a498006b37a5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Component Dependencies */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'a712fd9c-dca3-4409-9f4e-0abe70d25439',
         'MJ: Component Dependencies',
         'Component Dependencies',
         NULL,
         NULL,
         'ComponentDependency',
         'vwComponentDependencies',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Component Dependencies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a712fd9c-dca3-4409-9f4e-0abe70d25439', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Component Dependencies for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a712fd9c-dca3-4409-9f4e-0abe70d25439', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Component Dependencies for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a712fd9c-dca3-4409-9f4e-0abe70d25439', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Component Dependencies for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a712fd9c-dca3-4409-9f4e-0abe70d25439', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ComponentRegistry */
ALTER TABLE [${flyway:defaultSchema}].[ComponentRegistry] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ComponentRegistry */
ALTER TABLE [${flyway:defaultSchema}].[ComponentRegistry] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ComponentDependency */
ALTER TABLE [${flyway:defaultSchema}].[ComponentDependency] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ComponentDependency */
ALTER TABLE [${flyway:defaultSchema}].[ComponentDependency] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Component */
ALTER TABLE [${flyway:defaultSchema}].[Component] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Component */
ALTER TABLE [${flyway:defaultSchema}].[Component] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ComponentLibrary */
ALTER TABLE [${flyway:defaultSchema}].[ComponentLibrary] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ComponentLibrary */
ALTER TABLE [${flyway:defaultSchema}].[ComponentLibrary] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentRelationship */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRelationship] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentRelationship */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRelationship] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ComponentLibraryLink */
ALTER TABLE [${flyway:defaultSchema}].[ComponentLibraryLink] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ComponentLibraryLink */
ALTER TABLE [${flyway:defaultSchema}].[ComponentLibraryLink] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b250efc4-9345-4fb1-8907-375b9e00a9bd'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = 'ID')
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
            'b250efc4-9345-4fb1-8907-375b9e00a9bd',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100001,
            'ID',
            'ID',
            'Primary key for the component registry',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ed4501f6-35b1-4852-a812-9e64cbb81e66'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = 'Name')
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
            'ed4501f6-35b1-4852-a812-9e64cbb81e66',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100002,
            'Name',
            'Name',
            'Name of the registry (e.g., MemberJunction Registry, NPM, Internal Registry)',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7391f5d0-fe6d-4941-a019-1b940fe9ae8a'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = 'Description')
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
            '7391f5d0-fe6d-4941-a019-1b940fe9ae8a',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100003,
            'Description',
            'Description',
            'Description of the registry and its purpose',
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
         WHERE ID = '286093eb-02ed-48d3-836c-69cde642c70c'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = 'URI')
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
            '286093eb-02ed-48d3-836c-69cde642c70c',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100004,
            'URI',
            'URI',
            'Registry endpoint URI (e.g., https://registry.memberjunction.org)',
            'nvarchar',
            1000,
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
         WHERE ID = '2067aeba-3418-4bc3-bbdc-90d86c06b2ba'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = 'Type')
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
            '2067aeba-3418-4bc3-bbdc-90d86c06b2ba',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100005,
            'Type',
            'Type',
            'Type of registry: public, private, or internal',
            'nvarchar',
            100,
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
         WHERE ID = '3b61cb51-35af-4f65-80cd-1c21fcb0eb9a'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = 'APIVersion')
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
            '3b61cb51-35af-4f65-80cd-1c21fcb0eb9a',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100006,
            'APIVersion',
            'API Version',
            'API version supported by the registry for compatibility',
            'nvarchar',
            100,
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
         WHERE ID = 'd7906707-a231-4f33-8694-7b99f2355be9'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = 'Status')
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
            'd7906707-a231-4f33-8694-7b99f2355be9',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100007,
            'Status',
            'Status',
            'Current status of the registry: active, deprecated, or offline',
            'nvarchar',
            100,
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
         WHERE ID = '3387f661-308e-411e-9b27-3daef7a201f7'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = '__mj_CreatedAt')
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
            '3387f661-308e-411e-9b27-3daef7a201f7',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100008,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = 'c91d60f9-32f3-42ab-8b5b-994457073235'  OR 
               (EntityID = '57595D6E-E653-4185-BE59-0411BD025F75' AND Name = '__mj_UpdatedAt')
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
            'c91d60f9-32f3-42ab-8b5b-994457073235',
            '57595D6E-E653-4185-BE59-0411BD025F75', -- Entity: MJ: Component Registries
            100009,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = '09d18294-0a0b-4d7a-ad61-09e1081623f4'  OR 
               (EntityID = 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439' AND Name = 'ID')
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
            '09d18294-0a0b-4d7a-ad61-09e1081623f4',
            'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', -- Entity: MJ: Component Dependencies
            100001,
            'ID',
            'ID',
            'Primary key for component dependency',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f10db6cf-aa9b-405a-a3df-fd6844fc199b'  OR 
               (EntityID = 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439' AND Name = 'ComponentID')
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
            'f10db6cf-aa9b-405a-a3df-fd6844fc199b',
            'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', -- Entity: MJ: Component Dependencies
            100002,
            'ComponentID',
            'Component ID',
            'Foreign key to parent Component that has the dependency',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '757194e3-a344-46ff-ae68-24b31825fb2e'  OR 
               (EntityID = 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439' AND Name = 'DependencyComponentID')
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
            '757194e3-a344-46ff-ae68-24b31825fb2e',
            'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', -- Entity: MJ: Component Dependencies
            100003,
            'DependencyComponentID',
            'Dependency Component ID',
            'Foreign key to the Component that is depended upon',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2c2322af-6d68-4eb2-bb2d-8e06c0e1fcf4'  OR 
               (EntityID = 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439' AND Name = '__mj_CreatedAt')
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
            '2c2322af-6d68-4eb2-bb2d-8e06c0e1fcf4',
            'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', -- Entity: MJ: Component Dependencies
            100004,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = '7851ac7c-06e3-4325-9037-b83ce7f69b21'  OR 
               (EntityID = 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439' AND Name = '__mj_UpdatedAt')
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
            '7851ac7c-06e3-4325-9037-b83ce7f69b21',
            'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', -- Entity: MJ: Component Dependencies
            100005,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = 'cc4024ef-5c75-47c6-b652-4e59807fa38c'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'ID')
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
            'cc4024ef-5c75-47c6-b652-4e59807fa38c',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100001,
            'ID',
            'ID',
            'Immutable UUID that remains the same across all systems',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7426ad75-ab53-43cc-a80b-6a0c8396d4d1'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'Namespace')
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
            '7426ad75-ab53-43cc-a80b-6a0c8396d4d1',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100002,
            'Namespace',
            'Namespace',
            'Hierarchical namespace path (e.g., dashboards/sales for local, @memberjunction/dashboards/financial for external)',
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
         WHERE ID = 'bdcf6a68-1347-4d12-bf84-92aaa15ee59f'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'Name')
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
            'bdcf6a68-1347-4d12-bf84-92aaa15ee59f',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100003,
            'Name',
            'Name',
            'Component name within the namespace (e.g., revenue-tracker)',
            'nvarchar',
            1000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6ee80645-1983-4017-9f57-3da72567e6f9'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'Version')
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
            '6ee80645-1983-4017-9f57-3da72567e6f9',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100004,
            'Version',
            'Version',
            'Semantic version number (e.g., 1.0.0, 1.2.3-beta)',
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = '17e8fc7a-cb13-47cf-a790-ebadf968acf1'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'VersionSequence')
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
            '17e8fc7a-cb13-47cf-a790-ebadf968acf1',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100005,
            'VersionSequence',
            'Version Sequence',
            'Numeric sequence for sorting versions',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
         WHERE ID = 'cc87d45d-a158-4b90-bea8-edd826b5d9a8'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'Title')
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
            'cc87d45d-a158-4b90-bea8-edd826b5d9a8',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100006,
            'Title',
            'Title',
            'User-friendly display title for the component',
            'nvarchar',
            2000,
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
         WHERE ID = '6e1698a1-55f6-4a3a-b94e-557f1e5faef4'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'Description')
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
            '6e1698a1-55f6-4a3a-b94e-557f1e5faef4',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100007,
            'Description',
            'Description',
            'Detailed description of the component functionality',
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
         WHERE ID = '9bc99bae-fbc0-4656-9d63-8fd3640449c4'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'Type')
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
            '9bc99bae-fbc0-4656-9d63-8fd3640449c4',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100008,
            'Type',
            'Type',
            'Component type: report, dashboard, form, table, chart, navigation, search, widget, utility, or other',
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
         WHERE ID = '3d82397d-afb5-41d1-92e0-c3bb7c0bbecd'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'Status')
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
            '3d82397d-afb5-41d1-92e0-c3bb7c0bbecd',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100009,
            'Status',
            'Status',
            'Publication status: draft, published, or deprecated',
            'nvarchar',
            100,
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
         WHERE ID = '2ad32bc8-33a2-42b2-8f3a-9371c4de77e3'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'DeveloperName')
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
            '2ad32bc8-33a2-42b2-8f3a-9371c4de77e3',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100010,
            'DeveloperName',
            'Developer Name',
            'Name of the component developer or author',
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
         WHERE ID = '6d96b160-3b60-4e51-95ff-2e781a10a30b'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'DeveloperEmail')
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
            '6d96b160-3b60-4e51-95ff-2e781a10a30b',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100011,
            'DeveloperEmail',
            'Developer Email',
            'Contact email for the component developer',
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
         WHERE ID = 'cf952fc5-1b4d-4bd0-80f7-48e3d0747656'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'DeveloperOrganization')
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
            'cf952fc5-1b4d-4bd0-80f7-48e3d0747656',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100012,
            'DeveloperOrganization',
            'Developer Organization',
            'Organization name of the component developer',
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
         WHERE ID = 'd278dff8-c341-4cd3-ac83-ad2497ead2f1'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'SourceRegistryID')
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
            'd278dff8-c341-4cd3-ac83-ad2497ead2f1',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100013,
            'SourceRegistryID',
            'Source Registry ID',
            'Foreign key to ComponentRegistry - NULL for local components, populated for replicated ones',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '57595D6E-E653-4185-BE59-0411BD025F75',
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
         WHERE ID = 'bd8bc78e-a562-4387-8bc8-07b902e4443b'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'ReplicatedAt')
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
            'bd8bc78e-a562-4387-8bc8-07b902e4443b',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100014,
            'ReplicatedAt',
            'Replicated At',
            'Timestamp when the component was replicated from external registry (NULL for local components)',
            'datetimeoffset',
            10,
            34,
            7,
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
         WHERE ID = '9a87eabd-d9de-4af9-be54-99e8f342fbe3'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'LastSyncedAt')
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
            '9a87eabd-d9de-4af9-be54-99e8f342fbe3',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100015,
            'LastSyncedAt',
            'Last Synced At',
            'Last synchronization timestamp with the source registry',
            'datetimeoffset',
            10,
            34,
            7,
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
         WHERE ID = '6263a31e-9894-4653-b59c-1c4d3f5a5909'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = '__mj_CreatedAt')
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
            '6263a31e-9894-4653-b59c-1c4d3f5a5909',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100016,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = 'c71b0f7d-df84-4561-8b33-75d5cda93eea'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = '__mj_UpdatedAt')
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
            'c71b0f7d-df84-4561-8b33-75d5cda93eea',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100017,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = '5fe19283-3176-4cc8-958c-7ec72018eae1'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'ID')
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
            '5fe19283-3176-4cc8-958c-7ec72018eae1',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100001,
            'ID',
            'ID',
            'Primary key for the component library',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3894c205-5e5f-4c7c-adb2-9acfa1d4f93c'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'Name')
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
            '3894c205-5e5f-4c7c-adb2-9acfa1d4f93c',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100002,
            'Name',
            'Name',
            'NPM-style package name (e.g., recharts, lodash, @memberjunction/lib-name)',
            'nvarchar',
            1000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5c4868e1-ce8b-45d7-948a-cf4d0508cfae'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'DisplayName')
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
            '5c4868e1-ce8b-45d7-948a-cf4d0508cfae',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100003,
            'DisplayName',
            'Display Name',
            'User-friendly display name for the library',
            'nvarchar',
            1000,
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
         WHERE ID = 'daf7974b-c104-44ca-960b-550bcbf3a523'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'Version')
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
            'daf7974b-c104-44ca-960b-550bcbf3a523',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100004,
            'Version',
            'Version',
            'Library version number',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd989c070-1094-4777-8cc3-ba2ffc520abb'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'GlobalVariable')
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
            'd989c070-1094-4777-8cc3-ba2ffc520abb',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100005,
            'GlobalVariable',
            'Global Variable',
            'Global variable name when loaded (e.g., _ for lodash, React for react)',
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
         WHERE ID = '7366e819-cf7c-4f5f-94f5-cd01914dad98'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'Category')
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
            '7366e819-cf7c-4f5f-94f5-cd01914dad98',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100006,
            'Category',
            'Category',
            'Library category: Core, Runtime, UI, Charting, Utility, or Other',
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
         WHERE ID = '3465499e-959f-41cc-8bbc-2e99e8a78473'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'CDNUrl')
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
            '3465499e-959f-41cc-8bbc-2e99e8a78473',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100007,
            'CDNUrl',
            'CDN Url',
            'CDN URL for loading the library JavaScript',
            'nvarchar',
            2000,
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
         WHERE ID = 'aa3c7d8c-9455-4cef-9ee2-39b62c0b1ea7'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'CDNCssUrl')
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
            'aa3c7d8c-9455-4cef-9ee2-39b62c0b1ea7',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100008,
            'CDNCssUrl',
            'CDN Css Url',
            'Optional CDN URL for loading library CSS',
            'nvarchar',
            2000,
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
         WHERE ID = 'c9652fde-e74a-44ee-8c44-c155c9731d0d'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'Description')
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
            'c9652fde-e74a-44ee-8c44-c155c9731d0d',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100009,
            'Description',
            'Description',
            'Description of the library and its capabilities',
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
         WHERE ID = 'ac898d19-1a34-4803-95f3-ec37a2fa5487'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = '__mj_CreatedAt')
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
            'ac898d19-1a34-4803-95f3-ec37a2fa5487',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = 'ed0c1e5d-4943-4cc9-9bff-41d3f932606d'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = '__mj_UpdatedAt')
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
            'ed0c1e5d-4943-4cc9-9bff-41d3f932606d',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = '1b0ab232-bc44-4e2a-ad21-126e4eaf0936'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'ID')
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
            '1b0ab232-bc44-4e2a-ad21-126e4eaf0936',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100001,
            'ID',
            'ID',
            'Primary key for AI agent relationships',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'daafe687-a87a-4266-878c-854005c650a3'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'AgentID')
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
            'daafe687-a87a-4266-878c-854005c650a3',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100002,
            'AgentID',
            'Agent ID',
            'Foreign key to parent AIAgent that can invoke the sub-agent',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd8100298-fb66-408e-94d6-7acf047e09e9'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'SubAgentID')
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
            'd8100298-fb66-408e-94d6-7acf047e09e9',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100003,
            'SubAgentID',
            'Sub Agent ID',
            'Foreign key to sub-agent AIAgent that can be invoked',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d98e619-339e-46f2-883d-b27f81a81194'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'Status')
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
            '0d98e619-339e-46f2-883d-b27f81a81194',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100004,
            'Status',
            'Status',
            'Status of the relationship: Pending (awaiting approval), Active (can invoke), or Revoked (no longer allowed)',
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = '3c2cc2cb-6515-4299-b7c1-7c73fae2d30a'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = '__mj_CreatedAt')
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
            '3c2cc2cb-6515-4299-b7c1-7c73fae2d30a',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100005,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = 'ef777cff-8457-4e83-a004-43e033ffab93'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = '__mj_UpdatedAt')
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
            'ef777cff-8457-4e83-a004-43e033ffab93',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100006,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = 'ad2f600a-67ea-4be3-9f94-51fd4bd2f203'  OR 
               (EntityID = '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B' AND Name = 'ID')
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
            'ad2f600a-67ea-4be3-9f94-51fd4bd2f203',
            '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', -- Entity: MJ: Component Library Links
            100001,
            'ID',
            'ID',
            'Primary key for component-library relationship',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5cedbae7-5933-43c3-b7fd-1b52079eb72b'  OR 
               (EntityID = '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B' AND Name = 'ComponentID')
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
            '5cedbae7-5933-43c3-b7fd-1b52079eb72b',
            '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', -- Entity: MJ: Component Library Links
            100002,
            'ComponentID',
            'Component ID',
            'Foreign key to Component that depends on the library',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '04629e96-2d99-42b6-8b2b-b1a185650664'  OR 
               (EntityID = '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B' AND Name = 'LibraryID')
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
            '04629e96-2d99-42b6-8b2b-b1a185650664',
            '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', -- Entity: MJ: Component Library Links
            100003,
            'LibraryID',
            'Library ID',
            'Foreign key to ComponentLibrary that the component depends on',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '2264AA9A-2197-48E2-BB3D-A498006B37A5',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd3be3ca5-08b8-4b4c-8726-0e8378d2bc51'  OR 
               (EntityID = '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B' AND Name = 'MinVersion')
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
            'd3be3ca5-08b8-4b4c-8726-0e8378d2bc51',
            '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', -- Entity: MJ: Component Library Links
            100004,
            'MinVersion',
            'Min Version',
            'Minimum version requirement using semantic versioning (e.g., ^1.0.0, ~2.5.0)',
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
         WHERE ID = '0c3aab28-d1d6-4d04-b0f6-9a65ac59c81b'  OR 
               (EntityID = '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B' AND Name = '__mj_CreatedAt')
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
            '0c3aab28-d1d6-4d04-b0f6-9a65ac59c81b',
            '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', -- Entity: MJ: Component Library Links
            100005,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
         WHERE ID = '40d7e2ae-bfaa-45ab-9135-35ba959387f0'  OR 
               (EntityID = '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B' AND Name = '__mj_UpdatedAt')
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
            '40d7e2ae-bfaa-45ab-9135-35ba959387f0',
            '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', -- Entity: MJ: Component Library Links
            100006,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D7906707-A231-4F33-8694-7B99F2355BE9', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D7906707-A231-4F33-8694-7B99F2355BE9', 2, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D7906707-A231-4F33-8694-7B99F2355BE9', 3, 'Offline', 'Offline')

/* SQL text to update ValueListType for entity field ID D7906707-A231-4F33-8694-7B99F2355BE9 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D7906707-A231-4F33-8694-7B99F2355BE9'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2067AEBA-3418-4BC3-BBDC-90D86C06B2BA', 1, 'Public', 'Public')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2067AEBA-3418-4BC3-BBDC-90D86C06B2BA', 2, 'Private', 'Private')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2067AEBA-3418-4BC3-BBDC-90D86C06B2BA', 3, 'Internal', 'Internal')

/* SQL text to update ValueListType for entity field ID 2067AEBA-3418-4BC3-BBDC-90D86C06B2BA */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2067AEBA-3418-4BC3-BBDC-90D86C06B2BA'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3D82397D-AFB5-41D1-92E0-C3BB7C0BBECD', 1, 'Draft', 'Draft')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3D82397D-AFB5-41D1-92E0-C3BB7C0BBECD', 2, 'Published', 'Published')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3D82397D-AFB5-41D1-92E0-C3BB7C0BBECD', 3, 'Deprecated', 'Deprecated')

/* SQL text to update ValueListType for entity field ID 3D82397D-AFB5-41D1-92E0-C3BB7C0BBECD */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3D82397D-AFB5-41D1-92E0-C3BB7C0BBECD'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 1, 'Report', 'Report')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 2, 'Dashboard', 'Dashboard')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 3, 'Form', 'Form')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 4, 'Table', 'Table')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 5, 'Chart', 'Chart')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 6, 'Navigation', 'Navigation')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 7, 'Search', 'Search')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 8, 'Widget', 'Widget')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 9, 'Utility', 'Utility')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9BC99BAE-FBC0-4656-9D63-8FD3640449C4', 10, 'Other', 'Other')

/* SQL text to update ValueListType for entity field ID 9BC99BAE-FBC0-4656-9D63-8FD3640449C4 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9BC99BAE-FBC0-4656-9D63-8FD3640449C4'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0D98E619-339E-46F2-883D-B27F81A81194', 1, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0D98E619-339E-46F2-883D-B27F81A81194', 2, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0D98E619-339E-46F2-883D-B27F81A81194', 3, 'Revoked', 'Revoked')

/* SQL text to update ValueListType for entity field ID 0D98E619-339E-46F2-883D-B27F81A81194 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='0D98E619-339E-46F2-883D-B27F81A81194'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7366E819-CF7C-4F5F-94F5-CD01914DAD98', 1, 'Core', 'Core')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7366E819-CF7C-4F5F-94F5-CD01914DAD98', 2, 'Runtime', 'Runtime')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7366E819-CF7C-4F5F-94F5-CD01914DAD98', 3, 'UI', 'UI')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7366E819-CF7C-4F5F-94F5-CD01914DAD98', 4, 'Charting', 'Charting')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7366E819-CF7C-4F5F-94F5-CD01914DAD98', 5, 'Utility', 'Utility')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7366E819-CF7C-4F5F-94F5-CD01914DAD98', 6, 'Other', 'Other')

/* SQL text to update ValueListType for entity field ID 7366E819-CF7C-4F5F-94F5-CD01914DAD98 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7366E819-CF7C-4F5F-94F5-CD01914DAD98'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9cab4056-7123-4875-a798-cac6b18c5cee'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9cab4056-7123-4875-a798-cac6b18c5cee', '57595D6E-E653-4185-BE59-0411BD025F75', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', 'SourceRegistryID', 'One To Many', 1, 1, 'MJ: Components', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2dc5b6c7-dd43-4aa6-b29a-2742bf1d9d53'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2dc5b6c7-dd43-4aa6-b29a-2742bf1d9d53', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', 'AgentID', 'One To Many', 1, 1, 'MJ: AI Agent Relationships', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5b6a8aa1-533a-494b-8c5e-12885a76a482'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5b6a8aa1-533a-494b-8c5e-12885a76a482', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', 'SubAgentID', 'One To Many', 1, 1, 'MJ: AI Agent Relationships', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '77ca2f71-8d7d-4048-83f1-5f704925b009'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('77ca2f71-8d7d-4048-83f1-5f704925b009', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', 'DependencyComponentID', 'One To Many', 1, 1, 'MJ: Component Dependencies', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '90ce0e3a-47c9-41b4-abb0-b4cc24db5a8a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('90ce0e3a-47c9-41b4-abb0-b4cc24db5a8a', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', 'ComponentID', 'One To Many', 1, 1, 'MJ: Component Dependencies', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '223f6380-ac9b-4bc5-9b92-efaa606aacd9'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('223f6380-ac9b-4bc5-9b92-efaa606aacd9', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', 'ComponentID', 'One To Many', 1, 1, 'MJ: Component Library Links', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'bc594537-8e0e-4ca2-947d-7f771d5099de'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('bc594537-8e0e-4ca2-947d-7f771d5099de', '2264AA9A-2197-48E2-BB3D-A498006B37A5', '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', 'LibraryID', 'One To Many', 1, 1, 'MJ: Component Library Links', 2);
   END
                              

/* Index for Foreign Keys for ComponentRegistry */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Registries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ComponentDependency */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Dependencies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ComponentID in table ComponentDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ComponentDependency_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ComponentDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ComponentDependency_ComponentID ON [${flyway:defaultSchema}].[ComponentDependency] ([ComponentID]);

-- Index for foreign key DependencyComponentID in table ComponentDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ComponentDependency_DependencyComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ComponentDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ComponentDependency_DependencyComponentID ON [${flyway:defaultSchema}].[ComponentDependency] ([DependencyComponentID]);

/* SQL text to update entity field related entity name field map for entity field ID F10DB6CF-AA9B-405A-A3DF-FD6844FC199B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F10DB6CF-AA9B-405A-A3DF-FD6844FC199B',
         @RelatedEntityNameFieldMap='Component'

/* Base View SQL for MJ: Component Registries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Registries
-- Item: vwComponentRegistries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Component Registries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ComponentRegistry
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwComponentRegistries]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwComponentRegistries]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ComponentRegistry] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentRegistries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Component Registries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Registries
-- Item: Permissions for vwComponentRegistries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentRegistries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Component Registries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Registries
-- Item: spCreateComponentRegistry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ComponentRegistry
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateComponentRegistry]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComponentRegistry]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @URI nvarchar(500),
    @Type nvarchar(50),
    @APIVersion nvarchar(50),
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ComponentRegistry]
            (
                [ID],
                [Name],
                [Description],
                [URI],
                [Type],
                [APIVersion],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @URI,
                @Type,
                @APIVersion,
                @Status
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ComponentRegistry]
            (
                [Name],
                [Description],
                [URI],
                [Type],
                [APIVersion],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @URI,
                @Type,
                @APIVersion,
                @Status
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComponentRegistries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentRegistry] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Component Registries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentRegistry] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Component Registries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Registries
-- Item: spUpdateComponentRegistry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ComponentRegistry
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateComponentRegistry]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComponentRegistry]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @URI nvarchar(500),
    @Type nvarchar(50),
    @APIVersion nvarchar(50),
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentRegistry]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [URI] = @URI,
        [Type] = @Type,
        [APIVersion] = @APIVersion,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComponentRegistries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComponentRegistries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentRegistry] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ComponentRegistry table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateComponentRegistry
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComponentRegistry
ON [${flyway:defaultSchema}].[ComponentRegistry]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentRegistry]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ComponentRegistry] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Component Registries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentRegistry] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Component Registries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Registries
-- Item: spDeleteComponentRegistry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentRegistry
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteComponentRegistry]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteComponentRegistry]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ComponentRegistry]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentRegistry] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Component Registries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentRegistry] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 757194E3-A344-46FF-AE68-24B31825FB2E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='757194E3-A344-46FF-AE68-24B31825FB2E',
         @RelatedEntityNameFieldMap='DependencyComponent'

/* Base View SQL for MJ: Component Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Dependencies
-- Item: vwComponentDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Component Dependencies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ComponentDependency
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwComponentDependencies]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwComponentDependencies]
AS
SELECT
    c.*,
    Component_ComponentID.[Name] AS [Component],
    Component_DependencyComponentID.[Name] AS [DependencyComponent]
FROM
    [${flyway:defaultSchema}].[ComponentDependency] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Component] AS Component_ComponentID
  ON
    [c].[ComponentID] = Component_ComponentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Component] AS Component_DependencyComponentID
  ON
    [c].[DependencyComponentID] = Component_DependencyComponentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Component Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Dependencies
-- Item: Permissions for vwComponentDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Component Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Dependencies
-- Item: spCreateComponentDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ComponentDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateComponentDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComponentDependency]
    @ID uniqueidentifier = NULL,
    @ComponentID uniqueidentifier,
    @DependencyComponentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ComponentDependency]
            (
                [ID],
                [ComponentID],
                [DependencyComponentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ComponentID,
                @DependencyComponentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ComponentDependency]
            (
                [ComponentID],
                [DependencyComponentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ComponentID,
                @DependencyComponentID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComponentDependencies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentDependency] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Component Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentDependency] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Component Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Dependencies
-- Item: spUpdateComponentDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ComponentDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateComponentDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComponentDependency]
    @ID uniqueidentifier,
    @ComponentID uniqueidentifier,
    @DependencyComponentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentDependency]
    SET
        [ComponentID] = @ComponentID,
        [DependencyComponentID] = @DependencyComponentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComponentDependencies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComponentDependencies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentDependency] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ComponentDependency table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateComponentDependency
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComponentDependency
ON [${flyway:defaultSchema}].[ComponentDependency]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentDependency]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ComponentDependency] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Component Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentDependency] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Component Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Dependencies
-- Item: spDeleteComponentDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteComponentDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteComponentDependency]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ComponentDependency]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentDependency] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Component Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentDependency] TO [cdp_Integration]



/* Index for Foreign Keys for Component */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceRegistryID in table Component
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Component_SourceRegistryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Component]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Component_SourceRegistryID ON [${flyway:defaultSchema}].[Component] ([SourceRegistryID]);

/* SQL text to update entity field related entity name field map for entity field ID D278DFF8-C341-4CD3-AC83-AD2497EAD2F1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D278DFF8-C341-4CD3-AC83-AD2497EAD2F1',
         @RelatedEntityNameFieldMap='SourceRegistry'

/* Base View SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: vwComponents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Components
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Component
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwComponents]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwComponents]
AS
SELECT
    c.*,
    ComponentRegistry_SourceRegistryID.[Name] AS [SourceRegistry]
FROM
    [${flyway:defaultSchema}].[Component] AS c
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ComponentRegistry] AS ComponentRegistry_SourceRegistryID
  ON
    [c].[SourceRegistryID] = ComponentRegistry_SourceRegistryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwComponents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: Permissions for vwComponents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwComponents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spCreateComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Component
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateComponent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComponent]
    @ID uniqueidentifier = NULL,
    @Namespace nvarchar(MAX),
    @Name nvarchar(500),
    @Version nvarchar(50),
    @VersionSequence int,
    @Title nvarchar(1000),
    @Description nvarchar(MAX),
    @Type nvarchar(255),
    @Status nvarchar(50),
    @DeveloperName nvarchar(255),
    @DeveloperEmail nvarchar(255),
    @DeveloperOrganization nvarchar(255),
    @SourceRegistryID uniqueidentifier,
    @ReplicatedAt datetimeoffset,
    @LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Component]
            (
                [ID],
                [Namespace],
                [Name],
                [Version],
                [VersionSequence],
                [Title],
                [Description],
                [Type],
                [Status],
                [DeveloperName],
                [DeveloperEmail],
                [DeveloperOrganization],
                [SourceRegistryID],
                [ReplicatedAt],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Namespace,
                @Name,
                @Version,
                @VersionSequence,
                @Title,
                @Description,
                @Type,
                @Status,
                @DeveloperName,
                @DeveloperEmail,
                @DeveloperOrganization,
                @SourceRegistryID,
                @ReplicatedAt,
                @LastSyncedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Component]
            (
                [Namespace],
                [Name],
                [Version],
                [VersionSequence],
                [Title],
                [Description],
                [Type],
                [Status],
                [DeveloperName],
                [DeveloperEmail],
                [DeveloperOrganization],
                [SourceRegistryID],
                [ReplicatedAt],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Namespace,
                @Name,
                @Version,
                @VersionSequence,
                @Title,
                @Description,
                @Type,
                @Status,
                @DeveloperName,
                @DeveloperEmail,
                @DeveloperOrganization,
                @SourceRegistryID,
                @ReplicatedAt,
                @LastSyncedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComponents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spUpdateComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Component
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateComponent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComponent]
    @ID uniqueidentifier,
    @Namespace nvarchar(MAX),
    @Name nvarchar(500),
    @Version nvarchar(50),
    @VersionSequence int,
    @Title nvarchar(1000),
    @Description nvarchar(MAX),
    @Type nvarchar(255),
    @Status nvarchar(50),
    @DeveloperName nvarchar(255),
    @DeveloperEmail nvarchar(255),
    @DeveloperOrganization nvarchar(255),
    @SourceRegistryID uniqueidentifier,
    @ReplicatedAt datetimeoffset,
    @LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Component]
    SET
        [Namespace] = @Namespace,
        [Name] = @Name,
        [Version] = @Version,
        [VersionSequence] = @VersionSequence,
        [Title] = @Title,
        [Description] = @Description,
        [Type] = @Type,
        [Status] = @Status,
        [DeveloperName] = @DeveloperName,
        [DeveloperEmail] = @DeveloperEmail,
        [DeveloperOrganization] = @DeveloperOrganization,
        [SourceRegistryID] = @SourceRegistryID,
        [ReplicatedAt] = @ReplicatedAt,
        [LastSyncedAt] = @LastSyncedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComponents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComponents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Component table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateComponent
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComponent
ON [${flyway:defaultSchema}].[Component]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Component]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Component] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spDeleteComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Component
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteComponent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteComponent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Component]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponent] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponent] TO [cdp_Integration]



/* Index for Foreign Keys for ComponentLibrary */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: vwComponentLibraries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Component Libraries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ComponentLibrary
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwComponentLibraries]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwComponentLibraries]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ComponentLibrary] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentLibraries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: Permissions for vwComponentLibraries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentLibraries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spCreateComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateComponentLibrary]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComponentLibrary]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(500),
    @DisplayName nvarchar(500),
    @Version nvarchar(100),
    @GlobalVariable nvarchar(255),
    @Category nvarchar(100),
    @CDNUrl nvarchar(1000),
    @CDNCssUrl nvarchar(1000),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ComponentLibrary]
            (
                [ID],
                [Name],
                [DisplayName],
                [Version],
                [GlobalVariable],
                [Category],
                [CDNUrl],
                [CDNCssUrl],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @DisplayName,
                @Version,
                @GlobalVariable,
                @Category,
                @CDNUrl,
                @CDNCssUrl,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ComponentLibrary]
            (
                [Name],
                [DisplayName],
                [Version],
                [GlobalVariable],
                [Category],
                [CDNUrl],
                [CDNCssUrl],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @DisplayName,
                @Version,
                @GlobalVariable,
                @Category,
                @CDNUrl,
                @CDNCssUrl,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComponentLibraries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentLibrary] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Component Libraries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentLibrary] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spUpdateComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateComponentLibrary]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComponentLibrary]
    @ID uniqueidentifier,
    @Name nvarchar(500),
    @DisplayName nvarchar(500),
    @Version nvarchar(100),
    @GlobalVariable nvarchar(255),
    @Category nvarchar(100),
    @CDNUrl nvarchar(1000),
    @CDNCssUrl nvarchar(1000),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentLibrary]
    SET
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Version] = @Version,
        [GlobalVariable] = @GlobalVariable,
        [Category] = @Category,
        [CDNUrl] = @CDNUrl,
        [CDNCssUrl] = @CDNCssUrl,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComponentLibraries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComponentLibraries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentLibrary] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ComponentLibrary table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateComponentLibrary
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComponentLibrary
ON [${flyway:defaultSchema}].[ComponentLibrary]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentLibrary]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ComponentLibrary] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Component Libraries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentLibrary] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spDeleteComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteComponentLibrary]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteComponentLibrary]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ComponentLibrary]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentLibrary] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Component Libraries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentLibrary] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRelationship_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRelationship_AgentID ON [${flyway:defaultSchema}].[AIAgentRelationship] ([AgentID]);

-- Index for foreign key SubAgentID in table AIAgentRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRelationship_SubAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRelationship_SubAgentID ON [${flyway:defaultSchema}].[AIAgentRelationship] ([SubAgentID]);

/* SQL text to update entity field related entity name field map for entity field ID DAAFE687-A87A-4266-878C-854005C650A3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DAAFE687-A87A-4266-878C-854005C650A3',
         @RelatedEntityNameFieldMap='Agent'

/* Index for Foreign Keys for ComponentLibraryLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Library Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ComponentID in table ComponentLibraryLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ComponentLibraryLink_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ComponentLibraryLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ComponentLibraryLink_ComponentID ON [${flyway:defaultSchema}].[ComponentLibraryLink] ([ComponentID]);

-- Index for foreign key LibraryID in table ComponentLibraryLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ComponentLibraryLink_LibraryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ComponentLibraryLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ComponentLibraryLink_LibraryID ON [${flyway:defaultSchema}].[ComponentLibraryLink] ([LibraryID]);

/* SQL text to update entity field related entity name field map for entity field ID 5CEDBAE7-5933-43C3-B7FD-1B52079EB72B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5CEDBAE7-5933-43C3-B7FD-1B52079EB72B',
         @RelatedEntityNameFieldMap='Component'

/* SQL text to update entity field related entity name field map for entity field ID 04629E96-2D99-42B6-8B2B-B1A185650664 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='04629E96-2D99-42B6-8B2B-B1A185650664',
         @RelatedEntityNameFieldMap='Library'

/* SQL text to update entity field related entity name field map for entity field ID D8100298-FB66-408E-94D6-7ACF047E09E9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D8100298-FB66-408E-94D6-7ACF047E09E9',
         @RelatedEntityNameFieldMap='SubAgent'

/* Base View SQL for MJ: Component Library Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Library Links
-- Item: vwComponentLibraryLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Component Library Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ComponentLibraryLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwComponentLibraryLinks]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwComponentLibraryLinks]
AS
SELECT
    c.*,
    Component_ComponentID.[Name] AS [Component],
    ComponentLibrary_LibraryID.[Name] AS [Library]
FROM
    [${flyway:defaultSchema}].[ComponentLibraryLink] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Component] AS Component_ComponentID
  ON
    [c].[ComponentID] = Component_ComponentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ComponentLibrary] AS ComponentLibrary_LibraryID
  ON
    [c].[LibraryID] = ComponentLibrary_LibraryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentLibraryLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Component Library Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Library Links
-- Item: Permissions for vwComponentLibraryLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentLibraryLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Component Library Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Library Links
-- Item: spCreateComponentLibraryLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ComponentLibraryLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateComponentLibraryLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComponentLibraryLink]
    @ID uniqueidentifier = NULL,
    @ComponentID uniqueidentifier,
    @LibraryID uniqueidentifier,
    @MinVersion nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ComponentLibraryLink]
            (
                [ID],
                [ComponentID],
                [LibraryID],
                [MinVersion]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ComponentID,
                @LibraryID,
                @MinVersion
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ComponentLibraryLink]
            (
                [ComponentID],
                [LibraryID],
                [MinVersion]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ComponentID,
                @LibraryID,
                @MinVersion
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComponentLibraryLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentLibraryLink] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Component Library Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentLibraryLink] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Component Library Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Library Links
-- Item: spUpdateComponentLibraryLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ComponentLibraryLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateComponentLibraryLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComponentLibraryLink]
    @ID uniqueidentifier,
    @ComponentID uniqueidentifier,
    @LibraryID uniqueidentifier,
    @MinVersion nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentLibraryLink]
    SET
        [ComponentID] = @ComponentID,
        [LibraryID] = @LibraryID,
        [MinVersion] = @MinVersion
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComponentLibraryLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComponentLibraryLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentLibraryLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ComponentLibraryLink table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateComponentLibraryLink
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComponentLibraryLink
ON [${flyway:defaultSchema}].[ComponentLibraryLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentLibraryLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ComponentLibraryLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Component Library Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentLibraryLink] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Component Library Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Library Links
-- Item: spDeleteComponentLibraryLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentLibraryLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteComponentLibraryLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteComponentLibraryLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ComponentLibraryLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentLibraryLink] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Component Library Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentLibraryLink] TO [cdp_Integration]



/* Base View SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: vwAIAgentRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Relationships
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRelationship
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentRelationships]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRelationships]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIAgent_SubAgentID.[Name] AS [SubAgent]
FROM
    [${flyway:defaultSchema}].[AIAgentRelationship] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_SubAgentID
  ON
    [a].[SubAgentID] = AIAgent_SubAgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: Permissions for vwAIAgentRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spCreateAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRelationship]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRelationship]
            (
                [ID],
                [AgentID],
                [SubAgentID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @SubAgentID,
                @Status
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRelationship]
            (
                [AgentID],
                [SubAgentID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @SubAgentID,
                @Status
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spUpdateAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRelationship]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRelationship]
    SET
        [AgentID] = @AgentID,
        [SubAgentID] = @SubAgentID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRelationship table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentRelationship
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRelationship
ON [${flyway:defaultSchema}].[AIAgentRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spDeleteAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1f79b2a0-1d6b-424d-97e5-71fdb5255783'  OR 
               (EntityID = 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439' AND Name = 'Component')
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
            '1f79b2a0-1d6b-424d-97e5-71fdb5255783',
            'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', -- Entity: MJ: Component Dependencies
            100006,
            'Component',
            'Component',
            NULL,
            'nvarchar',
            1000,
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
         WHERE ID = 'c1e84f49-7bb0-4f95-8ea7-cae9a663578e'  OR 
               (EntityID = 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439' AND Name = 'DependencyComponent')
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
            'c1e84f49-7bb0-4f95-8ea7-cae9a663578e',
            'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', -- Entity: MJ: Component Dependencies
            100007,
            'DependencyComponent',
            'Dependency Component',
            NULL,
            'nvarchar',
            1000,
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
         WHERE ID = 'ecff6e43-db93-477d-99d8-da53f1ada1aa'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'SourceRegistry')
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
            'ecff6e43-db93-477d-99d8-da53f1ada1aa',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100018,
            'SourceRegistry',
            'Source Registry',
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
         WHERE ID = '4619318f-1142-403e-bdaa-0ebdb95855cd'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'Agent')
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
            '4619318f-1142-403e-bdaa-0ebdb95855cd',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100007,
            'Agent',
            'Agent',
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
         WHERE ID = '04a0a8de-c925-4793-8ada-0693fa9eb5e6'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'SubAgent')
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
            '04a0a8de-c925-4793-8ada-0693fa9eb5e6',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100008,
            'SubAgent',
            'Sub Agent',
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
         WHERE ID = '61625999-9e63-49b5-81fa-1f9b38edbc16'  OR 
               (EntityID = '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B' AND Name = 'Component')
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
            '61625999-9e63-49b5-81fa-1f9b38edbc16',
            '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', -- Entity: MJ: Component Library Links
            100007,
            'Component',
            'Component',
            NULL,
            'nvarchar',
            1000,
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
         WHERE ID = '4c0c3022-16b0-4ab4-88de-d624dd0e2da8'  OR 
               (EntityID = '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B' AND Name = 'Library')
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
            '4c0c3022-16b0-4ab4-88de-d624dd0e2da8',
            '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', -- Entity: MJ: Component Library Links
            100008,
            'Library',
            'Library',
            NULL,
            'nvarchar',
            1000,
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

