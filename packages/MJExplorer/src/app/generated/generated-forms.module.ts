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
import { acct_descFormComponent, Loadacct_descFormComponent } from "./Entities/acct_desc/acct_desc.form.component";
import { AccountFormComponent, LoadAccountFormComponent } from "./Entities/Account/account.form.component";
import { ActivityFormComponent, LoadActivityFormComponent } from "./Entities/Activity/activity.form.component";
import { NU__Affiliation__cFormComponent, LoadNU__Affiliation__cFormComponent } from "./Entities/NU__Affiliation__c/nu__affiliation__c.form.component";
import { NU__CommitteeMembership__cFormComponent, LoadNU__CommitteeMembership__cFormComponent } from "./Entities/NU__CommitteeMembership__c/nu__committeemembership__c.form.component";
import { NU__Committee__cFormComponent, LoadNU__Committee__cFormComponent } from "./Entities/NU__Committee__c/nu__committee__c.form.component";
import { ContactFormComponent, LoadContactFormComponent } from "./Entities/Contact/contact.form.component";
import { ConversationDetail_250606FormComponent, LoadConversationDetail_250606FormComponent } from "./Entities/ConversationDetail_250606/conversationdetail_250606.form.component";
import { ConversationDetailContentFormComponent, LoadConversationDetailContentFormComponent } from "./Entities/ConversationDetailContent/conversationdetailcontent.form.component";
import { ConversationDetail__bettyFormComponent, LoadConversationDetail__bettyFormComponent } from "./Entities/ConversationDetail__betty/conversationdetail__betty.form.component";
import { Conversation__bettyFormComponent, LoadConversation__bettyFormComponent } from "./Entities/Conversation__betty/conversation__betty.form.component";
import { core_data_codesFormComponent, Loadcore_data_codesFormComponent } from "./Entities/core_data_codes/core_data_codes.form.component";
import { Core_DataFormComponent, LoadCore_DataFormComponent } from "./Entities/Core_Data/core_data.form.component";
import { co_dist_descFormComponent, Loadco_dist_descFormComponent } from "./Entities/co_dist_desc/co_dist_desc.form.component";
import { crsassgnFormComponent, LoadcrsassgnFormComponent } from "./Entities/crsassgn/crsassgn.form.component";
import { educatorFormComponent, LoadeducatorFormComponent } from "./Entities/educator/educator.form.component";
import { Table_5FormComponent, LoadTable_5FormComponent } from "./Entities/Table_5/table_5.form.component";
import { NU__Event__cFormComponent, LoadNU__Event__cFormComponent } from "./Entities/NU__Event__c/nu__event__c.form.component";
import { NU__Membership__cFormComponent, LoadNU__Membership__cFormComponent } from "./Entities/NU__Membership__c/nu__membership__c.form.component";
import { NU__OrderItemLine__cFormComponent, LoadNU__OrderItemLine__cFormComponent } from "./Entities/NU__OrderItemLine__c/nu__orderitemline__c.form.component";
import { NU__OrderItem__cFormComponent, LoadNU__OrderItem__cFormComponent } from "./Entities/NU__OrderItem__c/nu__orderitem__c.form.component";
import { NU__Order__cFormComponent, LoadNU__Order__cFormComponent } from "./Entities/NU__Order__c/nu__order__c.form.component";
import { OrganizationFormComponent, LoadOrganizationFormComponent } from "./Entities/Organization/organization.form.component";
import { NU__PaymentLine__cFormComponent, LoadNU__PaymentLine__cFormComponent } from "./Entities/NU__PaymentLine__c/nu__paymentline__c.form.component";
import { NU__Payment__cFormComponent, LoadNU__Payment__cFormComponent } from "./Entities/NU__Payment__c/nu__payment__c.form.component";
import { PersonFormComponent, LoadPersonFormComponent } from "./Entities/Person/person.form.component";
import { NU__Product__cFormComponent, LoadNU__Product__cFormComponent } from "./Entities/NU__Product__c/nu__product__c.form.component";
import { RegionsFormComponent, LoadRegionsFormComponent } from "./Entities/Regions/regions.form.component";
import { NU__Registration2__cFormComponent, LoadNU__Registration2__cFormComponent } from "./Entities/NU__Registration2__c/nu__registration2__c.form.component";
import { Salary_Ranking_TableFormComponent, LoadSalary_Ranking_TableFormComponent } from "./Entities/Salary_Ranking_Table/salary_ranking_table.form.component";
import { edschoolFormComponent, LoadedschoolFormComponent } from "./Entities/edschool/edschool.form.component";
import { UserJoinerFormComponent, LoadUserJoinerFormComponent } from "./Entities/UserJoiner/userjoiner.form.component";
import { acct_descDetailsComponent, Loadacct_descDetailsComponent } from "./Entities/acct_desc/sections/details.component"
import { AccountDetailsComponent, LoadAccountDetailsComponent } from "./Entities/Account/sections/details.component"
import { AccountTopComponent, LoadAccountTopComponent } from "./Entities/Account/sections/top.component"
import { ActivityDetailsComponent, LoadActivityDetailsComponent } from "./Entities/Activity/sections/details.component"
import { NU__Affiliation__cDetailsComponent, LoadNU__Affiliation__cDetailsComponent } from "./Entities/NU__Affiliation__c/sections/details.component"
import { NU__Affiliation__cTopComponent, LoadNU__Affiliation__cTopComponent } from "./Entities/NU__Affiliation__c/sections/top.component"
import { NU__CommitteeMembership__cDetailsComponent, LoadNU__CommitteeMembership__cDetailsComponent } from "./Entities/NU__CommitteeMembership__c/sections/details.component"
import { NU__CommitteeMembership__cTopComponent, LoadNU__CommitteeMembership__cTopComponent } from "./Entities/NU__CommitteeMembership__c/sections/top.component"
import { NU__Committee__cDetailsComponent, LoadNU__Committee__cDetailsComponent } from "./Entities/NU__Committee__c/sections/details.component"
import { NU__Committee__cTopComponent, LoadNU__Committee__cTopComponent } from "./Entities/NU__Committee__c/sections/top.component"
import { ContactDetailsComponent, LoadContactDetailsComponent } from "./Entities/Contact/sections/details.component"
import { ContactTopComponent, LoadContactTopComponent } from "./Entities/Contact/sections/top.component"
import { ConversationDetail_250606DetailsComponent, LoadConversationDetail_250606DetailsComponent } from "./Entities/ConversationDetail_250606/sections/details.component"
import { ConversationDetailContentDetailsComponent, LoadConversationDetailContentDetailsComponent } from "./Entities/ConversationDetailContent/sections/details.component"
import { ConversationDetail__bettyDetailsComponent, LoadConversationDetail__bettyDetailsComponent } from "./Entities/ConversationDetail__betty/sections/details.component"
import { Conversation__bettyDetailsComponent, LoadConversation__bettyDetailsComponent } from "./Entities/Conversation__betty/sections/details.component"
import { core_data_codesDetailsComponent, Loadcore_data_codesDetailsComponent } from "./Entities/core_data_codes/sections/details.component"
import { Core_DataDetailsComponent, LoadCore_DataDetailsComponent } from "./Entities/Core_Data/sections/details.component"
import { Core_DataTopComponent, LoadCore_DataTopComponent } from "./Entities/Core_Data/sections/top.component"
import { co_dist_descDetailsComponent, Loadco_dist_descDetailsComponent } from "./Entities/co_dist_desc/sections/details.component"
import { co_dist_descTopComponent, Loadco_dist_descTopComponent } from "./Entities/co_dist_desc/sections/top.component"
import { crsassgnTopComponent, LoadcrsassgnTopComponent } from "./Entities/crsassgn/sections/top.component"
import { crsassgnDetailsComponent, LoadcrsassgnDetailsComponent } from "./Entities/crsassgn/sections/details.component"
import { educatorDetailsComponent, LoadeducatorDetailsComponent } from "./Entities/educator/sections/details.component"
import { educatorTopComponent, LoadeducatorTopComponent } from "./Entities/educator/sections/top.component"
import { Table_5TopComponent, LoadTable_5TopComponent } from "./Entities/Table_5/sections/top.component"
import { Table_5DetailsComponent, LoadTable_5DetailsComponent } from "./Entities/Table_5/sections/details.component"
import { NU__Event__cDetailsComponent, LoadNU__Event__cDetailsComponent } from "./Entities/NU__Event__c/sections/details.component"
import { NU__Event__cTopComponent, LoadNU__Event__cTopComponent } from "./Entities/NU__Event__c/sections/top.component"
import { NU__Membership__cDetailsComponent, LoadNU__Membership__cDetailsComponent } from "./Entities/NU__Membership__c/sections/details.component"
import { NU__Membership__cTopComponent, LoadNU__Membership__cTopComponent } from "./Entities/NU__Membership__c/sections/top.component"
import { NU__OrderItemLine__cDetailsComponent, LoadNU__OrderItemLine__cDetailsComponent } from "./Entities/NU__OrderItemLine__c/sections/details.component"
import { NU__OrderItemLine__cTopComponent, LoadNU__OrderItemLine__cTopComponent } from "./Entities/NU__OrderItemLine__c/sections/top.component"
import { NU__OrderItem__cDetailsComponent, LoadNU__OrderItem__cDetailsComponent } from "./Entities/NU__OrderItem__c/sections/details.component"
import { NU__OrderItem__cTopComponent, LoadNU__OrderItem__cTopComponent } from "./Entities/NU__OrderItem__c/sections/top.component"
import { NU__Order__cDetailsComponent, LoadNU__Order__cDetailsComponent } from "./Entities/NU__Order__c/sections/details.component"
import { NU__Order__cTopComponent, LoadNU__Order__cTopComponent } from "./Entities/NU__Order__c/sections/top.component"
import { OrganizationOtherComponent, LoadOrganizationOtherComponent } from "./Entities/Organization/sections/other.component"
import { OrganizationDetailsComponent, LoadOrganizationDetailsComponent } from "./Entities/Organization/sections/details.component"
import { OrganizationTopComponent, LoadOrganizationTopComponent } from "./Entities/Organization/sections/top.component"
import { NU__PaymentLine__cDetailsComponent, LoadNU__PaymentLine__cDetailsComponent } from "./Entities/NU__PaymentLine__c/sections/details.component"
import { NU__PaymentLine__cTopComponent, LoadNU__PaymentLine__cTopComponent } from "./Entities/NU__PaymentLine__c/sections/top.component"
import { NU__Payment__cDetailsComponent, LoadNU__Payment__cDetailsComponent } from "./Entities/NU__Payment__c/sections/details.component"
import { NU__Payment__cTopComponent, LoadNU__Payment__cTopComponent } from "./Entities/NU__Payment__c/sections/top.component"
import { PersonOtherComponent, LoadPersonOtherComponent } from "./Entities/Person/sections/other.component"
import { PersonTopComponent, LoadPersonTopComponent } from "./Entities/Person/sections/top.component"
import { PersonDetailsComponent, LoadPersonDetailsComponent } from "./Entities/Person/sections/details.component"
import { NU__Product__cDetailsComponent, LoadNU__Product__cDetailsComponent } from "./Entities/NU__Product__c/sections/details.component"
import { NU__Product__cTopComponent, LoadNU__Product__cTopComponent } from "./Entities/NU__Product__c/sections/top.component"
import { RegionsDetailsComponent, LoadRegionsDetailsComponent } from "./Entities/Regions/sections/details.component"
import { NU__Registration2__cDetailsComponent, LoadNU__Registration2__cDetailsComponent } from "./Entities/NU__Registration2__c/sections/details.component"
import { NU__Registration2__cTopComponent, LoadNU__Registration2__cTopComponent } from "./Entities/NU__Registration2__c/sections/top.component"
import { Salary_Ranking_TableTopComponent, LoadSalary_Ranking_TableTopComponent } from "./Entities/Salary_Ranking_Table/sections/top.component"
import { Salary_Ranking_TableDetailsComponent, LoadSalary_Ranking_TableDetailsComponent } from "./Entities/Salary_Ranking_Table/sections/details.component"
import { edschoolDetailsComponent, LoadedschoolDetailsComponent } from "./Entities/edschool/sections/details.component"
import { edschoolTopComponent, LoadedschoolTopComponent } from "./Entities/edschool/sections/top.component"
import { UserJoinerDetailsComponent, LoadUserJoinerDetailsComponent } from "./Entities/UserJoiner/sections/details.component"
   

@NgModule({
declarations: [
    acct_descFormComponent,
    AccountFormComponent,
    ActivityFormComponent,
    NU__Affiliation__cFormComponent,
    NU__CommitteeMembership__cFormComponent,
    NU__Committee__cFormComponent,
    ContactFormComponent,
    ConversationDetail_250606FormComponent,
    ConversationDetailContentFormComponent,
    ConversationDetail__bettyFormComponent,
    Conversation__bettyFormComponent,
    core_data_codesFormComponent,
    Core_DataFormComponent,
    co_dist_descFormComponent,
    crsassgnFormComponent,
    educatorFormComponent,
    Table_5FormComponent,
    NU__Event__cFormComponent,
    NU__Membership__cFormComponent,
    NU__OrderItemLine__cFormComponent],
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
    NU__OrderItem__cFormComponent,
    NU__Order__cFormComponent,
    OrganizationFormComponent,
    NU__PaymentLine__cFormComponent,
    NU__Payment__cFormComponent,
    PersonFormComponent,
    NU__Product__cFormComponent,
    RegionsFormComponent,
    NU__Registration2__cFormComponent,
    Salary_Ranking_TableFormComponent,
    edschoolFormComponent,
    UserJoinerFormComponent,
    acct_descDetailsComponent,
    AccountDetailsComponent,
    AccountTopComponent,
    ActivityDetailsComponent,
    NU__Affiliation__cDetailsComponent,
    NU__Affiliation__cTopComponent,
    NU__CommitteeMembership__cDetailsComponent,
    NU__CommitteeMembership__cTopComponent],
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
    NU__Committee__cDetailsComponent,
    NU__Committee__cTopComponent,
    ContactDetailsComponent,
    ContactTopComponent,
    ConversationDetail_250606DetailsComponent,
    ConversationDetailContentDetailsComponent,
    ConversationDetail__bettyDetailsComponent,
    Conversation__bettyDetailsComponent,
    core_data_codesDetailsComponent,
    Core_DataDetailsComponent,
    Core_DataTopComponent,
    co_dist_descDetailsComponent,
    co_dist_descTopComponent,
    crsassgnTopComponent,
    crsassgnDetailsComponent,
    educatorDetailsComponent,
    educatorTopComponent,
    Table_5TopComponent,
    Table_5DetailsComponent,
    NU__Event__cDetailsComponent],
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
    NU__Event__cTopComponent,
    NU__Membership__cDetailsComponent,
    NU__Membership__cTopComponent,
    NU__OrderItemLine__cDetailsComponent,
    NU__OrderItemLine__cTopComponent,
    NU__OrderItem__cDetailsComponent,
    NU__OrderItem__cTopComponent,
    NU__Order__cDetailsComponent,
    NU__Order__cTopComponent,
    OrganizationOtherComponent,
    OrganizationDetailsComponent,
    OrganizationTopComponent,
    NU__PaymentLine__cDetailsComponent,
    NU__PaymentLine__cTopComponent,
    NU__Payment__cDetailsComponent,
    NU__Payment__cTopComponent,
    PersonOtherComponent,
    PersonTopComponent,
    PersonDetailsComponent,
    NU__Product__cDetailsComponent],
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
    NU__Product__cTopComponent,
    RegionsDetailsComponent,
    NU__Registration2__cDetailsComponent,
    NU__Registration2__cTopComponent,
    Salary_Ranking_TableTopComponent,
    Salary_Ranking_TableDetailsComponent,
    edschoolDetailsComponent,
    edschoolTopComponent,
    UserJoinerDetailsComponent],
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
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2,
    GeneratedForms_SubModule_3,
    GeneratedForms_SubModule_4
]
})
export class GeneratedFormsModule { }
    
export function LoadGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of 
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    Loadacct_descFormComponent();
    LoadAccountFormComponent();
    LoadActivityFormComponent();
    LoadNU__Affiliation__cFormComponent();
    LoadNU__CommitteeMembership__cFormComponent();
    LoadNU__Committee__cFormComponent();
    LoadContactFormComponent();
    LoadConversationDetail_250606FormComponent();
    LoadConversationDetailContentFormComponent();
    LoadConversationDetail__bettyFormComponent();
    LoadConversation__bettyFormComponent();
    Loadcore_data_codesFormComponent();
    LoadCore_DataFormComponent();
    Loadco_dist_descFormComponent();
    LoadcrsassgnFormComponent();
    LoadeducatorFormComponent();
    LoadTable_5FormComponent();
    LoadNU__Event__cFormComponent();
    LoadNU__Membership__cFormComponent();
    LoadNU__OrderItemLine__cFormComponent();
    LoadNU__OrderItem__cFormComponent();
    LoadNU__Order__cFormComponent();
    LoadOrganizationFormComponent();
    LoadNU__PaymentLine__cFormComponent();
    LoadNU__Payment__cFormComponent();
    LoadPersonFormComponent();
    LoadNU__Product__cFormComponent();
    LoadRegionsFormComponent();
    LoadNU__Registration2__cFormComponent();
    LoadSalary_Ranking_TableFormComponent();
    LoadedschoolFormComponent();
    LoadUserJoinerFormComponent();
    Loadacct_descDetailsComponent();
    LoadAccountDetailsComponent();
    LoadAccountTopComponent();
    LoadActivityDetailsComponent();
    LoadNU__Affiliation__cDetailsComponent();
    LoadNU__Affiliation__cTopComponent();
    LoadNU__CommitteeMembership__cDetailsComponent();
    LoadNU__CommitteeMembership__cTopComponent();
    LoadNU__Committee__cDetailsComponent();
    LoadNU__Committee__cTopComponent();
    LoadContactDetailsComponent();
    LoadContactTopComponent();
    LoadConversationDetail_250606DetailsComponent();
    LoadConversationDetailContentDetailsComponent();
    LoadConversationDetail__bettyDetailsComponent();
    LoadConversation__bettyDetailsComponent();
    Loadcore_data_codesDetailsComponent();
    LoadCore_DataDetailsComponent();
    LoadCore_DataTopComponent();
    Loadco_dist_descDetailsComponent();
    Loadco_dist_descTopComponent();
    LoadcrsassgnTopComponent();
    LoadcrsassgnDetailsComponent();
    LoadeducatorDetailsComponent();
    LoadeducatorTopComponent();
    LoadTable_5TopComponent();
    LoadTable_5DetailsComponent();
    LoadNU__Event__cDetailsComponent();
    LoadNU__Event__cTopComponent();
    LoadNU__Membership__cDetailsComponent();
    LoadNU__Membership__cTopComponent();
    LoadNU__OrderItemLine__cDetailsComponent();
    LoadNU__OrderItemLine__cTopComponent();
    LoadNU__OrderItem__cDetailsComponent();
    LoadNU__OrderItem__cTopComponent();
    LoadNU__Order__cDetailsComponent();
    LoadNU__Order__cTopComponent();
    LoadOrganizationOtherComponent();
    LoadOrganizationDetailsComponent();
    LoadOrganizationTopComponent();
    LoadNU__PaymentLine__cDetailsComponent();
    LoadNU__PaymentLine__cTopComponent();
    LoadNU__Payment__cDetailsComponent();
    LoadNU__Payment__cTopComponent();
    LoadPersonOtherComponent();
    LoadPersonTopComponent();
    LoadPersonDetailsComponent();
    LoadNU__Product__cDetailsComponent();
    LoadNU__Product__cTopComponent();
    LoadRegionsDetailsComponent();
    LoadNU__Registration2__cDetailsComponent();
    LoadNU__Registration2__cTopComponent();
    LoadSalary_Ranking_TableTopComponent();
    LoadSalary_Ranking_TableDetailsComponent();
    LoadedschoolDetailsComponent();
    LoadedschoolTopComponent();
    LoadUserJoinerDetailsComponent();
}
    