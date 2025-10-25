-- =====================================================
-- MemberJunction v2.112.x - Add ForEach and While to FinalStep
-- Extend AIAgentRun.FinalStep enum to support loop step types
-- =====================================================

-- Drop existing check constraint on FinalStep
DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
AND COL_NAME(parent_object_id, parent_column_id) = 'FinalStep';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[AIAgentRun] DROP CONSTRAINT ' + @ConstraintName);
    PRINT 'Dropped existing FinalStep check constraint: ' + @ConstraintName;
END
GO

-- Add new check constraint with ForEach and While
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRun]
ADD CONSTRAINT CK_AIAgentRun_FinalStep
CHECK ([FinalStep] IS NULL OR [FinalStep] IN ('Success', 'Failed', 'Retry', 'Actions', 'Sub-Agent', 'Chat', 'ForEach', 'While'));
GO














































































-- CODE GEN RUN
/* SQL text to insert entity field value with ID 8739b10b-67df-4adc-87e3-80cb8b7bbebc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8739b10b-67df-4adc-87e3-80cb8b7bbebc', 'A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED', 4, 'ForEach', 'ForEach')

/* SQL text to insert entity field value with ID 4bb7e01a-0fe5-4fd9-b995-b0e420b2c921 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4bb7e01a-0fe5-4fd9-b995-b0e420b2c921', 'A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED', 8, 'While', 'While')

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=5 WHERE ID='AEC1C02F-0D5D-4500-8862-4572F1329663'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=6 WHERE ID='F936207B-7BD2-4935-9152-C8486DB38F81'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='E88210ED-F8CB-457F-9E7D-DFA7576AAD02'

