import { Component } from '@angular/core';
import { ListCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'List Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-listcategory-form',
    templateUrl: './listcategory.form.component.html'
})
export class ListCategoryFormComponent extends BaseFormComponent {
    public record!: ListCategoryEntity;

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

