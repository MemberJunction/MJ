# UUID Comparison Guide for MemberJunction

## The Problem: UUID Case Sensitivity Across Database Platforms

MemberJunction supports both **SQL Server** and **PostgreSQL** as database backends. These platforms handle UUID casing differently:

| Database   | UUID Return Format | Example |
|-----------|-------------------|---------|
| SQL Server | **UPPERCASE** | `A1B2C3D4-E5F6-7890-ABCD-EF1234567890` |
| PostgreSQL | **lowercase** | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |

Both formats represent the **same UUID** and are semantically identical. However, JavaScript's `===` operator performs a **case-sensitive** string comparison, which means:

```typescript
// This FAILS when comparing UUIDs from different database platforms
'A1B2C3D4-E5F6-7890-ABCD-EF1234567890' === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
// Result: false  (WRONG!)
```

This breaks any code that uses `===` or `!==` to compare UUID values — lookups fail silently, filters return empty results, and data appears missing.

## The Solution: `UUIDsEqual()` and `NormalizeUUID()`

MemberJunction provides two utility functions in `@memberjunction/global` that handle cross-platform UUID comparison correctly:

### `UUIDsEqual(uuid1, uuid2): boolean`

Case-insensitive comparison of two UUID strings. Handles null/undefined gracefully.

```typescript
import { UUIDsEqual } from '@memberjunction/global';

// Cross-platform comparison works correctly
UUIDsEqual('A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
           'a1b2c3d4-e5f6-7890-abcd-ef1234567890')  // true

// Null safety
UUIDsEqual(null, null)        // true
UUIDsEqual(null, 'some-id')   // false
```

### `NormalizeUUID(uuid): string`

Normalizes a UUID to lowercase for use in `Set`, `Map`, or other data structures that need consistent key formatting.

```typescript
import { NormalizeUUID } from '@memberjunction/global';

NormalizeUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')
// Returns: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

NormalizeUUID(null)  // Returns: ''
```

## Usage Patterns

### Pattern 1: Finding an item by ID (`.find()`)

```typescript
// WRONG - breaks with cross-platform UUIDs
const server = this._Servers.find(s => s.ID === serverId);

// CORRECT
import { UUIDsEqual } from '@memberjunction/global';
const server = this._Servers.find(s => UUIDsEqual(s.ID, serverId));
```

### Pattern 2: Filtering by a foreign key (`.filter()`)

```typescript
// WRONG
const userApps = allUserApps.filter(ua => ua.UserID === userId);

// CORRECT
const userApps = allUserApps.filter(ua => UUIDsEqual(ua.UserID, userId));
```

### Pattern 3: Checking existence (`.some()`)

```typescript
// WRONG
const exists = items.some(item => item.ID === targetId);

// CORRECT
const exists = items.some(item => UUIDsEqual(item.ID, targetId));
```

### Pattern 4: Negated comparison (`!==`)

```typescript
// WRONG
const others = items.filter(item => item.ID !== excludeId);

// CORRECT
const others = items.filter(item => !UUIDsEqual(item.ID, excludeId));
```

### Pattern 5: Set/Map operations

`Set.has()` and `Map.get()` use strict equality internally, so you must normalize UUIDs before inserting or looking up:

```typescript
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

// WRONG - Set uses === internally
const idSet = new Set(items.map(i => i.ID));
idSet.has(lookupId);  // fails if cases differ

// CORRECT - Normalize on insert AND lookup
const idSet = new Set(items.map(i => NormalizeUUID(i.ID)));
idSet.has(NormalizeUUID(lookupId));  // always works
```

### Pattern 6: Angular template bindings

In Angular inline templates, you cannot call imported functions directly. Add helper methods to the component class:

```typescript
// In the component class:
import { UUIDsEqual } from '@memberjunction/global';

export class MyComponent {
  selectedId: string | null = null;

  IsSelected(itemId: string): boolean {
    return this.selectedId != null && UUIDsEqual(this.selectedId, itemId);
  }
}

// In the template:
// WRONG:  [class.selected]="item.ID === selectedId"
// CORRECT: [class.selected]="IsSelected(item.ID)"
```

### Pattern 7: Conditional assignment / toggle

```typescript
// WRONG
this.selectedId = this.selectedId === itemId ? null : itemId;

// CORRECT
this.selectedId = (this.selectedId != null && UUIDsEqual(this.selectedId, itemId))
  ? null
  : itemId;
```

## When You Do NOT Need `UUIDsEqual()`

Not every `.ID ===` comparison involves UUIDs. These patterns are safe with `===`:

- **Numeric IDs**: Integer primary keys (`number` type) are not affected
- **String literal comparisons**: `status === 'Active'`, `type === 'Report'`
- **Comparing to `null`/`undefined`**: `item.ID == null` is fine
- **Within-transaction comparisons**: If both values come from the same query result and haven't been cached, they'll have the same case

## Why This Matters

Even if you're currently developing against only one database platform, using `UUIDsEqual()` is important because:

1. **Future-proofing**: MemberJunction is designed to support multiple database backends. Code that works on SQL Server today should work on PostgreSQL tomorrow without changes.

2. **Cached data mixing**: GraphQL data providers cache entity metadata. If a user switches backends behind the same endpoint, stale cached data with one case can be compared against fresh data with the opposite case.

3. **External integrations**: UUIDs may arrive from external systems (APIs, webhooks, MCP servers) in any case format. Robust comparison prevents silent failures.

4. **Silent failures are costly**: A `===` comparison that returns `false` for matching UUIDs doesn't throw an error — it silently returns no results. These bugs are extremely difficult to diagnose in production.

## Automated Enforcement

### Static Analysis Test

The file `packages/MJGlobal/src/__tests__/UUIDCompliance.test.ts` contains a static analysis test that scans all `packages/` source files for remaining `.ID ===` patterns that should use `UUIDsEqual()`. Run it with:

```bash
cd packages/MJGlobal && npx vitest run
```

If you have a legitimate `.ID ===` comparison that doesn't involve UUIDs (e.g., a numeric ID), add it to the `KNOWN_EXCEPTIONS` map in that test file.

### Cross-Database Integration Tests

The file `packages/MJCoreEntities/src/__tests__/UUIDCrossDbCompliance.test.ts` verifies that engine lookup methods (e.g., `GetServerById`, `GetKeyByID`, `GetAccountById`) work correctly with mixed-case UUIDs. Each test stores data with one case and looks it up with the opposite case, simulating a cross-database scenario.

## Quick Reference

| Instead of... | Use... |
|--------------|--------|
| `a.ID === b.ID` | `UUIDsEqual(a.ID, b.ID)` |
| `a.ID !== b.ID` | `!UUIDsEqual(a.ID, b.ID)` |
| `items.find(x => x.ID === id)` | `items.find(x => UUIDsEqual(x.ID, id))` |
| `items.filter(x => x.UserID === uid)` | `items.filter(x => UUIDsEqual(x.UserID, uid))` |
| `items.some(x => x.ID === id)` | `items.some(x => UUIDsEqual(x.ID, id))` |
| `new Set(ids); set.has(id)` | `new Set(ids.map(NormalizeUUID)); set.has(NormalizeUUID(id))` |
| Template: `item.ID === selectedId` | Add component method using `UUIDsEqual()` |

## Import

Both functions are exported from `@memberjunction/global`:

```typescript
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
```

Source: [packages/MJGlobal/src/util/UUIDUtils.ts](../packages/MJGlobal/src/util/UUIDUtils.ts)
