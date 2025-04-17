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
import { AttendeeFormComponent, LoadAttendeeFormComponent } from "./Entities/Attendee/attendee.form.component";
import { AuthorFormComponent, LoadAuthorFormComponent } from "./Entities/Author/author.form.component";
import { Company__communityFormComponent, LoadCompany__communityFormComponent } from "./Entities/Company__community/company__community.form.component";
import { Company__educationFormComponent, LoadCompany__educationFormComponent } from "./Entities/Company__education/company__education.form.component";
import { Company__membershipFormComponent, LoadCompany__membershipFormComponent } from "./Entities/Company__membership/company__membership.form.component";
import { CourseFormComponent, LoadCourseFormComponent } from "./Entities/Course/course.form.component";
import { EventFormComponent, LoadEventFormComponent } from "./Entities/Event/event.form.component";
import { ForumFormComponent, LoadForumFormComponent } from "./Entities/Forum/forum.form.component";
import { InstructorFormComponent, LoadInstructorFormComponent } from "./Entities/Instructor/instructor.form.component";
import { JobTitleSeedFormComponent, LoadJobTitleSeedFormComponent } from "./Entities/JobTitleSeed/jobtitleseed.form.component";
import { MemberTypeFormComponent, LoadMemberTypeFormComponent } from "./Entities/MemberType/membertype.form.component";
import { MemberFormComponent, LoadMemberFormComponent } from "./Entities/Member/member.form.component";
import { MembershipRenewalFormComponent, LoadMembershipRenewalFormComponent } from "./Entities/MembershipRenewal/membershiprenewal.form.component";
import { NameSeedFormComponent, LoadNameSeedFormComponent } from "./Entities/NameSeed/nameseed.form.component";
import { OrganizationLinkFormComponent, LoadOrganizationLinkFormComponent } from "./Entities/OrganizationLink/organizationlink.form.component";
import { OrganizationFormComponent, LoadOrganizationFormComponent } from "./Entities/Organization/organization.form.component";
import { PersonLinkFormComponent, LoadPersonLinkFormComponent } from "./Entities/PersonLink/personlink.form.component";
import { PostSeedFormComponent, LoadPostSeedFormComponent } from "./Entities/PostSeed/postseed.form.component";
import { PostFormComponent, LoadPostFormComponent } from "./Entities/Post/post.form.component";
import { RegistrationFormComponent, LoadRegistrationFormComponent } from "./Entities/Registration/registration.form.component";
import { Registration__educationFormComponent, LoadRegistration__educationFormComponent } from "./Entities/Registration__education/registration__education.form.component";
import { ReplyFormComponent, LoadReplyFormComponent } from "./Entities/Reply/reply.form.component";
import { ReplySeedFormComponent, LoadReplySeedFormComponent } from "./Entities/ReplySeed/replyseed.form.component";
import { StudentFormComponent, LoadStudentFormComponent } from "./Entities/Student/student.form.component";
import { AttendeeDetailsComponent, LoadAttendeeDetailsComponent } from "./Entities/Attendee/sections/details.component"
import { AuthorDetailsComponent, LoadAuthorDetailsComponent } from "./Entities/Author/sections/details.component"
import { Company__communityDetailsComponent, LoadCompany__communityDetailsComponent } from "./Entities/Company__community/sections/details.component"
import { Company__educationDetailsComponent, LoadCompany__educationDetailsComponent } from "./Entities/Company__education/sections/details.component"
import { Company__membershipDetailsComponent, LoadCompany__membershipDetailsComponent } from "./Entities/Company__membership/sections/details.component"
import { CourseDetailsComponent, LoadCourseDetailsComponent } from "./Entities/Course/sections/details.component"
import { EventDetailsComponent, LoadEventDetailsComponent } from "./Entities/Event/sections/details.component"
import { ForumDetailsComponent, LoadForumDetailsComponent } from "./Entities/Forum/sections/details.component"
import { InstructorDetailsComponent, LoadInstructorDetailsComponent } from "./Entities/Instructor/sections/details.component"
import { JobTitleSeedDetailsComponent, LoadJobTitleSeedDetailsComponent } from "./Entities/JobTitleSeed/sections/details.component"
import { MemberTypeDetailsComponent, LoadMemberTypeDetailsComponent } from "./Entities/MemberType/sections/details.component"
import { MemberDetailsComponent, LoadMemberDetailsComponent } from "./Entities/Member/sections/details.component"
import { MembershipRenewalDetailsComponent, LoadMembershipRenewalDetailsComponent } from "./Entities/MembershipRenewal/sections/details.component"
import { NameSeedDetailsComponent, LoadNameSeedDetailsComponent } from "./Entities/NameSeed/sections/details.component"
import { OrganizationLinkDetailsComponent, LoadOrganizationLinkDetailsComponent } from "./Entities/OrganizationLink/sections/details.component"
import { OrganizationDetailsComponent, LoadOrganizationDetailsComponent } from "./Entities/Organization/sections/details.component"
import { PersonLinkDetailsComponent, LoadPersonLinkDetailsComponent } from "./Entities/PersonLink/sections/details.component"
import { PostSeedDetailsComponent, LoadPostSeedDetailsComponent } from "./Entities/PostSeed/sections/details.component"
import { PostDetailsComponent, LoadPostDetailsComponent } from "./Entities/Post/sections/details.component"
import { RegistrationDetailsComponent, LoadRegistrationDetailsComponent } from "./Entities/Registration/sections/details.component"
import { Registration__educationDetailsComponent, LoadRegistration__educationDetailsComponent } from "./Entities/Registration__education/sections/details.component"
import { ReplyDetailsComponent, LoadReplyDetailsComponent } from "./Entities/Reply/sections/details.component"
import { ReplySeedDetailsComponent, LoadReplySeedDetailsComponent } from "./Entities/ReplySeed/sections/details.component"
import { StudentDetailsComponent, LoadStudentDetailsComponent } from "./Entities/Student/sections/details.component"
   

@NgModule({
declarations: [
    AttendeeFormComponent,
    AuthorFormComponent,
    Company__communityFormComponent,
    Company__educationFormComponent,
    Company__membershipFormComponent,
    CourseFormComponent,
    EventFormComponent,
    ForumFormComponent,
    InstructorFormComponent,
    JobTitleSeedFormComponent,
    MemberTypeFormComponent,
    MemberFormComponent,
    MembershipRenewalFormComponent,
    NameSeedFormComponent,
    OrganizationLinkFormComponent,
    OrganizationFormComponent,
    PersonLinkFormComponent,
    PostSeedFormComponent,
    PostFormComponent,
    RegistrationFormComponent],
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
    Registration__educationFormComponent,
    ReplyFormComponent,
    ReplySeedFormComponent,
    StudentFormComponent,
    AttendeeDetailsComponent,
    AuthorDetailsComponent,
    Company__communityDetailsComponent,
    Company__educationDetailsComponent,
    Company__membershipDetailsComponent,
    CourseDetailsComponent,
    EventDetailsComponent,
    ForumDetailsComponent,
    InstructorDetailsComponent,
    JobTitleSeedDetailsComponent,
    MemberTypeDetailsComponent,
    MemberDetailsComponent,
    MembershipRenewalDetailsComponent,
    NameSeedDetailsComponent,
    OrganizationLinkDetailsComponent,
    OrganizationDetailsComponent],
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
    PersonLinkDetailsComponent,
    PostSeedDetailsComponent,
    PostDetailsComponent,
    RegistrationDetailsComponent,
    Registration__educationDetailsComponent,
    ReplyDetailsComponent,
    ReplySeedDetailsComponent,
    StudentDetailsComponent],
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
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2
]
})
export class GeneratedFormsModule { }
    
export function LoadGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of 
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    LoadAttendeeFormComponent();
    LoadAuthorFormComponent();
    LoadCompany__communityFormComponent();
    LoadCompany__educationFormComponent();
    LoadCompany__membershipFormComponent();
    LoadCourseFormComponent();
    LoadEventFormComponent();
    LoadForumFormComponent();
    LoadInstructorFormComponent();
    LoadJobTitleSeedFormComponent();
    LoadMemberTypeFormComponent();
    LoadMemberFormComponent();
    LoadMembershipRenewalFormComponent();
    LoadNameSeedFormComponent();
    LoadOrganizationLinkFormComponent();
    LoadOrganizationFormComponent();
    LoadPersonLinkFormComponent();
    LoadPostSeedFormComponent();
    LoadPostFormComponent();
    LoadRegistrationFormComponent();
    LoadRegistration__educationFormComponent();
    LoadReplyFormComponent();
    LoadReplySeedFormComponent();
    LoadStudentFormComponent();
    LoadAttendeeDetailsComponent();
    LoadAuthorDetailsComponent();
    LoadCompany__communityDetailsComponent();
    LoadCompany__educationDetailsComponent();
    LoadCompany__membershipDetailsComponent();
    LoadCourseDetailsComponent();
    LoadEventDetailsComponent();
    LoadForumDetailsComponent();
    LoadInstructorDetailsComponent();
    LoadJobTitleSeedDetailsComponent();
    LoadMemberTypeDetailsComponent();
    LoadMemberDetailsComponent();
    LoadMembershipRenewalDetailsComponent();
    LoadNameSeedDetailsComponent();
    LoadOrganizationLinkDetailsComponent();
    LoadOrganizationDetailsComponent();
    LoadPersonLinkDetailsComponent();
    LoadPostSeedDetailsComponent();
    LoadPostDetailsComponent();
    LoadRegistrationDetailsComponent();
    LoadRegistration__educationDetailsComponent();
    LoadReplyDetailsComponent();
    LoadReplySeedDetailsComponent();
    LoadStudentDetailsComponent();
}
    