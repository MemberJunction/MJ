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
import { TimelineModule } from '@memberjunction/ng-timeline';

// Kendo Imports
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { ComboBoxModule } from '@progress/kendo-angular-dropdowns';
import { DropDownListModule } from '@progress/kendo-angular-dropdowns';

// Import Generated Components
import { ThreadDetailFormComponent, LoadThreadDetailFormComponent } from "./Entities/ThreadDetail/threaddetail.form.component";
import { ThreadFormComponent, LoadThreadFormComponent } from "./Entities/Thread/thread.form.component";
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
import { SalesLineItemFormComponent, LoadSalesLineItemFormComponent } from "./Entities/SalesLineItem/saleslineitem.form.component";
import { SalesTransactionFormComponent, LoadSalesTransactionFormComponent } from "./Entities/SalesTransaction/salestransaction.form.component";
import { CustomerAddress__client_financeFormComponent, LoadCustomerAddress__client_financeFormComponent } from "./Entities/CustomerAddress__client_finance/customeraddress__client_finance.form.component";
import { Item__client_financeFormComponent, LoadItem__client_financeFormComponent } from "./Entities/Item__client_finance/item__client_finance.form.component";
import { Customer__client_financeFormComponent, LoadCustomer__client_financeFormComponent } from "./Entities/Customer__client_finance/customer__client_finance.form.component";
import { OrganizationLinkFormComponent, LoadOrganizationLinkFormComponent } from "./Entities/OrganizationLink/organizationlink.form.component";
import { PersonLinkFormComponent, LoadPersonLinkFormComponent } from "./Entities/PersonLink/personlink.form.component";
import { Account__client_crmFormComponent, LoadAccount__client_crmFormComponent } from "./Entities/Account__client_crm/account__client_crm.form.component";
import { StringMapFormComponent, LoadStringMapFormComponent } from "./Entities/StringMap/stringmap.form.component";
import { ProductPriceLevelFormComponent, LoadProductPriceLevelFormComponent } from "./Entities/ProductPriceLevel/productpricelevel.form.component";
import { client_membershipFormComponent, Loadclient_membershipFormComponent } from "./Entities/client_membership/client_membership.form.component";
import { Contact__client_crmFormComponent, LoadContact__client_crmFormComponent } from "./Entities/Contact__client_crm/contact__client_crm.form.component";
import { UoMFormComponent, LoadUoMFormComponent } from "./Entities/UoM/uom.form.component";
import { SalesOrderFormComponent, LoadSalesOrderFormComponent } from "./Entities/SalesOrder/salesorder.form.component";
import { SalesOrderDetailFormComponent, LoadSalesOrderDetailFormComponent } from "./Entities/SalesOrderDetail/salesorderdetail.form.component";
import { ProductFormComponent, LoadProductFormComponent } from "./Entities/Product/product.form.component";
import { CustomerAddressFormComponent, LoadCustomerAddressFormComponent } from "./Entities/CustomerAddress/customeraddress.form.component";
import { SalesLineItem__client_membershipFormComponent, LoadSalesLineItem__client_membershipFormComponent } from "./Entities/SalesLineItem__client_membership/saleslineitem__client_membership.form.component";
import { ItemFormComponent, LoadItemFormComponent } from "./Entities/Item/item.form.component";
import { CustomerFormComponent, LoadCustomerFormComponent } from "./Entities/Customer/customer.form.component";
import { SalesTransaction__client_membershipFormComponent, LoadSalesTransaction__client_membershipFormComponent } from "./Entities/SalesTransaction__client_membership/salestransaction__client_membership.form.component";
import { ThreadDetailDetailsComponent, LoadThreadDetailDetailsComponent } from "./Entities/ThreadDetail/sections/details.component"
import { ThreadDetailsComponent, LoadThreadDetailsComponent } from "./Entities/Thread/sections/details.component"
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
import { SalesLineItemDetailsComponent, LoadSalesLineItemDetailsComponent } from "./Entities/SalesLineItem/sections/details.component"
import { SalesTransactionDetailsComponent, LoadSalesTransactionDetailsComponent } from "./Entities/SalesTransaction/sections/details.component"
import { CustomerAddress__client_financeDetailsComponent, LoadCustomerAddress__client_financeDetailsComponent } from "./Entities/CustomerAddress__client_finance/sections/details.component"
import { Item__client_financeDetailsComponent, LoadItem__client_financeDetailsComponent } from "./Entities/Item__client_finance/sections/details.component"
import { Customer__client_financeDetailsComponent, LoadCustomer__client_financeDetailsComponent } from "./Entities/Customer__client_finance/sections/details.component"
import { OrganizationLinkDetailsComponent, LoadOrganizationLinkDetailsComponent } from "./Entities/OrganizationLink/sections/details.component"
import { PersonLinkDetailsComponent, LoadPersonLinkDetailsComponent } from "./Entities/PersonLink/sections/details.component"
import { Account__client_crmDetailsComponent, LoadAccount__client_crmDetailsComponent } from "./Entities/Account__client_crm/sections/details.component"
import { StringMapDetailsComponent, LoadStringMapDetailsComponent } from "./Entities/StringMap/sections/details.component"
import { ProductPriceLevelDetailsComponent, LoadProductPriceLevelDetailsComponent } from "./Entities/ProductPriceLevel/sections/details.component"
import { client_membershipDetailsComponent, Loadclient_membershipDetailsComponent } from "./Entities/client_membership/sections/details.component"
import { Contact__client_crmDetailsComponent, LoadContact__client_crmDetailsComponent } from "./Entities/Contact__client_crm/sections/details.component"
import { UoMDetailsComponent, LoadUoMDetailsComponent } from "./Entities/UoM/sections/details.component"
import { SalesOrderDetailsComponent, LoadSalesOrderDetailsComponent } from "./Entities/SalesOrder/sections/details.component"
import { SalesOrderDetailDetailsComponent, LoadSalesOrderDetailDetailsComponent } from "./Entities/SalesOrderDetail/sections/details.component"
import { ProductDetailsComponent, LoadProductDetailsComponent } from "./Entities/Product/sections/details.component"
import { CustomerAddressDetailsComponent, LoadCustomerAddressDetailsComponent } from "./Entities/CustomerAddress/sections/details.component"
import { SalesLineItem__client_membershipDetailsComponent, LoadSalesLineItem__client_membershipDetailsComponent } from "./Entities/SalesLineItem__client_membership/sections/details.component"
import { ItemDetailsComponent, LoadItemDetailsComponent } from "./Entities/Item/sections/details.component"
import { CustomerDetailsComponent, LoadCustomerDetailsComponent } from "./Entities/Customer/sections/details.component"
import { SalesTransaction__client_membershipDetailsComponent, LoadSalesTransaction__client_membershipDetailsComponent } from "./Entities/SalesTransaction__client_membership/sections/details.component"
   

@NgModule({
declarations: [
    ThreadDetailFormComponent,
    ThreadFormComponent,
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
    SalesLineItemFormComponent,
    SalesTransactionFormComponent,
    CustomerAddress__client_financeFormComponent,
    Item__client_financeFormComponent],
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
    ComboBoxModule,
    UserViewGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
    Customer__client_financeFormComponent,
    OrganizationLinkFormComponent,
    PersonLinkFormComponent,
    Account__client_crmFormComponent,
    StringMapFormComponent,
    ProductPriceLevelFormComponent,
    client_membershipFormComponent,
    Contact__client_crmFormComponent,
    UoMFormComponent,
    SalesOrderFormComponent,
    SalesOrderDetailFormComponent,
    ProductFormComponent,
    CustomerAddressFormComponent,
    SalesLineItem__client_membershipFormComponent,
    ItemFormComponent,
    CustomerFormComponent,
    SalesTransaction__client_membershipFormComponent,
    ThreadDetailDetailsComponent,
    ThreadDetailsComponent,
    IndustryDetailsComponent],
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
    ComboBoxModule,
    UserViewGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_1 { }
    


@NgModule({
declarations: [
    ContactRoleDetailsComponent,
    ContactLevelDetailsComponent,
    AccountDetailsComponent,
    ContactDetailsComponent,
    DealStageDetailsComponent,
    ActivityDetailsComponent,
    DealForecastCategoryDetailsComponent,
    DealDetailsComponent,
    DealTypeDetailsComponent,
    InvoiceDetailsComponent,
    ActivityAttachmentDetailsComponent,
    PaymentTermsTypeDetailsComponent,
    InvoiceStatusTypeDetailsComponent,
    SalesLineItemDetailsComponent,
    SalesTransactionDetailsComponent,
    CustomerAddress__client_financeDetailsComponent,
    Item__client_financeDetailsComponent,
    Customer__client_financeDetailsComponent,
    OrganizationLinkDetailsComponent,
    PersonLinkDetailsComponent],
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
    ComboBoxModule,
    TimelineModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }
    


@NgModule({
declarations: [
    Account__client_crmDetailsComponent,
    StringMapDetailsComponent,
    ProductPriceLevelDetailsComponent,
    client_membershipDetailsComponent,
    Contact__client_crmDetailsComponent,
    UoMDetailsComponent,
    SalesOrderDetailsComponent,
    SalesOrderDetailDetailsComponent,
    ProductDetailsComponent,
    CustomerAddressDetailsComponent,
    SalesLineItem__client_membershipDetailsComponent,
    ItemDetailsComponent,
    CustomerDetailsComponent,
    SalesTransaction__client_membershipDetailsComponent],
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
    ComboBoxModule,
    TimelineModule
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
    LoadThreadDetailFormComponent();
    LoadThreadFormComponent();
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
    LoadSalesLineItemFormComponent();
    LoadSalesTransactionFormComponent();
    LoadCustomerAddress__client_financeFormComponent();
    LoadItem__client_financeFormComponent();
    LoadCustomer__client_financeFormComponent();
    LoadOrganizationLinkFormComponent();
    LoadPersonLinkFormComponent();
    LoadAccount__client_crmFormComponent();
    LoadStringMapFormComponent();
    LoadProductPriceLevelFormComponent();
    Loadclient_membershipFormComponent();
    LoadContact__client_crmFormComponent();
    LoadUoMFormComponent();
    LoadSalesOrderFormComponent();
    LoadSalesOrderDetailFormComponent();
    LoadProductFormComponent();
    LoadCustomerAddressFormComponent();
    LoadSalesLineItem__client_membershipFormComponent();
    LoadItemFormComponent();
    LoadCustomerFormComponent();
    LoadSalesTransaction__client_membershipFormComponent();
    LoadThreadDetailDetailsComponent();
    LoadThreadDetailsComponent();
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
    LoadSalesLineItemDetailsComponent();
    LoadSalesTransactionDetailsComponent();
    LoadCustomerAddress__client_financeDetailsComponent();
    LoadItem__client_financeDetailsComponent();
    LoadCustomer__client_financeDetailsComponent();
    LoadOrganizationLinkDetailsComponent();
    LoadPersonLinkDetailsComponent();
    LoadAccount__client_crmDetailsComponent();
    LoadStringMapDetailsComponent();
    LoadProductPriceLevelDetailsComponent();
    Loadclient_membershipDetailsComponent();
    LoadContact__client_crmDetailsComponent();
    LoadUoMDetailsComponent();
    LoadSalesOrderDetailsComponent();
    LoadSalesOrderDetailDetailsComponent();
    LoadProductDetailsComponent();
    LoadCustomerAddressDetailsComponent();
    LoadSalesLineItem__client_membershipDetailsComponent();
    LoadItemDetailsComponent();
    LoadCustomerDetailsComponent();
    LoadSalesTransaction__client_membershipDetailsComponent();
}
    