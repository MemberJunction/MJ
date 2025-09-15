-- =====================================================================================
-- MemberJunction v3 Task Tracking Schema Extension
-- =====================================================================================
-- This file extends the v3 conversations schema with multi-agent task tracking
-- capabilities as shown in the UI prototype. Tasks are top-level entities that can
-- be linked to conversations, projects, or other entities as needed.
-- =====================================================================================

-- =====================================================================================
-- TASK TRACKING ENTITIES
-- =====================================================================================

-- -----------------------------------------------------------------------------
-- Task: Top-level entity for tracking any work item, process, or activity
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Task (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Task_ID DEFAULT (newsequentialid()),
    EnvironmentID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Type NVARCHAR(50) NULL, -- 'analysis', 'generation', 'transformation', 'research', 'execution'
    Status NVARCHAR(50) NOT NULL, -- 'pending', 'active', 'completed', 'failed', 'cancelled', 'paused'
    Priority INT NULL, -- Task priority for ordering (1=highest)
    AssignedToUserID UNIQUEIDENTIFIER NULL, -- Human user assigned to task
    AssignedToAIAgentID UNIQUEIDENTIFIER NULL, -- AI agent assigned to task
    ParentID UNIQUEIDENTIFIER NULL, -- For subtasks/nested tasks
    Progress INT NULL, -- Progress percentage (0-100)
    ProgressMessage NVARCHAR(MAX) NULL, -- Current status message
    StartedAt DATETIMEOFFSET NULL,
    CompletedAt DATETIMEOFFSET NULL,
    DueAt DATETIMEOFFSET NULL,
    EstimatedDuration INT NULL, -- Estimated duration in seconds
    ActualDuration INT NULL, -- Actual duration in seconds
    Result NVARCHAR(MAX) NULL, -- JSON result data
    ErrorMessage NVARCHAR(MAX) NULL, -- Error if failed
    Metadata NVARCHAR(MAX) NULL, -- JSON for additional task-specific data
    UserID UNIQUEIDENTIFIER NOT NULL, -- User who created/owns the task
    CONSTRAINT PK_Task PRIMARY KEY (ID),
    CONSTRAINT FK_Task_Environment FOREIGN KEY (EnvironmentID) REFERENCES ${flyway:defaultSchema}.Environment(ID),
    CONSTRAINT FK_Task_AssignedToUser FOREIGN KEY (AssignedToUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_Task_AssignedToAIAgent FOREIGN KEY (AssignedToAIAgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_Task_Parent FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.Task(ID),
    CONSTRAINT FK_Task_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_Task_Status CHECK (Status IN ('pending', 'active', 'completed', 'failed', 'cancelled', 'paused')),
    CONSTRAINT CK_Task_Type CHECK (Type IN ('analysis', 'generation', 'transformation', 'research', 'execution', 'review', 'approval'))
);

-- -----------------------------------------------------------------------------
-- TaskLink: Links tasks to various entities (conversations, projects, collections, etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.TaskLink (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TaskLink_ID DEFAULT (newsequentialid()),
    TaskID UNIQUEIDENTIFIER NOT NULL,
    LinkedEntityType NVARCHAR(50) NOT NULL, -- 'Conversation', 'Project', 'Collection', 'Artifact'
    LinkedEntityID UNIQUEIDENTIFIER NOT NULL,
    LinkType NVARCHAR(50) NULL, -- 'created_by', 'assigned_to', 'related_to', 'blocking'
    Sequence INT NULL, -- For ordering tasks within a context
    CONSTRAINT PK_TaskLink PRIMARY KEY (ID),
    CONSTRAINT FK_TaskLink_Task FOREIGN KEY (TaskID) REFERENCES ${flyway:defaultSchema}.Task(ID),
    CONSTRAINT CK_TaskLink_LinkedEntityType CHECK (LinkedEntityType IN ('Conversation', 'Project', 'Collection', 'Artifact', 'Environment')),
    CONSTRAINT CK_TaskLink_LinkType CHECK (LinkType IN ('created_by', 'assigned_to', 'related_to', 'blocking', 'blocked_by'))
);

-- -----------------------------------------------------------------------------
-- ConversationParticipant: Tracks active participants (users and agents) in a conversation
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.ConversationParticipant (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ConversationParticipant_ID DEFAULT (newsequentialid()),
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    ParticipantType NVARCHAR(50) NOT NULL, -- 'User', 'AIAgent'
    ParticipantID UNIQUEIDENTIFIER NOT NULL, -- UserID or AIAgentID
    JoinedAt DATETIMEOFFSET NOT NULL,
    LeftAt DATETIMEOFFSET NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_ConversationParticipant_IsActive DEFAULT (1),
    LastActivityAt DATETIMEOFFSET NULL,
    Role NVARCHAR(50) NULL, -- 'owner', 'member', 'observer', etc.
    Capabilities NVARCHAR(MAX) NULL, -- JSON array of capabilities for agents
    CONSTRAINT PK_ConversationParticipant PRIMARY KEY (ID),
    CONSTRAINT FK_ConversationParticipant_Conversation FOREIGN KEY (ConversationID) REFERENCES ${flyway:defaultSchema}.Conversation(ID),
    CONSTRAINT CK_ConversationParticipant_ParticipantType CHECK (ParticipantType IN ('User', 'AIAgent')),
    CONSTRAINT CK_ConversationParticipant_Role CHECK (Role IN ('owner', 'admin', 'member', 'observer', 'guest'))
);

-- -----------------------------------------------------------------------------
-- TaskDependency: Defines dependencies between tasks
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.TaskDependency (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TaskDependency_ID DEFAULT (newsequentialid()),
    TaskID UNIQUEIDENTIFIER NOT NULL,
    DependsOnTaskID UNIQUEIDENTIFIER NOT NULL,
    DependencyType NVARCHAR(50) NOT NULL, -- 'blocks', 'requires', 'related'
    CONSTRAINT PK_TaskDependency PRIMARY KEY (ID),
    CONSTRAINT FK_TaskDependency_Task FOREIGN KEY (TaskID) REFERENCES ${flyway:defaultSchema}.ConversationTask(ID),
    CONSTRAINT FK_TaskDependency_DependsOnTask FOREIGN KEY (DependsOnTaskID) REFERENCES ${flyway:defaultSchema}.ConversationTask(ID),
    CONSTRAINT CK_TaskDependency_DependencyType CHECK (DependencyType IN ('blocks', 'requires', 'related')),
    CONSTRAINT UQ_TaskDependency_TaskID_DependsOnTaskID UNIQUE (TaskID, DependsOnTaskID)
);

-- -----------------------------------------------------------------------------
-- TaskArtifact: Links artifacts as inputs or outputs of tasks
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.TaskArtifact (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TaskArtifact_ID DEFAULT (newsequentialid()),
    TaskID UNIQUEIDENTIFIER NOT NULL,
    ArtifactID UNIQUEIDENTIFIER NOT NULL,
    Direction NVARCHAR(50) NOT NULL, -- 'input', 'output', 'modified'
    Purpose NVARCHAR(255) NULL, -- 'context', 'reference', 'template', 'result', 'report', 'analysis'
    Sequence INT NULL, -- For ordering multiple inputs/outputs
    CONSTRAINT PK_TaskArtifact PRIMARY KEY (ID),
    CONSTRAINT FK_TaskArtifact_Task FOREIGN KEY (TaskID) REFERENCES ${flyway:defaultSchema}.Task(ID),
    CONSTRAINT FK_TaskArtifact_Artifact FOREIGN KEY (ArtifactID) REFERENCES ${flyway:defaultSchema}.Artifact(ID),
    CONSTRAINT CK_TaskArtifact_Direction CHECK (Direction IN ('input', 'output', 'modified')),
    CONSTRAINT UQ_TaskArtifact_TaskID_ArtifactID UNIQUE (TaskID, ArtifactID)
);

-- -----------------------------------------------------------------------------
-- AgentCapability: Defines what capabilities/skills each agent has
-- -----------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.AgentCapability (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_AgentCapability_ID DEFAULT (newsequentialid()),
    AIAgentID UNIQUEIDENTIFIER NOT NULL,
    CapabilityName NVARCHAR(100) NOT NULL,
    CapabilityType NVARCHAR(50) NOT NULL, -- 'analysis', 'code', 'research', 'design', 'data', etc.
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_AgentCapability_IsActive DEFAULT (1),
    Priority INT NULL, -- For capability ranking/preference
    Configuration NVARCHAR(MAX) NULL, -- JSON for capability-specific config
    CONSTRAINT PK_AgentCapability PRIMARY KEY (ID),
    CONSTRAINT FK_AgentCapability_AIAgent FOREIGN KEY (AIAgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT UQ_AgentCapability_AIAgentID_CapabilityName UNIQUE (AIAgentID, CapabilityName)
);

-- =====================================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================================
-- Note: MJ auto-creates indexes for foreign keys, so we only add non-FK indexes here

-- Task indexes (non-FK)
CREATE INDEX IX_Task_Status ON ${flyway:defaultSchema}.Task(Status);
CREATE INDEX IX_Task_StartedAt ON ${flyway:defaultSchema}.Task(StartedAt DESC);
CREATE INDEX IX_Task_Type ON ${flyway:defaultSchema}.Task(Type);
CREATE INDEX IX_Task_Priority ON ${flyway:defaultSchema}.Task(Priority);

-- TaskLink indexes (non-FK)
CREATE INDEX IX_TaskLink_LinkedEntityType ON ${flyway:defaultSchema}.TaskLink(LinkedEntityType);
CREATE INDEX IX_TaskLink_LinkType ON ${flyway:defaultSchema}.TaskLink(LinkType);

-- ConversationParticipant indexes (non-FK)
CREATE INDEX IX_ConversationParticipant_IsActive ON ${flyway:defaultSchema}.ConversationParticipant(IsActive);
CREATE INDEX IX_ConversationParticipant_LastActivityAt ON ${flyway:defaultSchema}.ConversationParticipant(LastActivityAt DESC);

-- TaskArtifact indexes (non-FK)
CREATE INDEX IX_TaskArtifact_Direction ON ${flyway:defaultSchema}.TaskArtifact(Direction);

-- AgentCapability indexes (non-FK)
CREATE INDEX IX_AgentCapability_CapabilityType ON ${flyway:defaultSchema}.AgentCapability(CapabilityType);
CREATE INDEX IX_AgentCapability_IsActive ON ${flyway:defaultSchema}.AgentCapability(IsActive);

-- =====================================================================================
-- EXTENDED PROPERTIES FOR DOCUMENTATION
-- =====================================================================================
-- Note: Only documenting non-PK/FK columns as those are self-documenting

-- ===========================================
-- Task Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Top-level task entity for tracking any work item, process, or activity. Tasks can be linked to conversations, projects, or other entities through TaskLink table.',
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
    @value = N'Detailed description of what this task entails',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of task (analysis, generation, transformation, research, execution, review, approval)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Type';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Current status of the task (pending, active, completed, failed, cancelled, paused)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Priority level for task ordering (1=highest priority)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Priority';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Current progress percentage (0-100)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Progress';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Current status message or progress details',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'ProgressMessage';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp when task execution started',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'StartedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp when task execution completed',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'CompletedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Due date/time for task completion',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'DueAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Estimated duration in seconds',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'EstimatedDuration';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Actual duration in seconds from start to completion',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'ActualDuration';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON result data from task execution',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Result';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Error message if task failed',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'ErrorMessage';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON metadata for additional task-specific data',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Metadata';

-- ===========================================
-- TaskLink Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Links tasks to various entities like conversations, projects, or collections. Enables flexible task association across the system.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskLink';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of entity this task is linked to (Conversation, Project, Collection, Artifact, Environment)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskLink',
    @level2type = N'COLUMN', @level2name = 'LinkedEntityType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Nature of the link (created_by, assigned_to, related_to, blocking, blocked_by)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskLink',
    @level2type = N'COLUMN', @level2name = 'LinkType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Display order for tasks within a context',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskLink',
    @level2type = N'COLUMN', @level2name = 'Sequence';

-- ===========================================
-- ConversationParticipant Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Tracks active participants (both users and AI agents) in a conversation, including their roles and current activity status.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationParticipant';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of participant (User or AIAgent)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationParticipant',
    @level2type = N'COLUMN', @level2name = 'ParticipantType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp when participant joined the conversation',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationParticipant',
    @level2type = N'COLUMN', @level2name = 'JoinedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp when participant left the conversation',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationParticipant',
    @level2type = N'COLUMN', @level2name = 'LeftAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if participant is currently active in the conversation',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationParticipant',
    @level2type = N'COLUMN', @level2name = 'IsActive';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp of last activity by this participant',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationParticipant',
    @level2type = N'COLUMN', @level2name = 'LastActivityAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Participant role in conversation (owner, admin, member, observer, guest)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationParticipant',
    @level2type = N'COLUMN', @level2name = 'Role';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON array of capabilities for AI agents',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationParticipant',
    @level2type = N'COLUMN', @level2name = 'Capabilities';

-- ===========================================
-- TaskDependency Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Defines dependencies between tasks to support complex workflows and ensure proper execution order.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskDependency';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of dependency (blocks, requires, related)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskDependency',
    @level2type = N'COLUMN', @level2name = 'DependencyType';

-- ===========================================
-- TaskArtifact Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Links artifacts as inputs or outputs of tasks, providing traceability of task data flow.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskArtifact';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Direction of artifact relative to task (input, output, modified)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskArtifact',
    @level2type = N'COLUMN', @level2name = 'Direction';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Purpose of the artifact (context, reference, template, result, report, analysis)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskArtifact',
    @level2type = N'COLUMN', @level2name = 'Purpose';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Sequence number for ordering multiple inputs/outputs',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TaskArtifact',
    @level2type = N'COLUMN', @level2name = 'Sequence';

-- ===========================================
-- AgentCapability Table and Columns
-- ===========================================
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Defines the capabilities and skills that each AI agent possesses, used for task assignment and agent selection.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentCapability';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Name of the capability',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentCapability',
    @level2type = N'COLUMN', @level2name = 'CapabilityName';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type/category of capability (analysis, code, research, design, data, etc.)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentCapability',
    @level2type = N'COLUMN', @level2name = 'CapabilityType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Detailed description of what this capability enables',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentCapability',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if this capability is currently active/available',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentCapability',
    @level2type = N'COLUMN', @level2name = 'IsActive';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Priority ranking for capability selection',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentCapability',
    @level2type = N'COLUMN', @level2name = 'Priority';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON configuration for capability-specific settings',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AgentCapability',
    @level2type = N'COLUMN', @level2name = 'Configuration';