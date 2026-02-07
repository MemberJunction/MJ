import { Component } from '@angular/core';
import { QueryCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Query Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-querycategory-form',
    templateUrl: './querycategory.form.component.html'
})
export class QueryCategoryFormComponent extends BaseFormComponent {
    public record!: QueryCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'cacheSettings', sectionName: 'Cache Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'queries', sectionName: 'Queries', isExpanded: false },
            { sectionKey: 'queryCategories', sectionName: 'Query Categories', isExpanded: false }
        ]);
    }
}

export function LoadQueryCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
