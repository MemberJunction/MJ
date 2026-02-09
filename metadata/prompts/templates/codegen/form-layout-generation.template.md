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

### Schema
{{ schemaName }}

### Field Statistics

- **Total Fields**: {{ totalFields }}
- **Foreign Key Fields**: {{ fkCount }}
- **Non-FK Business Fields**: {{ nonFkCount }}
- **FK Ratio**: {{ fkRatio }}% of fields are foreign keys

**How to interpret FK statistics for Entity Importance:**
- **Primary entities** (examples: Contact, Account, Order, Deal): Have multiple FKs (3-10+) but MANY MORE non-FK business fields. FK ratio typically 10-30%.
- **Junction/join tables** (examples: ContactAccount, UserRole): Narrow tables with 2-4 FKs and almost NO non-FK business fields. FK ratio typically 40-80%.
- **Reference/type tables** (examples: AccountType, OrderStatus): Usually 0-1 FKs with a few descriptive fields like Name, Description. FK ratio typically 0-20%.

{% if isChildEntity %}
### IS-A Entity Inheritance

This entity uses **IS-A (table-per-type) inheritance**. It inherits fields from parent entities in the following chain:

**{{ entityName }}** inherits from:
{% for parent in parentChain %}
{{ loop.index }}. **{{ parent.entityName }}**
{% endfor %}

Fields marked with `[Inherited from ...]` below come from a parent entity in this chain. See the **Inherited Field Handling Rules** section below for how to categorize them.

{% endif %}
### Fields
{% for field in fields %}
- **{{ field.Name }}** ({{ field.Type }}){% if field.IsNullable %} - Nullable{% endif %}{% if field.InheritedFromEntityName %} **[Inherited from {{ field.InheritedFromEntityName }}]**{% endif %}
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

## 🔒 CRITICAL: Existing Category and Icon Preservation

**This entity ALREADY has categorized fields. You MUST preserve the existing categorization scheme.**

### Existing Categories and Their Fields

{% for category in existingCategories %}
**{{ category }}**{% if existingCategoryInfo[category].icon %} (icon: {{ existingCategoryInfo[category].icon }}){% endif %} - {{ fieldsByCategory[category].length }} fields
{% for fieldName in fieldsByCategory[category] %}
  - {{ fieldName }}
{% endfor %}

{% endfor %}

### MANDATORY Rules for Incremental Updates

**Category Names:**
1. **NEVER rename existing categories** - Use the exact names shown above
2. **NEVER merge existing categories** - Keep them separate
3. **REUSE existing categories** - New fields should fit into existing categories when semantically appropriate
4. **Maximum 1-2 new categories** - Only create new categories if fields truly don't fit existing ones

**Category Icons:**
5. **DO NOT output icons for existing categories** - They are already set and must be preserved
6. **ONLY output icons for NEW categories** you create (if any)

**Field Movement:**
7. **Avoid moving existing fields** - Only move a field to a different category if it was clearly miscategorized
8. **Fields with `AutoUpdateCategory=false` are LOCKED** - Do not include them in your output

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

{% if isChildEntity %}
### **CRITICAL: Inherited Field Handling (IS-A Inheritance)**

This entity inherits fields from parent entities. You **MUST** handle inherited fields differently from the entity's own fields:

1. **Create ONE category per parent entity** for its inherited fields. Name it using the parent entity's business domain (e.g., "Product Details" for fields inherited from Products, "Meeting Details" for fields inherited from Meetings).
2. **Never mix inherited and own fields** in the same category. Inherited fields from the same parent go together; the child entity's own fields get their own separate categories.
3. **Include `inheritedFromEntityName`** in the `categoryInfo` entry for each inherited category. This is the parent entity name exactly as shown in the inheritance chain above.
4. **`__mj_` system fields** always go in "System Metadata" regardless of origin — do NOT put them in inherited categories.
5. **Category count limits still apply** to the child's own fields. Inherited categories are additional (one per parent entity in the chain) and do not count toward the 3-5 target.
6. **Order**: Place the child entity's own categories FIRST, then inherited categories (nearest parent first, then grandparent, etc.), then "System Metadata" last.

**Example**: For entity "Webinars" (inherits from Meetings, which inherits from Products):
- Own categories: "Webinar Details" (StartURL, MaxViewers, etc.)
- Inherited category: "Meeting Details" (StartTime, EndTime, Location) with `inheritedFromEntityName: "Meetings"`
- Inherited category: "Product Details" (Name, Price, SKU) with `inheritedFromEntityName: "Products"`
- System: "System Metadata" (__mj_CreatedAt, __mj_UpdatedAt)

{% endif %}
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
    }
  ],
  "categoryInfo": {
    "Bill To Address": {
      "icon": "fa fa-file-invoice",
      "description": "Address for invoice delivery and billing correspondence"
    }
  },
  "entityImportance": {
    "defaultForNewUser": true,
    "entityCategory": "primary",
    "confidence": "high",
    "reasoning": "Order is a core business entity with rich domain fields across billing, shipping, and pricing. Users interact with orders daily."
  }
}
```

### Category Info Structure

For each **NEW category only** (not existing ones), provide:
- **icon**: Font Awesome icon class (e.g., "fa fa-file-invoice")
- **description**: 1 sentence describing what fields belong in this category (for UX tooltips)
{% if isChildEntity %}
- **inheritedFromEntityName**: (REQUIRED for inherited categories) The exact parent entity name this category's fields come from. Omit this property for the child entity's own categories.

**Example for inherited category:**
```json
"Product Details": {
  "icon": "fa fa-box",
  "description": "Fields inherited from the Products entity",
  "inheritedFromEntityName": "Products"
}
```
{% endif %}

{% if hasExistingCategories %}
**IMPORTANT**: Do NOT include existing categories in `categoryInfo`. Only include categories you are creating for the first time.
{% endif %}

### Entity Importance Fields

- **defaultForNewUser**: boolean - Should new users see this in navigation?
- **entityCategory**: One of: "primary" | "supporting" | "reference" | "junction" | "system"
- **confidence**: "high" | "medium" | "low" - How confident is the classification?
- **reasoning**: string - 1-2 sentences explaining the decision (reference field statistics)

{% if isExistingEntity %}
**NOTE**: This is an EXISTING entity being modified. The `entityImportance` section will be IGNORED - we only set DefaultForNewUser when an entity is first created. You may omit this section or provide minimal values.
{% endif %}

### Icon Selection Guidelines

**Entity Icon:**
Select ONE icon that best represents the entire entity's business purpose and domain. This icon will be used throughout the application to represent this entity type.

**Category Icons (for NEW categories only):**
For each **new category**, select an appropriate Font Awesome icon class (version 5.x solid icons preferred).

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

### Understanding Entity Types by Field Composition

Use the field statistics provided above to classify the entity:

**1. Primary Entities** (DefaultForNewUser: **true**)
- Core business objects users interact with daily
- Examples: Contact, Account, Order, Deal, Task, Project, Invoice
- **Characteristics**:
  - Have multiple FKs (references to other entities) BUT many more non-FK business fields
  - FK ratio typically **10-30%**
  - Rich data model with 10+ meaningful business fields
  - Fields span multiple semantic categories (not just "Relationships" and "System Metadata")

**2. Supporting Entities** (DefaultForNewUser: **true** if user-facing, **false** if internal)
- Important but secondary entities that support primary entities
- Examples: OrderItem, Address, PaymentMethod, Note, Attachment
- **Characteristics**:
  - Moderate FK count (2-5) with some business fields
  - FK ratio typically **20-40%**
  - Usually accessed via a parent entity rather than directly

**3. Reference/Type Tables** (DefaultForNewUser: **false**)
- Lookup tables with static/admin-managed data
- Examples: AccountType, ContactType, OrderStatus, Priority, Country
- **Characteristics**:
  - Very few FKs (0-1 typically)
  - FK ratio typically **0-20%**
  - Small number of fields (3-8), mainly Name, Description, Code
  - Names often end in "Type", "Status", "Category", "Priority"
  - Used to populate dropdowns, rarely edited by end users

**4. Junction/Join Tables** (DefaultForNewUser: **false**)
- Many-to-many relationship tables
- Examples: ContactAccount, UserRole, ProductCategory, OrderTag
- **Characteristics**:
  - **Narrow tables**: Usually only 4-6 total fields
  - **High FK ratio**: 40-80% of non-system fields are FKs
  - Typically 2-3 FKs + primary key + system timestamps
  - Almost NO business data fields beyond the FKs
  - Names often combine two entity names or end in "Link"

**5. System/Metadata Tables** (DefaultForNewUser: **false**)
- Technical, audit, or framework tables
- Examples: AuditLog, RecordChange, EntityField, ApplicationEntity
- **Characteristics**:
  - Schema is usually `__mj`, `sys`, or similar system schema
  - Technical metadata, audit trails, system configuration
  - Not relevant to business users

### Quick Decision Matrix

| FK Count | Non-FK Count | FK Ratio | Likely Type | DefaultForNewUser |
|----------|--------------|----------|-------------|-------------------|
| 3-10+ | 10-30+ | 10-30% | Primary | **true** |
| 2-5 | 5-15 | 20-40% | Supporting | true/false |
| 0-1 | 3-8 | 0-20% | Reference | **false** |
| 2-3 | 0-2 | 40-80% | Junction | **false** |
| varies | varies | varies | System (by schema) | **false** |

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
{% if hasExistingCategories %}
- **DO NOT** include icons for existing categories in `categoryInfo` - only new categories
- **DO NOT** rename existing categories - use them exactly as shown
{% endif %}

## Complete Examples

### Example 1: Primary Business Entity (New Entity)

For entity "Orders" with fields: OrderNumber, OrderDate, CustomerID, BillToAddress1, BillToCity, BillToState, ShipToAddress1, ShipToCity, ShipToState, SubTotal, Tax, ShippingCost, TotalAmount, ShippingCarrier, TrackingNumber, OrderStatus, __mj_CreatedAt

**Field Statistics:** 17 fields, 2 FKs (CustomerID, OrderStatus), 15 non-FK fields, FK ratio: 12%

**Analysis:** Low FK ratio with many business fields → Primary entity → Target 4-5 categories

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
  "categoryInfo": {
    "Order Details": {
      "icon": "fa fa-shopping-cart",
      "description": "Core order information including order number, date, customer, and status"
    },
    "Billing Address": {
      "icon": "fa fa-file-invoice",
      "description": "Address for invoice delivery and billing correspondence"
    },
    "Shipping Address": {
      "icon": "fa fa-truck",
      "description": "Physical shipping destination and carrier information"
    },
    "Pricing and Charges": {
      "icon": "fa fa-dollar-sign",
      "description": "Order pricing including subtotal, tax, shipping, and total"
    },
    "System Metadata": {
      "icon": "fa fa-cog",
      "description": "System-managed audit and tracking fields"
    }
  },
  "entityImportance": {
    "defaultForNewUser": true,
    "entityCategory": "primary",
    "confidence": "high",
    "reasoning": "Order has 17 fields with only 12% FK ratio. 15 non-FK business fields across 5 semantic categories indicate a rich domain model. This is clearly a primary business entity central to e-commerce workflows."
  }
}
```

### Example 2: Junction Table (Should Be Hidden)

For entity "UserRoles" with fields: ID, UserID, RoleID, __mj_CreatedAt, __mj_UpdatedAt

**Field Statistics:** 5 fields, 2 FKs (UserID, RoleID), 0 non-FK business fields (excluding PK and system), FK ratio: 67%

**Analysis:** High FK ratio (67%), narrow table with only FKs → Junction table

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
  "categoryInfo": {
    "Relationships": {
      "icon": "fa fa-link",
      "description": "Foreign key references linking users to roles"
    },
    "System Metadata": {
      "icon": "fa fa-cog",
      "description": "System-managed audit and tracking fields"
    }
  },
  "entityImportance": {
    "defaultForNewUser": false,
    "entityCategory": "junction",
    "confidence": "high",
    "reasoning": "UserRoles has 67% FK ratio with 0 business fields beyond FKs. This narrow 5-field table exists solely to create many-to-many relationships. Users manage this via User/Role forms, not directly."
  }
}
```

### Example 3: Reference/Type Table (Should Be Hidden)

For entity "OrderStatus" with fields: ID, Name, Description, Sequence, IsActive, __mj_CreatedAt, __mj_UpdatedAt

**Field Statistics:** 7 fields, 0 FKs, 4 non-FK business fields, FK ratio: 0%

**Analysis:** Zero FKs, small table with Name/Description pattern → Reference table

```json
{
  "entityIcon": "fa fa-flag",
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
      "fieldName": "Name",
      "category": "Status Details",
      "reason": "Display name for the status",
      "displayName": "Name",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "Description",
      "category": "Status Details",
      "reason": "Extended description of what the status means",
      "displayName": "Description",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "Sequence",
      "category": "Status Details",
      "reason": "Display order in dropdowns",
      "displayName": "Sequence",
      "extendedType": null,
      "codeType": null
    },
    {
      "fieldName": "IsActive",
      "category": "Status Details",
      "reason": "Whether this status is available for selection",
      "displayName": "Active",
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
  "categoryInfo": {
    "Status Details": {
      "icon": "fa fa-flag",
      "description": "Status name, description, and configuration settings"
    },
    "System Metadata": {
      "icon": "fa fa-cog",
      "description": "System-managed audit and tracking fields"
    }
  },
  "entityImportance": {
    "defaultForNewUser": false,
    "entityCategory": "reference",
    "confidence": "high",
    "reasoning": "OrderStatus has 0% FK ratio and follows the classic reference table pattern (Name, Description, Sequence, IsActive). Entity name ends in 'Status'. This is admin-managed lookup data for populating dropdowns, not a user-facing entity."
  }
}
```
