-- Migration script for v2.76.x: Flow Agent Type Support
-- Adds support for deterministic flow-based agent execution with graph-based step definitions

-- Create AIAgentStep table for defining flow nodes
CREATE TABLE ${flyway:defaultSchema}.AIAgentStep (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    StepType NVARCHAR(20) NOT NULL,
    StartingStep BIT NOT NULL DEFAULT 0,
    TimeoutSeconds INT NULL DEFAULT 600, -- Default timeout of 10 minutes
    RetryCount INT NOT NULL DEFAULT 0,
    OnErrorBehavior NVARCHAR(20) NOT NULL DEFAULT 'fail',
    -- References for different step types
    ActionID UNIQUEIDENTIFIER NULL,
    SubAgentID UNIQUEIDENTIFIER NULL,
    PromptID UNIQUEIDENTIFIER NULL,
    -- Action output mapping configuration (JSON)
    ActionOutputMapping NVARCHAR(MAX) NULL,
    -- UI Layout fields for visual flow editor
    PositionX INT NOT NULL DEFAULT 0,
    PositionY INT NOT NULL DEFAULT 0,
    Width INT NOT NULL DEFAULT 200,
    Height INT NOT NULL DEFAULT 80,
    CONSTRAINT PK_AIAgentStep PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentStep_Agent FOREIGN KEY (AgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AIAgentStep_Action FOREIGN KEY (ActionID) REFERENCES ${flyway:defaultSchema}.Action(ID),
    CONSTRAINT FK_AIAgentStep_SubAgent FOREIGN KEY (SubAgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AIAgentStep_Prompt FOREIGN KEY (PromptID) REFERENCES ${flyway:defaultSchema}.AIPrompt(ID),
    CONSTRAINT CK_AIAgentStep_StepType CHECK (StepType IN ('Action', 'Sub-Agent', 'Prompt')),
    CONSTRAINT CK_AIAgentStep_OnErrorBehavior CHECK (OnErrorBehavior IN ('fail', 'continue', 'retry')),
    CONSTRAINT CK_AIAgentStep_TimeoutSeconds CHECK (TimeoutSeconds > 0 ),
    CONSTRAINT CK_AIAgentStep_RetryCount CHECK (RetryCount >= 0)
);

-- Create AIAgentStepPath table for defining edges between steps
CREATE TABLE ${flyway:defaultSchema}.AIAgentStepPath (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OriginStepID UNIQUEIDENTIFIER NOT NULL,
    DestinationStepID UNIQUEIDENTIFIER NOT NULL,
    Condition NVARCHAR(MAX) NULL, -- Nullable to allow unconditional paths
    Priority INT NOT NULL DEFAULT 0, -- Higher values evaluated first. Use 0 or negative for default/fallback paths
    Description NVARCHAR(255) NULL,
    -- UI Layout for path rendering
    PathPoints NVARCHAR(MAX) NULL, -- JSON array of x,y coordinates
    CONSTRAINT PK_AIAgentStepPath PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentStepPath_OriginStep FOREIGN KEY (OriginStepID) REFERENCES ${flyway:defaultSchema}.AIAgentStep(ID),
    CONSTRAINT FK_AIAgentStepPath_DestinationStep FOREIGN KEY (DestinationStepID) REFERENCES ${flyway:defaultSchema}.AIAgentStep(ID),
    CONSTRAINT CK_AIAgentStepPath_NoSelfReference CHECK (OriginStepID != DestinationStepID)
);

-- Create indexes for performance
CREATE INDEX IX_AIAgentStep_AgentID ON ${flyway:defaultSchema}.AIAgentStep(AgentID);
CREATE INDEX IX_AIAgentStep_ActionID ON ${flyway:defaultSchema}.AIAgentStep(ActionID) WHERE ActionID IS NOT NULL;
CREATE INDEX IX_AIAgentStep_SubAgentID ON ${flyway:defaultSchema}.AIAgentStep(SubAgentID) WHERE SubAgentID IS NOT NULL;
CREATE INDEX IX_AIAgentStep_PromptID ON ${flyway:defaultSchema}.AIAgentStep(PromptID) WHERE PromptID IS NOT NULL;
CREATE INDEX IX_AIAgentStep_StartingStep ON ${flyway:defaultSchema}.AIAgentStep(AgentID, StartingStep) WHERE StartingStep = 1;

CREATE INDEX IX_AIAgentStepPath_OriginStepID ON ${flyway:defaultSchema}.AIAgentStepPath(OriginStepID);
CREATE INDEX IX_AIAgentStepPath_DestinationStepID ON ${flyway:defaultSchema}.AIAgentStepPath(DestinationStepID);
CREATE INDEX IX_AIAgentStepPath_Priority ON ${flyway:defaultSchema}.AIAgentStepPath(OriginStepID, Priority DESC);

-- Add extended properties for documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Defines individual steps (nodes) in a flow-based AI agent execution graph',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentStep';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Type of step: Action (execute an action), Sub-Agent (delegate to another agent), or Prompt (run an AI prompt)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentStep',
    @level2type = N'COLUMN', @level2name = N'StepType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'If true, this step is executed when the agent starts',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentStep',
    @level2type = N'COLUMN', @level2name = N'StartingStep';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'JSON configuration for mapping action output parameters to payload paths. Example: {"outputParam1": "payload.customer.status", "*": "payload.lastResult"}',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentStep',
    @level2type = N'COLUMN', @level2name = N'ActionOutputMapping';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Defines paths (edges) between steps in a flow-based AI agent execution graph',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentStepPath';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Boolean expression to evaluate. If null, path is always taken. Evaluated against payload and step results.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentStepPath',
    @level2type = N'COLUMN', @level2name = N'Condition';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Path evaluation priority. Higher values are evaluated first. Use 0 or negative values for default/fallback paths that execute when no other conditions match.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentStepPath',
    @level2type = N'COLUMN', @level2name = N'Priority';

-- Insert metadata for the new Flow agent type
DECLARE @FlowAgentTypeID UNIQUEIDENTIFIER = '4F6A189B-C068-4736-9F23-3FF540B40FDD';

-- Check if Flow agent type already exists
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIAgentType WHERE ID = @FlowAgentTypeID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIAgentType (
        ID,
        Name,
        Description,
        DriverClass
    ) VALUES (
        @FlowAgentTypeID,
        'Flow',
        'Deterministic flow-based agent execution using a graph of predefined steps and conditional paths. Ideal for structured workflows with clear decision points.',
        'FlowAgentType'
    );
END;
 



/********** CODE GEN RUN **********/

/* SQL generated to create new entity MJ: AI Agent Steps */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '416d6e4c-31ef-4bbc-ac27-277a192aa1d9',
         'MJ: AI Agent Steps',
         NULL,
         NULL,
         'AIAgentStep',
         'vwAIAgentSteps',
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
   

/* SQL generated to add new entity MJ: AI Agent Steps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '416d6e4c-31ef-4bbc-ac27-277a192aa1d9', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Agent Steps for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('416d6e4c-31ef-4bbc-ac27-277a192aa1d9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Steps for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('416d6e4c-31ef-4bbc-ac27-277a192aa1d9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to add new permission for entity MJ: AI Agent Steps for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('416d6e4c-31ef-4bbc-ac27-277a192aa1d9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Agent Step Paths */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '78e61a4b-022e-4573-b728-dc1354446e11',
         'MJ: AI Agent Step Paths',
         NULL,
         NULL,
         'AIAgentStepPath',
         'vwAIAgentStepPaths',
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
   

/* SQL generated to add new entity MJ: AI Agent Step Paths to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '78e61a4b-022e-4573-b728-dc1354446e11', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Agent Step Paths for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('78e61a4b-022e-4573-b728-dc1354446e11', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Step Paths for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('78e61a4b-022e-4573-b728-dc1354446e11', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to add new permission for entity MJ: AI Agent Step Paths for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('78e61a4b-022e-4573-b728-dc1354446e11', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentStep */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentStep] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentStep */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentStep] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentStepPath */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentStepPath] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentStepPath */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentStepPath] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1c568bd0-924e-4ceb-8b40-d6b3501d10b4'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1c568bd0-924e-4ceb-8b40-d6b3501d10b4',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
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
         WHERE ID = 'deed3e39-498f-4e5b-b9c2-d3f80f4da2dd'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'AgentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'deed3e39-498f-4e5b-b9c2-d3f80f4da2dd',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100002,
            'AgentID',
            'Agent ID',
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
         WHERE ID = '7984861c-aa09-4ce9-9e35-742064dbcb38'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7984861c-aa09-4ce9-9e35-742064dbcb38',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100003,
            'Name',
            'Name',
            NULL,
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
         WHERE ID = '2a62705d-355d-4cb5-a6b7-bb3ae7f71f99'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2a62705d-355d-4cb5-a6b7-bb3ae7f71f99',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100004,
            'Description',
            'Description',
            NULL,
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
         WHERE ID = 'c702d956-0453-4db0-85bc-4ecb34850442'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'StepType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c702d956-0453-4db0-85bc-4ecb34850442',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100005,
            'StepType',
            'Step Type',
            'Type of step: Action (execute an action), Sub-Agent (delegate to another agent), or Prompt (run an AI prompt)',
            'nvarchar',
            40,
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
         WHERE ID = '36d7d2fe-3f7b-4254-848b-e7ff7ec58284'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'StartingStep')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '36d7d2fe-3f7b-4254-848b-e7ff7ec58284',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100006,
            'StartingStep',
            'Starting Step',
            'If true, this step is executed when the agent starts',
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
         WHERE ID = 'b3335896-9072-43d5-8f87-e160410b8e6f'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'TimeoutSeconds')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b3335896-9072-43d5-8f87-e160410b8e6f',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100007,
            'TimeoutSeconds',
            'Timeout Seconds',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            '(600)',
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
         WHERE ID = '2444a24d-2c5c-4349-b143-5cf094fc11fc'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'RetryCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2444a24d-2c5c-4349-b143-5cf094fc11fc',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100008,
            'RetryCount',
            'Retry Count',
            NULL,
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
         WHERE ID = 'f5e9dc02-9962-4482-978e-a919d2049188'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'OnErrorBehavior')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f5e9dc02-9962-4482-978e-a919d2049188',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100009,
            'OnErrorBehavior',
            'On Error Behavior',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            'fail',
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
         WHERE ID = 'f76e7177-2459-46d5-a785-a47d836ad76c'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'ActionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f76e7177-2459-46d5-a785-a47d836ad76c',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100010,
            'ActionID',
            'Action ID',
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
            '38248F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = 'ee5fdc37-c9a9-4b46-ac21-5f4355f814ed'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'SubAgentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ee5fdc37-c9a9-4b46-ac21-5f4355f814ed',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100011,
            'SubAgentID',
            'Sub Agent ID',
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
         WHERE ID = 'fa7c67e1-a79a-45ad-953a-4dc043b8f24b'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'PromptID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fa7c67e1-a79a-45ad-953a-4dc043b8f24b',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100012,
            'PromptID',
            'Prompt ID',
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
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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
         WHERE ID = '1628cd51-c3a6-4046-aac5-a01cce82a184'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'ActionOutputMapping')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1628cd51-c3a6-4046-aac5-a01cce82a184',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100013,
            'ActionOutputMapping',
            'Action Output Mapping',
            'JSON configuration for mapping action output parameters to payload paths. Example: {"outputParam1": "payload.customer.status", "*": "payload.lastResult"}',
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
         WHERE ID = '783c58b0-1633-41f0-a4a2-a19a2c599682'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'PositionX')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '783c58b0-1633-41f0-a4a2-a19a2c599682',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100014,
            'PositionX',
            'Position X',
            NULL,
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
         WHERE ID = '2825719b-9e00-4e0d-ba71-831a3f0b92c3'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'PositionY')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2825719b-9e00-4e0d-ba71-831a3f0b92c3',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100015,
            'PositionY',
            'Position Y',
            NULL,
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
         WHERE ID = '3e51b7df-0557-4b7b-85ca-140c3fc9e230'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'Width')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3e51b7df-0557-4b7b-85ca-140c3fc9e230',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100016,
            'Width',
            'Width',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            '(200)',
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
         WHERE ID = '5405f775-aca4-4bc7-a9ce-4b810d57ae3d'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'Height')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5405f775-aca4-4bc7-a9ce-4b810d57ae3d',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100017,
            'Height',
            'Height',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            '(80)',
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
         WHERE ID = '21471906-d784-44e1-a53c-c526e246e1bf'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '21471906-d784-44e1-a53c-c526e246e1bf',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100018,
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
         WHERE ID = 'f4d55d1c-7220-42e3-9e02-0ea77ad82ab4'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f4d55d1c-7220-42e3-9e02-0ea77ad82ab4',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100019,
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
         WHERE ID = '50a42267-425a-42ad-9e15-8b00935086c8'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '50a42267-425a-42ad-9e15-8b00935086c8',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
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
         WHERE ID = '3ada0dda-9072-4916-865e-1fa676d5259f'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'OriginStepID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3ada0dda-9072-4916-865e-1fa676d5259f',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
            100002,
            'OriginStepID',
            'Origin Step ID',
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
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9',
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
         WHERE ID = '019b7177-92b0-465c-b1b1-53e72004004c'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'DestinationStepID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '019b7177-92b0-465c-b1b1-53e72004004c',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
            100003,
            'DestinationStepID',
            'Destination Step ID',
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
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9',
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
         WHERE ID = 'e3f02d04-4e93-400d-a9fb-c524611afef2'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'Condition')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e3f02d04-4e93-400d-a9fb-c524611afef2',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
            100004,
            'Condition',
            'Condition',
            'Boolean expression to evaluate. If null, path is always taken. Evaluated against payload and step results.',
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
         WHERE ID = 'be2b8daf-c802-4951-9d28-f84da03c912d'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'be2b8daf-c802-4951-9d28-f84da03c912d',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
            100005,
            'Priority',
            'Priority',
            'Path evaluation priority. Higher values are evaluated first. Use 0 or negative values for default/fallback paths that execute when no other conditions match.',
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
         WHERE ID = 'd29154da-766d-4f3e-bbdb-9bf8939f2523'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd29154da-766d-4f3e-bbdb-9bf8939f2523',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
            100006,
            'Description',
            'Description',
            NULL,
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
         WHERE ID = '625fb586-6c82-41a9-8de4-f0c5e9ca8829'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'PathPoints')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '625fb586-6c82-41a9-8de4-f0c5e9ca8829',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
            100007,
            'PathPoints',
            'Path Points',
            NULL,
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
         WHERE ID = 'efc65381-5d04-46f6-b8e9-ccabbc6ab5b8'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'efc65381-5d04-46f6-b8e9-ccabbc6ab5b8',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
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
         WHERE ID = '1b7d0131-7a17-4f36-9e63-d9cab81f2236'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1b7d0131-7a17-4f36-9e63-d9cab81f2236',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
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
                                       ('C702D956-0453-4DB0-85BC-4ECB34850442', 1, 'Action', 'Action')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C702D956-0453-4DB0-85BC-4ECB34850442', 2, 'Sub-Agent', 'Sub-Agent')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C702D956-0453-4DB0-85BC-4ECB34850442', 3, 'Prompt', 'Prompt')

/* SQL text to update ValueListType for entity field ID C702D956-0453-4DB0-85BC-4ECB34850442 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C702D956-0453-4DB0-85BC-4ECB34850442'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F5E9DC02-9962-4482-978E-A919D2049188', 1, 'fail', 'fail')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F5E9DC02-9962-4482-978E-A919D2049188', 2, 'continue', 'continue')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F5E9DC02-9962-4482-978E-A919D2049188', 3, 'retry', 'retry')

/* SQL text to update ValueListType for entity field ID F5E9DC02-9962-4482-978E-A919D2049188 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F5E9DC02-9962-4482-978E-A919D2049188'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '49b7bc13-a831-4070-aba0-b0ff5f2c1c7b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('49b7bc13-a831-4070-aba0-b0ff5f2c1c7b', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', 'AgentID', 'One To Many', 1, 1, 'MJ: AI Agent Steps', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '02cf7124-b3e1-4737-a16a-82a29f3d8e97'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('02cf7124-b3e1-4737-a16a-82a29f3d8e97', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', 'SubAgentID', 'One To Many', 1, 1, 'MJ: AI Agent Steps', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6dd99afe-ef4d-44e4-a70e-6acc547f0e8d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6dd99afe-ef4d-44e4-a70e-6acc547f0e8d', '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', '78E61A4B-022E-4573-B728-DC1354446E11', 'DestinationStepID', 'One To Many', 1, 1, 'MJ: AI Agent Step Paths', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8f64a0fd-9e48-4c86-9f34-3a2904d05f8f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8f64a0fd-9e48-4c86-9f34-3a2904d05f8f', '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', '78E61A4B-022E-4573-B728-DC1354446E11', 'OriginStepID', 'One To Many', 1, 1, 'MJ: AI Agent Step Paths', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '21dce25d-d113-4cfe-bf21-2f1054bf953c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('21dce25d-d113-4cfe-bf21-2f1054bf953c', '73AD0238-8B56-EF11-991A-6045BDEBA539', '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', 'PromptID', 'One To Many', 1, 1, 'MJ: AI Agent Steps', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b8ac7422-aefc-4fea-a909-a0895b8daaf6'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b8ac7422-aefc-4fea-a909-a0895b8daaf6', '38248F34-2837-EF11-86D4-6045BDEE16E6', '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', 'ActionID', 'One To Many', 1, 1, 'MJ: AI Agent Steps', 4);
   END
                              

/* Index for Foreign Keys for AIAgentStep */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStep_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStep_AgentID ON [${flyway:defaultSchema}].[AIAgentStep] ([AgentID]);

-- Index for foreign key ActionID in table AIAgentStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStep_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStep_ActionID ON [${flyway:defaultSchema}].[AIAgentStep] ([ActionID]);

-- Index for foreign key SubAgentID in table AIAgentStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStep_SubAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStep_SubAgentID ON [${flyway:defaultSchema}].[AIAgentStep] ([SubAgentID]);

-- Index for foreign key PromptID in table AIAgentStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStep_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStep_PromptID ON [${flyway:defaultSchema}].[AIAgentStep] ([PromptID]);

/* SQL text to update entity field related entity name field map for entity field ID DEED3E39-498F-4E5B-B9C2-D3F80F4DA2DD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DEED3E39-498F-4E5B-B9C2-D3F80F4DA2DD',
         @RelatedEntityNameFieldMap='Agent'

/* SQL text to update entity field related entity name field map for entity field ID F76E7177-2459-46D5-A785-A47D836AD76C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F76E7177-2459-46D5-A785-A47D836AD76C',
         @RelatedEntityNameFieldMap='Action'

/* SQL text to update entity field related entity name field map for entity field ID EE5FDC37-C9A9-4B46-AC21-5F4355F814ED */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EE5FDC37-C9A9-4B46-AC21-5F4355F814ED',
         @RelatedEntityNameFieldMap='SubAgent'

/* SQL text to update entity field related entity name field map for entity field ID FA7C67E1-A79A-45AD-953A-4DC043B8F24B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FA7C67E1-A79A-45AD-953A-4DC043B8F24B',
         @RelatedEntityNameFieldMap='Prompt'

/* Base View SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: vwAIAgentSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Steps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentSteps]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSteps]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Action_ActionID.[Name] AS [Action],
    AIAgent_SubAgentID.[Name] AS [SubAgent],
    AIPrompt_PromptID.[Name] AS [Prompt]
FROM
    [${flyway:defaultSchema}].[AIAgentStep] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_SubAgentID
  ON
    [a].[SubAgentID] = AIAgent_SubAgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: Permissions for vwAIAgentSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: spCreateAIAgentStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentStep]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StepType nvarchar(20),
    @StartingStep bit,
    @TimeoutSeconds int,
    @RetryCount int,
    @OnErrorBehavior nvarchar(20),
    @ActionID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ActionOutputMapping nvarchar(MAX),
    @PositionX int,
    @PositionY int,
    @Width int,
    @Height int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentStep]
            (
                [ID],
                [AgentID],
                [Name],
                [Description],
                [StepType],
                [StartingStep],
                [TimeoutSeconds],
                [RetryCount],
                [OnErrorBehavior],
                [ActionID],
                [SubAgentID],
                [PromptID],
                [ActionOutputMapping],
                [PositionX],
                [PositionY],
                [Width],
                [Height]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @Name,
                @Description,
                @StepType,
                @StartingStep,
                @TimeoutSeconds,
                @RetryCount,
                @OnErrorBehavior,
                @ActionID,
                @SubAgentID,
                @PromptID,
                @ActionOutputMapping,
                @PositionX,
                @PositionY,
                @Width,
                @Height
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentStep]
            (
                [AgentID],
                [Name],
                [Description],
                [StepType],
                [StartingStep],
                [TimeoutSeconds],
                [RetryCount],
                [OnErrorBehavior],
                [ActionID],
                [SubAgentID],
                [PromptID],
                [ActionOutputMapping],
                [PositionX],
                [PositionY],
                [Width],
                [Height]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @Name,
                @Description,
                @StepType,
                @StartingStep,
                @TimeoutSeconds,
                @RetryCount,
                @OnErrorBehavior,
                @ActionID,
                @SubAgentID,
                @PromptID,
                @ActionOutputMapping,
                @PositionX,
                @PositionY,
                @Width,
                @Height
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSteps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentStep] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentStep] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: spUpdateAIAgentStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentStep]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StepType nvarchar(20),
    @StartingStep bit,
    @TimeoutSeconds int,
    @RetryCount int,
    @OnErrorBehavior nvarchar(20),
    @ActionID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ActionOutputMapping nvarchar(MAX),
    @PositionX int,
    @PositionY int,
    @Width int,
    @Height int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentStep]
    SET
        [AgentID] = @AgentID,
        [Name] = @Name,
        [Description] = @Description,
        [StepType] = @StepType,
        [StartingStep] = @StartingStep,
        [TimeoutSeconds] = @TimeoutSeconds,
        [RetryCount] = @RetryCount,
        [OnErrorBehavior] = @OnErrorBehavior,
        [ActionID] = @ActionID,
        [SubAgentID] = @SubAgentID,
        [PromptID] = @PromptID,
        [ActionOutputMapping] = @ActionOutputMapping,
        [PositionX] = @PositionX,
        [PositionY] = @PositionY,
        [Width] = @Width,
        [Height] = @Height
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSteps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSteps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentStep] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentStep table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentStep
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentStep
ON [${flyway:defaultSchema}].[AIAgentStep]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentStep]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentStep] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentStep] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: spDeleteAIAgentStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentStep]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentStep]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentStep] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentStep] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentStepPath */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Step Paths
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OriginStepID in table AIAgentStepPath
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStepPath_OriginStepID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStepPath]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStepPath_OriginStepID ON [${flyway:defaultSchema}].[AIAgentStepPath] ([OriginStepID]);

-- Index for foreign key DestinationStepID in table AIAgentStepPath
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentStepPath_DestinationStepID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStepPath]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentStepPath_DestinationStepID ON [${flyway:defaultSchema}].[AIAgentStepPath] ([DestinationStepID]);

/* SQL text to update entity field related entity name field map for entity field ID 3ADA0DDA-9072-4916-865E-1FA676D5259F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3ADA0DDA-9072-4916-865E-1FA676D5259F',
         @RelatedEntityNameFieldMap='OriginStep'

/* SQL text to update entity field related entity name field map for entity field ID 019B7177-92B0-465C-B1B1-53E72004004C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='019B7177-92B0-465C-B1B1-53E72004004C',
         @RelatedEntityNameFieldMap='DestinationStep'

/* Base View SQL for MJ: AI Agent Step Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Step Paths
-- Item: vwAIAgentStepPaths
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Step Paths
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentStepPath
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentStepPaths]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentStepPaths]
AS
SELECT
    a.*,
    AIAgentStep_OriginStepID.[Name] AS [OriginStep],
    AIAgentStep_DestinationStepID.[Name] AS [DestinationStep]
FROM
    [${flyway:defaultSchema}].[AIAgentStepPath] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentStep] AS AIAgentStep_OriginStepID
  ON
    [a].[OriginStepID] = AIAgentStep_OriginStepID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentStep] AS AIAgentStep_DestinationStepID
  ON
    [a].[DestinationStepID] = AIAgentStep_DestinationStepID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentStepPaths] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Step Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Step Paths
-- Item: Permissions for vwAIAgentStepPaths
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentStepPaths] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Step Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Step Paths
-- Item: spCreateAIAgentStepPath
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentStepPath
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentStepPath]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentStepPath]
    @ID uniqueidentifier = NULL,
    @OriginStepID uniqueidentifier,
    @DestinationStepID uniqueidentifier,
    @Condition nvarchar(MAX),
    @Priority int,
    @Description nvarchar(255),
    @PathPoints nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentStepPath]
            (
                [ID],
                [OriginStepID],
                [DestinationStepID],
                [Condition],
                [Priority],
                [Description],
                [PathPoints]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OriginStepID,
                @DestinationStepID,
                @Condition,
                @Priority,
                @Description,
                @PathPoints
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentStepPath]
            (
                [OriginStepID],
                [DestinationStepID],
                [Condition],
                [Priority],
                [Description],
                [PathPoints]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OriginStepID,
                @DestinationStepID,
                @Condition,
                @Priority,
                @Description,
                @PathPoints
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentStepPaths] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentStepPath] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Step Paths */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentStepPath] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Step Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Step Paths
-- Item: spUpdateAIAgentStepPath
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentStepPath
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentStepPath]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentStepPath]
    @ID uniqueidentifier,
    @OriginStepID uniqueidentifier,
    @DestinationStepID uniqueidentifier,
    @Condition nvarchar(MAX),
    @Priority int,
    @Description nvarchar(255),
    @PathPoints nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentStepPath]
    SET
        [OriginStepID] = @OriginStepID,
        [DestinationStepID] = @DestinationStepID,
        [Condition] = @Condition,
        [Priority] = @Priority,
        [Description] = @Description,
        [PathPoints] = @PathPoints
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentStepPaths] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentStepPaths]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentStepPath] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentStepPath table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentStepPath
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentStepPath
ON [${flyway:defaultSchema}].[AIAgentStepPath]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentStepPath]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentStepPath] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Step Paths */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentStepPath] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Step Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Step Paths
-- Item: spDeleteAIAgentStepPath
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentStepPath
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentStepPath]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentStepPath]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentStepPath]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentStepPath] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Step Paths */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentStepPath] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '02bfb151-db61-49aa-8303-5665d7d864c7'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'Agent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '02bfb151-db61-49aa-8303-5665d7d864c7',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100020,
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
         WHERE ID = '91a4cbc6-94e8-4cb2-9499-2089f3e12568'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'Action')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '91a4cbc6-94e8-4cb2-9499-2089f3e12568',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100021,
            'Action',
            'Action',
            NULL,
            'nvarchar',
            850,
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
         WHERE ID = '24d14edf-fd11-4044-8624-832cf3810f74'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'SubAgent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '24d14edf-fd11-4044-8624-832cf3810f74',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100022,
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
         WHERE ID = 'e39c3fee-b5a5-4bd5-b6e7-edf653e83dc1'  OR 
               (EntityID = '416D6E4C-31EF-4BBC-AC27-277A192AA1D9' AND Name = 'Prompt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e39c3fee-b5a5-4bd5-b6e7-edf653e83dc1',
            '416D6E4C-31EF-4BBC-AC27-277A192AA1D9', -- Entity: MJ: AI Agent Steps
            100023,
            'Prompt',
            'Prompt',
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
         WHERE ID = 'e194eb10-9643-4288-a4ce-c528b018be8e'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'OriginStep')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e194eb10-9643-4288-a4ce-c528b018be8e',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
            100010,
            'OriginStep',
            'Origin Step',
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
         WHERE ID = 'b425afa6-b4d1-4ce4-8a29-0d0cd2d4dbe0'  OR 
               (EntityID = '78E61A4B-022E-4573-B728-DC1354446E11' AND Name = 'DestinationStep')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b425afa6-b4d1-4ce4-8a29-0d0cd2d4dbe0',
            '78E61A4B-022E-4573-B728-DC1354446E11', -- Entity: MJ: AI Agent Step Paths
            100011,
            'DestinationStep',
            'Destination Step',
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

/* Generated Validation Functions for MJ: AI Agent Step Paths */
-- CHECK constraint for MJ: AI Agent Step Paths @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([OriginStepID]<>[DestinationStepID])', 'public ValidateOriginStepIDIsNotEqualToDestinationStepID(result: ValidationResult) {
	if (this.OriginStepID === this.DestinationStepID) {
		result.Errors.push(new ValidationErrorInfo("OriginStepID", "Origin step and destination step must be different. A step cannot connect to itself.", this.OriginStepID, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the origin step and destination step must be different. In other words, a step cannot connect to itself.', 'ValidateOriginStepIDIsNotEqualToDestinationStepID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '78E61A4B-022E-4573-B728-DC1354446E11');
  
            

/* Generated Validation Functions for MJ: AI Agent Steps */
-- CHECK constraint for MJ: AI Agent Steps: Field: RetryCount was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([RetryCount]>=(0))', 'public ValidateRetryCountIsNonNegative(result: ValidationResult) {
	if (this.RetryCount < 0) {
		result.Errors.push(new ValidationErrorInfo("RetryCount", "Retry count cannot be negative.", this.RetryCount, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the RetryCount value cannot be negative. It must be zero or higher.', 'ValidateRetryCountIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '2444A24D-2C5C-4349-B143-5CF094FC11FC');
  
            -- CHECK constraint for MJ: AI Agent Steps: Field: TimeoutSeconds was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([TimeoutSeconds]>(0))', 'public ValidateTimeoutSecondsGreaterThanZero(result: ValidationResult) {
	if (this.TimeoutSeconds <= 0) {
		result.Errors.push(new ValidationErrorInfo("TimeoutSeconds", "TimeoutSeconds must be greater than zero.", this.TimeoutSeconds, ValidationErrorType.Failure));
	}
}', 'This rule makes sure that the value for TimeoutSeconds must be greater than zero. Negative values or zero are not allowed.', 'ValidateTimeoutSecondsGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B3335896-9072-43D5-8F87-E160410B8E6F');
  
            

