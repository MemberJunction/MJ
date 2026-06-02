-- RSU Migration: Integration: HubSpot — hubspot.account_info, hubspot.ad_accounts, hubspot.ad_campaigns, hubspot.api_usage, hubspot.appointments, hubspot.assoc_companies_calls, hubspot.assoc_companies_deals, hubspot.assoc_companies_emails, hubspot.assoc_companies_meetings, hubspot.assoc_companies_notes, hubspot.assoc_companies_tasks, hubspot.assoc_companies_tickets, hubspot.assoc_contacts_calls, hubspot.assoc_contacts_companies, hubspot.assoc_contacts_deals, hubspot.assoc_contacts_emails, hubspot.assoc_contacts_feedback_submissions, hubspot.assoc_contacts_meetings, hubspot.assoc_contacts_notes, hubspot.assoc_contacts_tasks, hubspot.assoc_contacts_tickets, hubspot.assoc_deals_calls, hubspot.assoc_deals_emails, hubspot.assoc_deals_line_items, hubspot.assoc_deals_meetings, hubspot.assoc_deals_notes, hubspot.assoc_deals_quotes, hubspot.assoc_deals_tasks, hubspot.assoc_quotes_contacts, hubspot.assoc_quotes_line_items, hubspot.assoc_tickets_calls, hubspot.assoc_tickets_emails, hubspot.assoc_tickets_feedback_submissions, hubspot.assoc_tickets_meetings, hubspot.assoc_tickets_notes, hubspot.assoc_tickets_tasks, hubspot.audit_logs, hubspot.behavioral_events, hubspot.blog_authors, hubspot.blog_posts, hubspot.blog_settings, hubspot.blog_tags, hubspot.business_units, hubspot.calls, hubspot.campaigns, hubspot.carts, hubspot.commerce_payments, hubspot.communications, hubspot.companies, hubspot.contacts, hubspot.contracts, hubspot.conversation_channels, hubspot.conversation_custom_channels, hubspot.conversation_inbox_channels, hubspot.conversation_inboxes, hubspot.conversation_messages, hubspot.conversation_threads, hubspot.courses, hubspot.crm_exports, hubspot.crm_imports, hubspot.currencies, hubspot.custom_coded_actions, hubspot.datasource_ingestion, hubspot.deal_pipeline_stages, hubspot.deal_pipelines, hubspot.deal_splits, hubspot.deals, hubspot.discounts, hubspot.domains, hubspot.email_campaigns_legacy, hubspot.emails, hubspot.event_completions, hubspot.event_definitions, hubspot.feedback_submissions, hubspot.fees, hubspot.file_folders, hubspot.files, hubspot.forecasts, hubspot.form_submissions, hubspot.forms, hubspot.goal_targets, hubspot.goals, hubspot.hubdb_rows, hubspot.hubdb_tables, hubspot.invoices, hubspot.landing_pages, hubspot.leads, hubspot.line_items, hubspot.list_folders, hubspot.list_memberships, hubspot.listings, hubspot.lists, hubspot.marketing_emails, hubspot.marketing_events, hubspot.media_bridge, hubspot.meeting_scheduler, hubspot.meetings, hubspot.notes, hubspot.orders, hubspot.owners, hubspot.portal_users, hubspot.postal_mail, hubspot.products, hubspot.projects, hubspot.quotes, hubspot.scim_groups, hubspot.scim_users, hubspot.sequences, hubspot.services, hubspot.single_send_v4, hubspot.site_pages, hubspot.site_search, hubspot.source_code, hubspot.subscription_definitions, hubspot.subscriptions, hubspot.tasks, hubspot.tax_rates, hubspot.taxes, hubspot.ticket_pipeline_stages, hubspot.ticket_pipelines, hubspot.tickets, hubspot.timeline_event_templates, hubspot.transactional_smtp_tokens, hubspot.transcriptions, hubspot.url_mappings, hubspot.url_redirects, hubspot.user_roles, hubspot.users, hubspot.visitor_identification, hubspot.workflows
-- Generated: 2026-06-02T17:16:23.411Z
-- Affected tables: hubspot.account_info, hubspot.ad_accounts, hubspot.ad_campaigns, hubspot.api_usage, hubspot.appointments, hubspot.assoc_companies_calls, hubspot.assoc_companies_deals, hubspot.assoc_companies_emails, hubspot.assoc_companies_meetings, hubspot.assoc_companies_notes, hubspot.assoc_companies_tasks, hubspot.assoc_companies_tickets, hubspot.assoc_contacts_calls, hubspot.assoc_contacts_companies, hubspot.assoc_contacts_deals, hubspot.assoc_contacts_emails, hubspot.assoc_contacts_feedback_submissions, hubspot.assoc_contacts_meetings, hubspot.assoc_contacts_notes, hubspot.assoc_contacts_tasks, hubspot.assoc_contacts_tickets, hubspot.assoc_deals_calls, hubspot.assoc_deals_emails, hubspot.assoc_deals_line_items, hubspot.assoc_deals_meetings, hubspot.assoc_deals_notes, hubspot.assoc_deals_quotes, hubspot.assoc_deals_tasks, hubspot.assoc_quotes_contacts, hubspot.assoc_quotes_line_items, hubspot.assoc_tickets_calls, hubspot.assoc_tickets_emails, hubspot.assoc_tickets_feedback_submissions, hubspot.assoc_tickets_meetings, hubspot.assoc_tickets_notes, hubspot.assoc_tickets_tasks, hubspot.audit_logs, hubspot.behavioral_events, hubspot.blog_authors, hubspot.blog_posts, hubspot.blog_settings, hubspot.blog_tags, hubspot.business_units, hubspot.calls, hubspot.campaigns, hubspot.carts, hubspot.commerce_payments, hubspot.communications, hubspot.companies, hubspot.contacts, hubspot.contracts, hubspot.conversation_channels, hubspot.conversation_custom_channels, hubspot.conversation_inbox_channels, hubspot.conversation_inboxes, hubspot.conversation_messages, hubspot.conversation_threads, hubspot.courses, hubspot.crm_exports, hubspot.crm_imports, hubspot.currencies, hubspot.custom_coded_actions, hubspot.datasource_ingestion, hubspot.deal_pipeline_stages, hubspot.deal_pipelines, hubspot.deal_splits, hubspot.deals, hubspot.discounts, hubspot.domains, hubspot.email_campaigns_legacy, hubspot.emails, hubspot.event_completions, hubspot.event_definitions, hubspot.feedback_submissions, hubspot.fees, hubspot.file_folders, hubspot.files, hubspot.forecasts, hubspot.form_submissions, hubspot.forms, hubspot.goal_targets, hubspot.goals, hubspot.hubdb_rows, hubspot.hubdb_tables, hubspot.invoices, hubspot.landing_pages, hubspot.leads, hubspot.line_items, hubspot.list_folders, hubspot.list_memberships, hubspot.listings, hubspot.lists, hubspot.marketing_emails, hubspot.marketing_events, hubspot.media_bridge, hubspot.meeting_scheduler, hubspot.meetings, hubspot.notes, hubspot.orders, hubspot.owners, hubspot.portal_users, hubspot.postal_mail, hubspot.products, hubspot.projects, hubspot.quotes, hubspot.scim_groups, hubspot.scim_users, hubspot.sequences, hubspot.services, hubspot.single_send_v4, hubspot.site_pages, hubspot.site_search, hubspot.source_code, hubspot.subscription_definitions, hubspot.subscriptions, hubspot.tasks, hubspot.tax_rates, hubspot.taxes, hubspot.ticket_pipeline_stages, hubspot.ticket_pipelines, hubspot.tickets, hubspot.timeline_event_templates, hubspot.transactional_smtp_tokens, hubspot.transcriptions, hubspot.url_mappings, hubspot.url_redirects, hubspot.user_roles, hubspot.users, hubspot.visitor_identification, hubspot.workflows
-- ============================================================
-- Auto-generated by MJ SchemaEngine
-- Consumer: HubSpot | Object: account_info, ad_accounts, ad_campaigns, api_usage, appointments, assoc_companies_calls, assoc_companies_deals, assoc_companies_emails, assoc_companies_meetings, assoc_companies_notes, assoc_companies_tasks, assoc_companies_tickets, assoc_contacts_calls, assoc_contacts_companies, assoc_contacts_deals, assoc_contacts_emails, assoc_contacts_feedback_submissions, assoc_contacts_meetings, assoc_contacts_notes, assoc_contacts_tasks, assoc_contacts_tickets, assoc_deals_calls, assoc_deals_emails, assoc_deals_line_items, assoc_deals_meetings, assoc_deals_notes, assoc_deals_quotes, assoc_deals_tasks, assoc_quotes_contacts, assoc_quotes_line_items, assoc_tickets_calls, assoc_tickets_emails, assoc_tickets_feedback_submissions, assoc_tickets_meetings, assoc_tickets_notes, assoc_tickets_tasks, audit_logs, behavioral_events, blog_authors, blog_posts, blog_settings, blog_tags, business_units, calls, campaigns, carts, commerce_payments, communications, companies, contacts, contracts, conversation_channels, conversation_custom_channels, conversation_inbox_channels, conversation_inboxes, conversation_messages, conversation_threads, courses, crm_exports, crm_imports, currencies, custom_coded_actions, datasource_ingestion, deal_pipeline_stages, deal_pipelines, deal_splits, deals, discounts, domains, email_campaigns_legacy, emails, event_completions, event_definitions, feedback_submissions, fees, file_folders, files, forecasts, form_submissions, forms, goal_targets, goals, hubdb_rows, hubdb_tables, invoices, landing_pages, leads, line_items, list_folders, list_memberships, listings, lists, marketing_emails, marketing_events, media_bridge, meeting_scheduler, meetings, notes, orders, owners, portal_users, postal_mail, products, projects, quotes, scim_groups, scim_users, sequences, services, single_send_v4, site_pages, site_search, source_code, subscription_definitions, subscriptions, tasks, tax_rates, taxes, ticket_pipeline_stages, ticket_pipelines, tickets, timeline_event_templates, transactional_smtp_tokens, transcriptions, url_mappings, url_redirects, user_roles, users, visitor_identification, workflows
-- Action: AlterTables
-- Generated: 2026-06-02T17:16:23.400Z
-- Generated By: MJ Integration Schema Builder (via SchemaEngine)
-- ============================================================
-- NOTE: __mj_CreatedAt, __mj_UpdatedAt, FK indexes, views, and SPs
--       are created by CodeGen — do NOT add them here.
-- NOTE: Soft foreign keys are defined in additionalSchemaInfo,
--       applied by CodeGen — no FK constraints needed in this migration.
-- ============================================================
-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Latitude] no longer exists in source. Consider removing after grace period.

-- DEPRECATED: Column [__mj_Longitude] no longer exists in source. Consider removing after grace period.

