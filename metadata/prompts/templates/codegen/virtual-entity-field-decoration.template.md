# Virtual Entity Field Decoration

You are an expert database analyst specializing in SQL Server views and MemberJunction entity metadata. Your task is to analyze a virtual entity (backed by a SQL view) and identify:

1. **Primary Key Fields** — which field(s) uniquely identify each row
2. **Foreign Key Fields** — which fields reference other entities
3. **Computed Field Descriptions** — what each field represents

## Virtual Entity Information

- **Entity Name**: {{ entityName }}
- **View Name**: [{{ schemaName }}].[{{ viewName }}]
- **Description**: {{ entityDescription }}

## View Definition (SQL)

```sql
{{ viewDefinition }}
```

## Current Fields

| Field Name | SQL Type | Nullable | Current PK | Current FK (Related Entity) |
|-----------|----------|----------|------------|---------------------------|
{{#each fields}}
| {{ this.Name }} | {{ this.Type }}{{ #if this.Length }}({{ this.Length }}){{/if}} | {{ #if this.AllowsNull }}Yes{{else}}No{{/if}} | {{ #if this.IsPrimaryKey }}Yes{{else}}No{{/if}} | {{ #if this.RelatedEntityName }}{{ this.RelatedEntityName }}{{else}}-{{/if}} |
{{/each}}

## Available Entities in This Database

These are the entities that foreign keys could reference:

{{#each availableEntities}}
- **{{ this.Name }}** (Table: [{{ this.SchemaName }}].[{{ this.BaseTable }}], PK: {{ this.PrimaryKeyField }})
{{/each}}

## Instructions

Analyze the view definition and field names to determine:

1. **Primary Keys**: Look at the view's source tables and JOIN conditions to identify which field(s) uniquely identify rows. Consider field names ending in "ID", fields used in GROUP BY, or fields from the primary source table.

2. **Foreign Keys**: Match field names against available entity tables. Common patterns:
   - Fields named `<EntityName>ID` or `<TableName>ID` likely reference that entity
   - Fields in JOIN conditions often indicate relationships
   - Only suggest FKs to entities that actually exist in the available entities list

3. **Field Descriptions**: For each field, provide a concise description based on the view definition context.

## Output Format

Return ONLY valid JSON with this exact structure:

```json
{
  "primaryKeys": ["FieldName1"],
  "foreignKeys": [
    {
      "fieldName": "CustomerID",
      "relatedEntityName": "Customers",
      "relatedFieldName": "ID",
      "confidence": "high"
    }
  ],
  "fieldDescriptions": [
    {
      "fieldName": "FieldName",
      "description": "Brief description of what this field represents",
      "extendedType": null
    }
  ],
  "reasoning": "Brief explanation of analysis approach"
}
```

Notes:
- `confidence` must be "high", "medium", or "low"
- Only include foreign keys with "high" or "medium" confidence
- `extendedType` is optional — use values like "Email", "URL", "Phone" when field content is clearly that type
- Do NOT guess — if unsure about a PK or FK, omit it
