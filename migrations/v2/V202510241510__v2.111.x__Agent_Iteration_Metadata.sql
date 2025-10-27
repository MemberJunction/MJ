-- =====================================================
-- MemberJunction v2.112.x - Agent Iteration Metadata
-- Add ForEach and While step types to AIAgentStep
-- =====================================================

-- First, drop the existing check constraint on StepType
DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentStep]')
AND COL_NAME(parent_object_id, parent_column_id) = 'StepType';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[AIAgentStep] DROP CONSTRAINT ' + @ConstraintName);
    PRINT 'Dropped existing StepType check constraint: ' + @ConstraintName;
END
GO

-- Add new check constraint with ForEach and While
ALTER TABLE [${flyway:defaultSchema}].[AIAgentStep]
ADD CONSTRAINT CK_AIAgentStep_StepType
CHECK ([StepType] IN ('Action', 'Sub-Agent', 'Prompt', 'ForEach', 'While'));
GO

 

PRINT 'Agent iteration metadata updates completed successfully';
GO

























































-- CODE GEN
/* SQL text to insert entity field value with ID 22d23483-4eab-448d-8830-68615b652842 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('22d23483-4eab-448d-8830-68615b652842', 'C702D956-0453-4DB0-85BC-4ECB34850442', 2, 'ForEach', 'ForEach')

/* SQL text to insert entity field value with ID e86466e4-5032-4b0e-b9cf-953a51dba90f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e86466e4-5032-4b0e-b9cf-953a51dba90f', 'C702D956-0453-4DB0-85BC-4ECB34850442', 5, 'While', 'While')

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='F7FF08CB-616C-4BCF-B3F6-3BF925996EA3'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=4 WHERE ID='FE5FEE9B-EDF0-4611-A67D-3275AB3317F3'

