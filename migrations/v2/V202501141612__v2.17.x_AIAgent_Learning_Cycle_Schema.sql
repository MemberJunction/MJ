CREATE TABLE ${flyway:defaultSchema}.AIAgentLearningCycle
(
    ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT (newsequentialid()),
    AgentID UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    StartedAt datetimeoffset NOT NULL DEFAULT (getutcdate()),
    EndedAt datetimeoffset NULL,
    Status nvarchar(20) NOT NULL CHECK (Status IN ('In-Progress','Complete','Failed')),
    AgentSummary nvarchar(max) NULL,
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL
);

-- Add description for the table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks the learning cycles for AI Agents where the Agent does offline reasoning, reflection, learning, and updates metadata.',
    @level0type = N'SCHEMA',
    @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',
    @level1name = 'AIAgentLearningCycle';

-- Add descriptions for the columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the learning cycle.',
    @level0type = N'SCHEMA',
    @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',
    @level1name = 'AIAgentLearningCycle',
    @level2type = N'COLUMN',
    @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier for the AI Agent associated with this learning cycle.',
    @level0type = N'SCHEMA',
    @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',
    @level1name = 'AIAgentLearningCycle',
    @level2type = N'COLUMN',
    @level2name = 'AgentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp indicating when the learning cycle started.',
    @level0type = N'SCHEMA',
    @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',
    @level1name = 'AIAgentLearningCycle',
    @level2type = N'COLUMN',
    @level2name = 'StartedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp indicating when the learning cycle ended.',
    @level0type = N'SCHEMA',
    @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',
    @level1name = 'AIAgentLearningCycle',
    @level2type = N'COLUMN',
    @level2name = 'EndedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Status of the learning cycle (In-Progress, Complete, or Failed).',
    @level0type = N'SCHEMA',
    @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',
    @level1name = 'AIAgentLearningCycle',
    @level2type = N'COLUMN',
    @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Text summary provided by the agent about what it learned and any changes it requested for stored metadata.',
    @level0type = N'SCHEMA',
    @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',
    @level1name = 'AIAgentLearningCycle',
    @level2type = N'COLUMN',
    @level2name = 'AgentSummary';
