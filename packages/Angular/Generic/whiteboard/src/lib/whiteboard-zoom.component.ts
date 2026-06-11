import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The bottom-right zoom cluster of the live whiteboard: zoom out / percentage / zoom in,
 * fit-to-content, and the minimap toggle. Pure presentational; the board owns the
 * viewport math and the minimap rendering.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-whiteboard-zoom',
  imports: [CommonModule],
  templateUrl: './whiteboard-zoom.component.html',
  styleUrl: './whiteboard-zoom.component.css'
})
export class RealtimeWhiteboardZoomComponent {
  /** Current zoom as a percentage (e.g. 90). */
  @Input() ZoomPercent = 100;
  /** Whether the minimap is currently shown (highlights the map button). */
  @Input() MinimapOpen = false;

  @Output() ZoomOut = new EventEmitter<void>();
  @Output() ZoomIn = new EventEmitter<void>();
  @Output() Fit = new EventEmitter<void>();
  @Output() ToggleMinimap = new EventEmitter<void>();
}
