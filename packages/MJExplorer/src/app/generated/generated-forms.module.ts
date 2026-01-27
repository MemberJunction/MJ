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
import { APIKeyScopeFormComponent, LoadAPIKeyScopeFormComponent } from "./Entities/APIKeyScope/apikeyscope.form.component";
import { APIKeyFormComponent, LoadAPIKeyFormComponent } from "./Entities/APIKey/apikey.form.component";
import { ChannelActionFormComponent, LoadChannelActionFormComponent } from "./Entities/ChannelAction/channelaction.form.component";
import { ChannelMessageAttachmentFormComponent, LoadChannelMessageAttachmentFormComponent } from "./Entities/ChannelMessageAttachment/channelmessageattachment.form.component";
import { ChannelMessageFormComponent, LoadChannelMessageFormComponent } from "./Entities/ChannelMessage/channelmessage.form.component";
import { ChannelRunFormComponent, LoadChannelRunFormComponent } from "./Entities/ChannelRun/channelrun.form.component";
import { ChannelTypeActionFormComponent, LoadChannelTypeActionFormComponent } from "./Entities/ChannelTypeAction/channeltypeaction.form.component";
import { ChannelTypeFormComponent, LoadChannelTypeFormComponent } from "./Entities/ChannelType/channeltype.form.component";
import { ChannelFormComponent, LoadChannelFormComponent } from "./Entities/Channel/channel.form.component";
import { ContactRoleFormComponent, LoadContactRoleFormComponent } from "./Entities/ContactRole/contactrole.form.component";
import { ContactFormComponent, LoadContactFormComponent } from "./Entities/Contact/contact.form.component";
import { CredentialTypeFormComponent, LoadCredentialTypeFormComponent } from "./Entities/CredentialType/credentialtype.form.component";
import { CredentialFormComponent, LoadCredentialFormComponent } from "./Entities/Credential/credential.form.component";
import { IzzyActionCategoryFormComponent, LoadIzzyActionCategoryFormComponent } from "./Entities/IzzyActionCategory/izzyactioncategory.form.component";
import { IzzyActionOrganizationFormComponent, LoadIzzyActionOrganizationFormComponent } from "./Entities/IzzyActionOrganization/izzyactionorganization.form.component";
import { IzzyActionFormComponent, LoadIzzyActionFormComponent } from "./Entities/IzzyAction/izzyaction.form.component";
import { IzzyAIConfigurationFormComponent, LoadIzzyAIConfigurationFormComponent } from "./Entities/IzzyAIConfiguration/izzyaiconfiguration.form.component";
import { OrganizationActionFormComponent, LoadOrganizationActionFormComponent } from "./Entities/OrganizationAction/organizationaction.form.component";
import { OrganizationContactFormComponent, LoadOrganizationContactFormComponent } from "./Entities/OrganizationContact/organizationcontact.form.component";
import { OrganizationSettingFormComponent, LoadOrganizationSettingFormComponent } from "./Entities/OrganizationSetting/organizationsetting.form.component";
import { OrganizationFormComponent, LoadOrganizationFormComponent } from "./Entities/Organization/organization.form.component";
import { PlanFormComponent, LoadPlanFormComponent } from "./Entities/Plan/plan.form.component";
import { ScopeFormComponent, LoadScopeFormComponent } from "./Entities/Scope/scope.form.component";
import { SettingCategoryFormComponent, LoadSettingCategoryFormComponent } from "./Entities/SettingCategory/settingcategory.form.component";
import { SettingFormComponent, LoadSettingFormComponent } from "./Entities/Setting/setting.form.component";
   

@NgModule({
declarations: [
    APIKeyScopeFormComponent,
    APIKeyFormComponent,
    ChannelActionFormComponent,
    ChannelMessageAttachmentFormComponent,
    ChannelMessageFormComponent,
    ChannelRunFormComponent,
    ChannelTypeActionFormComponent,
    ChannelTypeFormComponent,
    ChannelFormComponent,
    ContactRoleFormComponent,
    ContactFormComponent,
    CredentialTypeFormComponent,
    CredentialFormComponent,
    IzzyActionCategoryFormComponent,
    IzzyActionOrganizationFormComponent,
    IzzyActionFormComponent,
    IzzyAIConfigurationFormComponent,
    OrganizationActionFormComponent,
    OrganizationContactFormComponent],
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
    OrganizationSettingFormComponent,
    OrganizationFormComponent,
    PlanFormComponent,
    ScopeFormComponent,
    SettingCategoryFormComponent,
    SettingFormComponent],
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
    LoadAPIKeyScopeFormComponent();
    LoadAPIKeyFormComponent();
    LoadChannelActionFormComponent();
    LoadChannelMessageAttachmentFormComponent();
    LoadChannelMessageFormComponent();
    LoadChannelRunFormComponent();
    LoadChannelTypeActionFormComponent();
    LoadChannelTypeFormComponent();
    LoadChannelFormComponent();
    LoadContactRoleFormComponent();
    LoadContactFormComponent();
    LoadCredentialTypeFormComponent();
    LoadCredentialFormComponent();
    LoadIzzyActionCategoryFormComponent();
    LoadIzzyActionOrganizationFormComponent();
    LoadIzzyActionFormComponent();
    LoadIzzyAIConfigurationFormComponent();
    LoadOrganizationActionFormComponent();
    LoadOrganizationContactFormComponent();
    LoadOrganizationSettingFormComponent();
    LoadOrganizationFormComponent();
    LoadPlanFormComponent();
    LoadScopeFormComponent();
    LoadSettingCategoryFormComponent();
    LoadSettingFormComponent();
}
    