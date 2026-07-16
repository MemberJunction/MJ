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

// Import Generated Components
import { constantcontactaccount_emailsFormComponent } from "./Entities/constantcontactaccount_emails/constantcontactaccount_emails.form.component";
import { constantcontactaccount_physical_addressFormComponent } from "./Entities/constantcontactaccount_physical_address/constantcontactaccount_physical_address.form.component";
import { constantcontactaccount_summaryFormComponent } from "./Entities/constantcontactaccount_summary/constantcontactaccount_summary.form.component";
import { constantcontactaccount_user_privilegesFormComponent } from "./Entities/constantcontactaccount_user_privileges/constantcontactaccount_user_privileges.form.component";
import { constantcontactactivitiesFormComponent } from "./Entities/constantcontactactivities/constantcontactactivities.form.component";
import { constantcontactactivities_contacts_deleteFormComponent } from "./Entities/constantcontactactivities_contacts_delete/constantcontactactivities_contacts_delete.form.component";
import { constantcontactactivities_contacts_file_importFormComponent } from "./Entities/constantcontactactivities_contacts_file_import/constantcontactactivities_contacts_file_import.form.component";
import { constantcontactactivities_contacts_json_importFormComponent } from "./Entities/constantcontactactivities_contacts_json_import/constantcontactactivities_contacts_json_import.form.component";
import { constantcontactactivities_contacts_taggings_addFormComponent } from "./Entities/constantcontactactivities_contacts_taggings_add/constantcontactactivities_contacts_taggings_add.form.component";
import { constantcontactactivities_contacts_taggings_removeFormComponent } from "./Entities/constantcontactactivities_contacts_taggings_remove/constantcontactactivities_contacts_taggings_remove.form.component";
import { constantcontactactivities_contacts_tags_deleteFormComponent } from "./Entities/constantcontactactivities_contacts_tags_delete/constantcontactactivities_contacts_tags_delete.form.component";
import { constantcontactactivities_custom_fields_deleteFormComponent } from "./Entities/constantcontactactivities_custom_fields_delete/constantcontactactivities_custom_fields_delete.form.component";
import { constantcontactactivities_list_deleteFormComponent } from "./Entities/constantcontactactivities_list_delete/constantcontactactivities_list_delete.form.component";
import { constantcontactactivities_list_memberships_addFormComponent } from "./Entities/constantcontactactivities_list_memberships_add/constantcontactactivities_list_memberships_add.form.component";
import { constantcontactactivities_list_memberships_removeFormComponent } from "./Entities/constantcontactactivities_list_memberships_remove/constantcontactactivities_list_memberships_remove.form.component";
import { constantcontactcontact_custom_fieldsFormComponent } from "./Entities/constantcontactcontact_custom_fields/constantcontactcontact_custom_fields.form.component";
import { constantcontactcontact_listsFormComponent } from "./Entities/constantcontactcontact_lists/constantcontactcontact_lists.form.component";
import { constantcontactcontact_lists_xrefsFormComponent } from "./Entities/constantcontactcontact_lists_xrefs/constantcontactcontact_lists_xrefs.form.component";
import { constantcontactcontact_reports_activity_summaryFormComponent } from "./Entities/constantcontactcontact_reports_activity_summary/constantcontactcontact_reports_activity_summary.form.component";
import { constantcontactcontact_reports_open_and_click_ratesFormComponent } from "./Entities/constantcontactcontact_reports_open_and_click_rates/constantcontactcontact_reports_open_and_click_rates.form.component";
import { constantcontactcontact_tagsFormComponent } from "./Entities/constantcontactcontact_tags/constantcontactcontact_tags.form.component";
import { constantcontactcontactsFormComponent } from "./Entities/constantcontactcontacts/constantcontactcontacts.form.component";
import { constantcontactcontacts_countsFormComponent } from "./Entities/constantcontactcontacts_counts/constantcontactcontacts_counts.form.component";
import { constantcontactcontacts_sign_up_formFormComponent } from "./Entities/constantcontactcontacts_sign_up_form/constantcontactcontacts_sign_up_form.form.component";
import { constantcontactcontacts_xrefsFormComponent } from "./Entities/constantcontactcontacts_xrefs/constantcontactcontacts_xrefs.form.component";
import { constantcontactemail_campaign_activitiesFormComponent } from "./Entities/constantcontactemail_campaign_activities/constantcontactemail_campaign_activities.form.component";
import { constantcontactemail_campaign_activity_non_opener_resendsFormComponent } from "./Entities/constantcontactemail_campaign_activity_non_opener_resends/constantcontactemail_campaign_activity_non_opener_resends.form.component";
import { constantcontactemail_campaign_activity_previewsFormComponent } from "./Entities/constantcontactemail_campaign_activity_previews/constantcontactemail_campaign_activity_previews.form.component";
import { constantcontactemail_campaign_activity_send_historyFormComponent } from "./Entities/constantcontactemail_campaign_activity_send_history/constantcontactemail_campaign_activity_send_history.form.component";
import { constantcontactemail_reports_linksFormComponent } from "./Entities/constantcontactemail_reports_links/constantcontactemail_reports_links.form.component";
import { constantcontactemail_reports_summaryFormComponent } from "./Entities/constantcontactemail_reports_summary/constantcontactemail_reports_summary.form.component";
import { constantcontactemailsFormComponent } from "./Entities/constantcontactemails/constantcontactemails.form.component";
import { constantcontactemails_xrefsFormComponent } from "./Entities/constantcontactemails_xrefs/constantcontactemails_xrefs.form.component";
import { constantcontacteventsFormComponent } from "./Entities/constantcontactevents/constantcontactevents.form.component";
import { constantcontactevents_copyFormComponent } from "./Entities/constantcontactevents_copy/constantcontactevents_copy.form.component";
import { constantcontactevents_registrationsFormComponent } from "./Entities/constantcontactevents_registrations/constantcontactevents_registrations.form.component";
import { constantcontactsegmentsFormComponent } from "./Entities/constantcontactsegments/constantcontactsegments.form.component";
import { constantcontactsocial_connectionsFormComponent } from "./Entities/constantcontactsocial_connections/constantcontactsocial_connections.form.component";
import { constantcontactsocial_hashtag_groupsFormComponent } from "./Entities/constantcontactsocial_hashtag_groups/constantcontactsocial_hashtag_groups.form.component";
import { constantcontactsocial_postsFormComponent } from "./Entities/constantcontactsocial_posts/constantcontactsocial_posts.form.component";
import { constantcontactsocial_profilesFormComponent } from "./Entities/constantcontactsocial_profiles/constantcontactsocial_profiles.form.component";
   

@NgModule({
declarations: [
    constantcontactaccount_emailsFormComponent,
    constantcontactaccount_physical_addressFormComponent,
    constantcontactaccount_summaryFormComponent,
    constantcontactaccount_user_privilegesFormComponent,
    constantcontactactivitiesFormComponent,
    constantcontactactivities_contacts_deleteFormComponent,
    constantcontactactivities_contacts_file_importFormComponent,
    constantcontactactivities_contacts_json_importFormComponent,
    constantcontactactivities_contacts_taggings_addFormComponent,
    constantcontactactivities_contacts_taggings_removeFormComponent,
    constantcontactactivities_contacts_tags_deleteFormComponent,
    constantcontactactivities_custom_fields_deleteFormComponent,
    constantcontactactivities_list_deleteFormComponent,
    constantcontactactivities_list_memberships_addFormComponent,
    constantcontactactivities_list_memberships_removeFormComponent,
    constantcontactcontact_custom_fieldsFormComponent,
    constantcontactcontact_listsFormComponent,
    constantcontactcontact_lists_xrefsFormComponent,
    constantcontactcontact_reports_activity_summaryFormComponent,
    constantcontactcontact_reports_open_and_click_ratesFormComponent],
imports: [
    CommonModule,
    FormsModule,
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
    constantcontactcontact_tagsFormComponent,
    constantcontactcontactsFormComponent,
    constantcontactcontacts_countsFormComponent,
    constantcontactcontacts_sign_up_formFormComponent,
    constantcontactcontacts_xrefsFormComponent,
    constantcontactemail_campaign_activitiesFormComponent,
    constantcontactemail_campaign_activity_non_opener_resendsFormComponent,
    constantcontactemail_campaign_activity_previewsFormComponent,
    constantcontactemail_campaign_activity_send_historyFormComponent,
    constantcontactemail_reports_linksFormComponent,
    constantcontactemail_reports_summaryFormComponent,
    constantcontactemailsFormComponent,
    constantcontactemails_xrefsFormComponent,
    constantcontacteventsFormComponent,
    constantcontactevents_copyFormComponent,
    constantcontactevents_registrationsFormComponent,
    constantcontactsegmentsFormComponent,
    constantcontactsocial_connectionsFormComponent,
    constantcontactsocial_hashtag_groupsFormComponent,
    constantcontactsocial_postsFormComponent],
imports: [
    CommonModule,
    FormsModule,
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
    constantcontactsocial_profilesFormComponent],
imports: [
    CommonModule,
    FormsModule,
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
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2
]
})
export class GeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    