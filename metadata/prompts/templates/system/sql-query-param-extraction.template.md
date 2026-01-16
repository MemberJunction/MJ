You are an expert at parsing Nunjucks templates. You are also an expert at SQL Server queries. 
Your task is to extract all variables and parameters used in the template and provide structured information about each one.

## SQL Query Template:
{{ templateText }}

{% if entities and entities.length > 0 %}
## Entity Metadata
The following entities are referenced in this query. Use this information to determine the correct data types and generate appropriate sample values for parameters.

{% for entity in entities %}
### {{ entity.name }}
Schema: {{ entity.schemaName }}, View: {{ entity.baseView }}
Fields:
{% for field in entity.fields %}- {{ field.name }}: {{ field.type }}{% if field.isPrimaryKey %} (PK){% endif %}
{% endfor %}
{% endfor %}
{% endif %}

## Instructions:
Identify ALL variables used in the template, including:
1. Simple variables: {% raw %}{{ variableName }}{% endraw %}
2. Object properties: {% raw %}{{ user.email }}{% endraw %}, {% raw %}{{ data.items[0].name }}{% endraw %}
3. Variables in conditionals: {% raw %}{% if isActive %}{% endraw %}, {% raw %}{% if user.role == "admin" %}{% endraw %}
4. Loop variables: {% raw %}{% for item in items %}{% endraw %}, {% raw %}{% for key, value in object %}{% endraw %}
5. Variables in filters: {% raw %}{{ name | default(userName) }}{% endraw %}
6. Variables in assignments: {% raw %}{% set total = price * quantity %}{% endraw %}

## **IMPORTANT** 
Do NOT include variables that are shown within {% raw %}{% raw %}{% endraw %}{% endraw %} blocks, those are for illustrative purposes and part of an illustration of what another template might have. Only consider variables that are **NOT** part of raw blocks to be valid for the purpose of this request.

For nested object references (like user.email), extract only the TOP-LEVEL variable name (user).

## Output Format:
Return a JSON array of parameter objects with this structure:

```json
{
  "parameters": [
    {
      "name": "variableName",
      "type": "string|number|date|boolean|array|object",
      "isRequired": true|false,
      "description": "Brief description of what this parameter is used for based on context",
      "usage": ["List of locations where this variable is used in the template"],
      "defaultValue": "Default value if found in template (e.g., from default filter)",
      "sampleValue": "A realistic test value based on the parameter type and entity metadata (e.g., UUID for uniqueidentifier, valid date for datetime)"
    }
  ],
  "selectClause": [
    {
        "name": "name of field in the result of the query",
        "dynamicName": true, // only true if the name of the field in the result is calculated in the nunjucks template. Uncommon but possible
        "description": "Description of what this field will contain",
        "type": "number|string|date|boolean",
        "optional": false, // usually false, only true if the field is part of an IF block and sometimes not emitted based on parameter values
        "sourceEntity": "EntityName or null", // The MJ entity name from the provided metadata that this field originates from. null if computed/aggregated.
        "sourceFieldName": "FieldName or null", // The actual field name on the source entity. null if computed/aggregated.
        "isComputed": false, // true if field is an expression/calculation rather than a direct column reference
        "isSummary": false, // true if field uses an aggregate function (SUM, COUNT, AVG, MIN, MAX, etc.)
        "computationDescription": "Explanation of computation" // Only include if isComputed or isSummary is true
    }
  ]
}
```

## Source Entity Tracking (for selectClause fields)
For each field in the selectClause, identify where the data originates from by examining the SELECT clause and matching columns to the entity metadata provided above.

**Fields to populate:**
- **sourceEntity**: The MJ entity name (from the Entity Metadata section) that this field originates from
- **sourceFieldName**: The actual field name on that entity (before any aliasing)

**When to populate source fields (sourceEntity and sourceFieldName):**
- Direct column references: `a.City` → sourceEntity matches the entity for alias 'a', sourceFieldName="City"
- Aliased columns: `a.City AS CustomerCity` → Still maps to the source entity/field, name="CustomerCity"
- Joined table columns: `i.Name` → sourceEntity matches the entity for alias 'i', sourceFieldName="Name"
- Use the Entity Metadata section to match table aliases (like 'a', 'i') to their entity names

**When to set sourceEntity and sourceFieldName to null:**
- Aggregate functions: `COUNT(*)`, `SUM(a.Revenue)` → set both to null, isComputed=true, isSummary=true
- Computed expressions: `a.Price * a.Quantity` → set both to null, isComputed=true
- Subquery results: `(SELECT COUNT(*) FROM ...)` → set both to null, isComputed=true
- Literal values: `'Active' AS Status` → set both to null, isComputed=true
- CASE expressions: `CASE WHEN ... END` → set both to null, isComputed=true

**isComputed vs isSummary:**
- **isComputed=true**: The field value is calculated, not a direct column reference (includes aggregates, expressions, literals, subqueries)
- **isSummary=true**: The field uses an aggregate function (COUNT, SUM, AVG, MIN, MAX, etc.) - always also set isComputed=true
- **computationDescription**: Provide a brief explanation when isComputed or isSummary is true

## Rules:
1. Only include each variable ONCE (deduplicate)
2. Ignore Nunjucks built-in variables (loop, super, etc.)
3. Ignore {% raw %}single curly braces like { and } --- only look for double curly braces {{ and }} for true nunjucks params {% endraw %}
4. For type detection:
   - If used in {% raw %}{% for x in variable %}{% endraw %} → type is "array"
   - If properties are accessed (variable.property) → type is "object" and extract only the top-level variable name
   - Check filters for type hints: sqlString → "string", sqlNumber → "number", sqlDate → "date", sqlIn → "array"
   - Otherwise infer from context: comparison operators, SQL clause usage, default values
   - When in doubt, use "string"
5. Include meaningful descriptions based on usage context
6. For usage array, provide specific examples showing exactly where/how the variable is used in the template

## Example:
Template:
{% raw %}
```sql
SELECT 
   COUNT(*) TotalAccounts,
   SUM(a.Revenue) TotalAccountRevenue,
{% if extraSumField != "" and extraSumFieldAlias != "" }
   SUM({{ extraSumField | sqlIdentifier }}) {{ extraSumFieldAlias | sqlIdentifier }},
{% endif %}
   a.City,
   a.Country,
   a.Region,
   a.Industry,
   i.AverageFirmRevenue,
   i.NumFirms,
   (SELECT COUNT(*) FROM crm.vwCities WHERE Country = a.Country) AS CitiesInCountry,
FROM
   crm.vwAccounts a
INNER JOIN
   crm.vwIndustries i
ON
   a.IndustryID = i.ID
WHERE
   a.Country IN {{ countryList | sqlIn }} AND
   i.NumFirms >= {{ minIndustryFirmCount | sqlNumber }} AND
   a.__mj_CreatedAt >= {{ accountsCreatedOnOrAfter | sqlDate }}
GROUP BY
   a.City,
   a.Country,
   a.Region,
   a.Industry,
   i.AverageFirmRevenue,
   i.NumFirms
{% if orderByClause }
ORDER BY
   {{ orderByClause | sqlNoKeywordsExpression }} -- this means that we run through a filter making sure no keywords are included to prevent common SQL injection attacks
{% endif %}
{% endraw %}
```

Example Output for the above template:
```json
{
  "parameters": [
    {
      "name": "extraSumField",
      "type": "string",
      "isRequired": false,
      "description": "Field name for an optional additional sum aggregation",
      "usage": [
        "Conditional SELECT: SUM({% raw %}{{ extraSumField | sqlIdentifier }}{% endraw %}) {% raw %}{{ extraSumFieldAlias | sqlIdentifier }}{% endraw %}",
        "IF condition check: {% raw %}{% if extraSumField != \"\" and extraSumFieldAlias != \"\" %}{% endraw %}"
      ],
      "defaultValue": null,
      "sampleValue": "Revenue"
    },
    {
      "name": "extraSumFieldAlias",
      "type": "string",
      "isRequired": false,
      "description": "Alias for the optional extraSumField aggregation column",
      "usage": [
        "Column alias: {% raw %}{{ extraSumFieldAlias | sqlIdentifier }}{% endraw %}",
        "IF condition check: {% raw %}{% if extraSumField != \"\" and extraSumFieldAlias != \"\" %}{% endraw %}"
      ],
      "defaultValue": null,
      "sampleValue": "TotalRevenue"
    },
    {
      "name": "countryList",
      "type": "array",
      "isRequired": true,
      "description": "Array of country names to filter accounts",
      "usage": [
        "WHERE clause: a.Country IN {% raw %}{{ countryList | sqlIn }}{% endraw %}"
      ],
      "defaultValue": null,
      "sampleValue": "USA,Canada,Mexico"
    },
    {
      "name": "minIndustryFirmCount",
      "type": "number",
      "isRequired": true,
      "description": "Minimum number of firms required for industry inclusion",
      "usage": [
        "WHERE clause: i.NumFirms >= {% raw %}{{ minIndustryFirmCount | sqlNumber }}{% endraw %}"
      ],
      "defaultValue": null,
      "sampleValue": "10"
    },
    {
      "name": "accountsCreatedOnOrAfter",
      "type": "date",
      "isRequired": true,
      "description": "Earliest account creation date for filtering",
      "usage": [
        "WHERE clause: a.__mj_CreatedAt >= {% raw %}{{ accountsCreatedOnOrAfter | sqlDate }}{% endraw %}"
      ],
      "defaultValue": null,
      "sampleValue": "2024-01-01"
    },
    {
      "name": "orderByClause",
      "type": "string",
      "isRequired": false,
      "description": "Custom ORDER BY expression for result sorting",
      "usage": [
        "ORDER BY clause: {% raw %}{{ orderByClause | sqlNoKeywordsExpression }}{% endraw %}",
        "IF condition check: {% raw %}{% if orderByClause %}{% endraw %}"
      ],
      "defaultValue": null,
      "sampleValue": "TotalAccounts DESC"
    } 
  ],
  "selectClause": [
    {
        "name": "TotalAccounts",
        "description": "Total number of accounts for each grouping",
        "type": "number",
        "optional": false,
        "sourceEntity": null,
        "sourceFieldName": null,
        "isComputed": true,
        "isSummary": true,
        "computationDescription": "COUNT(*) aggregate counting all records in each group"
    },
    {
        "name": "TotalAccountRevenue",
        "description": "Total revenue for all accounts, combined, for each grouping",
        "type": "number",
        "optional": false,
        "sourceEntity": null,
        "sourceFieldName": null,
        "isComputed": true,
        "isSummary": true,
        "computationDescription": "SUM(a.Revenue) - aggregates Revenue field from Accounts"
    },
    {
        "name": "extraSumFieldAlias",
        "dynamicName": true,
        "description": "Additional Summary based on provided parameter: extraSumField",
        "type": "number",
        "optional": true,
        "sourceEntity": null,
        "sourceFieldName": null,
        "isComputed": true,
        "isSummary": true,
        "computationDescription": "SUM() aggregate on dynamic field specified by extraSumField parameter"
    },
    {
        "name": "City",
        "description": "City name for the grouping",
        "type": "string",
        "optional": false,
        "sourceEntity": "Accounts",
        "sourceFieldName": "City",
        "isComputed": false,
        "isSummary": false
    },
    {
        "name": "Country",
        "description": "Country name for the grouping",
        "type": "string",
        "optional": false,
        "sourceEntity": "Accounts",
        "sourceFieldName": "Country",
        "isComputed": false,
        "isSummary": false
    },
    {
        "name": "Region",
        "description": "Region name for the grouping",
        "type": "string",
        "optional": false,
        "sourceEntity": "Accounts",
        "sourceFieldName": "Region",
        "isComputed": false,
        "isSummary": false
    },
    {
        "name": "Industry",
        "description": "Name of the industry for the grouping",
        "type": "string",
        "optional": false,
        "sourceEntity": "Accounts",
        "sourceFieldName": "Industry",
        "isComputed": false,
        "isSummary": false
    },
    {
        "name": "AverageFirmRevenue",
        "description": "Average Revenue for the industry in this grouping",
        "type": "number",
        "optional": false,
        "sourceEntity": "Industries",
        "sourceFieldName": "AverageFirmRevenue",
        "isComputed": false,
        "isSummary": false
    },
    {
        "name": "NumFirms",
        "description": "Total # of firms for the industry in this grouping",
        "type": "number",
        "optional": false,
        "sourceEntity": "Industries",
        "sourceFieldName": "NumFirms",
        "isComputed": false,
        "isSummary": false
    },
    {
        "name": "CitiesInCountry",
        "description": "Count of the # of cities in the country in this grouping",
        "type": "number",
        "optional": false,
        "sourceEntity": null,
        "sourceFieldName": null,
        "isComputed": true,
        "isSummary": true,
        "computationDescription": "Scalar subquery counting cities from Cities entity where Country matches"
    }
  ]
}
```