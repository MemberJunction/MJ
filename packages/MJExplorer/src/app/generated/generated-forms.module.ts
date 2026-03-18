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
import { YourMembershipAllCampaignFormComponent } from "./Entities/YourMembershipAllCampaign/yourmembershipallcampaign.form.component";
import { YourMembershipAnnouncementFormComponent } from "./Entities/YourMembershipAnnouncement/yourmembershipannouncement.form.component";
import { HubSpotCallFormComponent } from "./Entities/HubSpotCall/hubspotcall.form.component";
import { YourMembershipCampaignEmailListFormComponent } from "./Entities/YourMembershipCampaignEmailList/yourmembershipcampaignemaillist.form.component";
import { YourMembershipCampaignFormComponent } from "./Entities/YourMembershipCampaign/yourmembershipcampaign.form.component";
import { YourMembershipCareerOpeningFormComponent } from "./Entities/YourMembershipCareerOpening/yourmembershipcareeropening.form.component";
import { YourMembershipCertificationCreditTypeFormComponent } from "./Entities/YourMembershipCertificationCreditType/yourmembershipcertificationcredittype.form.component";
import { YourMembershipCertificationJournalFormComponent } from "./Entities/YourMembershipCertificationJournal/yourmembershipcertificationjournal.form.component";
import { YourMembershipCertificationFormComponent } from "./Entities/YourMembershipCertification/yourmembershipcertification.form.component";
import { HubSpotCompanyFormComponent } from "./Entities/HubSpotCompany/hubspotcompany.form.component";
import { HubSpotCompanyCallFormComponent } from "./Entities/HubSpotCompanyCall/hubspotcompanycall.form.component";
import { HubSpotCompanyDealFormComponent } from "./Entities/HubSpotCompanyDeal/hubspotcompanydeal.form.component";
import { HubSpotCompanyEmailFormComponent } from "./Entities/HubSpotCompanyEmail/hubspotcompanyemail.form.component";
import { HubSpotCompanyMeetingFormComponent } from "./Entities/HubSpotCompanyMeeting/hubspotcompanymeeting.form.component";
import { HubSpotCompanyNoteFormComponent } from "./Entities/HubSpotCompanyNote/hubspotcompanynote.form.component";
import { HubSpotCompanyTaskFormComponent } from "./Entities/HubSpotCompanyTask/hubspotcompanytask.form.component";
import { HubSpotCompanyTicketFormComponent } from "./Entities/HubSpotCompanyTicket/hubspotcompanyticket.form.component";
import { YourMembershipConnectionFormComponent } from "./Entities/YourMembershipConnection/yourmembershipconnection.form.component";
import { HubSpotContactCallFormComponent } from "./Entities/HubSpotContactCall/hubspotcontactcall.form.component";
import { HubSpotContactCompanyFormComponent } from "./Entities/HubSpotContactCompany/hubspotcontactcompany.form.component";
import { HubSpotContactDealFormComponent } from "./Entities/HubSpotContactDeal/hubspotcontactdeal.form.component";
import { HubSpotContactEmailFormComponent } from "./Entities/HubSpotContactEmail/hubspotcontactemail.form.component";
import { HubSpotContactFeedbackSubmissionFormComponent } from "./Entities/HubSpotContactFeedbackSubmission/hubspotcontactfeedbacksubmission.form.component";
import { HubSpotContactMeetingFormComponent } from "./Entities/HubSpotContactMeeting/hubspotcontactmeeting.form.component";
import { HubSpotContactNoteFormComponent } from "./Entities/HubSpotContactNote/hubspotcontactnote.form.component";
import { HubSpotContactTaskFormComponent } from "./Entities/HubSpotContactTask/hubspotcontacttask.form.component";
import { HubSpotContactTicketFormComponent } from "./Entities/HubSpotContactTicket/hubspotcontactticket.form.component";
import { HubSpotContactFormComponent } from "./Entities/HubSpotContact/hubspotcontact.form.component";
import { YourMembershipCountryFormComponent } from "./Entities/YourMembershipCountry/yourmembershipcountry.form.component";
import { YourMembershipCustomTaxLocationFormComponent } from "./Entities/YourMembershipCustomTaxLocation/yourmembershipcustomtaxlocation.form.component";
import { HubSpotDealCallFormComponent } from "./Entities/HubSpotDealCall/hubspotdealcall.form.component";
import { HubSpotDealEmailFormComponent } from "./Entities/HubSpotDealEmail/hubspotdealemail.form.component";
import { HubSpotDealLineItemFormComponent } from "./Entities/HubSpotDealLineItem/hubspotdeallineitem.form.component";
import { HubSpotDealMeetingFormComponent } from "./Entities/HubSpotDealMeeting/hubspotdealmeeting.form.component";
import { HubSpotDealNoteFormComponent } from "./Entities/HubSpotDealNote/hubspotdealnote.form.component";
import { HubSpotDealQuoteFormComponent } from "./Entities/HubSpotDealQuote/hubspotdealquote.form.component";
import { HubSpotDealTaskFormComponent } from "./Entities/HubSpotDealTask/hubspotdealtask.form.component";
import { HubSpotDealFormComponent } from "./Entities/HubSpotDeal/hubspotdeal.form.component";
import { YourMembershipDonationFundFormComponent } from "./Entities/YourMembershipDonationFund/yourmembershipdonationfund.form.component";
import { YourMembershipDonationHistoryFormComponent } from "./Entities/YourMembershipDonationHistory/yourmembershipdonationhistory.form.component";
import { YourMembershipDonationTransactionFormComponent } from "./Entities/YourMembershipDonationTransaction/yourmembershipdonationtransaction.form.component";
import { YourMembershipDuesRuleFormComponent } from "./Entities/YourMembershipDuesRule/yourmembershipduesrule.form.component";
import { YourMembershipDuesTransactionFormComponent } from "./Entities/YourMembershipDuesTransaction/yourmembershipduestransaction.form.component";
import { YourMembershipEmailSuppressionListFormComponent } from "./Entities/YourMembershipEmailSuppressionList/yourmembershipemailsuppressionlist.form.component";
import { HubSpotEmailFormComponent } from "./Entities/HubSpotEmail/hubspotemail.form.component";
import { YourMembershipEngagementScoreFormComponent } from "./Entities/YourMembershipEngagementScore/yourmembershipengagementscore.form.component";
import { YourMembershipEventAttendeeTypeFormComponent } from "./Entities/YourMembershipEventAttendeeType/yourmembershipeventattendeetype.form.component";
import { YourMembershipEventCategoryFormComponent } from "./Entities/YourMembershipEventCategory/yourmembershipeventcategory.form.component";
import { YourMembershipEventCEUAwardFormComponent } from "./Entities/YourMembershipEventCEUAward/yourmembershipeventceuaward.form.component";
import { YourMembershipEventIDFormComponent } from "./Entities/YourMembershipEventID/yourmembershipeventid.form.component";
import { YourMembershipEventRegistrationFormFormComponent } from "./Entities/YourMembershipEventRegistrationForm/yourmembershipeventregistrationform.form.component";
import { YourMembershipEventRegistrationFormComponent } from "./Entities/YourMembershipEventRegistration/yourmembershipeventregistration.form.component";
import { YourMembershipEventSessionGroupFormComponent } from "./Entities/YourMembershipEventSessionGroup/yourmembershipeventsessiongroup.form.component";
import { YourMembershipEventSessionFormComponent } from "./Entities/YourMembershipEventSession/yourmembershipeventsession.form.component";
import { YourMembershipEventTicketFormComponent } from "./Entities/YourMembershipEventTicket/yourmembershipeventticket.form.component";
import { YourMembershipEventFormComponent } from "./Entities/YourMembershipEvent/yourmembershipevent.form.component";
import { HubSpotFeedbackSubmissionFormComponent } from "./Entities/HubSpotFeedbackSubmission/hubspotfeedbacksubmission.form.component";
import { YourMembershipFinanceBatchDetailFormComponent } from "./Entities/YourMembershipFinanceBatchDetail/yourmembershipfinancebatchdetail.form.component";
import { YourMembershipFinanceBatchFormComponent } from "./Entities/YourMembershipFinanceBatch/yourmembershipfinancebatch.form.component";
import { YourMembershipGLCodeFormComponent } from "./Entities/YourMembershipGLCode/yourmembershipglcode.form.component";
import { YourMembershipGroupMembershipLogFormComponent } from "./Entities/YourMembershipGroupMembershipLog/yourmembershipgroupmembershiplog.form.component";
import { YourMembershipGroupTypeFormComponent } from "./Entities/YourMembershipGroupType/yourmembershipgrouptype.form.component";
import { YourMembershipGroupFormComponent } from "./Entities/YourMembershipGroup/yourmembershipgroup.form.component";
import { YourMembershipInvoiceItemFormComponent } from "./Entities/YourMembershipInvoiceItem/yourmembershipinvoiceitem.form.component";
import { HubSpotLineItemFormComponent } from "./Entities/HubSpotLineItem/hubspotlineitem.form.component";
import { YourMembershipLocationFormComponent } from "./Entities/YourMembershipLocation/yourmembershiplocation.form.component";
import { HubSpotMeetingFormComponent } from "./Entities/HubSpotMeeting/hubspotmeeting.form.component";
import { YourMembershipMemberFavoriteFormComponent } from "./Entities/YourMembershipMemberFavorite/yourmembershipmemberfavorite.form.component";
import { YourMembershipMemberGroupBulkFormComponent } from "./Entities/YourMembershipMemberGroupBulk/yourmembershipmembergroupbulk.form.component";
import { YourMembershipMemberGroupFormComponent } from "./Entities/YourMembershipMemberGroup/yourmembershipmembergroup.form.component";
import { YourMembershipMemberNetworkFormComponent } from "./Entities/YourMembershipMemberNetwork/yourmembershipmembernetwork.form.component";
import { YourMembershipMemberProfileFormComponent } from "./Entities/YourMembershipMemberProfile/yourmembershipmemberprofile.form.component";
import { YourMembershipMemberReferralFormComponent } from "./Entities/YourMembershipMemberReferral/yourmembershipmemberreferral.form.component";
import { YourMembershipMemberSubAccountFormComponent } from "./Entities/YourMembershipMemberSubAccount/yourmembershipmembersubaccount.form.component";
import { YourMembershipMemberTypeFormComponent } from "./Entities/YourMembershipMemberType/yourmembershipmembertype.form.component";
import { YourMembershipMemberFormComponent } from "./Entities/YourMembershipMember/yourmembershipmember.form.component";
import { YourMembershipMembershipModifierFormComponent } from "./Entities/YourMembershipMembershipModifier/yourmembershipmembershipmodifier.form.component";
import { YourMembershipMembershipPromoCodeFormComponent } from "./Entities/YourMembershipMembershipPromoCode/yourmembershipmembershippromocode.form.component";
import { YourMembershipMembershipFormComponent } from "./Entities/YourMembershipMembership/yourmembershipmembership.form.component";
import { HubSpotNoteFormComponent } from "./Entities/HubSpotNote/hubspotnote.form.component";
import { YourMembershipPaymentProcessorFormComponent } from "./Entities/YourMembershipPaymentProcessor/yourmembershippaymentprocessor.form.component";
import { YourMembershipPersonIDFormComponent } from "./Entities/YourMembershipPersonID/yourmembershippersonid.form.component";
import { YourMembershipProductCategoryFormComponent } from "./Entities/YourMembershipProductCategory/yourmembershipproductcategory.form.component";
import { YourMembershipProductFormComponent } from "./Entities/YourMembershipProduct/yourmembershipproduct.form.component";
import { HubSpotProduct__HubSpotFormComponent } from "./Entities/HubSpotProduct__HubSpot/hubspotproduct__hubspot.form.component";
import { YourMembershipQBClassFormComponent } from "./Entities/YourMembershipQBClass/yourmembershipqbclass.form.component";
import { HubSpotQuoteContactFormComponent } from "./Entities/HubSpotQuoteContact/hubspotquotecontact.form.component";
import { HubSpotQuoteLineItemFormComponent } from "./Entities/HubSpotQuoteLineItem/hubspotquotelineitem.form.component";
import { HubSpotQuoteFormComponent } from "./Entities/HubSpotQuote/hubspotquote.form.component";
import { YourMembershipShippingMethodFormComponent } from "./Entities/YourMembershipShippingMethod/yourmembershipshippingmethod.form.component";
import { YourMembershipSponsorRotatorFormComponent } from "./Entities/YourMembershipSponsorRotator/yourmembershipsponsorrotator.form.component";
import { YourMembershipStoreOrderDetailFormComponent } from "./Entities/YourMembershipStoreOrderDetail/yourmembershipstoreorderdetail.form.component";
import { YourMembershipStoreOrderFormComponent } from "./Entities/YourMembershipStoreOrder/yourmembershipstoreorder.form.component";
import { HubSpotTaskFormComponent } from "./Entities/HubSpotTask/hubspottask.form.component";
import { HubSpotTicketCallFormComponent } from "./Entities/HubSpotTicketCall/hubspotticketcall.form.component";
import { HubSpotTicketEmailFormComponent } from "./Entities/HubSpotTicketEmail/hubspotticketemail.form.component";
import { HubSpotTicketFeedbackSubmissionFormComponent } from "./Entities/HubSpotTicketFeedbackSubmission/hubspotticketfeedbacksubmission.form.component";
import { HubSpotTicketMeetingFormComponent } from "./Entities/HubSpotTicketMeeting/hubspotticketmeeting.form.component";
import { HubSpotTicketNoteFormComponent } from "./Entities/HubSpotTicketNote/hubspotticketnote.form.component";
import { HubSpotTicketTaskFormComponent } from "./Entities/HubSpotTicketTask/hubspottickettask.form.component";
import { HubSpotTicketFormComponent } from "./Entities/HubSpotTicket/hubspotticket.form.component";
import { YourMembershipTimeZoneFormComponent } from "./Entities/YourMembershipTimeZone/yourmembershiptimezone.form.component";
   

@NgModule({
declarations: [
    YourMembershipAllCampaignFormComponent,
    YourMembershipAnnouncementFormComponent,
    HubSpotCallFormComponent,
    YourMembershipCampaignEmailListFormComponent,
    YourMembershipCampaignFormComponent,
    YourMembershipCareerOpeningFormComponent,
    YourMembershipCertificationCreditTypeFormComponent,
    YourMembershipCertificationJournalFormComponent,
    YourMembershipCertificationFormComponent,
    HubSpotCompanyFormComponent,
    HubSpotCompanyCallFormComponent,
    HubSpotCompanyDealFormComponent,
    HubSpotCompanyEmailFormComponent,
    HubSpotCompanyMeetingFormComponent,
    HubSpotCompanyNoteFormComponent,
    HubSpotCompanyTaskFormComponent,
    HubSpotCompanyTicketFormComponent,
    YourMembershipConnectionFormComponent,
    HubSpotContactCallFormComponent,
    HubSpotContactCompanyFormComponent],
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
    HubSpotContactDealFormComponent,
    HubSpotContactEmailFormComponent,
    HubSpotContactFeedbackSubmissionFormComponent,
    HubSpotContactMeetingFormComponent,
    HubSpotContactNoteFormComponent,
    HubSpotContactTaskFormComponent,
    HubSpotContactTicketFormComponent,
    HubSpotContactFormComponent,
    YourMembershipCountryFormComponent,
    YourMembershipCustomTaxLocationFormComponent,
    HubSpotDealCallFormComponent,
    HubSpotDealEmailFormComponent,
    HubSpotDealLineItemFormComponent,
    HubSpotDealMeetingFormComponent,
    HubSpotDealNoteFormComponent,
    HubSpotDealQuoteFormComponent,
    HubSpotDealTaskFormComponent,
    HubSpotDealFormComponent,
    YourMembershipDonationFundFormComponent,
    YourMembershipDonationHistoryFormComponent],
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
    YourMembershipDonationTransactionFormComponent,
    YourMembershipDuesRuleFormComponent,
    YourMembershipDuesTransactionFormComponent,
    YourMembershipEmailSuppressionListFormComponent,
    HubSpotEmailFormComponent,
    YourMembershipEngagementScoreFormComponent,
    YourMembershipEventAttendeeTypeFormComponent,
    YourMembershipEventCategoryFormComponent,
    YourMembershipEventCEUAwardFormComponent,
    YourMembershipEventIDFormComponent,
    YourMembershipEventRegistrationFormFormComponent,
    YourMembershipEventRegistrationFormComponent,
    YourMembershipEventSessionGroupFormComponent,
    YourMembershipEventSessionFormComponent,
    YourMembershipEventTicketFormComponent,
    YourMembershipEventFormComponent,
    HubSpotFeedbackSubmissionFormComponent,
    YourMembershipFinanceBatchDetailFormComponent,
    YourMembershipFinanceBatchFormComponent,
    YourMembershipGLCodeFormComponent],
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
    YourMembershipGroupMembershipLogFormComponent,
    YourMembershipGroupTypeFormComponent,
    YourMembershipGroupFormComponent,
    YourMembershipInvoiceItemFormComponent,
    HubSpotLineItemFormComponent,
    YourMembershipLocationFormComponent,
    HubSpotMeetingFormComponent,
    YourMembershipMemberFavoriteFormComponent,
    YourMembershipMemberGroupBulkFormComponent,
    YourMembershipMemberGroupFormComponent,
    YourMembershipMemberNetworkFormComponent,
    YourMembershipMemberProfileFormComponent,
    YourMembershipMemberReferralFormComponent,
    YourMembershipMemberSubAccountFormComponent,
    YourMembershipMemberTypeFormComponent,
    YourMembershipMemberFormComponent,
    YourMembershipMembershipModifierFormComponent,
    YourMembershipMembershipPromoCodeFormComponent,
    YourMembershipMembershipFormComponent,
    HubSpotNoteFormComponent],
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
export class GeneratedForms_SubModule_3 { }
    


@NgModule({
declarations: [
    YourMembershipPaymentProcessorFormComponent,
    YourMembershipPersonIDFormComponent,
    YourMembershipProductCategoryFormComponent,
    YourMembershipProductFormComponent,
    HubSpotProduct__HubSpotFormComponent,
    YourMembershipQBClassFormComponent,
    HubSpotQuoteContactFormComponent,
    HubSpotQuoteLineItemFormComponent,
    HubSpotQuoteFormComponent,
    YourMembershipShippingMethodFormComponent,
    YourMembershipSponsorRotatorFormComponent,
    YourMembershipStoreOrderDetailFormComponent,
    YourMembershipStoreOrderFormComponent,
    HubSpotTaskFormComponent,
    HubSpotTicketCallFormComponent,
    HubSpotTicketEmailFormComponent,
    HubSpotTicketFeedbackSubmissionFormComponent,
    HubSpotTicketMeetingFormComponent,
    HubSpotTicketNoteFormComponent,
    HubSpotTicketTaskFormComponent],
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
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
    HubSpotTicketFormComponent,
    YourMembershipTimeZoneFormComponent],
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
export class GeneratedForms_SubModule_5 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2,
    GeneratedForms_SubModule_3,
    GeneratedForms_SubModule_4,
    GeneratedForms_SubModule_5
]
})
export class GeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    