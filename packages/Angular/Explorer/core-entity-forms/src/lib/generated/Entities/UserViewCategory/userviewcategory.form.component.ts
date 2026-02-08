import { Component } from '@angular/core';
import { UserViewCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'User View Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-userviewcategory-form',
    templateUrl: './userviewcategory.form.component.html'
})
export class UserViewCategoryFormComponent extends BaseFormComponent {
    public record!: UserViewCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'organizationalHierarchy', sectionName: 'Organizational Hierarchy', isExpanded: true },
            { sectionKey: 'linkedEntities', sectionName: 'Linked Entities', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'userViewCategories', sectionName: 'User View Categories', isExpanded: false },
            { sectionKey: 'userViews', sectionName: 'User Views', isExpanded: false }
        ]);
    }
}

