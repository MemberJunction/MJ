import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WhiteboardShapeKind } from './whiteboard-state';

/** A user-selectable board tool. */
export type WhiteboardTool = 'select' | 'pan' | 'pen' | 'shape' | 'sticky' | 'text' | 'image' | 'connector' | 'eraser';

/** One entry in the floating toolbar. */
interface ToolbarEntry {
  Tool: WhiteboardTool;
  Icon: string;
  Title: string;
  Kbd: string;
}

/**
 * USER pen palette — categorical ink colors. Violet is deliberately EXCLUDED:
 * violet is the reserved ownership hue of the agent's marks.
 */
export const WHITEBOARD_PEN_COLORS: readonly string[] = ['#cbd5e1', '#fbbf24', '#5cc0ed', '#4ade80', '#f87171'];

/** Available pen stroke widths (px). */
export const WHITEBOARD_PEN_WIDTHS: readonly number[] = [2, 4, 7];

/**
 * The floating left-edge toolbar of the live whiteboard: tool buttons with kbd hints,
 * the pen color/width flyout (with the "violet = agent's" reservation note), the shape
 * flyout, and undo/redo. Pure presentational — all state in/out via bindings.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-whiteboard-toolbar',
  imports: [CommonModule],
  templateUrl: './whiteboard-toolbar.component.html',
  styleUrl: './whiteboard-toolbar.component.css'
})
export class RealtimeWhiteboardToolbarComponent {
  /** The currently active tool. */
  @Input() ActiveTool: WhiteboardTool = 'select';
  /** Selected pen ink color (from {@link WHITEBOARD_PEN_COLORS}). */
  @Input() PenColor: string = WHITEBOARD_PEN_COLORS[0];
  /** Selected pen stroke width. */
  @Input() PenWidth = 4;
  /** Selected shape kind for drag-create. */
  @Input() ShapeKind: WhiteboardShapeKind = 'rect';
  /** Whether undo / redo are available (drives nothing visually but kept for a11y). */
  @Input() CanUndo = false;
  @Input() CanRedo = false;
  /** Display name of the session's agent (the pen flyout note: "violet = Sage's"). */
  @Input() AgentName = 'Agent';

  @Output() ToolChange = new EventEmitter<WhiteboardTool>();
  @Output() PenColorChange = new EventEmitter<string>();
  @Output() PenWidthChange = new EventEmitter<number>();
  @Output() ShapeKindChange = new EventEmitter<WhiteboardShapeKind>();
  @Output() Undo = new EventEmitter<void>();
  @Output() Redo = new EventEmitter<void>();

  public readonly Tools: ToolbarEntry[] = [
    { Tool: 'select', Icon: 'fa-solid fa-arrow-pointer', Title: 'Select / move', Kbd: 'V' },
    { Tool: 'pan', Icon: 'fa-regular fa-hand', Title: 'Pan', Kbd: 'H' },
    { Tool: 'pen', Icon: 'fa-solid fa-pen', Title: 'Pen', Kbd: 'P' },
    { Tool: 'shape', Icon: 'fa-regular fa-square', Title: 'Shapes', Kbd: 'R' },
    { Tool: 'sticky', Icon: 'fa-regular fa-note-sticky', Title: 'Sticky note', Kbd: 'S' },
    { Tool: 'text', Icon: 'fa-solid fa-font', Title: 'Text', Kbd: 'T' },
    { Tool: 'image', Icon: 'fa-regular fa-image', Title: 'Paste / insert image', Kbd: 'I' },
    { Tool: 'connector', Icon: 'fa-solid fa-arrow-trend-up', Title: 'Connector', Kbd: 'C' },
    { Tool: 'eraser', Icon: 'fa-solid fa-eraser', Title: 'Eraser', Kbd: 'E' }
  ];

  public readonly PenColors = WHITEBOARD_PEN_COLORS;
  public readonly PenWidths = WHITEBOARD_PEN_WIDTHS;
  public readonly ShapeKinds: { Kind: WhiteboardShapeKind; Icon: string; Title: string }[] = [
    { Kind: 'rect', Icon: 'fa-regular fa-square', Title: 'Rectangle' },
    { Kind: 'ellipse', Icon: 'fa-regular fa-circle', Title: 'Ellipse' },
    { Kind: 'diamond', Icon: 'fa-regular fa-square wb-diamond', Title: 'Diamond' }
  ];

  public SelectTool(tool: WhiteboardTool): void {
    this.ToolChange.emit(tool);
  }

  public TrackTool(index: number, entry: ToolbarEntry): WhiteboardTool {
    return entry.Tool;
  }
}
