import { Component, EventEmitter, Input, Output } from '@angular/core';

/** One criterion: parent, weight, scale, gate, and not-applicable policy. Anchors stay on the tree editor. */
@Component({
    standalone: true,
    selector: 'mj-rubric-criterion-editor',
    template: `
      <label>Parent <input [value]="ParentId ?? ''" (change)="ParentIdChange.emit(valueOf($event) || null)"></label>
      <label>Weight <input type="number" [value]="Weight" (change)="WeightChange.emit(numberOf($event))"></label>
      <label>Scale <input [value]="ScaleId ?? ''" (change)="ScaleIdChange.emit(valueOf($event) || null)"></label>
      <label>Gate minimum <input type="number" [value]="GateMinimumScore ?? ''" (change)="GateMinimumScoreChange.emit(valueOf($event) === '' ? null : numberOf($event))"></label>
      <label>Not applicable <input [value]="NotApplicablePolicy ?? ''" (change)="NotApplicablePolicyChange.emit(valueOf($event) || null)"></label>
    `,
})
export class RubricCriterionEditorComponent {
    @Input() ParentId: string | null = null;
    @Input() Weight = 1;
    @Input() ScaleId: string | null = null;
    @Input() GateMinimumScore: number | null = null;
    @Input() NotApplicablePolicy: string | null = null;
    @Output() ParentIdChange = new EventEmitter<string | null>();
    @Output() WeightChange = new EventEmitter<number>();
    @Output() ScaleIdChange = new EventEmitter<string | null>();
    @Output() GateMinimumScoreChange = new EventEmitter<number | null>();
    @Output() NotApplicablePolicyChange = new EventEmitter<string | null>();
    protected valueOf(event: Event): string { return (event.target as HTMLInputElement).value; }
    protected numberOf(event: Event): number { return Number((event.target as HTMLInputElement).value); }
}

/** One answer: level or value, not applicable, rationale, and evidence. */
@Component({
    standalone: true,
    selector: 'mj-rubric-score-editor',
    template: `
      <label>Level <input [value]="ScaleLevelId ?? ''" (change)="ScaleLevelIdChange.emit(valueOf($event) || null)"></label>
      <label>Value <input type="number" [value]="RawValue ?? ''" (change)="RawValueChange.emit(valueOf($event) === '' ? null : Number(valueOf($event)))"></label>
      <label><input type="checkbox" [checked]="IsNotApplicable" (change)="IsNotApplicableChange.emit((($event.target) as HTMLInputElement).checked)"> Not applicable</label>
      <label>Rationale <textarea [value]="Rationale ?? ''" (change)="RationaleChange.emit(valueOf($event))"></textarea></label>
      <label>Evidence <textarea [value]="Evidence ?? ''" (change)="EvidenceChange.emit(valueOf($event))"></textarea></label>
    `,
})
export class RubricScoreEditorComponent {
    @Input() ScaleLevelId: string | null = null;
    @Input() RawValue: number | null = null;
    @Input() IsNotApplicable = false;
    @Input() Rationale: string | null = null;
    @Input() Evidence: string | null = null;
    @Output() ScaleLevelIdChange = new EventEmitter<string | null>();
    @Output() RawValueChange = new EventEmitter<number | null>();
    @Output() IsNotApplicableChange = new EventEmitter<boolean>();
    @Output() RationaleChange = new EventEmitter<string>();
    @Output() EvidenceChange = new EventEmitter<string>();
    protected valueOf(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }
}

/** Scale type, range, and direction. Levels are a separate record. */
@Component({
    standalone: true,
    selector: 'mj-rubric-scale-fields',
    template: `
      <label>Type <input [value]="ScaleType" (change)="ScaleTypeChange.emit(text($event))"></label>
      <label>Min <input type="number" [value]="MinValue ?? ''" (change)="MinValueChange.emit(optionalNumber($event))"></label>
      <label>Max <input type="number" [value]="MaxValue ?? ''" (change)="MaxValueChange.emit(optionalNumber($event))"></label>
      <label><input type="checkbox" [checked]="HigherIsBetter" (change)="HigherIsBetterChange.emit((($event.target) as HTMLInputElement).checked)"> Higher is better</label>
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
}

/** Label and description. Value edits stay blocked once the scale is frozen. */
@Component({
    standalone: true,
    selector: 'mj-rubric-scale-level-editor',
    template: `
      <label>Label <input [value]="Label" (change)="LabelChange.emit(text($event))"></label>
      <label>Description <textarea [value]="Description ?? ''" (change)="DescriptionChange.emit(text($event))"></textarea></label>
      <label>Value <input type="number" [value]="Value" [disabled]="Frozen" (change)="ValueChange.emit(Number(text($event)))"></label>
      <label>Normalized <input type="number" [value]="NormalizedValue" [disabled]="Frozen" (change)="NormalizedValueChange.emit(Number(text($event)))"></label>
    `,
})
export class RubricScaleLevelEditorComponent {
    @Input() Label = '';
    @Input() Description: string | null = null;
    @Input() Value = 0;
    @Input() NormalizedValue = 0;
    @Input() Frozen = false;
    @Output() LabelChange = new EventEmitter<string>();
    @Output() DescriptionChange = new EventEmitter<string>();
    @Output() ValueChange = new EventEmitter<number>();
    @Output() NormalizedValueChange = new EventEmitter<number>();
    protected text(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }
}

/** Band label, range, and description. */
@Component({
    standalone: true,
    selector: 'mj-rubric-band-editor',
    template: `
      <label>Label <input [value]="Label" (change)="LabelChange.emit(text($event))"></label>
      <label>From <input type="number" [value]="MinScore" (change)="MinScoreChange.emit(Number(text($event)))"></label>
      <label>To <input type="number" [value]="MaxScore" (change)="MaxScoreChange.emit(Number(text($event)))"></label>
      <label>Description <textarea [value]="Description ?? ''" (change)="DescriptionChange.emit(text($event))"></textarea></label>
    `,
})
export class RubricBandEditorComponent {
    @Input() Label = '';
    @Input() MinScore = 0;
    @Input() MaxScore = 1;
    @Input() Description: string | null = null;
    @Output() LabelChange = new EventEmitter<string>();
    @Output() MinScoreChange = new EventEmitter<number>();
    @Output() MaxScoreChange = new EventEmitter<number>();
    @Output() DescriptionChange = new EventEmitter<string>();
    protected text(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }
}

/** Category name and parent. The parent list is the hierarchy. */
@Component({
    standalone: true,
    selector: 'mj-rubric-category-editor',
    template: `
      <label>Name <input [value]="Name" (change)="NameChange.emit(text($event))"></label>
      <label>Parent
        <select [value]="ParentId ?? ''" (change)="ParentIdChange.emit(text($event) || null)">
          <option value="">— None —</option>
          @for (parent of Parents; track parent.id) {
            <option [value]="parent.id">{{ parent.name }}</option>
          }
        </select>
      </label>
    `,
})
export class RubricCategoryEditorComponent {
    @Input() Name = '';
    @Input() ParentId: string | null = null;
    @Input() Parents: { id: string; name: string }[] = [];
    @Output() NameChange = new EventEmitter<string>();
    @Output() ParentIdChange = new EventEmitter<string | null>();
    protected text(event: Event): string { return (event.target as HTMLInputElement | HTMLSelectElement).value; }
}
