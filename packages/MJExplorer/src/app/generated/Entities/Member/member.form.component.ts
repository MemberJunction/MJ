import { Component } from '@angular/core';
import { MemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Members') // Tell MemberJunction about this class
@Component({
    selector: 'gen-member-form',
    templateUrl: './member.form.component.html'
})
export class MemberFormComponent extends BaseFormComponent {
    public record!: MemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'advocacyActions', sectionName: 'Advocacy Actions', isExpanded: false },
            { sectionKey: 'committeeMemberships', sectionName: 'Committee Memberships', isExpanded: false },
            { sectionKey: 'committees', sectionName: 'Committees', isExpanded: false },
            { sectionKey: 'competitionJudges', sectionName: 'Competition Judges', isExpanded: false },
            { sectionKey: 'eventRegistrations', sectionName: 'Event Registrations', isExpanded: false },
            { sectionKey: 'forumModerations', sectionName: 'Forum Moderations', isExpanded: false },
            { sectionKey: 'forumPosts', sectionName: 'Forum Posts', isExpanded: false },
            { sectionKey: 'invoices', sectionName: 'Invoices', isExpanded: false },
            { sectionKey: 'memberFollows', sectionName: 'Member Follows', isExpanded: false },
            { sectionKey: 'postAttachments', sectionName: 'Post Attachments', isExpanded: false },
            { sectionKey: 'postReactions', sectionName: 'Post Reactions', isExpanded: false },
            { sectionKey: 'products', sectionName: 'Products', isExpanded: false },
            { sectionKey: 'resourceDownloads', sectionName: 'Resource Downloads', isExpanded: false },
            { sectionKey: 'resourceRatings', sectionName: 'Resource Ratings', isExpanded: false },
            { sectionKey: 'resourceVersions', sectionName: 'Resource Versions', isExpanded: false },
            { sectionKey: 'resources', sectionName: 'Resources', isExpanded: false },
            { sectionKey: 'boardMembers', sectionName: 'Board Members', isExpanded: false },
            { sectionKey: 'certifications', sectionName: 'Certifications', isExpanded: false },
            { sectionKey: 'chapterMemberships', sectionName: 'Chapter Memberships', isExpanded: false },
            { sectionKey: 'chapterOfficers', sectionName: 'Chapter Officers', isExpanded: false },
            { sectionKey: 'continuingEducations', sectionName: 'Continuing Educations', isExpanded: false },
            { sectionKey: 'emailSends', sectionName: 'Email Sends', isExpanded: false },
            { sectionKey: 'enrollments', sectionName: 'Enrollments', isExpanded: false },
            { sectionKey: 'forumCategories', sectionName: 'Forum Categories', isExpanded: false },
            { sectionKey: 'forumModerations1', sectionName: 'Forum Moderations', isExpanded: false },
            { sectionKey: 'forumPosts1', sectionName: 'Forum Posts', isExpanded: false },
            { sectionKey: 'forumThreads', sectionName: 'Forum Threads', isExpanded: false },
            { sectionKey: 'memberships', sectionName: 'Memberships', isExpanded: false },
            { sectionKey: 'campaignMembers', sectionName: 'Campaign Members', isExpanded: false },
            { sectionKey: 'forumThreads1', sectionName: 'Forum Threads', isExpanded: false }
        ]);
    }
}

export function LoadMemberFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
