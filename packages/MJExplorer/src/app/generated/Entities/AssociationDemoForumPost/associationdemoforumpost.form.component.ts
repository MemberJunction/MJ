import { Component } from '@angular/core';
import { AssociationDemoForumPostEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Forum Posts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoforumpost-form',
    templateUrl: './associationdemoforumpost.form.component.html'
})
export class AssociationDemoForumPostFormComponent extends BaseFormComponent {
    public record!: AssociationDemoForumPostEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'postTags', sectionName: 'Post Tags', isExpanded: false },
            { sectionKey: 'postAttachments', sectionName: 'Post Attachments', isExpanded: false },
            { sectionKey: 'postReactions', sectionName: 'Post Reactions', isExpanded: false },
            { sectionKey: 'forumModerations', sectionName: 'Forum Moderations', isExpanded: false },
            { sectionKey: 'forumPosts', sectionName: 'Forum Posts', isExpanded: false }
        ]);
    }
}

