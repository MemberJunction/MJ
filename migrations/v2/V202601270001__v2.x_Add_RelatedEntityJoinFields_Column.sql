/*
  Migration: Add RelatedEntityJoinFields column to EntityField table

  Purpose: Enables configuration of additional fields to join from related entities
  into base views, extending or overriding the default NameField behavior.

  JSON Schema:
  {
    "mode": "extend" | "override" | "disable",
    "fields": [
      { "field": "FieldName", "alias": "OptionalAlias" }
    ]
  }
*/

-- Add the new column
ALTER TABLE ${flyway:defaultSchema}.EntityField
ADD RelatedEntityJoinFields NVARCHAR(MAX) NULL;
GO

-- Add extended property documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration for additional fields to join from the related entity into this entity''s base view. Supports modes: extend (add to NameField), override (replace NameField), disable (no joins). Schema: { mode?: string, fields?: [{ field: string, alias?: string }] }',
    @level0type = N'SCHEMA', @level0name = ${flyway:defaultSchema},
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'RelatedEntityJoinFields';
GO
