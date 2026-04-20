# Home App Dynamic Nav Items Plan

**Status**: PLANNING (Not yet implemented)

## Overview

Enhance the Home application with:
1. **Static nav items**: "Apps", "Favorites" (defined in metadata)
2. **Dynamic resource nav item**: Shows currently selected orphan resource with appropriate icon/name

## Design Decisions (Finalized)

### 1. Dynamic Nav Item Matching
- Dynamic nav items can define a **custom matching function** to determine if they should be highlighted
- This provides more flexibility than simple route/label matching
- Matching function receives the active tab configuration and returns boolean

### 2. Resource Type Icons
- Icons for dynamic nav items should come from the **ResourceTypes entity**
- Do NOT hardcode icon mapping in code - use the existing metadata
- ResourceTypes entity already has Icon field for each resource type

### 3. Apps Gallery
- **Use current Home dashboard** as the Apps Gallery - no need to create a new component
- The existing Home dashboard already shows app cards

### 4. Favorites/Recents
- **Study existing Data Explorer implementation** - Favorites/Recents already exists there
- Reuse or extend the existing implementation rather than creating from scratch
- Data Explorer's favorites component can be studied at the relevant component files

### 5. GetNavItems() Reactivity
- `GetNavItems()` should be called when:
  - App changes (switching applications)
  - Nav item is clicked/selected
- This allows dynamic items to update based on current state

### 6. Home App Ordering
- Set `DefaultSequence: -1` to ensure Home is always first in the app list
- Negative sequence ensures it sorts before apps with sequence 0 or higher

## Current Architecture

### Nav Item Matching Logic (app-nav.component.ts:78-90)
```typescript
isActive(item: NavItem): boolean {
  const config = this.workspaceManager.GetConfiguration();
  const activeTab = config.tabs.find(t => t.id === config.activeTabId);
  if (activeTab && activeTab.applicationId === this.app.ID) {
    // Match by route OR label
    return (item.Route && activeTab.configuration['route'] === item.Route) ||
           activeTab.title === item.Label;
  }
  return false;
}
```

### BaseApplication.GetNavItems()
- Returns cached `DefaultNavItems` from JSON string
- Subclasses can override for dynamic behavior

## Implementation Plan

### Part 1: Static Nav Items for Home App

Update `/metadata/applications/.home-application.json`:
```json
{
  "fields": {
    "Name": "Home",
    "Description": "Your personalized home screen with quick access to all applications",
    "Icon": "fa-solid fa-home",
    "DefaultForNewUser": true,
    "Color": "#2196f3",
    "DefaultSequence": -1,  // Changed from 0 to ensure Home is always first
    "Status": "Active",
    "NavigationStyle": "Both",
    "TopNavLocation": "Left of App Switcher",
    "HideNavBarIconWhenActive": true,
    "DefaultNavItems": "[{\"Label\":\"Apps\",\"Icon\":\"fa-solid fa-grid-2\",\"ResourceType\":\"Custom\",\"DriverClass\":\"AppsGalleryResource\",\"isDefault\":true},{\"Label\":\"Favorites\",\"Icon\":\"fa-solid fa-star\",\"ResourceType\":\"Custom\",\"DriverClass\":\"FavoritesResource\"}]"
  }
}
```

**Note**: Apps gallery should reuse the existing Home dashboard. Favorites/Recents should study and reuse the Data Explorer implementation.

### Part 2: HomeApplication Subclass

Create `/packages/Angular/Explorer/dashboards/src/Home/home-application.ts`:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseApplication, NavItem, WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { Metadata } from '@memberjunction/core';

@RegisterClass(BaseApplication, 'HomeApplication')
export class HomeApplication extends BaseApplication {
  private workspaceManager: WorkspaceStateManager | null = null;

  /**
   * Inject WorkspaceStateManager for dynamic nav item generation
   */
  public SetWorkspaceManager(manager: WorkspaceStateManager): void {
    this.workspaceManager = manager;
  }

  /**
   * Returns nav items including dynamic resource item for active tab
   */
  override GetNavItems(): NavItem[] {
    const staticItems = super.GetNavItems(); // Apps, Favorites

    // Get dynamic nav item for currently active resource tab
    const dynamicItem = this.getDynamicResourceNavItem();
    if (dynamicItem) {
      return [...staticItems, dynamicItem];
    }

    return staticItems;
  }

  /**
   * Gets icon for a resource type from the ResourceTypes entity (metadata-driven)
   */
  private getResourceTypeIcon(resourceTypeName: string): string {
    const md = new Metadata();
    const resourceTypes = md.ResourceTypes;
    const resourceType = resourceTypes.find(rt => rt.Name === resourceTypeName);
    return resourceType?.Icon || 'fa-solid fa-file';
  }

  /**
   * Creates a dynamic nav item for the currently active orphan resource tab
   */
  private getDynamicResourceNavItem(): NavItem | null {
    if (!this.workspaceManager) return null;

    const config = this.workspaceManager.GetConfiguration();
    if (!config?.activeTabId) return null;

    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    if (!activeTab || activeTab.applicationId !== this.ID) return null;

    // Only create dynamic nav item for resource tabs (not Apps/Favorites)
    const resourceType = activeTab.configuration?.['resourceType'];
    if (!resourceType) return null;

    // Don't create dynamic nav item if it matches a static nav item
    const staticItems = super.GetNavItems();
    const matchesStatic = staticItems.some(
      item => item.Label === activeTab.title ||
              (item.Route && activeTab.configuration?.['route'] === item.Route)
    );
    if (matchesStatic) return null;

    // Create dynamic nav item matching the active tab
    // Icon comes from ResourceTypes entity (metadata-driven)
    return {
      Label: activeTab.title,
      Icon: this.getResourceTypeIcon(resourceType),
      ResourceType: resourceType,
      RecordID: activeTab.resourceRecordId,
      Configuration: activeTab.configuration,
      // Custom matching function for dynamic items
      isActive: (tab: any) => tab.resourceRecordId === activeTab.resourceRecordId,
      isDynamic: true
    } as NavItem & { isDynamic: boolean; isActive: (tab: any) => boolean };
  }
}
```

### Part 3: Update App Nav Component

Modify the `isActive` logic to support custom matching functions:

```typescript
isActive(item: NavItem): boolean {
  const config = this.workspaceManager.GetConfiguration();
  if (!config || !this.app) return false;

  const activeTab = config.tabs.find(t => t.id === config.activeTabId);
  if (activeTab && activeTab.applicationId === this.app.ID) {
    // Check if nav item has a custom matching function (for dynamic items)
    const itemWithMatcher = item as NavItem & { isActive?: (tab: any) => boolean };
    if (itemWithMatcher.isActive && typeof itemWithMatcher.isActive === 'function') {
      return itemWithMatcher.isActive(activeTab);
    }

    // Standard matching: route or label
    return (item.Route && activeTab.configuration['route'] === item.Route) ||
           activeTab.title === item.Label;
  }
  return false;
}
```

**Note**: The `isActive` function on nav items provides computed matching, allowing dynamic items to define their own logic.

### Part 4: AppsGalleryResource Component

**Decision**: Reuse the existing Home dashboard for Apps Gallery. The current Home dashboard already displays app cards and handles navigation.

No new component needed - just wire the nav item to open the existing Home dashboard.

### Part 5: FavoritesResource Component

**Decision**: Study and reuse the existing Data Explorer implementation for Favorites/Recents.

**TODO before implementation:**
1. Examine Data Explorer's favorites/recents components
2. Identify reusable code vs what needs extension
3. Consider whether to extract shared favorites service

## Matching Logic Enhancement

The key insight: **the dynamic nav item should show the name of the currently selected resource and use the appropriate icon**.

### Current Matching (Problem)
- Matches by `Route` or `Label`
- Dynamic items don't have routes
- Label matching works but needs the nav item to exist first

### Enhanced Matching (Solution)
1. `GetNavItems()` is called when app changes or nav item is clicked
2. Dynamic nav items include an `isActive(tab)` function for custom matching
3. Icons are retrieved from **ResourceTypes entity** (metadata-driven, not hardcoded)

### Icon Source
Icons come from the ResourceTypes entity's `Icon` field. This is already populated with appropriate icons for each resource type:
- Records, User Views, Dashboards, Reports, Queries, etc.

**Do NOT hardcode icon mappings** - always use the metadata.

## Files to Create/Modify

### New Files
1. `packages/Angular/Explorer/dashboards/src/Home/home-application.ts` - HomeApplication subclass
2. `packages/Angular/Explorer/dashboards/src/Home/apps-gallery-resource.component.ts` - Apps gallery
3. `packages/Angular/Explorer/dashboards/src/Home/favorites-resource.component.ts` - Favorites/Recents

### Modified Files
1. `metadata/applications/.home-application.json` - Add DefaultNavItems, change DefaultSequence to -1
2. `packages/Angular/Explorer/explorer-core/src/lib/shell/components/header/app-nav.component.ts` - Enhanced matching
3. `packages/Angular/Explorer/base-application/src/lib/base-application.ts` - Add WorkspaceStateManager injection hook
4. `packages/Angular/Explorer/dashboards/src/module.ts` - Register new components
5. `packages/Angular/Explorer/dashboards/src/public-api.ts` - Export new components

## Implementation Order

1. **Phase 1**: Static nav items (Apps, Favorites) - Update Home app metadata
2. **Phase 2**: Create AppsGalleryResource component (basic app list)
3. **Phase 3**: Create FavoritesResource component (favorites + recents UX)
4. **Phase 4**: HomeApplication subclass with dynamic nav item
5. **Phase 5**: Enhanced nav item matching in app-nav.component.ts
6. **Phase 6**: Polish and testing

## UX Considerations

### Dynamic Nav Item Behavior
- Only appears when an orphan resource tab is selected
- Shows the resource name (e.g., "Users - ABC123", "Sales Dashboard")
- Uses appropriate icon based on resource type
- Clicking it selects that tab (if multiple orphan tabs, shows most recent)
- **Does NOT show a count** - just the current resource

### Favorites/Recents UX Ideas
- Drag-and-drop reordering of favorites
- Quick pin/unpin with star icon
- Smart recent ordering (frequency + recency)
- Resource type filters
- Search/filter within favorites
- Grouped by resource type with collapsible sections
