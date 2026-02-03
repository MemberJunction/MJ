/**
 * Core interfaces for the generic flow editor.
 * These types are entity-agnostic — consumers map their domain data to/from these.
 */

// ---------------------------------------------------------------------------
// Node Types
// ---------------------------------------------------------------------------

/** Position on the canvas */
export interface FlowPosition {
  X: number;
  Y: number;
}

/** Size dimensions */
export interface FlowSize {
  Width: number;
  Height: number;
}

/** A port (connector) on a node */
export interface FlowNodePort {
  ID: string;
  Direction: 'input' | 'output';
  Side?: 'left' | 'right' | 'top' | 'bottom' | 'auto';
  Multiple?: boolean;
  Disabled?: boolean;
  Label?: string;
  /** Category string for connection validation (matched against FlowNodePort on targets) */
  Category?: string;
}

/** A small info badge displayed on a node */
export interface FlowNodeBadge {
  Label: string;
  Value: string;
  Icon?: string;
  Color?: string;
}

/** Visual status of a node */
export type FlowNodeStatus = 'default' | 'success' | 'error' | 'warning' | 'running' | 'disabled' | 'pending';

/** A node in the flow graph */
export interface FlowNode {
  ID: string;
  Type: string;
  Label: string;
  Subtitle?: string;
  Icon?: string;
  IconColor?: string;
  Status: FlowNodeStatus;
  StatusMessage?: string;
  Badges?: FlowNodeBadge[];
  Position: FlowPosition;
  Size?: FlowSize;
  Ports: FlowNodePort[];
  Collapsed?: boolean;
  Selected?: boolean;
  Locked?: boolean;
  IsStartNode?: boolean;
  /** Opaque data payload — consumers store domain-specific data here */
  Data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Connection Types
// ---------------------------------------------------------------------------

/** Visual style for a connection line */
export type FlowConnectionStyle = 'solid' | 'dashed' | 'dotted';

/** A connection (edge) between two nodes */
export interface FlowConnection {
  ID: string;
  SourceNodeID: string;
  SourcePortID: string;
  TargetNodeID: string;
  TargetPortID: string;
  Label?: string;
  LabelDetail?: string;
  /** Font Awesome icon class shown before the label text (e.g., 'fa-check') */
  LabelIcon?: string;
  /** Color for the label icon */
  LabelIconColor?: string;
  Condition?: string;
  Priority?: number;
  Style?: FlowConnectionStyle;
  Color?: string;
  Animated?: boolean;
  Selected?: boolean;
  /** Opaque data payload — consumers store domain-specific data here */
  Data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Node Type Registration (for palette and rendering)
// ---------------------------------------------------------------------------

/** Configuration for a node type displayed in the palette */
export interface FlowNodeTypeConfig {
  /** Unique type identifier (e.g., 'Action', 'Prompt') */
  Type: string;
  /** Display label */
  Label: string;
  /** Font Awesome icon class (e.g., 'fa-bolt') */
  Icon: string;
  /** Hex color for the node header */
  Color: string;
  /** Default ports created when this node type is added */
  DefaultPorts?: FlowNodePort[];
  /** Palette category for grouping (e.g., 'Steps', 'Loops') */
  Category?: string;
  /** Whether this type can be dragged from the palette (default true) */
  Draggable?: boolean;
  /** Maximum number of instances allowed (0 = unlimited, default 0) */
  MaxInstances?: number;
}

// ---------------------------------------------------------------------------
// Event Payloads
// ---------------------------------------------------------------------------

/** Emitted when a new node is added from the palette */
export interface FlowNodeAddedEvent {
  Node: FlowNode;
  DropPosition: FlowPosition;
}

/** Emitted when a node is moved on the canvas */
export interface FlowNodeMovedEvent {
  NodeID: string;
  OldPosition: FlowPosition;
  NewPosition: FlowPosition;
}

/** Emitted when a new connection is drawn */
export interface FlowConnectionCreatedEvent {
  SourceNodeID: string;
  SourcePortID: string;
  TargetNodeID: string;
  TargetPortID: string;
}

/** Emitted when the selection state changes */
export interface FlowSelectionChangedEvent {
  SelectedNodeIDs: string[];
  SelectedConnectionIDs: string[];
}

/** Emitted when empty canvas is clicked */
export interface FlowCanvasClickEvent {
  Position: FlowPosition;
}

/** Context menu target type */
export type FlowContextMenuTarget = 'node' | 'connection';

/** Context menu action */
export type FlowContextMenuAction = 'edit' | 'remove';

// ---------------------------------------------------------------------------
// State Types (for undo/redo)
// ---------------------------------------------------------------------------

/** A complete snapshot of the flow state */
export interface FlowSnapshot {
  Nodes: FlowNode[];
  Connections: FlowConnection[];
}

// ---------------------------------------------------------------------------
// Layout Types
// ---------------------------------------------------------------------------

/** Direction for auto-layout */
export type FlowLayoutDirection = 'horizontal' | 'vertical';

/** Result of an auto-layout operation */
export interface FlowLayoutResult {
  Positions: Map<string, FlowPosition>;
}
