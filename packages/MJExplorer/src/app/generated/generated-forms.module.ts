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
import { IndustryFormComponent, LoadIndustryFormComponent } from "./Entities/Industry/industry.form.component";
import { ContactRoleFormComponent, LoadContactRoleFormComponent } from "./Entities/ContactRole/contactrole.form.component";
import { ContactLevelFormComponent, LoadContactLevelFormComponent } from "./Entities/ContactLevel/contactlevel.form.component";
import { AccountFormComponent, LoadAccountFormComponent } from "./Entities/Account/account.form.component";
import { ContactFormComponent, LoadContactFormComponent } from "./Entities/Contact/contact.form.component";
import { DealStageFormComponent, LoadDealStageFormComponent } from "./Entities/DealStage/dealstage.form.component";
import { ActivityFormComponent, LoadActivityFormComponent } from "./Entities/Activity/activity.form.component";
import { DealForecastCategoryFormComponent, LoadDealForecastCategoryFormComponent } from "./Entities/DealForecastCategory/dealforecastcategory.form.component";
import { DealFormComponent, LoadDealFormComponent } from "./Entities/Deal/deal.form.component";
import { DealTypeFormComponent, LoadDealTypeFormComponent } from "./Entities/DealType/dealtype.form.component";
import { InvoiceFormComponent, LoadInvoiceFormComponent } from "./Entities/Invoice/invoice.form.component";
import { ActivityAttachmentFormComponent, LoadActivityAttachmentFormComponent } from "./Entities/ActivityAttachment/activityattachment.form.component";
import { PaymentTermsTypeFormComponent, LoadPaymentTermsTypeFormComponent } from "./Entities/PaymentTermsType/paymenttermstype.form.component";
import { InvoiceStatusTypeFormComponent, LoadInvoiceStatusTypeFormComponent } from "./Entities/InvoiceStatusType/invoicestatustype.form.component";
import { IndustryDetailsComponent, LoadIndustryDetailsComponent } from "./Entities/Industry/sections/details.component"
import { ContactRoleDetailsComponent, LoadContactRoleDetailsComponent } from "./Entities/ContactRole/sections/details.component"
import { ContactLevelDetailsComponent, LoadContactLevelDetailsComponent } from "./Entities/ContactLevel/sections/details.component"
import { AccountDetailsComponent, LoadAccountDetailsComponent } from "./Entities/Account/sections/details.component"
import { ContactDetailsComponent, LoadContactDetailsComponent } from "./Entities/Contact/sections/details.component"
import { DealStageDetailsComponent, LoadDealStageDetailsComponent } from "./Entities/DealStage/sections/details.component"
import { ActivityDetailsComponent, LoadActivityDetailsComponent } from "./Entities/Activity/sections/details.component"
import { DealForecastCategoryDetailsComponent, LoadDealForecastCategoryDetailsComponent } from "./Entities/DealForecastCategory/sections/details.component"
import { DealDetailsComponent, LoadDealDetailsComponent } from "./Entities/Deal/sections/details.component"
import { DealTypeDetailsComponent, LoadDealTypeDetailsComponent } from "./Entities/DealType/sections/details.component"
import { InvoiceDetailsComponent, LoadInvoiceDetailsComponent } from "./Entities/Invoice/sections/details.component"
import { ActivityAttachmentDetailsComponent, LoadActivityAttachmentDetailsComponent } from "./Entities/ActivityAttachment/sections/details.component"
import { PaymentTermsTypeDetailsComponent, LoadPaymentTermsTypeDetailsComponent } from "./Entities/PaymentTermsType/sections/details.component"
import { InvoiceStatusTypeDetailsComponent, LoadInvoiceStatusTypeDetailsComponent } from "./Entities/InvoiceStatusType/sections/details.component"
    

@NgModule({
declarations: [
    IndustryFormComponent,
    ContactRoleFormComponent,
    ContactLevelFormComponent,
    AccountFormComponent,
    ContactFormComponent,
    DealStageFormComponent,
    ActivityFormComponent,
    DealForecastCategoryFormComponent,
    DealFormComponent,
    DealTypeFormComponent,
    InvoiceFormComponent,
    ActivityAttachmentFormComponent,
    PaymentTermsTypeFormComponent,
    InvoiceStatusTypeFormComponent,
    IndustryDetailsComponent,
    ContactRoleDetailsComponent,
    ContactLevelDetailsComponent,
    AccountDetailsComponent,
    ContactDetailsComponent,
    DealStageDetailsComponent],
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
    ActivityDetailsComponent,
    DealForecastCategoryDetailsComponent,
    DealDetailsComponent,
    DealTypeDetailsComponent,
    InvoiceDetailsComponent,
    ActivityAttachmentDetailsComponent,
    PaymentTermsTypeDetailsComponent,
    InvoiceStatusTypeDetailsComponent],
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
    LoadIndustryFormComponent();
    LoadContactRoleFormComponent();
    LoadContactLevelFormComponent();
    LoadAccountFormComponent();
    LoadContactFormComponent();
    LoadDealStageFormComponent();
    LoadActivityFormComponent();
    LoadDealForecastCategoryFormComponent();
    LoadDealFormComponent();
    LoadDealTypeFormComponent();
    LoadInvoiceFormComponent();
    LoadActivityAttachmentFormComponent();
    LoadPaymentTermsTypeFormComponent();
    LoadInvoiceStatusTypeFormComponent();
    LoadIndustryDetailsComponent();
    LoadContactRoleDetailsComponent();
    LoadContactLevelDetailsComponent();
    LoadAccountDetailsComponent();
    LoadContactDetailsComponent();
    LoadDealStageDetailsComponent();
    LoadActivityDetailsComponent();
    LoadDealForecastCategoryDetailsComponent();
    LoadDealDetailsComponent();
    LoadDealTypeDetailsComponent();
    LoadInvoiceDetailsComponent();
    LoadActivityAttachmentDetailsComponent();
    LoadPaymentTermsTypeDetailsComponent();
    LoadInvoiceStatusTypeDetailsComponent();
}
    