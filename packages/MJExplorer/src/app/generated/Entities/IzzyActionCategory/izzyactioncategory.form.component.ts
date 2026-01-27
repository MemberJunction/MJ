import { Component } from '@angular/core';
import { IzzyActionCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Izzy Action Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-izzyactioncategory-form',
    templateUrl: './izzyactioncategory.form.component.html'
})
export class IzzyActionCategoryFormComponent extends BaseFormComponent {
    public record!: IzzyActionCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchyOrdering', sectionName: 'Hierarchy & Ordering', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'izzyActionCategories', sectionName: 'Izzy Action Categories', isExpanded: false },
            { sectionKey: 'izzyActions', sectionName: 'Izzy Actions', isExpanded: false }
        ]);
    }
}

export function LoadIzzyActionCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
