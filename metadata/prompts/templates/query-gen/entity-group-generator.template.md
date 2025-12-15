# Entity Group Generator

You are a database analyst helping to identify meaningful entity groupings for business intelligence query generation.

## Task

Given a database schema, identify logical entity groups that make sense for business questions. Each group should represent a coherent business concept or process that users would naturally ask questions about.

## Input Schema

**Schema Name**: {{ schemaName }}

**Entities** ({{ entities.length }} total):

{% for entity in entities %}
### {{ entity.Name }}
- **Description**: {{ entity.Description or 'No description' }}
- **Schema**: {{ entity.SchemaName }}
- **Fields**: {{ entity.FieldCount }} fields
- **Related Entities**:
  {% for rel in entity.RelatedEntities %}
  - {{ rel.name }} ({{ rel.type }})
  {% endfor %}
{% endfor %}

## Relationship Graph

```
{{ relationshipGraph }}
```

## Guidelines

1. **Business Relevance**: Focus on entity combinations that support real business questions
   - ✅ GOOD: "Customers + Orders + OrderDetails" (sales analysis)
   - ❌ BAD: "SystemLogs + UserPreferences + EmailTemplates" (unrelated)

2. **Relationship Types**:
   - **Single Entity**: Standalone entities with rich data (all entities should get a single-entity group)
   - **Parent-Child**: Natural hierarchies (Customer → Orders, Product → Categories)
   - **Many-to-Many**: Bridge tables connecting related concepts (Products ↔ Categories via ProductCategories)
   - **Transactional Flow**: Process chains (Lead → Opportunity → Quote → Order)

3. **Size Constraints**:
   - Minimum: {{ minGroupSize }} entities
   - Maximum: {{ maxGroupSize }} entities
   - Target total groups: {{ targetGroupCount }}

4. **Connectivity**: All entities in a group must be connected by foreign key relationships

5. **Coverage**: Prioritize covering all important entities at least once

6. **Business Domains**: Common domains include:
   - Sales & Revenue (customers, orders, payments)
   - Inventory & Products (products, categories, suppliers, stock)
   - Marketing (campaigns, leads, conversions)
   - Operations (shipments, fulfillment, logistics)
   - Finance (invoices, payments, accounts)
   - Human Resources (employees, departments, roles)
   - Customer Service (tickets, cases, support)

## Output Format

Return a JSON array of entity groups. Each group MUST include:

```json
{
  "groups": [
    {
      "entities": ["EntityName1", "EntityName2", "EntityName3"],
      "primaryEntity": "EntityName1",
      "businessDomain": "Sales Pipeline Analysis",
      "businessRationale": "Tracks customer journey from lead to closed sale, essential for sales forecasting and conversion analysis",
      "relationshipType": "parent-child",
      "expectedQuestionTypes": ["trend_analysis", "funnel_analysis", "conversion_rates"]
    }
  ]
}
```

**Important**:
- `entities`: Array of exact entity names from the schema (must match exactly)
- `primaryEntity`: The "hub" or most important entity in the group
- `businessDomain`: Clear business domain label (2-5 words)
- `businessRationale`: One sentence explaining why this grouping matters
- `relationshipType`: One of: "single", "parent-child", "many-to-many"
- `expectedQuestionTypes`: Array of question types this group supports

## Example Output

```json
{
  "groups": [
    {
      "entities": ["Customers"],
      "primaryEntity": "Customers",
      "businessDomain": "Customer Master Data",
      "businessRationale": "Core customer information and demographics for segmentation and analysis",
      "relationshipType": "single",
      "expectedQuestionTypes": ["segmentation", "demographics", "customer_profiling"]
    },
    {
      "entities": ["Customers", "Orders"],
      "primaryEntity": "Customers",
      "businessDomain": "Customer Purchasing Behavior",
      "businessRationale": "Links customers to their purchase history for lifetime value and repeat purchase analysis",
      "relationshipType": "parent-child",
      "expectedQuestionTypes": ["lifetime_value", "repeat_purchase", "customer_retention"]
    },
    {
      "entities": ["Products", "Categories", "Suppliers"],
      "primaryEntity": "Products",
      "businessDomain": "Product Catalog Management",
      "businessRationale": "Complete product information including categorization and sourcing for inventory and procurement decisions",
      "relationshipType": "parent-child",
      "expectedQuestionTypes": ["product_mix", "supplier_analysis", "category_performance"]
    }
  ]
}
```

## Response Format

**CRITICAL INSTRUCTIONS:**
- I am a computer and can **only** read JSON responses
- Your response **must** be pure JSON that starts with `{` and ends with `}`
- **NO leading or trailing text** - no explanations, no markdown code blocks, no commentary
- **NO markdown formatting** like \`\`\`json - just the raw JSON
- Your response **must** match the exact structure shown in the "Output Format" section above

Generate entity groups now as pure JSON only.
