import { Component } from '@angular/core';
import { MJRubricScaleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Rubric Scales') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubricscale-form',
    templateUrl: './mjrubricscale.form.component.html'
})
export class MJRubricScaleFormComponent extends BaseFormComponent {
    public record!: MJRubricScaleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRubricScaleLevels', sectionName: 'Rubric Scale Levels', isExpanded: false },
            { sectionKey: 'mJRubricCriterions', sectionName: 'Rubric Criterions', isExpanded: false }
        ]);
    }
}

