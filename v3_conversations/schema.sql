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
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_Artifact PRIMARY KEY (ID),
    CONSTRAINT FK_Artifact_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID),
    CONSTRAINT FK_Artifact_ArtifactType FOREIGN KEY (TypeID) REFERENCES ${flyway:defaultSchema}.ArtifactType(ID),
    CONSTRAINT FK_Artifact_User FOREIGN KEY (CreatedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID)
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
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_ArtifactVersion PRIMARY KEY (ID),
    CONSTRAINT FK_ArtifactVersion_Artifact FOREIGN KEY (ArtifactID) REFERENCES ${flyway:defaultSchema}.Artifact(ID),
    CONSTRAINT FK_ArtifactVersion_User FOREIGN KEY (CreatedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
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
    SortOrder INT NULL,
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
-- LINKING TABLES
-- =====================================================================================

-- -----------------------------------------------------------------------------
-- ArtifactLink: Links artifacts to multiple locations (conversations, collections, projects)
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.ArtifactLink (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ArtifactLink_ID DEFAULT (newsequentialid()),
    ArtifactID UNIQUEIDENTIFIER NOT NULL,
    LinkedEntityType NVARCHAR(50) NOT NULL, -- 'Conversation', 'Collection', 'Project'
    LinkedEntityID UNIQUEIDENTIFIER NOT NULL,
    LinkType NVARCHAR(50) NULL, -- 'created', 'saved', 'referenced', 'shared'
    Position INT NULL, -- For ordering in libraries
    CONSTRAINT PK_ArtifactLink PRIMARY KEY (ID),
    CONSTRAINT FK_ArtifactLink_Artifact FOREIGN KEY (ArtifactID) REFERENCES ${flyway:defaultSchema}.Artifact(ID),
    CONSTRAINT CK_ArtifactLink_LinkedEntityType CHECK (LinkedEntityType IN ('Conversation', 'Collection', 'Project')),
    CONSTRAINT CK_ArtifactLink_LinkType CHECK (LinkType IN ('created', 'saved', 'referenced', 'shared'))
);

-- -----------------------------------------------------------------------------
-- ConversationArtifactReference: Tracks artifact appearances in conversations
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.ConversationArtifactReference (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ConversationArtifactReference_ID DEFAULT (newsequentialid()),
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    ArtifactID UNIQUEIDENTIFIER NOT NULL,
    ConversationDetailID UNIQUEIDENTIFIER NULL, -- Which message created/referenced it
    DisplayMode NVARCHAR(50) NULL, -- 'inline', 'panel', 'reference'
    CONSTRAINT PK_ConversationArtifactReference PRIMARY KEY (ID),
    CONSTRAINT FK_ConversationArtifactReference_Conversation FOREIGN KEY (ConversationID) REFERENCES ${flyway:defaultSchema}.Conversation(ID),
    CONSTRAINT FK_ConversationArtifactReference_Artifact FOREIGN KEY (ArtifactID) REFERENCES ${flyway:defaultSchema}.Artifact(ID),
    CONSTRAINT FK_ConversationArtifactReference_ConversationDetail FOREIGN KEY (ConversationDetailID) REFERENCES ${flyway:defaultSchema}.ConversationDetail(ID),
    CONSTRAINT CK_ConversationArtifactReference_DisplayMode CHECK (DisplayMode IN ('inline', 'panel', 'reference'))
);

-- =====================================================================================
-- PERMISSION SYSTEM
-- =====================================================================================

-- -----------------------------------------------------------------------------
-- Permission: Unified ACL-style permissions for all resources
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Permission (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Permission_ID DEFAULT (newsequentialid()),
    ResourceType NVARCHAR(50) NOT NULL, -- 'Environment', 'Artifact', 'Collection', 'Conversation', 'Project'
    ResourceID UNIQUEIDENTIFIER NOT NULL,
    GranteeType NVARCHAR(50) NOT NULL, -- 'User', 'Role', 'Everyone', 'Public'
    GranteeID UNIQUEIDENTIFIER NULL, -- NULL for 'Everyone' and 'Public'
    PermissionLevel NVARCHAR(50) NOT NULL, -- 'view', 'edit', 'admin', 'owner'
    ExpiresAt DATETIMEOFFSET NULL,
    GrantedByUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_Permission PRIMARY KEY (ID),
    CONSTRAINT FK_Permission_GrantedByUser FOREIGN KEY (GrantedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_Permission_ResourceType CHECK (ResourceType IN ('Environment', 'Artifact', 'Collection', 'Conversation', 'Project')),
    CONSTRAINT CK_Permission_GranteeType CHECK (GranteeType IN ('User', 'Role', 'Everyone', 'Public')),
    CONSTRAINT CK_Permission_PermissionLevel CHECK (PermissionLevel IN ('view', 'edit', 'admin', 'owner'))
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
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_PublicLink_IsActive DEFAULT (1),
    CONSTRAINT PK_PublicLink PRIMARY KEY (ID),
    CONSTRAINT FK_PublicLink_CreatedByUser FOREIGN KEY (CreatedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
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
CREATE INDEX IX_Collection_SortOrder ON ${flyway:defaultSchema}.Collection(SortOrder);

-- Project indexes
CREATE INDEX IX_Project_IsArchived ON ${flyway:defaultSchema}.Project(IsArchived);

-- ArtifactLink indexes
CREATE INDEX IX_ArtifactLink_LinkedEntityType ON ${flyway:defaultSchema}.ArtifactLink(LinkedEntityType);
CREATE INDEX IX_ArtifactLink_LinkType ON ${flyway:defaultSchema}.ArtifactLink(LinkType);
CREATE INDEX IX_ArtifactLink_Position ON ${flyway:defaultSchema}.ArtifactLink(Position);

-- ConversationArtifactReference indexes
CREATE INDEX IX_ConversationArtifactReference_DisplayMode ON ${flyway:defaultSchema}.ConversationArtifactReference(DisplayMode);

-- Permission indexes
CREATE INDEX IX_Permission_ResourceType ON ${flyway:defaultSchema}.Permission(ResourceType);
CREATE INDEX IX_Permission_GranteeType ON ${flyway:defaultSchema}.Permission(GranteeType);
CREATE INDEX IX_Permission_PermissionLevel ON ${flyway:defaultSchema}.Permission(PermissionLevel);
CREATE INDEX IX_Permission_ExpiresAt ON ${flyway:defaultSchema}.Permission(ExpiresAt);

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
    @value = N'Display order for sorting collections in UI',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Collection',
    @level2type = N'COLUMN', @level2name = 'SortOrder';

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
-- ArtifactLink Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Links artifacts to multiple locations (conversations, collections, projects) enabling artifacts to exist in multiple contexts.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactLink';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of entity this artifact is linked to (Conversation, Collection, Project)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactLink',
    @level2type = N'COLUMN', @level2name = 'LinkedEntityType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'How this artifact relates to the linked entity (created, saved, referenced, shared)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactLink',
    @level2type = N'COLUMN', @level2name = 'LinkType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Display order position when shown in collections or lists',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactLink',
    @level2type = N'COLUMN', @level2name = 'Position';

-- ===========================================
-- ConversationArtifactReference Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Tracks where and how artifacts appear within conversations, including display mode and message association.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationArtifactReference';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'How the artifact is displayed in the conversation (inline, panel, reference)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationArtifactReference',
    @level2type = N'COLUMN', @level2name = 'DisplayMode';

-- ===========================================
-- Permission Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Unified ACL-style permission system for controlling access to environments, artifacts, collections, conversations, and projects.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Permission';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of resource being protected (Environment, Artifact, Collection, Conversation, Project)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Permission',
    @level2type = N'COLUMN', @level2name = 'ResourceType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of grantee receiving permission (User, Role, Everyone, Public)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Permission',
    @level2type = N'COLUMN', @level2name = 'GranteeType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Level of access granted (view, edit, admin, owner)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Permission',
    @level2type = N'COLUMN', @level2name = 'PermissionLevel';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional expiration date/time for this permission',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Permission',
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
