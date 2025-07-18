You are an expert at parsing Nunjucks templates. Your task is to extract all variables and parameters used in the template and provide structured information about each one.

## Template to Analyze: 
{{ templateText }}

## Instructions:
Identify ALL variables used in the template, including:
1. Simple variables: {% raw %}{{ variableName }}{% endraw %}
2. Object properties: {% raw %}{{ user.email }}{% endraw %}, {% raw %}{{ data.items[0].name }}{% endraw %}
3. Variables in conditionals: {% raw %}{% if isActive %}{% endraw %}, {% raw %}{% if user.role == "admin" %}{% endraw %}
4. Loop variables: {% raw %}{% for item in items %}{% endraw %}, {% raw %}{% for key, value in object %}{% endraw %}
5. Variables in filters: {% raw %}{{ name | default(userName) }}{% endraw %}
6. Variables in function calls: {% raw %}{{ formatDate(createdAt) }}{% endraw %}
7. Variables in assignments: {% raw %}{% set total = price * quantity %}{% endraw %}

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
  ]
}
```

## Rules:
1. Only include each variable ONCE (deduplicate)
2. Ignore Nunjucks built-in variables (loop, super, etc.)
3. Ignore {% raw %}single curly braces like { and } --- only look for double curly braces {{ and }} for true nunjucks params {% endraw %}
4. Ignore System Placholders. These are populated by the system, and are not considered template parameters. These 
system placholders start with a single _ character, for example in the below, you would ignore _OUTPUT_EXAMPLE
  {% raw %}My Template: {{ _OUTPUT_EXAMPLE }}{% endraw %}
5. For type detection:
   - If used in {% raw %}{% for x in variable %}{% endraw %} → type is "Array"
   - If properties are accessed (variable.property) → type is "Object"
   - Otherwise → type is "Scalar"
6. **MOST VARIABLES ARE OPTIONAL**: Generally speaking consider variables to **NOT** be required unless it is clear the template will be dramatically negatively affected due to the absence of the variable.
7. Include meaningful descriptions based on usage context
8. When in doubt, do NOT provide variables back, only pass back what you are SURE are true Nunjucks variables.

## Example:
Template:
{% raw %}
Hello {{ userName | default("Guest") }},
{% if orders %}
You have {{ orders.length }} orders.
{% for order in orders %}
- Order #{{ order.id }}: {{ order.total }}
{% endfor %}
{% endif %}
{% endraw %}

Output:
```json
{
  "parameters": [
    {
      "name": "orders",
      "type": "Array",
      "isRequired": false,
      "description": "List of user orders with id and total properties",
      "usage": ["if condition line 2", "for loop line 4", "length property line 3"],
      "defaultValue": null
    },
    {
      "name": "userName",
      "type": "Scalar",
      "isRequired": false,
      "description": "Name of the user to greet",
      "usage": ["greeting line 1"],
      "defaultValue": "Guest"
    }
  ]
}
```