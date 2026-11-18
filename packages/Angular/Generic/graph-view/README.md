# @memberjunction/ng-graph-view

An interactive, high-performance network and relationship graph visualization component for MemberJunction and Angular applications.

## ✨ Features

- 🌐 **Force-Directed Physics Simulation**: Smooth Spring-Charge layout with repulsion, link elasticity, and velocity damping.
- 📐 **Multiple Layout Modes**: Switch between `force` (organic cluster network), `hierarchy` (ranked authority/depth rows), `circular`, and `grid` topologies.
- 🏛️ **Semantic Graph & Canon Support**: Native support for `Rank`-ordered concept categories (`GraphConceptType`), `Status` (`Active`, `Proposed`, `Superseded`, `Archived`), `AuthorityTier`, animated dashed `Contradicts` edges, directed SVG arrowheads, grounded MJ primitives, and provenance chunks.
- 🏷️ **Interactive Category Filter Legend**: Click any category pill in the legend to isolate nodes by category or `GraphConceptType`.
- 🔍 **Interactive Search & Degree Filter**: Node keyword filtering and hop-distance neighborhood expansion.
- 🎯 **Cancelable Before/After Event System**: Full control over user interactions (`BeforeNodeSelect`, `BeforeEdgeSelect`, `BeforeHopExpand`, `BeforeLayoutChange`, `BeforeNodeAction`).
- 🎨 **MemberJunction Design Tokens**: Seamless integration with MJ dark/light themes and typography.
- 🔎 **Selected Node Inspector Pane**: Built-in side drawer displaying authority badges, specifications, authority conflicts, grounded MJ primitives, source provenance chunks, and governance actions (`NodeAction`). Navigation is an intent event (`NodeNavigated`) so the host opens the record.

---

## 📦 Installation & Setup

```typescript
import { GraphViewComponent } from '@memberjunction/ng-graph-view';

@Component({
  standalone: true,
  imports: [GraphViewComponent],
  template: `
    <mj-graph-view
      [Nodes]="graphNodes"
      [Edges]="graphEdges"
      [LayoutMode]="'force'"
      (NodeSelected)="onNodeSelected($event)">
    </mj-graph-view>
  `
})
export class MyFeatureComponent {
  public graphNodes: GraphNode[] = [...];
  public graphEdges: GraphEdge[] = [...];

  public onNodeSelected(event: NodeSelectedEventArgs): void {
    console.log('Selected node:', event.Node.Label);
  }
}
```

---

## 🎛️ Component Inputs (Props)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `Nodes` | `GraphNode[]` | `[]` | Array of graph node entities to render. |
| `Edges` | `GraphEdge[]` | `[]` | Array of relationship edges connecting nodes. |
| `Categories` | `GraphCategoryConfig[]` | `DEFAULT_GRAPH_CATEGORIES` | Category color/icon/rank configs (e.g., seeded or DB-loaded `GraphConceptType` rows). |
| `LayoutMode` | `'force' \| 'circular' \| 'hierarchy' \| 'grid'` | `'force'` | Active layout algorithm. |
| `ActiveCategoryFilter` | `string \| null` | `null` | Optional active category filter key to isolate nodes in a category. |
| `MaxHopDistance`| `number` | `2` | Max hop depth for neighborhood traversals. |
| `SelectedNodeId`| `string` | `undefined` | ID of the node to initially select/highlight. |
| `ShowToolbar` | `boolean` | `true` | Show floating controls toolbar. |
| `ShowLegend` | `boolean` | `true` | Show category color legend. |
| `ShowInspector` | `boolean` | `true` | Show slide-in selected node inspector drawer. |
| `Searchable` | `boolean` | `true` | Enable keyword search input in toolbar. |
| `Physics` | `GraphPhysicsConfig` | `DEFAULT` | Physics parameters (repulsion, linkDistance, damping). |

---

## ⚡ Cancelable Before/After Event System

| Event | Payload Type | Cancelable | Description |
| :--- | :--- | :--- | :--- |
| `BeforeNodeSelect` | `BeforeNodeSelectEventArgs` | ✅ Yes | Fired before a node is selected. Set `event.Cancel = true` to abort. |
| `NodeSelected` | `NodeSelectedEventArgs` | ❌ No | Fired after node selection completes. |
| `BeforeEdgeSelect` | `BeforeEdgeSelectEventArgs` | ✅ Yes | Fired before an edge relationship is selected. |
| `EdgeSelected` | `EdgeSelectedEventArgs` | ❌ No | Fired after edge selection completes. |
| `BeforeHopExpand` | `BeforeHopExpandEventArgs` | ✅ Yes | Fired before expanding neighbors for incremental data loading. |
| `HopExpanded` | `HopExpandedEventArgs` | ❌ No | Fired after hop expansion executes. |
| `BeforeLayoutChange` | `BeforeLayoutChangeEventArgs` | ✅ Yes | Fired before layout mode changes. |
| `LayoutChanged` | `LayoutChangedEventArgs` | ❌ No | Fired after layout algorithm recalculates. |
| `BeforeNodeNavigate` | `BeforeNodeNavigateEventArgs` | ✅ Yes | Fired before opening full entity record form. |
| `NodeNavigated` | `NodeNavigatedEventArgs` | ❌ No | Fired after the user asks to open a record. The host owns navigation. |
| `BeforeNodeAction` | `BeforeNodeActionEventArgs` | ✅ Yes | Fired before a governance action (e.g. `'approve'`, `'reject'`, `'deprecate'`) executes on a node. |
| `NodeAction` | `NodeActionEventArgs` | ❌ No | Fired when a user confirms a governance action in the inspector drawer. |
| `CategoryFilterChanged` | `string \| null` | ❌ No | Fired when the user toggles a category filter pill in the interactive legend. |

---

## 🛠️ Programmatic Methods

Call these directly via `@ViewChild(GraphViewComponent)`:

- `ZoomIn()` / `ZoomOut()`: Step viewport scale in or out.
- `FitToView()`: Reset zoom and center the network graph.
- `Rearrange()`: Re-seed positions and re-run physics relaxation.
- `SetLayoutMode(mode)`: Change between `'force'`, `'hierarchy'`, `'circular'`, and `'grid'`.
- `ToggleCategoryFilter(category)`: Toggle isolating nodes by a specific category or `GraphConceptType`.
- `SelectNode(id)`: Select a node programmatically.
- `ClearSelection()`: Deselect currently active node or edge.
- `ExpandHops(nodeId, depth)`: Request incremental neighbor loading.
