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
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { MJTabStripModule } from "@memberjunction/ng-tabstrip";
import { ContainerDirectivesModule } from "@memberjunction/ng-container-directives";

// Kendo Imports
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { ComboBoxModule } from '@progress/kendo-angular-dropdowns';
import { DropDownListModule } from '@progress/kendo-angular-dropdowns';

// Import Generated Components
import { AccreditingBodyFormComponent, LoadAccreditingBodyFormComponent } from "./Entities/AccreditingBody/accreditingbody.form.component";
import { AdvocacyActionFormComponent, LoadAdvocacyActionFormComponent } from "./Entities/AdvocacyAction/advocacyaction.form.component";
import { BikeFormComponent, LoadBikeFormComponent } from "./Entities/Bike/bike.form.component";
import { BoardMemberFormComponent, LoadBoardMemberFormComponent } from "./Entities/BoardMember/boardmember.form.component";
import { BoardPositionFormComponent, LoadBoardPositionFormComponent } from "./Entities/BoardPosition/boardposition.form.component";
import { CampaignMemberFormComponent, LoadCampaignMemberFormComponent } from "./Entities/CampaignMember/campaignmember.form.component";
import { CampaignFormComponent, LoadCampaignFormComponent } from "./Entities/Campaign/campaign.form.component";
import { CertificateFormComponent, LoadCertificateFormComponent } from "./Entities/Certificate/certificate.form.component";
import { CertificationRenewalFormComponent, LoadCertificationRenewalFormComponent } from "./Entities/CertificationRenewal/certificationrenewal.form.component";
import { CertificationRequirementFormComponent, LoadCertificationRequirementFormComponent } from "./Entities/CertificationRequirement/certificationrequirement.form.component";
import { CertificationTypeFormComponent, LoadCertificationTypeFormComponent } from "./Entities/CertificationType/certificationtype.form.component";
import { CertificationFormComponent, LoadCertificationFormComponent } from "./Entities/Certification/certification.form.component";
import { ChapterMembershipFormComponent, LoadChapterMembershipFormComponent } from "./Entities/ChapterMembership/chaptermembership.form.component";
import { ChapterOfficerFormComponent, LoadChapterOfficerFormComponent } from "./Entities/ChapterOfficer/chapterofficer.form.component";
import { ChapterFormComponent, LoadChapterFormComponent } from "./Entities/Chapter/chapter.form.component";
import { CommitteeMembershipFormComponent, LoadCommitteeMembershipFormComponent } from "./Entities/CommitteeMembership/committeemembership.form.component";
import { CommitteeFormComponent, LoadCommitteeFormComponent } from "./Entities/Committee/committee.form.component";
import { CompetitionEntryFormComponent, LoadCompetitionEntryFormComponent } from "./Entities/CompetitionEntry/competitionentry.form.component";
import { CompetitionJudgeFormComponent, LoadCompetitionJudgeFormComponent } from "./Entities/CompetitionJudge/competitionjudge.form.component";
import { CompetitionFormComponent, LoadCompetitionFormComponent } from "./Entities/Competition/competition.form.component";
import { ContinuingEducationFormComponent, LoadContinuingEducationFormComponent } from "./Entities/ContinuingEducation/continuingeducation.form.component";
import { CourseFormComponent, LoadCourseFormComponent } from "./Entities/Course/course.form.component";
import { EmailClickFormComponent, LoadEmailClickFormComponent } from "./Entities/EmailClick/emailclick.form.component";
import { EmailSendFormComponent, LoadEmailSendFormComponent } from "./Entities/EmailSend/emailsend.form.component";
import { EmailTemplateFormComponent, LoadEmailTemplateFormComponent } from "./Entities/EmailTemplate/emailtemplate.form.component";
import { EnrollmentFormComponent, LoadEnrollmentFormComponent } from "./Entities/Enrollment/enrollment.form.component";
import { EventRegistrationFormComponent, LoadEventRegistrationFormComponent } from "./Entities/EventRegistration/eventregistration.form.component";
import { EventSessionFormComponent, LoadEventSessionFormComponent } from "./Entities/EventSession/eventsession.form.component";
import { EventFormComponent, LoadEventFormComponent } from "./Entities/Event/event.form.component";
import { ForumCategoryFormComponent, LoadForumCategoryFormComponent } from "./Entities/ForumCategory/forumcategory.form.component";
import { ForumModerationFormComponent, LoadForumModerationFormComponent } from "./Entities/ForumModeration/forummoderation.form.component";
import { ForumPostFormComponent, LoadForumPostFormComponent } from "./Entities/ForumPost/forumpost.form.component";
import { ForumThreadFormComponent, LoadForumThreadFormComponent } from "./Entities/ForumThread/forumthread.form.component";
import { GovernmentContactFormComponent, LoadGovernmentContactFormComponent } from "./Entities/GovernmentContact/governmentcontact.form.component";
import { InvoiceLineItemFormComponent, LoadInvoiceLineItemFormComponent } from "./Entities/InvoiceLineItem/invoicelineitem.form.component";
import { InvoiceFormComponent, LoadInvoiceFormComponent } from "./Entities/Invoice/invoice.form.component";
import { LegislativeBodyFormComponent, LoadLegislativeBodyFormComponent } from "./Entities/LegislativeBody/legislativebody.form.component";
import { LegislativeIssueFormComponent, LoadLegislativeIssueFormComponent } from "./Entities/LegislativeIssue/legislativeissue.form.component";
import { LocationFormComponent, LoadLocationFormComponent } from "./Entities/Location/location.form.component";
import { MemberFollowFormComponent, LoadMemberFollowFormComponent } from "./Entities/MemberFollow/memberfollow.form.component";
import { MemberFormComponent, LoadMemberFormComponent } from "./Entities/Member/member.form.component";
import { MembershipTypeFormComponent, LoadMembershipTypeFormComponent } from "./Entities/MembershipType/membershiptype.form.component";
import { MembershipFormComponent, LoadMembershipFormComponent } from "./Entities/Membership/membership.form.component";
import { OrganizationFormComponent, LoadOrganizationFormComponent } from "./Entities/Organization/organization.form.component";
import { PaymentFormComponent, LoadPaymentFormComponent } from "./Entities/Payment/payment.form.component";
import { PolicyPositionFormComponent, LoadPolicyPositionFormComponent } from "./Entities/PolicyPosition/policyposition.form.component";
import { PostAttachmentFormComponent, LoadPostAttachmentFormComponent } from "./Entities/PostAttachment/postattachment.form.component";
import { PostReactionFormComponent, LoadPostReactionFormComponent } from "./Entities/PostReaction/postreaction.form.component";
import { PostTagFormComponent, LoadPostTagFormComponent } from "./Entities/PostTag/posttag.form.component";
import { ProductAwardFormComponent, LoadProductAwardFormComponent } from "./Entities/ProductAward/productaward.form.component";
import { ProductCategoryFormComponent, LoadProductCategoryFormComponent } from "./Entities/ProductCategory/productcategory.form.component";
import { ProductFormComponent, LoadProductFormComponent } from "./Entities/Product/product.form.component";
import { RegulatoryCommentFormComponent, LoadRegulatoryCommentFormComponent } from "./Entities/RegulatoryComment/regulatorycomment.form.component";
import { ResourceCategoryFormComponent, LoadResourceCategoryFormComponent } from "./Entities/ResourceCategory/resourcecategory.form.component";
import { ResourceDownloadFormComponent, LoadResourceDownloadFormComponent } from "./Entities/ResourceDownload/resourcedownload.form.component";
import { ResourceRatingFormComponent, LoadResourceRatingFormComponent } from "./Entities/ResourceRating/resourcerating.form.component";
import { ResourceTagFormComponent, LoadResourceTagFormComponent } from "./Entities/ResourceTag/resourcetag.form.component";
import { ResourceVersionFormComponent, LoadResourceVersionFormComponent } from "./Entities/ResourceVersion/resourceversion.form.component";
import { ResourceFormComponent, LoadResourceFormComponent } from "./Entities/Resource/resource.form.component";
import { Rider_StatsFormComponent, LoadRider_StatsFormComponent } from "./Entities/Rider_Stats/rider_stats.form.component";
import { RiderFormComponent, LoadRiderFormComponent } from "./Entities/Rider/rider.form.component";
import { SegmentFormComponent, LoadSegmentFormComponent } from "./Entities/Segment/segment.form.component";
import { WeatherFormComponent, LoadWeatherFormComponent } from "./Entities/Weather/weather.form.component";
   

@NgModule({
declarations: [
    AccreditingBodyFormComponent,
    AdvocacyActionFormComponent,
    BikeFormComponent,
    BoardMemberFormComponent,
    BoardPositionFormComponent,
    CampaignMemberFormComponent,
    CampaignFormComponent,
    CertificateFormComponent,
    CertificationRenewalFormComponent,
    CertificationRequirementFormComponent,
    CertificationTypeFormComponent,
    CertificationFormComponent,
    ChapterMembershipFormComponent,
    ChapterOfficerFormComponent,
    ChapterFormComponent,
    CommitteeMembershipFormComponent,
    CommitteeFormComponent,
    CompetitionEntryFormComponent,
    CompetitionJudgeFormComponent,
    CompetitionFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
    ContinuingEducationFormComponent,
    CourseFormComponent,
    EmailClickFormComponent,
    EmailSendFormComponent,
    EmailTemplateFormComponent,
    EnrollmentFormComponent,
    EventRegistrationFormComponent,
    EventSessionFormComponent,
    EventFormComponent,
    ForumCategoryFormComponent,
    ForumModerationFormComponent,
    ForumPostFormComponent,
    ForumThreadFormComponent,
    GovernmentContactFormComponent,
    InvoiceLineItemFormComponent,
    InvoiceFormComponent,
    LegislativeBodyFormComponent,
    LegislativeIssueFormComponent,
    LocationFormComponent,
    MemberFollowFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_1 { }
    


@NgModule({
declarations: [
    MemberFormComponent,
    MembershipTypeFormComponent,
    MembershipFormComponent,
    OrganizationFormComponent,
    PaymentFormComponent,
    PolicyPositionFormComponent,
    PostAttachmentFormComponent,
    PostReactionFormComponent,
    PostTagFormComponent,
    ProductAwardFormComponent,
    ProductCategoryFormComponent,
    ProductFormComponent,
    RegulatoryCommentFormComponent,
    ResourceCategoryFormComponent,
    ResourceDownloadFormComponent,
    ResourceRatingFormComponent,
    ResourceTagFormComponent,
    ResourceVersionFormComponent,
    ResourceFormComponent,
    Rider_StatsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }
    


@NgModule({
declarations: [
    RiderFormComponent,
    SegmentFormComponent,
    WeatherFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_3 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2,
    GeneratedForms_SubModule_3
]
})
export class GeneratedFormsModule { }
    
export function LoadGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    LoadAccreditingBodyFormComponent();
    LoadAdvocacyActionFormComponent();
    LoadBikeFormComponent();
    LoadBoardMemberFormComponent();
    LoadBoardPositionFormComponent();
    LoadCampaignMemberFormComponent();
    LoadCampaignFormComponent();
    LoadCertificateFormComponent();
    LoadCertificationRenewalFormComponent();
    LoadCertificationRequirementFormComponent();
    LoadCertificationTypeFormComponent();
    LoadCertificationFormComponent();
    LoadChapterMembershipFormComponent();
    LoadChapterOfficerFormComponent();
    LoadChapterFormComponent();
    LoadCommitteeMembershipFormComponent();
    LoadCommitteeFormComponent();
    LoadCompetitionEntryFormComponent();
    LoadCompetitionJudgeFormComponent();
    LoadCompetitionFormComponent();
    LoadContinuingEducationFormComponent();
    LoadCourseFormComponent();
    LoadEmailClickFormComponent();
    LoadEmailSendFormComponent();
    LoadEmailTemplateFormComponent();
    LoadEnrollmentFormComponent();
    LoadEventRegistrationFormComponent();
    LoadEventSessionFormComponent();
    LoadEventFormComponent();
    LoadForumCategoryFormComponent();
    LoadForumModerationFormComponent();
    LoadForumPostFormComponent();
    LoadForumThreadFormComponent();
    LoadGovernmentContactFormComponent();
    LoadInvoiceLineItemFormComponent();
    LoadInvoiceFormComponent();
    LoadLegislativeBodyFormComponent();
    LoadLegislativeIssueFormComponent();
    LoadLocationFormComponent();
    LoadMemberFollowFormComponent();
    LoadMemberFormComponent();
    LoadMembershipTypeFormComponent();
    LoadMembershipFormComponent();
    LoadOrganizationFormComponent();
    LoadPaymentFormComponent();
    LoadPolicyPositionFormComponent();
    LoadPostAttachmentFormComponent();
    LoadPostReactionFormComponent();
    LoadPostTagFormComponent();
    LoadProductAwardFormComponent();
    LoadProductCategoryFormComponent();
    LoadProductFormComponent();
    LoadRegulatoryCommentFormComponent();
    LoadResourceCategoryFormComponent();
    LoadResourceDownloadFormComponent();
    LoadResourceRatingFormComponent();
    LoadResourceTagFormComponent();
    LoadResourceVersionFormComponent();
    LoadResourceFormComponent();
    LoadRider_StatsFormComponent();
    LoadRiderFormComponent();
    LoadSegmentFormComponent();
    LoadWeatherFormComponent();
}
    