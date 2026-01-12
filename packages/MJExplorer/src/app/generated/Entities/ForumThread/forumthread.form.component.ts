import { Component } from '@angular/core';
import { ForumThreadEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Forum Threads') // Tell MemberJunction about this class
@Component({
    selector: 'gen-forumthread-form',
    templateUrl: './forumthread.form.component.html'
})
export class ForumThreadFormComponent extends BaseFormComponent {
    public record!: ForumThreadEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'threadClassification', sectionName: 'Thread Classification', isExpanded: true },
            { sectionKey: 'contentSettings', sectionName: 'Content Settings', isExpanded: true },
            { sectionKey: 'authorActivity', sectionName: 'Author Activity', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'forumPosts', sectionName: 'Forum Posts', isExpanded: false }
        ]);
    }
}

export function LoadForumThreadFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
