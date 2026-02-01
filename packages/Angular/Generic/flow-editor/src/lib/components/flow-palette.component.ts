import { Component, Input, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { FlowNodeTypeConfig } from '../interfaces/flow-types';

/**
 * Draggable palette sidebar for creating new nodes.
 * Uses Foblex's fExternalItem directive to enable drag-to-canvas creation.
 */
@Component({
  selector: 'mj-flow-palette',
  templateUrl: './flow-palette.component.html',
  styleUrls: ['./flow-palette.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowPaletteComponent {
  @Input() NodeTypes: FlowNodeTypeConfig[] = [];
  @Input() Collapsed = false;

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
