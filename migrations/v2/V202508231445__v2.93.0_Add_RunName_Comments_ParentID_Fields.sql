-- Add RunName field to AIAgentRun table (nullable nvarchar(255))
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun
ADD RunName NVARCHAR(255) NULL;

-- Add extended property for RunName in AIAgentRun
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional name for the agent run to help identify and tag runs for easier reference',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'RunName';

-- Add Comments field to AIAgentRun table (nullable nvarchar(max))
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun
ADD Comments NVARCHAR(MAX) NULL;

-- Add extended property for Comments in AIAgentRun
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Human-readable notes and comments about this agent run',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'Comments';

-- Add RunName field to AIPromptRun table (nullable nvarchar(255))
ALTER TABLE ${flyway:defaultSchema}.AIPromptRun
ADD RunName NVARCHAR(255) NULL;

-- Add extended property for RunName in AIPromptRun
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional name for the prompt run to help identify and tag runs for easier reference',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPromptRun',
    @level2type = N'COLUMN', @level2name = N'RunName';

-- Add Comments field to AIPromptRun table (nullable nvarchar(max))
ALTER TABLE ${flyway:defaultSchema}.AIPromptRun
ADD Comments NVARCHAR(MAX) NULL;

-- Add extended property for Comments in AIPromptRun
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Human-readable notes and comments about this prompt run',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPromptRun',
    @level2type = N'COLUMN', @level2name = N'Comments';

-- Add ParentID field to AIAgentRunStep table (nullable uniqueidentifier with FK)
ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
ADD ParentID UNIQUEIDENTIFIER NULL;

-- Add foreign key constraint for ParentID to self-reference AIAgentRunStep
ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
ADD CONSTRAINT FK_AIAgentRunStep_ParentID FOREIGN KEY (ParentID)
REFERENCES ${flyway:defaultSchema}.AIAgentRunStep(ID);

-- Add extended property for ParentID in AIAgentRunStep
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional reference to parent step for tracking hierarchical relationships like code->test->fix->code cycles',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRunStep',
    @level2type = N'COLUMN', @level2name = N'ParentID';

-- Add Comments field to AIAgentRunStep table (nullable nvarchar(max))
ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
ADD Comments NVARCHAR(MAX) NULL;

-- Add extended property for Comments in AIAgentRunStep
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Human-readable notes and comments about this agent run step',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRunStep',
    @level2type = N'COLUMN', @level2name = N'Comments';