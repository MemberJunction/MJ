-- Adding the timestamp here ensures the checksum changes each time so this runs every time
-- ${flyway:timestamp}

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging,${flyway:defaultSchema}'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging,${flyway:defaultSchema}'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging,${flyway:defaultSchema}'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging,${flyway:defaultSchema}'
