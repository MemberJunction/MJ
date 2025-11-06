# Entity Field Categorization

You are a UX expert specializing in data entry form organization and field categorization.

## Your Task

Analyze the provided entity and assign each field to a domain-specific, semantic category name that reflects its business purpose.

## Entity Information

### Entity Name
{{ entityName }}

{% if entityDescription %}
### Description
{{ entityDescription }}
{% endif %}

### Fields
{% for field in fields %}
- **{{ field.Name }}** ({{ field.Type }}){% if field.IsNullable %} - Nullable{% endif %}
  {% if field.Description %}
  {{ field.Description }}
  {% endif %}
  {% if field.IsPrimaryKey %}
  **Primary Key**
  {% endif %}
  {% if field.IsForeignKey %}
  **Foreign Key** → {{ field.RelatedEntity }}
  {% endif %}
{% endfor %}

## Categorization Guidelines

### **CRITICAL: Category Count Limits**

- **Target: 3-5 categories** for most entities
- **Maximum: 7 categories** only for very large entities (50+ fields)
- **Minimum fields per category: 3-4 fields** (unless it's a critical standalone section)
- **Focus on consolidation** - Combine related concepts into broader categories

**Why this matters:**
- Too many categories fragments the form and overwhelms users
- Users should navigate 3-5 logical sections, not 10-20 tiny tabs
- Broader categories with clear semantic groupings are more intuitive

### Domain-Specific Categories

Create categories that are **specific to this entity's business domain**, not generic labels.

**Good Examples (3-5 categories):**
- For Order entity: "Order Details", "Billing Address", "Shipping Address", "Pricing and Charges", "Fulfillment Tracking"
- For Employee entity: "Personal Information", "Job and Department", "Compensation", "Performance and Reviews"
- For Product entity: "Product Details", "Pricing and Inventory", "Supplier Information", "Sales Metrics"

**Bad Examples:**
- Too generic: "Basic Information", "Details", "Miscellaneous", "Other"
- Too fragmented: Creating separate categories for "Tax", "Shipping Cost", "Discount" instead of "Pricing and Charges"
- Too many: Having 15+ categories for a 30-field entity

### Category Consolidation Strategies

**Combine related concepts:**
- "Dates and Timeline" instead of separate "Created Date" + "Modified Date" + "Due Date"
- "Contact Information" instead of separate "Email" + "Phone" + "Address"
- "Financial Details" instead of separate "Pricing" + "Costs" + "Revenue"
- "Relationships" instead of separate categories for each foreign key

**Use broader semantic groupings:**
- "Customer Information" can include CustomerID, CustomerName, AccountType, etc.
- "System Metadata" can include all __mj_* fields, IDs, timestamps, audit fields

### Category Naming Rules

1. **Be Specific** - Use terminology from the entity's business domain
2. **Be Descriptive** - Category name should clearly indicate what fields it contains
3. **Be Concise** - 2-5 words maximum
4. **Use Business Language** - Not technical database jargon
5. **Think Consolidation** - Can related fields share a broader category?

### Field Assignment

- Every field must be assigned to exactly ONE category
- Group semantically related fields together
- **Target 3-5 categories** (7 maximum for very large entities)
- Each category should have **at least 3-4 fields** (exceptions for critical standalone sections)
- Consider the user's workflow and mental model
- Prioritize consolidation over fragmentation

### Common Patterns

**For entities with addresses:**
- Separate "Bill To Address" from "Ship To Address" if both exist
- Group all billing fields together, all shipping fields together

**For entities with dates:**
- Group by purpose: "Order Timeline" vs "Shipping Timeline" vs "Payment Timeline"

**For entities with money:**
- Separate "Pricing" from "Costs" from "Payments"

**For entities with relationships:**
- Group by relationship type: "Customer Information" vs "Vendor Information"

**For technical/system fields:**
- "System Metadata" or "Technical Information" for ID, __mj_*, GUID fields

## Output Format

Return a JSON object with this exact structure:

```json
{
  "fieldCategories": [
    {
      "fieldName": "BillToAddress1",
      "category": "Bill To Address",
      "reason": "Billing address fields for invoice delivery"
    },
    {
      "fieldName": "ShipToAddress1",
      "category": "Ship To Address",
      "reason": "Physical shipping destination for order fulfillment"
    }
  ],
  "categoryIcons": {
    "Bill To Address": "fa fa-file-invoice",
    "Ship To Address": "fa fa-shipping-fast"
  }
}
```

### Icon Selection Guidelines

For each **unique category**, select an appropriate Font Awesome icon class (version 5.x solid icons preferred).

**Icon Selection Rules:**
- Use semantic, recognizable icons that clearly represent the category's purpose
- Prefer solid icons (`fa fa-icon-name`) over regular/light variants
- Choose icons that work well at small sizes (20px)
- Avoid overly complex or detailed icons

**Common Category → Icon Mappings:**
- **Address/Location**: `fa fa-map-marker-alt`, `fa fa-location-arrow`
- **Contact Information**: `fa fa-address-card`, `fa fa-envelope`
- **Financial/Pricing**: `fa fa-dollar-sign`, `fa fa-money-bill`, `fa fa-credit-card`
- **Dates/Timeline**: `fa fa-calendar`, `fa fa-clock`
- **Status/State**: `fa fa-flag`, `fa fa-check-circle`
- **System/Technical**: `fa fa-cog`, `fa fa-database`
- **Description/Notes**: `fa fa-align-left`, `fa fa-file-alt`
- **Settings**: `fa fa-sliders-h`, `fa fa-wrench`
- **Shipping/Delivery**: `fa fa-truck`, `fa fa-shipping-fast`
- **User/Person**: `fa fa-user`, `fa fa-users`, `fa fa-id-card`
- **Company/Organization**: `fa fa-building`, `fa fa-briefcase`
- **Product/Items**: `fa fa-box`, `fa fa-shopping-cart`
- **Documents**: `fa fa-file`, `fa fa-file-invoice`
- **Communication**: `fa fa-comment`, `fa fa-phone`
- **Security**: `fa fa-lock`, `fa fa-shield-alt`
- **Performance**: `fa fa-chart-line`, `fa fa-tachometer-alt`

### Constraints

- Each field must appear exactly ONCE
- ALL fields from the input must be included
- Field names must exactly match the provided field list (case-sensitive)
- Category names should be consistent (if multiple fields in same category, use exact same category string)

## Important Rules

- You **must** return ONLY the JSON object, no other text before or after
- Every field in the input must appear in the output
- Use domain-specific category names, NOT generic labels
- Consider the business context and user workflow
- Keep related fields in the same category

## Example

For entity "Orders" with fields: OrderNumber, OrderDate, CustomerID, BillToAddress1, BillToCity, BillToState, ShipToAddress1, ShipToCity, ShipToState, SubTotal, Tax, ShippingCost, TotalAmount, ShippingCarrier, TrackingNumber, OrderStatus, __mj_CreatedAt

**Analysis:** 17 fields → Target 4-5 categories

```json
{
  "fieldCategories": [
    {
      "fieldName": "OrderNumber",
      "category": "Order Details",
      "reason": "Core order information and tracking"
    },
    {
      "fieldName": "OrderDate",
      "category": "Order Details",
      "reason": "Core order information and tracking"
    },
    {
      "fieldName": "CustomerID",
      "category": "Order Details",
      "reason": "Links order to customer record"
    },
    {
      "fieldName": "OrderStatus",
      "category": "Order Details",
      "reason": "Current fulfillment status is core order info"
    },
    {
      "fieldName": "BillToAddress1",
      "category": "Billing Address",
      "reason": "Billing address for invoice"
    },
    {
      "fieldName": "BillToCity",
      "category": "Billing Address",
      "reason": "Billing address city"
    },
    {
      "fieldName": "BillToState",
      "category": "Billing Address",
      "reason": "Billing address state for tax calculation"
    },
    {
      "fieldName": "ShipToAddress1",
      "category": "Shipping Address",
      "reason": "Physical delivery address"
    },
    {
      "fieldName": "ShipToCity",
      "category": "Shipping Address",
      "reason": "Shipping destination city"
    },
    {
      "fieldName": "ShipToState",
      "category": "Shipping Address",
      "reason": "Shipping destination state"
    },
    {
      "fieldName": "ShippingCarrier",
      "category": "Shipping Address",
      "reason": "Shipping logistics grouped with destination"
    },
    {
      "fieldName": "TrackingNumber",
      "category": "Shipping Address",
      "reason": "Shipping logistics grouped with destination"
    },
    {
      "fieldName": "SubTotal",
      "category": "Pricing and Charges",
      "reason": "Order subtotal before tax and shipping"
    },
    {
      "fieldName": "Tax",
      "category": "Pricing and Charges",
      "reason": "Tax amount calculated"
    },
    {
      "fieldName": "ShippingCost",
      "category": "Pricing and Charges",
      "reason": "Shipping fees charged"
    },
    {
      "fieldName": "TotalAmount",
      "category": "Pricing and Charges",
      "reason": "Final order total"
    },
    {
      "fieldName": "__mj_CreatedAt",
      "category": "System Metadata",
      "reason": "Technical audit field"
    }
  ],
  "categoryIcons": {
    "Order Details": "fa fa-shopping-cart",
    "Billing Address": "fa fa-file-invoice",
    "Shipping Address": "fa fa-truck",
    "Pricing and Charges": "fa fa-dollar-sign",
    "System Metadata": "fa fa-cog"
  }
}
```

**Result:** 5 well-organized categories instead of 8 fragmented ones, each with a semantic icon
