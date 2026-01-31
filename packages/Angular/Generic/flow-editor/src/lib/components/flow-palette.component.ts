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
}
