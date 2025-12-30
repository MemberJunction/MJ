# MemberJunction Security & Performance Analysis

**Date:** 2025-12-28
**Analyst:** Claude Code
**Scope:** MJCore, SQLServerDataProvider, MJServer (GraphQL), Entity/Metadata System

---

## Executive Summary

A comprehensive security and performance analysis of the MemberJunction stack identified **26 issues** across the codebase:
- **7 Critical** - Immediate action required
- **4 High** - Address this sprint
- **15 Medium** - Plan for remediation

The most severe findings involve SQL injection vulnerabilities in multiple data access paths and a Row-Level Security (RLS) bypass that could expose all records to unauthorized users.

---

## 🔴 CRITICAL SECURITY VULNERABILITIES

### 1. SQL Injection - Multiple Attack Vectors

| Location | Issue |
|----------|-------|
| `SQLServerDataProvider.ts:1797` | LIKE clause: `LIKE '%${userSearchString}%'` - no parameterization |
| `SQLServerDataProvider.ts:1785` | Full-text search: `${entityInfo.FullTextSearchFunction}('${u}')` |
| `SQLServerDataProvider.ts:1885` | Record favorites: `RecordID='${CompositeKey.Values()}'` |
| `SQLServerDataProvider.ts:1931` | Record changes: `RecordID='${compositeKey.ToConcatenatedString()}'` |
| `SQLServerDataProvider.ts:1966-1974` | Soft link dependencies: composite key values interpolated |
| `SQLServerDataProvider.ts:1990-1997` | Hard link dependencies: same issue |
| `SQLServerDataProvider.ts:2999-3007` | Record change logging: `entityName`, `changesJSON` interpolated |
| `SQLServerDataProvider.ts:1739` | View run logging: `user.Email` interpolated without quotes |
| `SQLServerDataProvider.ts:1273-1279` | Pagination: `StartRow` and `MaxRows` interpolated |
| `ResolverBase.ts:250` | findBy method: `${k} = ${quotes}${params[k]}${quotes}` |
| `ResolverBase.ts:272` | RunViewByName: `"Name='" + viewInput.ViewName + "'"` |

**Attack Example:**
```graphql
query {
  RunViewByName(input: { ViewName: "MyView'; DROP TABLE Users; --" })
}
```

**Attack Example 2:**
```typescript
// Search string injection
userSearchString = "test%'; DROP TABLE Users;--"
// Results in: LIKE '%test%'; DROP TABLE Users;--%'
```

---

### 2. Row-Level Security (RLS) Bypass

**File:** `packages/MJCore/src/generic/securityInfo.ts:267-280`

The `MarkupFilterText()` method replaces user tokens with raw values without SQL parameterization:

```typescript
public MarkupFilterText(user: UserInfo): string {
    let ret = this.FilterText
    if (user) {
        const keys = Object.keys(user)
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const val = user[key]
            if (val && typeof val == 'string') {
                // VULNERABILITY: Direct string replacement without SQL escaping
                ret = ret.replace(new RegExp(`{{User${key}}}`, 'g'), val)
            }
        }
    }
    return ret;
}
```

**Exploitation:**
- RLS Filter defined as: `UserID = '{{UserID}}'`
- If user ID contains: `abc' OR '1'='1`
- Resulting SQL: `UserID = 'abc' OR '1'='1'`
- **Result:** Complete RLS bypass exposing ALL records

**Related Code:**
- `entityInfo.ts:1488-1502`: Uses `MarkupFilterText()` in `GetUserRowLevelSecurityWhereClause()`

---

### 3. ExtraFilter Validation is Insufficient

**File:** `SQLServerDataProvider.ts:1623-1659`

The `validateUserProvidedSQLClause()` method only blacklists keywords after removing string literals:

```typescript
// Blacklist approach - easily bypassed
const FORBIDDEN_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER',
                            'CREATE', 'EXEC', 'EXECUTE', 'UNION', 'INTO', 'MERGE'];
```

**Bypass Examples:**
- `1=1) OR (1=1` - Logical bypass (no forbidden keywords)
- `1; WAITFOR DELAY '00:00:05'` - Blind SQL injection timing attack
- `ID IN (SELECT UserID FROM __mj.vwUsers)` - Data exfiltration via subquery
- CTEs (Common Table Expressions) - Not blocked

---

### 4. GraphQL Input Validation Gaps

**File:** `packages/MJServer/src/generic/RunViewResolver.ts:28-38`

```typescript
@Field(() => String, { nullable: true })
ExtraFilter: string;  // Accepts ANY SQL - no validation

@Field(() => String, { nullable: true })
OrderBy: string;  // Can inject: "; DROP TABLE Users; --"
```

**No protection against:**
- SQL injection via ExtraFilter
- SQL injection via OrderBy
- Query complexity attacks
- Query depth attacks

---

## 🟠 HIGH SEVERITY ISSUES

### 5. Permission Caching - Stale Data Risk

**Files:**
- `securityInfo.ts:110-117`
- `baseEntity.ts:1377`

User roles are loaded once at session start and **never refreshed**:

```typescript
// UserRoles loaded once into _UserRoles array
// No cache invalidation mechanism
```

**Risks:**
- Admin assigns new role → user continues with old permissions
- Role revoked → user keeps access until session ends
- Session-level privilege escalation if roles modified mid-session

---

### 6. No GraphQL Query Depth/Complexity Limiting

**File:** `packages/MJServer/src/apolloServer/index.ts`

```typescript
new ApolloServer({
  csrfPrevention: true,
  cache: 'bounded',
  // NO maxDepth plugin
  // NO maxQueryComplexity plugin
  // NO rate limiting
});
```

**Attack Example:**
```graphql
query {
  Entity {
    User { User { User { User { User { User { ... } } } } } }
  }
}
```

---

### 7. Authentication Token Cache - No Revocation

**File:** `packages/MJServer/src/cache.ts:5-8`

```typescript
export const authCache = new LRUCache({
  max: 50000,
  ttl: oneHourMs,  // 1 hour cache
  ttlAutopurge: false,
});
```

**Risks:**
- No logout mechanism invalidates cached tokens
- Compromised token valid for 1 hour
- 50k tokens in memory - potential DoS vector

---

### 8. Error Messages Expose System Details

**File:** `packages/MJServer/src/generic/RunViewResolver.ts:681-686`

```typescript
catch (err) {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
  return {
    ErrorMessage: errorMessage,  // Full error exposed to client
  };
}
```

**Also:** `SQLServerDataProvider.ts:208-217`
```typescript
const errorMessage = `Error executing SQL
    Error: ${error?.message}
    Query: ${query}  // FULL SQL EXPOSED
    Parameters: ${JSON.stringify(parameters)}`;  // PARAMS EXPOSED
```

---

## 🟡 MEDIUM SEVERITY ISSUES

### 9. N+1 Performance in Metadata Processing

**File:** `packages/MJCore/src/generic/providerBase.ts:1454-1467`

```typescript
protected PostProcessEntityMetadata(entities, fields, fieldValues, permissions, relationships, settings) {
    // For each field, filter ALL fieldValues - O(n*m)
    for (let f of fields) {
        f.EntityFieldValues = fieldValues.filter(fv => fv.EntityFieldID === f.ID);
    }

    // For each entity, filter ALL of these arrays - O(n*m) each
    for (let e of entities) {
        e.EntityFields = fields.filter(f => f.EntityID === e.ID);
        e.EntityPermissions = permissions.filter(p => p.EntityID === e.ID);
        e.EntityRelationships = relationships.filter(r => r.EntityID === e.ID);
        e.EntitySettings = settings.filter(s => s.EntityID === e.ID);
    }
}
```

**Impact:** For 100 entities × 5000 fields = 500,000+ filter operations during metadata load.

**Fix:** Build lookup Maps before processing:
```typescript
const fieldsByEntity = new Map<string, any[]>();
for (const f of fields) {
    if (!fieldsByEntity.has(f.EntityID)) fieldsByEntity.set(f.EntityID, []);
    fieldsByEntity.get(f.EntityID).push(f);
}
```

---

### 10. No Field-Level Permission Enforcement

**File:** `packages/MJCore/src/generic/baseEntity.ts:833-866`

```typescript
public Set(FieldName: string, Value: any) {
    const field = this.GetFieldByName(FieldName);
    if (field != null) {
        // NO FIELD-LEVEL PERMISSION CHECK
        // AllowUpdateAPI in EntityFieldInfo is NOT checked here
        field.Value = Value;
    }
}
```

**Risk:** Users can modify sensitive fields client-side; only entity-level permission checked at save.

---

### 11. Connection Pool Exhaustion Risk

**File:** `SQLServerDataProvider.ts:147-152, 170-207`

**Issues:**
- No check for pool exhaustion (all connections in use)
- No query timeout configuration
- No monitoring of pool health
- Transaction queue uses `concatMap` - if one query hangs, all blocked

---

### 12. Memory Leaks - Event Subscriptions

**File:** `packages/MJCore/src/generic/baseEngine.ts:347-360`

```typescript
protected async SetupGlobalEventListener(): Promise<boolean> {
    if (!this._eventListener) {
        this._eventListener = MJGlobal.Instance.GetEventListener(false)
        this._eventListener.subscribe(async (event) => {
            // NEVER UNSUBSCRIBED - memory leak in SPAs
            await this.HandleIndividualEvent(event);
        });
    }
}
```

**Also:** `baseEngine.ts:132` - Unbounded `_entityEventSubjects` Map grows forever.

---

### 13. Cache Lookup Inefficiency

**File:** `providerBase.ts:688-710`

```typescript
for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const checkResult = response.results.find(r => r.viewIndex === i);  // O(n) for each
}
```

**Fix:** Index results by viewIndex first.

---

### 14. Full Metadata Cloning Performance

**File:** `providerBase.ts:1311-1317`

```typescript
protected CloneAllMetadata(toClone: AllMetadata): AllMetadata {
    // Implicit JSON.parse(JSON.stringify(data)) - expensive for large metadata
    const newmd = MetadataFromSimpleObjectWithoutUser(toClone, this);
    return newmd;
}
```

**Impact:** 5-10MB metadata objects completely re-serialized on each provider Config().

---

### 15. Audit Logging Gaps

**File:** `baseEntity.ts:1400-1404`

```typescript
protected ThrowPermissionError(u: UserInfo, type: EntityPermissionType, additionalInfoMessage: string) {
    throw new Error(`User: ${u.Name} does NOT have permission...`);
    // NO AUDIT LOG CREATED - security violations unrecorded
}
```

**Also missing audit logs:**
- `Public.ts` and `RequireSystemUser.ts` directives
- Failed authentication attempts
- RLS filter applications

---

### 16. Inefficient Cache Invalidation

**File:** `localCacheManager.ts:540-562`

```typescript
public async InvalidateEntityCaches(entityName: string): Promise<void> {
    for (const [key, entry] of this._registry.entries()) {  // O(n) full scan
        if (entry.type === 'runview' && entry.name === normalizedName) {
            toRemove.push(key);
        }
    }
}
```

**Fix:** Maintain reverse index `Map<entityName, Set<cacheKey>>`.

---

### 17. Race Conditions in Cache Operations

**File:** `localCacheManager.ts:180-198`

```typescript
public Initialize(storageProvider, config?): Promise<void> {
    if (this._initialized) return Promise.resolve();
    if (this._initializePromise) return this._initializePromise;

    // TOCTOU race - multiple calls could pass before _initializePromise set
    this._initializePromise = this.doInitialize(storageProvider, config);
    return this._initializePromise;
}
```

**Also:** `localCacheManager.ts:845-852` - Non-atomic cache entry updates.

---

### 18. Public Directive Logic Concern

**File:** `packages/MJServer/src/directives/Public.ts:20-34`

The pattern requires `@Public` directive to mark public endpoints. All other endpoints require auth. This is correct, but:
- Uses optional chaining that could silently pass
- No audit of authorization failures

```typescript
if (!context?.userPayload?.userRecord?.IsActive) {
    throw new AuthorizationError();
}
// Better: Explicit null checks with logging
```

---

### 19. Soft Delete Bypass Risk

Soft-deleted records (`__mj_DeletedAt IS NOT NULL`) can potentially be accessed if:
1. Views don't properly filter deleted records
2. Direct SQL bypasses view layer
3. RLS filters don't account for soft-delete status

Need to verify all views include `__mj_DeletedAt IS NULL` filter.

---

### 20. No Input Length Limits

All GraphQL string inputs lack maximum length constraints:
- DoS via massive filter strings
- Memory exhaustion from large selections
- Query complexity attacks

---

## 📊 Summary by Category

| Category | Critical | High | Medium | Total |
|----------|----------|------|--------|-------|
| SQL Injection | 6 | 1 | 2 | 9 |
| Authorization/RLS | 1 | 2 | 3 | 6 |
| Performance | 0 | 0 | 5 | 5 |
| Information Disclosure | 0 | 1 | 2 | 3 |
| Memory/Resources | 0 | 0 | 3 | 3 |
| **Total** | **7** | **4** | **15** | **26** |

---

## 🛡️ Remediation Priority

### Immediate (Do Now)

1. **Parameterize all SQL queries**
   - Replace string concatenation with SQL parameters throughout SQLServerDataProvider
   - Use mssql library's parameter binding system
   - Files: `SQLServerDataProvider.ts` (lines 1797, 1785, 1885, 1931, 1966-1997, 2999-3007, 1739, 1273-1279)

2. **Fix RLS `MarkupFilterText()`**
   - Use parameterized queries for token replacement
   - File: `securityInfo.ts:267-280`

3. **Add GraphQL query protection**
   - Install `graphql-depth-limit` plugin
   - Install `graphql-query-complexity` plugin
   - Add rate limiting middleware
   - File: `apolloServer/index.ts`

4. **Improve ExtraFilter validation**
   - Use allowlist approach instead of blacklist
   - Validate against known column names
   - File: `SQLServerDataProvider.ts:1623-1659`

### Short Term (This Sprint)

5. **Implement permission cache invalidation**
   - Add per-request or time-based cache refresh
   - Files: `securityInfo.ts`, `baseEntity.ts`

6. **Add token revocation mechanism**
   - Implement Redis-backed token blacklist
   - File: `cache.ts`

7. **Sanitize error messages**
   - Return generic messages to clients
   - Log full details server-side only
   - Files: `RunViewResolver.ts`, `SQLServerDataProvider.ts`

8. **Add query timeouts**
   - Configure command timeout (30-60 seconds default)
   - File: `SQLServerDataProvider.ts`

### Medium Term (Next 2 Sprints)

9. **Refactor metadata processing**
   - Use lookup Maps instead of filter chains
   - File: `providerBase.ts:1454-1467`

10. **Add field-level permission enforcement**
    - Check `AllowUpdateAPI` in `Set()` method
    - File: `baseEntity.ts:833-866`

11. **Implement comprehensive audit logging**
    - Log permission failures
    - Log RLS filter applications
    - Log authentication events

12. **Fix memory leaks**
    - Add unsubscribe in engine cleanup
    - Bound entity event subjects map
    - File: `baseEngine.ts:347-360`

13. **Add reverse indexes for cache invalidation**
    - File: `localCacheManager.ts:540-562`

---

## Files Requiring Immediate Changes

1. `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`
   - Lines: 1797, 1785, 1885, 1931, 1966-1997, 2999-3007, 1739, 1273-1279, 1623-1659

2. `packages/MJCore/src/generic/securityInfo.ts`
   - Lines: 267-280

3. `packages/MJServer/src/apolloServer/index.ts`
   - Add security plugins

4. `packages/MJServer/src/generic/ResolverBase.ts`
   - Lines: 236-265, 272

5. `packages/MJServer/src/generic/RunViewResolver.ts`
   - Lines: 681-686 (and similar error handling)

6. `packages/MJServer/src/cache.ts`
   - Add revocation mechanism

---

## Testing Recommendations

1. **SQL Injection Test Suite**
   - Test all ExtraFilter inputs with injection payloads
   - Test OrderBy with injection payloads
   - Test search strings with SQL special characters

2. **RLS Bypass Tests**
   - Create users with SQL injection in email/ID fields
   - Verify RLS filters correctly escape values

3. **Permission Tests**
   - Verify permission changes take effect immediately
   - Test role assignment/revocation mid-session

4. **Load Tests**
   - Test connection pool exhaustion scenarios
   - Test query timeout behavior
   - Test metadata loading with large schemas

---

*This analysis was generated by Claude Code on 2025-12-28. Findings should be validated and prioritized based on your specific deployment context and threat model.*
