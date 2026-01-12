import { Component } from '@angular/core';
import { ForumPostEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Forum Posts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-forumpost-form',
    templateUrl: './forumpost.form.component.html'
})
export class ForumPostFormComponent extends BaseFormComponent {
    public record!: ForumPostEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contentAuthoring', sectionName: 'Content & Authoring', isExpanded: true },
            { sectionKey: 'postStructure', sectionName: 'Post Structure', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: false },
            { sectionKey: 'engagementModeration', sectionName: 'Engagement & Moderation', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'postTags', sectionName: 'Post Tags', isExpanded: false },
            { sectionKey: 'postAttachments', sectionName: 'Post Attachments', isExpanded: false },
            { sectionKey: 'postReactions', sectionName: 'Post Reactions', isExpanded: false },
            { sectionKey: 'forumModerations', sectionName: 'Forum Moderations', isExpanded: false },
            { sectionKey: 'forumPosts', sectionName: 'Forum Posts', isExpanded: false }
        ]);
    }
}

export function LoadForumPostFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
