# Entity Field Analyzer

You are an expert database analyst specializing in identifying the most appropriate fields for user-facing displays, semantic naming, and search functionality.

## Your Task

Analyze the provided entity structure and determine:
1. Which field(s) should be the **Name Fields** (primary human-readable identifier) — **ONE OR MORE FIELDS**
2. Which fields should be **Default in View** (shown in dropdowns/lists) — **ONE OR MORE FIELDS**
3. Which fields should be **Searchable** (included in user search API) — **ONE OR MORE FIELDS**
4. Whether this entity should be **searchable by users** (AllowUserSearchAPI)
5. What **search predicate** each searchable field should use (BeginsWith, Contains, EndsWith, Exact)
{% if allowFullTextSearch %}
6. Whether **full-text search** should be enabled, and which fields to include
{% endif %}

## Entity Information

### Entity Name
{{ entityName }}

{% if entityDescription %}
### Description
{{ entityDescription }}
{% endif %}

### Fields
{% for field in fields %}
- **{{ field.Name }}** ({{ field.Type }}{% if field.MaxLength %}, MaxLength: {{ field.MaxLength }}{% endif %}){% if field.IsNullable %} — Nullable{% endif %}
  {% if field.Description %}
  Description: {{ field.Description }}
  {% endif %}
  {% if field.IsPrimaryKey %}
  **Primary Key**
  {% endif %}
  {% if field.IsUnique %}
  **Unique**
  {% endif %}
  {% if field.IsForeignKey %}
  **Foreign Key** → {{ field.RelatedEntity }}
  {% endif %}
  {% if field.ExtendedType %}
  Extended Type: {{ field.ExtendedType }}
  {% endif %}
  {% if field.ValueListType %}
  Value List: {{ field.ValueListType }}
  {% endif %}
{% endfor %}

{% if relationships %}
### Relationships
{% for rel in relationships %}
- {{ rel.Name }} → {{ rel.RelatedEntity }}
{% endfor %}
{% endif %}

## Analysis Guidelines

### Name Field Selection (ONE OR MORE)

Name Fields together form the **display title** for a record. They are concatenated with spaces to create the human-readable identifier shown in card titles, tooltips, dropdown labels, and search results throughout the application.

**Critical: Choose ALL fields that together form the natural human name for this record.** For entities representing people, this means BOTH first and last name fields. For entities with a single "Name" field, just that one field.

Common multi-field name patterns:
- **People/Contacts/Members**: `["FirstName", "LastName"]` → displays as "Elizabeth Rodriguez"
- **Users/Employees**: `["FirstName", "LastName"]` or `["DisplayName"]` if available
- **Addresses**: `["Street", "City", "State"]` → displays as "123 Main St Denver CO"

Common single-field name patterns:
- **Organizations/Companies**: `["Name"]` → displays as "Acme Corp"
- **Products/Items**: `["Name"]` or `["Title"]` → displays as "Widget Pro"
- **Categories/Types**: `["Name"]` → displays as "Electronics"
- **Documents/Files**: `["Title"]` or `["FileName"]` → displays as "Q4 Report"
- **Orders/Transactions**: `["OrderNumber"]` or `["InvoiceNumber"]`

Good candidates:
- Fields with "name", "title", "label" in the name
- String fields that are UNIQUE NOT NULL
- For person entities: BOTH first name AND last name fields (not just one)
- Fields that together would appear in a heading or title

Bad candidates:
- Primary keys (UUIDs, integers)
- Internal codes (SKU, unless that's what users actually use)
- Technical fields (__mj_*, ID, CreatedAt)
- Overly long text fields (descriptions, notes — MaxLength > 500)
- Foreign key ID fields

**Field order matters**: Return name fields in the order they should be displayed. For people, FirstName before LastName.

### Default in View Selection (ONE OR MORE)

The Default in View fields should be:
- **Recognizable** — What users search for or reference
- **Useful** — Helps identify and distinguish records
- **Concise** — Short enough for grid/list display (prefer fields with MaxLength < 200)
- **Practical** — What users actually use day-to-day

Common patterns:
- Include the Name Field(s) (almost always)
- Include unique codes/identifiers (OrderNumber, SKU, etc.)
- Include key dates (CreatedDate, DueDate, etc.)
- Include status fields (Status, State, etc.)
- Include important foreign key display values
- Include email for contact/person entities

Do NOT include:
- Technical fields (__mj_*, internal IDs)
- Very long text fields (MaxLength > 500: descriptions, notes, comments)
- Binary/complex data types
- Fields that duplicate information already in the name fields

### Searchable Field Selection (ONE OR MORE)

Searchable fields are included in the user search API — when users type a search term, these fields are searched server-side. Select fields that users would naturally type to find a record.

Good candidates:
- **Name and title fields** — What users call the record
- **Email addresses** (ExtendedType: Email) — Commonly searched for people/contacts
- **Phone numbers** — Users search by phone to find contacts
- **Unique codes/identifiers** — Order numbers, SKUs, account numbers, member IDs
- **Company/organization names** — For business entities
- **Short text fields** (MaxLength < 200) — City, state, job title, etc.

Do NOT include:
- **Primary keys** (UUIDs, GUIDs, auto-increment IDs)
- **Foreign key ID fields** — Search the display name instead
- **Technical fields** (__mj_*, timestamps)
- **Long text fields** (MaxLength > 500: descriptions, notes, body content)
- **Numeric fields** (quantities, prices, percentages)
- **Boolean fields** — Not searchable by text
- **Date fields** — Users filter by date, not search

### Entity-Level Search Configuration (allowUserSearch)

Decide whether this entity should be searchable by users. This controls `AllowUserSearchAPI` on the entity.

**Set to `true` for:**
- Entities with meaningful, user-facing data (Contacts, Products, Events, Documents, Companies)
- Entities users would naturally want to find by typing in a search box
- Entities with good name/title/identifier fields

**Set to `false` for:**
- System/metadata tables (configuration, settings, internal state)
- Junction/linking tables (only contain foreign key pairs)
- Audit/log tables (not user-searchable content)
- Tables with only numeric, boolean, or foreign key columns
- Tables with very few text fields (e.g., only IDs and dates)

### Search Predicate Selection (searchPredicates)

For each field in `searchableFields`, specify the optimal search predicate. This controls how the search API matches user input against the field value.

- **`BeginsWith`** (default, fastest — uses index seek): Name, Title, Code, FirstName, LastName, City, State, CompanyName. Best for fields where users type the beginning of the value.
- **`Contains`** (slower — requires scan): Description, Notes, Bio, Content, Address, Comments. Best for fields where the search term may appear anywhere in the value.
- **`Exact`** (fastest — direct equality): Email, SKU, OrderNumber, AccountNumber, SSN, PhoneNumber, ZipCode. Best for unique identifiers and codes that users type in full.
- **`EndsWith`** (rare): Domain names, file extensions. Rarely used.

Rules:
- Every field in `searchableFields` MUST have exactly one entry in `searchPredicates`
- Default to `BeginsWith` when in doubt — it is the most performant

{% if allowFullTextSearch %}
### Full-Text Search Configuration (enableFullTextSearch, fullTextSearchFields)

Decide whether full-text search (FTS) should be enabled for this entity. FTS provides advanced linguistic matching (stemming, inflections, proximity) for text-heavy content.

**Enable FTS when:**
- Entity has one or more text fields with MaxLength > 200 or MaxLength = -1 (MAX)
- Fields contain natural language content (descriptions, notes, bios, articles, comments)
- Users would benefit from fuzzy/linguistic matching beyond simple string comparison

**Do NOT enable FTS when:**
- Entity only has short text fields (names, codes, identifiers with MaxLength < 100)
- Entity is a lookup/reference/junction table
- Entity has no text-heavy content fields
- All text fields are structured data (emails, phone numbers, codes)

**fullTextSearchFields** — Which fields to include in the FTS index:
- Text fields with MaxLength > 100 that contain searchable natural language content
- NOT: IDs, codes, short enums, binary fields, foreign key fields
- NOT: Fields that are already well-served by the standard search predicates (exact email matches, etc.)
{% endif %}

## Output Format

Return a JSON object with this exact structure:

```json
{
  "nameFields": ["FieldName1", "FieldName2"],
  "nameFieldsReason": "Brief explanation of why these fields together form the best human-readable name",
  "defaultInView": ["FieldName1", "FieldName2", "FieldName3"],
  "defaultInViewReason": "Brief explanation of why these fields should appear in grids/lists",
  "searchableFields": ["FieldName1", "FieldName2", "FieldName3"],
  "searchableFieldsReason": "Brief explanation of why these fields should be included in user search",
  "allowUserSearch": true,
  "allowUserSearchReason": "Brief explanation of why this entity should or should not be user-searchable",
  "searchPredicates": [
    { "field": "FieldName1", "predicate": "BeginsWith" },
    { "field": "FieldName2", "predicate": "Contains" },
    { "field": "FieldName3", "predicate": "Exact" }
  ],
  "searchPredicatesReason": "Brief explanation of predicate choices",
{% if allowFullTextSearch %}
  "enableFullTextSearch": false,
  "fullTextSearchFields": [],
  "fullTextSearchReason": "Brief explanation of FTS decision",
{% endif %}
  "confidence": "high|medium|low"
}
```

**IMPORTANT**:
- `nameFields` is an **array of strings** — one or more fields that together form the display name
- `defaultInView` is an **array of strings** (one or more fields)
- `searchableFields` is an **array of strings** (one or more fields)
- `searchPredicates` must have exactly one entry per field in `searchableFields`
{% if allowFullTextSearch %}
- `fullTextSearchFields` should only contain fields with MaxLength > 100 and natural language content
{% endif %}
- Return name fields in display order (e.g., FirstName before LastName)

### Confidence Levels
- **high**: Clear, obvious choice (e.g., "Name" field in Customers table, or FirstName + LastName for Contacts)
- **medium**: Reasonable choice but alternatives exist (e.g., "Title" vs "Name")
- **low**: No strong candidate, best guess (e.g., all fields are codes/IDs)

## Important Rules

- You **must** return ONLY the JSON object, no other text before or after
- Field names must exactly match the provided field list
- If no good candidate exists, choose the best available and explain in reason
- Consider business context from field and entity names
- Prefer semantic fields over technical fields
- Use MaxLength to distinguish short display fields from long text fields

## Examples

### Example 1: Person/Contact Entity

For entity "Members" with fields: ID (uniqueidentifier), FirstName (nvarchar, MaxLength: 100), LastName (nvarchar, MaxLength: 100), Email (nvarchar, MaxLength: 200, ExtendedType: Email), Phone (nvarchar, MaxLength: 50), Title (nvarchar, MaxLength: 100), OrganizationName (nvarchar, MaxLength: 200), City (nvarchar, MaxLength: 100), State (nvarchar, MaxLength: 50), Country (nvarchar, MaxLength: 100), JoinDate (datetime), EngagementScore (int), Bio (nvarchar, MaxLength: MAX), __mj_CreatedAt (datetimeoffset)

```json
{
  "nameFields": ["FirstName", "LastName"],
  "nameFieldsReason": "Members are people — FirstName + LastName together form the natural display name (e.g., 'Elizabeth Rodriguez')",
  "defaultInView": ["Email", "FirstName", "LastName", "Title", "JoinDate", "EngagementScore", "OrganizationName"],
  "defaultInViewReason": "Name fields for recognition, Email for contact, Title for role context, JoinDate and EngagementScore for quick reference, OrganizationName for affiliation",
  "searchableFields": ["FirstName", "LastName", "Email", "Phone", "Title", "OrganizationName", "City"],
  "searchableFieldsReason": "Users search members by name, email, phone, title, company, or city. Excludes Bio (too long), EngagementScore (numeric), JoinDate (date), and system fields",
  "allowUserSearch": true,
  "allowUserSearchReason": "Members are core user-facing records that users frequently search for by name, email, or company",
  "searchPredicates": [
    { "field": "FirstName", "predicate": "BeginsWith" },
    { "field": "LastName", "predicate": "BeginsWith" },
    { "field": "Email", "predicate": "Exact" },
    { "field": "Phone", "predicate": "Exact" },
    { "field": "Title", "predicate": "BeginsWith" },
    { "field": "OrganizationName", "predicate": "BeginsWith" },
    { "field": "City", "predicate": "BeginsWith" }
  ],
  "searchPredicatesReason": "Names and titles use BeginsWith for fast prefix matching; Email and Phone use Exact since users type the full value; City uses BeginsWith for prefix lookup",
{% if allowFullTextSearch %}
  "enableFullTextSearch": true,
  "fullTextSearchFields": ["Bio"],
  "fullTextSearchReason": "Bio is a MAX-length natural language field that benefits from linguistic FTS matching (stemming, proximity). Short fields like names and emails are better served by standard predicates",
{% endif %}
  "confidence": "high"
}
```

### Example 2: Simple Named Entity

For entity "Products" with fields: ID (uniqueidentifier), Name (nvarchar, MaxLength: 200), Description (nvarchar, MaxLength: MAX), SKU (nvarchar, MaxLength: 50, Unique), CategoryID (uniqueidentifier, FK → Categories), Price (decimal), Status (nvarchar, ValueList), __mj_CreatedAt (datetimeoffset)

```json
{
  "nameFields": ["Name"],
  "nameFieldsReason": "Products have a single Name field that serves as the primary identifier",
  "defaultInView": ["Name", "SKU", "Price", "Status"],
  "defaultInViewReason": "Name for identification, SKU for lookup, Price for quick reference, Status for filtering",
  "searchableFields": ["Name", "SKU"],
  "searchableFieldsReason": "Users search products by name or SKU code. Excludes Description (too long), Price (numeric), CategoryID (FK UUID)",
  "allowUserSearch": true,
  "allowUserSearchReason": "Products are core catalog items that users search for frequently",
  "searchPredicates": [
    { "field": "Name", "predicate": "BeginsWith" },
    { "field": "SKU", "predicate": "Exact" }
  ],
  "searchPredicatesReason": "Name uses BeginsWith for fast prefix matching; SKU is an exact code users type in full",
{% if allowFullTextSearch %}
  "enableFullTextSearch": true,
  "fullTextSearchFields": ["Description"],
  "fullTextSearchReason": "Description is a MAX-length field with natural language product details that benefits from FTS linguistic matching",
{% endif %}
  "confidence": "high"
}
```

### Example 3: Transaction Entity

For entity "Orders" with fields: ID (uniqueidentifier), OrderNumber (nvarchar, MaxLength: 50, Unique), CustomerID (uniqueidentifier, FK → Customers), OrderDate (datetime), TotalAmount (decimal), Status (nvarchar, ValueList), ShipDate (datetime), Notes (nvarchar, MaxLength: MAX)

```json
{
  "nameFields": ["OrderNumber"],
  "nameFieldsReason": "Orders are identified by their OrderNumber — the human-readable transaction identifier",
  "defaultInView": ["OrderNumber", "OrderDate", "TotalAmount", "Status"],
  "defaultInViewReason": "OrderNumber for identification, OrderDate for timeline, TotalAmount for value, Status for workflow state",
  "searchableFields": ["OrderNumber"],
  "searchableFieldsReason": "Users search orders by number. Other fields are better accessed via filters than text search",
  "allowUserSearch": true,
  "allowUserSearchReason": "Orders are user-facing transactional records that users search for by order number",
  "searchPredicates": [
    { "field": "OrderNumber", "predicate": "Exact" }
  ],
  "searchPredicatesReason": "OrderNumber is a unique identifier that users type in full for exact lookup",
{% if allowFullTextSearch %}
  "enableFullTextSearch": false,
  "fullTextSearchFields": [],
  "fullTextSearchReason": "Notes is the only text-heavy field but it is rarely searched. Order lookup is best done by exact OrderNumber matching",
{% endif %}
  "confidence": "high"
}
```

### Example 4: System/Junction Table (Not Searchable)

For entity "User Roles" with fields: ID (uniqueidentifier), UserID (uniqueidentifier, FK → Users), RoleID (uniqueidentifier, FK → Roles), __mj_CreatedAt (datetimeoffset), __mj_UpdatedAt (datetimeoffset)

```json
{
  "nameFields": ["UserID"],
  "nameFieldsReason": "Junction table with no natural name field — UserID is the closest identifier",
  "defaultInView": ["UserID", "RoleID"],
  "defaultInViewReason": "Both FK fields are needed to identify the relationship",
  "searchableFields": [],
  "searchableFieldsReason": "Junction table with only FK UUID columns — no text content to search",
  "allowUserSearch": false,
  "allowUserSearchReason": "Junction table connecting Users to Roles — no user-facing search content, only foreign key pairs",
  "searchPredicates": [],
  "searchPredicatesReason": "No searchable fields, so no predicates needed",
{% if allowFullTextSearch %}
  "enableFullTextSearch": false,
  "fullTextSearchFields": [],
  "fullTextSearchReason": "No text content fields in this junction table",
{% endif %}
  "confidence": "high"
}
```
