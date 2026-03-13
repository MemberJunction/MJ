# Virtual Entity Field Decoration

You are an expert database analyst specializing in SQL Server views and MemberJunction entity metadata. Your task is to analyze a virtual entity (backed by a SQL view) and identify:

1. **Primary Key Fields** — which field(s) uniquely identify each row
2. **Foreign Key Fields** — which fields reference other entities
3. **Field Descriptions and Categories** — what each field represents and how to group them
4. **Entity Icon** — a Font Awesome icon representing this entity

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
{% for field in fields %}
| {{ field.Name }} | {{ field.Type }}{% if field.Length %}({{ field.Length }}){% endif %} | {% if field.AllowsNull %}Yes{% else %}No{% endif %} | {% if field.IsPrimaryKey %}Yes{% else %}No{% endif %} | {% if field.RelatedEntityName %}{{ field.RelatedEntityName }}{% else %}-{% endif %} |
{% endfor %}

{% if sourceEntities and sourceEntities.length > 0 %}
## Source Entity Context

These are the entities referenced by the view's SQL. Use their field descriptions and categories to inform your analysis of the virtual entity fields.

{% for entity in sourceEntities %}
### {{ entity.Name }}
{{ entity.Description }}

| Field Name | Type | Description | Category | PK | FK |
|-----------|------|------------|----------|----|----|
{% for field in entity.Fields %}
| {{ field.Name }} | {{ field.Type }} | {{ field.Description }} | {{ field.Category if field.Category else '-' }} | {% if field.IsPrimaryKey %}Yes{% else %}No{% endif %} | {% if field.IsForeignKey %}Yes{% else %}No{% endif %} |
{% endfor %}

{% endfor %}
{% endif %}

## Available Entities in This Database

These are the entities that foreign keys could reference:

{% for entity in availableEntities %}
- **{{ entity.Name }}** (Table: [{{ entity.SchemaName }}].[{{ entity.BaseTable }}], PK: {{ entity.PrimaryKeyField }})
{% endfor %}

## Instructions

Analyze the view definition and field names to determine:

1. **Primary Keys**: Look at the view's source tables and JOIN conditions to identify which field(s) uniquely identify rows. Consider field names ending in "ID", fields used in GROUP BY, or fields from the primary source table.

2. **Foreign Keys**: Match field names against available entity tables. Common patterns:
   - Fields named `<EntityName>ID` or `<TableName>ID` likely reference that entity
   - Fields in JOIN conditions often indicate relationships
   - Only suggest FKs to entities that actually exist in the available entities list

3. **Field Descriptions**: For each field, provide a concise description based on the view definition context.

4. **Field Categories**: Assign each field to a semantic category (3-5 categories). Guidelines:
   - If source entities have categories, prefer inheriting those when a 1:1 field mapping exists
   - Fields named `__mj_CreatedAt` or `__mj_UpdatedAt` always go to **"System Metadata"**
   - ID/key fields typically go to **"Identification"** or similar
   - Group related fields together logically (e.g., "Financial", "Customer Details", "Order Summary")
   - Categories should be human-readable, Title Case, 1-3 words

5. **Display Names**: Generate a human-friendly display name for each field (e.g., "CustomerID" → "Customer", "TotalOrderCount" → "Total Orders").

6. **Entity Icon**: Suggest a Font Awesome icon class that represents this entity's purpose (e.g., "fa-solid fa-chart-line" for analytics views, "fa-solid fa-users" for customer data).

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
      "extendedType": null,
      "category": "Category Name",
      "displayName": "Human Friendly Name",
      "codeType": null
    }
  ],
  "entityIcon": "fa-solid fa-chart-line",
  "categoryInfo": {
    "Category Name": {
      "icon": "fa-solid fa-info-circle",
      "description": "Brief description of what this category contains"
    }
  },
  "reasoning": "Brief explanation of analysis approach"
}
```

Notes:
- `confidence` must be "high", "medium", or "low"
- Only include foreign keys with "high" or "medium" confidence
- `extendedType` is optional — only use one of these exact values when the field content clearly matches: `Code`, `Email`, `FaceTime`, `Geo`, `MSTeams`, `Other`, `SIP`, `SMS`, `Skype`, `Tel`, `URL`, `WhatsApp`, `ZoomMtg`. For phone numbers use `Tel`, for addresses/coordinates use `Geo`, for Microsoft Teams links use `MSTeams`, for Zoom links use `ZoomMtg`. Do NOT use values outside this list.
- `codeType` is optional — only use one of: `CSS`, `HTML`, `JavaScript`, `SQL`, `TypeScript`, `Other`. Use when the field content is source code or markup.
- `category` is required for every field — assign a semantic category to each field
- `displayName` is required for every field — provide a user-friendly name
- `entityIcon` should be a valid Font Awesome 6 icon class
- `categoryInfo` must include an entry for every unique category you assign to fields
- Do NOT guess — if unsure about a PK or FK, omit it
