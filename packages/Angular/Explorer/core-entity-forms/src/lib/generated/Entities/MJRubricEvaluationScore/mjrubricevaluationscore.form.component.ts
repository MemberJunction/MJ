import { Component } from '@angular/core';
import { MJRubricEvaluationScoreEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Rubric Evaluation Scores') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubricevaluationscore-form',
    templateUrl: './mjrubricevaluationscore.form.component.html'
})
export class MJRubricEvaluationScoreFormComponent extends BaseFormComponent {
    public record!: MJRubricEvaluationScoreEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

