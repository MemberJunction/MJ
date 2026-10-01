import { Component } from '@angular/core';
import { MJRubricCriterionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Rubric Criteria') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubriccriterion-form',
    templateUrl: './mjrubriccriterion.form.component.html'
})
export class MJRubricCriterionFormComponent extends BaseFormComponent {
    public record!: MJRubricCriterionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRubricCriteria', sectionName: 'Rubric Criteria', isExpanded: false },
            { sectionKey: 'mJRubricEvaluationScores', sectionName: 'Rubric Evaluation Scores', isExpanded: false },
            { sectionKey: 'mJRubricCriterionLevels', sectionName: 'Rubric Criterion Levels', isExpanded: false }
        ]);
    }
}

