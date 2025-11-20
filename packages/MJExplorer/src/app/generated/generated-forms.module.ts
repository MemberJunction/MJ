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
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
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
import { AccountInsightFormComponent, LoadAccountInsightFormComponent } from "./Entities/AccountInsight/accountinsight.form.component";
import { AccountStatusFormComponent, LoadAccountStatusFormComponent } from "./Entities/AccountStatus/accountstatus.form.component";
import { AccountTypeFormComponent, LoadAccountTypeFormComponent } from "./Entities/AccountType/accounttype.form.component";
import { AccountFormComponent, LoadAccountFormComponent } from "./Entities/Account/account.form.component";
import { ActivityFormComponent, LoadActivityFormComponent } from "./Entities/Activity/activity.form.component";
import { ActivityTypeFormComponent, LoadActivityTypeFormComponent } from "./Entities/ActivityType/activitytype.form.component";
import { ContactRelationshipFormComponent, LoadContactRelationshipFormComponent } from "./Entities/ContactRelationship/contactrelationship.form.component";
import { ContactFormComponent, LoadContactFormComponent } from "./Entities/Contact/contact.form.component";
import { DealProductFormComponent, LoadDealProductFormComponent } from "./Entities/DealProduct/dealproduct.form.component";
import { DealFormComponent, LoadDealFormComponent } from "./Entities/Deal/deal.form.component";
import { EventReviewTaskFormComponent, LoadEventReviewTaskFormComponent } from "./Entities/EventReviewTask/eventreviewtask.form.component";
import { EventFormComponent, LoadEventFormComponent } from "./Entities/Event/event.form.component";
import { IndustryFormComponent, LoadIndustryFormComponent } from "./Entities/Industry/industry.form.component";
import { InvoiceLineItemFormComponent, LoadInvoiceLineItemFormComponent } from "./Entities/InvoiceLineItem/invoicelineitem.form.component";
import { InvoiceFormComponent, LoadInvoiceFormComponent } from "./Entities/Invoice/invoice.form.component";
import { LegislativeFindingsFormComponent, LoadLegislativeFindingsFormComponent } from "./Entities/LegislativeFindings/legislativefindings.form.component";
import { PaymentFormComponent, LoadPaymentFormComponent } from "./Entities/Payment/payment.form.component";
import { ProductFormComponent, LoadProductFormComponent } from "./Entities/Product/product.form.component";
import { RelationshipTypeFormComponent, LoadRelationshipTypeFormComponent } from "./Entities/RelationshipType/relationshiptype.form.component";
import { SpeakerFormComponent, LoadSpeakerFormComponent } from "./Entities/Speaker/speaker.form.component";
import { SubmissionNotificationFormComponent, LoadSubmissionNotificationFormComponent } from "./Entities/SubmissionNotification/submissionnotification.form.component";
import { SubmissionReviewFormComponent, LoadSubmissionReviewFormComponent } from "./Entities/SubmissionReview/submissionreview.form.component";
import { SubmissionSpeakerFormComponent, LoadSubmissionSpeakerFormComponent } from "./Entities/SubmissionSpeaker/submissionspeaker.form.component";
import { SubmissionFormComponent, LoadSubmissionFormComponent } from "./Entities/Submission/submission.form.component";
   

@NgModule({
declarations: [
    AccountInsightFormComponent,
    AccountStatusFormComponent,
    AccountTypeFormComponent,
    AccountFormComponent,
    ActivityFormComponent,
    ActivityTypeFormComponent,
    ContactRelationshipFormComponent,
    ContactFormComponent,
    DealProductFormComponent,
    DealFormComponent,
    EventReviewTaskFormComponent,
    EventFormComponent,
    IndustryFormComponent,
    InvoiceLineItemFormComponent,
    InvoiceFormComponent,
    LegislativeFindingsFormComponent,
    PaymentFormComponent,
    ProductFormComponent,
    RelationshipTypeFormComponent,
    SpeakerFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
    SubmissionNotificationFormComponent,
    SubmissionReviewFormComponent,
    SubmissionSpeakerFormComponent,
    SubmissionFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1
]
})
export class GeneratedFormsModule { }
    
export function LoadGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    LoadAccountInsightFormComponent();
    LoadAccountStatusFormComponent();
    LoadAccountTypeFormComponent();
    LoadAccountFormComponent();
    LoadActivityFormComponent();
    LoadActivityTypeFormComponent();
    LoadContactRelationshipFormComponent();
    LoadContactFormComponent();
    LoadDealProductFormComponent();
    LoadDealFormComponent();
    LoadEventReviewTaskFormComponent();
    LoadEventFormComponent();
    LoadIndustryFormComponent();
    LoadInvoiceLineItemFormComponent();
    LoadInvoiceFormComponent();
    LoadLegislativeFindingsFormComponent();
    LoadPaymentFormComponent();
    LoadProductFormComponent();
    LoadRelationshipTypeFormComponent();
    LoadSpeakerFormComponent();
    LoadSubmissionNotificationFormComponent();
    LoadSubmissionReviewFormComponent();
    LoadSubmissionSpeakerFormComponent();
    LoadSubmissionFormComponent();
}
    