import { Component } from '@angular/core';
import { MJRubricBandEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Rubric Bands') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubricband-form',
    templateUrl: './mjrubricband.form.component.html'
})
export class MJRubricBandFormComponent extends BaseFormComponent {
    public record!: MJRubricBandEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRubricEvaluations', sectionName: 'Rubric Evaluations', isExpanded: false }
        ]);
    }
}

