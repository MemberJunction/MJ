#!/usr/bin/env node
// enumerate-taxonomy.mjs — DETERMINISTIC record-type/resource enumerator for Constant Contact V3.
//
// WHY A BESPOKE WALKER (in addition to the shared enumerate-catalog.mjs): Constant Contact's OpenAPI is
// Swagger 2.0 with 252 `definitions` — but most of those are request/response DTO *variants* of the SAME
// underlying resource (e.g. ContactDto/ContactResource/ContactPostRequest/ContactPutRequest/
// ContactCreateOrUpdateInput/ContactCreateOrUpdateResponse/ContactDelete are all "Contact"). Walking
// `definitions` 1:1 (what the shared generic OpenAPI-JSON enumerator does) over-counts DTO shape variants,
// not syncable resources. This script instead walks `paths` (the actual addressable resources / entry
// points a REST connector fetches/writes) grouped by OpenAPI `tag`, which for a REST API IS the record-type
// universe (unlike GraphQL, REST entry points ARE ~1:1 with resources). Both counts are reported; the
// shared enumerator's definitions-count is cross-checked as an independent upper-bound signal.
//
// Run: node enumerate-taxonomy.mjs <path-to-openapi.json>
// Stdout: ONE JSON object — { recordTypes, count, byFamily, outOfScope, crossCheck }

import { readFileSync } from 'node:fs';

const specPath = process.argv[2];
if (!specPath) {
    console.error('usage: node enumerate-taxonomy.mjs <openapi.json>');
    process.exit(1);
}
const doc = JSON.parse(readFileSync(specPath, 'utf8'));
const paths = doc.paths ?? {};

// Tags that are SEPARATE ROUTES per the binding scope decision (partner-gated / SMS-product-gated).
// Confirmed via credential-free docs: "Technology Partner Overview" (developer.constantcontact.com/
// api_guide/partners_overview.html) states partner endpoints require a submitted partner-request form +
// Partner Management Team review ("may take several weeks") — a human-gated program, not self-serve.
const OUT_OF_SCOPE_TAGS = new Set([
    'Technology Partners',           // -> technology_partners (needs-partner-approval)
    'Technology Partners Webhooks',  // -> partner_webhooks (needs-partner-approval)
    'SMS Reporting',                 // -> sms (product/scope-gated)
]);

// Deterministic per-path leaf-name assignment. Built from a table of (tag -> [ {pathSuffix, leaf} ]) so the
// mapping is auditable line-by-line against the OpenAPI `paths` keys (grep-able), not a black box.
// This is NOT a hand-picked "famous objects" list — every GET/POST/PUT/PATCH/DELETE operation in the
// spec's `paths` is walked; the table only supplies the canonical snake_case NAME for each operation's
// underlying resource (several operations on the same resource collapse to one leaf, e.g. GET+PUT+DELETE
// /contact_lists/{list_id} + GET /contact_lists all collapse to "contact_lists").
function outOfScopeLeafFor(path) {
    const p = path;
    if (p === '/reports/summary_reports/sms_campaign_summaries') return 'sms_campaign_summaries';
    if (p === '/partner/accounts') return 'partner_accounts';
    if (p === '/partner/accounts/{encoded_account_id}/plan') return 'partner_accounts_plan';
    if (p === '/partner/accounts/{encoded_account_id}/status/cancel') return 'partner_accounts_status_cancel';
    if (p === '/partner/accounts/{encoded_account_id}/account_operations/sync') return 'partner_accounts_operations_sync';
    if (p === '/partner/accounts/{encoded_account_id}/users/sso') return 'partner_accounts_users_sso';
    if (p === '/partner/accounts/{encoded_account_id}/contacts/unsubscribe') return 'partner_accounts_contacts_unsubscribe';
    if (p === '/partner/webhooks/subscriptions' || p === '/partner/webhooks/subscriptions/{topic_id}') return 'partner_webhook_subscriptions';
    if (p === '/partner/webhooks/subscriptions/{topic_id}/tests') return 'partner_webhook_subscription_tests';
    return null;
}

function leafNameFor(tag, path, verb) {
    const p = path;
    // Account Services
    if (p === '/account/user/privileges') return 'account_user_privileges';
    if (p === '/account/summary') return 'account_summary';
    if (p === '/account/summary/physical_address') return 'account_physical_address';
    if (p === '/account/emails') return 'account_emails';
    // Bulk Activities
    if (p === '/activities' || p === '/activities/{activity_id}') return 'activities';
    if (p === '/activities/contact_exports' || p === '/contact_exports/{file_export_id}') return 'activities_contacts_export';
    if (p === '/activities/contact_delete') return 'activities_contacts_delete';
    if (p === '/activities/contacts_file_import') return 'activities_contacts_file_import';
    if (p === '/activities/contacts_json_import') return 'activities_contacts_json_import';
    if (p === '/activities/remove_list_memberships') return 'activities_list_memberships_remove';
    if (p === '/activities/add_list_memberships') return 'activities_list_memberships_add';
    if (p === '/activities/list_delete') return 'activities_list_delete';
    if (p === '/activities/contacts_taggings_remove') return 'activities_contacts_taggings_remove';
    if (p === '/activities/contacts_taggings_add') return 'activities_contacts_taggings_add';
    if (p === '/activities/contacts_tags_delete') return 'activities_contacts_tags_delete';
    if (p === '/activities/custom_fields_delete') return 'activities_custom_fields_delete';
    // Contacts
    if (p === '/contacts' || p === '/contacts/{contact_id}') return 'contacts';
    if (p === '/contacts/sign_up_form') return 'contacts_sign_up_form';
    if (p === '/contacts/contact_id_xrefs') return 'contacts_xrefs';
    if (p === '/contacts/sms_engagement_history/{contact_id}') return 'contacts_sms_engagement_history';
    if (p === '/contacts/counts') return 'contacts_counts';
    if (p === '/contacts/resubscribe/{contact_id}') return 'contacts_resubscribe';
    // Contacts Custom Fields
    if (p === '/contact_custom_fields' || p === '/contact_custom_fields/{custom_field_id}') return 'contact_custom_fields';
    // Contact Lists
    if (p === '/contact_lists' || p === '/contact_lists/{list_id}') return 'contact_lists';
    if (p === '/contact_lists/list_id_xrefs') return 'contact_lists_xrefs';
    // Contact Tags
    if (p === '/contact_tags' || p === '/contact_tags/{tag_id}') return 'contact_tags';
    // Segments
    if (p === '/segments' || p === '/segments/{segment_id}') return 'segments';
    if (p === '/segments/{segment_id}/name') return 'segments'; // PATCH name -> same resource
    // Email Campaigns
    if (p === '/emails' || p === '/emails/{campaign_id}') return 'emails';
    if (p === '/emails/campaign_id_xrefs') return 'emails_xrefs';
    if (p === '/emails/activities/{campaign_activity_id}') return 'email_campaign_activities';
    if (p === '/emails/activities/{campaign_activity_id}/non_opener_resends' ||
        p === '/emails/activities/{campaign_activity_id}/non_opener_resends/{resend_request_id}')
        return 'email_campaign_activity_non_opener_resends';
    // Email Scheduling
    if (p === '/emails/activities/{campaign_activity_id}/schedules') return 'email_campaign_activity_schedules';
    if (p === '/emails/activities/{campaign_activity_id}/tests') return 'email_campaign_activity_tests';
    if (p === '/emails/activities/{campaign_activity_id}/previews') return 'email_campaign_activity_previews';
    if (p === '/emails/activities/{campaign_activity_id}/send_history') return 'email_campaign_activity_send_history';
    // Email Campaigns AB Tests
    if (p === '/emails/activities/{campaign_activity_id}/abtest') return 'email_campaign_activity_abtest';
    // Contacts Reporting
    if (p === '/reports/contact_reports/{contact_id}/activity_details') return 'contact_reports_activity_details';
    if (p === '/reports/contact_reports/{contact_id}/open_and_click_rates') return 'contact_reports_open_and_click_rates';
    if (p === '/reports/contact_reports/{contact_id}/activity_summary') return 'contact_reports_activity_summary';
    // Email Reporting
    if (p === '/reports/email_reports/{campaign_activity_id}/links') return 'email_reports_links';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/sends') return 'email_reports_tracking_sends';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/opens') return 'email_reports_tracking_opens';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/unique_opens') return 'email_reports_tracking_unique_opens';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/didnotopens') return 'email_reports_tracking_didnotopens';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/clicks') return 'email_reports_tracking_clicks';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/forwards') return 'email_reports_tracking_forwards';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/optouts') return 'email_reports_tracking_optouts';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/bounces') return 'email_reports_tracking_bounces';
    if (p === '/reports/summary_reports/email_campaign_summaries') return 'email_reports_summary';
    if (p === '/reports/stats/email_campaigns/{campaign_ids}') return 'email_reports_stats_campaigns';
    if (p === '/reports/stats/email_campaign_activities/{campaign_activity_ids}') return 'email_reports_stats_campaign_activities';
    // Landing Pages Reporting
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_clicks') return 'landing_pages_unique_contact_clicks';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_opens') return 'landing_pages_unique_contact_opens';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_contact_opens') return 'landing_pages_contact_opens';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_updates') return 'landing_pages_unique_contact_updates';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_adds') return 'landing_pages_unique_contact_adds';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_sms_optins') return 'landing_pages_unique_contact_sms_optins';
    // Events (V3 — NOT legacy V2/EventSpot; discovered additional in-scope family)
    if (p === '/events' || p === '/events/{event_id}' || p === '/events/default') return 'events';
    if (p === '/events/{event_id}/copy') return 'events_copy';
    if (p === '/events/{event_id}/check_in/tickets') return 'events_check_in';
    if (p === '/events/{event_id}/undo_check_in/tickets') return 'events_undo_check_in';
    if (p === '/events/{event_id}/tracks/{track_id}/registrations/{registration_id}' ||
        p === '/events/{event_id}/tracks/{track_id}/registrations')
        return 'events_registrations';
    if (p === '/events/{event_id}/tracks/{track_id}/registrations/payment_status') return 'events_registrations_payment_status';
    // Social (discovered additional in-scope family)
    if (p === '/social/profiles') return 'social_profiles';
    if (p === '/social/connections') return 'social_connections';
    if (p === '/social/hashtags/groups') return 'social_hashtag_groups';
    if (p === '/social/posts') return 'social_posts';
    // Out-of-scope tags (Technology Partners / Technology Partners Webhooks / SMS Reporting) handled by caller
    return null;
}

const byFamily = {}; // family (tag) -> Set(leaf names)
const outOfScope = {}; // tag -> { reason, endpointCount }
const unmapped = [];

for (const [p, methods] of Object.entries(paths)) {
    for (const [verb, op] of Object.entries(methods)) {
        if (!op || typeof op !== 'object' || !Array.isArray(op.tags)) continue;
        for (const tag of op.tags) {
            if (OUT_OF_SCOPE_TAGS.has(tag)) {
                outOfScope[tag] = outOfScope[tag] ?? { endpointCount: 0, examplePaths: [], leafSet: new Set() };
                outOfScope[tag].endpointCount++;
                if (outOfScope[tag].examplePaths.length < 3) outOfScope[tag].examplePaths.push(`${verb.toUpperCase()} ${p}`);
                const oosLeaf = outOfScopeLeafFor(p);
                if (oosLeaf) outOfScope[tag].leafSet.add(oosLeaf);
                continue;
            }
            const leaf = leafNameFor(tag, p, verb);
            if (!leaf) {
                unmapped.push(`${verb.toUpperCase()} ${p} [${tag}]`);
                continue;
            }
            byFamily[tag] = byFamily[tag] ?? new Set();
            byFamily[tag].add(leaf);
        }
    }
}

const recordTypes = [...new Set(Object.values(byFamily).flatMap((s) => [...s]))].sort();
const byFamilyOut = Object.fromEntries(Object.entries(byFamily).map(([k, v]) => [k, [...v].sort()]));
const outOfScopeLeafTotal = Object.values(outOfScope).reduce((sum, o) => sum + o.leafSet.size, 0);
for (const o of Object.values(outOfScope)) { o.leaves = [...o.leafSet].sort(); delete o.leafSet; }

const result = {
    format: 'openapi-paths-by-tag',
    specPath,
    recordTypes,
    count: recordTypes.length,
    byFamily: byFamilyOut,
    outOfScope,
    unmappedOperations: unmapped,
    totalPathsInSpec: Object.keys(paths).length,
    totalTagsInSpec: (doc.tags ?? []).length,
    totalDefinitionsInSpec: Object.keys(doc.definitions ?? {}).length,
    outOfScopeLeafTotal,
    fullUniverseLeafCount: recordTypes.length + outOfScopeLeafTotal,
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
