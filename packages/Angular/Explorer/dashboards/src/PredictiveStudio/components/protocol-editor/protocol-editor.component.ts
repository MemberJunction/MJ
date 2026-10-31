import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import {
  ProtocolEdits, EvaluationProtocolRules,
  type Actor, type EvaluationProtocolDraft, type EvaluationProtocolSpec, type PredictionUnitSpec, type ProperScore, type ProtocolEditForm,
} from '@memberjunction/predictive-studio-core';

/**
 * L1 widget: edits the form fields of a protocol version into the next version's draft and previews the server's
 * refusals — the unit-independent rules always (`ValidateEvaluationProtocol`, including the guard-field author rule)
 * and the unit-dependent rules when a pipeline binds the protocol to a unit (`ValidateProtocolForUnit`). Emits the
 * draft; saving it is the host's job.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-protocol-editor',
  imports: [CommonModule, FormsModule, MJButtonDirective],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Base !== null) {
      <form class="ps-form" (ngSubmit)="Save()">
        <label for="ps-name">Name</label><input id="ps-name" type="text" name="name" [(ngModel)]="Form.Name" (ngModelChange)="Recompute()" />
        @if (IsDateCarved) {
          <label for="ps-cutoff">Test set starts</label><input id="ps-cutoff" type="date" name="cutoff" [(ngModel)]="Form.Cutoff" (ngModelChange)="Recompute()" />
          <label for="ps-end">Test set ends (optional)</label><input id="ps-end" type="date" name="end" [(ngModel)]="Form.HoldoutEnd" (ngModelChange)="Recompute()" />
        }
        <label for="ps-folds">Folds</label><input id="ps-folds" type="number" min="2" name="folds" [(ngModel)]="Form.Folds" (ngModelChange)="Recompute()" />
        <label for="ps-repeats">Repeats</label><input id="ps-repeats" type="number" min="1" name="repeats" [(ngModel)]="Form.Repeats" (ngModelChange)="Recompute()" />
        <label for="ps-metric">Primary score</label>
        <select id="ps-metric" name="metric" data-testid="ps-protocol-metric" [(ngModel)]="Form.PrimaryMetric" (ngModelChange)="Recompute()">
          @for (m of Metrics; track m) { <option [value]="m">{{ m }}</option> }
        </select>
        <label for="ps-margin">Margin</label><input id="ps-margin" type="number" min="0" step="0.001" name="margin" [(ngModel)]="Form.Margin" (ngModelChange)="Recompute()" />
        <label for="ps-cands">Max candidates</label><input id="ps-cands" type="number" min="1" name="cands" [(ngModel)]="Form.MaxCandidates" (ngModelChange)="Recompute()" />
        <label for="ps-secs">Max compute seconds</label><input id="ps-secs" type="number" min="1" name="secs" [(ngModel)]="Form.MaxComputeSeconds" (ngModelChange)="Recompute()" />
        <label for="ps-seed">Seed</label><input id="ps-seed" type="number" name="seed" [(ngModel)]="Form.Seed" (ngModelChange)="Recompute()" />
        <label for="ps-guard">Guard fields changed by</label>
        <select id="ps-guard" name="guard" data-testid="ps-protocol-guard-policy" [(ngModel)]="Form.GuardFieldsEditableBy" (ngModelChange)="Recompute()">
          <option value="non-agent">protocol configuration (never an agent tool call)</option>
          <option value="human-only">users only</option>
        </select>
      </form>
      @if (Problems.length > 0) {
        <ul class="ps-refusals" data-testid="ps-protocol-refusals">@for (p of Problems; track p) { <li>{{ p }}</li> }</ul>
      }
      <div class="ps-form-actions">
        <button mjButton variant="primary" size="sm" type="button" data-testid="ps-protocol-save" [disabled]="Draft === null" (click)="Save()">Save as next version</button>
        <button mjButton variant="outline" size="sm" type="button" data-testid="ps-protocol-cancel" (click)="Cancelled.emit()">Cancel</button>
      </div>
    }
  `,
})
export class PSProtocolEditorComponent {
  private _base: EvaluationProtocolSpec | null = null;
  private _unit: PredictionUnitSpec | null = null;
  private _author: Actor = { kind: 'system', component: 'ps-protocol-editor' };

  /** The version being edited; the form starts from it and the draft is its next version. */
  @Input()
  public get Base(): EvaluationProtocolSpec | null { return this._base; }
  public set Base(value: EvaluationProtocolSpec | null) {
    this._base = value;
    if (value === null) return;
    this.Form = ProtocolEdits.ProtocolEditFormFrom(value);
    this.Metrics = ProtocolEdits.PrimaryMetricOptions(value.primaryScore.family);
    this.Recompute();
  }

  /** The unit of a pipeline bound to this protocol lineage; null when no pipeline binds it yet. */
  @Input()
  public get Unit(): PredictionUnitSpec | null { return this._unit; }
  public set Unit(value: PredictionUnitSpec | null) {
    this._unit = value;
    this.Recompute();
  }

  /** Who authors the next version; the guard-field rule reads it. */
  @Input()
  public get Author(): Actor { return this._author; }
  public set Author(value: Actor) {
    this._author = value;
    this.Recompute();
  }

  /** The next version's draft, emitted only when no refusal applies. */
  @Output() SaveRequested = new EventEmitter<EvaluationProtocolDraft>();
  @Output() Cancelled = new EventEmitter<void>();

  public Form: ProtocolEditForm = PSProtocolEditorComponent.blankForm();
  public Metrics: readonly ProperScore['metric'][] = [];
  /** The draft the form makes; null while the form or a refusal blocks saving. */
  public Draft: EvaluationProtocolDraft | null = null;
  public Problems: readonly string[] = [];

  public get IsDateCarved(): boolean {
    return this._base !== null && this._base.holdout.kind === 'date-carved';
  }

  /** Re-applies the form to the base version and previews the server's refusals. */
  public Recompute(): void {
    const base = this._base;
    if (base === null) return;
    const r = ProtocolEdits.ApplyProtocolEdits(base, this.Form);
    if (!r.Ok) {
      this.Draft = null;
      this.Problems = [r.Error];
      return;
    }
    const preview: EvaluationProtocolSpec = { ...r.Draft, id: base.id, lineageRootId: base.lineageRootId, version: base.version + 1, authoredBy: this._author };
    const refusals = [
      ...EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: preview, Previous: base, AuthoredBy: this._author }),
      ...(this._unit === null ? [] : EvaluationProtocolRules.ValidateProtocolForUnit(preview, this._unit)),
    ];
    this.Problems = refusals.map((refusal) => EvaluationProtocolRules.DescribeProtocolRefusal(refusal));
    this.Draft = refusals.length === 0 ? r.Draft : null;
  }

  public Save(): void {
    if (this.Draft !== null) this.SaveRequested.emit(this.Draft);
  }

  /** The form before a base version arrives (never shown: the template renders only with a base). */
  private static blankForm(): ProtocolEditForm {
    return {
      Name: '', Cutoff: '', HoldoutEnd: '', Folds: 5, Repeats: 1, PrimaryMetric: 'log-loss', Margin: 0, MaxComputeSeconds: 3600,
      MaxCandidates: 1, Seed: 0, GuardFieldsEditableBy: 'non-agent',
    };
  }
}
