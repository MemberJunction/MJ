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

CREATE TABLE ${flyway:defaultSchema}.AgentArtifactType (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_AgentArtifactType_ID DEFAULT (newsequentialid()),
    AgentID UNIQUEIDENTIFIER NOT NULL,
    ArtifactTypeID UNIQUEIDENTIFIER NOT NULL,
    Sequence INT NULL, -- For ordering multiple artifact types per agent
    CONSTRAINT PK_AgentArtifactType PRIMARY KEY (ID),
    CONSTRAINT FK_AgentArtifactType_Agent FOREIGN KEY (AgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AgentArtifactType_ArtifactType FOREIGN KEY (ArtifactTypeID)
        REFERENCES ${flyway:defaultSchema}.ArtifactType(ID),
    CONSTRAINT UQ_AgentArtifactType_Agent_ArtifactType UNIQUE (AgentID, ArtifactTypeID)
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
    @level1type = N'TABLE', @level1name = 'AgentArtifactType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI Agent that can produce this artifact type',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentArtifactType',
    @level2type = N'COLUMN', @level2name = 'AgentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Artifact type that this agent can produce',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentArtifactType',
    @level2type = N'COLUMN', @level2name = 'ArtifactTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional sequence for ordering multiple artifact types for an agent',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentArtifactType',
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
/* SQL generated to create new entity MJ: Agent Artifact Types */

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
         'ae65a416-5173-486b-8c26-80ec3320d2ee',
         'MJ: Agent Artifact Types',
         'Agent Artifact Types',
         NULL,
         NULL,
         'AgentArtifactType',
         'vwAgentArtifactTypes',
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
   

/* SQL generated to add new entity MJ: Agent Artifact Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ae65a416-5173-486b-8c26-80ec3320d2ee', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Agent Artifact Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae65a416-5173-486b-8c26-80ec3320d2ee', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Agent Artifact Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae65a416-5173-486b-8c26-80ec3320d2ee', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Agent Artifact Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae65a416-5173-486b-8c26-80ec3320d2ee', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'fe6f3995-2ebd-4ae0-a4dd-939a21c4baca',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fe6f3995-2ebd-4ae0-a4dd-939a21c4baca', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Artifact Version Attributes for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fe6f3995-2ebd-4ae0-a4dd-939a21c4baca', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Artifact Version Attributes for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fe6f3995-2ebd-4ae0-a4dd-939a21c4baca', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Artifact Version Attributes for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fe6f3995-2ebd-4ae0-a4dd-939a21c4baca', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AgentArtifactType */
ALTER TABLE [${flyway:defaultSchema}].[AgentArtifactType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AgentArtifactType */
ALTER TABLE [${flyway:defaultSchema}].[AgentArtifactType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactVersionAttribute */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactVersionAttribute] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactVersionAttribute */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactVersionAttribute] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '17abd11a-56f8-4bf5-bc3d-aacd729bc187'  OR 
               (EntityID = 'AE65A416-5173-486B-8C26-80EC3320D2EE' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '17abd11a-56f8-4bf5-bc3d-aacd729bc187',
            'AE65A416-5173-486B-8C26-80EC3320D2EE', -- Entity: MJ: Agent Artifact Types
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
         WHERE ID = '676718ba-263b-4bc7-9ad3-162c8514fdd3'  OR 
               (EntityID = 'AE65A416-5173-486B-8C26-80EC3320D2EE' AND Name = 'AgentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '676718ba-263b-4bc7-9ad3-162c8514fdd3',
            'AE65A416-5173-486B-8C26-80EC3320D2EE', -- Entity: MJ: Agent Artifact Types
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
         WHERE ID = 'd0d4df2e-1447-41e2-8d62-976022957209'  OR 
               (EntityID = 'AE65A416-5173-486B-8C26-80EC3320D2EE' AND Name = 'ArtifactTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd0d4df2e-1447-41e2-8d62-976022957209',
            'AE65A416-5173-486B-8C26-80EC3320D2EE', -- Entity: MJ: Agent Artifact Types
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
         WHERE ID = '9469d0b2-9401-4c3b-af0f-c2700e12906d'  OR 
               (EntityID = 'AE65A416-5173-486B-8C26-80EC3320D2EE' AND Name = 'Sequence')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9469d0b2-9401-4c3b-af0f-c2700e12906d',
            'AE65A416-5173-486B-8C26-80EC3320D2EE', -- Entity: MJ: Agent Artifact Types
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
         WHERE ID = '2dd47030-e982-49f0-abc4-d5c78ebcbd84'  OR 
               (EntityID = 'AE65A416-5173-486B-8C26-80EC3320D2EE' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2dd47030-e982-49f0-abc4-d5c78ebcbd84',
            'AE65A416-5173-486B-8C26-80EC3320D2EE', -- Entity: MJ: Agent Artifact Types
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
         WHERE ID = '71c1724d-846d-4990-ba6d-7e2d7c029532'  OR 
               (EntityID = 'AE65A416-5173-486B-8C26-80EC3320D2EE' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '71c1724d-846d-4990-ba6d-7e2d7c029532',
            'AE65A416-5173-486B-8C26-80EC3320D2EE', -- Entity: MJ: Agent Artifact Types
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
         WHERE ID = '867c810b-837c-4cd1-b93e-39783033859b'  OR 
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
            '867c810b-837c-4cd1-b93e-39783033859b',
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
         WHERE ID = 'c4252e88-4f09-445b-aefc-4eca96d94c10'  OR 
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
            'c4252e88-4f09-445b-aefc-4eca96d94c10',
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
         WHERE ID = '3196ba7d-1ef9-4e8f-95b7-d6b489c377b6'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3196ba7d-1ef9-4e8f-95b7-d6b489c377b6',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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
         WHERE ID = '50c82d4b-8e08-4f37-a29a-eab3ad78d0bf'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = 'ArtifactVersionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '50c82d4b-8e08-4f37-a29a-eab3ad78d0bf',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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
         WHERE ID = '475d0956-93a3-4cbc-b840-7bd3f9fa0986'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '475d0956-93a3-4cbc-b840-7bd3f9fa0986',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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
         WHERE ID = '7c46f986-5725-4894-b389-a639239c3e2f'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = 'Type')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c46f986-5725-4894-b389-a639239c3e2f',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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
         WHERE ID = 'c4fff1b4-a7c1-4a5a-95d7-2604dc446f70'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = 'Value')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c4fff1b4-a7c1-4a5a-95d7-2604dc446f70',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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
         WHERE ID = '32df7112-97ce-4ccc-9620-2faab6bca3d4'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = 'StandardProperty')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '32df7112-97ce-4ccc-9620-2faab6bca3d4',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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
         WHERE ID = '624ad08a-959b-4ad6-85ac-06ab539cc8fc'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '624ad08a-959b-4ad6-85ac-06ab539cc8fc',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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
         WHERE ID = '79bb39b7-ac46-4238-96bc-eb44af801d9b'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '79bb39b7-ac46-4238-96bc-eb44af801d9b',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '48176db2-9c31-4c10-8397-8ae3265efe58'  OR 
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
            '48176db2-9c31-4c10-8397-8ae3265efe58',
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
         WHERE ID = 'e5374856-2add-4af0-b63c-dbd15390e368'  OR 
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
            'e5374856-2add-4af0-b63c-dbd15390e368',
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

/* SQL text to delete entity field value ID 625A433E-F36B-1410-8DC9-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='625A433E-F36B-1410-8DC9-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='AC5B433E-F36B-1410-8DC9-00021F8B792E'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('32DF7112-97CE-4CCC-9620-2FAAB6BCA3D4', 1, 'name', 'name')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('32DF7112-97CE-4CCC-9620-2FAAB6BCA3D4', 2, 'description', 'description')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('32DF7112-97CE-4CCC-9620-2FAAB6BCA3D4', 3, 'displayMarkdown', 'displayMarkdown')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('32DF7112-97CE-4CCC-9620-2FAAB6BCA3D4', 4, 'displayHtml', 'displayHtml')

/* SQL text to update ValueListType for entity field ID 32DF7112-97CE-4CCC-9620-2FAAB6BCA3D4 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='32DF7112-97CE-4CCC-9620-2FAAB6BCA3D4'

/* SQL text to delete entity field value ID 6C5A433E-F36B-1410-8DC9-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='6C5A433E-F36B-1410-8DC9-00021F8B792E'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'fd869825-d8d2-4fa4-ba78-15c27548976d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('fd869825-d8d2-4fa4-ba78-15c27548976d', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'AE65A416-5173-486B-8C26-80EC3320D2EE', 'AgentID', 'One To Many', 1, 1, 'MJ: Agent Artifact Types', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '55a3d700-a2cf-4efb-93a2-c49c9d316cb3'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('55a3d700-a2cf-4efb-93a2-c49c9d316cb3', '91797885-7128-4B71-8C4B-81C5FEE24F38', '91797885-7128-4B71-8C4B-81C5FEE24F38', 'ParentID', 'One To Many', 1, 1, 'MJ: Artifact Types', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '752dfd9a-fca3-4795-bd32-e85e56099d42'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('752dfd9a-fca3-4795-bd32-e85e56099d42', '91797885-7128-4B71-8C4B-81C5FEE24F38', 'AE65A416-5173-486B-8C26-80EC3320D2EE', 'ArtifactTypeID', 'One To Many', 1, 1, 'MJ: Agent Artifact Types', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1b6db205-d8ab-4efd-b41f-7c9e9b7ce58d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1b6db205-d8ab-4efd-b41f-7c9e9b7ce58d', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', 'ArtifactVersionID', 'One To Many', 1, 1, 'MJ: Artifact Version Attributes', 1);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID CC54433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CC54433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID E454433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E454433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 9C54433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9C54433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID C053433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C053433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 0054433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0054433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID A854433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A854433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID AC54433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AC54433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID B054433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B054433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID E453433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E453433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 5454433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5454433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID E853433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E853433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID EC53433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EC53433E-F36B-1410-8DC9-00021F8B792E',
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



/* Index for Foreign Keys for AgentArtifactType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Agent Artifact Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AgentArtifactType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AgentArtifactType_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AgentArtifactType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AgentArtifactType_AgentID ON [${flyway:defaultSchema}].[AgentArtifactType] ([AgentID]);

-- Index for foreign key ArtifactTypeID in table AgentArtifactType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AgentArtifactType_ArtifactTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AgentArtifactType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AgentArtifactType_ArtifactTypeID ON [${flyway:defaultSchema}].[AgentArtifactType] ([ArtifactTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 676718BA-263B-4BC7-9AD3-162C8514FDD3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='676718BA-263B-4BC7-9AD3-162C8514FDD3',
         @RelatedEntityNameFieldMap='Agent'

/* SQL text to update entity field related entity name field map for entity field ID D0D4DF2E-1447-41E2-8D62-976022957209 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D0D4DF2E-1447-41E2-8D62-976022957209',
         @RelatedEntityNameFieldMap='ArtifactType'

/* Base View SQL for MJ: Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Agent Artifact Types
-- Item: vwAgentArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Agent Artifact Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AgentArtifactType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAgentArtifactTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAgentArtifactTypes]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    ArtifactType_ArtifactTypeID.[Name] AS [ArtifactType]
FROM
    [${flyway:defaultSchema}].[AgentArtifactType] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_ArtifactTypeID
  ON
    [a].[ArtifactTypeID] = ArtifactType_ArtifactTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAgentArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Agent Artifact Types
-- Item: Permissions for vwAgentArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAgentArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Agent Artifact Types
-- Item: spCreateAgentArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AgentArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAgentArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAgentArtifactType]
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
        INSERT INTO [${flyway:defaultSchema}].[AgentArtifactType]
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
        INSERT INTO [${flyway:defaultSchema}].[AgentArtifactType]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwAgentArtifactTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAgentArtifactType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Agent Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAgentArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Agent Artifact Types
-- Item: spUpdateAgentArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AgentArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAgentArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAgentArtifactType]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ArtifactTypeID uniqueidentifier,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AgentArtifactType]
    SET
        [AgentID] = @AgentID,
        [ArtifactTypeID] = @ArtifactTypeID,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAgentArtifactTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAgentArtifactTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAgentArtifactType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AgentArtifactType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAgentArtifactType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAgentArtifactType
ON [${flyway:defaultSchema}].[AgentArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AgentArtifactType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AgentArtifactType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Agent Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAgentArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Agent Artifact Types
-- Item: spDeleteAgentArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AgentArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAgentArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAgentArtifactType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AgentArtifactType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAgentArtifactType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Agent Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAgentArtifactType] TO [cdp_Integration]



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

/* SQL text to update entity field related entity name field map for entity field ID 867C810B-837C-4CD1-B93E-39783033859B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='867C810B-837C-4CD1-B93E-39783033859B',
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

/* SQL text to update entity field related entity name field map for entity field ID 50C82D4B-8E08-4F37-A29A-EAB3AD78D0BF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='50C82D4B-8E08-4F37-A29A-EAB3AD78D0BF',
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

/* SQL text to update entity field related entity name field map for entity field ID 6755433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6755433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 3255433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3255433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 6C55433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6C55433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 3655433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3655433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 3755433E-F36B-1410-8DC9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3755433E-F36B-1410-8DC9-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f69bc0f6-2e64-4f49-bc41-66aca219e5fe'  OR 
               (EntityID = 'AE65A416-5173-486B-8C26-80EC3320D2EE' AND Name = 'Agent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f69bc0f6-2e64-4f49-bc41-66aca219e5fe',
            'AE65A416-5173-486B-8C26-80EC3320D2EE', -- Entity: MJ: Agent Artifact Types
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
         WHERE ID = 'b70ac69d-2e29-469a-a0e2-92cf591a9339'  OR 
               (EntityID = 'AE65A416-5173-486B-8C26-80EC3320D2EE' AND Name = 'ArtifactType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b70ac69d-2e29-469a-a0e2-92cf591a9339',
            'AE65A416-5173-486B-8C26-80EC3320D2EE', -- Entity: MJ: Agent Artifact Types
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
         WHERE ID = 'f1154837-845f-4684-b09c-341741c85461'  OR 
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
            'f1154837-845f-4684-b09c-341741c85461',
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
         WHERE ID = 'b0747f9d-73da-41e0-8c6c-eaabab8b7d00'  OR 
               (EntityID = 'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA' AND Name = 'ArtifactVersion')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b0747f9d-73da-41e0-8c6c-eaabab8b7d00',
            'FE6F3995-2EBD-4AE0-A4DD-939A21C4BACA', -- Entity: MJ: Artifact Version Attributes
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

