import { Component, Input } from '@angular/core';
import { RubricResultComponent } from '@memberjunction/ng-rubrics';
import { rubricRunView } from '../models/testing-rubrics';

/** Per-criterion breakdown for one test run. Hidden when the run has no rubric result. */
@Component({
    standalone: true,
    selector: 'mj-testing-rubric-result',
    imports: [RubricResultComponent],
    template: `
      @if (View) {
        <mj-rubric-result [Version]="View.version" [Result]="View.result" [Answers]="View.answers"></mj-rubric-result>
      }
    `,
})
export class TestingRubricResultComponent {
    @Input() OracleResults: { oracleType?: string; type?: string; Name?: string; details?: unknown; Details?: unknown }[] | null = null;

    public get View() {
        return rubricRunView(this.OracleResults);
    }
}
