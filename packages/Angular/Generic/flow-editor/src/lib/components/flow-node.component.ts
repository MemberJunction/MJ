import { Component, EventEmitter, Input, Output, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { FlowNode, FlowNodeTypeConfig } from '../interfaces/flow-types';

/**
 * Renders a single step card in the flow canvas.
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
  @Input() XRayEnabled = false;
  @Input() AllowBreakpointClick = false;

  @Output() BreakpointClicked = new EventEmitter<FlowNode>();
  @Output() QuickAddClicked = new EventEmitter<FlowNode>();
  @Output() RunStepClicked = new EventEmitter<FlowNode>();

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
      case 'skipped': return 'fa-forward';
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

  get outputPort(): { ID: string; Side: string; Multiple: boolean; Disabled: boolean; Label?: string } | null {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    const port = this.Node?.Ports?.find(p => p.Direction === 'output');
    if (!port) return null;
    return {
      ID: port.ID,
      Side: port.Side ?? 'bottom',
      Multiple: port.Multiple !== false,
      Disabled: port.Disabled === true,
      Label: port.Label
    };
  }

  /** All output ports on this node (enables multi-branch Decision outputs while remaining 100% back-compatible). */
  public get OutputPorts(): Array<{ ID: string; Side: string; Multiple: boolean; Disabled: boolean; Label?: string }> {
    return (this.Node?.Ports ?? [])
      .filter(p => p.Direction === 'output')
      .map(port => ({
        ID: port.ID,
        Side: port.Side ?? 'bottom',
        Multiple: port.Multiple !== false,
        Disabled: port.Disabled === true,
        Label: port.Label
      }));
  }

  /** True when live `NodeProgress` telemetry is available for this node. */
  public get HasLiveProgress(): boolean {
    return Boolean(this.Node?.ProgressMessage) || typeof this.Node?.ProgressPercent === 'number';
  }

  /** True when X-Ray mode has telemetry to show inside the card. */
  public get ShowXRayPanel(): boolean {
    if (!this.XRayEnabled || !this.Node) return false;
    return Boolean(
      (this.Node.XRayItems && this.Node.XRayItems.length > 0) ||
      this.Node.Confidence ||
      this.Node.TaintState ||
      this.Node.SagaCompensationLabel ||
      this.Node.CanStepSingle
    );
  }

  public OnBreakpointClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.BreakpointClicked.emit(this.Node);
  }

  public OnQuickAddClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.QuickAddClicked.emit(this.Node);
  }

  public OnRunStepClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.RunStepClicked.emit(this.Node);
  }

  // ── Loop Node Properties ───────────────────────────────────

  /** Whether this node represents a loop (ForEach/While in Flow or ForEachTask/WhileTask in TaskGraph). */
  get isLoopNode(): boolean {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    const t = this.Node?.Type;
    return t === 'ForEach' || t === 'While' || t === 'ForEachTask' || t === 'WhileTask';
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
