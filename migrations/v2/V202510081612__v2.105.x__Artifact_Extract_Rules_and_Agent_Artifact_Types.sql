-- =====================================================================================
-- MemberJunction v2.105.x - Artifact Extract Rules and Agent Artifact Types
-- =====================================================================================
-- This migration adds:
-- 1. ParentID recursive FK to ArtifactType for hierarchy
-- 2. ExtractRules JSON column to ArtifactType for defining extraction logic
-- 3. AgentArtifactType junction table for agent-artifact type associations
-- 4. Name and Description columns to ArtifactVersion
-- 5. ArtifactVersionAttribute table for storing extracted attribute values
-- =====================================================================================

-- =====================================================================================
-- PART 1: ArtifactType - Add ParentID and ExtractRules
-- =====================================================================================

-- Add ParentID for hierarchical artifact types
ALTER TABLE ${flyway:defaultSchema}.ArtifactType
ADD ParentID UNIQUEIDENTIFIER NULL;

-- Add foreign key constraint for ParentID (recursive relationship)
ALTER TABLE ${flyway:defaultSchema}.ArtifactType
ADD CONSTRAINT FK_ArtifactType_Parent FOREIGN KEY (ParentID)
    REFERENCES ${flyway:defaultSchema}.ArtifactType(ID);

-- Add ExtractRules JSON column for defining extraction logic
ALTER TABLE ${flyway:defaultSchema}.ArtifactType
ADD ExtractRules NVARCHAR(MAX) NULL;

-- =====================================================================================
-- PART 2: Create AgentArtifactType junction table
-- =====================================================================================

ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD DefaultArtifactTypeID UNIQUEIDENTIFIER NULL;

-- Add foreign key constraint for DefaultArtifactTypeID
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD CONSTRAINT FK_AIAgent_DefaultArtifactType FOREIGN KEY (DefaultArtifactTypeID)
    REFERENCES ${flyway:defaultSchema}.ArtifactType(ID);


CREATE TABLE ${flyway:defaultSchema}.AIAgentArtifactType (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_AIAgentArtifactType_ID DEFAULT (newsequentialid()),
    AgentID UNIQUEIDENTIFIER NOT NULL,
    ArtifactTypeID UNIQUEIDENTIFIER NOT NULL,
    Sequence INT NULL, -- For ordering multiple artifact types per agent
    CONSTRAINT PK_AIAgentArtifactType PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentArtifactType_Agent FOREIGN KEY (AgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AIAgentArtifactType_ArtifactType FOREIGN KEY (ArtifactTypeID)
        REFERENCES ${flyway:defaultSchema}.ArtifactType(ID),
    CONSTRAINT UQ_AIAgentArtifactType_Agent_ArtifactType UNIQUE (AgentID, ArtifactTypeID)
);

-- =====================================================================================
-- PART 3: ArtifactVersion - Add Name and Description
-- =====================================================================================

-- Add Name and Description to ArtifactVersion (can vary per version)
ALTER TABLE ${flyway:defaultSchema}.ArtifactVersion
ADD Name NVARCHAR(255) NULL,
    Description NVARCHAR(MAX) NULL;

-- =====================================================================================
-- PART 4: Create ArtifactVersionAttribute table
-- =====================================================================================

CREATE TABLE ${flyway:defaultSchema}.ArtifactVersionAttribute (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ArtifactVersionAttribute_ID DEFAULT (newsequentialid()),
    ArtifactVersionID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL, -- From extract rule name
    Type NVARCHAR(500) NOT NULL, -- TypeScript type definition (e.g., 'string', 'number', 'Array<{x: number, y: string}>')
    Value NVARCHAR(MAX) NULL, -- JSON-serialized value
    StandardProperty NVARCHAR(50) NULL, -- 'name' | 'description' | 'displayMarkdown' | 'displayHtml' | NULL
    CONSTRAINT PK_ArtifactVersionAttribute PRIMARY KEY (ID),
    CONSTRAINT FK_ArtifactVersionAttribute_ArtifactVersion FOREIGN KEY (ArtifactVersionID)
        REFERENCES ${flyway:defaultSchema}.ArtifactVersion(ID),
    CONSTRAINT UQ_ArtifactVersionAttribute_Version_Name UNIQUE (ArtifactVersionID, Name),
    CONSTRAINT CK_ArtifactVersionAttribute_StandardProperty CHECK (StandardProperty IN ('name', 'description', 'displayMarkdown', 'displayHtml'))
);

-- =====================================================================================
-- Extended Property Descriptions
-- =====================================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default artifact type produced by this agent. This is the primary artifact type; additional artifact types can be linked via AIAgentArtifactType junction table. Can be NULL if agent does not produce artifacts by default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'DefaultArtifactTypeID';



-- ArtifactType.ParentID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Parent artifact type ID for hierarchical artifact type organization. Child types inherit ExtractRules from parent but can override.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactType',
    @level2type = N'COLUMN', @level2name = 'ParentID';

-- ArtifactType.ExtractRules
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of extraction rules defining how to extract attributes from artifact content. Each rule has: name (string), description (string), type (TypeScript type), standardProperty (''name''|''description''|''displayMarkdown''|''displayHtml''|null), extractor (JavaScript code string). Child types inherit parent rules and can override by name.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactType',
    @level2type = N'COLUMN', @level2name = 'ExtractRules';

-- AgentArtifactType table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Junction table linking AI Agents to the artifact types they can produce. An agent can produce zero to many artifact types.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentArtifactType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI Agent that can produce this artifact type',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentArtifactType',
    @level2type = N'COLUMN', @level2name = 'AgentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Artifact type that this agent can produce',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentArtifactType',
    @level2type = N'COLUMN', @level2name = 'ArtifactTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional sequence for ordering multiple artifact types for an agent',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentArtifactType',
    @level2type = N'COLUMN', @level2name = 'Sequence';

-- ArtifactVersion.Name
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of this artifact version. Can differ from Artifact.Name as it may evolve with versions.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'Name';

-- ArtifactVersion.Description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of this artifact version. Can differ from Artifact.Description as it may evolve with versions.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'Description';

-- ArtifactVersionAttribute table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores extracted attribute values from artifact content based on ArtifactType ExtractRules. Prevents re-running extraction logic on every access.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersionAttribute';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The artifact version this attribute belongs to',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersionAttribute',
    @level2type = N'COLUMN', @level2name = 'ArtifactVersionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the extracted attribute (matches ExtractRule.name)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersionAttribute',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'TypeScript type definition of the value (e.g., ''string'', ''number'', ''Date'', ''Array<{x: number, y: string}>'')',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersionAttribute',
    @level2type = N'COLUMN', @level2name = 'Type';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON-serialized extracted value',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersionAttribute',
    @level2type = N'COLUMN', @level2name = 'Value';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maps this attribute to a standard property for UI rendering: ''name'', ''description'', ''displayMarkdown'', ''displayHtml'', or NULL for custom attributes',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ArtifactVersionAttribute',
    @level2type = N'COLUMN', @level2name = 'StandardProperty';









































-- CODE GEN RUN 
/* SQL generated to create new entity MJ: AI Agent Artifact Types */

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
         '9e05b993-96a3-4e96-be9b-60c644d575cf',
         'MJ: AI Agent Artifact Types',
         'AI Agent Artifact Types',
         NULL,
         NULL,
         'AIAgentArtifactType',
         'vwAIAgentArtifactTypes',
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
   

/* SQL generated to add new entity MJ: AI Agent Artifact Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9e05b993-96a3-4e96-be9b-60c644d575cf', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Agent Artifact Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9e05b993-96a3-4e96-be9b-60c644d575cf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Artifact Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9e05b993-96a3-4e96-be9b-60c644d575cf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Artifact Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9e05b993-96a3-4e96-be9b-60c644d575cf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Artifact Version Attributes */

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
         '5d4bc8d7-ab3f-444e-b85a-fc89297887b2',
         'MJ: Artifact Version Attributes',
         'Artifact Version Attributes',
         NULL,
         NULL,
         'ArtifactVersionAttribute',
         'vwArtifactVersionAttributes',
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
   

/* SQL generated to add new entity MJ: Artifact Version Attributes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '5d4bc8d7-ab3f-444e-b85a-fc89297887b2', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Artifact Version Attributes for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5d4bc8d7-ab3f-444e-b85a-fc89297887b2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Artifact Version Attributes for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5d4bc8d7-ab3f-444e-b85a-fc89297887b2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Artifact Version Attributes for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5d4bc8d7-ab3f-444e-b85a-fc89297887b2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentArtifactType */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentArtifactType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentArtifactType */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentArtifactType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactVersionAttribute */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactVersionAttribute] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactVersionAttribute */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactVersionAttribute] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f58ea638-ce95-4d2a-9095-9909149b83c7'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'DefaultArtifactTypeID')
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
            'f58ea638-ce95-4d2a-9095-9909149b83c7',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100078,
            'DefaultArtifactTypeID',
            'Default Artifact Type ID',
            'Default artifact type produced by this agent. This is the primary artifact type; additional artifact types can be linked via AIAgentArtifactType junction table. Can be NULL if agent does not produce artifacts by default.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
         WHERE ID = 'f2737af4-09b8-4d72-84a0-39ae1600bef7'  OR 
               (EntityID = '9E05B993-96A3-4E96-BE9B-60C644D575CF' AND Name = 'ID')
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
            'f2737af4-09b8-4d72-84a0-39ae1600bef7',
            '9E05B993-96A3-4E96-BE9B-60C644D575CF', -- Entity: MJ: AI Agent Artifact Types
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
         WHERE ID = '16db9e63-3a14-4c12-85ef-8ffc777ca031'  OR 
               (EntityID = '9E05B993-96A3-4E96-BE9B-60C644D575CF' AND Name = 'AgentID')
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
            '16db9e63-3a14-4c12-85ef-8ffc777ca031',
            '9E05B993-96A3-4E96-BE9B-60C644D575CF', -- Entity: MJ: AI Agent Artifact Types
            100002,
            'AgentID',
            'Agent ID',
            'AI Agent that can produce this artifact type',
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
         WHERE ID = '6e49dcd8-d78e-43ef-921f-0b7135edadf7'  OR 
               (EntityID = '9E05B993-96A3-4E96-BE9B-60C644D575CF' AND Name = 'ArtifactTypeID')
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
            '6e49dcd8-d78e-43ef-921f-0b7135edadf7',
            '9E05B993-96A3-4E96-BE9B-60C644D575CF', -- Entity: MJ: AI Agent Artifact Types
            100003,
            'ArtifactTypeID',
            'Artifact Type ID',
            'Artifact type that this agent can produce',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c5176c15-e4c1-4b22-a644-e141adacfe38'  OR 
               (EntityID = '9E05B993-96A3-4E96-BE9B-60C644D575CF' AND Name = 'Sequence')
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
            'c5176c15-e4c1-4b22-a644-e141adacfe38',
            '9E05B993-96A3-4E96-BE9B-60C644D575CF', -- Entity: MJ: AI Agent Artifact Types
            100004,
            'Sequence',
            'Sequence',
            'Optional sequence for ordering multiple artifact types for an agent',
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
         WHERE ID = 'e787dcef-baa7-4c4d-83e4-340cb3c8a132'  OR 
               (EntityID = '9E05B993-96A3-4E96-BE9B-60C644D575CF' AND Name = '__mj_CreatedAt')
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
            'e787dcef-baa7-4c4d-83e4-340cb3c8a132',
            '9E05B993-96A3-4E96-BE9B-60C644D575CF', -- Entity: MJ: AI Agent Artifact Types
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
         WHERE ID = 'd7ef7f8c-db02-4e75-aba8-77f418684230'  OR 
               (EntityID = '9E05B993-96A3-4E96-BE9B-60C644D575CF' AND Name = '__mj_UpdatedAt')
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
            'd7ef7f8c-db02-4e75-aba8-77f418684230',
            '9E05B993-96A3-4E96-BE9B-60C644D575CF', -- Entity: MJ: AI Agent Artifact Types
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
         WHERE ID = '02b6383f-bae6-465c-bbb4-652e6f75a74c'  OR 
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'ParentID')
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
            '02b6383f-bae6-465c-bbb4-652e6f75a74c',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            100015,
            'ParentID',
            'Parent ID',
            'Parent artifact type ID for hierarchical artifact type organization. Child types inherit ExtractRules from parent but can override.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
         WHERE ID = '6cace3bf-bdf2-4443-9d2c-e28e4fe4e489'  OR 
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'ExtractRules')
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
            '6cace3bf-bdf2-4443-9d2c-e28e4fe4e489',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            100016,
            'ExtractRules',
            'Extract Rules',
            'JSON array of extraction rules defining how to extract attributes from artifact content. Each rule has: name (string), description (string), type (TypeScript type), standardProperty (''name''|''description''|''displayMarkdown''|''displayHtml''|null), extractor (JavaScript code string). Child types inherit parent rules and can override by name.',
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
         WHERE ID = 'c8da4933-f812-48b2-a445-e49413076b6b'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'Name')
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
            'c8da4933-f812-48b2-a445-e49413076b6b',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100023,
            'Name',
            'Name',
            'Name of this artifact version. Can differ from Artifact.Name as it may evolve with versions.',
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
         WHERE ID = '96e57b30-5efd-4612-a28e-16ab359864ea'  OR 
               (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'Description')
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
            '96e57b30-5efd-4612-a28e-16ab359864ea',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100024,
            'Description',
            'Description',
            'Description of this artifact version. Can differ from Artifact.Description as it may evolve with versions.',
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
         WHERE ID = '846ecc90-cc37-4bd8-9005-48c5c0422f82'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = 'ID')
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
            '846ecc90-cc37-4bd8-9005-48c5c0422f82',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
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
         WHERE ID = 'aa6a1211-4fb0-4942-9952-6cf444aa2c9c'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = 'ArtifactVersionID')
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
            'aa6a1211-4fb0-4942-9952-6cf444aa2c9c',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
            100002,
            'ArtifactVersionID',
            'Artifact Version ID',
            'The artifact version this attribute belongs to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01',
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
         WHERE ID = '6c4ba62e-2e1f-4c23-933f-2c565d9f0db6'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = 'Name')
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
            '6c4ba62e-2e1f-4c23-933f-2c565d9f0db6',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
            100003,
            'Name',
            'Name',
            'Name of the extracted attribute (matches ExtractRule.name)',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8d71c3ae-ecc3-4b90-9664-ca1c0abdf926'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = 'Type')
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
            '8d71c3ae-ecc3-4b90-9664-ca1c0abdf926',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
            100004,
            'Type',
            'Type',
            'TypeScript type definition of the value (e.g., ''string'', ''number'', ''Date'', ''Array<{x: number, y: string}>'')',
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
         WHERE ID = '9604e1ae-6581-41c7-ac6a-5732465fda79'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = 'Value')
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
            '9604e1ae-6581-41c7-ac6a-5732465fda79',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
            100005,
            'Value',
            'Value',
            'JSON-serialized extracted value',
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
         WHERE ID = '9a18cb1c-86a9-4d80-b388-c49b2c50edae'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = 'StandardProperty')
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
            '9a18cb1c-86a9-4d80-b388-c49b2c50edae',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
            100006,
            'StandardProperty',
            'Standard Property',
            'Maps this attribute to a standard property for UI rendering: ''name'', ''description'', ''displayMarkdown'', ''displayHtml'', or NULL for custom attributes',
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
         WHERE ID = '36117514-fe7f-4302-86f0-05b76bdc3d3d'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = '__mj_CreatedAt')
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
            '36117514-fe7f-4302-86f0-05b76bdc3d3d',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
            100007,
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
         WHERE ID = '88437ba7-3546-43de-b18d-493d5833b3a3'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = '__mj_UpdatedAt')
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
            '88437ba7-3546-43de-b18d-493d5833b3a3',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
            100008,
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
                                       ('9A18CB1C-86A9-4D80-B388-C49B2C50EDAE', 1, 'name', 'name')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9A18CB1C-86A9-4D80-B388-C49B2C50EDAE', 2, 'description', 'description')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9A18CB1C-86A9-4D80-B388-C49B2C50EDAE', 3, 'displayMarkdown', 'displayMarkdown')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9A18CB1C-86A9-4D80-B388-C49B2C50EDAE', 4, 'displayHtml', 'displayHtml')

/* SQL text to update ValueListType for entity field ID 9A18CB1C-86A9-4D80-B388-C49B2C50EDAE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9A18CB1C-86A9-4D80-B388-C49B2C50EDAE'

/* SQL text to delete entity field value ID C1C2433E-F36B-1410-8DCA-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='C1C2433E-F36B-1410-8DCA-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='49C3433E-F36B-1410-8DCA-00021F8B792E'

/* SQL text to delete entity field value ID C6C2433E-F36B-1410-8DCA-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='C6C2433E-F36B-1410-8DCA-00021F8B792E'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '28228341-0f5d-48b5-bbcc-de88adf0028d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('28228341-0f5d-48b5-bbcc-de88adf0028d', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '9E05B993-96A3-4E96-BE9B-60C644D575CF', 'AgentID', 'One To Many', 1, 1, 'MJ: AI Agent Artifact Types', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '15066f60-7896-42e3-aac4-8c8cafef9bf9'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('15066f60-7896-42e3-aac4-8c8cafef9bf9', '91797885-7128-4B71-8C4B-81C5FEE24F38', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'DefaultArtifactTypeID', 'One To Many', 1, 1, 'AI Agents', 17);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '754016fe-cb38-41e4-8fa4-674125a2dfc2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('754016fe-cb38-41e4-8fa4-674125a2dfc2', '91797885-7128-4B71-8C4B-81C5FEE24F38', '9E05B993-96A3-4E96-BE9B-60C644D575CF', 'ArtifactTypeID', 'One To Many', 1, 1, 'MJ: AI Agent Artifact Types', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c37e1d16-9fc0-4f2d-bb19-f3b47ff1a286'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c37e1d16-9fc0-4f2d-bb19-f3b47ff1a286', '91797885-7128-4B71-8C4B-81C5FEE24F38', '91797885-7128-4B71-8C4B-81C5FEE24F38', 'ParentID', 'One To Many', 1, 1, 'MJ: Artifact Types', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6d2b20f9-a1ca-445a-9ad1-2277730a05e1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6d2b20f9-a1ca-445a-9ad1-2277730a05e1', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', 'ArtifactVersionID', 'One To Many', 1, 1, 'MJ: Artifact Version Attributes', 1);
   END
                              

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

/* SQL text to update entity field related entity name field map for entity field ID F58EA638-CE95-4D2A-9095-9909149B83C7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F58EA638-CE95-4D2A-9095-9909149B83C7',
         @RelatedEntityNameFieldMap='DefaultArtifactType'

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
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgents]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    AIAgent_ParentID.[Name] AS [Parent],
    AIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    AIAgentType_TypeID.[Name] AS [Type],
    ArtifactType_DefaultArtifactTypeID.[Name] AS [DefaultArtifactType]
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
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
    @DefaultArtifactTypeID uniqueidentifier
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
                [DefaultArtifactTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                @ExposeAsAction,
                @ExecutionOrder,
                @ExecutionMode,
                @EnableContextCompression,
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                @Status,
                @DriverClass,
                @IconClass,
                @ModelSelectionMode,
                @PayloadDownstreamPaths,
                @PayloadUpstreamPaths,
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                @FinalPayloadValidationMode,
                @FinalPayloadValidationMaxRetries,
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                @StartingPayloadValidationMode,
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID
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
                [DefaultArtifactTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                @ExposeAsAction,
                @ExecutionOrder,
                @ExecutionMode,
                @EnableContextCompression,
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                @Status,
                @DriverClass,
                @IconClass,
                @ModelSelectionMode,
                @PayloadDownstreamPaths,
                @PayloadUpstreamPaths,
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                @FinalPayloadValidationMode,
                @FinalPayloadValidationMaxRetries,
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                @StartingPayloadValidationMode,
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgent]
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
    @DefaultArtifactTypeID uniqueidentifier
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
        [DefaultArtifactTypeID] = @DefaultArtifactTypeID
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
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgent
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgent]
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



/* SQL text to update entity field related entity name field map for entity field ID 3CBD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3CBD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 4EBD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4EBD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 18BD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='18BD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 73BC433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='73BC433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID A3BC433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A3BC433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 21BD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='21BD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 24BD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='24BD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 27BD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='27BD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 8EBC433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8EBC433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID E2BC433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E2BC433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 91BC433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='91BC433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 94BC433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='94BC433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

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



/* Index for Foreign Keys for AIAgentArtifactType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Artifact Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentArtifactType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentArtifactType_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentArtifactType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentArtifactType_AgentID ON [${flyway:defaultSchema}].[AIAgentArtifactType] ([AgentID]);

-- Index for foreign key ArtifactTypeID in table AIAgentArtifactType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentArtifactType_ArtifactTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentArtifactType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentArtifactType_ArtifactTypeID ON [${flyway:defaultSchema}].[AIAgentArtifactType] ([ArtifactTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 16DB9E63-3A14-4C12-85EF-8FFC777CA031 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='16DB9E63-3A14-4C12-85EF-8FFC777CA031',
         @RelatedEntityNameFieldMap='Agent'

/* SQL text to update entity field related entity name field map for entity field ID 6E49DCD8-D78E-43EF-921F-0B7135EDADF7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6E49DCD8-D78E-43EF-921F-0B7135EDADF7',
         @RelatedEntityNameFieldMap='ArtifactType'

/* Base View SQL for MJ: AI Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Artifact Types
-- Item: vwAIAgentArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Artifact Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentArtifactType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentArtifactTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentArtifactTypes]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    ArtifactType_ArtifactTypeID.[Name] AS [ArtifactType]
FROM
    [${flyway:defaultSchema}].[AIAgentArtifactType] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_ArtifactTypeID
  ON
    [a].[ArtifactTypeID] = ArtifactType_ArtifactTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Artifact Types
-- Item: Permissions for vwAIAgentArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Artifact Types
-- Item: spCreateAIAgentArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentArtifactType]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ArtifactTypeID uniqueidentifier,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentArtifactType]
            (
                [ID],
                [AgentID],
                [ArtifactTypeID],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ArtifactTypeID,
                @Sequence
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentArtifactType]
            (
                [AgentID],
                [ArtifactTypeID],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ArtifactTypeID,
                @Sequence
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentArtifactTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentArtifactType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Artifact Types
-- Item: spUpdateAIAgentArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentArtifactType]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ArtifactTypeID uniqueidentifier,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentArtifactType]
    SET
        [AgentID] = @AgentID,
        [ArtifactTypeID] = @ArtifactTypeID,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentArtifactTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentArtifactTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentArtifactType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentArtifactType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentArtifactType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentArtifactType
ON [${flyway:defaultSchema}].[AIAgentArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentArtifactType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentArtifactType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Artifact Types
-- Item: spDeleteAIAgentArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentArtifactType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] TO [cdp_Integration]



/* Index for Foreign Keys for ArtifactType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table ArtifactType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactType_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactType_ParentID ON [${flyway:defaultSchema}].[ArtifactType] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID 02B6383F-BAE6-465C-BBB4-652E6F75A74C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='02B6383F-BAE6-465C-BBB4-652E6F75A74C',
         @RelatedEntityNameFieldMap='Parent'

/* Base View SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwArtifactTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactTypes]
AS
SELECT
    a.*,
    ArtifactType_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[ArtifactType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_ParentID
  ON
    [a].[ParentID] = ArtifactType_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Permissions for vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spCreateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit,
    @ParentID uniqueidentifier,
    @ExtractRules nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[ArtifactType]
        (
            [Name],
                [Description],
                [ContentType],
                [IsEnabled],
                [ParentID],
                [ExtractRules],
                [ID]
        )
    VALUES
        (
            @Name,
                @Description,
                @ContentType,
                @IsEnabled,
                @ParentID,
                @ExtractRules,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spUpdateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit,
    @ParentID uniqueidentifier,
    @ExtractRules nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ContentType] = @ContentType,
        [IsEnabled] = @IsEnabled,
        [ParentID] = @ParentID,
        [ExtractRules] = @ExtractRules
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateArtifactType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactType
ON [${flyway:defaultSchema}].[ArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]



/* Index for Foreign Keys for ArtifactVersionAttribute */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArtifactVersionID in table ArtifactVersionAttribute
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactVersionAttribute_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactVersionAttribute]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactVersionAttribute_ArtifactVersionID ON [${flyway:defaultSchema}].[ArtifactVersionAttribute] ([ArtifactVersionID]);

/* SQL text to update entity field related entity name field map for entity field ID AA6A1211-4FB0-4942-9952-6CF444AA2C9C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AA6A1211-4FB0-4942-9952-6CF444AA2C9C',
         @RelatedEntityNameFieldMap='ArtifactVersion'

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
    @UserID uniqueidentifier,
    @ContentHash nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX)
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
                [UserID],
                [ContentHash],
                [Name],
                [Description]
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
                @UserID,
                @ContentHash,
                @Name,
                @Description
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
                [UserID],
                [ContentHash],
                [Name],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactID,
                @VersionNumber,
                @Content,
                @Configuration,
                @Comments,
                @UserID,
                @ContentHash,
                @Name,
                @Description
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
    @UserID uniqueidentifier,
    @ContentHash nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX)
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
        [UserID] = @UserID,
        [ContentHash] = @ContentHash,
        [Name] = @Name,
        [Description] = @Description
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



/* Base View SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: vwArtifactVersionAttributes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Version Attributes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactVersionAttribute
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwArtifactVersionAttributes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactVersionAttributes]
AS
SELECT
    a.*,
    ArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion]
FROM
    [${flyway:defaultSchema}].[ArtifactVersionAttribute] AS a
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS ArtifactVersion_ArtifactVersionID
  ON
    [a].[ArtifactVersionID] = ArtifactVersion_ArtifactVersionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersionAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: Permissions for vwArtifactVersionAttributes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersionAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spCreateArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateArtifactVersionAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactVersionAttribute]
    @ID uniqueidentifier = NULL,
    @ArtifactVersionID uniqueidentifier,
    @Name nvarchar(255),
    @Type nvarchar(500),
    @Value nvarchar(MAX),
    @StandardProperty nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersionAttribute]
            (
                [ID],
                [ArtifactVersionID],
                [Name],
                [Type],
                [Value],
                [StandardProperty]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArtifactVersionID,
                @Name,
                @Type,
                @Value,
                @StandardProperty
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersionAttribute]
            (
                [ArtifactVersionID],
                [Name],
                [Type],
                [Value],
                [StandardProperty]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactVersionID,
                @Name,
                @Type,
                @Value,
                @StandardProperty
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactVersionAttributes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersionAttribute] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Version Attributes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersionAttribute] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spUpdateArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute]
    @ID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @Name nvarchar(255),
    @Type nvarchar(500),
    @Value nvarchar(MAX),
    @StandardProperty nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersionAttribute]
    SET
        [ArtifactVersionID] = @ArtifactVersionID,
        [Name] = @Name,
        [Type] = @Type,
        [Value] = @Value,
        [StandardProperty] = @StandardProperty
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactVersionAttributes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactVersionAttributes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactVersionAttribute table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateArtifactVersionAttribute
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactVersionAttribute
ON [${flyway:defaultSchema}].[ArtifactVersionAttribute]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersionAttribute]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactVersionAttribute] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Version Attributes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spDeleteArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactVersionAttribute]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Version Attributes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID C45DA881-7CD4-424E-8855-C259F531E018 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C45DA881-7CD4-424E-8855-C259F531E018',
         @RelatedEntityNameFieldMap='ArtifactVersion'

/* SQL text to update entity field related entity name field map for entity field ID 18BE433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='18BE433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 91BD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='91BD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 19BE433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='19BE433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID ADBD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ADBD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID B4BD433E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B4BD433E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6c1c76df-bbff-4903-9bb9-3325b5abb4b1'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'DefaultArtifactType')
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
            '6c1c76df-bbff-4903-9bb9-3325b5abb4b1',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100083,
            'DefaultArtifactType',
            'Default Artifact Type',
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
         WHERE ID = '07bf8f19-86a4-44a9-af0e-8ff9b09c8e6f'  OR 
               (EntityID = '9E05B993-96A3-4E96-BE9B-60C644D575CF' AND Name = 'Agent')
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
            '07bf8f19-86a4-44a9-af0e-8ff9b09c8e6f',
            '9E05B993-96A3-4E96-BE9B-60C644D575CF', -- Entity: MJ: AI Agent Artifact Types
            100013,
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
         WHERE ID = 'e1acc909-e34d-40a4-9110-65dd258058ec'  OR 
               (EntityID = '9E05B993-96A3-4E96-BE9B-60C644D575CF' AND Name = 'ArtifactType')
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
            'e1acc909-e34d-40a4-9110-65dd258058ec',
            '9E05B993-96A3-4E96-BE9B-60C644D575CF', -- Entity: MJ: AI Agent Artifact Types
            100014,
            'ArtifactType',
            'Artifact Type',
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
         WHERE ID = '63d25bcf-550e-4013-ab1f-03657369b0e9'  OR 
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'Parent')
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
            '63d25bcf-550e-4013-ab1f-03657369b0e9',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            100019,
            'Parent',
            'Parent',
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
         WHERE ID = 'a4a4ff94-a7db-495e-8055-cad07ad96945'  OR 
               (EntityID = '5D4BC8D7-AB3F-444E-B85A-FC89297887B2' AND Name = 'ArtifactVersion')
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
            'a4a4ff94-a7db-495e-8055-cad07ad96945',
            '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', -- Entity: MJ: Artifact Version Attributes
            100017,
            'ArtifactVersion',
            'Artifact Version',
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

