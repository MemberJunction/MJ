# Golden Layout Integration Guide

## Overview

This prototype integrates **Golden Layout v2.6.0** with Angular 18 to provide professional tab management with drag-drop support. The implementation uses a **hybrid approach** that combines Golden Layout's powerful tab UI with Angular's routing system.

## Architecture

### Component Structure

```
┌─────────────────────────────────────────────┐
│ TabContainerComponent                       │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ Golden Layout Tab Bar (40px)            │ │
│ │ [Chat] [Contact: John] [Dashboard]  [×] │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ Content Area (flex: 1)                  │ │
│ │ <router-outlet></router-outlet>         │ │
│ │                                         │ │
│ │  (Active tab's content renders here)    │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Hybrid Rendering**
- **Golden Layout**: Manages tab bar UI, drag-drop, close buttons
- **Angular Router**: Handles content rendering in a single router-outlet
- **Why**: Avoids complexity of rendering multiple router-outlets while keeping Golden Layout benefits

**2. VirtualLayout API**
- Uses `VirtualLayout` instead of `GoldenLayout` for better Angular integration
- Implements `bindComponentEvent` and `unbindComponentEvent` callbacks
- Virtual components = minimal DOM overhead

**3. State Management**
- Tab state lives in `ShellService` (BehaviorSubject)
- Golden Layout syncs with ShellService bidirectionally
- Local storage persistence handled by ShellService

## Implementation Details

### Initialization

```typescript
private initializeGoldenLayout(): void {
  const container = this.layoutContainerRef.nativeElement;

  const config: LayoutConfig = {
    root: {
      type: 'row',
      content: []
    }
  };

  // Create VirtualLayout with bind/unbind callbacks
  this.layout = new VirtualLayout(
    container,
    this.bindComponentEvent.bind(this),
    this.unbindComponentEvent.bind(this)
  );

  this.layout.loadLayout(config);

  // Add existing tabs from ShellService
  const tabs = this.shellService['tabs$'].value;
  tabs.forEach((tab: TabState) => this.addTabToLayout(tab));
}
```

### Component Binding

Each tab is a Golden Layout component that:
1. Creates a hidden placeholder div (actual content is in router-outlet)
2. Sets the tab title
3. Handles `destroy` event → close tab in ShellService
4. Handles `show` event → navigate router to tab's route

```typescript
private bindComponentEvent(
  container: ComponentContainer,
  itemConfig: ResolvedComponentItemConfig
): ComponentContainer.BindableComponent {
  const state = itemConfig.componentState as TabComponentState;

  // Hidden element - Golden Layout needs this for tab UI
  const element = document.createElement('div');
  element.className = 'gl-tab-placeholder';
  element.style.display = 'none';

  // Set tab title
  container.setTitle(state.title);

  // Handle tab close
  container.on('destroy', () => {
    this.shellService.CloseTab(state.tabId);
  });

  // Handle tab focus → navigate router
  container.on('show', () => {
    this.shellService.SetActiveTab(state.tabId);
    this.router.navigate([state.route]);
  });

  return {
    component: element,
    virtual: true  // Virtual = minimal overhead
  };
}
```

### Adding Tabs

```typescript
private addTabToLayout(tab: TabState): void {
  const componentConfig: ComponentItemConfig = {
    type: 'component',
    componentType: 'RouterOutlet',
    componentState: {
      tabId: tab.Id,
      title: tab.Title,
      route: tab.Route
    },
    title: tab.Title
  };

  // Golden Layout places it in the tab bar
  this.layout.addComponent(
    componentConfig.componentType,
    componentConfig.componentState,
    componentConfig.title
  );
}
```

### Syncing with ShellService

```typescript
ngOnInit(): void {
  // Subscribe to tab changes
  this.subscriptions.push(
    this.shellService.GetTabs().subscribe(tabs => {
      if (this.isInitialized && this.layout) {
        this.updateLayout(tabs);  // Sync Golden Layout with new state
      }
    })
  );

  // Subscribe to active tab changes
  this.subscriptions.push(
    this.shellService.GetActiveTabId().subscribe(tabId => {
      if (tabId && this.layout) {
        this.focusTab(tabId);  // Activate correct tab in Golden Layout
      }
    })
  );
}
```

## Styling

### Global Styles

```scss
// Import Golden Layout CSS
@import 'golden-layout/dist/css/goldenlayout-base.css';
@import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
```

### Component Styles

```scss
.golden-layout-tabs {
  height: 40px;       // Fixed height for tab bar
  min-height: 40px;
  width: 100%;
  overflow: hidden;
}

.content-area {
  flex: 1;            // Fill remaining space
  overflow: auto;
  background: white;
}
```

## Features Implemented

✅ **Tab Management**
- Create tabs programmatically via `ShellService.OpenTab()`
- Close tabs via Golden Layout close button or `ShellService.CloseTab()`
- Switch tabs by clicking in tab bar

✅ **Drag & Drop**
- Reorder tabs by dragging them in the tab bar
- Visual feedback during drag operation
- Tab order persists (stored in ShellService)

✅ **State Persistence**
- All tab state stored in `ShellService`
- Saved to localStorage via `StorageService`
- Restored on page refresh

✅ **Multi-App Support**
- Tabs from different apps coexist in same tab bar
- Each tab tracks its owning app via `AppId`
- Apps request tabs via `IApp.RequestNewTab()`

## Features NOT Implemented

❌ **Split Panes**
- Would require multiple router-outlets
- Adds significant complexity
- Not needed for prototype goals

❌ **Pop-out Windows**
- Golden Layout supports this
- Requires window.open() handling
- Out of scope for prototype

❌ **Complex Layouts**
- Stacks, rows, columns beyond simple horizontal tabs
- Prototype focuses on tab bar only

## Testing the Integration

### Manual Testing Steps

1. **Start the prototype**:
   ```bash
   npm start
   ```

2. **Test basic tab operations**:
   - Initial "Chat" tab should appear
   - Click "Open Thread in New Tab" → Second tab appears
   - Click between tabs → Content switches correctly

3. **Test drag-drop**:
   - Drag "Chat" tab to the right
   - Tabs should reorder
   - Refresh page → Order persists

4. **Test close**:
   - Click × on any tab
   - Tab closes and is removed
   - ShellService state updates

5. **Test multi-app**:
   - Navigate to CRM app
   - Open contact in new tab
   - Navigate back to Conversations
   - Both app tabs visible in tab bar

### Expected Behavior

- Tab bar always visible at top (40px)
- Active tab highlighted
- Close button (×) on each tab
- Drag cursor when hovering over tab headers
- Smooth transitions when switching tabs
- Content area updates when active tab changes

## Troubleshooting

### Issue: Tabs not appearing
**Check**: Is VirtualLayout initialized?
```typescript
console.log('Layout initialized:', this.isInitialized);
console.log('Layout instance:', this.layout);
```

### Issue: Content not rendering
**Check**: Is router navigating?
```typescript
container.on('show', () => {
  console.log('Tab shown, navigating to:', state.route);
  this.router.navigate([state.route]);
});
```

### Issue: Drag-drop not working
**Check**: Golden Layout CSS imported?
```scss
@import 'golden-layout/dist/css/goldenlayout-base.css';
```

### Issue: Tabs duplicating on refresh
**Check**: ShellService.HasTabs() used?
```typescript
if (!this.shellService.HasTabs()) {
  this.shellService.OpenTab({ ... });
}
```

## Performance Considerations

**Virtual Components**: Using `virtual: true` minimizes DOM overhead
- Golden Layout creates lightweight tab UI
- No heavy component rendering in tabs themselves
- Content renders once in shared router-outlet

**Window Resize**: Handled efficiently
```typescript
window.addEventListener('resize', () => {
  if (this.layout) {
    const rect = container.getBoundingClientRect();
    this.layout.setSize(rect.width, rect.height);
  }
});
```

**Subscription Management**: All subscriptions cleaned up
```typescript
ngOnDestroy(): void {
  this.subscriptions.forEach(sub => sub.unsubscribe());
  if (this.layout) {
    this.layout.destroy();
  }
}
```

## Future Enhancements

### If Split Panes Needed
1. Use Angular CDK Portal system for multiple outlets
2. Create dynamic component containers per pane
3. Track active pane separately from active tab
4. Update router strategy for multi-pane navigation

### If Pop-outs Needed
1. Implement Golden Layout's `createPopout()` method
2. Handle window messaging between main and popout
3. Sync state across windows
4. Handle popout closure gracefully

### If Complex Layouts Needed
1. Allow users to save/load layout configurations
2. Provide UI for splitting panes
3. Handle nested stacks and rows
4. Serialize full layout structure to storage

## References

- [Golden Layout v2 Docs](https://golden-layout.github.io/golden-layout/)
- [VirtualLayout API](https://golden-layout.github.io/golden-layout/api/classes/VirtualLayout.html)
- [Angular Standalone Components](https://angular.io/guide/standalone-components)
- [RxJS BehaviorSubject](https://rxjs.dev/api/index/class/BehaviorSubject)

## Credits

Integration designed and implemented for the MJ Explorer UX prototype. Demonstrates how Golden Layout v2 can integrate with modern Angular applications while maintaining clean architecture and strong typing.
