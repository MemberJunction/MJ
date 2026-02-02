import { Component, Input, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { FlowNode, FlowNodeTypeConfig } from '../interfaces/flow-types';

/**
 * Renders a single node in the flow canvas.
 * Applied with Foblex's fNode directive in the parent FlowEditorComponent template.
 * Contains input/output ports via Foblex's fNodeInput/fNodeOutput directives.
 */
@Component({
  selector: 'mj-flow-node',
  templateUrl: './flow-node.component.html',
  styleUrls: ['./flow-node.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowNodeComponent {
  @Input() Node!: FlowNode;
  @Input() TypeConfig: FlowNodeTypeConfig | null = null;
  @Input() ReadOnly = false;
  @Input() Compact = false;

  get headerColor(): string {
    return this.TypeConfig?.Color ?? '#6B7280';
  }

  get nodeIcon(): string {
    return this.Node?.Icon ?? this.TypeConfig?.Icon ?? 'fa-circle-nodes';
  }

  get statusClass(): string {
    return this.Node?.Status ?? 'default';
  }

  get statusIcon(): string {
    switch (this.Node?.Status) {
      case 'success': return 'fa-check-circle';
      case 'error': return 'fa-times-circle';
      case 'warning': return 'fa-exclamation-triangle';
      case 'running': return 'fa-spinner fa-spin';
      case 'disabled': return 'fa-ban';
      case 'pending': return 'fa-clock';
      default: return '';
    }
  }

  get hasStatus(): boolean {
    return this.Node?.Status != null && this.Node.Status !== 'default';
  }

  get inputPort(): { ID: string; Side: string; Multiple: boolean; Disabled: boolean } | null {
    const port = this.Node?.Ports?.find(p => p.Direction === 'input');
    if (!port) return null;
    return {
      ID: port.ID,
      Side: port.Side ?? 'top',
      Multiple: port.Multiple !== false,
      Disabled: port.Disabled === true
    };
  }

  get outputPort(): { ID: string; Side: string; Multiple: boolean; Disabled: boolean } | null {
    const port = this.Node?.Ports?.find(p => p.Direction === 'output');
    if (!port) return null;
    return {
      ID: port.ID,
      Side: port.Side ?? 'bottom',
      Multiple: port.Multiple !== false,
      Disabled: port.Disabled === true
    };
  }
}
