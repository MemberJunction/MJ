-- =====================================================================================
-- MemberJunction v3 Conversations Schema
-- =====================================================================================
-- This file defines the new schema for v3 conversations functionality.
-- Entities follow MJ naming conventions: singular table names, no manual __mj columns.
-- =====================================================================================

-- =====================================================================================
-- CORE ENTITIES
-- =====================================================================================

-- -----------------------------------------------------------------------------
-- Environment: Top-level container for organizing conversations, artifacts, and libraries
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Environment (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Environment_ID DEFAULT (newsequentialid()),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    OrganizationID UNIQUEIDENTIFIER NULL, -- Future use for multi-org support
    IsDefault BIT NOT NULL CONSTRAINT DF_Environment_IsDefault DEFAULT (0),
    Settings NVARCHAR(MAX) NULL, -- JSON for environment-specific settings
    CONSTRAINT PK_Environment PRIMARY KEY (ID)
);

-- -----------------------------------------------------------------------------
-- Artifact: Independent content items that can be linked to multiple locations
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Artifact (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Artifact_ID DEFAULT (newsequentialid()),
    EnvironmentID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    TypeID UNIQUEIDENTIFIER NOT NULL, -- FK to ArtifactType table (has ContentType field)
    Content NVARCHAR(MAX) NULL, -- The actual artifact content
    Configuration NVARCHAR(MAX) NULL, -- JSON for type-specific metadata
    Comments NVARCHAR(MAX) NULL, -- User comments about the artifact
    UserID UNIQUEIDENTIFIER NOT NULL, -- Owner of the artifact
    CONSTRAINT PK_Artifact PRIMARY KEY (ID),
    CONSTRAINT FK_Artifact_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID),
    CONSTRAINT FK_Artifact_ArtifactType FOREIGN KEY (TypeID) REFERENCES ${flyway:defaultSchema}.ArtifactType(ID),
    CONSTRAINT FK_Artifact_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID)
);

-- -----------------------------------------------------------------------------
-- ArtifactVersion: Version history for artifacts
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.ArtifactVersion (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ArtifactVersion_ID DEFAULT (newsequentialid()),
    ArtifactID UNIQUEIDENTIFIER NOT NULL,
    VersionNumber INT NOT NULL,
    Content NVARCHAR(MAX) NULL,
    Configuration NVARCHAR(MAX) NULL,
    Comments NVARCHAR(MAX) NULL,
    UserID UNIQUEIDENTIFIER NOT NULL, -- User who created this version
    CONSTRAINT PK_ArtifactVersion PRIMARY KEY (ID),
    CONSTRAINT FK_ArtifactVersion_Artifact FOREIGN KEY (ArtifactID) REFERENCES ${flyway:defaultSchema}.Artifact(ID),
    CONSTRAINT FK_ArtifactVersion_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT UQ_ArtifactVersion_ArtifactID_VersionNumber UNIQUE (ArtifactID, VersionNumber)
);

-- -----------------------------------------------------------------------------
-- Collection: Folders for organizing artifacts (supports nesting)
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Collection (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Collection_ID DEFAULT (newsequentialid()),
    EnvironmentID UNIQUEIDENTIFIER NOT NULL,
    ParentID UNIQUEIDENTIFIER NULL, -- For nested folder structure
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Icon NVARCHAR(50) NULL, -- Font Awesome icon class
    Color NVARCHAR(7) NULL, -- Hex color for UI
    Sequence INT NULL, -- For ordering collections
    CONSTRAINT PK_Collection PRIMARY KEY (ID),
    CONSTRAINT FK_Collection_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID),
    CONSTRAINT FK_Collection_Parent FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.Collection(ID)
);

-- -----------------------------------------------------------------------------
-- Project: Container for grouping related conversations
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Project (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Project_ID DEFAULT (newsequentialid()),
    EnvironmentID UNIQUEIDENTIFIER NOT NULL,
    ParentID UNIQUEIDENTIFIER NULL, -- For nested project hierarchy
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Color NVARCHAR(7) NULL, -- For project badges in UI
    Icon NVARCHAR(50) NULL, -- Font Awesome icon class
    IsArchived BIT NOT NULL CONSTRAINT DF_Project_IsArchived DEFAULT (0),
    CONSTRAINT PK_Project PRIMARY KEY (ID),
    CONSTRAINT FK_Project_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID),
    CONSTRAINT FK_Project_Parent FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.Project(ID)
);

-- =====================================================================================
-- GENERIC LINKING SYSTEM
-- =====================================================================================

-- -----------------------------------------------------------------------------
-- RecordLink: Generic table for linking any two records in the system
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.RecordLink (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RecordLink_ID DEFAULT (newsequentialid()),
    SourceEntityID UNIQUEIDENTIFIER NOT NULL, -- FK to __mj.Entity.ID
    SourceRecordID NVARCHAR(500) NOT NULL, -- Scalar PK or JSON for composite PKs
    TargetEntityID UNIQUEIDENTIFIER NOT NULL, -- FK to __mj.Entity.ID
    TargetRecordID NVARCHAR(500) NOT NULL, -- Scalar PK or JSON for composite PKs
    LinkType NVARCHAR(50) NULL, -- Application-specific relationship type
    Sequence INT NULL, -- For ordering in UI
    Metadata NVARCHAR(MAX) NULL, -- JSON for additional link-specific data
    CONSTRAINT PK_RecordLink PRIMARY KEY (ID),
    CONSTRAINT FK_RecordLink_SourceEntity FOREIGN KEY (SourceEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_RecordLink_TargetEntity FOREIGN KEY (TargetEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID)
);

-- =====================================================================================
-- ACCESS CONTROL SYSTEM
-- =====================================================================================

-- -----------------------------------------------------------------------------
-- AccessControlRule: Generic ACL-style permissions for any entity record
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.AccessControlRule (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_AccessControlRule_ID DEFAULT (newsequentialid()),
    EntityID UNIQUEIDENTIFIER NOT NULL, -- FK to __mj.Entity.ID
    RecordID NVARCHAR(500) NOT NULL, -- Scalar PK or JSON for composite PKs
    GranteeType NVARCHAR(50) NOT NULL, -- 'User', 'Role', 'Everyone', 'Public'
    GranteeID UNIQUEIDENTIFIER NULL, -- UserID or RoleID (NULL for Everyone/Public)
    CanRead BIT NOT NULL CONSTRAINT DF_AccessControlRule_CanRead DEFAULT (0),
    CanCreate BIT NOT NULL CONSTRAINT DF_AccessControlRule_CanCreate DEFAULT (0),
    CanUpdate BIT NOT NULL CONSTRAINT DF_AccessControlRule_CanUpdate DEFAULT (0),
    CanDelete BIT NOT NULL CONSTRAINT DF_AccessControlRule_CanDelete DEFAULT (0),
    CanShare BIT NOT NULL CONSTRAINT DF_AccessControlRule_CanShare DEFAULT (0),
    ExpiresAt DATETIMEOFFSET NULL,
    GrantedByUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_AccessControlRule PRIMARY KEY (ID),
    CONSTRAINT FK_AccessControlRule_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_AccessControlRule_GrantedByUser FOREIGN KEY (GrantedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_AccessControlRule_GranteeType CHECK (GranteeType IN ('User', 'Role', 'Everyone', 'Public'))
);

-- -----------------------------------------------------------------------------
-- PublicLink: Shareable links for external access
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.PublicLink (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_PublicLink_ID DEFAULT (newsequentialid()),
    ResourceType NVARCHAR(50) NOT NULL, -- 'Artifact', 'Conversation', 'Collection'
    ResourceID UNIQUEIDENTIFIER NOT NULL,
    Token NVARCHAR(255) NOT NULL,
    PasswordHash NVARCHAR(255) NULL, -- Optional password protection (SHA256 hash)
    ExpiresAt DATETIMEOFFSET NULL,
    MaxViews INT NULL,
    CurrentViews INT NOT NULL CONSTRAINT DF_PublicLink_CurrentViews DEFAULT (0),
    UserID UNIQUEIDENTIFIER NOT NULL, -- User who created the public link
    IsActive BIT NOT NULL CONSTRAINT DF_PublicLink_IsActive DEFAULT (1),
    CONSTRAINT PK_PublicLink PRIMARY KEY (ID),
    CONSTRAINT FK_PublicLink_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT UQ_PublicLink_Token UNIQUE (Token),
    CONSTRAINT CK_PublicLink_ResourceType CHECK (ResourceType IN ('Artifact', 'Conversation', 'Collection'))
);

-- =====================================================================================
-- UPDATES TO EXISTING ENTITIES
-- =====================================================================================

-- Add EnvironmentID to Conversations table
ALTER TABLE ${flyway:defaultSchema}.Conversation 
ADD EnvironmentID UNIQUEIDENTIFIER NULL,
    ProjectID UNIQUEIDENTIFIER NULL,
    IsPinned BIT NOT NULL CONSTRAINT DF_Conversation_IsPinned DEFAULT (0),
    LastActivityAt DATETIMEOFFSET NULL;

-- Add foreign key constraints after columns are added
ALTER TABLE ${flyway:defaultSchema}.Conversation
ADD CONSTRAINT FK_Conversation_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID),
    CONSTRAINT FK_Conversation_Project FOREIGN KEY (ProjectID) REFERENCES ${flyway:defaultSchema}.Project(ID);

-- Add EnvironmentID to Dashboard table for consistency
ALTER TABLE ${flyway:defaultSchema}.Dashboard
ADD EnvironmentID UNIQUEIDENTIFIER NULL;

ALTER TABLE ${flyway:defaultSchema}.Dashboard
ADD CONSTRAINT FK_Dashboard_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID);

-- Add EnvironmentID to Report table for consistency  
ALTER TABLE ${flyway:defaultSchema}.Report
ADD EnvironmentID UNIQUEIDENTIFIER NULL;

ALTER TABLE ${flyway:defaultSchema}.Report
ADD CONSTRAINT FK_Report_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID);

-- =====================================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================================
-- Note: MJ auto-creates indexes for foreign keys, so we only add non-FK indexes here

-- Environment indexes (none needed - IsDefault is boolean)

-- Artifact indexes (TypeID is FK so auto-indexed by MJ)

-- Collection indexes
CREATE INDEX IX_Collection_Sequence ON ${flyway:defaultSchema}.Collection(Sequence);

-- Project indexes
CREATE INDEX IX_Project_IsArchived ON ${flyway:defaultSchema}.Project(IsArchived);

-- RecordLink indexes
CREATE INDEX IX_RecordLink_SourceEntityID_SourceRecordID ON ${flyway:defaultSchema}.RecordLink(SourceEntityID, SourceRecordID);
CREATE INDEX IX_RecordLink_TargetEntityID_TargetRecordID ON ${flyway:defaultSchema}.RecordLink(TargetEntityID, TargetRecordID);
CREATE INDEX IX_RecordLink_LinkType ON ${flyway:defaultSchema}.RecordLink(LinkType);
CREATE INDEX IX_RecordLink_Sequence ON ${flyway:defaultSchema}.RecordLink(Sequence);

-- AccessControlRule indexes
CREATE INDEX IX_AccessControlRule_EntityID_RecordID ON ${flyway:defaultSchema}.AccessControlRule(EntityID, RecordID);
CREATE INDEX IX_AccessControlRule_GranteeType_GranteeID ON ${flyway:defaultSchema}.AccessControlRule(GranteeType, GranteeID);
CREATE INDEX IX_AccessControlRule_ExpiresAt ON ${flyway:defaultSchema}.AccessControlRule(ExpiresAt);
CREATE INDEX IX_AccessControlRule_CanRead ON ${flyway:defaultSchema}.AccessControlRule(CanRead);
CREATE INDEX IX_AccessControlRule_CanUpdate ON ${flyway:defaultSchema}.AccessControlRule(CanUpdate);
CREATE INDEX IX_AccessControlRule_CanDelete ON ${flyway:defaultSchema}.AccessControlRule(CanDelete);
CREATE INDEX IX_AccessControlRule_CanShare ON ${flyway:defaultSchema}.AccessControlRule(CanShare);

-- PublicLink indexes
CREATE INDEX IX_PublicLink_Token ON ${flyway:defaultSchema}.PublicLink(Token);
CREATE INDEX IX_PublicLink_IsActive ON ${flyway:defaultSchema}.PublicLink(IsActive);
CREATE INDEX IX_PublicLink_ExpiresAt ON ${flyway:defaultSchema}.PublicLink(ExpiresAt);

-- Conversation updated indexes
CREATE INDEX IX_Conversation_LastActivityAt ON ${flyway:defaultSchema}.Conversation(LastActivityAt DESC);
CREATE INDEX IX_Conversation_IsPinned ON ${flyway:defaultSchema}.Conversation(IsPinned);

-- =====================================================================================
-- EXTENDED PROPERTIES FOR DOCUMENTATION
-- =====================================================================================

-- Note: Only documenting non-PK/FK columns as those are self-documenting

-- ===========================================
-- Environment Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Top-level container for organizing conversations, artifacts, and collections. Provides isolation and grouping for different teams, clients, or functional areas.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Environment';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Display name for the environment',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Environment',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Detailed description of the environment purpose and scope',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Environment',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if this is the default environment for the organization',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Environment',
    @level2type = N'COLUMN', @level2name = 'IsDefault';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON configuration for environment-specific settings and features',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Environment',
    @level2type = N'COLUMN', @level2name = 'Settings';

-- ===========================================
-- Artifact Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Independent content items (code, documents, charts) that can be linked to multiple conversations and collections. Supports versioning and sharing.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Artifact';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Display name for the artifact',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Artifact',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Detailed description of the artifact contents and purpose',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Artifact',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON configuration and metadata for this artifact',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Artifact',
    @level2type = N'COLUMN', @level2name = 'Configuration';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The actual artifact content (code, markdown, JSON data, etc.)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Artifact',
    @level2type = N'COLUMN', @level2name = 'Content';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'User comments about the artifact',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Artifact',
    @level2type = N'COLUMN', @level2name = 'Comments';
-- ===========================================
-- ArtifactVersion Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Version history for artifacts, tracking all changes over time',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersion';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Sequential version number for this artifact',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'VersionNumber';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The content of the artifact at this version',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'Content';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON configuration for this version',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'Configuration';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'User comments specific to this version',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'Comments';

-- ===========================================
-- Collection Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Organizational folders for storing and categorizing artifacts. Supports nested folder structure for hierarchical organization.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Collection';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Display name for the collection',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Collection',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Detailed description of the collection purpose',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Collection',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Font Awesome icon class for UI display',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Collection',
    @level2type = N'COLUMN', @level2name = 'Icon';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Hex color code for UI display (#RRGGBB format)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Collection',
    @level2type = N'COLUMN', @level2name = 'Color';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Display sequence for ordering collections in UI',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Collection',
    @level2type = N'COLUMN', @level2name = 'Sequence';

-- ===========================================
-- Project Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Container for grouping related conversations around a common topic, client, or initiative. Supports nesting for sub-projects.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Project';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Display name for the project',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Project',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Detailed description of the project goals and scope',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Project',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Hex color code for project badges in UI (#RRGGBB format)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Project',
    @level2type = N'COLUMN', @level2name = 'Color';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Font Awesome icon class for UI display',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Project',
    @level2type = N'COLUMN', @level2name = 'Icon';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if this project is archived and should be hidden from active lists',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Project',
    @level2type = N'COLUMN', @level2name = 'IsArchived';

-- ===========================================
-- RecordLink Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Generic linking table that can connect any two records in the system, providing a flexible relationship management system.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'RecordLink';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Primary key value(s) of the source record - scalar for simple PKs or JSON KeyValuePair array for composite PKs',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'RecordLink',
    @level2type = N'COLUMN', @level2name = 'SourceRecordID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Primary key value(s) of the target record - scalar for simple PKs or JSON KeyValuePair array for composite PKs',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'RecordLink',
    @level2type = N'COLUMN', @level2name = 'TargetRecordID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Application-specific relationship type describing how the records are related',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'RecordLink',
    @level2type = N'COLUMN', @level2name = 'LinkType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Display sequence for ordering linked records in UI',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'RecordLink',
    @level2type = N'COLUMN', @level2name = 'Sequence';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON field for storing additional link-specific metadata',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'RecordLink',
    @level2type = N'COLUMN', @level2name = 'Metadata';

-- ===========================================
-- AccessControlRule Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Generic ACL-style permission system that can control access to any entity record in the system with granular CRUD permissions.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Primary key value(s) of the record being protected - scalar for simple PKs or JSON for composite PKs',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule',
    @level2type = N'COLUMN', @level2name = 'RecordID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of grantee receiving permission (User, Role, Everyone, Public)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule',
    @level2type = N'COLUMN', @level2name = 'GranteeType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Permission to read/view the record',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule',
    @level2type = N'COLUMN', @level2name = 'CanRead';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Permission to create new related records',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule',
    @level2type = N'COLUMN', @level2name = 'CanCreate';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Permission to update/modify the record',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule',
    @level2type = N'COLUMN', @level2name = 'CanUpdate';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Permission to delete the record',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule',
    @level2type = N'COLUMN', @level2name = 'CanDelete';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Permission to share/grant permissions to other users',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule',
    @level2type = N'COLUMN', @level2name = 'CanShare';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional expiration date/time for this access rule',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AccessControlRule',
    @level2type = N'COLUMN', @level2name = 'ExpiresAt';

-- ===========================================
-- PublicLink Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Shareable links for external access to artifacts and other resources. Supports password protection and expiration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'PublicLink';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of resource being shared (Artifact, Conversation, Collection)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'PublicLink',
    @level2type = N'COLUMN', @level2name = 'ResourceType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Unique token for accessing the shared resource via URL',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'PublicLink',
    @level2type = N'COLUMN', @level2name = 'Token';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'SHA256 hash of optional password for additional security',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'PublicLink',
    @level2type = N'COLUMN', @level2name = 'PasswordHash';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional expiration date/time for this public link',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'PublicLink',
    @level2type = N'COLUMN', @level2name = 'ExpiresAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Maximum number of times this link can be viewed',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'PublicLink',
    @level2type = N'COLUMN', @level2name = 'MaxViews';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Current count of how many times this link has been viewed',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'PublicLink',
    @level2type = N'COLUMN', @level2name = 'CurrentViews';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if this link is currently active and accessible',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'PublicLink',
    @level2type = N'COLUMN', @level2name = 'IsActive';

-- ===========================================
-- Conversation Table Updates
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if this conversation is pinned to the top of lists',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Conversation',
    @level2type = N'COLUMN', @level2name = 'IsPinned';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp of the last activity in this conversation',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Conversation',
    @level2type = N'COLUMN', @level2name = 'LastActivityAt';
