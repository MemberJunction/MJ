# @memberjunction/ng-hierarchy-tree

A modern, high-performance, interactive visual hierarchy and organizational chart component for Angular and MemberJunction applications.

Built on top of D3 layout engines, `--mj-*` design tokens, and MemberJunction's metadata layer, this component visualizes any self-referencing entity hierarchy with smooth pan/zoom, collapsible sub-branches, live path search, subtree focus, drag-and-drop reparenting, and cancelable before/after lifecycle events.

---

## 🚀 Features

- **Metadata Driven**: Automatically binds to any MemberJunction entity with a self-referencing foreign key (`ParentID`, `ParentCategoryID`, `ParentAccountID`, etc.) and seamlessly handles single and composite primary keys.
- **Interactive Canvas**: Smooth D3-powered pan and zoom, mousewheel scaling, auto-fit to container, and compact toolbar controls.
- **Collapsible Subtrees**: Interactive `[+]` / `[-]` badges displaying both direct child counts and total descendant subtree volume.
- **Instant Search & Path Expansion**: Real-time keyword filter that matches node titles and subtitles, highlights matching cards, and automatically expands all ancestor branches up to the root.
- **Subtree Focus**: Isolate any node as a temporary root to inspect deep or complex branches with 1-click return to the full hierarchy.
- **Cancelable Before/After Event System**: Full programmatic control with `BeforeNodeExpand`, `AfterNodeExpand`, `BeforeNodeCollapse`, `AfterNodeCollapse`, `BeforeReparent`, and `AfterReparent`.
- **Theme Reactive**: Styled with standard `--mj-*` CSS design tokens for dark and light modes.
- **Direct Record Navigation**: Integrates with `RecordNavigationEvent` for opening detail records in MemberJunction Explorer tabs.

---

## 📦 Installation & Setup

Import `HierarchyTreeComponent` (standalone) or `HierarchyTreeModule` into your Angular component:

```typescript
import { Component } from '@angular/core';
import { HierarchyTreeComponent, HierarchyTreeConfig, HierarchyNodeEvent } from '@memberjunction/ng-hierarchy-tree';
import { FormNavigationEvent } from '@memberjunction/ng-base-forms';

@Component({
  selector: 'app-org-chart',
  standalone: true,
  imports: [HierarchyTreeComponent],
  template: `
    <mj-hierarchy-tree
      [Config]="treeConfig"
      (NodeClick)="onNodeClick($event)"
      (Navigate)="onNavigate($event)">
    </mj-hierarchy-tree>
  `
})
export class OrgChartComponent {
  public treeConfig: HierarchyTreeConfig = {
    EntityName: 'MJ_BizApps_Common: Organizations',
    ParentField: 'ParentID',
    SubtitleField: 'OrganizationType',
    DefaultIcon: 'fa-solid fa-building',
    DefaultColor: '#38bdf8',
    Height: '600px'
  };

  public onNodeClick(event: HierarchyNodeEvent): void {
    console.log('Node selected:', event.Node.Name);
  }

  public onNavigate(event: FormNavigationEvent): void {
    // Forward to NavigationService or Explorer FormComponent
  }
}
```

---

## ⚙️ Configuration Reference (`HierarchyTreeConfig`)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `EntityName` | `string` | **(Required)** | The MemberJunction entity name to visualize (e.g. `'MJ_BizApps_Orders: Product Categories'`). |
| `ParentField` | `string` | `'ParentID'` | Foreign key field pointing to the parent record. Auto-detected from metadata if omitted. |
| `NameField` | `string` | Entity `NameField` | Field to use for the main card title. |
| `SubtitleField` | `string` | `undefined` | Optional field for the secondary metadata tag or subtitle. |
| `IconField` | `string` | `undefined` | Optional field containing a dynamic Font Awesome icon class or image URL. |
| `DefaultIcon` | `string` | `'fa-solid fa-sitemap'` | Fallback icon when node does not specify one. |
| `ColorField` | `string` | `undefined` | Optional field for dynamic hex color accent. |
| `DefaultColor` | `string` | `'#38bdf8'` | Fallback accent color. |
| `ExtraFilter` | `string` | `undefined` | SQL-like filter string applied to the `RunView` query (e.g. `'IsActive = 1'`). |
| `OrderBy` | `string` | `'Name ASC'` | Sort order for sibling nodes. |
| `FocusRecordID` | `string` | `undefined` | Initial record ID to focus as subtree root. |
| `Orientation` | `'top-to-bottom' \| 'left-to-right'` | `'top-to-bottom'` | Layout direction. |
| `ShowSearch` | `boolean` | `true` | Whether to display the live search input. |
| `ShowToolbar` | `boolean` | `true` | Whether to display the zoom and expansion controls toolbar. |
| `Height` | `string` | `'560px'` | Total container height. |

---

## 📡 Events & Lifecycle

```typescript
// Cancelable Event Example: Prevent collapsing root nodes
onBeforeNodeCollapse(event: CancelableHierarchyNodeEvent) {
  if (event.Node.Depth === 0) {
    event.Cancel('Root node must remain expanded');
  }
}
```

### Supported Outputs

- `NodeClick`: `EventEmitter<HierarchyNodeEvent>`
- `NodeDoubleClick`: `EventEmitter<HierarchyNodeEvent>`
- `NodeSelect`: `EventEmitter<HierarchyNodeEvent>`
- `BeforeNodeExpand`: `EventEmitter<CancelableHierarchyNodeEvent>`
- `AfterNodeExpand`: `EventEmitter<HierarchyNodeEvent>`
- `BeforeNodeCollapse`: `EventEmitter<CancelableHierarchyNodeEvent>`
- `AfterNodeCollapse`: `EventEmitter<HierarchyNodeEvent>`
- `BeforeReparent`: `EventEmitter<CancelableReparentEvent>`
- `AfterReparent`: `EventEmitter<ReparentEvent>`
- `NodeAction`: `EventEmitter<NodeActionEvent>`
- `Navigate`: `EventEmitter<FormNavigationEvent>`

---

## 🛠️ Programmatic Action Verbs

Call public methods on `HierarchyTreeComponent` via `@ViewChild`:

```typescript
@ViewChild(HierarchyTreeComponent) treeComponent!: HierarchyTreeComponent;

// Expansion
this.treeComponent.expandAll();
this.treeComponent.collapseAll();

// Navigation & Canvas
this.treeComponent.fitToScreen();
this.treeComponent.zoomIn();
this.treeComponent.zoomOut();
this.treeComponent.resetZoom();

// Focus & Subtrees
this.treeComponent.setFocusRoot('ORG-1234');
this.treeComponent.resetFocus();

// Export
const svgContent = this.treeComponent.exportAsSVG();
```

---

## 🎨 Design Tokens

This component consumes standard `--mj-*` design tokens:

- `--mj-bg-surface-sunken`: Canvas background
- `--mj-bg-surface-card`: Node card background
- `--mj-border-default`: Node borders & link curves
- `--mj-text-primary`: Node title text
- `--mj-text-secondary`: Subtitles & badges
- `--mj-brand-primary`: Focus indicators & search match highlights
