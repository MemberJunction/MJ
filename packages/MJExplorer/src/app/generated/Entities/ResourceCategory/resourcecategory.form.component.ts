import { Component } from '@angular/core';
import { ResourceCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Resource Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcecategory-form',
    templateUrl: './resourcecategory.form.component.html'
})
export class ResourceCategoryFormComponent extends BaseFormComponent {
    public record!: ResourceCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'resourceCategories', sectionName: 'Resource Categories', isExpanded: false },
            { sectionKey: 'resources', sectionName: 'Resources', isExpanded: false }
        ]);
    }
}

export function LoadResourceCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
