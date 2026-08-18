import { Component, EventEmitter, Input, Output, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { FlowNodeTypeConfig } from '../interfaces/flow-types';

/**
 * Palette sidebar for creating new nodes — **click it or drag it**.
 *
 * Foblex's `fExternalItem` directive supplies drag-to-canvas placement, which is the precise
 * gesture when the author cares where the box lands. It is not, however, the only gesture people
 * try: a palette that looks like a list of buttons gets clicked, and for a long time a click here
 * produced *nothing at all* — the item was a bare `<div>` with no click binding, so the interaction
 * never even reached the editor. The entry is now a real `<button>`, which restores the click, the
 * keyboard (Enter/Space), and the focus ring for free, and emits {@link NodeTypeActivated}.
 *
 * Both gestures converge on the same `NodeAdded` event in `FlowEditorComponent` — one code path, so
 * a host that handles the drop automatically handles the click.
 */
@Component({
  standalone: false,
  selector: 'mj-flow-palette',
  templateUrl: './flow-palette.component.html',
  styleUrls: ['./flow-palette.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowPaletteComponent {
  @Input() NodeTypes: FlowNodeTypeConfig[] = [];
  @Input() Collapsed = false;

  /**
   * A palette entry was clicked (or activated from the keyboard).
   *
   * Carries the whole config rather than the type string so the host does not have to look it back
   * up — the palette already resolved it, and re-resolving is where a silent mismatch would live.
   */
  @Output() NodeTypeActivated = new EventEmitter<FlowNodeTypeConfig>();

  /** Handler for the click/keyboard activation on a palette entry. */
  OnNodeTypeActivated(nodeType: FlowNodeTypeConfig): void {
    this.NodeTypeActivated.emit(nodeType);
  }

  get categories(): string[] {
    const cats = new Set<string>();
    for (const nt of this.NodeTypes) {
      if (nt.Draggable !== false) {
        cats.add(nt.Category ?? 'General');
      }
    }
    return Array.from(cats);
  }

  GetTypesForCategory(category: string): FlowNodeTypeConfig[] {
    return this.NodeTypes.filter(nt =>
      nt.Draggable !== false && (nt.Category ?? 'General') === category
    );
  }

  /** Converts a hex color to rgba with the given opacity for background tinting */
  GetBgColor(hexColor: string | undefined, opacity: number): string {
    if (!hexColor) return 'transparent';
    // Handle standard 6-digit hex colors
    const match = hexColor.match(/^#?([0-9a-fA-F]{6})$/);
    if (match) {
      const r = parseInt(match[1].substring(0, 2), 16);
      const g = parseInt(match[1].substring(2, 4), 16);
      const b = parseInt(match[1].substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Fallback: return the color as-is with opacity via CSS
    return hexColor;
  }
}
