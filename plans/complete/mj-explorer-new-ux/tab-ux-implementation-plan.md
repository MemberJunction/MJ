# Tab UX Implementation Plan

## Session Goals
Implement progressive tab visibility with Shift+Click behavior and smart component caching.

---

## Phase 1: Progressive Tab Visibility (PRIORITY)

### 1.1 Core Infrastructure
- [ ] Add `shouldShowTabs` computed property to workspace-state-manager
  - Returns `false` if only 1 tab AND no pinned tabs
  - Returns `true` if 2+ tabs OR any pinned tabs
- [ ] Add `tabBarVisible$` BehaviorSubject to workspace-state-manager
- [ ] Emit tab bar visibility changes when tab count/pin status changes

### 1.2 Template Updates
- [ ] Update shell.component.html to conditionally show Golden Layout tab bar
- [ ] Add CSS transitions for smooth show/hide of tab bar
- [ ] Ensure content area expands to full height when tabs hidden

### 1.3 Layout Adjustments
- [ ] Modify golden-layout-manager to support hidden tab bar mode
- [ ] Ensure single-tab content uses full available height
- [ ] Test layout calculations with/without tab bar

---

## Phase 2: Shift+Click Behavior (PRIORITY)

### 2.1 Event Handling Infrastructure
- [ ] Update app-nav.component to capture MouseEvent on nav item clicks
- [ ] Pass `forceNewTab` flag (from shiftKey) in navItemClick event
- [ ] Update shell.component to handle `forceNewTab` parameter

### 2.2 Workspace Manager Updates
- [ ] Add `OpenTabForced()` method that always creates new tab (never replaces temporary)
- [ ] Update `OpenTab()` to respect `forceNew` option parameter
- [ ] Ensure new tab is created even if matching resource already exists

### 2.3 Centralized Navigation Service
- [ ] Create `NavigationService` in explorer-core/services
- [ ] Add `OpenApp(appId: string, options?: NavigationOptions)` method
- [ ] Add `OpenNavItem(appId: string, navItem: NavItem, options?: NavigationOptions)` method
- [ ] Add `OpenEntityRecord(entityName: string, recordId: string, options?: NavigationOptions)` method
- [ ] Port legacy `OpenEntityRecord` functionality from old code
- [ ] Implement global shift-key detection in NavigationService
- [ ] All navigation methods check shift key state automatically

### 2.4 NavigationOptions Interface
```typescript
interface NavigationOptions {
  forceNewTab?: boolean;      // Override shift-key detection
  pinTab?: boolean;           // Create as pinned tab
  focusTab?: boolean;         // Focus after creation (default: true)
  replaceActive?: boolean;    // Replace currently active tab
}
```

---

## Phase 3: Auto-Hide Animations (PRIORITY)

### 3.1 CSS Transitions
- [ ] Add smooth opacity + max-height transitions to tab bar
- [ ] Add smooth height transition to content area
- [ ] Test animation performance (should be <200ms)

### 3.2 Animation Timing
- [ ] Coordinate tab bar hide with content area expand
- [ ] Ensure no jank or flicker during transition
- [ ] Test on different screen sizes

### 3.3 User Feedback
- [ ] (Optional) Add one-time tooltip: "💡 Hold Shift while clicking to open in new tab"
- [ ] Show tooltip only once per user
- [ ] Store in localStorage or user preferences

---

## Phase 4: Deep Linking Support

### 4.1 URL Parameter Handling
- [ ] Parse `?tab=id` query parameters on app load
- [ ] Restore multiple tabs if multiple `?tab=` params present
- [ ] Auto-show tab bar if URL specifies 2+ tabs

### 4.2 URL Syncing
- [ ] Update URL when active tab changes
- [ ] Support browser back/forward navigation
- [ ] Preserve tab state in browser history

---

## Phase 5: Smart Component Caching (DEFERRED)

### 5.1 ComponentCacheManager Class
- [x] Create ComponentCacheManager helper class
- [ ] Integrate into TabContainerComponent
- [ ] Add cache key generation based on resource identity
- [ ] Implement component storage with metadata

### 5.2 Cache Operations
- [ ] Implement `createAndAttachComponent()` method
- [ ] Implement `reattachComponent()` for cached components
- [ ] Implement `detachAndCacheComponent()` for preservation
- [ ] Add manual `clearCache()` method (no periodic cleanup)

### 5.3 Integration with Tab Lifecycle
- [ ] Update `loadTabContent()` to check cache first
- [ ] Update `syncTabsWithConfiguration()` to use detach instead of destroy
- [ ] Update `cleanupTabComponent()` to detach when appropriate
- [ ] Test component reuse when switching nav items

### 5.4 Cache Management
- [ ] Add cache statistics method for debugging
- [ ] Add cache clear on user logout
- [ ] Add cache clear on app switch (optional)

---

## Phase 6: Tab Interaction Enhancements (DEFERRED)

### 6.1 Double-Click to Pin
- [ ] Add double-click event listener to tab elements
- [ ] Call `ToggleTabPermanent()` on double-click
- [ ] Update tab styling immediately (italic ↔ normal)
- [ ] Prevent tab bar from hiding if last tab is pinned

### 6.2 Right-Click Context Menu
- [ ] Implement context menu component/service
- [ ] Add "Pin Tab" / "Unpin Tab" option
- [ ] Add "Close Tab" option
- [ ] Position menu at mouse coordinates
- [ ] Close menu on outside click

### 6.3 Pin Icon Display
- [ ] Add pin icon (fa-thumbtack) to pinned tabs
- [ ] Position icon in tab header (replace close button area)
- [ ] Rotate icon 45° for visual effect
- [ ] Add click handler on pin icon to unpin

### 6.4 Tab Styling
- [ ] Italic font for temporary (unpinned) tabs
- [ ] Normal font for pinned tabs
- [ ] App color accent on tab (CSS variable)
- [ ] Hover states and transitions

---

## Phase 7: Width Fixes (COMPLETED ✓)

- [x] Remove padding from Golden Layout container (0px instead of 20px)
- [x] Remove padding from tab-content-wrapper
- [x] Remove padding from execution-monitoring component
- [x] Remove padding from system-configuration component
- [x] Set all containers to width: 100%, overflow: hidden
- [x] Build dashboards package
- [x] Build base-application package
- [x] Build explorer-core package

---

## Phase 8: Testing & Polish

### 8.1 Functional Testing
- [ ] Test tab visibility toggle (1 tab vs 2+ tabs)
- [ ] Test Shift+Click creates new tab
- [ ] Test normal click replaces temporary tab
- [ ] Test pinned tabs prevent tab bar from hiding
- [ ] Test component caching (no reload on tab switch)
- [ ] Test deep links with multiple tabs
- [ ] Test context menu (right-click)
- [ ] Test double-click to pin/unpin

### 8.2 Edge Cases
- [ ] Test closing all but one tab (should hide tab bar)
- [ ] Test creating second tab (should show tab bar)
- [ ] Test Shift+Click on already active tab (should no-op)
- [ ] Test navigation with all pinned tabs
- [ ] Test browser back/forward with tabs

### 8.3 Performance
- [ ] Verify smooth animations (<200ms)
- [ ] Verify no memory leaks from cached components
- [ ] Verify no jank during tab transitions
- [ ] Check cache statistics during normal use

### 8.4 Cross-Browser
- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari
- [ ] Test in Edge

---

## Implementation Order

### Sprint 1: Progressive Tabs (THIS SESSION)
1. Phase 1: Progressive Tab Visibility ⭐ **START HERE**
2. Phase 2: Shift+Click Behavior ⭐
3. Phase 3: Auto-Hide Animations ⭐
4. Phase 4: Deep Linking Support

### Sprint 2: Component Caching (NEXT SESSION)
5. Phase 5: Smart Component Caching
6. Phase 6: Tab Interaction Enhancements

### Sprint 3: Polish (NEXT SESSION)
7. Phase 8: Testing & Polish

---

## Files to Modify

### Phase 1-4 (Current Session)
- `/packages/Angular/Explorer/explorer-core/src/lib/services/navigation.service.ts` (NEW)
- `/packages/Angular/Explorer/explorer-core/src/lib/services/navigation.interfaces.ts` (NEW)
- `/packages/Angular/Explorer/base-application/src/lib/workspace-state-manager.ts`
- `/packages/Angular/Explorer/base-application/src/lib/golden-layout-manager.ts`
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.html`
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.scss`
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/components/header/app-nav.component.ts`
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/components/header/app-nav.component.html`

### Phase 5-6 (Next Session)
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/component-cache-manager.ts` (EXISTS)
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts`
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.html`
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.css`

---

## Success Criteria

### Must Have (Phase 1-4)
- ✅ Tab bar hidden when only 1 tab and no pinned tabs
- ✅ Tab bar shown when 2+ tabs OR any pinned tabs
- ✅ Shift+Click creates new tab instead of replacing
- ✅ Normal click replaces temporary tab as before
- ✅ Smooth animations (<200ms) when showing/hiding tabs
- ✅ NavigationService centralizes all navigation logic
- ✅ Deep links with multiple tabs work correctly

### Nice to Have (Phase 5-6)
- ✅ Component state preserved when switching tabs (caching)
- ✅ Double-click to pin/unpin tabs
- ✅ Right-click context menu with Pin/Close
- ✅ Pin icon displayed on pinned tabs
- ✅ One-time tooltip hint for Shift+Click

### Performance Targets
- Tab bar show/hide: <200ms
- Tab creation: <100ms
- Component reuse (cached): <50ms
- No memory leaks over 1 hour session
- Smooth 60fps animations

---

## Notes
- Keep legacy `componentRefs` map for backward compatibility during Phase 5
- Don't show tooltip more than once per user
- Ensure URL updates don't trigger unnecessary tab reloads
- Test with large numbers of tabs (10+) for performance
