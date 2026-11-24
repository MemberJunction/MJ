/**
 * Core interfaces for the generic flow editor.
 * These types are entity-agnostic — consumers map their domain data to/from these.
 */
import type { MJAIPromptEntity } from '@memberjunction/core-entities';

/**
 * Prompt option shape for flow editor prompt pickers.
 */
export type PromptOption = Pick<MJAIPromptEntity, 'ID' | 'Name' | 'AIModelType' | 'AIModelTypeID'>;

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

/** One key/value preview row rendered when X-Ray mode is active on a node. */
export interface FlowNodeXRayItem {
  Key: string;
  Value: string;
  Changed?: boolean;
}

/** AI Decision confidence telemetry shown inside X-Ray mode. */
export interface FlowNodeConfidence {
  /** 0–100 percentage score */
  Score: number;
  /** Optional 0–100 minimum confidence threshold */
  Threshold?: number;
  Label?: string;
}

/** Breakpoint state rendered on the node's left gutter. */
export type FlowNodeBreakpointKind = 'single' | 'remembered';

/** Security taint / person-verification indicator for a node. */
export type FlowNodeTaintState = 'tainted' | 'verified';

/** Visual status of a node */
/**
 * How a node presents its state.
 *
 * `skipped` is deliberately its own value rather than a shade of `disabled`. Disabled means "this
 * cannot run"; skipped means "the graph chose another route" — nothing is wrong, and a reader who
 * cannot tell them apart goes looking for a failure that never happened.
 */
export type FlowNodeStatus = 'default' | 'success' | 'error' | 'warning' | 'running' | 'disabled' | 'pending' | 'skipped';

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
  /** Breakpoint armed on this step (solid red for single-run, hollow ring for remembered). */
  Breakpoint?: FlowNodeBreakpointKind | null;
  /** Live runner progress message (from `NodeProgress` frames). */
  ProgressMessage?: string;
  /** Live runner progress percentage 0–100 (undefined = indeterminate when ProgressMessage is set). */
  ProgressPercent?: number;
  /** Inline X-Ray key/value telemetry rows. */
  XRayItems?: FlowNodeXRayItem[];
  /** AI Decision confidence telemetry. */
  Confidence?: FlowNodeConfidence;
  /** External-data taint or human-verified shield state. */
  TaintState?: FlowNodeTaintState | null;
  /** Saga rollback / compensation label (e.g. "Undo: Void Draft"). */
  SagaCompensationLabel?: string;
  /** True when highlighted as part of a failure blast-radius preview (`ComputeTasksToBlock`). */
  BlastRadius?: boolean;
  /** True when the operator can invoke targeted `Step(taskID)` directly on this step. */
  CanStepSingle?: boolean;
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
  /** Stroke width in px. Active/flowing edges use a thicker value so they read at a glance. */
  StrokeWidth?: number;
  Animated?: boolean;
  Selected?: boolean;
  /** True for untaken/skipped paths rendered ghosted rather than deleted. */
  Untaken?: boolean;
  /** Operator-forced path verdict (kept visually unmistakable with amber dotted stroke). */
  ForcedVerdict?: 'true' | 'false' | null;
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

/** Emitted when an existing connection is reassigned (endpoint dragged to a different node) */
export interface FlowConnectionReassignedEvent {
  ConnectionID: string;
  OldSourceNodeID: string;
  OldSourcePortID: string;
  OldTargetNodeID: string;
  OldTargetPortID: string;
  NewSourceNodeID: string;
  NewSourcePortID: string;
  NewTargetNodeID: string;
  NewTargetPortID: string;
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

/** Built-in design-time actions. Hosts may emit any other `ID` string. */
export type FlowContextMenuAction = 'edit' | 'remove' | string;

/** One row in the canvas context menu. The host may replace the default Edit/Remove set. */
export type FlowContextMenuItem = {
    ID: string;
    Label: string;
    Icon?: string;
    Danger?: boolean;
    Disabled?: boolean;
    Shortcut?: string;
};

/**
 * Fired BEFORE the canvas menu opens. Mutate `Items` to replace the default set; `Cancel = true`
 * suppresses the menu. A `Before*` handler must not be async — the emitter reads `Cancel`/`Items`
 * when `emit()` returns.
 */
export class FlowBeforeContextMenuEventArgs {
    public Cancel = false;
    constructor(
        public readonly Target: FlowContextMenuTarget,
        public readonly Node: FlowNode | null,
        public readonly Connection: FlowConnection | null,
        public readonly MouseEvent: MouseEvent,
        public Items: FlowContextMenuItem[],
    ) {}
}

/** Fired AFTER a menu item is chosen. Built-in `edit`/`remove` still run unless ReadOnly. */
export class FlowAfterContextMenuActionEventArgs {
    constructor(
        public readonly ActionID: string,
        public readonly Target: FlowContextMenuTarget,
        public readonly Node: FlowNode | null,
        public readonly Connection: FlowConnection | null,
    ) {}
}

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

/**
 * How the canvas toolbar presents itself.
 *
 * `shown` is the full bar. `minimized` is a chip that restores it. `hidden` leaves only a
 * recover tab — otherwise a host that hid the bar would have no way back from the canvas.
 */
export type FlowToolbarVisibility = 'shown' | 'hidden' | 'minimized';

/** Horizontal placement of the canvas toolbar (and of its minimized / hidden recover control). */
export type FlowToolbarAlign = 'left' | 'center' | 'right';

/** Result of an auto-layout operation */
export interface FlowLayoutResult {
  Positions: Map<string, FlowPosition>;
}
