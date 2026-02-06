# Tab Strip Component

A lightweight and flexible Angular tab strip component for MemberJunction applications. This component provides a simple but powerful way to create tabbed interfaces with support for dynamic tabs, custom tab content, and tab management.

## Features

- **Simple API**: Easy to use and customize
- **Closeable Tabs**: Option to enable tab closing
- **Scrollable Tabs**: Automatically handles overflow with scrolling buttons
- **Event-driven**: Rich event system for tab selection and management
- **Context Menu Support**: Handle right-click events on tabs
- **Responsive Design**: Adapts to different screen sizes
- **Tab Navigation**: Methods for tab selection, scrolling, and visibility
- **Dynamic Content**: Support for dynamically changing tab content
- **Customizable**: Configure tab appearance and behavior
- **Lightweight**: Minimal dependencies and overhead
- **Tab Visibility**: Hide/show tabs dynamically
- **Fill Container**: Optional width/height fill of parent container

## Installation

```bash
npm install @memberjunction/ng-tabstrip
```

## Usage

### Import the Module

```typescript
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';

@NgModule({
  imports: [
    MJTabStripModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<mj-tabstrip
  [SelectedTabIndex]="selectedTab"
  (TabSelected)="onTabSelected($event)"
  (BeforeTabClosed)="onBeforeTabClosed($event)">
  
  <!-- Tab headers -->
  <mj-tab [Name]="'Overview'" [TabCloseable]="false">Overview</mj-tab>
  <mj-tab [Name]="'Details'" [TabCloseable]="true">Details</mj-tab>
  <mj-tab [Name]="'Settings'" [TabCloseable]="true">Settings</mj-tab>
  
  <!-- Tab bodies -->
  <mj-tab-body>
    <h2>Overview Content</h2>
    <p>This is the overview tab content...</p>
  </mj-tab-body>
  
  <mj-tab-body>
    <h2>Details Content</h2>
    <p>This is the details tab content...</p>
  </mj-tab-body>
  
  <mj-tab-body>
    <h2>Settings Content</h2>
    <p>This is the settings tab content...</p>
  </mj-tab-body>
</mj-tabstrip>
```

### Dynamic Tabs Example

```typescript
import { Component } from '@angular/core';
import { TabEvent, TabCancelableEvent, TabClosedEvent } from '@memberjunction/ng-tabstrip';

@Component({
  selector: 'app-dynamic-tabs',
  template: `
    <div class="tab-container">
      <button (click)="addNewTab()">Add Tab</button>
      
      <mj-tabstrip
        [SelectedTabIndex]="selectedTabIndex"
        (TabSelected)="onTabSelected($event)"
        (BeforeTabClosed)="onBeforeTabClosed($event)"
        (TabClosed)="onTabClosed($event)"
        #tabStrip>
        
        <mj-tab 
          *ngFor="let tab of tabs" 
          [Name]="tab.name"
          [TabCloseable]="tab.closeable"
          [Visible]="tab.visible"
          [ID]="tab.id">
          {{tab.title}}
        </mj-tab>
        
        <mj-tab-body *ngFor="let tab of tabs">
          <div class="tab-content">
            <h3>{{tab.title}} Content</h3>
            <p>{{tab.content}}</p>
            <button (click)="updateTabContent(tab.id)">Update Content</button>
          </div>
        </mj-tab-body>
      </mj-tabstrip>
    </div>
  `,
  styles: [`
    .tab-container {
      height: 500px;
      border: 1px solid #ccc;
      padding: 10px;
    }
    .tab-content {
      padding: 20px;
    }
  `]
})
export class DynamicTabsComponent {
  selectedTabIndex = 0;
  
  tabs = [
    { 
      id: 1, 
      name: 'home', 
      title: 'Home', 
      content: 'Welcome to the home tab', 
      closeable: false,
      visible: true 
    },
    { 
      id: 2, 
      name: 'reports', 
      title: 'Reports', 
      content: 'View your reports here', 
      closeable: true,
      visible: true 
    },
    { 
      id: 3, 
      name: 'settings', 
      title: 'Settings', 
      content: 'Configure your settings', 
      closeable: true,
      visible: true 
    }
  ];
  
  nextTabId = 4;
  
  addNewTab() {
    const newTab = {
      id: this.nextTabId++,
      name: `tab-${Date.now()}`,
      title: `New Tab ${this.nextTabId-1}`,
      content: `This is the content for new tab ${this.nextTabId-1}`,
      closeable: true,
      visible: true
    };
    
    this.tabs.push(newTab);
    // Need to wait for next tick to select the new tab
    setTimeout(() => {
      this.selectedTabIndex = this.tabs.length - 1;
    });
  }
  
  updateTabContent(tabId: number) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.content = `Updated content at ${new Date().toLocaleTimeString()}`;
    }
  }
  
  onTabSelected(event: TabEvent) {
    console.log('Tab selected:', event.index, event.tab?.Name);
  }
  
  onBeforeTabClosed(event: TabCancelableEvent) {
    // Optionally prevent closing specific tabs
    if (event.tab?.Name === 'important-tab') {
      event.cancel = true;
      alert('This tab cannot be closed!');
    }
  }
  
  onTabClosed(event: TabClosedEvent) {
    // Remove the tab from our array
    const index = this.tabs.findIndex(t => t.id === event.tab?.ID);
    if (index >= 0) {
      this.tabs.splice(index, 1);
      // Signal that we're done processing
      event.done();
    }
  }
}
```

## API Reference

### MJTabStripComponent

The main component that contains and manages the tabs.

#### Inputs

- `SelectedTabIndex`: number - The index of the selected tab
- `FillWidth`: boolean - Whether the tab strip should fill its container width (default: true)
- `FillHeight`: boolean - Whether the tab strip should fill its container height (default: true)
- `ScrollAmount`: number - Pixels to scroll when using scroll buttons (default: 150)

#### Outputs

- `BeforeTabSelected`: EventEmitter<TabCancelableEvent> - Fires before a tab is selected
- `TabSelected`: EventEmitter<TabEvent> - Fires when a tab is selected
- `BeforeTabClosed`: EventEmitter<TabCancelableEvent> - Fires before a tab is closed
- `TabClosed`: EventEmitter<TabClosedEvent> - Fires when a tab is closed
- `TabContextMenu`: EventEmitter<TabContextMenuEvent> - Fires when a tab is right-clicked
- `TabScrolled`: EventEmitter<void> - Fires when the tab strip is scrolled
- `ResizeContainer`: EventEmitter<void> - Fires when the tab strip suggests a container resize

#### Methods

- `SelectTabByName(tabName: string): MJTabComponent | undefined` - Selects a tab by its name and returns the tab if found
- `GetTabByName(tabName: string): MJTabComponent | undefined` - Gets a tab component by its name
- `CloseTab(tabIndex: number): Promise<void>` - Closes a tab by its index (async)
- `scrollLeft(): void` - Scrolls the tab strip to the left by 150 pixels (note: currently ignores ScrollAmount input)
- `scrollRight(): void` - Scrolls the tab strip to the right by 150 pixels (note: currently ignores ScrollAmount input)
- `scrollIntoView(tabIndex: number): void` - Scrolls to make a specific tab visible
- `RefreshTabs(): void` - Refreshes the tab strip after dynamic changes

#### Properties

- `Tabs`: MJTabComponent[] - Array of tab components
- `TabBodies`: MJTabBodyComponent[] - Array of tab body components

### MJTabComponent

Represents a tab header in the tab strip.

#### Inputs

- `Name`: string - The name of the tab (used for finding tabs by name)
- `ID`: any - Custom identifier for the tab
- `Props`: any - Additional properties to associate with the tab
- `TabCloseable`: boolean - Whether the tab can be closed (default: false)
- `Visible`: boolean - Whether the tab is visible (default: true)
- `TabSelected`: boolean - Whether the tab is selected (managed by the tab strip)

#### Methods

- `selectTab(): void` - Selects this tab
- `closeTab(event: MouseEvent): void` - Closes this tab
- `handleContextMenu(event: MouseEvent): void` - Handles context menu events

#### Properties

- `TabStrip`: MJTabStripComponent - Reference to the parent tab strip component

### MJTabBodyComponent

Represents the content area for a tab.

#### Inputs

- `TabVisible`: boolean - Whether the tab body is visible (managed by the tab strip)
- `FillWidth`: boolean - Whether the tab body should fill its container width (default: true)
- `FillHeight`: boolean - Whether the tab body should fill its container height (default: true)

### Event Types

#### TabEvent

Base event type for tab operations.

- `index`: number - The index of the tab
- `tab`: MJTabComponent - Reference to the tab component
- `body`: MJTabBodyComponent - Reference to the tab body component

#### TabCancelableEvent

Event type that allows cancellation of an operation.

- All properties from TabEvent
- `cancel`: boolean - Set to true to cancel the operation

#### TabClosedEvent

Event type for tab closure.

- All properties from TabEvent
- `newTabIndex`: number - The suggested new tab index after closing
- `done`: (error?: any) => {} - Callback that must be called when processing is complete

#### TabContextMenuEvent

Event type for context menu events.

- All properties from TabEvent
- `mouseEvent`: MouseEvent - The original mouse event

## Advanced Usage

### Tab Visibility Management

You can dynamically hide/show tabs while maintaining their state:

```typescript
// Hide a tab
const tab = this.tabStrip.GetTabByName('settings');
if (tab) {
  tab.Visible = false; // Tab will be hidden but not removed
}

// Show it again
tab.Visible = true;
```

Note: Hidden tabs cannot be selected. If a selected tab is hidden, the tab strip will automatically select the first visible tab.

### Programmatic Tab Management

```typescript
@ViewChild('tabStrip') tabStrip!: MJTabStripComponent;

// Select a specific tab
this.tabStrip.SelectedTabIndex = 2;

// Or by name
this.tabStrip.SelectTabByName('reports');

// Close a tab programmatically
await this.tabStrip.CloseTab(1);

// Ensure a tab is visible in the viewport
this.tabStrip.scrollIntoView(5);
```

### Error Handling

The component throws errors in these scenarios:

- Attempting to select a non-visible tab
- Invalid tab index in CloseTab method
- Selecting a tab by name that doesn't exist (returns undefined)

Always check for tab existence when working with dynamic tabs:

```typescript
const tab = this.tabStrip.SelectTabByName('dynamicTab');
if (!tab) {
  console.error('Tab not found');
}
```

## Styling

The component includes basic CSS that can be customized to match your application's design. The tab strip uses Font Awesome icons for the scroll buttons (fa-caret-left and fa-caret-right).

### CSS Classes

- `.tabstrip-container` - Main container element
- `.tab-header-outer` - Outer container for tab headers
- `.tab-header-inner` - Inner scrollable container for tabs
- `.tab-scroll-button` - Base class for scroll buttons
- `.tab-scroll-button-left` - Left scroll button
- `.tab-scroll-button-right` - Right scroll button
- `.tab-bodies` - Container for tab content

## Dependencies

- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@memberjunction/ng-container-directives`: For container directives
- `tslib`: ^2.3.0

## Build and Development

This package uses Angular CLI for building:

```bash
npm run build
```

The package is configured with:
- TypeScript compilation via `ngc`
- No side effects for better tree-shaking
- Proper peer dependencies for Angular 21+

## Integration with MemberJunction

This tab strip component is designed to work seamlessly with other MemberJunction packages and follows the same patterns and conventions used throughout the MJ ecosystem. It's particularly useful in:

- MJ Explorer application
- Dashboard interfaces
- Multi-view forms
- Configuration screens
- Any interface requiring tabbed navigation

## License

ISC