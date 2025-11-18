You are an expert at parsing Nunjucks templates. You are also an expert at SQL Server queries. 
Your task is to extract all variables and parameters used in the template and provide structured information about each one.

## SQL Query Template: 
{{ templateText }}

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
      "defaultValue": "Default value if found in template (e.g., from default filter)"
    }
  ],
  "selectClause": [
    {
        "name": "name of field in the result of the query",  
        "dynamicName": true, // only true if the name of the field in the result is calculated in the nunjucks template. Uncommon but possible
        "description": "Description of what this field will contain",
        "type": "number|string|date|boolean",
        "optional": false // usually false, only true if the field is part of an IF block and sometimes not emitted based on parameter values
    }
  ],
  "fromClause": [
    {
        "schemaName": "name of the schema the view or table is in",
        "baseViewOrTable": "name of the view or table being selected from",
        "alias": "if an alias was used in the query for this base view/table, indicate it here"
    }
  ]
}
```

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
        "Conditional SELECT: SUM({{ extraSumField | sqlIdentifier }}) {{ extraSumFieldAlias | sqlIdentifier }}",
        "IF condition check: {% if extraSumField != \"\" and extraSumFieldAlias != \"\" %}"
      ],
      "defaultValue": null
    },
    {
      "name": "extraSumFieldAlias",
      "type": "string",
      "isRequired": false,
      "description": "Alias for the optional extraSumField aggregation column",
      "usage": [
        "Column alias: {{ extraSumFieldAlias | sqlIdentifier }}",
        "IF condition check: {% if extraSumField != \"\" and extraSumFieldAlias != \"\" %}"
      ],
      "defaultValue": null
    },
    {
      "name": "countryList",
      "type": "array",
      "isRequired": true,
      "description": "Array of country names to filter accounts",
      "usage": [
        "WHERE clause: a.Country IN {{ countryList | sqlIn }}"
      ],
      "defaultValue": null
    },
    {
      "name": "minIndustryFirmCount",
      "type": "number",
      "isRequired": true,
      "description": "Minimum number of firms required for industry inclusion",
      "usage": [
        "WHERE clause: i.NumFirms >= {{ minIndustryFirmCount | sqlNumber }}"
      ],
      "defaultValue": null
    },
    {
      "name": "accountsCreatedOnOrAfter",
      "type": "date",
      "isRequired": true,
      "description": "Earliest account creation date for filtering",
      "usage": [
        "WHERE clause: a.__mj_CreatedAt >= {{ accountsCreatedOnOrAfter | sqlDate }}"
      ],
      "defaultValue": null
    },
    {
      "name": "orderByClause",
      "type": "string",
      "isRequired": false,
      "description": "Custom ORDER BY expression for result sorting",
      "usage": [
        "ORDER BY clause: {{ orderByClause | sqlNoKeywordsExpression }}",
        "IF condition check: {% if orderByClause %}"
      ],
      "defaultValue": null
    } 
  ],
  "selectClause": [
    {
        "name": "TotalAccounts",
        "description": "Total number of accounts for each grouping",
        "type": "number",
        "optional": false // field is always returned
    },
    {
        "name": "TotalAccountRevenue",
        "description": "Total revenue for all accounts, combined, for each grouping",
        "type": "number",
        "optional": false
    },
    {
        "name": "extraSumFieldAlias", // parameter name the field ends up having as its name 
        "dynamicName": true, // indicates the name of the field in the result is dynamic, derived from the parameter specified
        "description": "Additional Summary based on provided paramater: extraSumField",
        "type": "number",
        "optional": true
    },
    {
        "name": "City",
        "description": "City name for the grouping",
        "type": "string",
        "optional": false
    },
    {
        "name": "Country",
        "description": "Country name for the grouping",
        "type": "string",
        "optional": false
    },
    {
        "name": "Region",
        "description": "Region name for the grouping",
        "type": "string",
        "optional": false
    },
    {
        "name": "Industry",
        "description": "Name of the industry for the grouping",
        "type": "string",
        "optional": false
    },
    {
        "name": "AverageFirmRevenue",
        "description": "Average Revenue for the industry in this grouping",
        "type": "number",
        "optional": false
    },
    {
        "name": "NumFirms",
        "description": "Total # of firms for the industry in this grouping",
        "type": "number",
        "optional": false
    },
    {
      "name": "CitiesInCountry",
      "description": "Count of the # of cities in the country in this grouping",
      "type": "number",
      "optional": false
    }
  ],
  "fromClause": [
    {
        "schemaName": "crm",
        "baseViewOrTable": "vwAccounts",
        "alias": "a"
    },
    {
        "schemaName": "crm",
        "baseViewOrTable": "vwIndustries",
        "alias": "i"
    },
    {
        "schemaName": "crm",
        "baseViewOrTable": "vwCities"
    }
  ]
}
```