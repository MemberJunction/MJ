import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

/** One criterion: parent, weight, a named scale, anchors for that scale, gate, and not-applicable policy. */
@Component({
    standalone: true,
    selector: 'mj-rubric-criterion-editor',
    styleUrls: ['./rubric-builder.component.css'],
    template: `
      <section class="card" aria-label="Criterion">
        <h3><i class="fa-solid fa-scale-balanced"></i> Criterion</h3>
        @if (ReadOnly) {
          <div class="editor-grid">
            <p><span class="eyebrow">Name</span> {{ Name }}</p>
            <p><span class="eyebrow">Key</span> {{ Key }}</p>
            <p><span class="eyebrow">Type</span> {{ NodeType }}</p>
            <p><span class="eyebrow">Parent</span> {{ ParentLabel }}</p>
            <p><span class="eyebrow">Weight</span> {{ Weight }}</p>
            <p><span class="eyebrow">Scale</span> {{ ScaleLabel }}</p>
          </div>
          <p><span class="eyebrow">Quality gate</span> {{ IsGate ? 'On, minimum ' + GateMinimumScore : 'Off' }}</p>
          <p><span class="eyebrow">Description</span> {{ Description || '—' }}</p>
          <p><span class="eyebrow">Guidance</span> {{ Guidance || '—' }}</p>
          <p><span class="eyebrow">Rollup</span> {{ RollupMethod || 'Default' }}</p>
          <p><span class="eyebrow">Advisory</span> {{ IsAdvisory ? 'Yes' : 'No' }}</p>
          <p><span class="eyebrow">Evidence required</span> {{ EvidenceRequired ? 'Yes' : 'No' }}</p>
          <p><span class="eyebrow">Rationale required</span> {{ RationaleRequired ? 'Yes' : 'No' }}</p>
          <p><span class="eyebrow">Not applicable</span> {{ NotApplicablePolicy || 'Version default' }}</p>
        } @else {
        <div class="editor-grid">
          <label>Parent
            <select [value]="ParentId ?? ''" (change)="ParentIdChange.emit(valueOf($event) || null)">
              <option value="">Top</option>
              @for (parent of Parents; track parent.id) { <option [value]="parent.id">{{ parent.name }}</option> }
            </select>
          </label>
          <label>Weight <span class="fact">{{ Share }}%</span>
            <input type="number" [value]="Weight" (change)="WeightChange.emit(numberOf($event))">
          </label>
          <label>Scale
            <select [value]="MatchedScaleId" (change)="ScaleIdChange.emit(valueOf($event) || null)">
              <option value="">None</option>
              @for (scale of Scales; track scale.id) { <option [value]="scale.id">{{ scale.name }}</option> }
            </select>
          </label>
        </div>
        <div class="anchor-box">
          <div class="box-title">Scale anchors</div>
          <div class="rubric-split">
            @for (level of Levels; track level.id; let first = $first) {
              <label class="anchor" [class.anchor-meet]="first" [class.filled]="Anchor(level.id)">{{ level.label }}
                <input [value]="Anchor(level.id)" (change)="SetAnchor(level.id, valueOf($event))">
              </label>
            }
          </div>
        </div>
        <div class="gate-box">
          <label class="gate-check">
            <input type="checkbox" [checked]="IsGate" (change)="IsGateChange.emit(checked($event))">
            <span><strong>Quality gate</strong><small>A score under the minimum fails the evaluation.</small></span>
          </label>
          @if (IsGate) {
            <label class="gate-min">Minimum <input type="number" min="0" max="1" step="0.1" [value]="GateMinimumScore ?? ''" (change)="GateMinimumScoreChange.emit(valueOf($event) === '' ? null : numberOf($event))"></label>
          }
        </div>
        <div class="editor-grid">
          <label>Name <input [value]="Name" (change)="NameChange.emit(valueOf($event))"></label>
          <label>Key <input [value]="Key" (change)="KeyChange.emit(valueOf($event))"></label>
          <label>Type
            <select [value]="NodeType" (change)="NodeTypeChange.emit(valueOf($event))">
              <option value="Criterion">Criterion</option>
              <option value="Group">Group</option>
            </select>
          </label>
          <label>Rollup
            <select [value]="RollupMethod ?? ''" (change)="RollupMethodChange.emit(valueOf($event) || null)">
              <option value="">Default</option>
              <option value="WeightedMean">Weighted mean</option>
              <option value="Minimum">Minimum</option>
              <option value="Maximum">Maximum</option>
            </select>
          </label>
        </div>
        <label class="stack-field">Description <textarea [value]="Description ?? ''" (change)="DescriptionChange.emit(valueOf($event))"></textarea></label>
        <label class="stack-field">Guidance <textarea [value]="Guidance ?? ''" (change)="GuidanceChange.emit(valueOf($event))"></textarea></label>
        <label class="gate-check"><input type="checkbox" [checked]="IsAdvisory" (change)="IsAdvisoryChange.emit(checked($event))"> Advisory</label>
        <label class="gate-check"><input type="checkbox" [checked]="EvidenceRequired" (change)="EvidenceRequiredChange.emit(checked($event))"> Evidence required</label>
        <label class="gate-check"><input type="checkbox" [checked]="RationaleRequired" (change)="RationaleRequiredChange.emit(checked($event))"> Rationale required</label>
        <label class="stack-field">Not applicable
          <select [value]="NotApplicablePolicy ?? ''" (change)="NotApplicablePolicyChange.emit(valueOf($event) || null)">
            <option value="">Version default</option>
            <option value="ExcludeAndRedistribute">Exclude and redistribute</option>
            <option value="CountAsZero">Count as zero</option>
            <option value="FailEvaluation">Fail the evaluation</option>
            <option value="NotAllowed">Not allowed</option>
          </select>
        </label>
        }
      </section>
    `,
})
export class RubricCriterionEditorComponent {
    @Input() ParentId: string | null = null;
    @Input() Parents: { id: string; name: string }[] = [];
    @Input() Weight = 1;
    @Input() Share = 100;
    @Input() ScaleId: string | null = null;
    @Input() Scales: { id: string; name: string; levels: { id: string; label: string }[] }[] = [];
    @Input() Anchors: { scaleLevelId: string | null; descriptor: string }[] = [];
    @Input() IsGate = false;
    @Input() GateMinimumScore: number | null = null;
    @Input() NotApplicablePolicy: string | null = null;
    @Input() Name = '';
    @Input() Key = '';
    @Input() NodeType = 'Criterion';
    @Input() Description: string | null = null;
    @Input() Guidance: string | null = null;
    @Input() IsAdvisory = false;
    @Input() RollupMethod: string | null = null;
    @Input() EvidenceRequired = false;
    @Input() RationaleRequired = false;
    @Input() ReadOnly = false;
    @Output() NameChange = new EventEmitter<string>();
    @Output() KeyChange = new EventEmitter<string>();
    @Output() NodeTypeChange = new EventEmitter<string>();
    @Output() DescriptionChange = new EventEmitter<string>();
    @Output() GuidanceChange = new EventEmitter<string>();
    @Output() IsAdvisoryChange = new EventEmitter<boolean>();
    @Output() RollupMethodChange = new EventEmitter<string | null>();
    @Output() EvidenceRequiredChange = new EventEmitter<boolean>();
    @Output() RationaleRequiredChange = new EventEmitter<boolean>();
    @Output() ParentIdChange = new EventEmitter<string | null>();
    @Output() IsGateChange = new EventEmitter<boolean>();
    @Output() WeightChange = new EventEmitter<number>();
    @Output() ScaleIdChange = new EventEmitter<string | null>();
    @Output() AnchorsChange = new EventEmitter<{ scaleLevelId: string | null; descriptor: string }[]>();
    @Output() GateMinimumScoreChange = new EventEmitter<number | null>();
    @Output() NotApplicablePolicyChange = new EventEmitter<string | null>();
    protected get ParentLabel(): string {
        return this.Parents.find(parent => parent.id === this.ParentId)?.name || 'Top';
    }
    protected get ScaleLabel(): string {
        return this.Scales.find(scale => scale.id.toLowerCase() === (this.ScaleId ?? '').toLowerCase())?.name || 'None';
    }
    protected get MatchedScaleId(): string {
        const id = (this.ScaleId ?? '').toLowerCase();
        return this.Scales.find(scale => scale.id.toLowerCase() === id)?.id ?? '';
    }
    protected get Levels(): { id: string; label: string }[] {
        return this.Scales.find(scale => scale.id.toLowerCase() === (this.ScaleId ?? '').toLowerCase())?.levels ?? [];
    }
    protected Anchor(levelId: string): string {
        return this.Anchors.find(anchor => (anchor.scaleLevelId ?? '').toLowerCase() === levelId.toLowerCase())?.descriptor ?? '';
    }
    protected SetAnchor(levelId: string, descriptor: string): void {
        const next = this.Anchors.filter(anchor => anchor.scaleLevelId !== levelId);
        if (descriptor) next.push({ scaleLevelId: levelId, descriptor });
        this.AnchorsChange.emit(next);
    }
    protected valueOf(event: Event): string { return (event.target as HTMLInputElement | HTMLSelectElement).value; }
    protected numberOf(event: Event): number { return Number((event.target as HTMLInputElement).value); }
    protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
}

/** One answer: level or value, not applicable, rationale, and evidence. */
@Component({
    standalone: true,
    selector: 'mj-rubric-score-editor',
    imports: [MJButtonDirective],
    styleUrls: ['./rubric-builder.component.css'],
    template: `<section class="card" aria-label="Score">
      <h3><i class="fa-solid fa-list-check"></i> Score</h3>
      @if (ReadOnly) {
        <p><span class="eyebrow">Level</span> {{ LevelLabel }}</p>
        <p><span class="eyebrow">Not applicable</span> {{ IsNotApplicable ? 'Yes' : 'No' }}</p>
        <p><span class="eyebrow">Rationale</span> {{ Rationale || '—' }}</p>
        <p><span class="eyebrow">Evidence</span> {{ Evidence || '—' }}</p>
      } @else {
      <div class="anchor-box">
        <div class="box-title">Choose a level</div>
        <div class="rubric-split">
          @for (level of Levels; track level.id) {
            <button mjButton variant="outline" size="sm" type="button" class="anchor" [class.filled]="ScaleLevelId === level.id" [attr.aria-pressed]="ScaleLevelId === level.id" (click)="ScaleLevelIdChange.emit(level.id)">
              <strong>{{ level.label }}</strong>
              <span>{{ level.normalizedValue }}</span>
              <span>{{ level.anchor }}</span>
            </button>
          }
        </div>
      </div>
      <div class="gate-box">
        <label class="gate-check">
          <input type="checkbox" [checked]="IsNotApplicable" [disabled]="NotApplicablePolicy === 'NotAllowed'" (change)="IsNotApplicableChange.emit(checked($event))">
          <span><strong>Not applicable</strong>@if (NotApplicablePolicy === 'NotAllowed') { <small>Not allowed</small> }</span>
        </label>
      </div>
      <label class="stack-field">Rationale <textarea required [value]="Rationale ?? ''" (change)="RationaleChange.emit(valueOf($event))"></textarea></label>
      <label class="stack-field">Evidence <textarea [value]="Evidence ?? ''" (change)="EvidenceChange.emit(valueOf($event))"></textarea></label>
      }
    </section>`,
})
export class RubricScoreEditorComponent {
    @Input() ScaleLevelId: string | null = null;
    @Input() RawValue: number | null = null;
    @Input() IsNotApplicable = false;
    @Input() Rationale: string | null = null;
    @Input() Evidence: string | null = null;
    @Input() NotApplicablePolicy: string | null = null;
    @Input() Levels: { id: string; label: string; normalizedValue: number; anchor: string }[] = [];
    @Input() ReadOnly = false;
    @Output() ScaleLevelIdChange = new EventEmitter<string | null>();
    @Output() RawValueChange = new EventEmitter<number | null>();
    @Output() IsNotApplicableChange = new EventEmitter<boolean>();
    @Output() RationaleChange = new EventEmitter<string>();
    @Output() EvidenceChange = new EventEmitter<string>();
    protected get LevelLabel(): string {
        return this.Levels.find(level => level.id === this.ScaleLevelId)?.label || '—';
    }
    protected valueOf(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }
    protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
}

/** Scale type, range, and direction. Levels are a separate record. */
@Component({
    standalone: true,
    selector: 'mj-rubric-scale-fields',
    styleUrls: ['./rubric-builder.component.css'],
    template: `
      <label>Type <input [value]="ScaleType" (change)="ScaleTypeChange.emit(text($event))"></label>
      <label>Min <input type="number" [value]="MinValue ?? ''" (change)="MinValueChange.emit(optionalNumber($event))"></label>
      <label>Max <input type="number" [value]="MaxValue ?? ''" (change)="MaxValueChange.emit(optionalNumber($event))"></label>
      <label><input type="checkbox" [checked]="HigherIsBetter" (change)="HigherIsBetterChange.emit(checked($event))"> Higher is better</label>
    `,
})
export class RubricScaleFieldsComponent {
    @Input() ScaleType = 'Levels';
    @Input() MinValue: number | null = null;
    @Input() MaxValue: number | null = null;
    @Input() HigherIsBetter = true;
    @Output() ScaleTypeChange = new EventEmitter<string>();
    @Output() MinValueChange = new EventEmitter<number | null>();
    @Output() MaxValueChange = new EventEmitter<number | null>();
    @Output() HigherIsBetterChange = new EventEmitter<boolean>();
    protected text(event: Event): string { return (event.target as HTMLInputElement).value; }
    protected optionalNumber(event: Event): number | null {
        const value = (event.target as HTMLInputElement).value;
        return value === '' ? null : Number(value);
    }
    protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
}

/** Label and description. Value edits stay blocked once the scale is frozen. */
@Component({
    standalone: true,
    selector: 'mj-rubric-scale-level-editor',
    styleUrls: ['./rubric-builder.component.css'],
    template: `
      <section class="card" aria-label="Scale level">
        <h3><i class="fa-solid fa-tag"></i> Level</h3>
        @if (ReadOnly) {
          <p><span class="eyebrow">Label</span> {{ Label }}</p>
          <p><span class="eyebrow">Value</span> {{ Value }}@if (Frozen) { <span class="pill-major">Locked</span> }</p>
          <p><span class="eyebrow">Normalized</span> {{ NormalizedValue }}</p>
          <p><span class="eyebrow">Description</span> {{ Description || '—' }}</p>
        } @else {
        <div class="editor-grid">
          <label>Label <input [value]="Label" (change)="LabelChange.emit(text($event))"></label>
          <label>Value <input type="number" [value]="Value" [disabled]="Frozen" (change)="ValueChange.emit(asNumber($event))">@if (Frozen) { <span class="pill-major">Locked</span> }</label>
          <label>Normalized <input type="number" [value]="NormalizedValue" [disabled]="Frozen" (change)="NormalizedValueChange.emit(asNumber($event))"></label>
        </div>
        <label class="stack-field">Description <textarea [value]="Description ?? ''" (change)="DescriptionChange.emit(text($event))"></textarea></label>
        }
      </section>
    `,
})
export class RubricScaleLevelEditorComponent {
    @Input() Label = '';
    @Input() Description: string | null = null;
    @Input() Value = 0;
    @Input() NormalizedValue = 0;
    @Input() Frozen = false;
    @Input() ReadOnly = false;
    @Output() LabelChange = new EventEmitter<string>();
    @Output() DescriptionChange = new EventEmitter<string>();
    @Output() ValueChange = new EventEmitter<number>();
    @Output() NormalizedValueChange = new EventEmitter<number>();
    protected text(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }
    protected asNumber(event: Event): number { return Number(this.text(event)); }
}

/** Band label, range, and description. */
@Component({
    standalone: true,
    selector: 'mj-rubric-band-editor',
    styleUrls: ['./rubric-builder.component.css'],
    template: `
      <section class="card" aria-label="Band">
        <h3><i class="fa-solid fa-award"></i> Band</h3>
        @if (ReadOnly) {
          <p><span class="eyebrow">Label</span> {{ Label }}</p>
          <p><span class="eyebrow">From</span> {{ MinScore }}</p>
          <p><span class="eyebrow">To</span> {{ MaxScore }}</p>
          <p><span class="eyebrow">Tone</span> {{ DisplayTone }}</p>
          <p><span class="eyebrow">Sequence</span> {{ Sequence }}</p>
          <p><span class="eyebrow">Description</span> {{ Description || '—' }}</p>
        } @else {
        <label class="stack-field">Label <input [value]="Label" (change)="LabelChange.emit(text($event))"></label>
        <div class="editor-grid">
          <label>From <input type="number" [value]="MinScore" (change)="MinScoreChange.emit(asNumber($event))"></label>
          <label>To <input type="number" [value]="MaxScore" (change)="MaxScoreChange.emit(asNumber($event))"></label>
          <label>Tone
            <select [value]="DisplayTone" (change)="DisplayToneChange.emit(text($event))">
              <option>Neutral</option>
              <option>Success</option>
              <option>Info</option>
              <option>Warning</option>
              <option>Error</option>
            </select>
          </label>
          <label>Sequence <input type="number" [value]="Sequence" (change)="SequenceChange.emit(asNumber($event))"></label>
          <p class="fact">Span {{ MinScore }}–{{ MaxScore }}</p>
        </div>
        <span class="rubric-track"><span class="rubric-bar" [style.width.%]="SpanWidth()"></span></span>
        <label class="stack-field">Description <textarea [value]="Description ?? ''" (change)="DescriptionChange.emit(text($event))"></textarea></label>
        }
      </section>
    `,
})
export class RubricBandEditorComponent {
    @Input() Label = '';
    @Input() MinScore = 0;
    @Input() MaxScore = 1;
    @Input() Description: string | null = null;
    @Input() DisplayTone = 'Neutral';
    @Input() Sequence = 0;
    @Input() ReadOnly = false;
    @Output() LabelChange = new EventEmitter<string>();
    @Output() MinScoreChange = new EventEmitter<number>();
    @Output() MaxScoreChange = new EventEmitter<number>();
    @Output() DescriptionChange = new EventEmitter<string>();
    @Output() DisplayToneChange = new EventEmitter<string>();
    @Output() SequenceChange = new EventEmitter<number>();
    protected text(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }
    protected asNumber(event: Event): number { return Number(this.text(event)); }
    protected SpanWidth(): number { return Math.min(100, Math.max(0, (Number(this.MaxScore) - Number(this.MinScore)) * 100)); }
}

/** Category name and parent. The parent list is the hierarchy. */
@Component({
    standalone: true,
    selector: 'mj-rubric-category-editor',
    styleUrls: ['./rubric-builder.component.css'],
    template: `
      <section class="card" aria-label="Category">
        <h3><i class="fa-solid fa-folder"></i> Category definition</h3>
        @if (ReadOnly) {
          <p><span class="eyebrow">Name</span> {{ Name }}</p>
          <p><span class="eyebrow">Parent</span> {{ ParentLabel }}</p>
          <p><span class="eyebrow">Description</span> {{ Description || '—' }}</p>
        } @else {
        <div class="editor-grid">
          <label class="stack-field">Name <input [value]="Name" (change)="NameChange.emit(text($event))"></label>
          <label class="stack-field">Parent
            <select [value]="ParentId ?? ''" (change)="ParentIdChange.emit(text($event) || null)">
              <option value="">None</option>
              @for (parent of Parents; track parent.id) {
                <option [value]="parent.id">{{ parent.name }}</option>
              }
            </select>
          </label>
        </div>
        <label class="stack-field">Description <textarea [value]="Description" (change)="DescriptionChange.emit(text($event))"></textarea></label>
        }
      </section>
    `,
})
export class RubricCategoryEditorComponent {
    @Input() Name = '';
    @Input() Description = '';
    @Input() ParentId: string | null = null;
    @Input() Parents: { id: string; name: string }[] = [];
    @Input() ReadOnly = false;
    @Output() NameChange = new EventEmitter<string>();
    @Output() DescriptionChange = new EventEmitter<string>();
    @Output() ParentIdChange = new EventEmitter<string | null>();
    protected get ParentLabel(): string {
        return this.Parents.find(parent => parent.id === this.ParentId)?.name || 'None';
    }
    protected text(event: Event): string { return (event.target as HTMLInputElement | HTMLSelectElement).value; }
}
