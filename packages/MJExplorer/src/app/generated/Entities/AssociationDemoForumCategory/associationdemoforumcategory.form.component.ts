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
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchyAndOrdering', sectionName: 'Hierarchy and Ordering', isExpanded: true },
            { sectionKey: 'appearanceAndSettings', sectionName: 'Appearance and Settings', isExpanded: false },
            { sectionKey: 'engagementMetrics', sectionName: 'Engagement Metrics', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'forumCategories', sectionName: 'Forum Categories', isExpanded: false },
            { sectionKey: 'forumThreads', sectionName: 'Forum Threads', isExpanded: false }
        ]);
    }
}

