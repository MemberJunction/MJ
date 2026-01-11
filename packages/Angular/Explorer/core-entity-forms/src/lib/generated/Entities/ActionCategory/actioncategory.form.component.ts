import { Component } from '@angular/core';
import { ActionCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Action Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actioncategory-form',
    templateUrl: './actioncategory.form.component.html'
})
export class ActionCategoryFormComponent extends BaseFormComponent {
    public record!: ActionCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchyInformation', sectionName: 'Hierarchy Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'actionCategories', sectionName: 'Action Categories', isExpanded: false },
            { sectionKey: 'actions', sectionName: 'Actions', isExpanded: false }
        ]);
    }
}

export function LoadActionCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
