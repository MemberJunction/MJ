/**********************************************************************************
* GENERATED FILE - This file is automatically managed by the MJ CodeGen tool, 
* 
* DO NOT MODIFY THIS FILE - any changes you make will be wiped out the next time the file is
* generated
* 
**********************************************************************************/
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MemberJunction Imports
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { LayoutModule } from '@progress/kendo-angular-layout';

// Import Generated Components
import { AssociationDemoAccreditingBodyFormComponent } from "./Entities/AssociationDemoAccreditingBody/associationdemoaccreditingbody.form.component";
import { AssociationDemoAdvocacyActionFormComponent } from "./Entities/AssociationDemoAdvocacyAction/associationdemoadvocacyaction.form.component";
import { AssociationDemoBoardMemberFormComponent } from "./Entities/AssociationDemoBoardMember/associationdemoboardmember.form.component";
import { AssociationDemoBoardPositionFormComponent } from "./Entities/AssociationDemoBoardPosition/associationdemoboardposition.form.component";
import { AssociationDemoCampaignMemberFormComponent } from "./Entities/AssociationDemoCampaignMember/associationdemocampaignmember.form.component";
import { AssociationDemoCampaignFormComponent } from "./Entities/AssociationDemoCampaign/associationdemocampaign.form.component";
import { AssociationDemoCertificateFormComponent } from "./Entities/AssociationDemoCertificate/associationdemocertificate.form.component";
import { AssociationDemoCertificationRenewalFormComponent } from "./Entities/AssociationDemoCertificationRenewal/associationdemocertificationrenewal.form.component";
import { AssociationDemoCertificationRequirementFormComponent } from "./Entities/AssociationDemoCertificationRequirement/associationdemocertificationrequirement.form.component";
import { AssociationDemoCertificationTypeFormComponent } from "./Entities/AssociationDemoCertificationType/associationdemocertificationtype.form.component";
import { AssociationDemoCertificationFormComponent } from "./Entities/AssociationDemoCertification/associationdemocertification.form.component";
import { AssociationDemoChapterMembershipFormComponent } from "./Entities/AssociationDemoChapterMembership/associationdemochaptermembership.form.component";
import { AssociationDemoChapterOfficerFormComponent } from "./Entities/AssociationDemoChapterOfficer/associationdemochapterofficer.form.component";
import { AssociationDemoChapterFormComponent } from "./Entities/AssociationDemoChapter/associationdemochapter.form.component";
import { AssociationDemoCommitteeMembershipFormComponent } from "./Entities/AssociationDemoCommitteeMembership/associationdemocommitteemembership.form.component";
import { AssociationDemoCommitteeFormComponent } from "./Entities/AssociationDemoCommittee/associationdemocommittee.form.component";
import { AssociationDemoCompetitionEntryFormComponent } from "./Entities/AssociationDemoCompetitionEntry/associationdemocompetitionentry.form.component";
import { AssociationDemoCompetitionJudgeFormComponent } from "./Entities/AssociationDemoCompetitionJudge/associationdemocompetitionjudge.form.component";
import { AssociationDemoCompetitionFormComponent } from "./Entities/AssociationDemoCompetition/associationdemocompetition.form.component";
import { AssociationDemoContinuingEducationFormComponent } from "./Entities/AssociationDemoContinuingEducation/associationdemocontinuingeducation.form.component";
import { AssociationDemoCourseFormComponent } from "./Entities/AssociationDemoCourse/associationdemocourse.form.component";
import { AssociationDemoEmailClickFormComponent } from "./Entities/AssociationDemoEmailClick/associationdemoemailclick.form.component";
import { AssociationDemoEmailSendFormComponent } from "./Entities/AssociationDemoEmailSend/associationdemoemailsend.form.component";
import { AssociationDemoEmailTemplateFormComponent } from "./Entities/AssociationDemoEmailTemplate/associationdemoemailtemplate.form.component";
import { AssociationDemoEnrollmentFormComponent } from "./Entities/AssociationDemoEnrollment/associationdemoenrollment.form.component";
import { AssociationDemoEventRegistrationFormComponent } from "./Entities/AssociationDemoEventRegistration/associationdemoeventregistration.form.component";
import { AssociationDemoEventSessionFormComponent } from "./Entities/AssociationDemoEventSession/associationdemoeventsession.form.component";
import { AssociationDemoEventFormComponent } from "./Entities/AssociationDemoEvent/associationdemoevent.form.component";
import { AssociationDemoForumCategoryFormComponent } from "./Entities/AssociationDemoForumCategory/associationdemoforumcategory.form.component";
import { AssociationDemoForumModerationFormComponent } from "./Entities/AssociationDemoForumModeration/associationdemoforummoderation.form.component";
import { AssociationDemoForumPostFormComponent } from "./Entities/AssociationDemoForumPost/associationdemoforumpost.form.component";
import { AssociationDemoForumThreadFormComponent } from "./Entities/AssociationDemoForumThread/associationdemoforumthread.form.component";
import { AssociationDemoGovernmentContactFormComponent } from "./Entities/AssociationDemoGovernmentContact/associationdemogovernmentcontact.form.component";
import { AssociationDemoInvoiceLineItemFormComponent } from "./Entities/AssociationDemoInvoiceLineItem/associationdemoinvoicelineitem.form.component";
import { AssociationDemoInvoiceFormComponent } from "./Entities/AssociationDemoInvoice/associationdemoinvoice.form.component";
import { AssociationDemoLegislativeBodyFormComponent } from "./Entities/AssociationDemoLegislativeBody/associationdemolegislativebody.form.component";
import { AssociationDemoLegislativeIssueFormComponent } from "./Entities/AssociationDemoLegislativeIssue/associationdemolegislativeissue.form.component";
import { AssociationDemoMemberFollowFormComponent } from "./Entities/AssociationDemoMemberFollow/associationdemomemberfollow.form.component";
import { AssociationDemoMemberFormComponent } from "./Entities/AssociationDemoMember/associationdemomember.form.component";
import { AssociationDemoMembershipTypeFormComponent } from "./Entities/AssociationDemoMembershipType/associationdemomembershiptype.form.component";
import { AssociationDemoMembershipFormComponent } from "./Entities/AssociationDemoMembership/associationdemomembership.form.component";
import { AssociationDemoOrganizationFormComponent } from "./Entities/AssociationDemoOrganization/associationdemoorganization.form.component";
import { AssociationDemoPaymentFormComponent } from "./Entities/AssociationDemoPayment/associationdemopayment.form.component";
import { AssociationDemoPolicyPositionFormComponent } from "./Entities/AssociationDemoPolicyPosition/associationdemopolicyposition.form.component";
import { AssociationDemoPostAttachmentFormComponent } from "./Entities/AssociationDemoPostAttachment/associationdemopostattachment.form.component";
import { AssociationDemoPostReactionFormComponent } from "./Entities/AssociationDemoPostReaction/associationdemopostreaction.form.component";
import { AssociationDemoPostTagFormComponent } from "./Entities/AssociationDemoPostTag/associationdemoposttag.form.component";
import { AssociationDemoProductAwardFormComponent } from "./Entities/AssociationDemoProductAward/associationdemoproductaward.form.component";
import { AssociationDemoProductCategoryFormComponent } from "./Entities/AssociationDemoProductCategory/associationdemoproductcategory.form.component";
import { AssociationDemoProductFormComponent } from "./Entities/AssociationDemoProduct/associationdemoproduct.form.component";
import { AssociationDemoRegulatoryCommentFormComponent } from "./Entities/AssociationDemoRegulatoryComment/associationdemoregulatorycomment.form.component";
import { AssociationDemoResourceCategoryFormComponent } from "./Entities/AssociationDemoResourceCategory/associationdemoresourcecategory.form.component";
import { AssociationDemoResourceDownloadFormComponent } from "./Entities/AssociationDemoResourceDownload/associationdemoresourcedownload.form.component";
import { AssociationDemoResourceRatingFormComponent } from "./Entities/AssociationDemoResourceRating/associationdemoresourcerating.form.component";
import { AssociationDemoResourceTagFormComponent } from "./Entities/AssociationDemoResourceTag/associationdemoresourcetag.form.component";
import { AssociationDemoResourceVersionFormComponent } from "./Entities/AssociationDemoResourceVersion/associationdemoresourceversion.form.component";
import { AssociationDemoResourceFormComponent } from "./Entities/AssociationDemoResource/associationdemoresource.form.component";
import { AssociationDemoSegmentFormComponent } from "./Entities/AssociationDemoSegment/associationdemosegment.form.component";
   

@NgModule({
declarations: [
    AssociationDemoAccreditingBodyFormComponent,
    AssociationDemoAdvocacyActionFormComponent,
    AssociationDemoBoardMemberFormComponent,
    AssociationDemoBoardPositionFormComponent,
    AssociationDemoCampaignMemberFormComponent,
    AssociationDemoCampaignFormComponent,
    AssociationDemoCertificateFormComponent,
    AssociationDemoCertificationRenewalFormComponent,
    AssociationDemoCertificationRequirementFormComponent,
    AssociationDemoCertificationTypeFormComponent,
    AssociationDemoCertificationFormComponent,
    AssociationDemoChapterMembershipFormComponent,
    AssociationDemoChapterOfficerFormComponent,
    AssociationDemoChapterFormComponent,
    AssociationDemoCommitteeMembershipFormComponent,
    AssociationDemoCommitteeFormComponent,
    AssociationDemoCompetitionEntryFormComponent,
    AssociationDemoCompetitionJudgeFormComponent,
    AssociationDemoCompetitionFormComponent,
    AssociationDemoContinuingEducationFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
    AssociationDemoCourseFormComponent,
    AssociationDemoEmailClickFormComponent,
    AssociationDemoEmailSendFormComponent,
    AssociationDemoEmailTemplateFormComponent,
    AssociationDemoEnrollmentFormComponent,
    AssociationDemoEventRegistrationFormComponent,
    AssociationDemoEventSessionFormComponent,
    AssociationDemoEventFormComponent,
    AssociationDemoForumCategoryFormComponent,
    AssociationDemoForumModerationFormComponent,
    AssociationDemoForumPostFormComponent,
    AssociationDemoForumThreadFormComponent,
    AssociationDemoGovernmentContactFormComponent,
    AssociationDemoInvoiceLineItemFormComponent,
    AssociationDemoInvoiceFormComponent,
    AssociationDemoLegislativeBodyFormComponent,
    AssociationDemoLegislativeIssueFormComponent,
    AssociationDemoMemberFollowFormComponent,
    AssociationDemoMemberFormComponent,
    AssociationDemoMembershipTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_1 { }
    


@NgModule({
declarations: [
    AssociationDemoMembershipFormComponent,
    AssociationDemoOrganizationFormComponent,
    AssociationDemoPaymentFormComponent,
    AssociationDemoPolicyPositionFormComponent,
    AssociationDemoPostAttachmentFormComponent,
    AssociationDemoPostReactionFormComponent,
    AssociationDemoPostTagFormComponent,
    AssociationDemoProductAwardFormComponent,
    AssociationDemoProductCategoryFormComponent,
    AssociationDemoProductFormComponent,
    AssociationDemoRegulatoryCommentFormComponent,
    AssociationDemoResourceCategoryFormComponent,
    AssociationDemoResourceDownloadFormComponent,
    AssociationDemoResourceRatingFormComponent,
    AssociationDemoResourceTagFormComponent,
    AssociationDemoResourceVersionFormComponent,
    AssociationDemoResourceFormComponent,
    AssociationDemoSegmentFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2
]
})
export class GeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    