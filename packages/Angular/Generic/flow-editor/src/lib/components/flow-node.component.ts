import { Component, Input, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { FlowNode, FlowNodeTypeConfig } from '../interfaces/flow-types';

/**
 * Renders a single node in the flow canvas.
 * Applied with Foblex's fNode directive in the parent FlowEditorComponent template.
 * Contains input/output ports via Foblex's fNodeInput/fNodeOutput directives.
 */
@Component({
  standalone: false,
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

  get headerColor(): string {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return this.TypeConfig?.Color ?? '#6B7280';
  }

  get nodeIcon(): string {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return this.Node?.Icon ?? this.TypeConfig?.Icon ?? 'fa-circle-nodes';
  }

  get logoURL(): string | null {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return (this.Node?.Data?.['LogoURL'] as string) ?? null;
  }

  get statusClass(): string {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return this.Node?.Status ?? 'default';
  }

  get statusIcon(): string {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
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

  get hasStatus(): boolean {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return this.Node?.Status != null && this.Node.Status !== 'default';
  }

  /** Debugger chrome: this step is waiting for Continue / Step, not executing. */
  get isAwaitingUser(): boolean {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return this.Node?.Data?.['AwaitingUser'] === true;
  }

  /** Prerequisites are done; the dispatcher has not claimed it yet. */
  get isQueued(): boolean {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return !this.isAwaitingUser && this.Node?.Data?.['NextToRun'] === true;
  }

  get isExecuting(): boolean {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return !this.isAwaitingUser && this.Node?.Status === 'running';
  }

  get inputPort(): { ID: string; Side: string; Multiple: boolean; Disabled: boolean } | null {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    const port = this.Node?.Ports?.find(p => p.Direction === 'input');
    if (!port) return null;
    return {
      ID: port.ID,
      Side: port.Side ?? 'top',
      Multiple: port.Multiple !== false,
      Disabled: port.Disabled === true
    };
  }

  get outputPort(): { ID: string; Side: string; Multiple: boolean; Disabled: boolean } | null {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    const port = this.Node?.Ports?.find(p => p.Direction === 'output');
    if (!port) return null;
    return {
      ID: port.ID,
      Side: port.Side ?? 'bottom',
      Multiple: port.Multiple !== false,
      Disabled: port.Disabled === true
    };
  }

  // ── Loop Node Properties ───────────────────────────────────

  /** Whether this node represents a loop (ForEach or While) */
  get isLoopNode(): boolean {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return this.Node?.Type === 'ForEach' || this.Node?.Type === 'While';
  }

  /** Loop body type label (e.g., 'Action', 'Prompt', 'Sub-Agent') */
  get loopBodyType(): string | null {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return (this.Node?.Data?.['LoopBodyType'] as string) ?? null;
  }

  /** Resolved name of the loop body operation */
  get loopBodyName(): string | null {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return (this.Node?.Data?.['LoopBodyName'] as string) ?? null;
  }

  /** Icon for the loop body type */
  get loopBodyIcon(): string {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return (this.Node?.Data?.['LoopBodyIcon'] as string) ?? 'fa-circle-nodes';
  }

  /** Color for the loop body type */
  get loopBodyColor(): string {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return (this.Node?.Data?.['LoopBodyColor'] as string) ?? '#6B7280';
  }

  /** Short iteration summary (e.g., "over items" or "while condition") */
  get loopIterationSummary(): string {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return (this.Node?.Data?.['LoopIterationSummary'] as string) ?? '';
  }

  /** Max iterations limit, if configured */
  get loopMaxIterations(): number | null {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    const val = this.Node?.Data?.['MaxIterations'];
    return typeof val === 'number' ? val : null;
  }

  /** Loop item variable name */
  get loopItemVariable(): string | null {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    return (this.Node?.Data?.['LoopItemVariable'] as string) ?? null;
  }
}
