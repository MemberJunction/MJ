import { Component } from '@angular/core';
import { ForumCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Forum Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-forumcategory-form',
    templateUrl: './forumcategory.form.component.html'
})
export class ForumCategoryFormComponent extends BaseFormComponent {
    public record!: ForumCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryBasics', sectionName: 'Category Basics', isExpanded: true },
            { sectionKey: 'appearanceSettings', sectionName: 'Appearance Settings', isExpanded: true },
            { sectionKey: 'activityMetrics', sectionName: 'Activity Metrics', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'forumCategories', sectionName: 'Forum Categories', isExpanded: false },
            { sectionKey: 'forumThreads', sectionName: 'Forum Threads', isExpanded: false }
        ]);
    }
}

export function LoadForumCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
