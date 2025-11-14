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

{% if hasExistingCategories %}

---

## 🔒 CRITICAL: Existing Category Preservation

**This entity ALREADY has categorized fields. You MUST preserve the existing categorization scheme.**

### Existing Categories and Their Fields

{% for category in existingCategories %}
**{{ category }}** ({{ fieldsByCategory[category].length }} fields)
{% for fieldName in fieldsByCategory[category] %}
  - {{ fieldName }}
{% endfor %}

{% endfor %}

### MANDATORY Rules for Incremental Categorization

1. **PRESERVE existing category names exactly** - Do not rename or merge existing categories
2. **REUSE existing categories** - New fields AND re-categorizable fields should fit into existing categories
3. **Maximum 1-2 new categories allowed** - Only create new categories if fields don't fit semantically into existing ones
4. **Maintain consistency** - Use the same semantic grouping logic as the existing categories
5. **Only update allowed fields** - Fields with `AutoUpdateCategory=false` are locked (shown for context, do not include in output)

### Field Status Legend
{% for field in fields %}
{% if field.HasExistingCategory %}
- 🔒 **{{ field.Name }}** - Currently in "{{ field.ExistingCategory }}" (LOCKED - do not include in output)
{% else %}
- 🔄 **{{ field.Name }}** - {% if field.ExistingCategory %}Currently in "{{ field.ExistingCategory }}", {% endif %}NEEDS categorization (can be reassigned)
{% endif %}
{% endfor %}

**Your task for field categorization:**
- Categorize fields marked with 🔄 (these may be new OR existing fields that allow recategorization)
- DO NOT include fields marked with 🔒 in your output
- REUSE the existing categories listed above whenever possible

---

{% endif %}

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
- **"System Metadata"** - ALWAYS use this category for __mj_CreatedAt, __mj_UpdatedAt, and similar system/audit fields. This category will be displayed at the very bottom of forms (even after related entity sections) as it's the least important for normal usage.

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

### Field Metadata Analysis

For each field, you must also determine:

**1. Display Name** - User-friendly label for the field
- Remove technical suffixes (ID, FK, etc.) - e.g., "OrganizationID" → "Organization"
- Use proper spacing and capitalization - e.g., "FirstName" → "First Name"
- Keep abbreviations if commonly understood - e.g., "URL", "ID" when standalone
- For Address fields, include line numbers - e.g., "Address1" → "Address Line 1"
- Examples:
  - "EmailAddress" → "Email Address"
  - "CustomerID" → "Customer"
  - "BillToAddress1" → "Billing Address Line 1"
  - "__mj_CreatedAt" → "Created At"

**2. Extended Type** - Specifies special UI treatment for the field
- Valid values: `'Code'`, `'Email'`, `'FaceTime'`, `'Geo'`, `'MSTeams'`, `'SIP'`, `'SMS'`, `'Skype'`, `'Tel'`, `'URL'`, `'WhatsApp'`, `'ZoomMtg'`, or `null`
- Use `'Email'` for email address fields - creates clickable mailto: links
- Use `'URL'` for web address fields - creates clickable hyperlinks
- Use `'Tel'` for phone number fields - creates clickable tel: links
- Use `'Code'` for code/script fields (requires CodeType to be set)
- Use `null` for regular text/data fields
- Examples:
  - "EmailAddress", "Email", "ContactEmail" → `'Email'`
  - "Website", "URL", "HomepageURL" → `'URL'`
  - "Phone", "PhoneNumber", "Mobile" → `'Tel'`
  - "SkypeID" → `'Skype'`
  - "JavaScript", "SQLStatement", "CSSCode" → `'Code'`

**3. Code Type** - For fields with ExtendedType='Code', specifies the programming language
- Valid values: `'CSS'`, `'HTML'`, `'JavaScript'`, `'SQL'`, `'TypeScript'`, `'Other'`, or `null`
- **Only set when ExtendedType='Code'**
- Infer from field name and context:
  - "SQL", "Query", "SQLStatement" → `'SQL'`
  - "JavaScript", "Script", "JSCode" → `'JavaScript'`
  - "TypeScript", "TSCode" → `'TypeScript'`
  - "HTML", "HTMLContent" → `'HTML'`
  - "CSS", "Styles" → `'CSS'`
  - Unknown code type → `'Other'`
- Set to `null` for all non-code fields

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
  "entityIcon": "fa fa-shopping-cart",
  "fieldCategories": [
    {
      "fieldName": "BillToAddress1",
      "category": "Bill To Address",
      "reason": "Billing address fields for invoice delivery",
      "displayName": "Billing Address Line 1",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "ShipToAddress1",
      "category": "Ship To Address",
      "reason": "Physical shipping destination for order fulfillment",
      "displayName": "Shipping Address Line 1",
      "extendedType": null,
      "codeType": null
    }
  ],
  "categoryIcons": {
    "Bill To Address": "fa fa-file-invoice",
    "Ship To Address": "fa fa-shipping-fast"
  },
  "entityImportance": {
    "defaultForNewUser": true,
    "entityCategory": "primary",
    "confidence": "high",
    "reasoning": "Order is a core business entity with rich domain fields across billing, shipping, and pricing. Users interact with orders daily.",
    "recommendedSequence": 2
  }
}
```

### Entity Importance Fields

- **defaultForNewUser**: boolean - Should new users see this in navigation?
- **entityCategory**: One of: "primary" | "supporting" | "reference" | "junction" | "system"
- **confidence**: "high" | "medium" | "low" - How confident is the classification?
- **reasoning**: string - 1-2 sentences explaining the decision (reference your field analysis)
- **recommendedSequence**: number (optional) - Suggested sort order (1=first, higher=later)

### Icon Selection Guidelines

**Entity Icon:**
Select ONE icon that best represents the entire entity's business purpose and domain. This icon will be used throughout the application to represent this entity type.

**Category Icons:**
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

---

## Entity Importance Analysis

In addition to categorizing fields, you must also analyze whether this entity should be **visible to new users by default** in the application.

### Entity Metadata

- **Schema Name**: {{ schemaName }}
- **Virtual Entity**: {{ virtualEntity }}
- **Track Record Changes**: {{ trackRecordChanges }}
- **Audit Record Access**: {{ auditRecordAccess }}
- **User Form Generated**: {{ userFormGenerated }}

### Entity Categories

Classify this entity into ONE of these categories:

1. **primary** - Core business entities that users interact with daily
   - Examples: Customer, Order, Product, Invoice, Contact, Deal, Task
   - Rich data model (10+ non-FK fields), central to business workflows
   - **DefaultForNewUser: true**

2. **supporting** - Important but secondary entities
   - Examples: OrderItem, Address, PaymentMethod, Note, Attachment
   - Support primary entities, less frequently accessed directly
   - **DefaultForNewUser: true** (if user-facing) or **false** (if internal)

3. **reference** - Lookup/type tables with static data
   - Examples: Country, State, ProductCategory, OrderStatus, Priority
   - Small tables, rarely modified, used in dropdowns
   - **DefaultForNewUser: false**

4. **junction** - Many-to-many relationship tables
   - Examples: UserRole, ProductCategory, OrderTag
   - Only contains foreign keys + maybe sequence/date fields
   - **DefaultForNewUser: false**

5. **system** - Technical/audit/metadata tables
   - Examples: AuditLog, RecordChange, EntityField, ApplicationEntity
   - System-managed, technical metadata, audit trails
   - **DefaultForNewUser: false**

### Decision Guidelines

**Visible to new users (true):**
- Primary business entities (rich domain model)
- Supporting entities users work with directly
- Forms/screens users need for daily work

**Hidden from new users (false):**
- Junction tables (many-to-many joins)
- Reference/lookup tables (managed by admins)
- System/audit tables (technical only)
- Entities in __mj, sys, log schemas (>80% should be hidden)
- Entities where >70% of fields are foreign keys

### Analysis Factors

Consider:
- **Field composition**: How many non-FK, meaningful business fields?
- **Category distribution**: Are most fields in "System Metadata" or business categories?
- **Schema name**: Is this in __mj, sys, or a business schema?
- **Relationships**: Is this a join table or a primary entity?
- **User workflow**: Would end users need direct access to this entity?

---

### Constraints

- Each field must appear exactly ONCE
- ALL fields from the input must be included
- Field names must exactly match the provided field list (case-sensitive)
- Category names should be consistent (if multiple fields in same category, use exact same category string)
- **Every field must have**: `displayName`, `extendedType`, and `codeType` properties
- `extendedType` and `codeType` must be valid enum values or `null` - do not use empty strings

## Important Rules

- You **must** return ONLY the JSON object, no other text before or after
- Every field in the input must appear in the output
- Use domain-specific category names, NOT generic labels
- Consider the business context and user workflow
- Keep related fields in the same category

## Complete Examples

### Example 1: Primary Business Entity

For entity "Orders" with fields: OrderNumber, OrderDate, CustomerID, BillToAddress1, BillToCity, BillToState, ShipToAddress1, ShipToCity, ShipToState, SubTotal, Tax, ShippingCost, TotalAmount, ShippingCarrier, TrackingNumber, OrderStatus, __mj_CreatedAt

**Analysis:** 17 fields → Target 4-5 categories

```json
{
  "entityIcon": "fa fa-shopping-cart",
  "fieldCategories": [
    {
      "fieldName": "OrderNumber",
      "category": "Order Details",
      "reason": "Core order information and tracking",
      "displayName": "Order Number",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "OrderDate",
      "category": "Order Details",
      "reason": "Core order information and tracking",
      "displayName": "Order Date",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "CustomerID",
      "category": "Order Details",
      "reason": "Links order to customer record",
      "displayName": "Customer",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "OrderStatus",
      "category": "Order Details",
      "reason": "Current fulfillment status is core order info",
      "displayName": "Order Status",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "BillToAddress1",
      "category": "Billing Address",
      "reason": "Billing address for invoice",
      "displayName": "Billing Address Line 1",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "BillToCity",
      "category": "Billing Address",
      "reason": "Billing address city",
      "displayName": "Billing City",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "BillToState",
      "category": "Billing Address",
      "reason": "Billing address state for tax calculation",
      "displayName": "Billing State",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "ShipToAddress1",
      "category": "Shipping Address",
      "reason": "Physical delivery address",
      "displayName": "Shipping Address Line 1",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "ShipToCity",
      "category": "Shipping Address",
      "reason": "Shipping destination city",
      "displayName": "Shipping City",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "ShipToState",
      "category": "Shipping Address",
      "reason": "Shipping destination state",
      "displayName": "Shipping State",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "ShippingCarrier",
      "category": "Shipping Address",
      "reason": "Shipping logistics grouped with destination",
      "displayName": "Shipping Carrier",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "TrackingNumber",
      "category": "Shipping Address",
      "reason": "Shipping logistics grouped with destination",
      "displayName": "Tracking Number",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "SubTotal",
      "category": "Pricing and Charges",
      "reason": "Order subtotal before tax and shipping",
      "displayName": "Subtotal",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "Tax",
      "category": "Pricing and Charges",
      "reason": "Tax amount calculated",
      "displayName": "Tax",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "ShippingCost",
      "category": "Pricing and Charges",
      "reason": "Shipping fees charged",
      "displayName": "Shipping Cost",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "TotalAmount",
      "category": "Pricing and Charges",
      "reason": "Final order total",
      "displayName": "Total Amount",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "__mj_CreatedAt",
      "category": "System Metadata",
      "reason": "Technical audit field",
      "displayName": "Created At",
      "extendedType": null,
      "codeType": null
    }
  ],
  "categoryIcons": {
    "Order Details": "fa fa-shopping-cart",
    "Billing Address": "fa fa-file-invoice",
    "Shipping Address": "fa fa-truck",
    "Pricing and Charges": "fa fa-dollar-sign",
    "System Metadata": "fa fa-cog"
  },
  "entityImportance": {
    "defaultForNewUser": true,
    "entityCategory": "primary",
    "confidence": "high",
    "reasoning": "Order is a primary business entity with 17 fields organized into 5 semantic categories (Order Details, Billing Address, Shipping Address, Pricing, System). Most fields are business-domain focused rather than technical. This is clearly a user-facing entity central to e-commerce workflows.",
    "recommendedSequence": 2
  }
}
```

**Result:** 5 well-organized categories instead of 8 fragmented ones, each with a semantic icon. Marked as primary entity visible to new users.

### Example 2: Junction Table (Should Be Hidden)

For entity "UserRoles" with fields: ID, UserID, RoleID, __mj_CreatedAt, __mj_UpdatedAt

**Analysis:** 5 fields, 2 are FKs (40%), mostly system fields → Junction table

```json
{
  "entityIcon": "fa fa-users-cog",
  "fieldCategories": [
    {
      "fieldName": "ID",
      "category": "System Metadata",
      "reason": "Primary key identifier",
      "displayName": "ID",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "UserID",
      "category": "Relationships",
      "reason": "Foreign key to User entity",
      "displayName": "User",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "RoleID",
      "category": "Relationships",
      "reason": "Foreign key to Role entity",
      "displayName": "Role",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "__mj_CreatedAt",
      "category": "System Metadata",
      "reason": "Audit timestamp",
      "displayName": "Created At",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "__mj_UpdatedAt",
      "category": "System Metadata",
      "reason": "Audit timestamp",
      "displayName": "Updated At",
      "extendedType": null,
      "codeType": null
    }
  ],
  "categoryIcons": {
    "Relationships": "fa fa-link",
    "System Metadata": "fa fa-cog"
  },
  "entityImportance": {
    "defaultForNewUser": false,
    "entityCategory": "junction",
    "confidence": "high",
    "reasoning": "UserRoles is a many-to-many junction table with only 2 foreign keys (40% of fields excluding system fields). The field categorization revealed mostly 'Relationships' and 'System Metadata' with no business domain fields. Users manage this via User/Role forms, not directly.",
    "recommendedSequence": null
  }
}
```

**Result:** Simple 2-category structure appropriate for junction table. Correctly marked as hidden from new users.
