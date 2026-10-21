import { Component } from '@angular/core';
import { MJRubricVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Rubric Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubricversion-form',
    templateUrl: './mjrubricversion.form.component.html'
})
export class MJRubricVersionFormComponent extends BaseFormComponent {
    public record!: MJRubricVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRubricBands', sectionName: 'Rubric Bands', isExpanded: false },
            { sectionKey: 'mJRubricCriteria', sectionName: 'Rubric Criteria', isExpanded: false },
            { sectionKey: 'mJRubricVersions', sectionName: 'Rubric Versions', isExpanded: false },
            { sectionKey: 'mJRubricEvaluations', sectionName: 'Rubric Evaluations', isExpanded: false }
        ]);
    }
}

