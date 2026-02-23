import { Component } from '@angular/core';
import { MJQueryCategoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Query Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjquerycategories-form',
    templateUrl: './mjquerycategories.form.component.html'
})
export class MJQueryCategoriesFormComponent extends BaseFormComponent {
    public record!: MJQueryCategoriesEntity;

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

