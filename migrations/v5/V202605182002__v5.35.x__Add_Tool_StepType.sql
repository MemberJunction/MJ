-- =====================================================
-- MemberJunction v5.35.x — Add 'Tool' StepType to AIAgentRunStep
--
-- Adds a generic 'Tool' StepType so artifact tool calls (and future tool
-- mechanisms whose dispatch is higher-order than Actions) can be recorded
-- as first-class run steps with their own InputData / OutputData rather
-- than being buried inside the parent Prompt step's OutputData blob.
--
-- Step naming convention (enforced in base-agent, not the DB): each step
-- created for an artifact tool call uses StepName='Artifact Tool: {toolName}'
-- so the run-tree UI / logs read naturally.
-- =====================================================

-- Drop existing check constraint on StepType
DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunStep]')
AND COL_NAME(parent_object_id, parent_column_id) = 'StepType';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[AIAgentRunStep] DROP CONSTRAINT ' + @ConstraintName);
    PRINT 'Dropped existing StepType check constraint: ' + @ConstraintName;
END
GO

-- Add new check constraint including 'Tool'
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRunStep]
ADD CONSTRAINT CK_AIAgentRunStep_StepType
CHECK ([StepType] IN ('Prompt', 'Actions', 'Sub-Agent', 'Chat', 'Decision', 'Validation', 'ForEach', 'While', 'Tool'));
GO

-- Update extended property to reflect new value list
IF EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRunStep')
      AND minor_id = (
          SELECT column_id FROM sys.columns
          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRunStep')
            AND name = 'StepType'
      )
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'AIAgentRunStep',
        @level2type = N'COLUMN', @level2name = N'StepType';
END;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of execution step: Prompt, Actions, Sub-Agent, Decision, Chat, Validation, ForEach, While, Tool',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRunStep',
    @level2type = N'COLUMN', @level2name = N'StepType';
GO
