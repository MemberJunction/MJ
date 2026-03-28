import { Component } from '@angular/core';
import { AssociationDemoForumCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Forum Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoforumcategory-form',
    templateUrl: './associationdemoforumcategory.form.component.html'
})
export class AssociationDemoForumCategoryFormComponent extends BaseFormComponent {
    public record!: AssociationDemoForumCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'forumCategories', sectionName: 'Forum Categories', isExpanded: false },
            { sectionKey: 'forumThreads', sectionName: 'Forum Threads', isExpanded: false }
        ]);
    }
}

