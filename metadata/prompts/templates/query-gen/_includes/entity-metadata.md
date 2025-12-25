# Available Entities
The following entities are available for your query. Key rules:
- Always prefix view names with schema names as shown: `[SchemaName].[ViewName]`
- Use T-SQL syntax for SQL Server
- Query from base views (vw*), not base tables
- **CRITICAL**: Only use entities and fields explicitly listed below - DO NOT infer or guess schema
- **VIRTUAL fields** are computed/lookup fields available in the view - use these instead of JOINs when possible

{% for entity in entityMetadata %}
## {{ entity.entityName }}
**Schema.View**: `[{{ entity.schemaName }}].[{{ entity.baseView }}]`
{% if entity.description %}- **Description**: {{ entity.description | safe }}{% endif %}

**Available Fields**:
{% for field in entity.fields %}
- `{{ field.name }}` ({{ field.sqlFullType }}){% if field.description %} - {{ field.description | safe }}{% endif %}{% if field.isPrimaryKey %} [PRIMARY KEY]{% endif %}{% if field.isForeignKey %} [FK to {{ field.relatedEntity }}]{% endif %}{% if field.isVirtual %} [VIRTUAL - computed field]{% endif %}{% if field.allowsNull %} [NULLABLE]{% else %} [NOT NULL]{% endif %}{% if field.defaultValue %} [DEFAULT: {{ field.defaultValue }}]{% endif %}{% if field.possibleValues %} [VALUES: {{ field.possibleValues | join(', ') }}]{% endif %}
{% endfor %}

{% if entity.relationships.length > 0 %}
**Join Information**:
{% for rel in entity.relationships %}
- To `{{ rel.relatedEntity }}`: `{{ rel.description | safe }}`
{% endfor %}
{% endif %}

---
{% endfor %}
