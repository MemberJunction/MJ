import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import {
  PredictionUnit, UnitEdits,
  type PredictionUnitSpec, type UnitDraft, type UnitEditForm,
} from '@memberjunction/predictive-studio-core';

/** What the unit editor emits: the next version's draft and the label version it must carry. */
export interface UnitSaveRequest {
  readonly Draft: UnitDraft;
  readonly LabelVersion: number;
}

/** The task kinds the form authors, in the order the select lists them. */
const TASK_KIND_OPTIONS = ['binary', 'multiclass', 'continuous', 'count', 'non-negative'] as const satisfies readonly UnitEditForm['TaskKind'][];

/**
 * L1 widget: edits a Prediction Unit version (or version 1 when `Base` is null) into the next version's draft through
 * `UnitEdits.ApplyUnitEdits`, shows its error and the label version the draft will carry, and emits the draft. Rules
 * the form cannot express (a grain-x-periods row rule, a next-period or child-event outcome, a forecast task) are shown
 * read-only and carried over. Saving is the host's job; the server re-checks the label version and references.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-unit-editor',
  imports: [CommonModule, FormsModule, MJButtonDirective],
  styleUrls: ['../ps-widgets.css'],
  template: `
    <form class="ps-form" (ngSubmit)="Save()">
      <label for="ps-unit-name">Name</label><input class="mj-input" id="ps-unit-name" type="text" name="name" [(ngModel)]="Form.Name" (ngModelChange)="Recompute()" />
      @if (RowsCarried) {
        <span class="ps-note">One row is</span><span class="ps-note" data-testid="ps-unit-rows-carried">{{ CarriedRowsText }} (carried over; edit it as JSON on the record)</span>
      } @else {
        <label for="ps-unit-entity">Entity whose records are the rows</label><input class="mj-input" id="ps-unit-entity" type="text" name="entity" [(ngModel)]="Form.GrainEntity" (ngModelChange)="Recompute()" />
        <label for="ps-unit-date">Decision-date column</label><input class="mj-input" id="ps-unit-date" type="text" name="date" [(ngModel)]="Form.DecisionDateColumn" (ngModelChange)="Recompute()" />
      }
      @if (RuleCarried) {
        <span class="ps-note">Outcome</span><span class="ps-note" data-testid="ps-unit-rule-carried">{{ CarriedRuleText }} (carried over; edit it as JSON on the record)</span>
      } @else {
        <label for="ps-unit-label">Outcome column</label><input class="mj-input" id="ps-unit-label" type="text" name="label" [(ngModel)]="Form.LabelColumn" (ngModelChange)="Recompute()" />
      }
      <label for="ps-unit-window">Outcome window (days)</label>
      <input class="mj-input" id="ps-unit-window" type="number" min="1" name="window" data-testid="ps-unit-window" [(ngModel)]="Form.WindowDays" (ngModelChange)="Recompute()" />
      <label for="ps-unit-gap">Gap before the window (days)</label><input class="mj-input" id="ps-unit-gap" type="number" min="0" name="gap" [(ngModel)]="Form.GapDays" (ngModelChange)="Recompute()" />
      <label for="ps-unit-task">Task</label>
      <select class="mj-input" id="ps-unit-task" name="task" data-testid="ps-unit-task" [disabled]="IsForecast" [(ngModel)]="Form.TaskKind" (ngModelChange)="Recompute()">
        @for (k of TaskKinds; track k) { <option [value]="k">{{ k }}</option> }
      </select>
      @if (IsClassification) {
        <label for="ps-unit-classes">Classes in artifact order</label><input class="mj-input" id="ps-unit-classes" type="text" name="classes" [(ngModel)]="Form.ClassOrder" (ngModelChange)="Recompute()" />
        <label for="ps-unit-adverse">Adverse class{{ Form.TaskKind === 'multiclass' ? 'es' : '' }}</label><input class="mj-input" id="ps-unit-adverse" type="text" name="adverse" [(ngModel)]="Form.AdverseClass" (ngModelChange)="Recompute()" />
      }
      @if (Form.TaskKind === 'non-negative' && !IsForecast) {
        <label for="ps-unit-tweedie">Tweedie power</label><input class="mj-input" id="ps-unit-tweedie" type="number" min="1" max="2" step="0.1" name="tweedie" [(ngModel)]="Form.TweediePower" (ngModelChange)="Recompute()" />
      }
      <label for="ps-unit-censoring">Leave out rows unresolved at</label>
      <select class="mj-input" id="ps-unit-censoring" name="censoring" [(ngModel)]="Form.CensoringMode" (ngModelChange)="Recompute()">
        <option value="now">now</option>
        <option value="fixed">a fixed date</option>
        @if (OffersCorpusEnd) { <option value="corpus-end">the end of the corpus (carried over)</option> }
      </select>
      @if (Form.CensoringMode === 'fixed') {
        <label for="ps-unit-fixed">Censoring date</label><input class="mj-input" id="ps-unit-fixed" type="date" name="fixed" [(ngModel)]="Form.CensoringFixedAt" (ngModelChange)="Recompute()" />
      }
      <label for="ps-unit-group">Group key (optional)</label><input class="mj-input" id="ps-unit-group" type="text" name="group" [(ngModel)]="Form.GroupKey" (ngModelChange)="Recompute()" />
    </form>
    @if (Error !== null) {
      <p class="ps-refusals" data-testid="ps-unit-error">{{ Error }}</p>
    } @else {
      <p class="ps-note" data-testid="ps-unit-label-version">Label version will be {{ LabelVersion }}</p>
    }
    <div class="ps-form-actions">
      <button mjButton variant="primary" size="sm" type="button" data-testid="ps-unit-save" [disabled]="Draft === null" (click)="Save()">{{ Base === null ? 'Save version 1' : 'Save as next version' }}</button>
      <button mjButton variant="outline" size="sm" type="button" data-testid="ps-unit-cancel" (click)="Cancelled.emit()">Cancel</button>
    </div>
  `,
})
export class PSUnitEditorComponent {
  private _base: PredictionUnitSpec | null = null;

  /** The version being edited; null = authoring version 1 of a new unit. */
  @Input()
  public get Base(): PredictionUnitSpec | null { return this._base; }
  public set Base(value: PredictionUnitSpec | null) {
    this._base = value;
    this.Form = value === null ? PSUnitEditorComponent.newUnitForm() : UnitEdits.UnitEditFormFrom(value);
    this.Recompute();
  }

  /** The next version's draft and label version, emitted only when the form is valid. */
  @Output() SaveRequested = new EventEmitter<UnitSaveRequest>();
  @Output() Cancelled = new EventEmitter<void>();

  public readonly TaskKinds: readonly UnitEditForm['TaskKind'][] = TASK_KIND_OPTIONS;
  public Form: UnitEditForm = PSUnitEditorComponent.newUnitForm();
  /** The draft the form makes; null while the form has a problem. */
  public Draft: UnitDraft | null = null;
  public LabelVersion = 1;
  public Error: string | null = null;

  constructor() {
    this.Recompute();
  }

  /** True when the base's row rule is not the form-editable kind (a column-dated grain). */
  public get RowsCarried(): boolean {
    const b = this._base;
    return b !== null && (b.rows.kind === 'grain-x-periods' || b.rows.decisionDate.kind !== 'column');
  }

  /** True when the base's outcome rule is not a column of the row. */
  public get RuleCarried(): boolean {
    return this._base !== null && this._base.label.rule.kind !== 'column';
  }

  public get CarriedRowsText(): string {
    return this._base === null ? '' : `${PredictionUnit.UnitRowEntityName(this._base.rows)} (${this._base.rows.kind})`;
  }

  public get CarriedRuleText(): string {
    return this._base === null ? '' : PredictionUnit.DescribeLabelRule(this._base);
  }

  /** A forecast task is carried over: the task select is disabled. */
  public get IsForecast(): boolean {
    return this._base !== null && this._base.label.outcome.kind === 'forecast';
  }

  public get IsClassification(): boolean {
    return !this.IsForecast && (this.Form.TaskKind === 'binary' || this.Form.TaskKind === 'multiclass');
  }

  /** `corpus-end` names an entity and a date field the form cannot edit, so it is offered only when the base uses it. */
  public get OffersCorpusEnd(): boolean {
    return this._base !== null && this._base.censoring.cutoff.kind === 'corpus-end';
  }

  /** Re-applies the form to the base version. */
  public Recompute(): void {
    const r = UnitEdits.ApplyUnitEdits(this._base, this.Form);
    if (!r.Ok) {
      this.Draft = null;
      this.Error = r.Error;
      return;
    }
    this.Draft = r.Draft;
    this.LabelVersion = r.LabelVersion;
    this.Error = null;
  }

  public Save(): void {
    if (this.Draft !== null) this.SaveRequested.emit({ Draft: this.Draft, LabelVersion: this.LabelVersion });
  }

  /** The form of a new unit: a binary outcome over a year, censored at now. */
  private static newUnitForm(): UnitEditForm {
    return {
      Name: '', GrainEntity: '', DecisionDateColumn: '', LabelColumn: '', WindowDays: 365, GapDays: 0, TaskKind: 'binary',
      ClassOrder: '', AdverseClass: '', TweediePower: 1.5, CensoringMode: 'now', CensoringFixedAt: '', GroupKey: '',
    };
  }
}
