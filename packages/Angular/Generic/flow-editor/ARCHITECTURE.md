# Flow Editor Architecture

## Overview

`@memberjunction/ng-flow-editor` provides two levels of flow editor:

1. **`FlowEditorComponent`** (`<mj-flow-editor>`) — A generic, entity-agnostic visual flow editor for any domain.
2. **`FlowAgentEditorComponent`** (`<mj-flow-agent-editor>`) — An MJ-specific wrapper that adds agent step/path CRUD, a properties panel, and save/load operations.

## Technology Stack

- **Canvas Engine**: [Foblex Flow](https://flow.foblex.com/) v18 — Angular-native node-based UI library
- **Auto-Layout**: [@dagrejs/dagre](https://github.com/dagrejs/dagre) — Directed graph layout algorithm
- **Undo/Redo**: Snapshot-based state stack (built-in)
- **Styling**: SCSS with BEM-like naming (`mj-flow-*` prefix)

## Component Architecture

```
FlowAgentEditorComponent (mj-flow-agent-editor)
├── Agent Toolbar (Save, Undo/Redo, View Mode, Full Screen)
├── FlowEditorComponent (mj-flow-editor) ← Generic canvas
│   ├── Foblex f-flow + f-canvas (zoom/pan/drag)
│   │   ├── f-background (dot grid)
│   │   ├── f-line-alignment (snap guides)
│   │   ├── f-connection-for-create (interactive connection drawing)
│   │   ├── f-selection-area (rubber-band select)
│   │   ├── FlowNodeComponent × N (custom node rendering)
│   │   │   ├── fNodeInput port(s)
│   │   │   ├── fNodeOutput port(s)
│   │   │   ├── Header (icon + label + status)
│   │   │   ├── Body (subtitle + configured item)
│   │   │   └── Badges (duration, status, tokens)
│   │   ├── f-connection × N (bezier curves with labels)
│   │   └── f-minimap
│   ├── FlowPaletteComponent (draggable node types)
│   └── FlowStatusBarComponent (counts, zoom %)
├── AgentPropertiesPanelComponent (step configuration)
│   ├── General section (name, status, starting step)
│   ├── Type-specific section (action/prompt/sub-agent picker)
│   ├── Mapping section (input/output JSON)
│   ├── Error handling section
│   └── Path/connection properties (when connection selected)
└── AgentStepListComponent (tabular step/path view)
```

## Data Flow

```
Consumer (AI Agent Form)
    │
    ▼
FlowAgentEditorComponent
    │ Loads AIAgentStepEntity[] + AIAgentStepPathEntity[]
    │ Uses AgentFlowTransformerService to convert
    ▼
FlowEditorComponent
    │ Receives FlowNode[] + FlowConnection[]
    │ Renders via Foblex directives
    │ Emits events on user interaction
    ▼
FlowAgentEditorComponent
    │ Handles events, updates MJ entities
    │ Saves via entity.Save() / entity.Delete()
    ▼
Consumer (AI Agent Form)
    │ Receives FlowSaved / FlowChanged events
```

## Generic FlowEditorComponent API

### Inputs
| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `Nodes` | `FlowNode[]` | `[]` | Nodes to render |
| `Connections` | `FlowConnection[]` | `[]` | Connections between nodes |
| `NodeTypes` | `FlowNodeTypeConfig[]` | `[]` | Registered node types for palette |
| `ReadOnly` | `boolean` | `false` | Disable editing |
| `ShowMinimap` | `boolean` | `true` | Toggle minimap |
| `ShowPalette` | `boolean` | `true` | Toggle palette sidebar |
| `ShowGrid` | `boolean` | `true` | Toggle dot grid |
| `ShowStatusBar` | `boolean` | `true` | Toggle status bar |
| `GridSize` | `number` | `20` | Snap grid size (px) |
| `AutoLayoutDirection` | `'horizontal' \| 'vertical'` | `'vertical'` | Auto-layout direction |

### Outputs
| Output | Payload | Description |
|--------|---------|-------------|
| `NodeSelected` | `FlowNode \| null` | Node selection changed |
| `NodeAdded` | `FlowNodeAddedEvent` | New node dropped from palette |
| `NodeRemoved` | `FlowNode` | Node deleted |
| `NodeMoved` | `FlowNodeMovedEvent` | Node repositioned |
| `ConnectionCreated` | `FlowConnectionCreatedEvent` | Connection drawn |
| `ConnectionRemoved` | `FlowConnection` | Connection deleted |
| `ConnectionSelected` | `FlowConnection \| null` | Connection clicked |
| `SelectionChanged` | `FlowSelectionChangedEvent` | Multi-select changed |
| `CanvasClicked` | `FlowCanvasClickEvent` | Empty canvas click |

### Public Methods
| Method | Description |
|--------|-------------|
| `ZoomToFit()` | Fit all nodes in view |
| `ZoomIn()` / `ZoomOut()` | Zoom controls |
| `AutoArrange()` | Run dagre layout |
| `CenterOnNode(id)` | Pan to node |
| `SelectNode(id)` | Select programmatically |
| `ClearSelection()` | Deselect all |
| `SetNodeStatus(id, status)` | Update node badge |
| `HighlightPath(ids)` | Highlight execution path |

## Node Type Configuration

```typescript
const AGENT_STEP_TYPES: FlowNodeTypeConfig[] = [
  { Type: 'Action',    Label: 'Action',     Icon: 'fa-bolt',            Color: '#3B82F6', Category: 'Steps' },
  { Type: 'Prompt',    Label: 'Prompt',     Icon: 'fa-comment-dots',    Color: '#8B5CF6', Category: 'Steps' },
  { Type: 'Sub-Agent', Label: 'Sub-Agent',  Icon: 'fa-robot',           Color: '#10B981', Category: 'Steps' },
  { Type: 'ForEach',   Label: 'For Each',   Icon: 'fa-arrows-repeat',   Color: '#F59E0B', Category: 'Loops' },
  { Type: 'While',     Label: 'While',      Icon: 'fa-rotate',          Color: '#F97316', Category: 'Loops' },
];
```

## File Structure

```
src/
├── public-api.ts
└── lib/
    ├── flow-editor.module.ts
    ├── interfaces/
    │   └── flow-types.ts              (all generic interfaces)
    ├── services/
    │   ├── flow-state.service.ts      (undo/redo state stack)
    │   └── flow-layout.service.ts     (dagre auto-layout)
    ├── components/
    │   ├── flow-editor.component.ts   (main canvas wrapper)
    │   ├── flow-editor.component.html
    │   ├── flow-editor.component.scss
    │   ├── flow-node.component.ts     (custom node visual)
    │   ├── flow-node.component.html
    │   ├── flow-node.component.scss
    │   ├── flow-palette.component.ts  (drag palette)
    │   ├── flow-palette.component.html
    │   ├── flow-palette.component.scss
    │   ├── flow-toolbar.component.ts  (zoom/layout controls)
    │   └── flow-status-bar.component.ts (counts/zoom display)
    └── agent-editor/
        ├── flow-agent-editor.component.ts
        ├── flow-agent-editor.component.html
        ├── flow-agent-editor.component.scss
        ├── agent-properties-panel.component.ts
        ├── agent-properties-panel.component.html
        ├── agent-properties-panel.component.scss
        ├── agent-step-list.component.ts
        └── agent-flow-transformer.service.ts
```
