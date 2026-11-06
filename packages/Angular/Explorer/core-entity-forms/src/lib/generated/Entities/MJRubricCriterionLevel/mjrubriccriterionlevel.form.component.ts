import { Component } from '@angular/core';
import { MJRubricCriterionLevelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Rubric Criterion Levels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubriccriterionlevel-form',
    templateUrl: './mjrubriccriterionlevel.form.component.html'
})
export class MJRubricCriterionLevelFormComponent extends BaseFormComponent {
    public record!: MJRubricCriterionLevelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

