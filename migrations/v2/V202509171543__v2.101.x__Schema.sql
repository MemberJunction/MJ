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
    IsDefault BIT NOT NULL CONSTRAINT DF_Environment_IsDefault DEFAULT (0),
    Settings NVARCHAR(MAX) NULL, -- JSON for environment-specific settings
    CONSTRAINT PK_Environment PRIMARY KEY (ID)
);

-- Insert default environment record with hardcoded UUID
DECLARE @DefaultEnvironmentID UNIQUEIDENTIFIER = 'F51358F3-9447-4176-B313-BF8025FD8D09';
INSERT INTO ${flyway:defaultSchema}.Environment (ID, Name, Description, IsDefault, Settings)
VALUES (
    @DefaultEnvironmentID,
    'Default',
    'The default environment for organizing conversations, artifacts, and collections',
    1,
    NULL
);

-- -----------------------------------------------------------------------------
-- Artifact: Independent content items that can be linked to multiple locations
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Artifact (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Artifact_ID DEFAULT (newsequentialid()),
    EnvironmentID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Artifact_EnvironmentID DEFAULT 'F51358F3-9447-4176-B313-BF8025FD8D09',
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    TypeID UNIQUEIDENTIFIER NOT NULL, -- FK to ArtifactType table (has ContentType field)
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
    EnvironmentID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Collection_EnvironmentID DEFAULT 'F51358F3-9447-4176-B313-BF8025FD8D09',
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
    EnvironmentID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Project_EnvironmentID DEFAULT 'F51358F3-9447-4176-B313-BF8025FD8D09',
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
ADD EnvironmentID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Conversation_EnvironmentID DEFAULT 'F51358F3-9447-4176-B313-BF8025FD8D09',
    ProjectID UNIQUEIDENTIFIER NULL,
    IsPinned BIT NOT NULL CONSTRAINT DF_Conversation_IsPinned DEFAULT (0);

-- Add foreign key constraints after columns are added
ALTER TABLE ${flyway:defaultSchema}.Conversation
ADD CONSTRAINT FK_Conversation_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID),
    CONSTRAINT FK_Conversation_Project FOREIGN KEY (ProjectID) REFERENCES ${flyway:defaultSchema}.Project(ID);

-- Add EnvironmentID to Dashboard table for consistency
ALTER TABLE ${flyway:defaultSchema}.Dashboard
ADD EnvironmentID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Dashboard_EnvironmentID DEFAULT 'F51358F3-9447-4176-B313-BF8025FD8D09';

ALTER TABLE ${flyway:defaultSchema}.Dashboard
ADD CONSTRAINT FK_Dashboard_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID);

-- Add EnvironmentID to Report table for consistency
ALTER TABLE ${flyway:defaultSchema}.Report
ADD EnvironmentID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Report_EnvironmentID DEFAULT 'F51358F3-9447-4176-B313-BF8025FD8D09';

ALTER TABLE ${flyway:defaultSchema}.Report
ADD CONSTRAINT FK_Report_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID);

-- Add IsPinned to ConversationDetail table to allow pinning specific messages
ALTER TABLE ${flyway:defaultSchema}.ConversationDetail
ADD IsPinned BIT NOT NULL CONSTRAINT DF_ConversationDetail_IsPinned DEFAULT (0);

-- =====================================================================================
-- TASK MANAGEMENT ENTITIES
-- =====================================================================================

-- -----------------------------------------------------------------------------
-- TaskType: Simple categorization of tasks
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.TaskType (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TaskType_ID DEFAULT (newsequentialid()),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    CONSTRAINT PK_TaskType PRIMARY KEY (ID)
);

-- -----------------------------------------------------------------------------
-- Task: Core task entity
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Task (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Task_ID DEFAULT (newsequentialid()),
    ParentID UNIQUEIDENTIFIER NULL, -- For subtask hierarchy
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    TypeID UNIQUEIDENTIFIER NOT NULL,
    EnvironmentID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Task_EnvironmentID DEFAULT 'F51358F3-9447-4176-B313-BF8025FD8D09',
    ProjectID UNIQUEIDENTIFIER NULL,
    ConversationDetailID UNIQUEIDENTIFIER NULL, -- Link to specific message that created/relates to task
    UserID UNIQUEIDENTIFIER NULL, -- Assigned user (mutually exclusive with AgentID)
    AgentID UNIQUEIDENTIFIER NULL, -- Assigned AI agent (mutually exclusive with UserID)
    Status NVARCHAR(50) NOT NULL CONSTRAINT DF_Task_Status DEFAULT ('Pending'),
    PercentComplete INT NULL CONSTRAINT DF_Task_PercentComplete DEFAULT (0),
    DueAt DATETIMEOFFSET NULL,
    StartedAt DATETIMEOFFSET NULL,
    CompletedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_Task PRIMARY KEY (ID),
    CONSTRAINT FK_Task_Parent FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.Task(ID),
    CONSTRAINT FK_Task_Type FOREIGN KEY (TypeID) REFERENCES ${flyway:defaultSchema}.TaskType(ID),
    CONSTRAINT FK_Task_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID),
    CONSTRAINT FK_Task_Project FOREIGN KEY (ProjectID) REFERENCES ${flyway:defaultSchema}.Project(ID),
    CONSTRAINT FK_Task_ConversationDetail FOREIGN KEY (ConversationDetailID) REFERENCES ${flyway:defaultSchema}.ConversationDetail(ID),
    CONSTRAINT FK_Task_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_Task_Agent FOREIGN KEY (AgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT CK_Task_Status CHECK (Status IN ('Pending', 'In Progress', 'Complete', 'Cancelled', 'Failed', 'Blocked', 'Deferred')),
    CONSTRAINT CK_Task_PercentComplete CHECK (PercentComplete >= 0 AND PercentComplete <= 100),
    CONSTRAINT CK_Task_Assignment CHECK ((UserID IS NULL AND AgentID IS NULL) OR (UserID IS NOT NULL AND AgentID IS NULL) OR (UserID IS NULL AND AgentID IS NOT NULL))
);

-- -----------------------------------------------------------------------------
-- TaskDependency: DAG structure for task prerequisites
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.TaskDependency (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TaskDependency_ID DEFAULT (newsequentialid()),
    TaskID UNIQUEIDENTIFIER NOT NULL, -- The dependent task
    DependsOnTaskID UNIQUEIDENTIFIER NOT NULL, -- The prerequisite task
    DependencyType NVARCHAR(50) NOT NULL CONSTRAINT DF_TaskDependency_Type DEFAULT ('Prerequisite'),
    CONSTRAINT PK_TaskDependency PRIMARY KEY (ID),
    CONSTRAINT FK_TaskDependency_Task FOREIGN KEY (TaskID) REFERENCES ${flyway:defaultSchema}.Task(ID),
    CONSTRAINT FK_TaskDependency_DependsOn FOREIGN KEY (DependsOnTaskID) REFERENCES ${flyway:defaultSchema}.Task(ID),
    CONSTRAINT CK_TaskDependency_Type CHECK (DependencyType IN ('Prerequisite', 'Corequisite', 'Optional')),
    CONSTRAINT UQ_TaskDependency_Pair UNIQUE (TaskID, DependsOnTaskID),
    CONSTRAINT CK_TaskDependency_NoCycle CHECK (TaskID != DependsOnTaskID)
);

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
    @value = N'Type of grantee receiving permission (User, Role, Everyone, Public). "Everyone" means all authenticated users whereas "Public" means any authenticated OR anonymous user.',
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

-- ===========================================
-- ConversationDetail Table Updates
-- ===========================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if this message is pinned within the conversation for easy reference',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetail',
    @level2type = N'COLUMN', @level2name = 'IsPinned';

-- ===========================================
-- TaskType Table and Columns
-- ===========================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorization system for different types of tasks that can be created and managed within the system',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name for the task type',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskType',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of what this task type represents and when it should be used',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskType',
    @level2type = N'COLUMN', @level2name = 'Description';

-- ===========================================
-- Task Table and Columns
-- ===========================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Core task management entity supporting multi-agent and multi-human collaboration with dependency tracking',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name for the task',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of the task requirements and objectives',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the task (Pending, In Progress, Complete, Cancelled, Failed, Blocked, Deferred)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Completion percentage for tracking progress (0-100)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'PercentComplete';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Due date and time for task completion',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'DueAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when work on the task began',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'StartedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the task was completed',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'CompletedAt';

-- ===========================================
-- TaskDependency Table and Columns
-- ===========================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines dependencies between tasks to create a directed acyclic graph (DAG) for workflow orchestration',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskDependency';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of dependency relationship (Prerequisite, Corequisite, Optional)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskDependency',
    @level2type = N'COLUMN', @level2name = 'DependencyType';
































































/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/
/****** CODEGEN RUN *******/





/* SQL generated to create new entity MJ: Collections */

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
         'fa0d11d1-4e8d-44d6-8c2b-55eeb3208e3e',
         'MJ: Collections',
         'Collections',
         NULL,
         NULL,
         'Collection',
         'vwCollections',
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
   

/* SQL generated to add new entity MJ: Collections to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fa0d11d1-4e8d-44d6-8c2b-55eeb3208e3e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Collections for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fa0d11d1-4e8d-44d6-8c2b-55eeb3208e3e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Collections for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fa0d11d1-4e8d-44d6-8c2b-55eeb3208e3e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Collections for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fa0d11d1-4e8d-44d6-8c2b-55eeb3208e3e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Projects */

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
         'b7e7dba2-c9c1-4536-b71c-d50cdfe7673a',
         'MJ: Projects',
         'Projects',
         NULL,
         NULL,
         'Project',
         'vwProjects',
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
   

/* SQL generated to add new entity MJ: Projects to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b7e7dba2-c9c1-4536-b71c-d50cdfe7673a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Projects for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b7e7dba2-c9c1-4536-b71c-d50cdfe7673a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Projects for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b7e7dba2-c9c1-4536-b71c-d50cdfe7673a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Projects for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b7e7dba2-c9c1-4536-b71c-d50cdfe7673a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Record Links */

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
         'e26c7855-b778-44f4-a110-56efee4f843b',
         'MJ: Record Links',
         'Record Links',
         NULL,
         NULL,
         'RecordLink',
         'vwRecordLinks',
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
   

/* SQL generated to add new entity MJ: Record Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e26c7855-b778-44f4-a110-56efee4f843b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Record Links for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e26c7855-b778-44f4-a110-56efee4f843b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Record Links for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e26c7855-b778-44f4-a110-56efee4f843b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Record Links for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e26c7855-b778-44f4-a110-56efee4f843b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Access Control Rules */

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
         'f6b17ca4-f2d6-47e7-9f97-7b3d1c183826',
         'MJ: Access Control Rules',
         'Access Control Rules',
         NULL,
         NULL,
         'AccessControlRule',
         'vwAccessControlRules',
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
   

/* SQL generated to add new entity MJ: Access Control Rules to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f6b17ca4-f2d6-47e7-9f97-7b3d1c183826', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Access Control Rules for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f6b17ca4-f2d6-47e7-9f97-7b3d1c183826', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Access Control Rules for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f6b17ca4-f2d6-47e7-9f97-7b3d1c183826', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Access Control Rules for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f6b17ca4-f2d6-47e7-9f97-7b3d1c183826', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Public Links */

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
         '6bab48bd-f197-4737-93a6-8081bbbaeb30',
         'MJ: Public Links',
         'Public Links',
         NULL,
         NULL,
         'PublicLink',
         'vwPublicLinks',
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
   

/* SQL generated to add new entity MJ: Public Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '6bab48bd-f197-4737-93a6-8081bbbaeb30', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Public Links for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6bab48bd-f197-4737-93a6-8081bbbaeb30', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Public Links for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6bab48bd-f197-4737-93a6-8081bbbaeb30', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Public Links for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6bab48bd-f197-4737-93a6-8081bbbaeb30', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Task Types */

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
         '7bd06b14-122d-426e-a796-1dbe64fa4f60',
         'MJ: Task Types',
         'Task Types',
         NULL,
         NULL,
         'TaskType',
         'vwTaskTypes',
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
   

/* SQL generated to add new entity MJ: Task Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7bd06b14-122d-426e-a796-1dbe64fa4f60', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Task Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7bd06b14-122d-426e-a796-1dbe64fa4f60', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Task Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7bd06b14-122d-426e-a796-1dbe64fa4f60', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Task Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7bd06b14-122d-426e-a796-1dbe64fa4f60', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Tasks */

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
         '64ad3c8d-0570-48af-af4c-d0a2b173fde1',
         'MJ: Tasks',
         'Tasks',
         NULL,
         NULL,
         'Task',
         'vwTasks',
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
   

/* SQL generated to add new entity MJ: Tasks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '64ad3c8d-0570-48af-af4c-d0a2b173fde1', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Tasks for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('64ad3c8d-0570-48af-af4c-d0a2b173fde1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Tasks for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('64ad3c8d-0570-48af-af4c-d0a2b173fde1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Tasks for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('64ad3c8d-0570-48af-af4c-d0a2b173fde1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Task Dependencies */

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
         'dd6ee217-00ec-4de8-a2e6-489a08d4e524',
         'MJ: Task Dependencies',
         'Task Dependencies',
         NULL,
         NULL,
         'TaskDependency',
         'vwTaskDependencies',
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
   

/* SQL generated to add new entity MJ: Task Dependencies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'dd6ee217-00ec-4de8-a2e6-489a08d4e524', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Task Dependencies for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('dd6ee217-00ec-4de8-a2e6-489a08d4e524', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Task Dependencies for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('dd6ee217-00ec-4de8-a2e6-489a08d4e524', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Task Dependencies for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('dd6ee217-00ec-4de8-a2e6-489a08d4e524', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Environments */

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
         '72975471-6aab-45c6-b58a-3f1115c921c3',
         'MJ: Environments',
         'Environments',
         NULL,
         NULL,
         'Environment',
         'vwEnvironments',
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
   

/* SQL generated to add new entity MJ: Environments to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '72975471-6aab-45c6-b58a-3f1115c921c3', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Environments for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('72975471-6aab-45c6-b58a-3f1115c921c3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Environments for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('72975471-6aab-45c6-b58a-3f1115c921c3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Environments for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('72975471-6aab-45c6-b58a-3f1115c921c3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Artifacts */

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
         'f48d2341-8667-40bb-bca8-87d7f80e16cd',
         'MJ: Artifacts',
         'Artifacts',
         NULL,
         NULL,
         'Artifact',
         'vwArtifacts',
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
   

/* SQL generated to add new entity MJ: Artifacts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f48d2341-8667-40bb-bca8-87d7f80e16cd', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Artifacts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f48d2341-8667-40bb-bca8-87d7f80e16cd', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Artifacts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f48d2341-8667-40bb-bca8-87d7f80e16cd', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Artifacts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f48d2341-8667-40bb-bca8-87d7f80e16cd', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Artifact Versions */

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
         'aeb408d2-162a-49ae-9dc2-dbe9a21a3c01',
         'MJ: Artifact Versions',
         'Artifact Versions',
         NULL,
         NULL,
         'ArtifactVersion',
         'vwArtifactVersions',
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
   

/* SQL generated to add new entity MJ: Artifact Versions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'aeb408d2-162a-49ae-9dc2-dbe9a21a3c01', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Artifact Versions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('aeb408d2-162a-49ae-9dc2-dbe9a21a3c01', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Artifact Versions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('aeb408d2-162a-49ae-9dc2-dbe9a21a3c01', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Artifact Versions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('aeb408d2-162a-49ae-9dc2-dbe9a21a3c01', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TaskType */
ALTER TABLE [${flyway:defaultSchema}].[TaskType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TaskType */
ALTER TABLE [${flyway:defaultSchema}].[TaskType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Environment */
ALTER TABLE [${flyway:defaultSchema}].[Environment] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Environment */
ALTER TABLE [${flyway:defaultSchema}].[Environment] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TaskDependency */
ALTER TABLE [${flyway:defaultSchema}].[TaskDependency] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TaskDependency */
ALTER TABLE [${flyway:defaultSchema}].[TaskDependency] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Collection */
ALTER TABLE [${flyway:defaultSchema}].[Collection] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Collection */
ALTER TABLE [${flyway:defaultSchema}].[Collection] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordLink */
ALTER TABLE [${flyway:defaultSchema}].[RecordLink] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordLink */
ALTER TABLE [${flyway:defaultSchema}].[RecordLink] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AccessControlRule */
ALTER TABLE [${flyway:defaultSchema}].[AccessControlRule] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AccessControlRule */
ALTER TABLE [${flyway:defaultSchema}].[AccessControlRule] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PublicLink */
ALTER TABLE [${flyway:defaultSchema}].[PublicLink] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PublicLink */
ALTER TABLE [${flyway:defaultSchema}].[PublicLink] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Artifact */
ALTER TABLE [${flyway:defaultSchema}].[Artifact] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Artifact */
ALTER TABLE [${flyway:defaultSchema}].[Artifact] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Task */
ALTER TABLE [${flyway:defaultSchema}].[Task] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Task */
ALTER TABLE [${flyway:defaultSchema}].[Task] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Project */
ALTER TABLE [${flyway:defaultSchema}].[Project] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Project */
ALTER TABLE [${flyway:defaultSchema}].[Project] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactVersion */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactVersion] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactVersion */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactVersion] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '36ce005c-4a7e-495e-b2c4-1467b48c2e0b'  OR 
               (EntityID = '7BD06B14-122D-426E-A796-1DBE64FA4F60' AND Name = 'ID')
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
            '36ce005c-4a7e-495e-b2c4-1467b48c2e0b',
            '7BD06B14-122D-426E-A796-1DBE64FA4F60', -- Entity: MJ: Task Types
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = 'aab1624c-0fd4-4369-9be3-685a37a53a79'  OR 
               (EntityID = '7BD06B14-122D-426E-A796-1DBE64FA4F60' AND Name = 'Name')
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
            'aab1624c-0fd4-4369-9be3-685a37a53a79',
            '7BD06B14-122D-426E-A796-1DBE64FA4F60', -- Entity: MJ: Task Types
            100002,
            'Name',
            'Name',
            'Display name for the task type',
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
         WHERE ID = '1f1e583d-6f33-4ca2-8ef3-c8be86b4af1d'  OR 
               (EntityID = '7BD06B14-122D-426E-A796-1DBE64FA4F60' AND Name = 'Description')
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
            '1f1e583d-6f33-4ca2-8ef3-c8be86b4af1d',
            '7BD06B14-122D-426E-A796-1DBE64FA4F60', -- Entity: MJ: Task Types
            100003,
            'Description',
            'Description',
            'Detailed description of what this task type represents and when it should be used',
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
         WHERE ID = '8b7ddd87-4bd3-4a52-88a5-0cea1ce43024'  OR 
               (EntityID = '7BD06B14-122D-426E-A796-1DBE64FA4F60' AND Name = '__mj_CreatedAt')
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
            '8b7ddd87-4bd3-4a52-88a5-0cea1ce43024',
            '7BD06B14-122D-426E-A796-1DBE64FA4F60', -- Entity: MJ: Task Types
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
         WHERE ID = '9d1b35d1-e430-46aa-8d97-2121627417a8'  OR 
               (EntityID = '7BD06B14-122D-426E-A796-1DBE64FA4F60' AND Name = '__mj_UpdatedAt')
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
            '9d1b35d1-e430-46aa-8d97-2121627417a8',
            '7BD06B14-122D-426E-A796-1DBE64FA4F60', -- Entity: MJ: Task Types
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
         WHERE ID = '4c004aa4-14ff-45d2-aeab-94e2315cc513'  OR 
               (EntityID = '72975471-6AAB-45C6-B58A-3F1115C921C3' AND Name = 'ID')
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
            '4c004aa4-14ff-45d2-aeab-94e2315cc513',
            '72975471-6AAB-45C6-B58A-3F1115C921C3', -- Entity: MJ: Environments
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = '49a6029d-4a7e-419e-bf74-7b381df7591b'  OR 
               (EntityID = '72975471-6AAB-45C6-B58A-3F1115C921C3' AND Name = 'Name')
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
            '49a6029d-4a7e-419e-bf74-7b381df7591b',
            '72975471-6AAB-45C6-B58A-3F1115C921C3', -- Entity: MJ: Environments
            100002,
            'Name',
            'Name',
            'Display name for the environment',
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
         WHERE ID = 'dbd5610d-f285-4b46-b612-71f4bdd37ec6'  OR 
               (EntityID = '72975471-6AAB-45C6-B58A-3F1115C921C3' AND Name = 'Description')
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
            'dbd5610d-f285-4b46-b612-71f4bdd37ec6',
            '72975471-6AAB-45C6-B58A-3F1115C921C3', -- Entity: MJ: Environments
            100003,
            'Description',
            'Description',
            'Detailed description of the environment purpose and scope',
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
         WHERE ID = '5f4e688c-383e-458b-9035-908edef53dba'  OR 
               (EntityID = '72975471-6AAB-45C6-B58A-3F1115C921C3' AND Name = 'IsDefault')
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
            '5f4e688c-383e-458b-9035-908edef53dba',
            '72975471-6AAB-45C6-B58A-3F1115C921C3', -- Entity: MJ: Environments
            100004,
            'IsDefault',
            'Is Default',
            'Indicates if this is the default environment for the organization',
            'bit',
            1,
            1,
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
         WHERE ID = 'bb4fb190-7668-4043-af39-83a6bb3f1a67'  OR 
               (EntityID = '72975471-6AAB-45C6-B58A-3F1115C921C3' AND Name = 'Settings')
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
            'bb4fb190-7668-4043-af39-83a6bb3f1a67',
            '72975471-6AAB-45C6-B58A-3F1115C921C3', -- Entity: MJ: Environments
            100005,
            'Settings',
            'Settings',
            'JSON configuration for environment-specific settings and features',
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
         WHERE ID = '22002d27-66fd-4b4a-a351-84227018f73c'  OR 
               (EntityID = '72975471-6AAB-45C6-B58A-3F1115C921C3' AND Name = '__mj_CreatedAt')
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
            '22002d27-66fd-4b4a-a351-84227018f73c',
            '72975471-6AAB-45C6-B58A-3F1115C921C3', -- Entity: MJ: Environments
            100006,
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
         WHERE ID = 'ea7656ca-7439-472e-91df-840838c4df26'  OR 
               (EntityID = '72975471-6AAB-45C6-B58A-3F1115C921C3' AND Name = '__mj_UpdatedAt')
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
            'ea7656ca-7439-472e-91df-840838c4df26',
            '72975471-6AAB-45C6-B58A-3F1115C921C3', -- Entity: MJ: Environments
            100007,
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
         WHERE ID = '36ffbc49-1613-4ddf-bb5c-651af6ff195f'  OR 
               (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'ID')
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
            '36ffbc49-1613-4ddf-bb5c-651af6ff195f',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = 'bb9353ef-735c-4d86-9c5b-110ce8580bf9'  OR 
               (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'TaskID')
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
            'bb9353ef-735c-4d86-9c5b-110ce8580bf9',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            100002,
            'TaskID',
            'Task ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1',
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
         WHERE ID = '9233f1da-6e87-4662-80b2-4227f37ce3dc'  OR 
               (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'DependsOnTaskID')
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
            '9233f1da-6e87-4662-80b2-4227f37ce3dc',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            100003,
            'DependsOnTaskID',
            'Depends On Task ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1',
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
         WHERE ID = '9aec13b1-8c8b-4af0-ba96-dd5e70baa4e8'  OR 
               (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'DependencyType')
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
            '9aec13b1-8c8b-4af0-ba96-dd5e70baa4e8',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            100004,
            'DependencyType',
            'Dependency Type',
            'Type of dependency relationship (Prerequisite, Corequisite, Optional)',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Prerequisite',
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
         WHERE ID = 'd8793880-61e7-465e-86f7-5521bdcd4fd9'  OR 
               (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = '__mj_CreatedAt')
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
            'd8793880-61e7-465e-86f7-5521bdcd4fd9',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
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
         WHERE ID = 'e70f4c17-c4c4-4a89-afdc-7c0c992360b4'  OR 
               (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = '__mj_UpdatedAt')
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
            'e70f4c17-c4c4-4a89-afdc-7c0c992360b4',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
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
         WHERE ID = '080136c2-8e60-451a-a26e-371aa44116d1'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'ID')
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
            '080136c2-8e60-451a-a26e-371aa44116d1',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = '4cedd6f4-e491-4596-a1fd-376be7b46653'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'EnvironmentID')
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
            '4cedd6f4-e491-4596-a1fd-376be7b46653',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100002,
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'F51358F3-9447-4176-B313-BF8025FD8D09',
            0,
            1,
            0,
            '72975471-6AAB-45C6-B58A-3F1115C921C3',
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
         WHERE ID = 'a02fb0c6-112a-4895-a461-f3c3872a095c'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'ParentID')
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
            'a02fb0c6-112a-4895-a461-f3c3872a095c',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100003,
            'ParentID',
            'Parent ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E',
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
         WHERE ID = '9d344c2c-cadb-44cd-9c7b-c1a9d885ee3c'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'Name')
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
            '9d344c2c-cadb-44cd-9c7b-c1a9d885ee3c',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100004,
            'Name',
            'Name',
            'Display name for the collection',
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
         WHERE ID = '6016aae4-8b4b-41bf-9be8-e042fa5357e2'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'Description')
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
            '6016aae4-8b4b-41bf-9be8-e042fa5357e2',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100005,
            'Description',
            'Description',
            'Detailed description of the collection purpose',
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
         WHERE ID = '5051c5a0-86d6-48db-aa58-05f9435d3ec5'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'Icon')
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
            '5051c5a0-86d6-48db-aa58-05f9435d3ec5',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100006,
            'Icon',
            'Icon',
            'Font Awesome icon class for UI display',
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
         WHERE ID = '1a7e26b9-813d-4347-8d8e-f765ea6ae4f7'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'Color')
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
            '1a7e26b9-813d-4347-8d8e-f765ea6ae4f7',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100007,
            'Color',
            'Color',
            'Hex color code for UI display (#RRGGBB format)',
            'nvarchar',
            14,
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
         WHERE ID = 'f1a47430-beae-4298-8ae3-f7dfab6e78ca'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'Sequence')
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
            'f1a47430-beae-4298-8ae3-f7dfab6e78ca',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100008,
            'Sequence',
            'Sequence',
            'Display sequence for ordering collections in UI',
            'int',
            4,
            10,
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
         WHERE ID = 'd39c7b1e-7393-42fd-93b4-18be01b1bd66'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = '__mj_CreatedAt')
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
            'd39c7b1e-7393-42fd-93b4-18be01b1bd66',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100009,
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
         WHERE ID = 'bc7dd4a0-877c-4373-93cb-09f8978dfca7'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = '__mj_UpdatedAt')
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
            'bc7dd4a0-877c-4373-93cb-09f8978dfca7',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100010,
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
         WHERE ID = '70e6c72f-829d-4197-a142-7b3ff5010903'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'ID')
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
            '70e6c72f-829d-4197-a142-7b3ff5010903',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = 'dec6fdd2-85a6-4fdd-89bc-bee8b1f1763c'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'SourceEntityID')
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
            'dec6fdd2-85a6-4fdd-89bc-bee8b1f1763c',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100002,
            'SourceEntityID',
            'Source Entity ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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
         WHERE ID = 'aec7274c-5cb1-4c39-8dbc-1d139584e20e'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'SourceRecordID')
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
            'aec7274c-5cb1-4c39-8dbc-1d139584e20e',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100003,
            'SourceRecordID',
            'Source Record ID',
            'Primary key value(s) of the source record - scalar for simple PKs or JSON KeyValuePair array for composite PKs',
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
         WHERE ID = 'eedb84f8-4cd3-4215-a0bd-25960c71a322'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'TargetEntityID')
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
            'eedb84f8-4cd3-4215-a0bd-25960c71a322',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100004,
            'TargetEntityID',
            'Target Entity ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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
         WHERE ID = 'b366626e-a245-4cbc-bafd-fc0684920151'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'TargetRecordID')
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
            'b366626e-a245-4cbc-bafd-fc0684920151',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100005,
            'TargetRecordID',
            'Target Record ID',
            'Primary key value(s) of the target record - scalar for simple PKs or JSON KeyValuePair array for composite PKs',
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
         WHERE ID = '5679eff4-b0d5-4d7e-a4c6-2606f7c3fd74'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'LinkType')
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
            '5679eff4-b0d5-4d7e-a4c6-2606f7c3fd74',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100006,
            'LinkType',
            'Link Type',
            'Application-specific relationship type describing how the records are related',
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
         WHERE ID = 'a1454f7a-50d7-4617-ba41-b80a3e00a788'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'Sequence')
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
            'a1454f7a-50d7-4617-ba41-b80a3e00a788',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100007,
            'Sequence',
            'Sequence',
            'Display sequence for ordering linked records in UI',
            'int',
            4,
            10,
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
         WHERE ID = '18b2aa96-b534-4507-ae8d-d07d7cfd1dba'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'Metadata')
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
            '18b2aa96-b534-4507-ae8d-d07d7cfd1dba',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100008,
            'Metadata',
            'Metadata',
            'JSON field for storing additional link-specific metadata',
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
         WHERE ID = '6a4555ba-552b-4ee2-80a3-c9203364c9e6'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = '__mj_CreatedAt')
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
            '6a4555ba-552b-4ee2-80a3-c9203364c9e6',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100009,
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
         WHERE ID = '9622ff96-25e3-4b5b-83cd-4a584139285c'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = '__mj_UpdatedAt')
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
            '9622ff96-25e3-4b5b-83cd-4a584139285c',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100010,
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
         WHERE ID = 'aceb96bd-5a2f-47b7-8d5e-85e3c9e6c397'  OR 
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EnvironmentID')
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
            'aceb96bd-5a2f-47b7-8d5e-85e3c9e6c397',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            100015,
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'F51358F3-9447-4176-B313-BF8025FD8D09',
            0,
            1,
            0,
            '72975471-6AAB-45C6-B58A-3F1115C921C3',
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
         WHERE ID = '257ffe0e-ec6f-441b-8039-3a17b44ff4fb'  OR 
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EnvironmentID')
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
            '257ffe0e-ec6f-441b-8039-3a17b44ff4fb',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Reports
            100020,
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'F51358F3-9447-4176-B313-BF8025FD8D09',
            0,
            1,
            0,
            '72975471-6AAB-45C6-B58A-3F1115C921C3',
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
         WHERE ID = 'd04d36ae-bcb4-4df2-8bb7-0ed3567facf2'  OR 
               (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsPinned')
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
            'd04d36ae-bcb4-4df2-8bb7-0ed3567facf2',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversation Details
            100018,
            'IsPinned',
            'Is Pinned',
            'Indicates if this message is pinned within the conversation for easy reference',
            'bit',
            1,
            1,
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
         WHERE ID = 'a8ee672f-d2df-4c0f-81fc-1392fcad9813'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EnvironmentID')
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
            'a8ee672f-d2df-4c0f-81fc-1392fcad9813',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100014,
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'F51358F3-9447-4176-B313-BF8025FD8D09',
            0,
            1,
            0,
            '72975471-6AAB-45C6-B58A-3F1115C921C3',
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
         WHERE ID = 'eb07b3d0-ff8b-43ad-a612-01340c796652'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ProjectID')
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
            'eb07b3d0-ff8b-43ad-a612-01340c796652',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100015,
            'ProjectID',
            'Project ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A',
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
         WHERE ID = '7cad1edb-fdfc-4c19-8e8c-ccbce0c60558'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsPinned')
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
            '7cad1edb-fdfc-4c19-8e8c-ccbce0c60558',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100016,
            'IsPinned',
            'Is Pinned',
            'Indicates if this conversation is pinned to the top of lists',
            'bit',
            1,
            1,
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
         WHERE ID = '91ff8dd8-55b2-41e2-bc04-7ceb826f2853'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'ID')
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
            '91ff8dd8-55b2-41e2-bc04-7ceb826f2853',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = '36c6e83f-6d89-48d5-9565-e308376e923e'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'EntityID')
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
            '36c6e83f-6d89-48d5-9565-e308376e923e',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100002,
            'EntityID',
            'Entity ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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
         WHERE ID = '6f5223cd-bfd0-4911-97c6-49e3f0eb8bf7'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'RecordID')
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
            '6f5223cd-bfd0-4911-97c6-49e3f0eb8bf7',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100003,
            'RecordID',
            'Record ID',
            'Primary key value(s) of the record being protected - scalar for simple PKs or JSON for composite PKs',
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
         WHERE ID = '7968ef88-8296-4531-a1d7-fc15d0b17d3e'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'GranteeType')
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
            '7968ef88-8296-4531-a1d7-fc15d0b17d3e',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100004,
            'GranteeType',
            'Grantee Type',
            'Type of grantee receiving permission (User, Role, Everyone, Public). "Everyone" means all authenticated users whereas "Public" means any authenticated OR anonymous user.',
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
         WHERE ID = '731488e8-7734-4e4d-bb67-f5ecfc686d24'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'GranteeID')
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
            '731488e8-7734-4e4d-bb67-f5ecfc686d24',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100005,
            'GranteeID',
            'Grantee ID',
            NULL,
            'uniqueidentifier',
            16,
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
         WHERE ID = 'bce3c667-2580-4190-bfda-f2cca3c12884'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'CanRead')
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
            'bce3c667-2580-4190-bfda-f2cca3c12884',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100006,
            'CanRead',
            'Can Read',
            'Permission to read/view the record',
            'bit',
            1,
            1,
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
         WHERE ID = 'ffe48a8d-006b-4596-932f-f7f9f28458c4'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'CanCreate')
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
            'ffe48a8d-006b-4596-932f-f7f9f28458c4',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100007,
            'CanCreate',
            'Can Create',
            'Permission to create new related records',
            'bit',
            1,
            1,
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
         WHERE ID = 'cc474e44-d449-4caf-9a25-b108009a3515'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'CanUpdate')
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
            'cc474e44-d449-4caf-9a25-b108009a3515',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100008,
            'CanUpdate',
            'Can Update',
            'Permission to update/modify the record',
            'bit',
            1,
            1,
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
         WHERE ID = 'c665f464-8362-4af8-8e7a-c19a18d005f2'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'CanDelete')
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
            'c665f464-8362-4af8-8e7a-c19a18d005f2',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100009,
            'CanDelete',
            'Can Delete',
            'Permission to delete the record',
            'bit',
            1,
            1,
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
         WHERE ID = '6c916edd-9ebb-4a53-b6ef-4b767e2bf164'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'CanShare')
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
            '6c916edd-9ebb-4a53-b6ef-4b767e2bf164',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100010,
            'CanShare',
            'Can Share',
            'Permission to share/grant permissions to other users',
            'bit',
            1,
            1,
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
         WHERE ID = 'a3eec2fe-0d9c-40ca-8591-8c70ce92bcf9'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'ExpiresAt')
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
            'a3eec2fe-0d9c-40ca-8591-8c70ce92bcf9',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100011,
            'ExpiresAt',
            'Expires At',
            'Optional expiration date/time for this access rule',
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
         WHERE ID = '8dd2c71d-3efe-4613-8235-949c42ab617a'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'GrantedByUserID')
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
            '8dd2c71d-3efe-4613-8235-949c42ab617a',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100012,
            'GrantedByUserID',
            'Granted By User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '67d22534-46fd-4f6e-944c-159d3b1189c7'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = '__mj_CreatedAt')
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
            '67d22534-46fd-4f6e-944c-159d3b1189c7',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100013,
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
         WHERE ID = '035700e7-72c3-49d7-b28a-2424d1483c61'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = '__mj_UpdatedAt')
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
            '035700e7-72c3-49d7-b28a-2424d1483c61',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100014,
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
         WHERE ID = 'c3bf4f05-1dd6-4994-8290-12536f5d4b2d'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'ID')
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
            'c3bf4f05-1dd6-4994-8290-12536f5d4b2d',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = 'a5cf400a-aba4-4ae3-a36a-988559e8c13e'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'ResourceType')
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
            'a5cf400a-aba4-4ae3-a36a-988559e8c13e',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100002,
            'ResourceType',
            'Resource Type',
            'Type of resource being shared (Artifact, Conversation, Collection)',
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
         WHERE ID = '594b893b-d824-4243-9984-dbbd1b114d51'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'ResourceID')
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
            '594b893b-d824-4243-9984-dbbd1b114d51',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100003,
            'ResourceID',
            'Resource ID',
            NULL,
            'uniqueidentifier',
            16,
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
         WHERE ID = 'dacf1666-f443-46f1-b313-4d13c44892a6'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'Token')
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
            'dacf1666-f443-46f1-b313-4d13c44892a6',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100004,
            'Token',
            'Token',
            'Unique token for accessing the shared resource via URL',
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
         WHERE ID = '6ff071b8-703e-454a-a2ac-530e205b89c3'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'PasswordHash')
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
            '6ff071b8-703e-454a-a2ac-530e205b89c3',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100005,
            'PasswordHash',
            'Password Hash',
            'SHA256 hash of optional password for additional security',
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
         WHERE ID = '890f83ed-9fed-4a67-bfbc-a120708245ce'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'ExpiresAt')
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
            '890f83ed-9fed-4a67-bfbc-a120708245ce',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100006,
            'ExpiresAt',
            'Expires At',
            'Optional expiration date/time for this public link',
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
         WHERE ID = '9bbe6171-c25a-4119-8b11-36ce18cd0c98'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'MaxViews')
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
            '9bbe6171-c25a-4119-8b11-36ce18cd0c98',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100007,
            'MaxViews',
            'Max Views',
            'Maximum number of times this link can be viewed',
            'int',
            4,
            10,
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
         WHERE ID = '73fa206e-fa7f-400a-8011-1184111d9b52'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'CurrentViews')
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
            '73fa206e-fa7f-400a-8011-1184111d9b52',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100008,
            'CurrentViews',
            'Current Views',
            'Current count of how many times this link has been viewed',
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
         WHERE ID = 'e85ce376-ff29-40f1-b066-deae2a041a17'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'UserID')
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
            'e85ce376-ff29-40f1-b066-deae2a041a17',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100009,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '2fd58d98-968b-43cf-b44a-53cf85aefc75'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'IsActive')
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
            '2fd58d98-968b-43cf-b44a-53cf85aefc75',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100010,
            'IsActive',
            'Is Active',
            'Indicates if this link is currently active and accessible',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = 'e3fc6bf9-0635-4c98-9a5b-38658cdb2f9d'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = '__mj_CreatedAt')
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
            'e3fc6bf9-0635-4c98-9a5b-38658cdb2f9d',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100011,
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
         WHERE ID = '44c8ef28-0eb4-463a-9a69-96dcfd90269d'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = '__mj_UpdatedAt')
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
            '44c8ef28-0eb4-463a-9a69-96dcfd90269d',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100012,
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
         WHERE ID = '3cf23240-94e2-48ae-ade4-3226621205ba'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'ID')
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
            '3cf23240-94e2-48ae-ade4-3226621205ba',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = '4cce08e9-74d9-4de5-a191-e53b0ee3823b'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'EnvironmentID')
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
            '4cce08e9-74d9-4de5-a191-e53b0ee3823b',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100002,
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'F51358F3-9447-4176-B313-BF8025FD8D09',
            0,
            1,
            0,
            '72975471-6AAB-45C6-B58A-3F1115C921C3',
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
         WHERE ID = '42f4fd94-7aa1-425f-8c6e-693e00b18c01'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'Name')
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
            '42f4fd94-7aa1-425f-8c6e-693e00b18c01',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100003,
            'Name',
            'Name',
            'Display name for the artifact',
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
         WHERE ID = '89770b03-6141-45af-b0b4-fee6bd3c5b2b'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'Description')
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
            '89770b03-6141-45af-b0b4-fee6bd3c5b2b',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100004,
            'Description',
            'Description',
            'Detailed description of the artifact contents and purpose',
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
         WHERE ID = '9a951d8d-f901-4ba3-88e6-98ec076d3d88'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'TypeID')
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
            '9a951d8d-f901-4ba3-88e6-98ec076d3d88',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100005,
            'TypeID',
            'Type ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '91797885-7128-4B71-8C4B-81C5FEE24F38',
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
         WHERE ID = '914aafc9-da3a-460e-a059-e15f445a58a9'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'Comments')
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
            '914aafc9-da3a-460e-a059-e15f445a58a9',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100006,
            'Comments',
            'Comments',
            'User comments about the artifact',
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
         WHERE ID = 'd3487c19-ec25-4fda-bbdd-ada03a1fbfcc'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'UserID')
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
            'd3487c19-ec25-4fda-bbdd-ada03a1fbfcc',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100007,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '26a963db-6cd5-4535-a657-8ec648f3110a'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = '__mj_CreatedAt')
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
            '26a963db-6cd5-4535-a657-8ec648f3110a',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
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
         WHERE ID = '955fbc40-4cc3-4929-a005-7768528dba55'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = '__mj_UpdatedAt')
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
            '955fbc40-4cc3-4929-a005-7768528dba55',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
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
         WHERE ID = 'fd227316-95f3-468b-8db8-aea5e3a4c431'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ID')
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
            'fd227316-95f3-468b-8db8-aea5e3a4c431',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = 'c866d300-e97c-44e7-8848-f3da97ce3f77'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ParentID')
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
            'c866d300-e97c-44e7-8848-f3da97ce3f77',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100002,
            'ParentID',
            'Parent ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1',
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
         WHERE ID = '55602c1c-fb4a-4678-a847-7889860791d5'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Name')
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
            '55602c1c-fb4a-4678-a847-7889860791d5',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100003,
            'Name',
            'Name',
            'Display name for the task',
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
         WHERE ID = '24940e6c-fc69-40f1-9ea6-d860f38fc93f'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Description')
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
            '24940e6c-fc69-40f1-9ea6-d860f38fc93f',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100004,
            'Description',
            'Description',
            'Detailed description of the task requirements and objectives',
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
         WHERE ID = 'f8719181-09b2-4c98-86f1-9a7828f46d2b'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'TypeID')
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
            'f8719181-09b2-4c98-86f1-9a7828f46d2b',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100005,
            'TypeID',
            'Type ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '7BD06B14-122D-426E-A796-1DBE64FA4F60',
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
         WHERE ID = '1b80f5cc-b3ad-4c4e-9f64-4c061ac14ec2'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'EnvironmentID')
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
            '1b80f5cc-b3ad-4c4e-9f64-4c061ac14ec2',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100006,
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'F51358F3-9447-4176-B313-BF8025FD8D09',
            0,
            1,
            0,
            '72975471-6AAB-45C6-B58A-3F1115C921C3',
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
         WHERE ID = 'e94662c2-69b9-4603-9bfc-279cfd42a222'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ProjectID')
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
            'e94662c2-69b9-4603-9bfc-279cfd42a222',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100007,
            'ProjectID',
            'Project ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A',
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
         WHERE ID = 'cce153eb-99ac-42dd-9bf7-628c0e121c62'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ConversationDetailID')
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
            'cce153eb-99ac-42dd-9bf7-628c0e121c62',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100008,
            'ConversationDetailID',
            'Conversation Detail ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '12248F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '9f585440-da55-4a2a-a48b-2937a3b24483'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'UserID')
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
            '9f585440-da55-4a2a-a48b-2937a3b24483',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100009,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = 'a1e1c7ba-66fa-4bdc-a21a-a27ab8c577c4'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'AgentID')
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
            'a1e1c7ba-66fa-4bdc-a21a-a27ab8c577c4',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100010,
            'AgentID',
            'Agent ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9320e9c7-764e-401b-bf2d-a07358e4dd00'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Status')
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
            '9320e9c7-764e-401b-bf2d-a07358e4dd00',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100011,
            'Status',
            'Status',
            'Current status of the task (Pending, In Progress, Complete, Cancelled, Failed, Blocked, Deferred)',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Pending',
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
         WHERE ID = '8071305e-e1c1-48bf-ae70-e345d6b892ee'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'PercentComplete')
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
            '8071305e-e1c1-48bf-ae70-e345d6b892ee',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100012,
            'PercentComplete',
            'Percent Complete',
            'Completion percentage for tracking progress (0-100)',
            'int',
            4,
            10,
            0,
            1,
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
         WHERE ID = '97a0a3ea-5563-4c55-9935-397c26bfd00a'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'DueAt')
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
            '97a0a3ea-5563-4c55-9935-397c26bfd00a',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100013,
            'DueAt',
            'Due At',
            'Due date and time for task completion',
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
         WHERE ID = 'b267c59c-3370-4edf-a9d4-106d46a6bbf4'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'StartedAt')
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
            'b267c59c-3370-4edf-a9d4-106d46a6bbf4',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100014,
            'StartedAt',
            'Started At',
            'Timestamp when work on the task began',
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
         WHERE ID = 'f09901b1-a4c3-4845-a639-b9730146021a'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'CompletedAt')
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
            'f09901b1-a4c3-4845-a639-b9730146021a',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100015,
            'CompletedAt',
            'Completed At',
            'Timestamp when the task was completed',
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
         WHERE ID = '7b6a3f29-48a9-41b8-8374-214f12a5659c'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = '__mj_CreatedAt')
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
            '7b6a3f29-48a9-41b8-8374-214f12a5659c',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
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
         WHERE ID = '0b5358d5-c6c2-4579-879e-d2ba19d95541'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = '__mj_UpdatedAt')
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
            '0b5358d5-c6c2-4579-879e-d2ba19d95541',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
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
         WHERE ID = 'b560f897-1393-42e5-9d56-73ce04139526'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'ID')
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
            'b560f897-1393-42e5-9d56-73ce04139526',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = '5c2fff31-2fe1-401f-8372-1b18c0727ddf'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'EnvironmentID')
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
            '5c2fff31-2fe1-401f-8372-1b18c0727ddf',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100002,
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'F51358F3-9447-4176-B313-BF8025FD8D09',
            0,
            1,
            0,
            '72975471-6AAB-45C6-B58A-3F1115C921C3',
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
         WHERE ID = '6a979d0a-1cff-449d-a121-6895c3c1bec4'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'ParentID')
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
            '6a979d0a-1cff-449d-a121-6895c3c1bec4',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100003,
            'ParentID',
            'Parent ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A',
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
         WHERE ID = '955ca1f0-c7e3-4f65-a37c-c385ec3e09e8'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'Name')
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
            '955ca1f0-c7e3-4f65-a37c-c385ec3e09e8',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100004,
            'Name',
            'Name',
            'Display name for the project',
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
         WHERE ID = 'b024c1cb-4c72-44fd-a751-9897d5f44589'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'Description')
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
            'b024c1cb-4c72-44fd-a751-9897d5f44589',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100005,
            'Description',
            'Description',
            'Detailed description of the project goals and scope',
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
         WHERE ID = '082f2c04-df5c-4210-b943-fcc719a26bd5'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'Color')
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
            '082f2c04-df5c-4210-b943-fcc719a26bd5',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100006,
            'Color',
            'Color',
            'Hex color code for project badges in UI (#RRGGBB format)',
            'nvarchar',
            14,
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
         WHERE ID = 'e0056998-dab0-4844-bbf8-407fe4dc750f'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'Icon')
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
            'e0056998-dab0-4844-bbf8-407fe4dc750f',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100007,
            'Icon',
            'Icon',
            'Font Awesome icon class for UI display',
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
         WHERE ID = 'cdef6224-4a6a-4ea1-8e96-55cf116f5386'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'IsArchived')
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
            'cdef6224-4a6a-4ea1-8e96-55cf116f5386',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100008,
            'IsArchived',
            'Is Archived',
            'Indicates if this project is archived and should be hidden from active lists',
            'bit',
            1,
            1,
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
         WHERE ID = '683747e6-a361-4ab7-9d40-88b11531fdbe'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = '__mj_CreatedAt')
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
            '683747e6-a361-4ab7-9d40-88b11531fdbe',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100009,
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
         WHERE ID = '7ae293ed-445e-49d8-bb4b-13bd896d02ca'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = '__mj_UpdatedAt')
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
            '7ae293ed-445e-49d8-bb4b-13bd896d02ca',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100010,
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
         WHERE ID = '6b6bfb96-d6c3-4254-b9f5-28b306ad48dd'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'ID')
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
            '6b6bfb96-d6c3-4254-b9f5-28b306ad48dd',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100001,
            'ID',
            'ID',
            NULL,
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
         WHERE ID = 'e986c32b-9789-46b1-88ed-a1684050e6ab'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'ArtifactID')
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
            'e986c32b-9789-46b1-88ed-a1684050e6ab',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100002,
            'ArtifactID',
            'Artifact ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD',
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
         WHERE ID = '9c2b8b64-f592-4bfd-8ed4-e0488c042a5d'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'VersionNumber')
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
            '9c2b8b64-f592-4bfd-8ed4-e0488c042a5d',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100003,
            'VersionNumber',
            'Version Number',
            'Sequential version number for this artifact',
            'int',
            4,
            10,
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a5d391b2-7945-448e-980a-93c5a2549a65'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'Content')
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
            'a5d391b2-7945-448e-980a-93c5a2549a65',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100004,
            'Content',
            'Content',
            'The content of the artifact at this version',
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
         WHERE ID = 'a3bdf038-3da1-4088-a57f-9656c95cfaa8'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'Configuration')
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
            'a3bdf038-3da1-4088-a57f-9656c95cfaa8',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100005,
            'Configuration',
            'Configuration',
            'JSON configuration for this version',
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
         WHERE ID = 'a2524c0a-5778-4d42-b468-8e6026ecc3bb'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'Comments')
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
            'a2524c0a-5778-4d42-b468-8e6026ecc3bb',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100006,
            'Comments',
            'Comments',
            'User comments specific to this version',
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
         WHERE ID = '84fa642f-f570-4b31-978b-32e786ca429a'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'UserID')
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
            '84fa642f-f570-4b31-978b-32e786ca429a',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100007,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '9c004e0e-12a3-47eb-9e7a-6a306e1868d4'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = '__mj_CreatedAt')
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
            '9c004e0e-12a3-47eb-9e7a-6a306e1868d4',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
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
         WHERE ID = '2f378b93-c2a0-47a2-af7a-7e77c5461e6f'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = '__mj_UpdatedAt')
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
            '2f378b93-c2a0-47a2-af7a-7e77c5461e6f',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
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

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7968EF88-8296-4531-A1D7-FC15D0B17D3E', 1, 'User', 'User')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7968EF88-8296-4531-A1D7-FC15D0B17D3E', 2, 'Role', 'Role')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7968EF88-8296-4531-A1D7-FC15D0B17D3E', 3, 'Everyone', 'Everyone')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7968EF88-8296-4531-A1D7-FC15D0B17D3E', 4, 'Public', 'Public')

/* SQL text to update ValueListType for entity field ID 7968EF88-8296-4531-A1D7-FC15D0B17D3E */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7968EF88-8296-4531-A1D7-FC15D0B17D3E'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A5CF400A-ABA4-4AE3-A36A-988559E8C13E', 1, 'Artifact', 'Artifact')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A5CF400A-ABA4-4AE3-A36A-988559E8C13E', 2, 'Conversation', 'Conversation')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A5CF400A-ABA4-4AE3-A36A-988559E8C13E', 3, 'Collection', 'Collection')

/* SQL text to update ValueListType for entity field ID A5CF400A-ABA4-4AE3-A36A-988559E8C13E */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A5CF400A-ABA4-4AE3-A36A-988559E8C13E'

/* SQL text to delete entity field value ID 71C6433E-F36B-1410-8DC6-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='71C6433E-F36B-1410-8DC6-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='7FC8433E-F36B-1410-8DC6-00021F8B792E'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9320E9C7-764E-401B-BF2D-A07358E4DD00', 1, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9320E9C7-764E-401B-BF2D-A07358E4DD00', 2, 'In Progress', 'In Progress')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9320E9C7-764E-401B-BF2D-A07358E4DD00', 3, 'Complete', 'Complete')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9320E9C7-764E-401B-BF2D-A07358E4DD00', 4, 'Cancelled', 'Cancelled')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9320E9C7-764E-401B-BF2D-A07358E4DD00', 5, 'Failed', 'Failed')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9320E9C7-764E-401B-BF2D-A07358E4DD00', 6, 'Blocked', 'Blocked')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9320E9C7-764E-401B-BF2D-A07358E4DD00', 7, 'Deferred', 'Deferred')

/* SQL text to update ValueListType for entity field ID 9320E9C7-764E-401B-BF2D-A07358E4DD00 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9320E9C7-764E-401B-BF2D-A07358E4DD00'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9AEC13B1-8C8B-4AF0-BA96-DD5E70BAA4E8', 1, 'Prerequisite', 'Prerequisite')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9AEC13B1-8C8B-4AF0-BA96-DD5E70BAA4E8', 2, 'Corequisite', 'Corequisite')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9AEC13B1-8C8B-4AF0-BA96-DD5E70BAA4E8', 3, 'Optional', 'Optional')

/* SQL text to update ValueListType for entity field ID 9AEC13B1-8C8B-4AF0-BA96-DD5E70BAA4E8 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9AEC13B1-8C8B-4AF0-BA96-DD5E70BAA4E8'

/* SQL text to delete entity field value ID 8FC6433E-F36B-1410-8DC6-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='8FC6433E-F36B-1410-8DC6-00021F8B792E'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c6e57d9d-acca-4e43-85fd-42ca2f87c212'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c6e57d9d-acca-4e43-85fd-42ca2f87c212', '7BD06B14-122D-426E-A796-1DBE64FA4F60', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'TypeID', 'One To Many', 1, 1, 'MJ: Tasks', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '62ff1da5-afe3-40b2-a875-6572d97e0722'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('62ff1da5-afe3-40b2-a875-6572d97e0722', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'AgentID', 'One To Many', 1, 1, 'MJ: Tasks', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '981a9511-c0de-4364-a209-5859c43b5d74'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('981a9511-c0de-4364-a209-5859c43b5d74', '72975471-6AAB-45C6-B58A-3F1115C921C3', 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', 'EnvironmentID', 'One To Many', 1, 1, 'MJ: Collections', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a21366ca-269a-4893-890f-f0a6c64443da'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a21366ca-269a-4893-890f-f0a6c64443da', '72975471-6AAB-45C6-B58A-3F1115C921C3', '05248F34-2837-EF11-86D4-6045BDEE16E6', 'EnvironmentID', 'One To Many', 1, 1, 'Dashboards', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '72508be5-c41f-4266-8e02-299fa8a5c38e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('72508be5-c41f-4266-8e02-299fa8a5c38e', '72975471-6AAB-45C6-B58A-3F1115C921C3', '09248F34-2837-EF11-86D4-6045BDEE16E6', 'EnvironmentID', 'One To Many', 1, 1, 'Reports', 4);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd864f0b4-4853-4557-9a9b-8fb9975a276a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d864f0b4-4853-4557-9a9b-8fb9975a276a', '72975471-6AAB-45C6-B58A-3F1115C921C3', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'EnvironmentID', 'One To Many', 1, 1, 'Conversations', 5);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '72ce141b-638b-46f0-a384-1273f6a3d27a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('72ce141b-638b-46f0-a384-1273f6a3d27a', '72975471-6AAB-45C6-B58A-3F1115C921C3', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', 'EnvironmentID', 'One To Many', 1, 1, 'MJ: Projects', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '273583ae-f677-4369-8c07-b149046a412e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('273583ae-f677-4369-8c07-b149046a412e', '72975471-6AAB-45C6-B58A-3F1115C921C3', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'EnvironmentID', 'One To Many', 1, 1, 'MJ: Tasks', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6cb17f83-2d1c-45fc-934b-e3140d1ed47b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6cb17f83-2d1c-45fc-934b-e3140d1ed47b', '72975471-6AAB-45C6-B58A-3F1115C921C3', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', 'EnvironmentID', 'One To Many', 1, 1, 'MJ: Artifacts', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a08332f4-1fe2-42ce-bdd9-b50f3cbcacf1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a08332f4-1fe2-42ce-bdd9-b50f3cbcacf1', 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', 'ParentID', 'One To Many', 1, 1, 'MJ: Collections', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '508f99ba-9b64-42c4-81d6-e91ff88e9767'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('508f99ba-9b64-42c4-81d6-e91ff88e9767', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E26C7855-B778-44F4-A110-56EFEE4F843B', 'SourceEntityID', 'One To Many', 1, 1, 'MJ: Record Links', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '48c5803e-b13b-4d36-a64c-c76a8fc4dba2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('48c5803e-b13b-4d36-a64c-c76a8fc4dba2', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E26C7855-B778-44F4-A110-56EFEE4F843B', 'TargetEntityID', 'One To Many', 1, 1, 'MJ: Record Links', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '79e0004f-2f34-448e-ac29-61028b14ba78'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('79e0004f-2f34-448e-ac29-61028b14ba78', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', 'EntityID', 'One To Many', 1, 1, 'MJ: Access Control Rules', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'da8a7f0d-9166-409f-9930-a74d7d16a64c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('da8a7f0d-9166-409f-9930-a74d7d16a64c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', 'GrantedByUserID', 'One To Many', 1, 1, 'MJ: Access Control Rules', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'fb74b6ea-8450-4d54-919b-d6f799579fe5'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('fb74b6ea-8450-4d54-919b-d6f799579fe5', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '6BAB48BD-F197-4737-93A6-8081BBBAEB30', 'UserID', 'One To Many', 1, 1, 'MJ: Public Links', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c68a0fbc-a51f-4a51-90b0-a77352c8793d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c68a0fbc-a51f-4a51-90b0-a77352c8793d', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', 'UserID', 'One To Many', 1, 1, 'MJ: Artifacts', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '42303406-d2c5-4d03-92d8-7e3d062879e3'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('42303406-d2c5-4d03-92d8-7e3d062879e3', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'UserID', 'One To Many', 1, 1, 'MJ: Tasks', 4);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '08b41a0a-ae96-4f49-92f9-04d90bb73d14'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('08b41a0a-ae96-4f49-92f9-04d90bb73d14', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'UserID', 'One To Many', 1, 1, 'MJ: Artifact Versions', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '739c4b09-6b00-461d-906a-7b8ce34d0817'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('739c4b09-6b00-461d-906a-7b8ce34d0817', '12248F34-2837-EF11-86D4-6045BDEE16E6', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'ConversationDetailID', 'One To Many', 1, 1, 'MJ: Tasks', 5);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '59a499cb-2d46-4682-bf7e-20609850383c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('59a499cb-2d46-4682-bf7e-20609850383c', '91797885-7128-4B71-8C4B-81C5FEE24F38', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', 'TypeID', 'One To Many', 1, 1, 'MJ: Artifacts', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'cefd0e2a-2eef-4bcc-a0f2-61505b958579'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('cefd0e2a-2eef-4bcc-a0f2-61505b958579', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'ArtifactID', 'One To Many', 1, 1, 'MJ: Artifact Versions', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '73bef103-b0af-48dd-9c42-a9bd33e130cd'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('73bef103-b0af-48dd-9c42-a9bd33e130cd', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'ParentID', 'One To Many', 1, 1, 'MJ: Tasks', 6);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd356eca0-d245-4088-8727-bff97a3ab60f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d356eca0-d245-4088-8727-bff97a3ab60f', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', 'DependsOnTaskID', 'One To Many', 1, 1, 'MJ: Task Dependencies', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '3b41f196-2565-4e06-8c4b-1595c33af364'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('3b41f196-2565-4e06-8c4b-1595c33af364', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', 'TaskID', 'One To Many', 1, 1, 'MJ: Task Dependencies', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8d09ba44-04e2-4d55-a98c-c3b47e3dda63'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8d09ba44-04e2-4d55-a98c-c3b47e3dda63', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'ProjectID', 'One To Many', 1, 1, 'Conversations', 6);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2e7378fa-048e-42ac-89e3-a3a8e682c142'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2e7378fa-048e-42ac-89e3-a3a8e682c142', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'ProjectID', 'One To Many', 1, 1, 'MJ: Tasks', 7);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4480725a-8349-4eba-9a30-65c71dba9e3e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4480725a-8349-4eba-9a30-65c71dba9e3e', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', 'ParentID', 'One To Many', 1, 1, 'MJ: Projects', 2);
   END
                              

/* Index for Foreign Keys for TaskType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Task Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Types
-- Item: vwTaskTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Task Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TaskType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwTaskTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTaskTypes]
AS
SELECT
    t.*
FROM
    [${flyway:defaultSchema}].[TaskType] AS t
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTaskTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Task Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Types
-- Item: Permissions for vwTaskTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTaskTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Task Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Types
-- Item: spCreateTaskType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaskType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateTaskType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTaskType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TaskType]
            (
                [ID],
                [Name],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TaskType]
            (
                [Name],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTaskTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaskType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Task Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaskType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Task Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Types
-- Item: spUpdateTaskType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaskType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateTaskType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTaskType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaskType]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTaskTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTaskTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaskType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TaskType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateTaskType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTaskType
ON [${flyway:defaultSchema}].[TaskType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaskType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TaskType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Task Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaskType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Task Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Types
-- Item: spDeleteTaskType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaskType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteTaskType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTaskType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TaskType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaskType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Task Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaskType] TO [cdp_Integration]



/* Index for Foreign Keys for Environment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Environments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Environments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Environments
-- Item: vwEnvironments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Environments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Environment
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwEnvironments]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEnvironments]
AS
SELECT
    e.*
FROM
    [${flyway:defaultSchema}].[Environment] AS e
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEnvironments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Environments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Environments
-- Item: Permissions for vwEnvironments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEnvironments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Environments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Environments
-- Item: spCreateEnvironment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Environment
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEnvironment]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEnvironment]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Settings nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Environment]
            (
                [ID],
                [Name],
                [Description],
                [IsDefault],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @IsDefault,
                @Settings
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Environment]
            (
                [Name],
                [Description],
                [IsDefault],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @IsDefault,
                @Settings
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEnvironments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEnvironment] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Environments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEnvironment] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Environments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Environments
-- Item: spUpdateEnvironment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Environment
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEnvironment]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEnvironment]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Settings nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Environment]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [IsDefault] = @IsDefault,
        [Settings] = @Settings
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEnvironments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEnvironments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEnvironment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Environment table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEnvironment
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEnvironment
ON [${flyway:defaultSchema}].[Environment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Environment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Environment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Environments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEnvironment] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Environments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Environments
-- Item: spDeleteEnvironment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Environment
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEnvironment]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEnvironment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Environment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEnvironment] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Environments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEnvironment] TO [cdp_Integration]



/* Index for Foreign Keys for TaskDependency */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TaskID in table TaskDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaskDependency_TaskID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaskDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaskDependency_TaskID ON [${flyway:defaultSchema}].[TaskDependency] ([TaskID]);

-- Index for foreign key DependsOnTaskID in table TaskDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaskDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID ON [${flyway:defaultSchema}].[TaskDependency] ([DependsOnTaskID]);

/* SQL text to update entity field related entity name field map for entity field ID BB9353EF-735C-4D86-9C5B-110CE8580BF9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BB9353EF-735C-4D86-9C5B-110CE8580BF9',
         @RelatedEntityNameFieldMap='Task'

/* Index for Foreign Keys for Collection */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Collection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Collection_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Collection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Collection_EnvironmentID ON [${flyway:defaultSchema}].[Collection] ([EnvironmentID]);

-- Index for foreign key ParentID in table Collection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Collection_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Collection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Collection_ParentID ON [${flyway:defaultSchema}].[Collection] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID 4CEDD6F4-E491-4596-A1FD-376BE7B46653 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4CEDD6F4-E491-4596-A1FD-376BE7B46653',
         @RelatedEntityNameFieldMap='Environment'

/* Index for Foreign Keys for RecordLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceEntityID in table RecordLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordLink_SourceEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordLink_SourceEntityID ON [${flyway:defaultSchema}].[RecordLink] ([SourceEntityID]);

-- Index for foreign key TargetEntityID in table RecordLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordLink_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordLink_TargetEntityID ON [${flyway:defaultSchema}].[RecordLink] ([TargetEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID DEC6FDD2-85A6-4FDD-89BC-BEE8B1F1763C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DEC6FDD2-85A6-4FDD-89BC-BEE8B1F1763C',
         @RelatedEntityNameFieldMap='SourceEntity'

/* SQL text to update entity field related entity name field map for entity field ID EEDB84F8-4CD3-4215-A0BD-25960C71A322 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EEDB84F8-4CD3-4215-A0BD-25960C71A322',
         @RelatedEntityNameFieldMap='TargetEntity'

/* SQL text to update entity field related entity name field map for entity field ID 9233F1DA-6E87-4662-80B2-4227F37CE3DC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9233F1DA-6E87-4662-80B2-4227F37CE3DC',
         @RelatedEntityNameFieldMap='DependsOnTask'

/* SQL text to update entity field related entity name field map for entity field ID A02FB0C6-112A-4895-A461-F3C3872A095C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A02FB0C6-112A-4895-A461-F3C3872A095C',
         @RelatedEntityNameFieldMap='Parent'

/* Base View SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: vwCollections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Collections
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Collection
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwCollections]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCollections]
AS
SELECT
    c.*,
    Environment_EnvironmentID.[Name] AS [Environment],
    Collection_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[Collection] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [c].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Collection] AS Collection_ParentID
  ON
    [c].[ParentID] = Collection_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCollections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: Permissions for vwCollections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCollections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spCreateCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Collection
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateCollection]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCollection]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Icon nvarchar(50),
    @Color nvarchar(7),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Collection]
            (
                [ID],
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Icon],
                [Color],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ParentID,
                @Name,
                @Description,
                @Icon,
                @Color,
                @Sequence
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Collection]
            (
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Icon],
                [Color],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ParentID,
                @Name,
                @Description,
                @Icon,
                @Color,
                @Sequence
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCollections] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollection] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollection] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spUpdateCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Collection
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateCollection]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCollection]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Icon nvarchar(50),
    @Color nvarchar(7),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Collection]
    SET
        [EnvironmentID] = @EnvironmentID,
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [Color] = @Color,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCollections] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCollections]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollection] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Collection table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateCollection
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCollection
ON [${flyway:defaultSchema}].[Collection]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Collection]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Collection] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollection] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spDeleteCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Collection
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteCollection]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCollection]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Collection]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollection] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollection] TO [cdp_Integration]



/* Base View SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: vwTaskDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Task Dependencies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TaskDependency
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwTaskDependencies]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTaskDependencies]
AS
SELECT
    t.*,
    Task_TaskID.[Name] AS [Task],
    Task_DependsOnTaskID.[Name] AS [DependsOnTask]
FROM
    [${flyway:defaultSchema}].[TaskDependency] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Task] AS Task_TaskID
  ON
    [t].[TaskID] = Task_TaskID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Task] AS Task_DependsOnTaskID
  ON
    [t].[DependsOnTaskID] = Task_DependsOnTaskID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTaskDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Permissions for vwTaskDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTaskDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spCreateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaskDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateTaskDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTaskDependency]
    @ID uniqueidentifier = NULL,
    @TaskID uniqueidentifier,
    @DependsOnTaskID uniqueidentifier,
    @DependencyType nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TaskDependency]
            (
                [ID],
                [TaskID],
                [DependsOnTaskID],
                [DependencyType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TaskID,
                @DependsOnTaskID,
                @DependencyType
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TaskDependency]
            (
                [TaskID],
                [DependsOnTaskID],
                [DependencyType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TaskID,
                @DependsOnTaskID,
                @DependencyType
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTaskDependencies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaskDependency] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaskDependency] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spUpdateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaskDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateTaskDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTaskDependency]
    @ID uniqueidentifier,
    @TaskID uniqueidentifier,
    @DependsOnTaskID uniqueidentifier,
    @DependencyType nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaskDependency]
    SET
        [TaskID] = @TaskID,
        [DependsOnTaskID] = @DependsOnTaskID,
        [DependencyType] = @DependencyType
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTaskDependencies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTaskDependencies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaskDependency] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TaskDependency table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateTaskDependency
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTaskDependency
ON [${flyway:defaultSchema}].[TaskDependency]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaskDependency]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TaskDependency] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaskDependency] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spDeleteTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaskDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteTaskDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTaskDependency]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TaskDependency]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaskDependency] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaskDependency] TO [cdp_Integration]



/* Base View SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: vwRecordLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwRecordLinks]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordLinks]
AS
SELECT
    r.*,
    Entity_SourceEntityID.[Name] AS [SourceEntity],
    Entity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[RecordLink] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_SourceEntityID
  ON
    [r].[SourceEntityID] = Entity_SourceEntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_TargetEntityID
  ON
    [r].[TargetEntityID] = Entity_TargetEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: Permissions for vwRecordLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: spCreateRecordLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateRecordLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordLink]
    @ID uniqueidentifier = NULL,
    @SourceEntityID uniqueidentifier,
    @SourceRecordID nvarchar(500),
    @TargetEntityID uniqueidentifier,
    @TargetRecordID nvarchar(500),
    @LinkType nvarchar(50),
    @Sequence int,
    @Metadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordLink]
            (
                [ID],
                [SourceEntityID],
                [SourceRecordID],
                [TargetEntityID],
                [TargetRecordID],
                [LinkType],
                [Sequence],
                [Metadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SourceEntityID,
                @SourceRecordID,
                @TargetEntityID,
                @TargetRecordID,
                @LinkType,
                @Sequence,
                @Metadata
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordLink]
            (
                [SourceEntityID],
                [SourceRecordID],
                [TargetEntityID],
                [TargetRecordID],
                [LinkType],
                [Sequence],
                [Metadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SourceEntityID,
                @SourceRecordID,
                @TargetEntityID,
                @TargetRecordID,
                @LinkType,
                @Sequence,
                @Metadata
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordLink] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Record Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordLink] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: spUpdateRecordLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateRecordLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordLink]
    @ID uniqueidentifier,
    @SourceEntityID uniqueidentifier,
    @SourceRecordID nvarchar(500),
    @TargetEntityID uniqueidentifier,
    @TargetRecordID nvarchar(500),
    @LinkType nvarchar(50),
    @Sequence int,
    @Metadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordLink]
    SET
        [SourceEntityID] = @SourceEntityID,
        [SourceRecordID] = @SourceRecordID,
        [TargetEntityID] = @TargetEntityID,
        [TargetRecordID] = @TargetRecordID,
        [LinkType] = @LinkType,
        [Sequence] = @Sequence,
        [Metadata] = @Metadata
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordLink table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateRecordLink
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordLink
ON [${flyway:defaultSchema}].[RecordLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Record Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordLink] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: spDeleteRecordLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteRecordLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordLink] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Record Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordLink] TO [cdp_Integration]



/* Index for Foreign Keys for EntityRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([RelatedEntityID]);

-- Index for foreign key DisplayUserViewID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayUserViewID]);

-- Index for foreign key DisplayComponentID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayComponentID]);

/* Base View Permissions SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Permissions for vwEntityRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRelationships] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spCreateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [ID],
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @Sequence,
                @RelatedEntityID,
                @BundleInAPI,
                @IncludeInParentAllQuery,
                @Type,
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                @DisplayInForm,
                @DisplayLocation,
                @DisplayName,
                @DisplayIconType,
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                @AutoUpdateFromSchema
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @Sequence,
                @RelatedEntityID,
                @BundleInAPI,
                @IncludeInParentAllQuery,
                @Type,
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                @DisplayInForm,
                @DisplayLocation,
                @DisplayName,
                @DisplayIconType,
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                @AutoUpdateFromSchema
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spUpdateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration,
        [AutoUpdateFromSchema] = @AutoUpdateFromSchema
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityRelationship
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRelationship
ON [${flyway:defaultSchema}].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for Dashboard */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_UserID ON [${flyway:defaultSchema}].[Dashboard] ([UserID]);

-- Index for foreign key CategoryID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_CategoryID ON [${flyway:defaultSchema}].[Dashboard] ([CategoryID]);

-- Index for foreign key ApplicationID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID ON [${flyway:defaultSchema}].[Dashboard] ([ApplicationID]);

-- Index for foreign key EnvironmentID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_EnvironmentID ON [${flyway:defaultSchema}].[Dashboard] ([EnvironmentID]);

/* SQL text to update entity field related entity name field map for entity field ID ACEB96BD-5A2F-47B7-8D5E-85E3C9E6C397 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ACEB96BD-5A2F-47B7-8D5E-85E3C9E6C397',
         @RelatedEntityNameFieldMap='Environment'

/* Base View SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dashboards
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Dashboard
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDashboards]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboards]
AS
SELECT
    d.*,
    User_UserID.[Name] AS [User],
    DashboardCategory_CategoryID.[Name] AS [Category],
    Application_ApplicationID.[Name] AS [Application],
    Environment_EnvironmentID.[Name] AS [Environment]
FROM
    [${flyway:defaultSchema}].[Dashboard] AS d
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DashboardCategory] AS DashboardCategory_CategoryID
  ON
    [d].[CategoryID] = DashboardCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Application] AS Application_ApplicationID
  ON
    [d].[ApplicationID] = Application_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [d].[EnvironmentID] = Environment_EnvironmentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Permissions for vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spCreateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboard]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @DriverClass nvarchar(255),
    @Code nvarchar(255),
    @EnvironmentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Dashboard]
            (
                [ID],
                [Name],
                [Description],
                [UserID],
                [CategoryID],
                [UIConfigDetails],
                [Type],
                [Thumbnail],
                [Scope],
                [ApplicationID],
                [DriverClass],
                [Code],
                [EnvironmentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @UserID,
                @CategoryID,
                @UIConfigDetails,
                @Type,
                @Thumbnail,
                @Scope,
                @ApplicationID,
                @DriverClass,
                @Code,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Dashboard]
            (
                [Name],
                [Description],
                [UserID],
                [CategoryID],
                [UIConfigDetails],
                [Type],
                [Thumbnail],
                [Scope],
                [ApplicationID],
                [DriverClass],
                [Code],
                [EnvironmentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @UserID,
                @CategoryID,
                @UIConfigDetails,
                @Type,
                @Thumbnail,
                @Scope,
                @ApplicationID,
                @DriverClass,
                @Code,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboards] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spUpdateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboard]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @DriverClass nvarchar(255),
    @Code nvarchar(255),
    @EnvironmentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [CategoryID] = @CategoryID,
        [UIConfigDetails] = @UIConfigDetails,
        [Type] = @Type,
        [Thumbnail] = @Thumbnail,
        [Scope] = @Scope,
        [ApplicationID] = @ApplicationID,
        [DriverClass] = @DriverClass,
        [Code] = @Code,
        [EnvironmentID] = @EnvironmentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDashboards] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboards]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Dashboard table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateDashboard
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboard
ON [${flyway:defaultSchema}].[Dashboard]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Dashboard] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spDeleteDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboard]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Dashboard]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Index for Foreign Keys for Report */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_CategoryID ON [${flyway:defaultSchema}].[Report] ([CategoryID]);

-- Index for foreign key UserID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_UserID ON [${flyway:defaultSchema}].[Report] ([UserID]);

-- Index for foreign key ConversationID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_ConversationID ON [${flyway:defaultSchema}].[Report] ([ConversationID]);

-- Index for foreign key ConversationDetailID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_ConversationDetailID ON [${flyway:defaultSchema}].[Report] ([ConversationDetailID]);

-- Index for foreign key DataContextID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_DataContextID ON [${flyway:defaultSchema}].[Report] ([DataContextID]);

-- Index for foreign key OutputTriggerTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID ON [${flyway:defaultSchema}].[Report] ([OutputTriggerTypeID]);

-- Index for foreign key OutputFormatTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID ON [${flyway:defaultSchema}].[Report] ([OutputFormatTypeID]);

-- Index for foreign key OutputDeliveryTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID ON [${flyway:defaultSchema}].[Report] ([OutputDeliveryTypeID]);

-- Index for foreign key OutputWorkflowID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID ON [${flyway:defaultSchema}].[Report] ([OutputWorkflowID]);

-- Index for foreign key EnvironmentID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_EnvironmentID ON [${flyway:defaultSchema}].[Report] ([EnvironmentID]);

/* SQL text to update entity field related entity name field map for entity field ID 257FFE0E-EC6F-441B-8039-3A17B44FF4FB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='257FFE0E-EC6F-441B-8039-3A17B44FF4FB',
         @RelatedEntityNameFieldMap='Environment'

/* Base View SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Reports
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Report
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReports]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReports]
AS
SELECT
    r.*,
    ReportCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User],
    Conversation_ConversationID.[Name] AS [Conversation],
    DataContext_DataContextID.[Name] AS [DataContext],
    OutputTriggerType_OutputTriggerTypeID.[Name] AS [OutputTriggerType],
    OutputFormatType_OutputFormatTypeID.[Name] AS [OutputFormatType],
    OutputDeliveryType_OutputDeliveryTypeID.[Name] AS [OutputDeliveryType],
    Workflow_OutputWorkflowID.[Name] AS [OutputWorkflow],
    Environment_EnvironmentID.[Name] AS [Environment]
FROM
    [${flyway:defaultSchema}].[Report] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ReportCategory] AS ReportCategory_CategoryID
  ON
    [r].[CategoryID] = ReportCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [r].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [r].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputTriggerType] AS OutputTriggerType_OutputTriggerTypeID
  ON
    [r].[OutputTriggerTypeID] = OutputTriggerType_OutputTriggerTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputFormatType] AS OutputFormatType_OutputFormatTypeID
  ON
    [r].[OutputFormatTypeID] = OutputFormatType_OutputFormatTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputDeliveryType] AS OutputDeliveryType_OutputDeliveryTypeID
  ON
    [r].[OutputDeliveryTypeID] = OutputDeliveryType_OutputDeliveryTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Workflow] AS Workflow_OutputWorkflowID
  ON
    [r].[OutputWorkflowID] = Workflow_OutputWorkflowID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [r].[EnvironmentID] = Environment_EnvironmentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReports] TO [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: Permissions for vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReports] TO [cdp_Developer], [cdp_UI]

/* spCreate SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spCreateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReport]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier,
    @Thumbnail nvarchar(MAX),
    @EnvironmentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Report]
            (
                [ID],
                [Name],
                [Description],
                [CategoryID],
                [UserID],
                [SharingScope],
                [ConversationID],
                [ConversationDetailID],
                [DataContextID],
                [Configuration],
                [OutputTriggerTypeID],
                [OutputFormatTypeID],
                [OutputDeliveryTypeID],
                [OutputFrequency],
                [OutputTargetEmail],
                [OutputWorkflowID],
                [Thumbnail],
                [EnvironmentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @CategoryID,
                @UserID,
                @SharingScope,
                @ConversationID,
                @ConversationDetailID,
                @DataContextID,
                @Configuration,
                @OutputTriggerTypeID,
                @OutputFormatTypeID,
                @OutputDeliveryTypeID,
                @OutputFrequency,
                @OutputTargetEmail,
                @OutputWorkflowID,
                @Thumbnail,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Report]
            (
                [Name],
                [Description],
                [CategoryID],
                [UserID],
                [SharingScope],
                [ConversationID],
                [ConversationDetailID],
                [DataContextID],
                [Configuration],
                [OutputTriggerTypeID],
                [OutputFormatTypeID],
                [OutputDeliveryTypeID],
                [OutputFrequency],
                [OutputTargetEmail],
                [OutputWorkflowID],
                [Thumbnail],
                [EnvironmentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @CategoryID,
                @UserID,
                @SharingScope,
                @ConversationID,
                @ConversationDetailID,
                @DataContextID,
                @Configuration,
                @OutputTriggerTypeID,
                @OutputFormatTypeID,
                @OutputDeliveryTypeID,
                @OutputFrequency,
                @OutputTargetEmail,
                @OutputWorkflowID,
                @Thumbnail,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReports] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReport] TO [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReport] TO [cdp_Developer], [cdp_UI]



/* spUpdate SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spUpdateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReport]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier,
    @Thumbnail nvarchar(MAX),
    @EnvironmentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserID] = @UserID,
        [SharingScope] = @SharingScope,
        [ConversationID] = @ConversationID,
        [ConversationDetailID] = @ConversationDetailID,
        [DataContextID] = @DataContextID,
        [Configuration] = @Configuration,
        [OutputTriggerTypeID] = @OutputTriggerTypeID,
        [OutputFormatTypeID] = @OutputFormatTypeID,
        [OutputDeliveryTypeID] = @OutputDeliveryTypeID,
        [OutputFrequency] = @OutputFrequency,
        [OutputTargetEmail] = @OutputTargetEmail,
        [OutputWorkflowID] = @OutputWorkflowID,
        [Thumbnail] = @Thumbnail,
        [EnvironmentID] = @EnvironmentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwReports] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReports]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReport] TO [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Report table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReport
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReport
ON [${flyway:defaultSchema}].[Report]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Report] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReport] TO [cdp_Developer], [cdp_UI]



/* spDelete SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spDeleteReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReport]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ReportSnapshot using cursor to call spDeleteReportSnapshot
    DECLARE @ReportSnapshotsID uniqueidentifier
    DECLARE cascade_delete_ReportSnapshots_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ReportSnapshot]
        WHERE [ReportID] = @ID
    
    OPEN cascade_delete_ReportSnapshots_cursor
    FETCH NEXT FROM cascade_delete_ReportSnapshots_cursor INTO @ReportSnapshotsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteReportSnapshot] @ID = @ReportSnapshotsID
        
        FETCH NEXT FROM cascade_delete_ReportSnapshots_cursor INTO @ReportSnapshotsID
    END
    
    CLOSE cascade_delete_ReportSnapshots_cursor
    DEALLOCATE cascade_delete_ReportSnapshots_cursor
    
    -- Cascade delete from ReportUserState using cursor to call spDeleteReportUserState
    DECLARE @MJ_ReportUserStatesID uniqueidentifier
    DECLARE cascade_delete_MJ_ReportUserStates_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ReportUserState]
        WHERE [ReportID] = @ID
    
    OPEN cascade_delete_MJ_ReportUserStates_cursor
    FETCH NEXT FROM cascade_delete_MJ_ReportUserStates_cursor INTO @MJ_ReportUserStatesID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteReportUserState] @ID = @MJ_ReportUserStatesID
        
        FETCH NEXT FROM cascade_delete_MJ_ReportUserStates_cursor INTO @MJ_ReportUserStatesID
    END
    
    CLOSE cascade_delete_MJ_ReportUserStates_cursor
    DEALLOCATE cascade_delete_MJ_ReportUserStates_cursor
    
    -- Cascade delete from ReportVersion using cursor to call spDeleteReportVersion
    DECLARE @MJ_ReportVersionsID uniqueidentifier
    DECLARE cascade_delete_MJ_ReportVersions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ReportVersion]
        WHERE [ReportID] = @ID
    
    OPEN cascade_delete_MJ_ReportVersions_cursor
    FETCH NEXT FROM cascade_delete_MJ_ReportVersions_cursor INTO @MJ_ReportVersionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteReportVersion] @ID = @MJ_ReportVersionsID
        
        FETCH NEXT FROM cascade_delete_MJ_ReportVersions_cursor INTO @MJ_ReportVersionsID
    END
    
    CLOSE cascade_delete_MJ_ReportVersions_cursor
    DEALLOCATE cascade_delete_MJ_ReportVersions_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Report]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReport] TO [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReport] TO [cdp_Developer], [cdp_UI]



/* SQL text to update entity field related entity name field map for entity field ID 20C0433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='20C0433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID ADC0433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ADC0433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 3CC0433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3CC0433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID B1C0433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B1C0433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 43C0433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='43C0433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for AccessControlRule */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table AccessControlRule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AccessControlRule_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AccessControlRule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AccessControlRule_EntityID ON [${flyway:defaultSchema}].[AccessControlRule] ([EntityID]);

-- Index for foreign key GrantedByUserID in table AccessControlRule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AccessControlRule_GrantedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AccessControlRule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AccessControlRule_GrantedByUserID ON [${flyway:defaultSchema}].[AccessControlRule] ([GrantedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 36C6E83F-6D89-48D5-9565-E308376E923E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='36C6E83F-6D89-48D5-9565-E308376E923E',
         @RelatedEntityNameFieldMap='Entity'

/* Index for Foreign Keys for PublicLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table PublicLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PublicLink_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PublicLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PublicLink_UserID ON [${flyway:defaultSchema}].[PublicLink] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID E85CE376-FF29-40F1-B066-DEAE2A041A17 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E85CE376-FF29-40F1-B066-DEAE2A041A17',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 8DD2C71D-3EFE-4613-8235-949C42AB617A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8DD2C71D-3EFE-4613-8235-949C42AB617A',
         @RelatedEntityNameFieldMap='GrantedByUser'

/* Base View SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: vwPublicLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Public Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PublicLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwPublicLinks]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPublicLinks]
AS
SELECT
    p.*,
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[PublicLink] AS p
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [p].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPublicLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: Permissions for vwPublicLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPublicLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: spCreatePublicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PublicLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreatePublicLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePublicLink]
    @ID uniqueidentifier = NULL,
    @ResourceType nvarchar(50),
    @ResourceID uniqueidentifier,
    @Token nvarchar(255),
    @PasswordHash nvarchar(255),
    @ExpiresAt datetimeoffset,
    @MaxViews int,
    @CurrentViews int,
    @UserID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PublicLink]
            (
                [ID],
                [ResourceType],
                [ResourceID],
                [Token],
                [PasswordHash],
                [ExpiresAt],
                [MaxViews],
                [CurrentViews],
                [UserID],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ResourceType,
                @ResourceID,
                @Token,
                @PasswordHash,
                @ExpiresAt,
                @MaxViews,
                @CurrentViews,
                @UserID,
                @IsActive
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PublicLink]
            (
                [ResourceType],
                [ResourceID],
                [Token],
                [PasswordHash],
                [ExpiresAt],
                [MaxViews],
                [CurrentViews],
                [UserID],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ResourceType,
                @ResourceID,
                @Token,
                @PasswordHash,
                @ExpiresAt,
                @MaxViews,
                @CurrentViews,
                @UserID,
                @IsActive
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPublicLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePublicLink] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Public Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePublicLink] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: spUpdatePublicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PublicLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdatePublicLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePublicLink]
    @ID uniqueidentifier,
    @ResourceType nvarchar(50),
    @ResourceID uniqueidentifier,
    @Token nvarchar(255),
    @PasswordHash nvarchar(255),
    @ExpiresAt datetimeoffset,
    @MaxViews int,
    @CurrentViews int,
    @UserID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PublicLink]
    SET
        [ResourceType] = @ResourceType,
        [ResourceID] = @ResourceID,
        [Token] = @Token,
        [PasswordHash] = @PasswordHash,
        [ExpiresAt] = @ExpiresAt,
        [MaxViews] = @MaxViews,
        [CurrentViews] = @CurrentViews,
        [UserID] = @UserID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPublicLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPublicLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePublicLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PublicLink table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdatePublicLink
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePublicLink
ON [${flyway:defaultSchema}].[PublicLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PublicLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PublicLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Public Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePublicLink] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: spDeletePublicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PublicLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeletePublicLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePublicLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PublicLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePublicLink] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Public Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePublicLink] TO [cdp_Integration]



/* Base View SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: vwAccessControlRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Access Control Rules
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AccessControlRule
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAccessControlRules]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAccessControlRules]
AS
SELECT
    a.*,
    Entity_EntityID.[Name] AS [Entity],
    User_GrantedByUserID.[Name] AS [GrantedByUser]
FROM
    [${flyway:defaultSchema}].[AccessControlRule] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [a].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_GrantedByUserID
  ON
    [a].[GrantedByUserID] = User_GrantedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAccessControlRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: Permissions for vwAccessControlRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAccessControlRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: spCreateAccessControlRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AccessControlRule
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAccessControlRule]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAccessControlRule]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(500),
    @GranteeType nvarchar(50),
    @GranteeID uniqueidentifier,
    @CanRead bit,
    @CanCreate bit,
    @CanUpdate bit,
    @CanDelete bit,
    @CanShare bit,
    @ExpiresAt datetimeoffset,
    @GrantedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AccessControlRule]
            (
                [ID],
                [EntityID],
                [RecordID],
                [GranteeType],
                [GranteeID],
                [CanRead],
                [CanCreate],
                [CanUpdate],
                [CanDelete],
                [CanShare],
                [ExpiresAt],
                [GrantedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                @GranteeType,
                @GranteeID,
                @CanRead,
                @CanCreate,
                @CanUpdate,
                @CanDelete,
                @CanShare,
                @ExpiresAt,
                @GrantedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AccessControlRule]
            (
                [EntityID],
                [RecordID],
                [GranteeType],
                [GranteeID],
                [CanRead],
                [CanCreate],
                [CanUpdate],
                [CanDelete],
                [CanShare],
                [ExpiresAt],
                [GrantedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                @GranteeType,
                @GranteeID,
                @CanRead,
                @CanCreate,
                @CanUpdate,
                @CanDelete,
                @CanShare,
                @ExpiresAt,
                @GrantedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAccessControlRules] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAccessControlRule] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Access Control Rules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAccessControlRule] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: spUpdateAccessControlRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AccessControlRule
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAccessControlRule]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAccessControlRule]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(500),
    @GranteeType nvarchar(50),
    @GranteeID uniqueidentifier,
    @CanRead bit,
    @CanCreate bit,
    @CanUpdate bit,
    @CanDelete bit,
    @CanShare bit,
    @ExpiresAt datetimeoffset,
    @GrantedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AccessControlRule]
    SET
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [GranteeType] = @GranteeType,
        [GranteeID] = @GranteeID,
        [CanRead] = @CanRead,
        [CanCreate] = @CanCreate,
        [CanUpdate] = @CanUpdate,
        [CanDelete] = @CanDelete,
        [CanShare] = @CanShare,
        [ExpiresAt] = @ExpiresAt,
        [GrantedByUserID] = @GrantedByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAccessControlRules] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAccessControlRules]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAccessControlRule] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AccessControlRule table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAccessControlRule
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAccessControlRule
ON [${flyway:defaultSchema}].[AccessControlRule]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AccessControlRule]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AccessControlRule] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Access Control Rules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAccessControlRule] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: spDeleteAccessControlRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AccessControlRule
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAccessControlRule]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAccessControlRule]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AccessControlRule]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAccessControlRule] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Access Control Rules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAccessControlRule] TO [cdp_Integration]



/* Index for Foreign Keys for Artifact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_EnvironmentID ON [${flyway:defaultSchema}].[Artifact] ([EnvironmentID]);

-- Index for foreign key TypeID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_TypeID ON [${flyway:defaultSchema}].[Artifact] ([TypeID]);

-- Index for foreign key UserID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_UserID ON [${flyway:defaultSchema}].[Artifact] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID 4CCE08E9-74D9-4DE5-A191-E53B0EE3823B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4CCE08E9-74D9-4DE5-A191-E53B0EE3823B',
         @RelatedEntityNameFieldMap='Environment'

/* SQL text to update entity field related entity name field map for entity field ID 9A951D8D-F901-4BA3-88E6-98EC076D3D88 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9A951D8D-F901-4BA3-88E6-98EC076D3D88',
         @RelatedEntityNameFieldMap='Type'

/* SQL text to update entity field related entity name field map for entity field ID D3487C19-EC25-4FDA-BBDD-ADA03A1FBFCC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D3487C19-EC25-4FDA-BBDD-ADA03A1FBFCC',
         @RelatedEntityNameFieldMap='User'

/* Base View SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: vwArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Artifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwArtifacts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifacts]
AS
SELECT
    a.*,
    Environment_EnvironmentID.[Name] AS [Environment],
    ArtifactType_TypeID.[Name] AS [Type],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[Artifact] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [a].[EnvironmentID] = Environment_EnvironmentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_TypeID
  ON
    [a].[TypeID] = ArtifactType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: Permissions for vwArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spCreateArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Artifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifact]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Artifact]
            (
                [ID],
                [EnvironmentID],
                [Name],
                [Description],
                [TypeID],
                [Comments],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @Name,
                @Description,
                @TypeID,
                @Comments,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Artifact]
            (
                [EnvironmentID],
                [Name],
                [Description],
                [TypeID],
                [Comments],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @Name,
                @Description,
                @TypeID,
                @Comments,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spUpdateArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Artifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifact]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Artifact]
    SET
        [EnvironmentID] = @EnvironmentID,
        [Name] = @Name,
        [Description] = @Description,
        [TypeID] = @TypeID,
        [Comments] = @Comments,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Artifact table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateArtifact
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifact
ON [${flyway:defaultSchema}].[Artifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Artifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Artifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spDeleteArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Artifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Artifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 4ABF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4ABF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 5CBF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5CBF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 6ABF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6ABF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 5EBF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5EBF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 60BF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='60BF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 94BF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='94BF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID B8BF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B8BF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID D0BF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D0BF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID DCBF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DCBF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID BEBF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BEBF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID C0BF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C0BF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID C2BF433E-F36B-1410-8DC6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C2BF433E-F36B-1410-8DC6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for Task */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ParentID ON [${flyway:defaultSchema}].[Task] ([ParentID]);

-- Index for foreign key TypeID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_TypeID ON [${flyway:defaultSchema}].[Task] ([TypeID]);

-- Index for foreign key EnvironmentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_EnvironmentID ON [${flyway:defaultSchema}].[Task] ([EnvironmentID]);

-- Index for foreign key ProjectID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ProjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ProjectID ON [${flyway:defaultSchema}].[Task] ([ProjectID]);

-- Index for foreign key ConversationDetailID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ConversationDetailID ON [${flyway:defaultSchema}].[Task] ([ConversationDetailID]);

-- Index for foreign key UserID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_UserID ON [${flyway:defaultSchema}].[Task] ([UserID]);

-- Index for foreign key AgentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_AgentID ON [${flyway:defaultSchema}].[Task] ([AgentID]);

/* SQL text to update entity field related entity name field map for entity field ID C866D300-E97C-44E7-8848-F3DA97CE3F77 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C866D300-E97C-44E7-8848-F3DA97CE3F77',
         @RelatedEntityNameFieldMap='Parent'

/* Index for Foreign Keys for Project */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Project
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Project_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Project]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Project_EnvironmentID ON [${flyway:defaultSchema}].[Project] ([EnvironmentID]);

-- Index for foreign key ParentID in table Project
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Project_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Project]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Project_ParentID ON [${flyway:defaultSchema}].[Project] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID 5C2FFF31-2FE1-401F-8372-1B18C0727DDF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5C2FFF31-2FE1-401F-8372-1B18C0727DDF',
         @RelatedEntityNameFieldMap='Environment'

/* SQL text to update entity field related entity name field map for entity field ID F8719181-09B2-4C98-86F1-9A7828F46D2B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F8719181-09B2-4C98-86F1-9A7828F46D2B',
         @RelatedEntityNameFieldMap='Type'

/* SQL text to update entity field related entity name field map for entity field ID 6A979D0A-1CFF-449D-A121-6895C3C1BEC4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6A979D0A-1CFF-449D-A121-6895C3C1BEC4',
         @RelatedEntityNameFieldMap='Parent'

/* SQL text to update entity field related entity name field map for entity field ID 1B80F5CC-B3AD-4C4E-9F64-4C061AC14EC2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1B80F5CC-B3AD-4C4E-9F64-4C061AC14EC2',
         @RelatedEntityNameFieldMap='Environment'

/* Base View SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: vwProjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Projects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Project
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwProjects]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProjects]
AS
SELECT
    p.*,
    Environment_EnvironmentID.[Name] AS [Environment],
    Project_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[Project] AS p
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [p].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS Project_ParentID
  ON
    [p].[ParentID] = Project_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: Permissions for vwProjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spCreateProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Project
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateProject]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProject]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Color nvarchar(7),
    @Icon nvarchar(50),
    @IsArchived bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Project]
            (
                [ID],
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Color],
                [Icon],
                [IsArchived]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ParentID,
                @Name,
                @Description,
                @Color,
                @Icon,
                @IsArchived
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Project]
            (
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Color],
                [Icon],
                [IsArchived]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ParentID,
                @Name,
                @Description,
                @Color,
                @Icon,
                @IsArchived
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProjects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spUpdateProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Project
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateProject]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProject]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Color nvarchar(7),
    @Icon nvarchar(50),
    @IsArchived bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Project]
    SET
        [EnvironmentID] = @EnvironmentID,
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Color] = @Color,
        [Icon] = @Icon,
        [IsArchived] = @IsArchived
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProjects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProjects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Project table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateProject
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProject
ON [${flyway:defaultSchema}].[Project]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Project]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Project] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spDeleteProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Project
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteProject]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProject]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Project]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID E94662C2-69B9-4603-9BFC-279CFD42A222 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E94662C2-69B9-4603-9BFC-279CFD42A222',
         @RelatedEntityNameFieldMap='Project'

/* SQL text to update entity field related entity name field map for entity field ID 9F585440-DA55-4A2A-A48B-2937A3B24483 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9F585440-DA55-4A2A-A48B-2937A3B24483',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID A1E1C7BA-66FA-4BDC-A21A-A27AB8C577C4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A1E1C7BA-66FA-4BDC-A21A-A27AB8C577C4',
         @RelatedEntityNameFieldMap='Agent'

/* Base View SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tasks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Task
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwTasks]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTasks]
AS
SELECT
    t.*,
    Task_ParentID.[Name] AS [Parent],
    TaskType_TypeID.[Name] AS [Type],
    Environment_EnvironmentID.[Name] AS [Environment],
    Project_ProjectID.[Name] AS [Project],
    User_UserID.[Name] AS [User],
    AIAgent_AgentID.[Name] AS [Agent]
FROM
    [${flyway:defaultSchema}].[Task] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Task] AS Task_ParentID
  ON
    [t].[ParentID] = Task_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[TaskType] AS TaskType_TypeID
  ON
    [t].[TypeID] = TaskType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [t].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS Project_ProjectID
  ON
    [t].[ProjectID] = Project_ProjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [t].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [t].[AgentID] = AIAgent_AgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Permissions for vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spCreateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Task
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateTask]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTask]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @UserID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(50),
    @PercentComplete int,
    @DueAt datetimeoffset,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Task]
            (
                [ID],
                [ParentID],
                [Name],
                [Description],
                [TypeID],
                [EnvironmentID],
                [ProjectID],
                [ConversationDetailID],
                [UserID],
                [AgentID],
                [Status],
                [PercentComplete],
                [DueAt],
                [StartedAt],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @Description,
                @TypeID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ProjectID,
                @ConversationDetailID,
                @UserID,
                @AgentID,
                @Status,
                @PercentComplete,
                @DueAt,
                @StartedAt,
                @CompletedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Task]
            (
                [ParentID],
                [Name],
                [Description],
                [TypeID],
                [EnvironmentID],
                [ProjectID],
                [ConversationDetailID],
                [UserID],
                [AgentID],
                [Status],
                [PercentComplete],
                [DueAt],
                [StartedAt],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @Description,
                @TypeID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ProjectID,
                @ConversationDetailID,
                @UserID,
                @AgentID,
                @Status,
                @PercentComplete,
                @DueAt,
                @StartedAt,
                @CompletedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTask] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTask] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spUpdateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Task
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateTask]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTask]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @UserID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(50),
    @PercentComplete int,
    @DueAt datetimeoffset,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Task]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [TypeID] = @TypeID,
        [EnvironmentID] = @EnvironmentID,
        [ProjectID] = @ProjectID,
        [ConversationDetailID] = @ConversationDetailID,
        [UserID] = @UserID,
        [AgentID] = @AgentID,
        [Status] = @Status,
        [PercentComplete] = @PercentComplete,
        [DueAt] = @DueAt,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTasks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Task table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateTask
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTask
ON [${flyway:defaultSchema}].[Task]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Task]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Task] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spDeleteTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Task
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteTask]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTask]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Task]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTask] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTask] TO [cdp_Integration]



/* Index for Foreign Keys for ArtifactVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArtifactID in table ArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactVersion_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactVersion_ArtifactID ON [${flyway:defaultSchema}].[ArtifactVersion] ([ArtifactID]);

-- Index for foreign key UserID in table ArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactVersion_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactVersion_UserID ON [${flyway:defaultSchema}].[ArtifactVersion] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID E986C32B-9789-46B1-88ED-A1684050E6AB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E986C32B-9789-46B1-88ED-A1684050E6AB',
         @RelatedEntityNameFieldMap='Artifact'

/* SQL text to update entity field related entity name field map for entity field ID 84FA642F-F570-4B31-978B-32E786CA429A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='84FA642F-F570-4B31-978B-32E786CA429A',
         @RelatedEntityNameFieldMap='User'

/* Base View SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: vwArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwArtifactVersions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactVersions]
AS
SELECT
    a.*,
    Artifact_ArtifactID.[Name] AS [Artifact],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ArtifactVersion] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Artifact] AS Artifact_ArtifactID
  ON
    [a].[ArtifactID] = Artifact_ArtifactID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: Permissions for vwArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spCreateArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactVersion]
    @ID uniqueidentifier = NULL,
    @ArtifactID uniqueidentifier,
    @VersionNumber int,
    @Content nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersion]
            (
                [ID],
                [ArtifactID],
                [VersionNumber],
                [Content],
                [Configuration],
                [Comments],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArtifactID,
                @VersionNumber,
                @Content,
                @Configuration,
                @Comments,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersion]
            (
                [ArtifactID],
                [VersionNumber],
                [Content],
                [Configuration],
                [Comments],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactID,
                @VersionNumber,
                @Content,
                @Configuration,
                @Comments,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersion] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spUpdateArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactVersion]
    @ID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @VersionNumber int,
    @Content nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersion]
    SET
        [ArtifactID] = @ArtifactID,
        [VersionNumber] = @VersionNumber,
        [Content] = @Content,
        [Configuration] = @Configuration,
        [Comments] = @Comments,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactVersions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactVersion table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateArtifactVersion
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactVersion
ON [${flyway:defaultSchema}].[ArtifactVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spDeleteArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersion] TO [cdp_Integration]



/* Index for Foreign Keys for ConversationDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID ON [${flyway:defaultSchema}].[ConversationDetail] ([ConversationID]);

-- Index for foreign key UserID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_UserID ON [${flyway:defaultSchema}].[ConversationDetail] ([UserID]);

-- Index for foreign key ArtifactID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactID]);

-- Index for foreign key ArtifactVersionID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactVersionID]);

/* Base View SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Conversation Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationDetails]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetails]
AS
SELECT
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User],
    ConversationArtifact_ArtifactID.[Name] AS [Artifact]
FROM
    [${flyway:defaultSchema}].[ConversationDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ArtifactID
  ON
    [c].[ArtifactID] = ConversationArtifact_ArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: Permissions for vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint,
    @IsPinned bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ID],
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                @ExternalID,
                @Role,
                @Message,
                @Error,
                @HiddenToUser,
                @UserRating,
                @UserFeedback,
                @ReflectionInsights,
                @SummaryOfEarlierConversation,
                @UserID,
                @ArtifactID,
                @ArtifactVersionID,
                @CompletionTime,
                @IsPinned
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                @ExternalID,
                @Role,
                @Message,
                @Error,
                @HiddenToUser,
                @UserRating,
                @UserFeedback,
                @ReflectionInsights,
                @SummaryOfEarlierConversation,
                @UserID,
                @ArtifactID,
                @ArtifactVersionID,
                @CompletionTime,
                @IsPinned
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint,
    @IsPinned bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        [ConversationID] = @ConversationID,
        [ExternalID] = @ExternalID,
        [Role] = @Role,
        [Message] = @Message,
        [Error] = @Error,
        [HiddenToUser] = @HiddenToUser,
        [UserRating] = @UserRating,
        [UserFeedback] = @UserFeedback,
        [ReflectionInsights] = @ReflectionInsights,
        [SummaryOfEarlierConversation] = @SummaryOfEarlierConversation,
        [UserID] = @UserID,
        [ArtifactID] = @ArtifactID,
        [ArtifactVersionID] = @ArtifactVersionID,
        [CompletionTime] = @CompletionTime,
        [IsPinned] = @IsPinned
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationDetail
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetail
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
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
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
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



/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
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
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactVersionID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ArtifactVersionID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
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
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ArtifactID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade delete from ConversationArtifactVersion using cursor to call spDeleteConversationArtifactVersion
    DECLARE @MJ_ConversationArtifactVersionsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifactVersions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactVersion]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifactVersions_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactVersions_cursor INTO @MJ_ConversationArtifactVersionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] @ID = @MJ_ConversationArtifactVersionsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactVersions_cursor INTO @MJ_ConversationArtifactVersionsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifactVersions_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifactVersions_cursor
    
    -- Cascade delete from ConversationArtifactPermission using cursor to call spDeleteConversationArtifactPermission
    DECLARE @MJ_ConversationArtifactPermissionsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifactPermissions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactPermission]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifactPermissions_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactPermissions_cursor INTO @MJ_ConversationArtifactPermissionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] @ID = @MJ_ConversationArtifactPermissionsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactPermissions_cursor INTO @MJ_ConversationArtifactPermissionsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifactPermissions_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifactPermissions_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]



/* Index for Foreign Keys for Conversation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_UserID ON [${flyway:defaultSchema}].[Conversation] ([UserID]);

-- Index for foreign key LinkedEntityID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID ON [${flyway:defaultSchema}].[Conversation] ([LinkedEntityID]);

-- Index for foreign key DataContextID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_DataContextID ON [${flyway:defaultSchema}].[Conversation] ([DataContextID]);

-- Index for foreign key EnvironmentID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID ON [${flyway:defaultSchema}].[Conversation] ([EnvironmentID]);

-- Index for foreign key ProjectID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_ProjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_ProjectID ON [${flyway:defaultSchema}].[Conversation] ([ProjectID]);

/* SQL text to update entity field related entity name field map for entity field ID A8EE672F-D2DF-4C0F-81FC-1392FCAD9813 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A8EE672F-D2DF-4C0F-81FC-1392FCAD9813',
         @RelatedEntityNameFieldMap='Environment'

/* SQL text to update entity field related entity name field map for entity field ID EB07B3D0-FF8B-43AD-A612-01340C796652 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EB07B3D0-FF8B-43AD-A612-01340C796652',
         @RelatedEntityNameFieldMap='Project'

/* Base View SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Conversations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Conversation
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversations]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversations]
AS
SELECT
    c.*,
    User_UserID.[Name] AS [User],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity],
    DataContext_DataContextID.[Name] AS [DataContext],
    Environment_EnvironmentID.[Name] AS [Environment],
    Project_ProjectID.[Name] AS [Project]
FROM
    [${flyway:defaultSchema}].[Conversation] AS c
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_LinkedEntityID
  ON
    [c].[LinkedEntityID] = Entity_LinkedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [c].[DataContextID] = DataContext_DataContextID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [c].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS Project_ProjectID
  ON
    [c].[ProjectID] = Project_ProjectID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: Permissions for vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spCreateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversation]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier,
    @Status nvarchar(20),
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @IsPinned bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Conversation]
            (
                [ID],
                [UserID],
                [ExternalID],
                [Name],
                [Description],
                [Type],
                [IsArchived],
                [LinkedEntityID],
                [LinkedRecordID],
                [DataContextID],
                [Status],
                [EnvironmentID],
                [ProjectID],
                [IsPinned]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @ExternalID,
                @Name,
                @Description,
                @Type,
                @IsArchived,
                @LinkedEntityID,
                @LinkedRecordID,
                @DataContextID,
                @Status,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ProjectID,
                @IsPinned
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Conversation]
            (
                [UserID],
                [ExternalID],
                [Name],
                [Description],
                [Type],
                [IsArchived],
                [LinkedEntityID],
                [LinkedRecordID],
                [DataContextID],
                [Status],
                [EnvironmentID],
                [ProjectID],
                [IsPinned]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @ExternalID,
                @Name,
                @Description,
                @Type,
                @IsArchived,
                @LinkedEntityID,
                @LinkedRecordID,
                @DataContextID,
                @Status,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ProjectID,
                @IsPinned
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spUpdateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversation]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier,
    @Status nvarchar(20),
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @IsPinned bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        [UserID] = @UserID,
        [ExternalID] = @ExternalID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [IsArchived] = @IsArchived,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordID] = @LinkedRecordID,
        [DataContextID] = @DataContextID,
        [Status] = @Status,
        [EnvironmentID] = @EnvironmentID,
        [ProjectID] = @ProjectID,
        [IsPinned] = @IsPinned
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversation
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversation
ON [${flyway:defaultSchema}].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Conversation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
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
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
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



/* Generated Validation Functions for MJ: Task Dependencies */
-- CHECK constraint for MJ: Task Dependencies @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([TaskID]<>[DependsOnTaskID])', 'public ValidateTaskIDIsNotEqualToDependsOnTaskID(result: ValidationResult) {
	if (this.TaskID === this.DependsOnTaskID) {
		result.Errors.push(new ValidationErrorInfo("TaskID", "A task cannot depend on itself. The TaskID and DependsOnTaskID must be different.", this.TaskID, ValidationErrorType.Failure));
	}
}', 'This rule ensures that a task cannot depend on itself. In other words, the dependent task and the task it depends on must be different.', 'ValidateTaskIDIsNotEqualToDependsOnTaskID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524');
  
            

/* Generated Validation Functions for MJ: Tasks */
-- CHECK constraint for MJ: Tasks: Field: PercentComplete was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([PercentComplete]>=(0) AND [PercentComplete]<=(100))', 'public ValidatePercentCompleteWithinRange(result: ValidationResult) {
	if (this.PercentComplete < 0 || this.PercentComplete > 100) {
		result.Errors.push(new ValidationErrorInfo("PercentComplete", "Percent complete must be between 0 and 100.", this.PercentComplete, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the percent complete value must always be between 0 and 100, inclusive.', 'ValidatePercentCompleteWithinRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8071305E-E1C1-48BF-AE70-E345D6B892EE');
  
            -- CHECK constraint for MJ: Tasks @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([UserID] IS NULL AND [AgentID] IS NULL OR [UserID] IS NOT NULL AND [AgentID] IS NULL OR [UserID] IS NULL AND [AgentID] IS NOT NULL)', 'public ValidateUserIDAndAgentIDNotBothSet(result: ValidationResult) {
	if (this.UserID !== null && this.AgentID !== null) {
		result.Errors.push(new ValidationErrorInfo("UserID", "You cannot have both a User and an Agent specified at the same time.", this.UserID, ValidationErrorType.Failure));
		result.Errors.push(new ValidationErrorInfo("AgentID", "You cannot have both an Agent and a User specified at the same time.", this.AgentID, ValidationErrorType.Failure));
	}
}', 'This rule ensures that you can have a user, or an agent, or neither, but you cannot have both set at the same time.', 'ValidateUserIDAndAgentIDNotBothSet', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1');
  
            

















----- ADDITIONAL CODE GEN RUN 

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1ebff46f-9f99-4e18-aef0-c00d03fcd0b9'  OR 
               (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'Task')
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
            '1ebff46f-9f99-4e18-aef0-c00d03fcd0b9',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            100007,
            'Task',
            'Task',
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
         WHERE ID = '28044698-7e43-4afa-9676-195b01fb5c54'  OR 
               (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'DependsOnTask')
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
            '28044698-7e43-4afa-9676-195b01fb5c54',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            100008,
            'DependsOnTask',
            'Depends On Task',
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
         WHERE ID = 'f88abac1-d93f-49aa-8b63-7a2bd6e5d89f'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'Environment')
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
            'f88abac1-d93f-49aa-8b63-7a2bd6e5d89f',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100011,
            'Environment',
            'Environment',
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
         WHERE ID = 'a029cbb6-215a-41d3-9f9c-25a60abfcb5c'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'Parent')
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
            'a029cbb6-215a-41d3-9f9c-25a60abfcb5c',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100012,
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
         WHERE ID = 'f03adac0-929f-49b6-812d-27f2f534e683'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'SourceEntity')
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
            'f03adac0-929f-49b6-812d-27f2f534e683',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100011,
            'SourceEntity',
            'Source Entity',
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
         WHERE ID = '9d1a4058-d5fe-4e24-a7aa-7dacf2d4617a'  OR 
               (EntityID = 'E26C7855-B778-44F4-A110-56EFEE4F843B' AND Name = 'TargetEntity')
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
            '9d1a4058-d5fe-4e24-a7aa-7dacf2d4617a',
            'E26C7855-B778-44F4-A110-56EFEE4F843B', -- Entity: MJ: Record Links
            100012,
            'TargetEntity',
            'Target Entity',
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
         WHERE ID = '9cfa9762-fc03-42be-bd66-4962092fe4a0'  OR 
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Environment')
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
            '9cfa9762-fc03-42be-bd66-4962092fe4a0',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            100019,
            'Environment',
            'Environment',
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
         WHERE ID = '54d5f848-be9c-4b4a-8df0-b53e2ea196e5'  OR 
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Environment')
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
            '54d5f848-be9c-4b4a-8df0-b53e2ea196e5',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Reports
            100029,
            'Environment',
            'Environment',
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
         WHERE ID = '49a2d31e-331d-42c6-ba30-c96eb5a1310f'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Environment')
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
            '49a2d31e-331d-42c6-ba30-c96eb5a1310f',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100020,
            'Environment',
            'Environment',
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
         WHERE ID = 'fe95fc8e-8a64-48d1-aa72-2f141c9199a2'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Project')
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
            'fe95fc8e-8a64-48d1-aa72-2f141c9199a2',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100021,
            'Project',
            'Project',
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
         WHERE ID = 'fcb86ae4-4752-4c46-a1da-70c27f91a886'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'Entity')
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
            'fcb86ae4-4752-4c46-a1da-70c27f91a886',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100015,
            'Entity',
            'Entity',
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
         WHERE ID = '71704f77-b166-4735-b664-0fb9aa3bc1e9'  OR 
               (EntityID = 'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826' AND Name = 'GrantedByUser')
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
            '71704f77-b166-4735-b664-0fb9aa3bc1e9',
            'F6B17CA4-F2D6-47E7-9F97-7B3D1C183826', -- Entity: MJ: Access Control Rules
            100016,
            'GrantedByUser',
            'Granted By User',
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
         WHERE ID = '315adb2b-dea1-4a69-87da-1d656f97ea47'  OR 
               (EntityID = '6BAB48BD-F197-4737-93A6-8081BBBAEB30' AND Name = 'User')
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
            '315adb2b-dea1-4a69-87da-1d656f97ea47',
            '6BAB48BD-F197-4737-93A6-8081BBBAEB30', -- Entity: MJ: Public Links
            100013,
            'User',
            'User',
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
         WHERE ID = 'af3f142b-783a-40d2-adeb-4d3ccf57fbb7'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'Environment')
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
            'af3f142b-783a-40d2-adeb-4d3ccf57fbb7',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100010,
            'Environment',
            'Environment',
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
         WHERE ID = '8d079601-557c-48b3-8338-cb83ee62215d'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'Type')
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
            '8d079601-557c-48b3-8338-cb83ee62215d',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100011,
            'Type',
            'Type',
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
         WHERE ID = '200390e3-d499-42c7-ac38-b7744a0c8e36'  OR 
               (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'User')
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
            '200390e3-d499-42c7-ac38-b7744a0c8e36',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            100012,
            'User',
            'User',
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
         WHERE ID = '2344e41b-6f21-419a-b80f-43636478a814'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Parent')
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
            '2344e41b-6f21-419a-b80f-43636478a814',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100018,
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
         WHERE ID = 'e1e5f477-3abe-4793-bc11-a719cb078463'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Type')
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
            'e1e5f477-3abe-4793-bc11-a719cb078463',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100019,
            'Type',
            'Type',
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
         WHERE ID = '9a8aeaf5-9065-4b87-8a63-b04f84e83886'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Environment')
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
            '9a8aeaf5-9065-4b87-8a63-b04f84e83886',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100020,
            'Environment',
            'Environment',
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
         WHERE ID = '65abf2b8-3355-4427-828b-e3082806c557'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Project')
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
            '65abf2b8-3355-4427-828b-e3082806c557',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100021,
            'Project',
            'Project',
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
         WHERE ID = '1efad61d-3a38-4cea-86fe-67463e887920'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'User')
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
            '1efad61d-3a38-4cea-86fe-67463e887920',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100022,
            'User',
            'User',
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
         WHERE ID = 'e7951b0e-3f0a-45da-bfc3-a4abb3ac5e0c'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Agent')
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
            'e7951b0e-3f0a-45da-bfc3-a4abb3ac5e0c',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100023,
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
         WHERE ID = '7706742b-2840-4e0f-94d7-eb60cd17940c'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'Environment')
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
            '7706742b-2840-4e0f-94d7-eb60cd17940c',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100011,
            'Environment',
            'Environment',
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
         WHERE ID = 'b7451aee-bc19-45fc-a716-c470db9c8653'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'Parent')
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
            'b7451aee-bc19-45fc-a716-c470db9c8653',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100012,
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
         WHERE ID = 'e1a69905-07e6-4852-aa41-9d4e610b0aae'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'Artifact')
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
            'e1a69905-07e6-4852-aa41-9d4e610b0aae',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100010,
            'Artifact',
            'Artifact',
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
         WHERE ID = '315df2ed-fc5c-4337-b346-fc91afe461cc'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'User')
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
            '315df2ed-fc5c-4337-b346-fc91afe461cc',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100011,
            'User',
            'User',
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

/* Index for Foreign Keys for TaskDependency */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TaskID in table TaskDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaskDependency_TaskID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaskDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaskDependency_TaskID ON [${flyway:defaultSchema}].[TaskDependency] ([TaskID]);

-- Index for foreign key DependsOnTaskID in table TaskDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaskDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID ON [${flyway:defaultSchema}].[TaskDependency] ([DependsOnTaskID]);

/* Index for Foreign Keys for Collection */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Collection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Collection_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Collection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Collection_EnvironmentID ON [${flyway:defaultSchema}].[Collection] ([EnvironmentID]);

-- Index for foreign key ParentID in table Collection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Collection_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Collection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Collection_ParentID ON [${flyway:defaultSchema}].[Collection] ([ParentID]);

/* Index for Foreign Keys for RecordLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceEntityID in table RecordLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordLink_SourceEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordLink_SourceEntityID ON [${flyway:defaultSchema}].[RecordLink] ([SourceEntityID]);

-- Index for foreign key TargetEntityID in table RecordLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordLink_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordLink_TargetEntityID ON [${flyway:defaultSchema}].[RecordLink] ([TargetEntityID]);

/* Base View SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: vwTaskDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Task Dependencies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TaskDependency
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwTaskDependencies]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTaskDependencies]
AS
SELECT
    t.*,
    Task_TaskID.[Name] AS [Task],
    Task_DependsOnTaskID.[Name] AS [DependsOnTask]
FROM
    [${flyway:defaultSchema}].[TaskDependency] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Task] AS Task_TaskID
  ON
    [t].[TaskID] = Task_TaskID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Task] AS Task_DependsOnTaskID
  ON
    [t].[DependsOnTaskID] = Task_DependsOnTaskID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTaskDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Permissions for vwTaskDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTaskDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spCreateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaskDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateTaskDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTaskDependency]
    @ID uniqueidentifier = NULL,
    @TaskID uniqueidentifier,
    @DependsOnTaskID uniqueidentifier,
    @DependencyType nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TaskDependency]
            (
                [ID],
                [TaskID],
                [DependsOnTaskID],
                [DependencyType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TaskID,
                @DependsOnTaskID,
                @DependencyType
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TaskDependency]
            (
                [TaskID],
                [DependsOnTaskID],
                [DependencyType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TaskID,
                @DependsOnTaskID,
                @DependencyType
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTaskDependencies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaskDependency] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaskDependency] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spUpdateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaskDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateTaskDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTaskDependency]
    @ID uniqueidentifier,
    @TaskID uniqueidentifier,
    @DependsOnTaskID uniqueidentifier,
    @DependencyType nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaskDependency]
    SET
        [TaskID] = @TaskID,
        [DependsOnTaskID] = @DependsOnTaskID,
        [DependencyType] = @DependencyType
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTaskDependencies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTaskDependencies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaskDependency] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TaskDependency table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateTaskDependency
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTaskDependency
ON [${flyway:defaultSchema}].[TaskDependency]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaskDependency]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TaskDependency] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaskDependency] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spDeleteTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaskDependency
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteTaskDependency]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTaskDependency]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TaskDependency]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaskDependency] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaskDependency] TO [cdp_Integration]



/* Base View SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: vwCollections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Collections
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Collection
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwCollections]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCollections]
AS
SELECT
    c.*,
    Environment_EnvironmentID.[Name] AS [Environment],
    Collection_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[Collection] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [c].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Collection] AS Collection_ParentID
  ON
    [c].[ParentID] = Collection_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCollections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: Permissions for vwCollections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCollections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spCreateCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Collection
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateCollection]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCollection]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Icon nvarchar(50),
    @Color nvarchar(7),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Collection]
            (
                [ID],
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Icon],
                [Color],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ParentID,
                @Name,
                @Description,
                @Icon,
                @Color,
                @Sequence
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Collection]
            (
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Icon],
                [Color],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ParentID,
                @Name,
                @Description,
                @Icon,
                @Color,
                @Sequence
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCollections] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollection] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollection] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spUpdateCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Collection
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateCollection]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCollection]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Icon nvarchar(50),
    @Color nvarchar(7),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Collection]
    SET
        [EnvironmentID] = @EnvironmentID,
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [Color] = @Color,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCollections] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCollections]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollection] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Collection table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateCollection
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCollection
ON [${flyway:defaultSchema}].[Collection]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Collection]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Collection] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollection] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spDeleteCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Collection
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteCollection]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCollection]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Collection]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollection] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollection] TO [cdp_Integration]



/* Base View SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: vwRecordLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwRecordLinks]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordLinks]
AS
SELECT
    r.*,
    Entity_SourceEntityID.[Name] AS [SourceEntity],
    Entity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[RecordLink] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_SourceEntityID
  ON
    [r].[SourceEntityID] = Entity_SourceEntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_TargetEntityID
  ON
    [r].[TargetEntityID] = Entity_TargetEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: Permissions for vwRecordLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: spCreateRecordLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateRecordLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordLink]
    @ID uniqueidentifier = NULL,
    @SourceEntityID uniqueidentifier,
    @SourceRecordID nvarchar(500),
    @TargetEntityID uniqueidentifier,
    @TargetRecordID nvarchar(500),
    @LinkType nvarchar(50),
    @Sequence int,
    @Metadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordLink]
            (
                [ID],
                [SourceEntityID],
                [SourceRecordID],
                [TargetEntityID],
                [TargetRecordID],
                [LinkType],
                [Sequence],
                [Metadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SourceEntityID,
                @SourceRecordID,
                @TargetEntityID,
                @TargetRecordID,
                @LinkType,
                @Sequence,
                @Metadata
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordLink]
            (
                [SourceEntityID],
                [SourceRecordID],
                [TargetEntityID],
                [TargetRecordID],
                [LinkType],
                [Sequence],
                [Metadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SourceEntityID,
                @SourceRecordID,
                @TargetEntityID,
                @TargetRecordID,
                @LinkType,
                @Sequence,
                @Metadata
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordLink] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Record Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordLink] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: spUpdateRecordLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateRecordLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordLink]
    @ID uniqueidentifier,
    @SourceEntityID uniqueidentifier,
    @SourceRecordID nvarchar(500),
    @TargetEntityID uniqueidentifier,
    @TargetRecordID nvarchar(500),
    @LinkType nvarchar(50),
    @Sequence int,
    @Metadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordLink]
    SET
        [SourceEntityID] = @SourceEntityID,
        [SourceRecordID] = @SourceRecordID,
        [TargetEntityID] = @TargetEntityID,
        [TargetRecordID] = @TargetRecordID,
        [LinkType] = @LinkType,
        [Sequence] = @Sequence,
        [Metadata] = @Metadata
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordLink table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateRecordLink
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordLink
ON [${flyway:defaultSchema}].[RecordLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Record Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordLink] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: spDeleteRecordLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteRecordLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordLink] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Record Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordLink] TO [cdp_Integration]



/* Index for Foreign Keys for Dashboard */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_UserID ON [${flyway:defaultSchema}].[Dashboard] ([UserID]);

-- Index for foreign key CategoryID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_CategoryID ON [${flyway:defaultSchema}].[Dashboard] ([CategoryID]);

-- Index for foreign key ApplicationID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID ON [${flyway:defaultSchema}].[Dashboard] ([ApplicationID]);

-- Index for foreign key EnvironmentID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_EnvironmentID ON [${flyway:defaultSchema}].[Dashboard] ([EnvironmentID]);

/* Base View SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dashboards
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Dashboard
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDashboards]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboards]
AS
SELECT
    d.*,
    User_UserID.[Name] AS [User],
    DashboardCategory_CategoryID.[Name] AS [Category],
    Application_ApplicationID.[Name] AS [Application],
    Environment_EnvironmentID.[Name] AS [Environment]
FROM
    [${flyway:defaultSchema}].[Dashboard] AS d
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DashboardCategory] AS DashboardCategory_CategoryID
  ON
    [d].[CategoryID] = DashboardCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Application] AS Application_ApplicationID
  ON
    [d].[ApplicationID] = Application_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [d].[EnvironmentID] = Environment_EnvironmentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Permissions for vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spCreateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboard]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @DriverClass nvarchar(255),
    @Code nvarchar(255),
    @EnvironmentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Dashboard]
            (
                [ID],
                [Name],
                [Description],
                [UserID],
                [CategoryID],
                [UIConfigDetails],
                [Type],
                [Thumbnail],
                [Scope],
                [ApplicationID],
                [DriverClass],
                [Code],
                [EnvironmentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @UserID,
                @CategoryID,
                @UIConfigDetails,
                @Type,
                @Thumbnail,
                @Scope,
                @ApplicationID,
                @DriverClass,
                @Code,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Dashboard]
            (
                [Name],
                [Description],
                [UserID],
                [CategoryID],
                [UIConfigDetails],
                [Type],
                [Thumbnail],
                [Scope],
                [ApplicationID],
                [DriverClass],
                [Code],
                [EnvironmentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @UserID,
                @CategoryID,
                @UIConfigDetails,
                @Type,
                @Thumbnail,
                @Scope,
                @ApplicationID,
                @DriverClass,
                @Code,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboards] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spUpdateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboard]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @DriverClass nvarchar(255),
    @Code nvarchar(255),
    @EnvironmentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [CategoryID] = @CategoryID,
        [UIConfigDetails] = @UIConfigDetails,
        [Type] = @Type,
        [Thumbnail] = @Thumbnail,
        [Scope] = @Scope,
        [ApplicationID] = @ApplicationID,
        [DriverClass] = @DriverClass,
        [Code] = @Code,
        [EnvironmentID] = @EnvironmentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDashboards] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboards]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Dashboard table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateDashboard
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboard
ON [${flyway:defaultSchema}].[Dashboard]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Dashboard] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spDeleteDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboard]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Dashboard]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Index for Foreign Keys for Report */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_CategoryID ON [${flyway:defaultSchema}].[Report] ([CategoryID]);

-- Index for foreign key UserID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_UserID ON [${flyway:defaultSchema}].[Report] ([UserID]);

-- Index for foreign key ConversationID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_ConversationID ON [${flyway:defaultSchema}].[Report] ([ConversationID]);

-- Index for foreign key ConversationDetailID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_ConversationDetailID ON [${flyway:defaultSchema}].[Report] ([ConversationDetailID]);

-- Index for foreign key DataContextID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_DataContextID ON [${flyway:defaultSchema}].[Report] ([DataContextID]);

-- Index for foreign key OutputTriggerTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID ON [${flyway:defaultSchema}].[Report] ([OutputTriggerTypeID]);

-- Index for foreign key OutputFormatTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID ON [${flyway:defaultSchema}].[Report] ([OutputFormatTypeID]);

-- Index for foreign key OutputDeliveryTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID ON [${flyway:defaultSchema}].[Report] ([OutputDeliveryTypeID]);

-- Index for foreign key OutputWorkflowID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID ON [${flyway:defaultSchema}].[Report] ([OutputWorkflowID]);

-- Index for foreign key EnvironmentID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_EnvironmentID ON [${flyway:defaultSchema}].[Report] ([EnvironmentID]);

/* Base View SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Reports
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Report
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReports]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReports]
AS
SELECT
    r.*,
    ReportCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User],
    Conversation_ConversationID.[Name] AS [Conversation],
    DataContext_DataContextID.[Name] AS [DataContext],
    OutputTriggerType_OutputTriggerTypeID.[Name] AS [OutputTriggerType],
    OutputFormatType_OutputFormatTypeID.[Name] AS [OutputFormatType],
    OutputDeliveryType_OutputDeliveryTypeID.[Name] AS [OutputDeliveryType],
    Workflow_OutputWorkflowID.[Name] AS [OutputWorkflow],
    Environment_EnvironmentID.[Name] AS [Environment]
FROM
    [${flyway:defaultSchema}].[Report] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ReportCategory] AS ReportCategory_CategoryID
  ON
    [r].[CategoryID] = ReportCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [r].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [r].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputTriggerType] AS OutputTriggerType_OutputTriggerTypeID
  ON
    [r].[OutputTriggerTypeID] = OutputTriggerType_OutputTriggerTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputFormatType] AS OutputFormatType_OutputFormatTypeID
  ON
    [r].[OutputFormatTypeID] = OutputFormatType_OutputFormatTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputDeliveryType] AS OutputDeliveryType_OutputDeliveryTypeID
  ON
    [r].[OutputDeliveryTypeID] = OutputDeliveryType_OutputDeliveryTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Workflow] AS Workflow_OutputWorkflowID
  ON
    [r].[OutputWorkflowID] = Workflow_OutputWorkflowID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [r].[EnvironmentID] = Environment_EnvironmentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReports] TO [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: Permissions for vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReports] TO [cdp_Developer], [cdp_UI]

/* spCreate SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spCreateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReport]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier,
    @Thumbnail nvarchar(MAX),
    @EnvironmentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Report]
            (
                [ID],
                [Name],
                [Description],
                [CategoryID],
                [UserID],
                [SharingScope],
                [ConversationID],
                [ConversationDetailID],
                [DataContextID],
                [Configuration],
                [OutputTriggerTypeID],
                [OutputFormatTypeID],
                [OutputDeliveryTypeID],
                [OutputFrequency],
                [OutputTargetEmail],
                [OutputWorkflowID],
                [Thumbnail],
                [EnvironmentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @CategoryID,
                @UserID,
                @SharingScope,
                @ConversationID,
                @ConversationDetailID,
                @DataContextID,
                @Configuration,
                @OutputTriggerTypeID,
                @OutputFormatTypeID,
                @OutputDeliveryTypeID,
                @OutputFrequency,
                @OutputTargetEmail,
                @OutputWorkflowID,
                @Thumbnail,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Report]
            (
                [Name],
                [Description],
                [CategoryID],
                [UserID],
                [SharingScope],
                [ConversationID],
                [ConversationDetailID],
                [DataContextID],
                [Configuration],
                [OutputTriggerTypeID],
                [OutputFormatTypeID],
                [OutputDeliveryTypeID],
                [OutputFrequency],
                [OutputTargetEmail],
                [OutputWorkflowID],
                [Thumbnail],
                [EnvironmentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @CategoryID,
                @UserID,
                @SharingScope,
                @ConversationID,
                @ConversationDetailID,
                @DataContextID,
                @Configuration,
                @OutputTriggerTypeID,
                @OutputFormatTypeID,
                @OutputDeliveryTypeID,
                @OutputFrequency,
                @OutputTargetEmail,
                @OutputWorkflowID,
                @Thumbnail,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReports] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReport] TO [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReport] TO [cdp_Developer], [cdp_UI]



/* spUpdate SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spUpdateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReport]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier,
    @Thumbnail nvarchar(MAX),
    @EnvironmentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserID] = @UserID,
        [SharingScope] = @SharingScope,
        [ConversationID] = @ConversationID,
        [ConversationDetailID] = @ConversationDetailID,
        [DataContextID] = @DataContextID,
        [Configuration] = @Configuration,
        [OutputTriggerTypeID] = @OutputTriggerTypeID,
        [OutputFormatTypeID] = @OutputFormatTypeID,
        [OutputDeliveryTypeID] = @OutputDeliveryTypeID,
        [OutputFrequency] = @OutputFrequency,
        [OutputTargetEmail] = @OutputTargetEmail,
        [OutputWorkflowID] = @OutputWorkflowID,
        [Thumbnail] = @Thumbnail,
        [EnvironmentID] = @EnvironmentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwReports] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReports]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReport] TO [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Report table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReport
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReport
ON [${flyway:defaultSchema}].[Report]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Report] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReport] TO [cdp_Developer], [cdp_UI]



/* spDelete SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spDeleteReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReport]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ReportSnapshot using cursor to call spDeleteReportSnapshot
    DECLARE @ReportSnapshotsID uniqueidentifier
    DECLARE cascade_delete_ReportSnapshots_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ReportSnapshot]
        WHERE [ReportID] = @ID
    
    OPEN cascade_delete_ReportSnapshots_cursor
    FETCH NEXT FROM cascade_delete_ReportSnapshots_cursor INTO @ReportSnapshotsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteReportSnapshot] @ID = @ReportSnapshotsID
        
        FETCH NEXT FROM cascade_delete_ReportSnapshots_cursor INTO @ReportSnapshotsID
    END
    
    CLOSE cascade_delete_ReportSnapshots_cursor
    DEALLOCATE cascade_delete_ReportSnapshots_cursor
    
    -- Cascade delete from ReportUserState using cursor to call spDeleteReportUserState
    DECLARE @MJ_ReportUserStatesID uniqueidentifier
    DECLARE cascade_delete_MJ_ReportUserStates_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ReportUserState]
        WHERE [ReportID] = @ID
    
    OPEN cascade_delete_MJ_ReportUserStates_cursor
    FETCH NEXT FROM cascade_delete_MJ_ReportUserStates_cursor INTO @MJ_ReportUserStatesID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteReportUserState] @ID = @MJ_ReportUserStatesID
        
        FETCH NEXT FROM cascade_delete_MJ_ReportUserStates_cursor INTO @MJ_ReportUserStatesID
    END
    
    CLOSE cascade_delete_MJ_ReportUserStates_cursor
    DEALLOCATE cascade_delete_MJ_ReportUserStates_cursor
    
    -- Cascade delete from ReportVersion using cursor to call spDeleteReportVersion
    DECLARE @MJ_ReportVersionsID uniqueidentifier
    DECLARE cascade_delete_MJ_ReportVersions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ReportVersion]
        WHERE [ReportID] = @ID
    
    OPEN cascade_delete_MJ_ReportVersions_cursor
    FETCH NEXT FROM cascade_delete_MJ_ReportVersions_cursor INTO @MJ_ReportVersionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteReportVersion] @ID = @MJ_ReportVersionsID
        
        FETCH NEXT FROM cascade_delete_MJ_ReportVersions_cursor INTO @MJ_ReportVersionsID
    END
    
    CLOSE cascade_delete_MJ_ReportVersions_cursor
    DEALLOCATE cascade_delete_MJ_ReportVersions_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Report]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReport] TO [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReport] TO [cdp_Developer], [cdp_UI]



/* Index for Foreign Keys for AIModelVendor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID ON [${flyway:defaultSchema}].[AIModelVendor] ([ModelID]);

-- Index for foreign key VendorID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID ON [${flyway:defaultSchema}].[AIModelVendor] ([VendorID]);

-- Index for foreign key TypeID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID ON [${flyway:defaultSchema}].[AIModelVendor] ([TypeID]);

/* Base View SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Vendors
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModelVendors]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelVendors]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIVendorTypeDefinition_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[AIModelVendor] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendorTypeDefinition] AS AIVendorTypeDefinition_TypeID
  ON
    [a].[TypeID] = AIVendorTypeDefinition_TypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Permissions for vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spCreateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelVendor]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @Priority int,
    @Status nvarchar(20),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @MaxInputTokens int,
    @MaxOutputTokens int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit,
    @SupportsStreaming bit,
    @TypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
            (
                [ID],
                [ModelID],
                [VendorID],
                [Priority],
                [Status],
                [DriverClass],
                [DriverImportPath],
                [APIName],
                [MaxInputTokens],
                [MaxOutputTokens],
                [SupportedResponseFormats],
                [SupportsEffortLevel],
                [SupportsStreaming],
                [TypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                @VendorID,
                @Priority,
                @Status,
                @DriverClass,
                @DriverImportPath,
                @APIName,
                @MaxInputTokens,
                @MaxOutputTokens,
                @SupportedResponseFormats,
                @SupportsEffortLevel,
                @SupportsStreaming,
                @TypeID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
            (
                [ModelID],
                [VendorID],
                [Priority],
                [Status],
                [DriverClass],
                [DriverImportPath],
                [APIName],
                [MaxInputTokens],
                [MaxOutputTokens],
                [SupportedResponseFormats],
                [SupportsEffortLevel],
                [SupportsStreaming],
                [TypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                @VendorID,
                @Priority,
                @Status,
                @DriverClass,
                @DriverImportPath,
                @APIName,
                @MaxInputTokens,
                @MaxOutputTokens,
                @SupportedResponseFormats,
                @SupportsEffortLevel,
                @SupportsStreaming,
                @TypeID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelVendors] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelVendor] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelVendor] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spUpdateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelVendor]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @Priority int,
    @Status nvarchar(20),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @MaxInputTokens int,
    @MaxOutputTokens int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit,
    @SupportsStreaming bit,
    @TypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelVendor]
    SET
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [Priority] = @Priority,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [APIName] = @APIName,
        [MaxInputTokens] = @MaxInputTokens,
        [MaxOutputTokens] = @MaxOutputTokens,
        [SupportedResponseFormats] = @SupportedResponseFormats,
        [SupportsEffortLevel] = @SupportsEffortLevel,
        [SupportsStreaming] = @SupportsStreaming,
        [TypeID] = @TypeID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModelVendors] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelVendors]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelVendor] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelVendor table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModelVendor
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelVendor
ON [${flyway:defaultSchema}].[AIModelVendor]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelVendor]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelVendor] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelVendor] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spDeleteAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelVendor]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelVendor]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]



/* Index for Foreign Keys for AccessControlRule */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table AccessControlRule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AccessControlRule_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AccessControlRule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AccessControlRule_EntityID ON [${flyway:defaultSchema}].[AccessControlRule] ([EntityID]);

-- Index for foreign key GrantedByUserID in table AccessControlRule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AccessControlRule_GrantedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AccessControlRule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AccessControlRule_GrantedByUserID ON [${flyway:defaultSchema}].[AccessControlRule] ([GrantedByUserID]);

/* Index for Foreign Keys for PublicLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table PublicLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PublicLink_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PublicLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PublicLink_UserID ON [${flyway:defaultSchema}].[PublicLink] ([UserID]);

/* Base View SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: vwAccessControlRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Access Control Rules
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AccessControlRule
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAccessControlRules]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAccessControlRules]
AS
SELECT
    a.*,
    Entity_EntityID.[Name] AS [Entity],
    User_GrantedByUserID.[Name] AS [GrantedByUser]
FROM
    [${flyway:defaultSchema}].[AccessControlRule] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [a].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_GrantedByUserID
  ON
    [a].[GrantedByUserID] = User_GrantedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAccessControlRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: Permissions for vwAccessControlRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAccessControlRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: spCreateAccessControlRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AccessControlRule
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAccessControlRule]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAccessControlRule]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(500),
    @GranteeType nvarchar(50),
    @GranteeID uniqueidentifier,
    @CanRead bit,
    @CanCreate bit,
    @CanUpdate bit,
    @CanDelete bit,
    @CanShare bit,
    @ExpiresAt datetimeoffset,
    @GrantedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AccessControlRule]
            (
                [ID],
                [EntityID],
                [RecordID],
                [GranteeType],
                [GranteeID],
                [CanRead],
                [CanCreate],
                [CanUpdate],
                [CanDelete],
                [CanShare],
                [ExpiresAt],
                [GrantedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                @GranteeType,
                @GranteeID,
                @CanRead,
                @CanCreate,
                @CanUpdate,
                @CanDelete,
                @CanShare,
                @ExpiresAt,
                @GrantedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AccessControlRule]
            (
                [EntityID],
                [RecordID],
                [GranteeType],
                [GranteeID],
                [CanRead],
                [CanCreate],
                [CanUpdate],
                [CanDelete],
                [CanShare],
                [ExpiresAt],
                [GrantedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                @GranteeType,
                @GranteeID,
                @CanRead,
                @CanCreate,
                @CanUpdate,
                @CanDelete,
                @CanShare,
                @ExpiresAt,
                @GrantedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAccessControlRules] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAccessControlRule] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Access Control Rules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAccessControlRule] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: spUpdateAccessControlRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AccessControlRule
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAccessControlRule]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAccessControlRule]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(500),
    @GranteeType nvarchar(50),
    @GranteeID uniqueidentifier,
    @CanRead bit,
    @CanCreate bit,
    @CanUpdate bit,
    @CanDelete bit,
    @CanShare bit,
    @ExpiresAt datetimeoffset,
    @GrantedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AccessControlRule]
    SET
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [GranteeType] = @GranteeType,
        [GranteeID] = @GranteeID,
        [CanRead] = @CanRead,
        [CanCreate] = @CanCreate,
        [CanUpdate] = @CanUpdate,
        [CanDelete] = @CanDelete,
        [CanShare] = @CanShare,
        [ExpiresAt] = @ExpiresAt,
        [GrantedByUserID] = @GrantedByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAccessControlRules] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAccessControlRules]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAccessControlRule] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AccessControlRule table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAccessControlRule
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAccessControlRule
ON [${flyway:defaultSchema}].[AccessControlRule]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AccessControlRule]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AccessControlRule] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Access Control Rules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAccessControlRule] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: spDeleteAccessControlRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AccessControlRule
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAccessControlRule]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAccessControlRule]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AccessControlRule]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAccessControlRule] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Access Control Rules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAccessControlRule] TO [cdp_Integration]



/* Base View SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: vwPublicLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Public Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PublicLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwPublicLinks]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPublicLinks]
AS
SELECT
    p.*,
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[PublicLink] AS p
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [p].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPublicLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: Permissions for vwPublicLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPublicLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: spCreatePublicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PublicLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreatePublicLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePublicLink]
    @ID uniqueidentifier = NULL,
    @ResourceType nvarchar(50),
    @ResourceID uniqueidentifier,
    @Token nvarchar(255),
    @PasswordHash nvarchar(255),
    @ExpiresAt datetimeoffset,
    @MaxViews int,
    @CurrentViews int,
    @UserID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PublicLink]
            (
                [ID],
                [ResourceType],
                [ResourceID],
                [Token],
                [PasswordHash],
                [ExpiresAt],
                [MaxViews],
                [CurrentViews],
                [UserID],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ResourceType,
                @ResourceID,
                @Token,
                @PasswordHash,
                @ExpiresAt,
                @MaxViews,
                @CurrentViews,
                @UserID,
                @IsActive
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PublicLink]
            (
                [ResourceType],
                [ResourceID],
                [Token],
                [PasswordHash],
                [ExpiresAt],
                [MaxViews],
                [CurrentViews],
                [UserID],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ResourceType,
                @ResourceID,
                @Token,
                @PasswordHash,
                @ExpiresAt,
                @MaxViews,
                @CurrentViews,
                @UserID,
                @IsActive
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPublicLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePublicLink] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Public Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePublicLink] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: spUpdatePublicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PublicLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdatePublicLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePublicLink]
    @ID uniqueidentifier,
    @ResourceType nvarchar(50),
    @ResourceID uniqueidentifier,
    @Token nvarchar(255),
    @PasswordHash nvarchar(255),
    @ExpiresAt datetimeoffset,
    @MaxViews int,
    @CurrentViews int,
    @UserID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PublicLink]
    SET
        [ResourceType] = @ResourceType,
        [ResourceID] = @ResourceID,
        [Token] = @Token,
        [PasswordHash] = @PasswordHash,
        [ExpiresAt] = @ExpiresAt,
        [MaxViews] = @MaxViews,
        [CurrentViews] = @CurrentViews,
        [UserID] = @UserID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPublicLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPublicLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePublicLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PublicLink table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdatePublicLink
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePublicLink
ON [${flyway:defaultSchema}].[PublicLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PublicLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PublicLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Public Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePublicLink] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: spDeletePublicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PublicLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeletePublicLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePublicLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PublicLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePublicLink] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Public Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePublicLink] TO [cdp_Integration]



/* Index for Foreign Keys for Artifact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_EnvironmentID ON [${flyway:defaultSchema}].[Artifact] ([EnvironmentID]);

-- Index for foreign key TypeID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_TypeID ON [${flyway:defaultSchema}].[Artifact] ([TypeID]);

-- Index for foreign key UserID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_UserID ON [${flyway:defaultSchema}].[Artifact] ([UserID]);

/* Base View SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: vwArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Artifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwArtifacts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifacts]
AS
SELECT
    a.*,
    Environment_EnvironmentID.[Name] AS [Environment],
    ArtifactType_TypeID.[Name] AS [Type],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[Artifact] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [a].[EnvironmentID] = Environment_EnvironmentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_TypeID
  ON
    [a].[TypeID] = ArtifactType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: Permissions for vwArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spCreateArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Artifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifact]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Artifact]
            (
                [ID],
                [EnvironmentID],
                [Name],
                [Description],
                [TypeID],
                [Comments],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @Name,
                @Description,
                @TypeID,
                @Comments,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Artifact]
            (
                [EnvironmentID],
                [Name],
                [Description],
                [TypeID],
                [Comments],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @Name,
                @Description,
                @TypeID,
                @Comments,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spUpdateArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Artifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifact]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Artifact]
    SET
        [EnvironmentID] = @EnvironmentID,
        [Name] = @Name,
        [Description] = @Description,
        [TypeID] = @TypeID,
        [Comments] = @Comments,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Artifact table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateArtifact
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifact
ON [${flyway:defaultSchema}].[Artifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Artifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Artifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spDeleteArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Artifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Artifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] TO [cdp_Integration]



/* Index for Foreign Keys for Task */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ParentID ON [${flyway:defaultSchema}].[Task] ([ParentID]);

-- Index for foreign key TypeID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_TypeID ON [${flyway:defaultSchema}].[Task] ([TypeID]);

-- Index for foreign key EnvironmentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_EnvironmentID ON [${flyway:defaultSchema}].[Task] ([EnvironmentID]);

-- Index for foreign key ProjectID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ProjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ProjectID ON [${flyway:defaultSchema}].[Task] ([ProjectID]);

-- Index for foreign key ConversationDetailID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ConversationDetailID ON [${flyway:defaultSchema}].[Task] ([ConversationDetailID]);

-- Index for foreign key UserID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_UserID ON [${flyway:defaultSchema}].[Task] ([UserID]);

-- Index for foreign key AgentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_AgentID ON [${flyway:defaultSchema}].[Task] ([AgentID]);

/* Index for Foreign Keys for Project */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Project
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Project_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Project]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Project_EnvironmentID ON [${flyway:defaultSchema}].[Project] ([EnvironmentID]);

-- Index for foreign key ParentID in table Project
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Project_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Project]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Project_ParentID ON [${flyway:defaultSchema}].[Project] ([ParentID]);

/* Base View SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tasks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Task
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwTasks]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTasks]
AS
SELECT
    t.*,
    Task_ParentID.[Name] AS [Parent],
    TaskType_TypeID.[Name] AS [Type],
    Environment_EnvironmentID.[Name] AS [Environment],
    Project_ProjectID.[Name] AS [Project],
    User_UserID.[Name] AS [User],
    AIAgent_AgentID.[Name] AS [Agent]
FROM
    [${flyway:defaultSchema}].[Task] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Task] AS Task_ParentID
  ON
    [t].[ParentID] = Task_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[TaskType] AS TaskType_TypeID
  ON
    [t].[TypeID] = TaskType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [t].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS Project_ProjectID
  ON
    [t].[ProjectID] = Project_ProjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [t].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [t].[AgentID] = AIAgent_AgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Permissions for vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spCreateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Task
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateTask]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTask]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @UserID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(50),
    @PercentComplete int,
    @DueAt datetimeoffset,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Task]
            (
                [ID],
                [ParentID],
                [Name],
                [Description],
                [TypeID],
                [EnvironmentID],
                [ProjectID],
                [ConversationDetailID],
                [UserID],
                [AgentID],
                [Status],
                [PercentComplete],
                [DueAt],
                [StartedAt],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @Description,
                @TypeID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ProjectID,
                @ConversationDetailID,
                @UserID,
                @AgentID,
                @Status,
                @PercentComplete,
                @DueAt,
                @StartedAt,
                @CompletedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Task]
            (
                [ParentID],
                [Name],
                [Description],
                [TypeID],
                [EnvironmentID],
                [ProjectID],
                [ConversationDetailID],
                [UserID],
                [AgentID],
                [Status],
                [PercentComplete],
                [DueAt],
                [StartedAt],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @Description,
                @TypeID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ProjectID,
                @ConversationDetailID,
                @UserID,
                @AgentID,
                @Status,
                @PercentComplete,
                @DueAt,
                @StartedAt,
                @CompletedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTask] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTask] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spUpdateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Task
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateTask]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTask]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @UserID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(50),
    @PercentComplete int,
    @DueAt datetimeoffset,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Task]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [TypeID] = @TypeID,
        [EnvironmentID] = @EnvironmentID,
        [ProjectID] = @ProjectID,
        [ConversationDetailID] = @ConversationDetailID,
        [UserID] = @UserID,
        [AgentID] = @AgentID,
        [Status] = @Status,
        [PercentComplete] = @PercentComplete,
        [DueAt] = @DueAt,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTasks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Task table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateTask
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTask
ON [${flyway:defaultSchema}].[Task]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Task]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Task] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spDeleteTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Task
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteTask]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTask]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Task]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTask] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTask] TO [cdp_Integration]



/* Base View SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: vwProjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Projects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Project
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwProjects]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProjects]
AS
SELECT
    p.*,
    Environment_EnvironmentID.[Name] AS [Environment],
    Project_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[Project] AS p
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [p].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS Project_ParentID
  ON
    [p].[ParentID] = Project_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: Permissions for vwProjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spCreateProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Project
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateProject]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProject]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Color nvarchar(7),
    @Icon nvarchar(50),
    @IsArchived bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Project]
            (
                [ID],
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Color],
                [Icon],
                [IsArchived]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ParentID,
                @Name,
                @Description,
                @Color,
                @Icon,
                @IsArchived
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Project]
            (
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Color],
                [Icon],
                [IsArchived]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ParentID,
                @Name,
                @Description,
                @Color,
                @Icon,
                @IsArchived
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProjects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spUpdateProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Project
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateProject]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProject]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Color nvarchar(7),
    @Icon nvarchar(50),
    @IsArchived bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Project]
    SET
        [EnvironmentID] = @EnvironmentID,
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Color] = @Color,
        [Icon] = @Icon,
        [IsArchived] = @IsArchived
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProjects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProjects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Project table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateProject
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProject
ON [${flyway:defaultSchema}].[Project]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Project]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Project] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spDeleteProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Project
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteProject]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProject]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Project]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] TO [cdp_Integration]



/* Index for Foreign Keys for ArtifactVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArtifactID in table ArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactVersion_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactVersion_ArtifactID ON [${flyway:defaultSchema}].[ArtifactVersion] ([ArtifactID]);

-- Index for foreign key UserID in table ArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactVersion_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactVersion_UserID ON [${flyway:defaultSchema}].[ArtifactVersion] ([UserID]);

/* Base View SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: vwArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwArtifactVersions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactVersions]
AS
SELECT
    a.*,
    Artifact_ArtifactID.[Name] AS [Artifact],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ArtifactVersion] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Artifact] AS Artifact_ArtifactID
  ON
    [a].[ArtifactID] = Artifact_ArtifactID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: Permissions for vwArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spCreateArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactVersion]
    @ID uniqueidentifier = NULL,
    @ArtifactID uniqueidentifier,
    @VersionNumber int,
    @Content nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersion]
            (
                [ID],
                [ArtifactID],
                [VersionNumber],
                [Content],
                [Configuration],
                [Comments],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArtifactID,
                @VersionNumber,
                @Content,
                @Configuration,
                @Comments,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersion]
            (
                [ArtifactID],
                [VersionNumber],
                [Content],
                [Configuration],
                [Comments],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactID,
                @VersionNumber,
                @Content,
                @Configuration,
                @Comments,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersion] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spUpdateArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactVersion]
    @ID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @VersionNumber int,
    @Content nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersion]
    SET
        [ArtifactID] = @ArtifactID,
        [VersionNumber] = @VersionNumber,
        [Content] = @Content,
        [Configuration] = @Configuration,
        [Comments] = @Comments,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactVersions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactVersion table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateArtifactVersion
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactVersion
ON [${flyway:defaultSchema}].[ArtifactVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spDeleteArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersion] TO [cdp_Integration]



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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
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
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
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



/* Index for Foreign Keys for Conversation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_UserID ON [${flyway:defaultSchema}].[Conversation] ([UserID]);

-- Index for foreign key LinkedEntityID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID ON [${flyway:defaultSchema}].[Conversation] ([LinkedEntityID]);

-- Index for foreign key DataContextID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_DataContextID ON [${flyway:defaultSchema}].[Conversation] ([DataContextID]);

-- Index for foreign key EnvironmentID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID ON [${flyway:defaultSchema}].[Conversation] ([EnvironmentID]);

-- Index for foreign key ProjectID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_ProjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_ProjectID ON [${flyway:defaultSchema}].[Conversation] ([ProjectID]);

/* Base View SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Conversations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Conversation
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversations]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversations]
AS
SELECT
    c.*,
    User_UserID.[Name] AS [User],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity],
    DataContext_DataContextID.[Name] AS [DataContext],
    Environment_EnvironmentID.[Name] AS [Environment],
    Project_ProjectID.[Name] AS [Project]
FROM
    [${flyway:defaultSchema}].[Conversation] AS c
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_LinkedEntityID
  ON
    [c].[LinkedEntityID] = Entity_LinkedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [c].[DataContextID] = DataContext_DataContextID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [c].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS Project_ProjectID
  ON
    [c].[ProjectID] = Project_ProjectID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: Permissions for vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spCreateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversation]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier,
    @Status nvarchar(20),
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @IsPinned bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Conversation]
            (
                [ID],
                [UserID],
                [ExternalID],
                [Name],
                [Description],
                [Type],
                [IsArchived],
                [LinkedEntityID],
                [LinkedRecordID],
                [DataContextID],
                [Status],
                [EnvironmentID],
                [ProjectID],
                [IsPinned]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @ExternalID,
                @Name,
                @Description,
                @Type,
                @IsArchived,
                @LinkedEntityID,
                @LinkedRecordID,
                @DataContextID,
                @Status,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ProjectID,
                @IsPinned
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Conversation]
            (
                [UserID],
                [ExternalID],
                [Name],
                [Description],
                [Type],
                [IsArchived],
                [LinkedEntityID],
                [LinkedRecordID],
                [DataContextID],
                [Status],
                [EnvironmentID],
                [ProjectID],
                [IsPinned]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @ExternalID,
                @Name,
                @Description,
                @Type,
                @IsArchived,
                @LinkedEntityID,
                @LinkedRecordID,
                @DataContextID,
                @Status,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE @EnvironmentID END,
                @ProjectID,
                @IsPinned
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spUpdateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversation]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier,
    @Status nvarchar(20),
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @IsPinned bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        [UserID] = @UserID,
        [ExternalID] = @ExternalID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [IsArchived] = @IsArchived,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordID] = @LinkedRecordID,
        [DataContextID] = @DataContextID,
        [Status] = @Status,
        [EnvironmentID] = @EnvironmentID,
        [ProjectID] = @ProjectID,
        [IsPinned] = @IsPinned
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversation
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversation
ON [${flyway:defaultSchema}].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Conversation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
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
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
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



