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
import { hubspotaccount_infoFormComponent } from "./Entities/hubspotaccount_info/hubspotaccount_info.form.component";
import { hubspotad_accountsFormComponent } from "./Entities/hubspotad_accounts/hubspotad_accounts.form.component";
import { hubspotad_campaignsFormComponent } from "./Entities/hubspotad_campaigns/hubspotad_campaigns.form.component";
import { hubspotapi_usageFormComponent } from "./Entities/hubspotapi_usage/hubspotapi_usage.form.component";
import { hubspotappointmentsFormComponent } from "./Entities/hubspotappointments/hubspotappointments.form.component";
import { hubspotassoc_companies_callsFormComponent } from "./Entities/hubspotassoc_companies_calls/hubspotassoc_companies_calls.form.component";
import { hubspotassoc_companies_dealsFormComponent } from "./Entities/hubspotassoc_companies_deals/hubspotassoc_companies_deals.form.component";
import { hubspotassoc_companies_emailsFormComponent } from "./Entities/hubspotassoc_companies_emails/hubspotassoc_companies_emails.form.component";
import { hubspotassoc_companies_meetingsFormComponent } from "./Entities/hubspotassoc_companies_meetings/hubspotassoc_companies_meetings.form.component";
import { hubspotassoc_companies_notesFormComponent } from "./Entities/hubspotassoc_companies_notes/hubspotassoc_companies_notes.form.component";
import { hubspotassoc_companies_tasksFormComponent } from "./Entities/hubspotassoc_companies_tasks/hubspotassoc_companies_tasks.form.component";
import { hubspotassoc_companies_ticketsFormComponent } from "./Entities/hubspotassoc_companies_tickets/hubspotassoc_companies_tickets.form.component";
import { hubspotassoc_contacts_callsFormComponent } from "./Entities/hubspotassoc_contacts_calls/hubspotassoc_contacts_calls.form.component";
import { hubspotassoc_contacts_companiesFormComponent } from "./Entities/hubspotassoc_contacts_companies/hubspotassoc_contacts_companies.form.component";
import { hubspotassoc_contacts_dealsFormComponent } from "./Entities/hubspotassoc_contacts_deals/hubspotassoc_contacts_deals.form.component";
import { hubspotassoc_contacts_emailsFormComponent } from "./Entities/hubspotassoc_contacts_emails/hubspotassoc_contacts_emails.form.component";
import { hubspotassoc_contacts_feedback_submissionsFormComponent } from "./Entities/hubspotassoc_contacts_feedback_submissions/hubspotassoc_contacts_feedback_submissions.form.component";
import { hubspotassoc_contacts_meetingsFormComponent } from "./Entities/hubspotassoc_contacts_meetings/hubspotassoc_contacts_meetings.form.component";
import { hubspotassoc_contacts_notesFormComponent } from "./Entities/hubspotassoc_contacts_notes/hubspotassoc_contacts_notes.form.component";
import { hubspotassoc_contacts_tasksFormComponent } from "./Entities/hubspotassoc_contacts_tasks/hubspotassoc_contacts_tasks.form.component";
import { hubspotassoc_contacts_ticketsFormComponent } from "./Entities/hubspotassoc_contacts_tickets/hubspotassoc_contacts_tickets.form.component";
import { hubspotassoc_deals_callsFormComponent } from "./Entities/hubspotassoc_deals_calls/hubspotassoc_deals_calls.form.component";
import { hubspotassoc_deals_emailsFormComponent } from "./Entities/hubspotassoc_deals_emails/hubspotassoc_deals_emails.form.component";
import { hubspotassoc_deals_line_itemsFormComponent } from "./Entities/hubspotassoc_deals_line_items/hubspotassoc_deals_line_items.form.component";
import { hubspotassoc_deals_meetingsFormComponent } from "./Entities/hubspotassoc_deals_meetings/hubspotassoc_deals_meetings.form.component";
import { hubspotassoc_deals_notesFormComponent } from "./Entities/hubspotassoc_deals_notes/hubspotassoc_deals_notes.form.component";
import { hubspotassoc_deals_quotesFormComponent } from "./Entities/hubspotassoc_deals_quotes/hubspotassoc_deals_quotes.form.component";
import { hubspotassoc_deals_tasksFormComponent } from "./Entities/hubspotassoc_deals_tasks/hubspotassoc_deals_tasks.form.component";
import { hubspotassoc_quotes_contactsFormComponent } from "./Entities/hubspotassoc_quotes_contacts/hubspotassoc_quotes_contacts.form.component";
import { hubspotassoc_quotes_line_itemsFormComponent } from "./Entities/hubspotassoc_quotes_line_items/hubspotassoc_quotes_line_items.form.component";
import { hubspotassoc_tickets_callsFormComponent } from "./Entities/hubspotassoc_tickets_calls/hubspotassoc_tickets_calls.form.component";
import { hubspotassoc_tickets_emailsFormComponent } from "./Entities/hubspotassoc_tickets_emails/hubspotassoc_tickets_emails.form.component";
import { hubspotassoc_tickets_feedback_submissionsFormComponent } from "./Entities/hubspotassoc_tickets_feedback_submissions/hubspotassoc_tickets_feedback_submissions.form.component";
import { hubspotassoc_tickets_meetingsFormComponent } from "./Entities/hubspotassoc_tickets_meetings/hubspotassoc_tickets_meetings.form.component";
import { hubspotassoc_tickets_notesFormComponent } from "./Entities/hubspotassoc_tickets_notes/hubspotassoc_tickets_notes.form.component";
import { hubspotassoc_tickets_tasksFormComponent } from "./Entities/hubspotassoc_tickets_tasks/hubspotassoc_tickets_tasks.form.component";
import { hubspotaudit_logsFormComponent } from "./Entities/hubspotaudit_logs/hubspotaudit_logs.form.component";
import { hubspotbehavioral_eventsFormComponent } from "./Entities/hubspotbehavioral_events/hubspotbehavioral_events.form.component";
import { hubspotblog_authorsFormComponent } from "./Entities/hubspotblog_authors/hubspotblog_authors.form.component";
import { hubspotblog_postsFormComponent } from "./Entities/hubspotblog_posts/hubspotblog_posts.form.component";
import { hubspotblog_settingsFormComponent } from "./Entities/hubspotblog_settings/hubspotblog_settings.form.component";
import { hubspotblog_tagsFormComponent } from "./Entities/hubspotblog_tags/hubspotblog_tags.form.component";
import { hubspotbusiness_unitsFormComponent } from "./Entities/hubspotbusiness_units/hubspotbusiness_units.form.component";
import { hubspotcallsFormComponent } from "./Entities/hubspotcalls/hubspotcalls.form.component";
import { hubspotcampaignsFormComponent } from "./Entities/hubspotcampaigns/hubspotcampaigns.form.component";
import { hubspotcartsFormComponent } from "./Entities/hubspotcarts/hubspotcarts.form.component";
import { hubspotcommerce_paymentsFormComponent } from "./Entities/hubspotcommerce_payments/hubspotcommerce_payments.form.component";
import { hubspotcommunicationsFormComponent } from "./Entities/hubspotcommunications/hubspotcommunications.form.component";
import { hubspotcompaniesFormComponent } from "./Entities/hubspotcompanies/hubspotcompanies.form.component";
import { hubspotcontactsFormComponent } from "./Entities/hubspotcontacts/hubspotcontacts.form.component";
import { hubspotcontractsFormComponent } from "./Entities/hubspotcontracts/hubspotcontracts.form.component";
import { hubspotconversation_channelsFormComponent } from "./Entities/hubspotconversation_channels/hubspotconversation_channels.form.component";
import { hubspotconversation_custom_channelsFormComponent } from "./Entities/hubspotconversation_custom_channels/hubspotconversation_custom_channels.form.component";
import { hubspotconversation_inbox_channelsFormComponent } from "./Entities/hubspotconversation_inbox_channels/hubspotconversation_inbox_channels.form.component";
import { hubspotconversation_inboxesFormComponent } from "./Entities/hubspotconversation_inboxes/hubspotconversation_inboxes.form.component";
import { hubspotconversation_messagesFormComponent } from "./Entities/hubspotconversation_messages/hubspotconversation_messages.form.component";
import { hubspotconversation_threadsFormComponent } from "./Entities/hubspotconversation_threads/hubspotconversation_threads.form.component";
import { hubspotcoursesFormComponent } from "./Entities/hubspotcourses/hubspotcourses.form.component";
import { hubspotcrm_exportsFormComponent } from "./Entities/hubspotcrm_exports/hubspotcrm_exports.form.component";
import { hubspotcrm_importsFormComponent } from "./Entities/hubspotcrm_imports/hubspotcrm_imports.form.component";
import { hubspotcurrenciesFormComponent } from "./Entities/hubspotcurrencies/hubspotcurrencies.form.component";
import { hubspotcustom_coded_actionsFormComponent } from "./Entities/hubspotcustom_coded_actions/hubspotcustom_coded_actions.form.component";
import { hubspotdatasource_ingestionFormComponent } from "./Entities/hubspotdatasource_ingestion/hubspotdatasource_ingestion.form.component";
import { hubspotdeal_pipeline_stagesFormComponent } from "./Entities/hubspotdeal_pipeline_stages/hubspotdeal_pipeline_stages.form.component";
import { hubspotdeal_pipelinesFormComponent } from "./Entities/hubspotdeal_pipelines/hubspotdeal_pipelines.form.component";
import { hubspotdeal_splitsFormComponent } from "./Entities/hubspotdeal_splits/hubspotdeal_splits.form.component";
import { hubspotdealsFormComponent } from "./Entities/hubspotdeals/hubspotdeals.form.component";
import { hubspotdiscountsFormComponent } from "./Entities/hubspotdiscounts/hubspotdiscounts.form.component";
import { hubspotdomainsFormComponent } from "./Entities/hubspotdomains/hubspotdomains.form.component";
import { hubspotemail_campaigns_legacyFormComponent } from "./Entities/hubspotemail_campaigns_legacy/hubspotemail_campaigns_legacy.form.component";
import { hubspotemailsFormComponent } from "./Entities/hubspotemails/hubspotemails.form.component";
import { hubspotevent_completionsFormComponent } from "./Entities/hubspotevent_completions/hubspotevent_completions.form.component";
import { hubspotevent_definitionsFormComponent } from "./Entities/hubspotevent_definitions/hubspotevent_definitions.form.component";
import { hubspotfeedback_submissionsFormComponent } from "./Entities/hubspotfeedback_submissions/hubspotfeedback_submissions.form.component";
import { hubspotfeesFormComponent } from "./Entities/hubspotfees/hubspotfees.form.component";
import { hubspotfile_foldersFormComponent } from "./Entities/hubspotfile_folders/hubspotfile_folders.form.component";
import { hubspotfilesFormComponent } from "./Entities/hubspotfiles/hubspotfiles.form.component";
import { hubspotforecastsFormComponent } from "./Entities/hubspotforecasts/hubspotforecasts.form.component";
import { hubspotform_submissionsFormComponent } from "./Entities/hubspotform_submissions/hubspotform_submissions.form.component";
import { hubspotformsFormComponent } from "./Entities/hubspotforms/hubspotforms.form.component";
import { hubspotgoal_targetsFormComponent } from "./Entities/hubspotgoal_targets/hubspotgoal_targets.form.component";
import { hubspotgoalsFormComponent } from "./Entities/hubspotgoals/hubspotgoals.form.component";
import { hubspothubdb_rowsFormComponent } from "./Entities/hubspothubdb_rows/hubspothubdb_rows.form.component";
import { hubspothubdb_tablesFormComponent } from "./Entities/hubspothubdb_tables/hubspothubdb_tables.form.component";
import { hubspotinvoicesFormComponent } from "./Entities/hubspotinvoices/hubspotinvoices.form.component";
import { hubspotlanding_pagesFormComponent } from "./Entities/hubspotlanding_pages/hubspotlanding_pages.form.component";
import { hubspotleadsFormComponent } from "./Entities/hubspotleads/hubspotleads.form.component";
import { hubspotline_itemsFormComponent } from "./Entities/hubspotline_items/hubspotline_items.form.component";
import { hubspotlist_foldersFormComponent } from "./Entities/hubspotlist_folders/hubspotlist_folders.form.component";
import { hubspotlist_membershipsFormComponent } from "./Entities/hubspotlist_memberships/hubspotlist_memberships.form.component";
import { hubspotlistingsFormComponent } from "./Entities/hubspotlistings/hubspotlistings.form.component";
import { hubspotlistsFormComponent } from "./Entities/hubspotlists/hubspotlists.form.component";
import { hubspotmarketing_emailsFormComponent } from "./Entities/hubspotmarketing_emails/hubspotmarketing_emails.form.component";
import { hubspotmarketing_eventsFormComponent } from "./Entities/hubspotmarketing_events/hubspotmarketing_events.form.component";
import { hubspotmedia_bridgeFormComponent } from "./Entities/hubspotmedia_bridge/hubspotmedia_bridge.form.component";
import { hubspotmeeting_schedulerFormComponent } from "./Entities/hubspotmeeting_scheduler/hubspotmeeting_scheduler.form.component";
import { hubspotmeetingsFormComponent } from "./Entities/hubspotmeetings/hubspotmeetings.form.component";
import { hubspotnotesFormComponent } from "./Entities/hubspotnotes/hubspotnotes.form.component";
import { hubspotordersFormComponent } from "./Entities/hubspotorders/hubspotorders.form.component";
import { hubspotownersFormComponent } from "./Entities/hubspotowners/hubspotowners.form.component";
import { hubspotportal_usersFormComponent } from "./Entities/hubspotportal_users/hubspotportal_users.form.component";
import { hubspotpostal_mailFormComponent } from "./Entities/hubspotpostal_mail/hubspotpostal_mail.form.component";
import { hubspotproductsFormComponent } from "./Entities/hubspotproducts/hubspotproducts.form.component";
import { hubspotprojectsFormComponent } from "./Entities/hubspotprojects/hubspotprojects.form.component";
import { hubspotquotesFormComponent } from "./Entities/hubspotquotes/hubspotquotes.form.component";
import { hubspotscim_groupsFormComponent } from "./Entities/hubspotscim_groups/hubspotscim_groups.form.component";
import { hubspotscim_usersFormComponent } from "./Entities/hubspotscim_users/hubspotscim_users.form.component";
import { hubspotsequencesFormComponent } from "./Entities/hubspotsequences/hubspotsequences.form.component";
import { hubspotservicesFormComponent } from "./Entities/hubspotservices/hubspotservices.form.component";
import { hubspotsingle_send_v4FormComponent } from "./Entities/hubspotsingle_send_v4/hubspotsingle_send_v4.form.component";
import { hubspotsite_pagesFormComponent } from "./Entities/hubspotsite_pages/hubspotsite_pages.form.component";
import { hubspotsite_searchFormComponent } from "./Entities/hubspotsite_search/hubspotsite_search.form.component";
import { hubspotsource_codeFormComponent } from "./Entities/hubspotsource_code/hubspotsource_code.form.component";
import { hubspotsubscription_definitionsFormComponent } from "./Entities/hubspotsubscription_definitions/hubspotsubscription_definitions.form.component";
import { hubspotsubscriptionsFormComponent } from "./Entities/hubspotsubscriptions/hubspotsubscriptions.form.component";
import { hubspottasksFormComponent } from "./Entities/hubspottasks/hubspottasks.form.component";
import { hubspottax_ratesFormComponent } from "./Entities/hubspottax_rates/hubspottax_rates.form.component";
import { hubspottaxesFormComponent } from "./Entities/hubspottaxes/hubspottaxes.form.component";
import { hubspotticket_pipeline_stagesFormComponent } from "./Entities/hubspotticket_pipeline_stages/hubspotticket_pipeline_stages.form.component";
import { hubspotticket_pipelinesFormComponent } from "./Entities/hubspotticket_pipelines/hubspotticket_pipelines.form.component";
import { hubspotticketsFormComponent } from "./Entities/hubspottickets/hubspottickets.form.component";
import { hubspottimeline_event_templatesFormComponent } from "./Entities/hubspottimeline_event_templates/hubspottimeline_event_templates.form.component";
import { hubspottransactional_smtp_tokensFormComponent } from "./Entities/hubspottransactional_smtp_tokens/hubspottransactional_smtp_tokens.form.component";
import { hubspottranscriptionsFormComponent } from "./Entities/hubspottranscriptions/hubspottranscriptions.form.component";
import { hubspoturl_mappingsFormComponent } from "./Entities/hubspoturl_mappings/hubspoturl_mappings.form.component";
import { hubspoturl_redirectsFormComponent } from "./Entities/hubspoturl_redirects/hubspoturl_redirects.form.component";
import { hubspotuser_rolesFormComponent } from "./Entities/hubspotuser_roles/hubspotuser_roles.form.component";
import { hubspotusersFormComponent } from "./Entities/hubspotusers/hubspotusers.form.component";
import { hubspotvisitor_identificationFormComponent } from "./Entities/hubspotvisitor_identification/hubspotvisitor_identification.form.component";
import { hubspotworkflowsFormComponent } from "./Entities/hubspotworkflows/hubspotworkflows.form.component";
   

@NgModule({
declarations: [
    hubspotaccount_infoFormComponent,
    hubspotad_accountsFormComponent,
    hubspotad_campaignsFormComponent,
    hubspotapi_usageFormComponent,
    hubspotappointmentsFormComponent,
    hubspotassoc_companies_callsFormComponent,
    hubspotassoc_companies_dealsFormComponent,
    hubspotassoc_companies_emailsFormComponent,
    hubspotassoc_companies_meetingsFormComponent,
    hubspotassoc_companies_notesFormComponent,
    hubspotassoc_companies_tasksFormComponent,
    hubspotassoc_companies_ticketsFormComponent,
    hubspotassoc_contacts_callsFormComponent,
    hubspotassoc_contacts_companiesFormComponent,
    hubspotassoc_contacts_dealsFormComponent,
    hubspotassoc_contacts_emailsFormComponent,
    hubspotassoc_contacts_feedback_submissionsFormComponent,
    hubspotassoc_contacts_meetingsFormComponent,
    hubspotassoc_contacts_notesFormComponent,
    hubspotassoc_contacts_tasksFormComponent],
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
    hubspotassoc_contacts_ticketsFormComponent,
    hubspotassoc_deals_callsFormComponent,
    hubspotassoc_deals_emailsFormComponent,
    hubspotassoc_deals_line_itemsFormComponent,
    hubspotassoc_deals_meetingsFormComponent,
    hubspotassoc_deals_notesFormComponent,
    hubspotassoc_deals_quotesFormComponent,
    hubspotassoc_deals_tasksFormComponent,
    hubspotassoc_quotes_contactsFormComponent,
    hubspotassoc_quotes_line_itemsFormComponent,
    hubspotassoc_tickets_callsFormComponent,
    hubspotassoc_tickets_emailsFormComponent,
    hubspotassoc_tickets_feedback_submissionsFormComponent,
    hubspotassoc_tickets_meetingsFormComponent,
    hubspotassoc_tickets_notesFormComponent,
    hubspotassoc_tickets_tasksFormComponent,
    hubspotaudit_logsFormComponent,
    hubspotbehavioral_eventsFormComponent,
    hubspotblog_authorsFormComponent,
    hubspotblog_postsFormComponent],
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
    hubspotblog_settingsFormComponent,
    hubspotblog_tagsFormComponent,
    hubspotbusiness_unitsFormComponent,
    hubspotcallsFormComponent,
    hubspotcampaignsFormComponent,
    hubspotcartsFormComponent,
    hubspotcommerce_paymentsFormComponent,
    hubspotcommunicationsFormComponent,
    hubspotcompaniesFormComponent,
    hubspotcontactsFormComponent,
    hubspotcontractsFormComponent,
    hubspotconversation_channelsFormComponent,
    hubspotconversation_custom_channelsFormComponent,
    hubspotconversation_inbox_channelsFormComponent,
    hubspotconversation_inboxesFormComponent,
    hubspotconversation_messagesFormComponent,
    hubspotconversation_threadsFormComponent,
    hubspotcoursesFormComponent,
    hubspotcrm_exportsFormComponent,
    hubspotcrm_importsFormComponent],
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
    hubspotcurrenciesFormComponent,
    hubspotcustom_coded_actionsFormComponent,
    hubspotdatasource_ingestionFormComponent,
    hubspotdeal_pipeline_stagesFormComponent,
    hubspotdeal_pipelinesFormComponent,
    hubspotdeal_splitsFormComponent,
    hubspotdealsFormComponent,
    hubspotdiscountsFormComponent,
    hubspotdomainsFormComponent,
    hubspotemail_campaigns_legacyFormComponent,
    hubspotemailsFormComponent,
    hubspotevent_completionsFormComponent,
    hubspotevent_definitionsFormComponent,
    hubspotfeedback_submissionsFormComponent,
    hubspotfeesFormComponent,
    hubspotfile_foldersFormComponent,
    hubspotfilesFormComponent,
    hubspotforecastsFormComponent,
    hubspotform_submissionsFormComponent,
    hubspotformsFormComponent],
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
export class GeneratedForms_SubModule_3 { }
    


@NgModule({
declarations: [
    hubspotgoal_targetsFormComponent,
    hubspotgoalsFormComponent,
    hubspothubdb_rowsFormComponent,
    hubspothubdb_tablesFormComponent,
    hubspotinvoicesFormComponent,
    hubspotlanding_pagesFormComponent,
    hubspotleadsFormComponent,
    hubspotline_itemsFormComponent,
    hubspotlist_foldersFormComponent,
    hubspotlist_membershipsFormComponent,
    hubspotlistingsFormComponent,
    hubspotlistsFormComponent,
    hubspotmarketing_emailsFormComponent,
    hubspotmarketing_eventsFormComponent,
    hubspotmedia_bridgeFormComponent,
    hubspotmeeting_schedulerFormComponent,
    hubspotmeetingsFormComponent,
    hubspotnotesFormComponent,
    hubspotordersFormComponent,
    hubspotownersFormComponent],
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
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
    hubspotportal_usersFormComponent,
    hubspotpostal_mailFormComponent,
    hubspotproductsFormComponent,
    hubspotprojectsFormComponent,
    hubspotquotesFormComponent,
    hubspotscim_groupsFormComponent,
    hubspotscim_usersFormComponent,
    hubspotsequencesFormComponent,
    hubspotservicesFormComponent,
    hubspotsingle_send_v4FormComponent,
    hubspotsite_pagesFormComponent,
    hubspotsite_searchFormComponent,
    hubspotsource_codeFormComponent,
    hubspotsubscription_definitionsFormComponent,
    hubspotsubscriptionsFormComponent,
    hubspottasksFormComponent,
    hubspottax_ratesFormComponent,
    hubspottaxesFormComponent,
    hubspotticket_pipeline_stagesFormComponent,
    hubspotticket_pipelinesFormComponent],
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
export class GeneratedForms_SubModule_5 { }
    


@NgModule({
declarations: [
    hubspotticketsFormComponent,
    hubspottimeline_event_templatesFormComponent,
    hubspottransactional_smtp_tokensFormComponent,
    hubspottranscriptionsFormComponent,
    hubspoturl_mappingsFormComponent,
    hubspoturl_redirectsFormComponent,
    hubspotuser_rolesFormComponent,
    hubspotusersFormComponent,
    hubspotvisitor_identificationFormComponent,
    hubspotworkflowsFormComponent],
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
export class GeneratedForms_SubModule_6 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2,
    GeneratedForms_SubModule_3,
    GeneratedForms_SubModule_4,
    GeneratedForms_SubModule_5,
    GeneratedForms_SubModule_6
]
})
export class GeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    