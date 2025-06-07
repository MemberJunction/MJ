-- manually run what is normally in the R script but with fixed-up values that do NOT exclude the __mj schema from metadata
-- healing oprations. Normally these are done in R scripts after migrations are run but in this case since we are
-- about to add a unique constraint to the EntityField table, we need to ensure that the metadata is correct before that

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

-- Now that metadata is okay, Add unique constraint to EntityField table    
ALTER TABLE [${flyway:defaultSchema}].[EntityField]
ADD CONSTRAINT UQ_EntityField_EntityID_Sequence 
UNIQUE (EntityID, Sequence);
