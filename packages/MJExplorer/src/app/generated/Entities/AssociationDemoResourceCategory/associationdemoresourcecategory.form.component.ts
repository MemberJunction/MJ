import { Component } from '@angular/core';
import { AssociationDemoResourceCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Resource Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoresourcecategory-form',
    templateUrl: './associationdemoresourcecategory.form.component.html'
})
export class AssociationDemoResourceCategoryFormComponent extends BaseFormComponent {
    public record!: AssociationDemoResourceCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'resourceCategories', sectionName: 'Resource Categories', isExpanded: false },
            { sectionKey: 'resources', sectionName: 'Resources', isExpanded: false }
        ]);
    }
}

