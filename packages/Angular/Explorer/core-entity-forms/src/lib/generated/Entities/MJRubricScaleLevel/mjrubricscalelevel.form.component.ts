import { Component } from '@angular/core';
import { MJRubricScaleLevelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Rubric Scale Levels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubricscalelevel-form',
    templateUrl: './mjrubricscalelevel.form.component.html'
})
export class MJRubricScaleLevelFormComponent extends BaseFormComponent {
    public record!: MJRubricScaleLevelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRubricEvaluationScores', sectionName: 'Rubric Evaluation Scores', isExpanded: false },
            { sectionKey: 'mJRubricCriterionLevels', sectionName: 'Rubric Criterion Levels', isExpanded: false }
        ]);
    }
}

