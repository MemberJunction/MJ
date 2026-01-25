# User Grid Defaults for Non-Saved Views

> **Status**: ✅ Implemented
> **Created**: 2026-01-10
> **Implemented**: 2026-01-10
> **Context**: entity-data-grid persistence for dynamic views

## Problem Statement

When a user is browsing an entity using a **dynamic view** (not a saved User View), they may still want their column preferences (widths, order, visibility) to persist across sessions. Previously:

- **Saved Views**: Grid state is persisted to `UserView.GridState` ✅
- **Dynamic Views**: Grid state was not persisted anywhere - lost on page refresh ❌

## Solution Implemented

Uses the existing `UserInfoEngine` (which already caches `MJ: User Settings`) to store per-entity grid defaults.

### Storage Schema

```typescript
// MJ: User Settings record structure
{
  UserID: string,                              // Current user
  Setting: `default-view-setting/${entityName}`,  // Entity-specific key
  Value: JSON.stringify({
    columnSettings: ViewGridColumnSetting[],
    sortSettings: ViewGridSortSetting[]
  })
}
```

### Implementation Details

#### 1. UserInfoEngine Enhancements

Added helper methods to `UserInfoEngine` for generic setting management:

```typescript
// Get a setting value by key
GetSetting(settingKey: string): string | undefined

// Get the full setting entity
GetSettingEntity(settingKey: string): UserSettingEntity | undefined

// Set a setting (creates or updates)
SetSetting(settingKey: string, value: string, contextUser?: UserInfo): Promise<boolean>

// Delete a setting
DeleteSetting(settingKey: string): Promise<boolean>
```

#### 2. entity-data-grid Changes

- **On load (dynamic view)**: Checks for user setting and applies saved column/sort state
- **On column/sort change**: Persists to user settings with debouncing (same delay as saved views)
- **Controlled by `autoPersistState`**: Uses existing input prop - no new prop needed

### Key Decisions Made

| Question | Decision |
|----------|----------|
| Feature Toggle | Uses existing `autoPersistState` prop (enabled by default) |
| Scope | Per-entity - any grid showing the entity uses these defaults |
| Engine | Uses existing `UserInfoEngine` (already caches user settings) |
| Format | Same `ViewGridState` structure as saved views |

## Flow

```
User opens entity grid (dynamic view)
    ↓
loadUserDefaultGridState() called
    ↓
UserInfoEngine.GetSetting(`default-view-setting/${entityName}`)
    ↓
If found → Apply columnSettings and sortSettings
    ↓
User resizes/reorders columns
    ↓
emitGridStateChanged() → userDefaultsPersistSubject.next()
    ↓
Debounced (500ms) → persistUserDefaultGridState()
    ↓
UserInfoEngine.SetSetting() → Saved to MJ: User Settings
```

## Files Changed

| File | Changes |
|------|---------|
| [UserInfoEngine.ts](../packages/MJCoreEntities/src/engines/UserInfoEngine.ts) | Added `GetSetting`, `GetSettingEntity`, `SetSetting`, `DeleteSetting` methods |
| [entity-data-grid.component.ts](../packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts) | Added `loadUserDefaultGridState`, `persistUserDefaultGridState`, debounce setup |

## Future Enhancements

1. **Reset to Defaults**: Add a "Reset to defaults" button in column chooser that calls `UserInfoEngine.DeleteSetting()`
2. **Context-specific Settings**: Allow parent components to pass a context key for different defaults per location
3. **Settings UI**: Expose user grid defaults in a settings panel for management
