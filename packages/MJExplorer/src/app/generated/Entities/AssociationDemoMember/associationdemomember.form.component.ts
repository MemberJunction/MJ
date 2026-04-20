import { Component } from '@angular/core';
import { AssociationDemoMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Members') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemomember-form',
    templateUrl: './associationdemomember.form.component.html'
})
export class AssociationDemoMemberFormComponent extends BaseFormComponent {
    public record!: AssociationDemoMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'professionalProfile', sectionName: 'Professional Profile', isExpanded: false },
            { sectionKey: 'membershipDetails', sectionName: 'Membership Details', isExpanded: false },
            { sectionKey: 'engagementMetrics', sectionName: 'Engagement Metrics', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'committees', sectionName: 'Committees', isExpanded: false },
            { sectionKey: 'emailSends', sectionName: 'Email Sends', isExpanded: false },
            { sectionKey: 'products', sectionName: 'Products', isExpanded: false },
            { sectionKey: 'resources', sectionName: 'Resources', isExpanded: false },
            { sectionKey: 'memberFollows', sectionName: 'Member Follows', isExpanded: false },
            { sectionKey: 'invoices', sectionName: 'Invoices', isExpanded: false },
            { sectionKey: 'boardMembers', sectionName: 'Board Members', isExpanded: false },
            { sectionKey: 'resourceDownloads', sectionName: 'Resource Downloads', isExpanded: false },
            { sectionKey: 'chapterOfficers', sectionName: 'Chapter Officers', isExpanded: false },
            { sectionKey: 'certifications', sectionName: 'Certifications', isExpanded: false },
            { sectionKey: 'forumModerationsModeratedByID', sectionName: 'Forum Moderations (Moderated By)', isExpanded: false },
            { sectionKey: 'forumThreadsLastReplyAuthorID', sectionName: 'Forum Threads (Last Reply Author)', isExpanded: false },
            { sectionKey: 'competitionJudges', sectionName: 'Competition Judges', isExpanded: false },
            { sectionKey: 'continuingEducations', sectionName: 'Continuing Educations', isExpanded: false },
            { sectionKey: 'campaignMembers', sectionName: 'Campaign Members', isExpanded: false },
            { sectionKey: 'postAttachments', sectionName: 'Post Attachments', isExpanded: false },
            { sectionKey: 'postReactions', sectionName: 'Post Reactions', isExpanded: false },
            { sectionKey: 'forumCategories', sectionName: 'Forum Categories', isExpanded: false },
            { sectionKey: 'memberships', sectionName: 'Memberships', isExpanded: false },
            { sectionKey: 'resourceRatings', sectionName: 'Resource Ratings', isExpanded: false },
            { sectionKey: 'advocacyActions', sectionName: 'Advocacy Actions', isExpanded: false },
            { sectionKey: 'chapterMemberships', sectionName: 'Chapter Memberships', isExpanded: false },
            { sectionKey: 'enrollments', sectionName: 'Enrollments', isExpanded: false },
            { sectionKey: 'eventRegistrations', sectionName: 'Event Registrations', isExpanded: false },
            { sectionKey: 'resourceVersions', sectionName: 'Resource Versions', isExpanded: false },
            { sectionKey: 'committeeMemberships', sectionName: 'Committee Memberships', isExpanded: false },
            { sectionKey: 'forumPostsEditedByID', sectionName: 'Forum Posts (Edited By)', isExpanded: false },
            { sectionKey: 'forumModerationsReportedByID', sectionName: 'Forum Moderations (Reported By)', isExpanded: false },
            { sectionKey: 'forumThreadsAuthorID', sectionName: 'Forum Threads (Author)', isExpanded: false },
            { sectionKey: 'forumPostsAuthorID', sectionName: 'Forum Posts (Author)', isExpanded: false }
        ]);
    }
}

