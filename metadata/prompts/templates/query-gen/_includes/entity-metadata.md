# Available Entities
The following entities are available for your query. Key rules:
- Always prefix view names with schema names as shown: `[SchemaName].[ViewName]`
- Use {{ _SQL_DIALECT_NAME }} syntax, exactly as described in the Target SQL Dialect section
- The `[Schema].[View]` shown below is a DISPLAY convention; quote identifiers in your SQL using the platform's own quoting form
- Query from base views (vw*), not base tables
- **CRITICAL**: Only use entities and fields explicitly listed below - DO NOT infer or guess schema
- **VIRTUAL fields** are computed/lookup fields available in the view - use these instead of JOINs when possible

{% for entity in entityMetadata %}
## {{ entity.entityName }}
**Schema.View**: `[{{ entity.schemaName }}].[{{ entity.baseView }}]`
{% if entity.description %}- **Description**: {{ entity.description | safe }}{% endif %}
{% if entity.alternateBaseViews and entity.alternateBaseViews.length > 0 %}
**Alternate Base Views** (canonical row subsets with the same columns as `[{{ entity.schemaName }}].[{{ entity.baseView }}]` — prefer these when the question targets that subset):
{% for abv in entity.alternateBaseViews %}
- `{{ abv.name }}` (`[{{ abv.schemaName }}].[{{ abv.viewName }}]`){% if abv.displayName and abv.displayName != abv.name %} — *{{ abv.displayName }}*{% endif %}{% if abv.parentName %} (derived from `{{ abv.parentName }}`){% endif %}{% if abv.description %}: {{ abv.description | safe }}{% endif %}
{% endfor %}
{% endif %}

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
