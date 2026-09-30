import { Component } from '@angular/core';
import { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Rubric Evaluations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubricevaluation-form',
    templateUrl: './mjrubricevaluation.form.component.html'
})
export class MJRubricEvaluationFormComponent extends BaseFormComponent {
    public record!: MJRubricEvaluationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRubricEvaluationScores', sectionName: 'Rubric Evaluation Scores', isExpanded: false },
            { sectionKey: 'mJRubricEvaluations', sectionName: 'Rubric Evaluations', isExpanded: false }
        ]);
    }
}

