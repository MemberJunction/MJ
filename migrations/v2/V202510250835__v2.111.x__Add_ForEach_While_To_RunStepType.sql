-- =====================================================
-- MemberJunction v2.111.x - Add ForEach and While to AIAgentRunStep.StepType
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

-- Add new check constraint with ForEach and While
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRunStep]
ADD CONSTRAINT CK_AIAgentRunStep_StepType
CHECK ([StepType] IN ('Prompt', 'Actions', 'Sub-Agent', 'Chat', 'Decision', 'Validation', 'ForEach', 'While'));
GO
 















-- CODE GEN RUN
/* SQL text to insert entity field value with ID 25f32577-92f9-4edd-8824-c5f7a9fda8b9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('25f32577-92f9-4edd-8824-c5f7a9fda8b9', 'B04A327B-55BF-4914-9DCF-3552A5DD0293', 4, 'ForEach', 'ForEach')

/* SQL text to insert entity field value with ID 5e90d638-0329-4ff7-ba05-b38037474bf5 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5e90d638-0329-4ff7-ba05-b38037474bf5', 'B04A327B-55BF-4914-9DCF-3552A5DD0293', 8, 'While', 'While')

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=5 WHERE ID='B4FDC768-5F15-4720-B9EA-FB39634AFEF9'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=6 WHERE ID='B1115D73-2524-4329-B202-B6D453DE8FA9'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='61F9CF39-ECB3-4476-9AFC-7F037F5EB34E'

