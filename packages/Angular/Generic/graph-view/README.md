# @memberjunction/ng-graph-view

An interactive, high-performance network and relationship graph visualization component for MemberJunction and Angular applications.

## ✨ Features

- 🌐 **Force-Directed Physics Simulation**: Smooth Spring-Charge layout with repulsion, link elasticity, and velocity damping.
- 📐 **Multiple Layout Modes**: Switch between `force` (organic cluster network) and `circular` topology.
- 🏷️ **Categorized Entity Node Badges**: Native palette support for People, Organizations, Committees, Accounts, and Custom entities.
- 🔍 **Interactive Search & Degree Filter**: Node keyword filtering and hop-distance neighborhood expansion.
- 🎯 **Cancelable Before/After Event System**: Full control over user interactions (`BeforeNodeSelect`, `BeforeEdgeSelect`, `BeforeHopExpand`, `BeforeLayoutChange`).
- 🎨 **MemberJunction Design Tokens**: Seamless integration with MJ dark/light themes and typography.
- 🔎 **Selected Node Inspector Pane**: Built-in side drawer. Navigation is an intent event (`NodeNavigated`) so the host opens the record.

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
| `LayoutMode` | `'force' \| 'circular'` | `'force'` | Active layout algorithm. |
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

---

## 🛠️ Programmatic Methods

Call these directly via `@ViewChild(GraphViewComponent)`:

- `ZoomIn()` / `ZoomOut()`: Step viewport scale in or out.
- `FitToView()`: Reset zoom and center the network graph.
- `Rearrange()`: Re-seed positions and re-run physics relaxation.
- `SetLayoutMode(mode)`: Change between `'force'` and `'circular'`.
- `SelectNode(id)`: Select a node programmatically.
- `ClearSelection()`: Deselect currently active node or edge.
- `ExpandHops(nodeId, depth)`: Request incremental neighbor loading.
