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
      "type": "Scalar|Array|Object",
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
        "schemaName": "name of the schema the view is in",
        "baseView": "name of the view - always selecting from base views, not tables",
        "alias": "if an alias was used in the query for this base view, indicate it here"
    }
  ]
}
```

## Rules:
1. Only include each variable ONCE (deduplicate)
2. Ignore Nunjucks built-in variables (loop, super, etc.)
3. Ignore {% raw %}single curly braces like { and } --- only look for double curly braces {{ and }} for true nunjucks params {% endraw %}
4. For type detection:
   - If used in {% raw %}{% for x in variable %}{% endraw %} → type is "Array"
   - If properties are accessed (variable.property) → type is "Object"
   - Otherwise → type is 'string' | 'number' | 'date' | 'boolean' - you can infer the type based on its use. When in doubt, use `string` 
5. Include meaningful descriptions based on usage context

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
   a.Industry
   i.AverageFirmRevenue,
   i.NumFirms
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
      "isRequired": false, // not required because if not provided query adapts
      "description": "Field used for an extra sum in the aggregation",
      "usage": ["example usage", "example usage 2", "example usage 3"],
      "defaultValue": null
    },
    {
      "name": "extraSumFieldAlias",
      "type": "string",
      "isRequired": false, // not required because if not provided query adapts
      "description": "If extraSumField is provided, this is the alias used for the summation operation",
      "usage": ["example usage", "example usage 2", "example usage 3"],
      "defaultValue": null
    },
    {
      "name": "countryList",
      "type": "array",
      "isRequired": true, // required because query will not run without this
      "description": "Array of countries to filter the query on",
      "usage": ["example usage", "example usage 2"],
      "defaultValue": null
    },
    {
      "name": "minIndustryFirmCount",
      "type": "number",
      "isRequired": true, // required because query will not run without this
      "description": "filter condition to include only industries where NumFirms >= this amount",
      "usage": ["example usage"],
      "defaultValue": null
    },
    {
      "name": "accountsCreatedOnOrAfter",
      "type": "date",
      "isRequired": true, // required because query will not run without this
      "description": "filter condition to include only accounts created on/after this date",
      "usage": ["example usage"],
      "defaultValue": null
    },
    {
      "name": "orderByClause",
      "type": "string",
      "isRequired": false, // NOT required because query will adapt without this
      "description": "Sorting clause to be used when provided to order the results",
      "usage": ["example usage"],
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
  ],
  "fromClause": [
    {
        "schemaName": "crm",
        "baseView": "vwAccounts",
        "alias": "a"
    },
    {
        "schemaName": "crm",
        "baseView": "vwIndustries",
        "alias": "i"
    }
  ]
}
```