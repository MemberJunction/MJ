import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { driftDeltas } from '@memberjunction/rubrics';

/** Rolling mean against the previous period. Alerting is not part of this view. */
@Component({
    standalone: true,
    selector: 'mj-rubric-drift',
    template: `
      <h2>Rubric drift</h2>
      @for (row of Rows; track row.key) {
        <p>{{ row.key }} drop {{ row.drop }}{{ row.alert ? ' alert' : '' }}</p>
      }
    `,
})
export class RubricDriftComponent {
    @Input() current: { key: string; mean: number }[] = [];
    @Input() previous: { key: string; mean: number }[] = [];
    @Input() threshold = 0.2;
    public get Rows() {
        return driftDeltas(this.current, this.previous, this.threshold);
    }
}

@RegisterClass(BaseResourceComponent, 'RubricDriftResource')
@Component({
    standalone: true,
    selector: 'app-rubric-drift-resource',
    imports: [RubricDriftComponent],
    template: `<mj-rubric-drift [current]="current" [previous]="previous" [threshold]="threshold"></mj-rubric-drift>`,
})
export class RubricDriftResourceComponent extends BaseResourceComponent {
    public current: { key: string; mean: number }[] = [];
    public previous: { key: string; mean: number }[] = [];
    public threshold = 0.2;
}
