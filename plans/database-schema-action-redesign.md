# Explore Database Schema Action - Redesign Proposal

## Problem Statement

The current implementation of the **Explore Database Schema** action queries raw `INFORMATION_SCHEMA` views to discover database structure. However, MemberJunction has a **rich metadata layer** that provides far more comprehensive information about entities, including:

- Entity descriptions and business context
- Field descriptions and display names
- Relationships (foreign keys with semantic meaning)
- API permissions and settings
- Virtual entities (not backed by physical tables)
- Field value lists and validation rules
- UI display preferences
- Business logic hooks
- Full-text search configuration
- Audit settings

## Current vs. Proposed Approach

### Current Approach ❌
```typescript
// Queries INFORMATION_SCHEMA directly
SELECT t.TABLE_SCHEMA, t.TABLE_NAME, t.TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES t
WHERE ...
```

**Problems:**
- Only sees raw database schema
- No business context or descriptions
- No knowledge of virtual entities
- No understanding of relationships beyond FKs
- No permission information
- No field-level metadata
- Misses MJ-specific features completely

### Proposed Approach ✅
```typescript
// Uses MJ Metadata layer
const md = new Metadata();
const entities = md.Entities;  // Rich EntityInfo[]

// Each entity has:
// - Name, Description, DisplayName
// - Fields array with EntityFieldInfo[]
// - Relationships with EntityRelationshipInfo[]
// - Permission settings
// - API availability
// - And much more...
```

**Benefits:**
- Full business context with descriptions
- Includes virtual entities
- Rich relationship information
- Permission-aware
- Field metadata (types, defaults, value lists)
- MJ-specific settings (API access, audit settings)
- Much more useful for AI research

## Proposed Changes

### 1. Action Definition Changes

#### New Input Parameters

```json
{
  "Name": "EntityPattern",
  "Type": "Input",
  "Description": "Filter entities by name pattern (e.g., 'Customer%', '%Order%'). Uses wildcards."
}
```

```json
{
  "Name": "SchemaFilter",
  "Type": "Input",
  "Description": "Filter by schema name(s). Comma-separated list (e.g., 'dbo,__mj'). If not provided, returns all schemas."
}
```

```json
{
  "Name": "IncludeFields",
  "Type": "Input",
  "DefaultValue": "true",
  "Description": "Include detailed field information for each entity. Default: true."
}
```

```json
{
  "Name": "IncludeRelationships",
  "Type": "Input",
  "DefaultValue": "true",
  "Description": "Include relationship information (foreign keys with semantic meaning). Default: true."
}
```

```json
{
  "Name": "IncludePermissions",
  "Type": "Input",
  "DefaultValue": "false",
  "Description": "Include API permission information. Default: false (reduces output size)."
}
```

```json
{
  "Name": "IncludeVirtualEntities",
  "Type": "Input",
  "DefaultValue": "true",
  "Description": "Include virtual entities (not backed by physical tables). Default: true."
}
```

```json
{
  "Name": "MaxEntities",
  "Type": "Input",
  "DefaultValue": "100",
  "Description": "Maximum number of entities to return. Default: 100. Prevents overwhelming output."
}
```

```json
{
  "Name": "ScopeFilter",
  "Type": "Input",
  "Description": "Filter entities by scope (Users, Admins, AI, All). If not provided, returns all scopes."
}
```

#### New Output Parameters

```json
{
  "Name": "Entities",
  "Type": "Output",
  "ValueType": "Array",
  "Description": "Array of entity objects with full MJ metadata. Each contains: Name, Description, BaseTable, BaseView, SchemaName, Fields (if IncludeFields=true), Relationships (if IncludeRelationships=true), Permissions (if IncludePermissions=true), APISettings, AuditSettings, and more."
}
```

```json
{
  "Name": "EntitySummary",
  "Type": "Output",
  "ValueType": "Simple Object",
  "Description": "Summary statistics: TotalEntities, PhysicalEntities, VirtualEntities, TotalFields, TotalRelationships, SchemaList."
}
```

```json
{
  "Name": "Schemas",
  "Type": "Output",
  "ValueType": "Array",
  "Description": "Array of schema objects grouped by SchemaName. Each contains: SchemaName, EntityCount, Entities (array)."
}
```

### 2. Implementation Changes

#### Core Logic

```typescript
protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
        // Extract parameters
        const entityPattern = this.getStringParam(params, "entitypattern");
        const schemaFilter = this.getStringParam(params, "schemafilter");
        const includeFields = this.getBooleanParam(params, "includefields", true);
        const includeRelationships = this.getBooleanParam(params, "includerelationships", true);
        const includePermissions = this.getBooleanParam(params, "includepermissions", false);
        const includeVirtualEntities = this.getBooleanParam(params, "includevirtualentities", true);
        const maxEntities = this.getNumericParam(params, "maxentities", 100);
        const scopeFilter = this.getStringParam(params, "scopefilter");

        const startTime = Date.now();

        // Get MJ metadata
        const md = new Metadata();
        let entities = md.Entities;

        // Apply filters
        entities = this.filterEntities(entities, {
            entityPattern,
            schemaFilter,
            includeVirtualEntities,
            scopeFilter,
            maxEntities
        });

        // Build result objects
        const formattedEntities = entities.map(entity =>
            this.formatEntityInfo(entity, {
                includeFields,
                includeRelationships,
                includePermissions
            })
        );

        // Group by schema
        const schemas = this.groupBySchema(formattedEntities);

        // Calculate summary
        const summary = this.calculateSummary(formattedEntities, entities);

        const executionTimeMs = Date.now() - startTime;

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: `Found ${formattedEntities.length} entities across ${schemas.length} schema(s)`,
            Entities: formattedEntities,
            Schemas: schemas,
            EntitySummary: summary,
            ExecutionTimeMs: executionTimeMs
        } as ActionResultSimple;

    } catch (error) {
        return this.handleError(error);
    }
}
```

#### Helper Methods

```typescript
/**
 * Filter entities based on parameters
 */
private filterEntities(
    entities: EntityInfo[],
    filters: FilterOptions
): EntityInfo[] {
    return entities.filter(entity => {
        // Entity name pattern filter
        if (filters.entityPattern &&
            !this.matchesPattern(entity.Name, filters.entityPattern)) {
            return false;
        }

        // Schema filter
        if (filters.schemaFilter) {
            const schemas = filters.schemaFilter.split(',').map(s => s.trim());
            if (!schemas.includes(entity.SchemaName)) {
                return false;
            }
        }

        // Virtual entity filter
        if (!filters.includeVirtualEntities && entity.VirtualEntity) {
            return false;
        }

        // Scope filter
        if (filters.scopeFilter && entity.ScopeDefault) {
            const scopes = entity.ScopeDefault.split(',').map(s => s.trim());
            if (!scopes.includes(filters.scopeFilter)) {
                return false;
            }
        }

        return true;
    }).slice(0, filters.maxEntities);
}

/**
 * Format EntityInfo into research-friendly structure
 */
private formatEntityInfo(
    entity: EntityInfo,
    options: FormatOptions
): Record<string, any> {
    const result: Record<string, any> = {
        ID: entity.ID,
        Name: entity.Name,
        DisplayName: entity.DisplayName || entity.Name,
        Description: entity.Description,
        SchemaName: entity.SchemaName,
        BaseTable: entity.BaseTable,
        BaseView: entity.BaseView,
        IsVirtual: entity.VirtualEntity,
        Icon: entity.Icon,

        // API Settings
        APISettings: {
            IncludeInAPI: entity.IncludeInAPI,
            AllowCreateAPI: entity.AllowCreateAPI,
            AllowReadAPI: true, // Always true if in API
            AllowUpdateAPI: entity.AllowUpdateAPI,
            AllowDeleteAPI: entity.AllowDeleteAPI,
            AllowUserSearchAPI: entity.AllowUserSearchAPI
        },

        // Audit Settings
        AuditSettings: {
            TrackRecordChanges: entity.TrackRecordChanges,
            AuditRecordAccess: entity.AuditRecordAccess,
            AuditViewRuns: entity.AuditViewRuns
        },

        // Search Settings
        SearchSettings: {
            FullTextSearchEnabled: entity.FullTextSearchEnabled,
            FullTextCatalog: entity.FullTextCatalog,
            FullTextIndex: entity.FullTextIndex
        }
    };

    // Include fields if requested
    if (options.includeFields) {
        result.Fields = entity.Fields.map(field => ({
            Name: field.Name,
            DisplayName: field.DisplayName || field.Name,
            Description: field.Description,
            Type: field.Type,
            Length: field.Length,
            Precision: field.Precision,
            Scale: field.Scale,
            AllowsNull: field.AllowsNull,
            DefaultValue: field.DefaultValue,
            IsPrimaryKey: field.IsPrimaryKey,
            IsUnique: field.IsUnique,
            AutoIncrement: field.AutoIncrement,
            IsVirtual: field.IsVirtual,
            IsNameField: field.IsNameField,

            // Related entity info (for foreign keys)
            RelatedEntity: field.RelatedEntity,
            RelatedEntityFieldName: field.RelatedEntityFieldName,

            // Value list (for dropdowns)
            ValueListType: field.ValueListType,
            EntityFieldValues: field.EntityFieldValues?.map(v => ({
                Value: v.Value,
                Code: v.Code,
                Description: v.Description
            })),

            // API settings
            AllowUpdateAPI: field.AllowUpdateAPI,
            AllowUpdateInView: field.AllowUpdateInView,
            IncludeInUserSearchAPI: field.IncludeInUserSearchAPI,

            // UI settings
            DefaultInView: field.DefaultInView,
            IncludeInGeneratedForm: field.IncludeInGeneratedForm,
            GeneratedFormSection: field.GeneratedFormSection
        }));
    }

    // Include relationships if requested
    if (options.includeRelationships) {
        result.Relationships = entity.RelatedEntities.map(rel => ({
            ID: rel.ID,
            Type: rel.Type,
            RelatedEntity: rel.RelatedEntity,
            EntityKeyField: rel.EntityKeyField,
            RelatedEntityJoinField: rel.RelatedEntityJoinField,
            DisplayInForm: rel.DisplayInForm,
            DisplayName: rel.DisplayName,
            BundleInAPI: rel.BundleInAPI,
            IncludeInParentAllQuery: rel.IncludeInParentAllQuery
        }));
    }

    // Include permissions if requested
    if (options.includePermissions && entity.Permissions) {
        result.Permissions = entity.Permissions.map(perm => ({
            Role: perm.Role,
            CanCreate: perm.CanCreate,
            CanRead: perm.CanRead,
            CanUpdate: perm.CanUpdate,
            CanDelete: perm.CanDelete
        }));
    }

    return result;
}
```

### 3. Prompt Changes

The Database Research Agent prompt needs significant updates to reflect the new metadata-rich approach:

#### Key Changes:

1. **Remove INFORMATION_SCHEMA references** - Replace with MJ Metadata concepts
2. **Emphasize MJ metadata richness** - Explain EntityInfo, EntityFieldInfo, relationships
3. **Update example queries** - Show metadata-aware research instead of raw SQL
4. **Add metadata interpretation guidance** - How to understand EntityInfo structure
5. **Update error handling** - Different error patterns with metadata

#### New Prompt Sections:

```markdown
## Understanding MemberJunction Metadata

### Entity Information (EntityInfo)
When you explore the database schema, you receive **EntityInfo** objects that contain:

- **Business Context**: Name, DisplayName, Description
- **Database Mapping**: BaseTable, BaseView, SchemaName
- **Type**: IsVirtual (true for entities not backed by physical tables)
- **API Settings**: What operations are allowed via API
- **Audit Settings**: Whether changes are tracked
- **Search Settings**: Full-text search configuration
- **Fields**: Array of EntityFieldInfo objects
- **Relationships**: Semantic relationships beyond simple FKs

### Field Information (EntityFieldInfo)
Each field includes:

- **Identity**: Name, DisplayName, Description
- **Data Type**: Type, Length, Precision, Scale
- **Constraints**: AllowsNull, IsPrimaryKey, IsUnique, DefaultValue
- **Related Entities**: RelatedEntity (for foreign keys with semantic meaning)
- **Value Lists**: Predefined values for dropdowns/validation
- **API/UI Settings**: What's exposed and how

### Why This Matters
MJ metadata provides **business context** that raw schema doesn't:
- Descriptions explain **what** data means, not just structure
- DisplayNames show **how** to present data to users
- Relationships are **semantic** (what the FK means), not just technical
- Virtual entities exist **logically** but not physically
- Permissions tell you **what's accessible** via API

## Research Methodology Updates

### 1. Understand the Question
**NEW**: Consider whether the question is about:
- **Logical entities** (use MJ metadata - includes virtual entities)
- **Physical tables** (can still query via Execute Research Query)
- **Business data** (MJ metadata provides context)

### 2. Explore Schema (UPDATED)
**Use Explore Database Schema action with MJ metadata:**

Parameters to consider:
- **EntityPattern**: Filter by entity name (e.g., "Customer%")
- **SchemaFilter**: Focus on specific schemas (e.g., "dbo,__mj")
- **IncludeFields**: Get field details (usually true)
- **IncludeRelationships**: Get relationship info (usually true)
- **IncludeVirtualEntities**: Include logical entities (default true)

**Example**:
```
Action: Explore Database Schema
Params:
  EntityPattern: "Customer%"
  IncludeFields: true
  IncludeRelationships: true
```

Result will show:
- All entities matching "Customer%" pattern
- Each entity's business description
- All fields with types and descriptions
- Relationships to other entities
- API permissions
- Whether it's virtual or physical

### 3. Interpret Metadata

When you receive EntityInfo:
- **Check IsVirtual** - Virtual entities may aggregate/compute data
- **Read Description** - Explains the entity's purpose
- **Review Fields** - Look for IsNameField (display field)
- **Study Relationships** - Understand entity connections
- **Check APISettings** - Know what operations are allowed

### 4. Query Strategy

Based on metadata:
- **For simple lookups**: Use entity name in queries
- **For joins**: Use relationship info to understand connections
- **For filtering**: Use field types/constraints appropriately
- **For complex queries**: Consider view vs table

## Example Research Flows (UPDATED)

### Example 1: Find Customer Data

**Step 1 - Explore with MJ Metadata:**
```
Action: Explore Database Schema
Params:
  EntityPattern: "%Customer%"
  IncludeFields: true
  IncludeRelationships: true
```

**Result Analysis:**
- Found entities: "Customers", "Customer Orders", "Customer Contacts"
- "Customers" description: "Core customer information and demographics"
- Key fields: CustomerID (PK), CustomerName (IsNameField=true), Industry, Region
- Relationship to "Orders": Type="One To Many", displays customer's orders
- API settings: AllowRead=true, AllowUpdate=true, AllowCreate=true

**Step 2 - Query Based on Metadata:**
```
Action: Execute Research Query
Query: |
  SELECT TOP 10
    CustomerID,
    CustomerName,
    Industry,
    Region
  FROM vwCustomers  -- Using the BaseView from metadata
  WHERE Industry = 'Technology'
  ORDER BY CustomerName
```

### Example 2: Understand Entity Relationships

**Step 1 - Explore:**
```
Action: Explore Database Schema
Params:
  EntityPattern: "Orders"
  IncludeRelationships: true
```

**Result Analysis:**
- Entity: "Orders"
- Description: "Sales orders from customers"
- Relationships:
  - To "Customers": EntityKeyField="CustomerID", Type="Many To One"
  - To "Order Items": Type="One To Many"
  - To "Employees": EntityKeyField="SalesRepID" (assigned sales rep)

**Step 2 - Query with Understanding:**
```
Action: Execute Research Query
Query: |
  -- Now I understand the relationships from metadata
  SELECT
    o.OrderID,
    c.CustomerName,      -- From Customers relationship
    e.EmployeeName,      -- From Employees relationship (SalesRepID)
    COUNT(oi.ID) as ItemCount  -- From Order Items relationship
  FROM vwOrders o
  INNER JOIN vwCustomers c ON o.CustomerID = c.ID
  INNER JOIN vwEmployees e ON o.SalesRepID = e.ID
  INNER JOIN vwOrderItems oi ON o.ID = oi.OrderID
  GROUP BY o.OrderID, c.CustomerName, e.EmployeeName
  ORDER BY o.OrderID DESC
```
```

## Benefits Summary

### For AI Research Agents
1. **Business Context**: Understand what data means, not just structure
2. **Semantic Relationships**: Know why entities are connected
3. **Virtual Entities**: Discover computed/aggregated logical entities
4. **API Awareness**: Know what operations are allowed
5. **Value Lists**: Understand valid values for fields
6. **Better Queries**: Write more informed SQL with metadata context

### For Users
1. **Richer Results**: Agents provide more meaningful insights
2. **Better Questions**: Agents can clarify ambiguous requests
3. **Accurate Analysis**: Metadata prevents misinterpretation
4. **Complete Picture**: See both physical and logical data model

### For MemberJunction
1. **Leverages Platform**: Uses MJ's rich metadata layer properly
2. **Consistent**: Aligns with MJ architecture patterns
3. **Maintainable**: Changes to metadata automatically reflected
4. **Extensible**: Easy to add more metadata fields in future

## Migration Path

1. **Phase 1**: Update action implementation to use MJ Metadata
2. **Phase 2**: Update action metadata JSON with new parameters/outputs
3. **Phase 3**: Update Database Research Agent prompt
4. **Phase 4**: Test with real research scenarios
5. **Phase 5**: Update main Research Agent to leverage new capabilities

## Breaking Changes

- Output structure changes significantly
- Input parameters renamed/refactored
- Existing code using this action will need updates

## Compatibility Notes

- Can still query raw schema via Execute Research Query if needed
- MJ metadata is superset of INFORMATION_SCHEMA (more information)
- All INFORMATION_SCHEMA data is available in EntityInfo
