# AccessControlRule Consolidation Proposal

## Executive Summary

After analyzing MemberJunction's existing permission tables, we've identified 4 distinct permission/ACL systems that could potentially be consolidated into the new `AccessControlRule` pattern. This document analyzes each system and provides recommendations for consolidation vs. retention.

## Current Permission Systems

### 1. EntityPermission
**Purpose**: Entity-level permissions controlling CRUD operations at the entity type level  
**Structure**:
- EntityID → Which entity type
- RoleID → Which role has permission
- CanCreate, CanRead, CanUpdate, CanDelete → CRUD permissions
- ReadRLSFilterID, CreateRLSFilterID, UpdateRLSFilterID, DeleteRLSFilterID → Row-level security filters

**Key Difference**: Controls access to entire entity types, not individual records

### 2. QueryPermission
**Purpose**: Controls which roles can execute specific queries  
**Structure**:
- QueryID → Which query
- RoleID → Which role can run it

**Key Difference**: Simple binary permission (can run or cannot run)

### 3. ResourcePermission
**Purpose**: Sharing specific resources (Views, Dashboards, Reports) with users or roles  
**Structure**:
- ResourceTypeID → Type of resource (View, Dashboard, Report)
- ResourceRecordID → Specific resource ID
- Type → 'User' or 'Role'
- UserID/RoleID → Who has access
- StartSharingAt/EndSharingAt → Time-bounded sharing

**Key Difference**: Already very similar to AccessControlRule pattern!

### 4. ConversationArtifactPermission
**Purpose**: User-specific permissions for conversation artifacts  
**Structure**:
- ConversationArtifactID → Which artifact
- UserID → Which user
- AccessLevel → 'Read', 'Edit', 'Owner'

**Key Difference**: Will be deprecated with v3 conversations

## Analysis: What to Convert vs. Keep

### ✅ STRONG CANDIDATES FOR CONVERSION

#### 1. **ResourcePermission** → AccessControlRule
**Why Convert**:
- Already follows record-level permission pattern
- Has ResourceTypeID + ResourceRecordID (maps to EntityID + RecordID)
- Time-bounded sharing maps to ExpiresAt
- Would benefit from granular CRUD permissions

**Migration Path**:
```sql
-- Current ResourcePermission
ResourceTypeID → EntityID (lookup entity for Dashboard, Report, View)
ResourceRecordID → RecordID
Type + UserID/RoleID → GranteeType + GranteeID
StartSharingAt → Not needed (permission effective immediately)
EndSharingAt → ExpiresAt

-- Add granular permissions based on current access patterns
-- All ResourcePermissions would get CanRead = 1
-- Owner resources would get all permissions
```

**Benefits**:
- Unified permission model
- More granular control (CRUD vs just access)
- Consistent with v3 patterns

#### 2. **ConversationArtifactPermission** → AccessControlRule
**Why Convert**:
- Being deprecated anyway with v3
- Already record-level permissions
- AccessLevel maps nicely to CRUD permissions

**Migration Path**:
```sql
-- During v3 migration
ConversationArtifactID → RecordID (with Artifact EntityID)
UserID → GranteeID (with GranteeType = 'User')
AccessLevel:
  'Read' → CanRead = 1
  'Edit' → CanRead = 1, CanUpdate = 1
  'Owner' → All permissions = 1
```

### ❌ KEEP SEPARATE (Don't Convert)

#### 1. **EntityPermission** - Keep Separate
**Why Keep**:
- **Different purpose**: Entity-type level, not record-level
- **RLS Integration**: Deep integration with Row Level Security filters
- **Performance**: Checked once per entity type, not per record
- **Established pattern**: Well-understood by existing code

**Recommendation**: Keep as the "schema-level" permission system while AccessControlRule handles "data-level" permissions

#### 2. **QueryPermission** - Keep Separate  
**Why Keep**:
- **Different scope**: Controls query execution, not data access
- **Simple model**: Binary permission works well
- **Different lifecycle**: Queries aren't "records" in the traditional sense

**Recommendation**: Keep as specialized permission for query execution

## Proposed Implementation Plan

### Phase 1: Immediate (v3 Launch)
1. **Implement AccessControlRule** for all new v3 entities (Artifacts, Collections, Projects)
2. **Migrate ConversationArtifactPermission** during v3 data migration
3. **Document** the distinction between entity-level and record-level permissions

### Phase 2: Next Quarter
1. **Pilot ResourcePermission migration** with one resource type (e.g., Dashboards)
2. **Build migration utilities** to convert ResourcePermission → AccessControlRule
3. **Create compatibility layer** so existing code continues to work

### Phase 3: Future
1. **Complete ResourcePermission migration** for all resource types
2. **Deprecate ResourcePermission** table
3. **Update** all resource sharing UIs to use AccessControlRule

## Benefits of Consolidation

### For ResourcePermission → AccessControlRule
✅ **Unified permission model** across platform  
✅ **Granular CRUD permissions** instead of binary access  
✅ **Consistent API** for all permission checks  
✅ **Simpler mental model** for developers  
✅ **Future-proof** for new resource types  

### Keep Separate Benefits
✅ **Specialized optimizations** remain in place  
✅ **No breaking changes** to existing code  
✅ **Clear separation** of concerns  
✅ **Gradual migration** reduces risk  

## Technical Considerations

### Query Performance
```sql
-- Current: Check ResourcePermission
SELECT 1 FROM ResourcePermission 
WHERE ResourceTypeID = @TypeID 
  AND ResourceRecordID = @RecordID
  AND UserID = @UserID

-- New: Check AccessControlRule (slightly more complex but indexed)
SELECT 1 FROM AccessControlRule
WHERE EntityID = @EntityID
  AND RecordID = @RecordID  
  AND CanRead = 1
  AND ((GranteeType = 'User' AND GranteeID = @UserID)
    OR (GranteeType = 'Role' AND GranteeID IN (SELECT RoleID FROM UserRole WHERE UserID = @UserID)))
```

### Migration Script Example
```sql
-- Migrate ResourcePermission to AccessControlRule
INSERT INTO AccessControlRule (
    EntityID,
    RecordID,
    GranteeType,
    GranteeID,
    CanRead,
    CanCreate,
    CanUpdate,
    CanDelete,
    CanShare,
    ExpiresAt,
    GrantedByUserID
)
SELECT 
    e.ID as EntityID,           -- Look up entity for resource type
    rp.ResourceRecordID,
    rp.Type as GranteeType,
    COALESCE(rp.UserID, rp.RoleID) as GranteeID,
    1 as CanRead,               -- All shared resources are readable
    0 as CanCreate,             -- Default no create
    CASE WHEN /* is owner */ THEN 1 ELSE 0 END as CanUpdate,
    CASE WHEN /* is owner */ THEN 1 ELSE 0 END as CanDelete,
    0 as CanShare,              -- Default no resharing
    rp.EndSharingAt as ExpiresAt,
    rp.SharedByUserID as GrantedByUserID
FROM ResourcePermission rp
INNER JOIN Entity e ON e.Name = 
    CASE rp.ResourceTypeID
        WHEN @DashboardTypeID THEN 'Dashboards'
        WHEN @ReportTypeID THEN 'Reports'
        WHEN @ViewTypeID THEN 'User Views'
    END
```

## Risk Assessment

### Low Risk (Do Now)
- ✅ New v3 entities using AccessControlRule
- ✅ ConversationArtifactPermission migration (being deprecated anyway)

### Medium Risk (Pilot First)
- ⚠️ ResourcePermission migration (active system, needs careful migration)

### High Risk (Don't Do)
- ❌ EntityPermission changes (core to entire security model)
- ❌ QueryPermission changes (different problem domain)

## Recommendation

1. **Proceed with AccessControlRule** for all v3 entities
2. **Migrate ConversationArtifactPermission** as part of v3
3. **Plan ResourcePermission migration** for Q2 2025
4. **Keep EntityPermission and QueryPermission** as specialized systems
5. **Document** the three-tier permission model:
   - **EntityPermission**: Schema-level (can you access this entity type?)
   - **AccessControlRule**: Record-level (can you access this specific record?)
   - **QueryPermission**: Execution-level (can you run this query?)

## Questions for Team Discussion

1. Should we add a "CanExecute" permission to AccessControlRule for future use?
2. Should ResourcePermission migration be prioritized higher?
3. Do we need backward compatibility views for ResourcePermission?
4. Should we create a unified permission checking service that abstracts all three systems?
5. How do we handle permission conflicts between EntityPermission and AccessControlRule?

## Next Steps

1. **Approve** this consolidation strategy
2. **Implement** AccessControlRule for v3
3. **Create** migration plan for ConversationArtifactPermission
4. **Design** compatibility layer for ResourcePermission
5. **Document** the unified permission architecture

---

*This proposal ensures we consolidate where it makes sense while preserving specialized systems that serve different purposes. The gradual migration approach minimizes risk while moving toward a more unified permission model.*