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
import { ActivityFormComponent, LoadActivityFormComponent } from "./Entities/Activity/activity.form.component";
import { Activity__DemoFormComponent, LoadActivity__DemoFormComponent } from "./Entities/Activity__Demo/activity__demo.form.component";
import { ActivitySentimentFormComponent, LoadActivitySentimentFormComponent } from "./Entities/ActivitySentiment/activitysentiment.form.component";
import { ActivityTagLinkFormComponent, LoadActivityTagLinkFormComponent } from "./Entities/ActivityTagLink/activitytaglink.form.component";
import { ActivityTagFormComponent, LoadActivityTagFormComponent } from "./Entities/ActivityTag/activitytag.form.component";
import { ActivityTag__DemoFormComponent, LoadActivityTag__DemoFormComponent } from "./Entities/ActivityTag__Demo/activitytag__demo.form.component";
import { ActivityTopicFormComponent, LoadActivityTopicFormComponent } from "./Entities/ActivityTopic/activitytopic.form.component";
import { ActivityTypeFormComponent, LoadActivityTypeFormComponent } from "./Entities/ActivityType/activitytype.form.component";
import { ActivityType__DemoFormComponent, LoadActivityType__DemoFormComponent } from "./Entities/ActivityType__Demo/activitytype__demo.form.component";
import { ContactInsightFormComponent, LoadContactInsightFormComponent } from "./Entities/ContactInsight/contactinsight.form.component";
import { ContactTagLinkFormComponent, LoadContactTagLinkFormComponent } from "./Entities/ContactTagLink/contacttaglink.form.component";
import { ContactTagFormComponent, LoadContactTagFormComponent } from "./Entities/ContactTag/contacttag.form.component";
import { ContactFormComponent, LoadContactFormComponent } from "./Entities/Contact/contact.form.component";
import { Contact__CRMFormComponent, LoadContact__CRMFormComponent } from "./Entities/Contact__CRM/contact__crm.form.component";
import { Contact__DemoFormComponent, LoadContact__DemoFormComponent } from "./Entities/Contact__Demo/contact__demo.form.component";
import { TopicFormComponent, LoadTopicFormComponent } from "./Entities/Topic/topic.form.component";
   

@NgModule({
declarations: [
    ActivityFormComponent,
    Activity__DemoFormComponent,
    ActivitySentimentFormComponent,
    ActivityTagLinkFormComponent,
    ActivityTagFormComponent,
    ActivityTag__DemoFormComponent,
    ActivityTopicFormComponent,
    ActivityTypeFormComponent,
    ActivityType__DemoFormComponent,
    ContactInsightFormComponent,
    ContactTagLinkFormComponent,
    ContactTagFormComponent,
    ContactFormComponent,
    Contact__CRMFormComponent,
    Contact__DemoFormComponent,
    TopicFormComponent],
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
    LoadActivityFormComponent();
    LoadActivity__DemoFormComponent();
    LoadActivitySentimentFormComponent();
    LoadActivityTagLinkFormComponent();
    LoadActivityTagFormComponent();
    LoadActivityTag__DemoFormComponent();
    LoadActivityTopicFormComponent();
    LoadActivityTypeFormComponent();
    LoadActivityType__DemoFormComponent();
    LoadContactInsightFormComponent();
    LoadContactTagLinkFormComponent();
    LoadContactTagFormComponent();
    LoadContactFormComponent();
    LoadContact__CRMFormComponent();
    LoadContact__DemoFormComponent();
    LoadTopicFormComponent();
}
    