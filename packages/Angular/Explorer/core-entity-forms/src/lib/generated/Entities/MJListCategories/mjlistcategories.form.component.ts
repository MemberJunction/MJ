import { Component } from '@angular/core';
import { MJListCategoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: List Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlistcategories-form',
    templateUrl: './mjlistcategories.form.component.html'
})
export class MJListCategoriesFormComponent extends BaseFormComponent {
    public record!: MJListCategoriesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'categoryHierarchy', sectionName: 'Category Hierarchy', isExpanded: true },
            { sectionKey: 'ownershipAudit', sectionName: 'Ownership & Audit', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'listCategories', sectionName: 'List Categories', isExpanded: false },
            { sectionKey: 'lists', sectionName: 'Lists', isExpanded: false }
        ]);
    }
}

