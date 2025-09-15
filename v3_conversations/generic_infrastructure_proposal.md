# MemberJunction v3: Generic Infrastructure Components

## Executive Summary

As part of the v3 Conversations initiative, we're proposing two powerful generic infrastructure components that will benefit the entire MemberJunction platform:

1. **RecordLink** - A universal table for linking any two records in the system
2. **AccessControlRule** - A generic ACL-based permission system for any entity

These components provide flexible, reusable patterns that eliminate the need for multiple specialized tables while maintaining clarity and performance.

## 1. RecordLink: Universal Record Linking

### Concept
Instead of creating multiple linking tables (ArtifactLink, TaskLink, ConversationLink, etc.), we implement a single generic table that can link ANY two records in the system.

### Schema
```sql
CREATE TABLE __mj.RecordLink (
    ID UNIQUEIDENTIFIER PRIMARY KEY,
    SourceEntityID UNIQUEIDENTIFIER,      -- FK to __mj.Entity.ID
    SourceRecordID NVARCHAR(500),         -- Scalar or JSON composite key
    TargetEntityID UNIQUEIDENTIFIER,      -- FK to __mj.Entity.ID  
    TargetRecordID NVARCHAR(500),         -- Scalar or JSON composite key
    LinkType NVARCHAR(50),                -- Application-defined relationship
    Sequence INT,                          -- For UI ordering
    Metadata NVARCHAR(MAX)                -- JSON for additional context
)
```

### Key Features

#### Composite Key Support
For entities with composite primary keys, RecordID stores JSON:
```json
[
    {"FieldName": "CompanyID", "Value": "123"},
    {"FieldName": "DepartmentID", "Value": "456"}
]
```

#### Flexible Relationships
LinkType allows semantic meaning without schema changes:
- Artifact → Conversation: `LinkType = 'created'`
- Artifact → Collection: `LinkType = 'saved'`
- Task → Project: `LinkType = 'belongs_to'`
- User → Dashboard: `LinkType = 'favorites'`

### Benefits
✅ **Single source of truth** for all relationships  
✅ **No schema changes** for new relationship types  
✅ **Supports any entity** including future ones  
✅ **Composite key support** via JSON  
✅ **Queryable metadata** for rich relationships  

### Example Usage

#### Link an artifact to a conversation:
```sql
INSERT INTO RecordLink (
    SourceEntityID, -- Entity ID for 'Artifacts'
    SourceRecordID, -- Artifact.ID
    TargetEntityID, -- Entity ID for 'Conversations'
    TargetRecordID, -- Conversation.ID
    LinkType,       -- 'created'
    Sequence        -- 1
)
```

#### Query all artifacts in a conversation:
```sql
SELECT a.*
FROM Artifact a
INNER JOIN RecordLink rl ON 
    rl.SourceRecordID = CAST(a.ID AS NVARCHAR(500))
    AND rl.SourceEntityID = @ArtifactEntityID
WHERE 
    rl.TargetEntityID = @ConversationEntityID
    AND rl.TargetRecordID = @ConversationID
    AND rl.LinkType = 'created'
ORDER BY rl.Sequence
```

## 2. AccessControlRule: Generic Permission System

### Concept
Instead of building separate permission tables for each entity or using the complex Authorization framework, we implement a simple, generic ACL table that works for any entity record.

### Schema
```sql
CREATE TABLE __mj.AccessControlRule (
    ID UNIQUEIDENTIFIER PRIMARY KEY,
    EntityID UNIQUEIDENTIFIER,            -- FK to __mj.Entity.ID
    RecordID NVARCHAR(500),               -- Scalar or JSON composite key
    GranteeType NVARCHAR(50),             -- 'User', 'Role', 'Everyone', 'Public'
    GranteeID UNIQUEIDENTIFIER,           -- UserID or RoleID (NULL for Everyone/Public)
    CanRead BIT DEFAULT 0,
    CanCreate BIT DEFAULT 0,
    CanUpdate BIT DEFAULT 0,
    CanDelete BIT DEFAULT 0,
    CanShare BIT DEFAULT 0,               -- Can grant permissions to others
    ExpiresAt DATETIMEOFFSET,             -- Time-limited permissions
    GrantedByUserID UNIQUEIDENTIFIER      -- Audit trail
)
```

### Key Features

#### Granular CRUD Permissions
Each rule specifies exactly what operations are allowed:
- **CanRead**: View the record
- **CanCreate**: Create related/child records
- **CanUpdate**: Modify the record
- **CanDelete**: Remove the record
- **CanShare**: Grant permissions to others

#### Flexible Grantee Types
- **User**: Specific user access
- **Role**: Group-based access
- **Everyone**: All authenticated users
- **Public**: Anonymous access

#### Time-Limited Access
Optional ExpiresAt field for temporary permissions:
- Share a report for 30 days
- Grant contractor access for project duration
- Time-boxed public links

### Benefits
✅ **Simple and familiar** ACL pattern  
✅ **Works for any entity** without new tables  
✅ **Granular permissions** (CRUD + Share)  
✅ **Time-limited access** support  
✅ **Role-based or user-specific** grants  
✅ **Built-in audit trail** via GrantedByUserID  

### Example Usage

#### Grant user read access to an artifact:
```sql
INSERT INTO AccessControlRule (
    EntityID,        -- Entity ID for 'Artifacts'
    RecordID,        -- Artifact.ID
    GranteeType,     -- 'User'
    GranteeID,       -- User.ID
    CanRead,         -- 1
    CanUpdate,       -- 0
    GrantedByUserID  -- Current user
)
```

#### Check if user can update a conversation:
```sql
SELECT TOP 1 1
FROM AccessControlRule acr
WHERE 
    acr.EntityID = @ConversationEntityID
    AND acr.RecordID = @ConversationID
    AND acr.CanUpdate = 1
    AND (acr.ExpiresAt IS NULL OR acr.ExpiresAt > GETUTCDATE())
    AND (
        (acr.GranteeType = 'User' AND acr.GranteeID = @UserID)
        OR (acr.GranteeType = 'Role' AND acr.GranteeID IN (
            SELECT RoleID FROM UserRole WHERE UserID = @UserID
        ))
        OR acr.GranteeType = 'Everyone'
    )
```

## Migration Impact

### From Current v3 Design
The current v3 design has:
- `ArtifactLink` table → Replace with `RecordLink`
- `Permission` table → Replace with `AccessControlRule`

### Benefits of Migration
1. **Fewer tables** to maintain
2. **Consistent patterns** across the platform
3. **Future-proof** for new entities
4. **Simpler queries** for common operations

## Implementation Considerations

### Performance
- **Indexes**: Composite indexes on (EntityID, RecordID) for fast lookups
- **Query patterns**: Optimized for common "get all X for Y" queries
- **Caching**: Permission checks can be cached at application layer

### Security
- **No direct access**: Applications use service layer for permission checks
- **Audit trail**: All grants tracked via GrantedByUserID
- **Validation**: EntityID/RecordID combinations validated against actual data

### Developer Experience
- **Helper functions**: Utility methods for common operations
- **Type safety**: TypeScript interfaces for composite keys
- **Documentation**: Clear patterns for each use case

## Comparison with Alternatives

### vs. Specialized Tables (Current Approach)
| Aspect | Specialized Tables | Generic Tables |
|--------|-------------------|----------------|
| Schema changes | Required for new relationships | Never needed |
| Type safety | DB-enforced foreign keys | Application-enforced |
| Query complexity | Simple joins | Requires EntityID checks |
| Maintenance | Many tables to manage | Two tables total |

### vs. MJ Authorization Framework
| Aspect | Authorization Framework | AccessControlRule |
|--------|------------------------|-------------------|
| Complexity | Hierarchical, inherited permissions | Flat, explicit rules |
| Setup | Create Authorization records | Direct ACL entries |
| Learning curve | Complex conceptual model | Simple CRUD permissions |
| Use cases | Application-level permissions | Record-level permissions |

## Recommendation

We recommend adopting both `RecordLink` and `AccessControlRule` for v3 because:

1. **Simplicity**: Developers immediately understand the patterns
2. **Flexibility**: Handles current and future requirements
3. **Performance**: Optimized indexes make queries fast
4. **Maintainability**: Two tables instead of dozens
5. **Consistency**: Same pattern everywhere in MJ

## Next Steps

1. **Review and approve** this proposal
2. **Update v3 schema** to use these tables
3. **Create TypeScript interfaces** for type safety
4. **Build service layer** for common operations
5. **Document patterns** for team training

## Questions for Discussion

1. Should RecordLink support many-to-many with a separate junction table?
2. Should AccessControlRule support deny rules (explicit denial)?
3. Do we need cascade delete handling for RecordLink?
4. Should we add a Priority field to AccessControlRule for rule precedence?
5. Should we track view counts or last accessed times?

---

*This proposal is part of the MemberJunction v3 Conversations initiative. These generic components will benefit the entire platform beyond just the conversations feature.*