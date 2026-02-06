# @memberjunction/ng-entity-relationship-diagram

A package providing **two Angular components** for rendering interactive Entity Relationship Diagrams (ERD) using D3.js force-directed graphs:

1. **`<mj-entity-erd>`** - Higher-level MemberJunction wrapper that accepts `EntityInfo[]` directly
2. **`<mj-erd-diagram>`** - Generic, reusable component that works with any data

## Which Component Should I Use?

| Use Case | Component | Why |
|----------|-----------|-----|
| **MemberJunction project** | `<mj-entity-erd>` | Auto-discovers relationships, handles transformation |
| **Custom data sources** | `<mj-erd-diagram>` | Full control over node/link data |
| **Single entity + related** | `<mj-entity-erd>` | Built-in depth/relationship discovery |
| **Non-MJ Angular project** | `<mj-erd-diagram>` | No MJ dependencies in your code |

---

## `<mj-entity-erd>` - MemberJunction Entity Wrapper

The higher-level wrapper component designed specifically for MemberJunction projects. It accepts `EntityInfo[]` directly and handles all the transformation logic internally.

### Features

- **Direct EntityInfo Input** - No manual transformation needed
- **Automatic Relationship Discovery** - Finds related entities automatically
- **Configurable Depth** - Control how many relationship hops to include
- **Parent-Controlled State** - Emits state changes for persistence by parent
- **Bidirectional Relationships** - Optionally include incoming and outgoing relationships

### Basic Usage

```typescript
import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';
import { EntityInfo, Metadata } from '@memberjunction/core';

@Component({
  selector: 'my-entity-viewer',
  template: `
    <mj-entity-erd
      [entities]="selectedEntities"
      [allEntities]="allEntities"
      [selectedEntityId]="currentEntityId"
      [depth]="1"
      [includeIncoming]="true"
      [includeOutgoing]="true"
      (entitySelected)="onEntitySelected($event)"
      (openRecord)="onOpenEntity($event)">
    </mj-entity-erd>
  `
})
export class MyEntityViewerComponent {
  allEntities: EntityInfo[] = [];
  selectedEntities: EntityInfo[] = [];
  currentEntityId: string | null = null;

  constructor() {
    const md = new Metadata();
    this.allEntities = md.Entities;
  }

  onEntitySelected(entity: EntityInfo) {
    this.currentEntityId = entity.ID;
  }

  onOpenEntity(entity: EntityInfo) {
    // Navigate to entity record
    this.router.navigate(['/entities', entity.ID]);
  }
}
```

### API Reference

#### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `entities` | `EntityInfo[]` | `[]` | Primary entities to display |
| `allEntities` | `EntityInfo[]` | `[]` | All entities for relationship discovery |
| `selectedEntityId` | `string \| null` | `null` | ID of currently selected entity |
| `depth` | `number` | `1` | Relationship hops to include (0 = only primary entities) |
| `includeIncoming` | `boolean` | `true` | Include entities that reference primary entities |
| `includeOutgoing` | `boolean` | `true` | Include entities referenced by primary entities via FK |
| `showHeader` | `boolean` | `true` | Show header with zoom controls |
| `headerTitle` | `string` | `'Entity Relationship Diagram'` | Header title |
| `isRefreshing` | `boolean` | `false` | Show loading overlay |
| `readOnly` | `boolean` | `false` | Disable interactions |
| `config` | `ERDConfig` | `{}` | Configuration options |

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `entitySelected` | `EntityInfo` | Entity was selected |
| `entityDeselected` | `void` | Selection was cleared |
| `openRecord` | `EntityInfo` | Entity double-clicked (typically for navigation) |
| `stateChange` | `ERDState` | Diagram state changed (zoom, pan, selection) |

### Single Entity Mode (Entity Forms)

Perfect for showing one entity with its relationships:

```html
<mj-entity-erd
  [entities]="[currentEntity]"
  [allEntities]="allEntities"
  [selectedEntityId]="currentEntity.ID"
  [depth]="1"
  [showHeader]="false"
  (openRecord)="navigateToEntity($event)">
</mj-entity-erd>
```

### Multi-Entity Mode (Dashboards)

Display multiple entities with full navigation:

```html
<mj-entity-erd
  [entities]="filteredEntities"
  [allEntities]="allEntities"
  [selectedEntityId]="selectedId"
  [depth]="1"
  [includeIncoming]="true"
  [includeOutgoing]="true"
  (entitySelected)="onSelect($event)"
  (entityDeselected)="onDeselect()"
  (openRecord)="openEntityForm($event)"
  (stateChange)="saveUserPreferences($event)">
</mj-entity-erd>
```

### State Persistence Example

The wrapper emits state changes but doesn't persist them. Handle persistence in your container:

```typescript
@Component({...})
export class EntityDashboardComponent {
  savedState: ERDState | null = null;

  ngOnInit() {
    // Load saved preferences
    const saved = localStorage.getItem('entity-erd-state');
    if (saved) {
      this.savedState = JSON.parse(saved);
    }
  }

  onStateChange(state: ERDState) {
    // Save to user preferences
    localStorage.setItem('entity-erd-state', JSON.stringify(state));
  }
}
```

### Utility Functions

The package also exports utility functions for advanced use cases:

```typescript
import {
  buildERDDataFromEntities,
  entityInfoToERDNode,
  entityFieldToERDField,
  entitiesToERDNodes,
  getOriginalEntityFromERDNode,
  findEntityByNodeId
} from '@memberjunction/ng-entity-relationship-diagram';

// Build complete ERD data with automatic relationship discovery
const { nodes, links } = buildERDDataFromEntities(primaryEntities, {
  allEntities: md.Entities,
  includeIncoming: true,
  includeOutgoing: true,
  depth: 2
});

// Convert single entity
const erdNode = entityInfoToERDNode(entityInfo);

// Convert entity field
const erdField = entityFieldToERDField(entityFieldInfo);

// Batch convert entities
const erdNodes = entitiesToERDNodes(entityInfoArray);

// Extract original EntityInfo from ERDNode (if available)
const originalEntity = getOriginalEntityFromERDNode(erdNode);

// Find entity by node ID
const entity = findEntityByNodeId(nodeId, allEntities);
```

---

## `<mj-erd-diagram>` - Generic ERD Component

The lower-level generic component for full control over the data.

## Features

- **Interactive Force-Directed Layout** - Nodes automatically arrange themselves using physics-based simulation
- **Zoom and Pan** - Mouse wheel zoom and drag-to-pan with configurable limits
- **Node Selection** - Click to select nodes with visual highlighting
- **Focus Mode** - Show a single entity with its N-hop related entities (entity-centric view)
- **Relationship Visualization** - Arrows show foreign key relationships with field-level connections
- **Customizable Styling** - Full control over colors, sizes, and appearance via configuration
- **Rich Event System** - Comprehensive events for clicks, hovers, context menus, and drags
- **State Persistence** - Save and restore diagram state (zoom, pan, selection, node positions)
- **Read-Only Mode** - Disable interactions while keeping visualization intact
- **SVG Export** - Export the diagram as SVG for embedding or printing

## Installation

```bash
npm install @memberjunction/ng-entity-relationship-diagram
```

## Quick Start

### 1. Import the Module

```typescript
import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';

@NgModule({
  imports: [
    EntityRelationshipDiagramModule
  ]
})
export class YourModule { }
```

### 2. Basic Usage

```html
<mj-erd-diagram
  [nodes]="entityNodes"
  [selectedNodeId]="selectedId"
  (nodeSelected)="onNodeSelected($event)"
  (nodeDoubleClick)="onNodeDoubleClick($event)">
</mj-erd-diagram>
```

```typescript
import { ERDNode, ERDNodeClickEvent } from '@memberjunction/ng-entity-relationship-diagram';

export class YourComponent {
  entityNodes: ERDNode[] = [
    {
      id: 'users',
      name: 'Users',
      fields: [
        { id: 'id', name: 'ID', isPrimaryKey: true, type: 'uuid' },
        { id: 'email', name: 'Email', isPrimaryKey: false, type: 'string' },
        { id: 'roleId', name: 'RoleID', isPrimaryKey: false, relatedNodeId: 'roles', relatedFieldName: 'ID' }
      ]
    },
    {
      id: 'roles',
      name: 'Roles',
      fields: [
        { id: 'id', name: 'ID', isPrimaryKey: true, type: 'uuid' },
        { id: 'name', name: 'Name', isPrimaryKey: false, type: 'string' }
      ]
    }
  ];

  selectedId: string | null = null;

  onNodeSelected(node: ERDNode) {
    this.selectedId = node.id;
    console.log('Selected:', node.name);
  }

  onNodeDoubleClick(event: ERDNodeClickEvent) {
    // Navigate to entity detail
    this.router.navigate(['/entities', event.node.id]);
  }
}
```

## Real-World Example: Entity Admin Dashboard

This component is used in MemberJunction's Entity Admin Dashboard to visualize database schema. Here's how it's integrated:

**Location:** `packages/Angular/Explorer/dashboards/src/EntityAdmin/components/erd-composite.component.ts`

```typescript
import { ERDDiagramComponent, ERDNode, ERDNodeClickEvent } from '@memberjunction/ng-entity-relationship-diagram';
import { entitiesToERDNodes, findEntityByNodeId } from '../utils/entity-to-erd-adapter';

@Component({
  selector: 'mj-erd-composite',
  templateUrl: './erd-composite.component.html'
})
export class ERDCompositeComponent {
  @ViewChild(ERDDiagramComponent) erdDiagram!: ERDDiagramComponent;

  entities: EntityInfo[] = [];
  erdNodes: ERDNode[] = [];
  selectedEntity: EntityInfo | null = null;

  async ngOnInit() {
    const md = new Metadata();
    this.entities = md.Entities;

    // Convert MJ EntityInfo to generic ERDNode
    this.erdNodes = entitiesToERDNodes(this.entities);
  }

  onERDNodeSelected(node: ERDNode) {
    // Convert back to EntityInfo for detail panel
    const entity = findEntityByNodeId(node.id, this.entities);
    if (entity) {
      this.selectedEntity = entity;
    }
  }
}
```

**Template:**
```html
<mj-erd-diagram
  [nodes]="filteredERDNodes"
  [isRefreshing]="isRefreshingERD"
  [selectedNodeId]="selectedEntity?.ID || null"
  [showHeader]="true"
  headerTitle="Entity Relationship Diagram"
  (nodeSelected)="onERDNodeSelected($event)"
  (nodeClick)="onERDNodeClick($event)"
  (nodeDeselected)="onEntityDeselected()"
  (refreshRequested)="refreshERD()">
</mj-erd-diagram>
```

## Focus Mode - Entity-Centric Views

Focus mode is perfect for showing a single entity as the center with its related entities. This is ideal for:
- Entity detail pages
- Relationship exploration
- Schema documentation

```html
<!-- Show Users entity with directly related entities -->
<mj-erd-diagram
  [nodes]="allNodes"
  [focusNodeId]="'users'"
  [focusDepth]="1"
  (nodeSelected)="onNodeSelected($event)">
</mj-erd-diagram>
```

### Focus Depth Options

| Depth | Description |
|-------|-------------|
| `0` | Show only the focus node |
| `1` | Focus node + directly related nodes |
| `2` | Focus node + nodes within 2 relationship hops |
| `3+` | Continue expanding the relationship graph |

## API Reference

### Inputs

#### Data Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `nodes` | `ERDNode[]` | `[]` | The nodes (entities) to display |
| `selectedNodeId` | `string \| null` | `null` | ID of the currently selected node |
| `highlightedNodeIds` | `string[]` | `[]` | IDs of nodes to highlight |
| `focusNodeId` | `string \| null` | `null` | ID of node to focus on (enables focus mode) |
| `focusDepth` | `number` | `1` | Relationship hops to include in focus mode |

#### State Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `isRefreshing` | `boolean` | `false` | Shows loading overlay when true |
| `readOnly` | `boolean` | `false` | Disables dragging and selection |

#### Configuration Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `config` | `ERDConfig` | `{}` | Configuration options (see below) |
| `showHeader` | `boolean` | `true` | Show header with zoom controls |
| `headerTitle` | `string` | `'Entity Relationship Diagram'` | Title in header |

### Outputs (Events)

#### Selection Events

| Output | Type | Description |
|--------|------|-------------|
| `nodeClick` | `ERDNodeClickEvent` | Node clicked (set `cancel=true` to prevent selection) |
| `nodeDoubleClick` | `ERDNodeDoubleClickEvent` | Node double-clicked |
| `nodeSelected` | `ERDNode` | Node selected after click |
| `nodeDeselected` | `void` | Current node deselected |
| `linkClick` | `ERDLinkClickEvent` | Relationship link clicked |

#### Hover Events

| Output | Type | Description |
|--------|------|-------------|
| `nodeHover` | `ERDNodeHoverEvent` | Mouse entered a node |
| `nodeHoverEnd` | `ERDNode` | Mouse left a node |
| `linkHover` | `ERDLinkHoverEvent` | Mouse entered a link |
| `linkHoverEnd` | `ERDLink` | Mouse left a link |

#### Context Menu Events

| Output | Type | Description |
|--------|------|-------------|
| `nodeContextMenu` | `ERDNodeContextMenuEvent` | Right-click on node |
| `linkContextMenu` | `ERDLinkContextMenuEvent` | Right-click on link |
| `diagramContextMenu` | `ERDDiagramContextMenuEvent` | Right-click on background |

#### Drag Events

| Output | Type | Description |
|--------|------|-------------|
| `nodeDragStart` | `ERDNodeDragEvent` | Drag started (set `cancel=true` to prevent) |
| `nodeDragEnd` | `ERDNodeDragEvent` | Drag ended |

#### Diagram Events

| Output | Type | Description |
|--------|------|-------------|
| `zoomChange` | `ERDZoomEvent` | Zoom level or pan position changed |
| `refreshRequested` | `void` | Refresh button clicked |
| `layoutComplete` | `void` | Force simulation completed layout |
| `stateChange` | `ERDState` | Any state change (selection, zoom, etc.) |

### Public Methods

Access via `@ViewChild(ERDDiagramComponent)`:

#### Zoom Control

```typescript
zoomIn(): void                           // Zoom in 1.5x
zoomOut(): void                          // Zoom out 0.67x
resetZoom(): void                        // Reset to default zoom
zoomToNode(nodeId: string, scale?: number): void  // Center on specific node
zoomToFit(padding?: number): void        // Fit all nodes in view
centerDiagram(): void                    // Center without changing zoom
```

#### Selection

```typescript
selectNode(nodeId: string): boolean      // Programmatically select
deselectAll(): void                      // Clear all selections
```

#### Highlighting

```typescript
highlightNode(nodeId: string): void      // Highlight a specific node
clearHighlights(): void                  // Clear all highlights
highlightRelated(nodeId: string, depth?: number): void  // Highlight node + related
getRelatedNodes(nodeId: string, depth?: number): ERDRelationshipInfo[]
```

#### State Management

```typescript
getState(): ERDState                     // Get current state for persistence
setState(state: Partial<ERDState>, restorePositions?: boolean): void
```

#### Layout Control

```typescript
freezeLayout(): void                     // Stop simulation, fix positions
unfreezeLayout(): void                   // Resume natural movement
```

#### Utilities

```typescript
refresh(): void                          // Rebuild visualization
triggerResize(): void                    // Recalculate after container resize
getZoomState(): ERDZoomEvent            // Get current zoom/pan state
exportAsSVG(): string                    // Export as SVG string
```

## Configuration Options

```typescript
const config: ERDConfig = {
  // Node Sizing
  nodeWidth: 180,           // Width of each node box
  nodeBaseHeight: 60,       // Base height before adding fields
  fieldHeight: 20,          // Height per field row
  maxNodeHeight: 300,       // Maximum node height

  // Force Simulation
  chargeStrength: -800,     // Repulsion between nodes (negative)
  linkDistance: 80,         // Base distance between linked nodes
  collisionPadding: 20,     // Extra padding for collision detection

  // Display Options
  showFieldDetails: true,   // Show PK/FK fields in nodes
  showRelationshipLabels: true,  // Show field names on links
  showHeader: true,         // Show header with controls
  showNodeCount: true,      // Show count in header
  showMinimap: false,       // Show navigation minimap
  showLegend: false,        // Show color legend

  // Interaction
  enableDragging: true,     // Allow node dragging
  enableZoom: true,         // Enable mouse wheel zoom
  enablePan: true,          // Enable drag-to-pan
  minZoom: 0.1,            // Minimum zoom level
  maxZoom: 4,              // Maximum zoom level
  initialZoom: 1,          // Starting zoom level
  enableMultiSelect: false, // Ctrl+click multi-select

  // Animation
  animationDuration: 750,   // Transition duration in ms
  fitOnLoad: true,          // Auto-fit diagram on initial load

  // Empty State
  emptyStateMessage: 'No entities to display',
  emptyStateIcon: 'fa-solid fa-diagram-project',

  // Layout
  layoutAlgorithm: 'force', // 'force' | 'horizontal' | 'vertical' | 'radial'

  // Colors
  colors: {
    nodeBackground: '#f8f9fa',
    nodeBorder: '#333',
    nodeHeader: '#007bff',
    nodeHeaderText: 'white',
    primaryKeyBackground: '#fff3cd',
    primaryKeyText: '#856404',
    foreignKeyBackground: '#cce5ff',
    foreignKeyText: '#004085',
    linkColor: '#666',
    selectedBorder: '#4CAF50',
    highlightBorder: '#ff9800',
    relatedBorder: '#ff6b35'
  }
};
```

## Data Interfaces

### ERDNode

```typescript
interface ERDNode {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  schemaName?: string;           // Optional schema/namespace
  description?: string;          // Optional description
  status?: string;               // e.g., 'Active', 'Deprecated'
  baseTable?: string;            // Underlying table name
  fields: ERDField[];            // All fields in this node
  customData?: Record<string, unknown>;  // Additional data
}
```

### ERDField

```typescript
interface ERDField {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  type?: string;                 // Data type (e.g., 'string', 'int')
  isPrimaryKey: boolean;         // Is this a PK?
  relatedNodeId?: string;        // FK target node ID
  relatedNodeName?: string;      // FK target node name
  relatedFieldName?: string;     // FK target field name
  description?: string;
  allowsNull?: boolean;
  defaultValue?: string;
  length?: number;               // For string fields
  precision?: number;            // For numeric fields
  scale?: number;
  isVirtual?: boolean;           // Computed field
  autoIncrement?: boolean;
  possibleValues?: ERDFieldValue[];
  customData?: Record<string, unknown>;
}
```

### ERDLink

```typescript
interface ERDLink {
  sourceNodeId: string;
  targetNodeId: string;
  sourceField: ERDField;
  targetField?: ERDField;
  isSelfReference: boolean;
  relationshipType?: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  label?: string;
}
```

## State Persistence

Save and restore diagram state for user preferences:

```typescript
// Save to localStorage
const state = this.erdDiagram.getState();
localStorage.setItem('erd-state', JSON.stringify(state));

// Restore on component init
ngAfterViewInit() {
  const savedState = localStorage.getItem('erd-state');
  if (savedState) {
    this.erdDiagram.setState(JSON.parse(savedState));
  }
}
```

### ERDState Interface

```typescript
interface ERDState {
  selectedNodeId: string | null;
  highlightedNodeIds: string[];
  zoomLevel: number;
  translateX: number;
  translateY: number;
  focusNodeId: string | null;
  focusDepth: number;
  nodePositions: Record<string, {
    x: number;
    y: number;
    fx?: number | null;
    fy?: number | null;
  }>;
}
```

## Event Handling Examples

### Custom Context Menu

```typescript
onNodeContextMenu(event: ERDNodeContextMenuEvent) {
  event.cancel = true; // Prevent browser context menu

  this.contextMenuItems = [
    { label: 'View Details', action: () => this.viewDetails(event.node) },
    { label: 'Edit Entity', action: () => this.editEntity(event.node) },
    { label: 'Show Related', action: () => this.erdDiagram.highlightRelated(event.node.id) }
  ];

  this.contextMenuPosition = event.position;
  this.showContextMenu = true;
}
```

### Tooltips on Hover

```typescript
onNodeHover(event: ERDNodeHoverEvent) {
  this.tooltip = {
    visible: true,
    content: `${event.node.name}\n${event.relatedNodes.length} related entities`,
    x: event.position.x + 10,
    y: event.position.y + 10
  };
}

onNodeHoverEnd() {
  this.tooltip.visible = false;
}
```

### Prevent Selection for Locked Nodes

```typescript
onNodeClick(event: ERDNodeClickEvent) {
  if (event.node.customData?.['locked']) {
    event.cancel = true;
    this.showMessage('This entity is locked');
  }
}
```

## Styling

The component uses Angular's view encapsulation but exposes CSS variables for customization:

```css
/* In your global styles or component styles */
mj-erd-diagram {
  --erd-background: #f5f5f5;
  --erd-header-background: #e0e0e0;
  --erd-header-text: #333;
}
```

For deeper customization, the component uses `::ng-deep` compatible class names:
- `.erd-section` - Main container
- `.section-header` - Header bar
- `.erd-container` - SVG container
- `.node` - Node group
- `.entity-rect` - Node rectangle
- `.entity-header` - Node header bar
- `.link-group` - Link group
- `.link` - Link path

## Converting Custom Data to ERDNode

Create an adapter function to convert your domain types:

```typescript
// Example: Convert database schema to ERDNode
function tableToERDNode(table: DatabaseTable): ERDNode {
  return {
    id: table.id,
    name: table.tableName,
    schemaName: table.schema,
    fields: table.columns.map(col => ({
      id: col.name,
      name: col.name,
      type: col.dataType,
      isPrimaryKey: col.isPrimaryKey,
      relatedNodeId: col.foreignKeyTable,
      relatedFieldName: col.foreignKeyColumn,
      allowsNull: col.nullable
    }))
  };
}
```

## Performance Considerations

- For diagrams with 100+ nodes, consider using focus mode to show subsets
- Use `freezeLayout()` after the initial layout settles for static diagrams
- Adjust `chargeStrength` and `linkDistance` for different node densities
- Set `fitOnLoad: false` if you're restoring state to avoid double-animation

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

Requires support for:
- SVG
- ResizeObserver
- CSS Grid/Flexbox

## Dependencies

- Angular 21+
- D3.js 7+
- RxJS 7+

## License

MIT

## Contributing

Issues and PRs welcome at https://github.com/MemberJunction/MJ
