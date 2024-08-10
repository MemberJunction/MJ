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
import { AccountFormComponent, LoadAccountFormComponent } from "./Entities/Account/account.form.component";
import { Account__client_crmFormComponent, LoadAccount__client_crmFormComponent } from "./Entities/Account__client_crm/account__client_crm.form.component";
import { ActivityFormComponent, LoadActivityFormComponent } from "./Entities/Activity/activity.form.component";
import { ActivityAttachmentFormComponent, LoadActivityAttachmentFormComponent } from "./Entities/ActivityAttachment/activityattachment.form.component";
import { client_membershipFormComponent, Loadclient_membershipFormComponent } from "./Entities/client_membership/client_membership.form.component";
import { ContactLevelFormComponent, LoadContactLevelFormComponent } from "./Entities/ContactLevel/contactlevel.form.component";
import { ContactRoleFormComponent, LoadContactRoleFormComponent } from "./Entities/ContactRole/contactrole.form.component";
import { ContactFormComponent, LoadContactFormComponent } from "./Entities/Contact/contact.form.component";
import { Contact__client_crmFormComponent, LoadContact__client_crmFormComponent } from "./Entities/Contact__client_crm/contact__client_crm.form.component";
import { ContentSourceTypeFormComponent, LoadContentSourceTypeFormComponent } from "./Entities/ContentSourceType/contentsourcetype.form.component";
import { ContentSourceFormComponent, LoadContentSourceFormComponent } from "./Entities/ContentSource/contentsource.form.component";
import { CustomerAddressFormComponent, LoadCustomerAddressFormComponent } from "./Entities/CustomerAddress/customeraddress.form.component";
import { CustomerAddress__client_financeFormComponent, LoadCustomerAddress__client_financeFormComponent } from "./Entities/CustomerAddress__client_finance/customeraddress__client_finance.form.component";
import { CustomerFormComponent, LoadCustomerFormComponent } from "./Entities/Customer/customer.form.component";
import { Customer__client_financeFormComponent, LoadCustomer__client_financeFormComponent } from "./Entities/Customer__client_finance/customer__client_finance.form.component";
import { DealForecastCategoryFormComponent, LoadDealForecastCategoryFormComponent } from "./Entities/DealForecastCategory/dealforecastcategory.form.component";
import { DealStageFormComponent, LoadDealStageFormComponent } from "./Entities/DealStage/dealstage.form.component";
import { DealTypeFormComponent, LoadDealTypeFormComponent } from "./Entities/DealType/dealtype.form.component";
import { DealFormComponent, LoadDealFormComponent } from "./Entities/Deal/deal.form.component";
import { IndustryFormComponent, LoadIndustryFormComponent } from "./Entities/Industry/industry.form.component";
import { InvoiceStatusTypeFormComponent, LoadInvoiceStatusTypeFormComponent } from "./Entities/InvoiceStatusType/invoicestatustype.form.component";
import { InvoiceFormComponent, LoadInvoiceFormComponent } from "./Entities/Invoice/invoice.form.component";
import { ItemFormComponent, LoadItemFormComponent } from "./Entities/Item/item.form.component";
import { Item__client_financeFormComponent, LoadItem__client_financeFormComponent } from "./Entities/Item__client_finance/item__client_finance.form.component";
import { OrganizationLinkFormComponent, LoadOrganizationLinkFormComponent } from "./Entities/OrganizationLink/organizationlink.form.component";
import { PaymentTermsTypeFormComponent, LoadPaymentTermsTypeFormComponent } from "./Entities/PaymentTermsType/paymenttermstype.form.component";
import { PersonLinkFormComponent, LoadPersonLinkFormComponent } from "./Entities/PersonLink/personlink.form.component";
import { ProductPriceLevelFormComponent, LoadProductPriceLevelFormComponent } from "./Entities/ProductPriceLevel/productpricelevel.form.component";
import { ProductFormComponent, LoadProductFormComponent } from "./Entities/Product/product.form.component";
import { QuadDemoFormComponent, LoadQuadDemoFormComponent } from "./Entities/QuadDemo/quaddemo.form.component";
import { SalesLineItemFormComponent, LoadSalesLineItemFormComponent } from "./Entities/SalesLineItem/saleslineitem.form.component";
import { SalesLineItem__client_membershipFormComponent, LoadSalesLineItem__client_membershipFormComponent } from "./Entities/SalesLineItem__client_membership/saleslineitem__client_membership.form.component";
import { SalesOrderDetailFormComponent, LoadSalesOrderDetailFormComponent } from "./Entities/SalesOrderDetail/salesorderdetail.form.component";
import { SalesOrderFormComponent, LoadSalesOrderFormComponent } from "./Entities/SalesOrder/salesorder.form.component";
import { SalesTransactionFormComponent, LoadSalesTransactionFormComponent } from "./Entities/SalesTransaction/salestransaction.form.component";
import { SalesTransaction__client_membershipFormComponent, LoadSalesTransaction__client_membershipFormComponent } from "./Entities/SalesTransaction__client_membership/salestransaction__client_membership.form.component";
import { StringMapFormComponent, LoadStringMapFormComponent } from "./Entities/StringMap/stringmap.form.component";
import { ThreadDetailFormComponent, LoadThreadDetailFormComponent } from "./Entities/ThreadDetail/threaddetail.form.component";
import { ThreadFormComponent, LoadThreadFormComponent } from "./Entities/Thread/thread.form.component";
import { UoMFormComponent, LoadUoMFormComponent } from "./Entities/UoM/uom.form.component";
import { AccountDetailsComponent, LoadAccountDetailsComponent } from "./Entities/Account/sections/details.component"
import { Account__client_crmDetailsComponent, LoadAccount__client_crmDetailsComponent } from "./Entities/Account__client_crm/sections/details.component"
import { ActivityDetailsComponent, LoadActivityDetailsComponent } from "./Entities/Activity/sections/details.component"
import { ActivityAttachmentDetailsComponent, LoadActivityAttachmentDetailsComponent } from "./Entities/ActivityAttachment/sections/details.component"
import { client_membershipDetailsComponent, Loadclient_membershipDetailsComponent } from "./Entities/client_membership/sections/details.component"
import { ContactLevelDetailsComponent, LoadContactLevelDetailsComponent } from "./Entities/ContactLevel/sections/details.component"
import { ContactRoleDetailsComponent, LoadContactRoleDetailsComponent } from "./Entities/ContactRole/sections/details.component"
import { ContactDetailsComponent, LoadContactDetailsComponent } from "./Entities/Contact/sections/details.component"
import { Contact__client_crmDetailsComponent, LoadContact__client_crmDetailsComponent } from "./Entities/Contact__client_crm/sections/details.component"
import { ContentSourceTypeDetailsComponent, LoadContentSourceTypeDetailsComponent } from "./Entities/ContentSourceType/sections/details.component"
import { ContentSourceDetailsComponent, LoadContentSourceDetailsComponent } from "./Entities/ContentSource/sections/details.component"
import { CustomerAddressDetailsComponent, LoadCustomerAddressDetailsComponent } from "./Entities/CustomerAddress/sections/details.component"
import { CustomerAddress__client_financeDetailsComponent, LoadCustomerAddress__client_financeDetailsComponent } from "./Entities/CustomerAddress__client_finance/sections/details.component"
import { CustomerDetailsComponent, LoadCustomerDetailsComponent } from "./Entities/Customer/sections/details.component"
import { Customer__client_financeDetailsComponent, LoadCustomer__client_financeDetailsComponent } from "./Entities/Customer__client_finance/sections/details.component"
import { DealForecastCategoryDetailsComponent, LoadDealForecastCategoryDetailsComponent } from "./Entities/DealForecastCategory/sections/details.component"
import { DealStageDetailsComponent, LoadDealStageDetailsComponent } from "./Entities/DealStage/sections/details.component"
import { DealTypeDetailsComponent, LoadDealTypeDetailsComponent } from "./Entities/DealType/sections/details.component"
import { DealDetailsComponent, LoadDealDetailsComponent } from "./Entities/Deal/sections/details.component"
import { IndustryDetailsComponent, LoadIndustryDetailsComponent } from "./Entities/Industry/sections/details.component"
import { InvoiceStatusTypeDetailsComponent, LoadInvoiceStatusTypeDetailsComponent } from "./Entities/InvoiceStatusType/sections/details.component"
import { InvoiceDetailsComponent, LoadInvoiceDetailsComponent } from "./Entities/Invoice/sections/details.component"
import { ItemDetailsComponent, LoadItemDetailsComponent } from "./Entities/Item/sections/details.component"
import { Item__client_financeDetailsComponent, LoadItem__client_financeDetailsComponent } from "./Entities/Item__client_finance/sections/details.component"
import { OrganizationLinkDetailsComponent, LoadOrganizationLinkDetailsComponent } from "./Entities/OrganizationLink/sections/details.component"
import { PaymentTermsTypeDetailsComponent, LoadPaymentTermsTypeDetailsComponent } from "./Entities/PaymentTermsType/sections/details.component"
import { PersonLinkDetailsComponent, LoadPersonLinkDetailsComponent } from "./Entities/PersonLink/sections/details.component"
import { ProductPriceLevelDetailsComponent, LoadProductPriceLevelDetailsComponent } from "./Entities/ProductPriceLevel/sections/details.component"
import { ProductDetailsComponent, LoadProductDetailsComponent } from "./Entities/Product/sections/details.component"
import { QuadDemoDetailsComponent, LoadQuadDemoDetailsComponent } from "./Entities/QuadDemo/sections/details.component"
import { SalesLineItemDetailsComponent, LoadSalesLineItemDetailsComponent } from "./Entities/SalesLineItem/sections/details.component"
import { SalesLineItem__client_membershipDetailsComponent, LoadSalesLineItem__client_membershipDetailsComponent } from "./Entities/SalesLineItem__client_membership/sections/details.component"
import { SalesOrderDetailDetailsComponent, LoadSalesOrderDetailDetailsComponent } from "./Entities/SalesOrderDetail/sections/details.component"
import { SalesOrderDetailsComponent, LoadSalesOrderDetailsComponent } from "./Entities/SalesOrder/sections/details.component"
import { SalesTransactionDetailsComponent, LoadSalesTransactionDetailsComponent } from "./Entities/SalesTransaction/sections/details.component"
import { SalesTransaction__client_membershipDetailsComponent, LoadSalesTransaction__client_membershipDetailsComponent } from "./Entities/SalesTransaction__client_membership/sections/details.component"
import { StringMapDetailsComponent, LoadStringMapDetailsComponent } from "./Entities/StringMap/sections/details.component"
import { ThreadDetailDetailsComponent, LoadThreadDetailDetailsComponent } from "./Entities/ThreadDetail/sections/details.component"
import { ThreadDetailsComponent, LoadThreadDetailsComponent } from "./Entities/Thread/sections/details.component"
import { UoMDetailsComponent, LoadUoMDetailsComponent } from "./Entities/UoM/sections/details.component"
import { TimelineModule } from "@memberjunction/ng-timeline"   

@NgModule({
declarations: [
    AccountFormComponent,
    Account__client_crmFormComponent,
    ActivityFormComponent,
    ActivityAttachmentFormComponent,
    client_membershipFormComponent,
    ContactLevelFormComponent,
    ContactRoleFormComponent,
    ContactFormComponent,
    Contact__client_crmFormComponent,
    ContentSourceTypeFormComponent,
    ContentSourceFormComponent,
    CustomerAddressFormComponent,
    CustomerAddress__client_financeFormComponent,
    CustomerFormComponent,
    Customer__client_financeFormComponent,
    DealForecastCategoryFormComponent,
    DealStageFormComponent,
    DealTypeFormComponent,
    DealFormComponent,
    IndustryFormComponent],
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
    UserViewGridModule,
    TimelineModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
    InvoiceStatusTypeFormComponent,
    InvoiceFormComponent,
    ItemFormComponent,
    Item__client_financeFormComponent,
    OrganizationLinkFormComponent,
    PaymentTermsTypeFormComponent,
    PersonLinkFormComponent,
    ProductPriceLevelFormComponent,
    ProductFormComponent,
    QuadDemoFormComponent,
    SalesLineItemFormComponent,
    SalesLineItem__client_membershipFormComponent,
    SalesOrderDetailFormComponent,
    SalesOrderFormComponent,
    SalesTransactionFormComponent,
    SalesTransaction__client_membershipFormComponent,
    StringMapFormComponent,
    ThreadDetailFormComponent,
    ThreadFormComponent,
    UoMFormComponent],
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
    AccountDetailsComponent,
    Account__client_crmDetailsComponent,
    ActivityDetailsComponent,
    ActivityAttachmentDetailsComponent,
    client_membershipDetailsComponent,
    ContactLevelDetailsComponent,
    ContactRoleDetailsComponent,
    ContactDetailsComponent,
    Contact__client_crmDetailsComponent,
    ContentSourceTypeDetailsComponent,
    ContentSourceDetailsComponent,
    CustomerAddressDetailsComponent,
    CustomerAddress__client_financeDetailsComponent,
    CustomerDetailsComponent,
    Customer__client_financeDetailsComponent,
    DealForecastCategoryDetailsComponent,
    DealStageDetailsComponent,
    DealTypeDetailsComponent,
    DealDetailsComponent,
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
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }
    


@NgModule({
declarations: [
    InvoiceStatusTypeDetailsComponent,
    InvoiceDetailsComponent,
    ItemDetailsComponent,
    Item__client_financeDetailsComponent,
    OrganizationLinkDetailsComponent,
    PaymentTermsTypeDetailsComponent,
    PersonLinkDetailsComponent,
    ProductPriceLevelDetailsComponent,
    ProductDetailsComponent,
    QuadDemoDetailsComponent,
    SalesLineItemDetailsComponent,
    SalesLineItem__client_membershipDetailsComponent,
    SalesOrderDetailDetailsComponent,
    SalesOrderDetailsComponent,
    SalesTransactionDetailsComponent,
    SalesTransaction__client_membershipDetailsComponent,
    StringMapDetailsComponent,
    ThreadDetailDetailsComponent,
    ThreadDetailsComponent,
    UoMDetailsComponent],
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
    LoadAccountFormComponent();
    LoadAccount__client_crmFormComponent();
    LoadActivityFormComponent();
    LoadActivityAttachmentFormComponent();
    Loadclient_membershipFormComponent();
    LoadContactLevelFormComponent();
    LoadContactRoleFormComponent();
    LoadContactFormComponent();
    LoadContact__client_crmFormComponent();
    LoadContentSourceTypeFormComponent();
    LoadContentSourceFormComponent();
    LoadCustomerAddressFormComponent();
    LoadCustomerAddress__client_financeFormComponent();
    LoadCustomerFormComponent();
    LoadCustomer__client_financeFormComponent();
    LoadDealForecastCategoryFormComponent();
    LoadDealStageFormComponent();
    LoadDealTypeFormComponent();
    LoadDealFormComponent();
    LoadIndustryFormComponent();
    LoadInvoiceStatusTypeFormComponent();
    LoadInvoiceFormComponent();
    LoadItemFormComponent();
    LoadItem__client_financeFormComponent();
    LoadOrganizationLinkFormComponent();
    LoadPaymentTermsTypeFormComponent();
    LoadPersonLinkFormComponent();
    LoadProductPriceLevelFormComponent();
    LoadProductFormComponent();
    LoadQuadDemoFormComponent();
    LoadSalesLineItemFormComponent();
    LoadSalesLineItem__client_membershipFormComponent();
    LoadSalesOrderDetailFormComponent();
    LoadSalesOrderFormComponent();
    LoadSalesTransactionFormComponent();
    LoadSalesTransaction__client_membershipFormComponent();
    LoadStringMapFormComponent();
    LoadThreadDetailFormComponent();
    LoadThreadFormComponent();
    LoadUoMFormComponent();
    LoadAccountDetailsComponent();
    LoadAccount__client_crmDetailsComponent();
    LoadActivityDetailsComponent();
    LoadActivityAttachmentDetailsComponent();
    Loadclient_membershipDetailsComponent();
    LoadContactLevelDetailsComponent();
    LoadContactRoleDetailsComponent();
    LoadContactDetailsComponent();
    LoadContact__client_crmDetailsComponent();
    LoadContentSourceTypeDetailsComponent();
    LoadContentSourceDetailsComponent();
    LoadCustomerAddressDetailsComponent();
    LoadCustomerAddress__client_financeDetailsComponent();
    LoadCustomerDetailsComponent();
    LoadCustomer__client_financeDetailsComponent();
    LoadDealForecastCategoryDetailsComponent();
    LoadDealStageDetailsComponent();
    LoadDealTypeDetailsComponent();
    LoadDealDetailsComponent();
    LoadIndustryDetailsComponent();
    LoadInvoiceStatusTypeDetailsComponent();
    LoadInvoiceDetailsComponent();
    LoadItemDetailsComponent();
    LoadItem__client_financeDetailsComponent();
    LoadOrganizationLinkDetailsComponent();
    LoadPaymentTermsTypeDetailsComponent();
    LoadPersonLinkDetailsComponent();
    LoadProductPriceLevelDetailsComponent();
    LoadProductDetailsComponent();
    LoadQuadDemoDetailsComponent();
    LoadSalesLineItemDetailsComponent();
    LoadSalesLineItem__client_membershipDetailsComponent();
    LoadSalesOrderDetailDetailsComponent();
    LoadSalesOrderDetailsComponent();
    LoadSalesTransactionDetailsComponent();
    LoadSalesTransaction__client_membershipDetailsComponent();
    LoadStringMapDetailsComponent();
    LoadThreadDetailDetailsComponent();
    LoadThreadDetailsComponent();
    LoadUoMDetailsComponent();
}
    