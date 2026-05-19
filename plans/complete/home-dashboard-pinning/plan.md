# Home Dashboard Pinning Feature

## Overview

Expand the Home dashboard from a simple app launcher into a personalized command center where users can **pin any resource** (dashboards, views, queries, reports, records, custom app resources) for instant one-click access. Pinned items display as visual cards with optional screenshot thumbnails, organized into user-defined groups, and are fully reorderable.

## Design Principles

1. **Pin anything** — Any resource visible anywhere in the system can be pinned to Home
2. **Visual recognition** — Screenshot thumbnails make pins instantly recognizable
3. **Zero migration** — Store all pin data in UserSettings JSON (no new DB entities)
4. **NavigationService only** — Home dashboard never touches routing directly
5. **Mobile-first responsive** — Full functionality on all screen sizes
6. **No duplicates** — System prevents pinning the same resource twice

---

## Data Model

### Storage

Pins are stored as a JSON blob in `MJ: User Settings` via `UserInfoEngine`:

- **Setting Key**: `__HomeApp.PinnedItems`
- **Value**: `JSON.stringify(HomeAppPinnedItem[])`

The `__HomeApp.` prefix follows the pattern established by `__ACTION_DASHBOARD__` for dashboard-specific settings, and avoids collisions with other setting keys.

### Interface

```typescript
/**
 * A pinned item on the Home dashboard.
 * Stored as JSON array in UserSettings key '__HomeApp.PinnedItems'.
 */
interface HomeAppPinnedItem {
  /** Client-generated UUID */
  Id: string;

  /** User-editable display name (defaults to tab title at pin time) */
  DisplayName: string;

  /** Optional user-editable subtitle */
  Description?: string;

  /** FA icon class override. Null = auto-resolve from entity/app metadata */
  Icon?: string;

  /** Hex color override. Null = derive from source app's Color */
  Color?: string;

  /** MJ resource type: "Dashboards", "User Views", "Reports", "Queries", "Records", "Custom" */
  ResourceType: string;

  /** Source app ID (null = orphan / Home context) */
  ApplicationID?: string;

  /** Source app name for display badge ("AI", "CRM", etc.) */
  ApplicationName?: string;

  /** Full TabConfiguration blob — everything needed to re-open the resource */
  Configuration: Record<string, unknown>;

  /** Base64 JPEG thumbnail screenshot (~5-15KB at 0.2x scale). Null = use icon fallback */
  Thumbnail?: string;

  /** Display order within group (0-based) */
  Sequence: number;

  /** Optional group name for organizing pins. Null = ungrouped (shown first) */
  Group?: string;

  /** ISO timestamp of when this was pinned */
  PinnedAt: string;
}
```

### Size Estimation

- Per pin without thumbnail: ~500 bytes (Configuration JSON + metadata)
- Per pin with thumbnail: ~8-15KB (JPEG at 0.2x scale, 60% quality)
- 50 pins with thumbnails: ~500KB-750KB — well within `nvarchar(MAX)` limits
- UserSettings debounced save prevents excessive DB writes

### Group Model

Groups are **flat** (no hierarchy) and **implicit** — they're just string labels on each pin. The UI groups pins by their `Group` value and renders group headers. No separate group entity needed.

- Ungrouped pins (`Group` is null/undefined) render first, before any named groups
- Groups are ordered by the lowest `Sequence` value of their member pins
- Users create groups by typing a name when editing a pin or dragging a pin onto "New Group"
- Empty groups disappear automatically (no orphan group cleanup needed)

---

## UI Design

### Home Dashboard Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Good morning, Sarah                                     [⚡]    │
│  Monday, March 31                                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📌 Pinned                                        [+ Add] [Edit] │
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ [thumbnail]│ │ [thumbnail]│ │ [thumbnail]│ │  📊        │   │
│  │            │ │            │ │            │ │  (icon)    │   │
│  │ Sales Dash │ │ Active     │ │ Q1 Revenue │ │ Budget     │   │
│  │ 📊 AI App  │ │ 📋 CRM     │ │ 📈 Finance │ │ 🔍 Queries │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│                                                                  │
│  ── Analytics ──────────────────────────────────────────────     │
│  ┌────────────┐ ┌────────────┐                                  │
│  │ [thumbnail]│ │ [thumbnail]│                                  │
│  │ Monthly KPI│ │ Team Perf  │                                  │
│  │ 📊 Admin   │ │ 📊 Admin   │                                  │
│  └────────────┘ └────────────┘                                  │
│                                                                  │
│  📱 Your Applications                                            │
│  ┌──────────────────────┐ ┌──────────────────────┐              │
│  │ 🤖 AI                │ │ 🧭 Data Explorer     │              │
│  │ Administration...    │ │ Explore data...      │              │
│  └──────────────────────┘ └──────────────────────┘              │
│                                                                  │
│  🕐 Recent                                                       │
│  Sales Dashboard · Active Contacts · Q1 Report · John Doe       │
└──────────────────────────────────────────────────────────────────┘
```

### Pin Card Design

Each pin card has two visual modes:

**With Thumbnail:**
```
┌──────────────────┐
│  ┌──────────────┐│
│  │  [screenshot]││  ← 16:9 aspect ratio thumbnail
│  │              ││
│  └──────────────┘│
│  Sales Dashboard  │  ← DisplayName (bold, truncated)
│  📊 AI App        │  ← Resource type icon + App badge
└──────────────────┘
```

**Without Thumbnail (icon fallback):**
```
┌──────────────────┐
│                   │
│     📊            │  ← Large icon, tinted background from app Color
│                   │
│  Budget Query     │  ← DisplayName
│  🔍 Data Explorer │  ← Resource type icon + App badge
└──────────────────┘
```

**Icon Fallback Resolution:**
1. If `Icon` is set on pin → use it
2. Dashboard → `fa-solid fa-gauge-high`
3. User View → entity icon from metadata (e.g., `fa-solid fa-users` for Contacts view)
4. Query → `fa-solid fa-database`
5. Report → `fa-solid fa-chart-bar`
6. Record → entity icon from metadata
7. Custom → app icon
8. Final fallback → `fa-solid fa-thumbtack`

### Pin Card Hover State

On hover, a subtle overlay appears with a quick-action bar:
```
┌──────────────────┐
│  ┌──────────────┐│
│  │ [screenshot] ││
│  │    [Open]    ││  ← Semi-transparent overlay with "Open" button
│  └──────────────┘│
│  Sales Dashboard ⋯│  ← "⋯" menu appears on hover
│  📊 AI App        │
└──────────────────┘
```

The "⋯" menu offers: **Edit**, **Move to Group**, **Unpin**

### Edit Mode

Triggered by clicking "Edit" button in the Pinned section header.

```
┌──────────────────────────────────────────────────────────────────┐
│  📌 Pinned                                              [Done]   │
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ ≡  ✕       │ │ ≡  ✕       │ │ ≡  ✕       │ │            │   │
│  │ [thumbnail]│ │ [thumbnail]│ │ [thumbnail]│ │   + Add    │   │
│  │ Sales Dash │ │ Active     │ │ Q1 Revenue │ │    Pin     │   │
│  │ [tap name] │ │ [tap name] │ │ [tap name] │ │            │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│                                                                  │
│  ── Analytics ── [rename] [✕ remove group] ─────────────────     │
│  ┌────────────┐ ┌────────────┐                                  │
│  │ ≡  ✕       │ │ ≡  ✕       │                                  │
│  │ [thumbnail]│ │ [thumbnail]│                                  │
│  │ Monthly KPI│ │ Team Perf  │                                  │
│  └────────────┘ └────────────┘                                  │
└──────────────────────────────────────────────────────────────────┘

≡ = drag handle (reorder within group or across groups)
✕ = remove pin
[tap name] = click to edit DisplayName inline
```

**Edit Mode Features:**
- Drag-to-reorder within and across groups (using Kendo Sortable or native HTML DnD)
- Click pin name to edit inline
- X button to unpin
- Group headers become editable (rename, delete group)
- "+ Add Pin" card appears at the end of each group / ungrouped section

### Add Pin Slide-In Panel

Clicking "+ Add Pin" opens a slide-in panel from the right (same position as existing Quick Access sidebar):

```
┌──────────────────────────────────┐
│  Add Pin                    [✕]  │
│  ────────────────────────────    │
│  🔍 [Search resources...    ]   │
│                                  │
│  📊 Dashboards                   │
│  ┌──────────────────────────┐   │
│  │ 📊 Sales Dashboard       │   │  ← Already pinned items
│  │    AI App · ✓ Pinned     │   │     show check mark
│  ├──────────────────────────┤   │
│  │ 📊 ERD                   │   │
│  │    Admin App · [+ Pin]   │   │
│  ├──────────────────────────┤   │
│  │ 📊 System Overview       │   │
│  │    Admin App · [+ Pin]   │   │
│  └──────────────────────────┘   │
│                                  │
│  📋 Views                        │
│  ┌──────────────────────────┐   │
│  │ 📋 Active Contacts       │   │
│  │    CRM App · ✓ Pinned    │   │
│  ├──────────────────────────┤   │
│  │ 📋 Open Tickets          │   │
│  │    Support App · [+ Pin] │   │
│  └──────────────────────────┘   │
│                                  │
│  🔍 Queries                      │
│  ...                             │
│                                  │
│  📈 Reports                      │
│  ...                             │
└──────────────────────────────────┘
```

**Panel Behavior:**
- Search filters across all resource types
- Results grouped by resource type
- Already-pinned items show a checkmark (cannot be added again)
- Clicking "[+ Pin]" immediately adds the pin and shows the checkmark
- Optional: assign to a group during add
- Panel closes on "✕" or clicking outside

### Duplicate Prevention

Before adding a pin, check existing pins for a match:
```typescript
function isPinned(resourceType: string, config: Record<string, unknown>): boolean {
  return pins.some(pin => {
    if (pin.ResourceType !== resourceType) return false;
    // Match by the identifying field for the resource type
    switch (resourceType) {
      case 'Dashboards': return pin.Configuration['dashboardId'] === config['dashboardId'];
      case 'User Views': return pin.Configuration['viewId'] === config['viewId'];
      case 'Queries': return pin.Configuration['queryId'] === config['queryId'];
      case 'Reports': return pin.Configuration['reportId'] === config['reportId'];
      case 'Records': return pin.Configuration['Entity'] === config['Entity']
                          && pin.Configuration['recordId'] === config['recordId'];
      case 'Custom': return pin.Configuration['driverClass'] === config['driverClass']
                        && pin.Configuration['appId'] === config['appId']
                        && pin.Configuration['navItemName'] === config['navItemName'];
      default: return false;
    }
  });
}
```

---

## Pin Entry Points

### 1. Tab Right-Click Context Menu (Golden Layout Mode)

Add "Pin to Home" to the existing context menu in `tab-container.component.ts`:

```
┌───────────────────────────┐
│ 📌 Pin Tab                │  ← Existing: pin tab in workspace
│ ─────────────────────────-│
│ 🏠 Pin to Home            │  ← NEW: pin resource to Home dashboard
│ ─────────────────────────-│
│ ✕  Close Tab              │
│ ☐  Close Others           │
│ »  Close to Right         │
└───────────────────────────┘
```

- **"Pin to Home"** reads the right-clicked tab's `WorkspaceTab.configuration`
- If already pinned → shows "Pinned to Home ✓" (disabled, with checkmark)
- On click: creates pin, captures thumbnail, shows toast "Pinned to Home"
- The tab-container emits an event; the shell/service handles persistence

### 2. User Avatar Menu (All Modes)

Add "Pin to Home" to the user menu via the `BaseUserMenu` plugin system:

```
┌───────────────────────────┐
│  Sarah Johnson            │
│  sarah@company.com        │
│ ─────────────────────────-│
│ 👤 My Profile             │
│ 🏠 Pin to Home            │  ← NEW: pins current active resource
│ ─────────────────────────-│
│ 🎨 Theme           [Dark] │
│ 🔄 Reset Layout           │
│ ─────────────────────────-│
│ 🚪 Sign Out               │
└───────────────────────────┘
```

- Works in **both** single-resource mode and golden layout mode
- Reads the **active tab's** `WorkspaceTab.configuration` from the shell
- Disabled when on the Home dashboard itself (nothing to pin)
- Shows "Pinned to Home ✓" if current resource is already pinned
- On click: creates pin, captures thumbnail, shows toast

### 3. Home Dashboard Add Panel

The slide-in panel (described above) allows browsing and searching all available resources to pin them without navigating away from Home.

---

## Screenshot Capture

### Library

Add `html2canvas` as a dependency to `@memberjunction/ng-explorer-core` (the explorer-core package). This is where the tab-container and shell live, making it the natural place for capture logic.

### Capture Flow

```typescript
import html2canvas from 'html2canvas';

async captureTabThumbnail(tabContentElement: HTMLElement): Promise<string | undefined> {
  try {
    const canvas = await html2canvas(tabContentElement, {
      scale: 0.2,               // 1920x1080 → 384x216
      useCORS: true,
      logging: false,
      backgroundColor: null,
      width: tabContentElement.clientWidth,
      height: tabContentElement.clientHeight
    });
    return canvas.toDataURL('image/jpeg', 0.6);  // ~5-15KB
  } catch (error) {
    console.warn('Thumbnail capture failed, using icon fallback:', error);
    return undefined;
  }
}
```

### When Capture Happens

- Capture is triggered **at pin creation time** (not continuously)
- The tab content DOM element is accessed via the Golden Layout component container or the single-resource direct container
- Capture is **async and non-blocking** — if it fails, pin still saves with icon fallback
- Users can retake thumbnails from edit mode (opens the resource, captures, returns)

### Known Limitations

- Cross-origin iframes (e.g., embedded external content) will render blank in the thumbnail
- Canvas-based content (Kendo charts) may need `allowTaint: true`
- Very large DOM trees may be slow to capture — we cap at 2 seconds timeout

---

## Navigation: How Pins Open Resources

The Home dashboard component calls NavigationService methods exclusively:

```typescript
onPinClick(pin: HomeAppPinnedItem): void {
  const config = pin.Configuration;

  switch (pin.ResourceType) {
    case 'Dashboards':
      this.navigationService.OpenDashboard(
        config['dashboardId'] as string,
        pin.DisplayName
      );
      break;

    case 'User Views':
      if (config['isDynamic']) {
        this.navigationService.OpenDynamicView(
          config['Entity'] as string,
          config['extraFilter'] as string | undefined
        );
      } else {
        this.navigationService.OpenView(
          config['viewId'] as string,
          pin.DisplayName
        );
      }
      break;

    case 'Reports':
      this.navigationService.OpenReport(
        config['reportId'] as string,
        pin.DisplayName
      );
      break;

    case 'Queries':
      this.navigationService.OpenQuery(
        config['queryId'] as string,
        pin.DisplayName
      );
      break;

    case 'Records':
      const compositeKey = this.buildCompositeKey(
        config['Entity'] as string,
        config['recordId'] as string
      );
      this.navigationService.OpenEntityRecord(
        config['Entity'] as string,
        compositeKey
      );
      break;

    case 'Custom':
      this.navigationService.OpenNavItemByName(
        config['navItemName'] as string,
        config as Record<string, unknown>,
        config['appId'] as string
      );
      break;
  }
}
```

---

## Data Explorer App Change

Reorder the Data Explorer `DefaultNavItems` from: Dashboards, Data, Queries
To: **Data, Queries, Dashboards**

Rationale: Users BUILD dashboards in Data Explorer. Users who have dashboards shared with them can pin them to Home for quick access. Data exploration and query building are the primary activities.

**File**: `metadata/applications/.data-explorer-application.json`

---

## Service Architecture

### HomeAppPinService

A new Angular service in the `explorer-core` package (or `ng-shared`) that encapsulates all pin operations:

```typescript
@Injectable({ providedIn: 'root' })
export class HomeAppPinService {
  // Observable of current pins (for reactive UI)
  public readonly Pins$: BehaviorSubject<HomeAppPinnedItem[]>;

  // Load pins from UserSettings
  async LoadPins(): Promise<void>;

  // Add a new pin (returns false if duplicate)
  async AddPin(pin: Omit<HomeAppPinnedItem, 'Id' | 'Sequence' | 'PinnedAt'>): Promise<boolean>;

  // Remove a pin by ID
  async RemovePin(pinId: string): Promise<void>;

  // Update pin properties (name, description, icon, group)
  async UpdatePin(pinId: string, updates: Partial<HomeAppPinnedItem>): Promise<void>;

  // Reorder pins (accepts full reordered array)
  async ReorderPins(pins: HomeAppPinnedItem[]): Promise<void>;

  // Check if a resource is already pinned
  IsPinned(resourceType: string, config: Record<string, unknown>): boolean;

  // Build a pin from a WorkspaceTab (used by context menu and avatar menu)
  async BuildPinFromTab(tab: WorkspaceTab, thumbnail?: string): Promise<HomeAppPinnedItem>;

  // Capture thumbnail from tab content element
  async CaptureThumbnail(contentElement: HTMLElement): Promise<string | undefined>;
}
```

All mutations call `UserInfoEngine.Instance.SetSettingDebounced('__HomeApp.PinnedItems', ...)` for persistence.

---

## Implementation Phases

### Phase 1: Core Infrastructure
1. Define `HomeAppPinnedItem` interface
2. Create `HomeAppPinService` with load/save/CRUD operations
3. Add `html2canvas` dependency to explorer-core
4. Implement thumbnail capture utility

### Phase 2: Home Dashboard UI
1. Add Pinned section to Home dashboard (above apps grid)
2. Pin card component with thumbnail/icon modes
3. Group rendering with headers
4. Click-to-navigate via NavigationService
5. Hover overlay with quick actions (edit, move, unpin)

### Phase 3: Pin Entry Points
1. Add "Pin to Home" to tab right-click context menu
2. Add "Pin to Home" to user avatar menu
3. Duplicate detection at both entry points
4. Toast notifications on pin/unpin

### Phase 4: Pin Management
1. Edit mode toggle (reorder, rename, delete)
2. Drag-to-reorder (Kendo Sortable or native DnD)
3. Inline name editing
4. Group management (create, rename, delete, drag between)
5. Add Pin slide-in panel with search

### Phase 5: Polish
1. Data Explorer nav item reordering
2. Responsive design for all breakpoints
3. Empty state when no pins
4. Keyboard accessibility
5. Animation/transitions

---

## Responsive Behavior

| Breakpoint | Pin Grid | Behavior |
|---|---|---|
| Desktop (>1200px) | 4-5 columns | Full thumbnail cards, hover effects |
| Tablet (992-1200px) | 3-4 columns | Slightly smaller cards |
| Small tablet (768-992px) | 2-3 columns | Compact cards |
| Mobile (< 768px) | 2 columns | Minimal cards, touch-friendly |
| Extra small (< 480px) | 1-2 columns | List-like compact view |

Pin cards use `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))` for fluid responsiveness.

Edit mode on mobile uses long-press for drag (native mobile DnD) and swipe-to-delete as alternative to X button.

---

## Mockups

See the companion HTML mockup files in this directory:

- **`mockup-home-dashboard.html`** — Full Home dashboard with pinned items, groups, thumbnail/icon cards, apps grid, and recents row
- **`mockup-pin-management.html`** — Edit mode with drag-to-reorder, inline editing, group management, and Add Pin slide-in panel
- **`mockup-pin-entry-points.html`** — Tab right-click context menu and user avatar menu with "Pin to Home"
- **`mockup-mobile.html`** — Mobile responsive views of all the above

Open these files in a browser to see the interactive mockups.
