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
import { ChannelMessageTypeFormComponent, LoadChannelMessageTypeFormComponent } from "./Entities/ChannelMessageType/channelmessagetype.form.component";
import { ChannelMessageFormComponent, LoadChannelMessageFormComponent } from "./Entities/ChannelMessage/channelmessage.form.component";
import { ChannelTypeFormComponent, LoadChannelTypeFormComponent } from "./Entities/ChannelType/channeltype.form.component";
import { ChannelFormComponent, LoadChannelFormComponent } from "./Entities/Channel/channel.form.component";
import { MessageTypeModelRoleFormComponent, LoadMessageTypeModelRoleFormComponent } from "./Entities/MessageTypeModelRole/messagetypemodelrole.form.component";
import { MessageTypeModelFormComponent, LoadMessageTypeModelFormComponent } from "./Entities/MessageTypeModel/messagetypemodel.form.component";
import { MessageTypeFormComponent, LoadMessageTypeFormComponent } from "./Entities/MessageType/messagetype.form.component";
import { ChannelMessageTypeDetailsComponent, LoadChannelMessageTypeDetailsComponent } from "./Entities/ChannelMessageType/sections/details.component"
import { ChannelMessageDetailsComponent, LoadChannelMessageDetailsComponent } from "./Entities/ChannelMessage/sections/details.component"
import { ChannelTypeDetailsComponent, LoadChannelTypeDetailsComponent } from "./Entities/ChannelType/sections/details.component"
import { ChannelDetailsComponent, LoadChannelDetailsComponent } from "./Entities/Channel/sections/details.component"
import { MessageTypeModelRoleDetailsComponent, LoadMessageTypeModelRoleDetailsComponent } from "./Entities/MessageTypeModelRole/sections/details.component"
import { MessageTypeModelDetailsComponent, LoadMessageTypeModelDetailsComponent } from "./Entities/MessageTypeModel/sections/details.component"
import { MessageTypeDetailsComponent, LoadMessageTypeDetailsComponent } from "./Entities/MessageType/sections/details.component"
   

@NgModule({
declarations: [
    ChannelMessageTypeFormComponent,
    ChannelMessageFormComponent,
    ChannelTypeFormComponent,
    ChannelFormComponent,
    MessageTypeModelRoleFormComponent,
    MessageTypeModelFormComponent,
    MessageTypeFormComponent,
    ChannelMessageTypeDetailsComponent,
    ChannelMessageDetailsComponent,
    ChannelTypeDetailsComponent,
    ChannelDetailsComponent,
    MessageTypeModelRoleDetailsComponent,
    MessageTypeModelDetailsComponent,
    MessageTypeDetailsComponent],
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
],
imports: [
    GeneratedForms_SubModule_0
]
})
export class GeneratedFormsModule { }
    
export function LoadGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of 
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    LoadChannelMessageTypeFormComponent();
    LoadChannelMessageFormComponent();
    LoadChannelTypeFormComponent();
    LoadChannelFormComponent();
    LoadMessageTypeModelRoleFormComponent();
    LoadMessageTypeModelFormComponent();
    LoadMessageTypeFormComponent();
    LoadChannelMessageTypeDetailsComponent();
    LoadChannelMessageDetailsComponent();
    LoadChannelTypeDetailsComponent();
    LoadChannelDetailsComponent();
    LoadMessageTypeModelRoleDetailsComponent();
    LoadMessageTypeModelDetailsComponent();
    LoadMessageTypeDetailsComponent();
}
    