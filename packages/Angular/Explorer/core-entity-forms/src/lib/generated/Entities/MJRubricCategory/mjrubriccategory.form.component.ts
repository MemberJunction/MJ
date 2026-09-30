import { Component } from '@angular/core';
import { MJRubricCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Rubric Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrubriccategory-form',
    templateUrl: './mjrubriccategory.form.component.html'
})
export class MJRubricCategoryFormComponent extends BaseFormComponent {
    public record!: MJRubricCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRubrics', sectionName: 'Rubrics', isExpanded: false },
            { sectionKey: 'mJRubricCategories', sectionName: 'Rubric Categories', isExpanded: false }
        ]);
    }
}

