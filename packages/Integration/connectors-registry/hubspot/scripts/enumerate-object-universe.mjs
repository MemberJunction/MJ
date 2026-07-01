#!/usr/bin/env node
// scripts/enumerate-object-universe.mjs
//
// DETERMINISTIC credential-free enumeration of the FULL HubSpot object universe.
//
// Purpose: scope-sanity baseline. The IOIOF extract MUST cover this universe;
// declared << enumerated is a FLAG, not a pass.
//
// v2 (redo pass): adds the API-group taxonomies that a CRM-object-only reading of the
// catalog misses entirely — SCIM, Automation/Workflows, Account/Settings, Marketing
// (forms/single-send/ads/blog-settings/media-bridge), Conversations (inboxes/channels),
// Transactional Email, Data ingestion, plus 3 additional association pairs. Every added
// object below is backed by a verified reachable endpoint (curl status probe: 401/403 =
// real + auth-gated) or an existing downloaded OpenAPI spec file in sources/specs/ — see
// PROVENANCE.json / CODE_EVIDENCE.json for the per-object citation. REDO_REQUIRED_OBJECTS
// floor (27 objects) is asserted at the bottom of this script and fails loudly if any
// of them is missing from the final enumerated set.
//
// Sources (all credential-free, Tier-1/2):
//   1. Live OpenAPI catalog  sources/api-catalog-new.json  (https://api.hubspot.com/public/api/spec/v1/specs)
//      -> independent API-surface count cross-check (102 APIs, CRM 59, CMS 13, ...)
//   2. 64+ downloaded per-API OpenAPI spec files in sources/specs/ (see SOURCES.json)
//   3. Prose docs + curl status-probe evidence for API surfaces with NO OpenAPI spec
//      (SCIM /scim/v2, legacy Workflows /automation/v3/workflows, legacy Form
//      Submissions /form-integrations/v1/submissions, legacy Timeline Event Types
//      /integrations/v1/{appId}/timeline/event-types) — each cited in PROVENANCE.json.
//
// This script DERIVES the object set from the documented taxonomy structure (loops over
// documented standard objects + association from/to pairs + per-taxonomy sub-entities).
// No object name is invented; every name is read from the taxonomy leaves the auditor proved
// from the specs (or from a verified reachable endpoint when no spec exists). The script's
// stdout IS the enumeration evidence.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = join(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Live catalog cross-check (independent signal)
// ---------------------------------------------------------------------------
function loadCatalogSignal() {
  const p = join(CONNECTOR_DIR, 'sources', 'api-catalog-new.json');
  if (!existsSync(p)) {
    return { available: false, totalAPIs: null, byGroup: {} };
  }
  const cat = JSON.parse(readFileSync(p, 'utf8'));
  const results = cat.results || [];
  const byGroup = {};
  for (const a of results) byGroup[a.group] = (byGroup[a.group] || 0) + 1;
  return { available: true, totalAPIs: results.length, byGroup };
}

// ---------------------------------------------------------------------------
// 2. COVERABLE object universe — derived from SOURCE_STUDY TaxonomyLeaves.
//    Each block mirrors a COVERABLE taxonomy section with its documented members.
//    NOTHING here is invented: every name traces to a spec-proven or curl-verified endpoint.
// ---------------------------------------------------------------------------

// 1. CRM Standard Objects (33) — /crm/objects/2026-03/{objectType}
const CRM_STANDARD_OBJECTS = [
  'contacts', 'companies', 'deals', 'tickets', 'products', 'line_items', 'quotes',
  'calls', 'emails', 'meetings', 'notes', 'tasks', 'postal_mail', 'communications',
  'orders', 'carts', 'invoices', 'commerce_payments', 'subscriptions', 'discounts',
  'fees', 'taxes', 'leads', 'appointments', 'services', 'courses', 'listings',
  'contracts', 'goal_targets', 'feedback_submissions', 'projects', 'users', 'deal_splits',
];

// 2. CRM Associations — each from->to pair is a distinct syncable set.
//    Derived as `assoc:<from>-<to>` from the taxonomy's enumerated pair list.
//    Base 60 pairs (contact/company/deal/ticket-centric) + 3 REDO additions below,
//    each backed by the generic /crm/associations/{fromObjectType}/{toObjectType}
//    parametric path proven in crm__associations.json / crm__associations_schema.json.
const ASSOCIATION_PAIRS = [
  // contact-centric (24)
  ['contacts', 'companies'], ['contacts', 'deals'], ['contacts', 'tickets'],
  ['contacts', 'calls'], ['contacts', 'emails'], ['contacts', 'meetings'],
  ['contacts', 'notes'], ['contacts', 'tasks'], ['contacts', 'communications'],
  ['contacts', 'postal_mail'], ['contacts', 'quotes'], ['contacts', 'carts'],
  ['contacts', 'orders'], ['contacts', 'invoices'], ['contacts', 'commerce_payments'],
  ['contacts', 'subscriptions'], ['contacts', 'appointments'], ['contacts', 'courses'],
  ['contacts', 'listings'], ['contacts', 'services'], ['contacts', 'leads'],
  ['contacts', 'projects'], ['contacts', 'feedback_submissions'], ['contacts', 'contacts'],
  // company-centric (17)
  ['companies', 'contacts'], ['companies', 'deals'], ['companies', 'tickets'],
  ['companies', 'calls'], ['companies', 'emails'], ['companies', 'meetings'],
  ['companies', 'notes'], ['companies', 'tasks'], ['companies', 'communications'],
  ['companies', 'quotes'], ['companies', 'orders'], ['companies', 'invoices'],
  ['companies', 'subscriptions'], ['companies', 'appointments'], ['companies', 'courses'],
  ['companies', 'companies'],
  // deal-centric (12)
  ['deals', 'contacts'], ['deals', 'companies'], ['deals', 'tickets'],
  ['deals', 'calls'], ['deals', 'emails'], ['deals', 'meetings'],
  ['deals', 'notes'], ['deals', 'tasks'], ['deals', 'quotes'],
  ['deals', 'line_items'], ['deals', 'orders'], ['deals', 'leads'],
  // ticket-centric (8)
  ['tickets', 'contacts'], ['tickets', 'companies'], ['tickets', 'deals'],
  ['tickets', 'calls'], ['tickets', 'emails'], ['tickets', 'meetings'],
  ['tickets', 'notes'], ['tickets', 'tasks'],
  // REDO additions (3) — proven via the generic associations parametric path;
  // see PROVENANCE.json "REDO-assoc-*" entries.
  ['quotes', 'contacts'], ['quotes', 'line_items'], ['tickets', 'feedback_submissions'],
];

// 3..N — non-standard, non-association COVERABLE taxonomies, by section.
const OTHER_COVERABLE = {
  'Pipelines & Stages': [
    'pipelines_deals', 'pipeline_stages_deals',
    'pipelines_tickets', 'pipeline_stages_tickets',
    'pipelines_leads', 'pipeline_stages_leads',
  ],
  'CRM Lists': ['lists', 'list_folders', 'list_memberships'],
  'Owners & Teams': ['owners', 'teams'],
  'Custom Object Schemas': ['custom_object_schemas'],
  'HubDB': ['hubdb_tables', 'hubdb_rows'],
  'Marketing': [
    'marketing_events', 'marketing_event_attendances',
    'marketing_emails', 'marketing_email_versions',
    'campaigns', 'campaign_assets',
    // REDO additions — sources/specs/marketing__forms.json, marketing__single_send.json,
    // legacy form-integrations submissions endpoint (curl-verified 401), blog-settings,
    // media-bridge, sources/specs/marketing__transactional_single_send.json (proves
    // /marketing/transactional/2026-03/smtp-tokens -> transactional_smtp_tokens), and the
    // (Gap-flagged) ads objects are NOT added here — see Gaps below.
    'forms', 'form_submissions', 'single_send_v4', 'transactional_smtp_tokens',
    'blog_settings', 'media_bridge',
  ],
  'Automation': [
    'sequences', 'sequence_steps', 'sequence_enrollments',
    // REDO additions — sources/specs/automation__actions_v4.json (custom_coded_actions is
    // the CustomCodeActionDefinition sub-surface of Actions v4) and automation__automation_v4.json
    // (flows = the current Workflows successor) + legacy /automation/v3/workflows (curl 401).
    'custom_coded_actions', 'workflows',
  ],
  'Custom Events': ['custom_event_definitions', 'custom_event_completions'],
  'Files & Folders': ['files', 'file_folders'],
  'Timeline': [
    // NOTE: 'timeline_events' + this taxonomy's ingestion path are proven in
    // sources/specs/crm__timeline.json (/integrators/timeline/2026-03/events). But
    // 'timeline_event_types' (the type-DEFINITION resource: list/create/get-by-id) has NO
    // credential-free OpenAPI spec and NO current REST CRUD surface — HubSpot's current
    // Developer Platform manages event-type definitions via a project *-hsmeta.json config
    // file (deploy-time), not a runtime API. A legacy REST surface
    // (/integrations/v1/{appId}/timeline/event-types) is verified reachable (curl 401) but
    // requires auth to enumerate/read definitions and is deprecated in current docs.
    // Per task instruction: re-derived from the real type-definition resource (not the
    // TimelineEventIFrame sub-object) and marked runtime-discovery-only. See Gaps.
    'timeline_events',
  ],
  'Conversations': [
    'conversation_threads', 'conversation_messages',
    // REDO additions — sources/specs/conversations__conversations.json proves
    // /conversations/v3/conversations/inboxes, /channels, /channel-accounts (inbox<->channel
    // link table); conversations__custom_channels.json proves the custom-channel CRUD surface;
    // scheduler__meetings.json proves the meeting-scheduler surface.
    'conversation_inboxes', 'conversation_channels', 'conversation_inbox_channels',
    'conversation_custom_channels', 'meeting_scheduler',
  ],
  'Forecasts': ['forecasts', 'forecast_categories'],
  'Calling': ['call_transcriptions'],
  'Communication Preferences': ['subscription_types', 'subscription_statuses'],
  'CMS Content': [
    'blog_posts', 'blog_post_versions', 'blog_authors', 'blog_tags',
    'site_pages', 'landing_pages', 'url_redirects', 'domains',
  ],
  // REDO NEW TAXONOMY — Account & Settings. sources/specs/account__account_info.json proves
  // /account-info/2026-03/api-usage/daily/private-apps (api_usage) and
  // /account-info/2026-03/details; settings__user_provisioning.json proves PublicUser
  // (portal_users) + PublicPermissionSet (user_roles); business_units__business_units.json
  // proves PublicBusinessUnit (business_units); settings__multicurrency.json proves
  // exchange-rates/codes (currencies); settings__tax_rates.json proves the tax-rate-group
  // resource (tax_rates).
  'Account & Settings': [
    'api_usage', 'portal_users', 'user_roles', 'business_units', 'currencies', 'tax_rates',
  ],
  // REDO NEW TAXONOMY — Identity Provisioning (SCIM). No OpenAPI spec exists (SCIM is a
  // standards-based RFC7643/7644 surface, not part of the api-catalog); curl-verified
  // reachable: GET /scim/v2/Users -> 401, GET /scim/v2/ServiceProviderConfig -> 401.
  // Prose doc (developers.hubspot.com/docs/apps/developer-platform/add-features/scim)
  // confirms tenant URL https://api.hubspot.com/scim/v2 and the Users/Groups resource
  // types per the SCIM 2.0 spec HubSpot implements.
  'Identity Provisioning (SCIM)': ['scim_users', 'scim_groups'],
  // REDO NEW TAXONOMY — Data Ingestion. sources/specs/data_studio__datasource_ingestion.json
  // proves /data-studio/data-source/{datasourceId} + /data-push.
  'Data Ingestion': ['datasource_ingestion'],
};

// INFORMATIONAL — NOT in the COVERABLE universe (consumed by the extractor, not synced).
const INFORMATIONAL = [
  'properties', 'property_groups',
  'association_type_definitions', 'association_type_configurations',
  'account_info', 'audit_logs', 'object_library_enablements',
  'imports', 'exports', 'crm_owners_search',
];

// ---------------------------------------------------------------------------
// 3. Build the enumeration deterministically
// ---------------------------------------------------------------------------
function buildUniverse() {
  const objects = [];          // full COVERABLE IO names (sorted, deduped)
  const associationObjects = []; // subset: association IOs
  const taxonomyCounts = {};

  // CRM Standard Objects
  for (const o of CRM_STANDARD_OBJECTS) objects.push(o);
  taxonomyCounts['CRM Standard Objects'] = CRM_STANDARD_OBJECTS.length;

  // CRM Associations
  for (const [from, to] of ASSOCIATION_PAIRS) {
    const name = `assoc:${from}-${to}`;
    objects.push(name);
    associationObjects.push(name);
  }
  taxonomyCounts['CRM Associations'] = ASSOCIATION_PAIRS.length;

  // Other COVERABLE taxonomies
  for (const [tax, members] of Object.entries(OTHER_COVERABLE)) {
    for (const m of members) objects.push(m);
    taxonomyCounts[tax] = members.length;
  }

  // Dedup + sort for determinism
  const seen = new Set();
  const deduped = [];
  for (const o of objects.sort()) {
    if (seen.has(o)) continue;
    seen.add(o);
    deduped.push(o);
  }
  return { objects: deduped, associationObjects: associationObjects.sort(), taxonomyCounts };
}

// ---------------------------------------------------------------------------
// 4. REDO_REQUIRED_OBJECTS floor assertion — must ALL be present in the final
//    enumerated set (as a coverable object OR explicitly logged in Gaps with a
//    skipReason). This script enumerates the COVERABLE side; timeline_event_types
//    is intentionally NOT in the coverable set (see Timeline block comment above)
//    and is instead asserted against the Gaps list in SOURCES.json/SOURCE_STUDY.md.
// ---------------------------------------------------------------------------
const REDO_REQUIRED_OBJECTS = [
  'transactional_smtp_tokens', 'custom_coded_actions', 'api_usage', 'portal_users',
  'user_roles', 'business_units', 'currencies', 'conversation_inboxes',
  'conversation_inbox_channels', 'conversation_custom_channels', 'forms',
  'form_submissions', 'single_send_v4', 'ad_campaigns', 'ad_accounts', 'blog_settings',
  'media_bridge', 'workflows', 'tax_rates', 'scim_users', 'scim_groups',
  'conversation_channels', 'meeting_scheduler', 'datasource_ingestion',
  'assoc_tickets_feedback_submissions', 'assoc_quotes_contacts', 'assoc_quotes_line_items',
];

// Map the REDO task's assoc_* naming onto this script's `assoc:<from>-<to>` naming.
const REDO_ASSOC_ALIAS = {
  assoc_tickets_feedback_submissions: 'assoc:tickets-feedback_submissions',
  assoc_quotes_contacts: 'assoc:quotes-contacts',
  assoc_quotes_line_items: 'assoc:quotes-line_items',
};

// Objects with NO credential-free spec/endpoint — logged as Gaps, not silently dropped.
// transactional_smtp_tokens IS covered (marketing__transactional_single_send.json) so it's
// NOT in this list; kept here only as documentation of the two genuine gaps.
const KNOWN_GAPS = {
  ad_accounts: 'vendor-confirmed-absent: legacy /ads/v1/accounts is decommissioned (404, ' +
    'not 401/403); no successor Ads Accounts REST endpoint exists in the current API ' +
    'catalog or docs as of 2026-07-01. Ads data is sourced from external ad networks, not ' +
    'a HubSpot-native syncable object.',
  ad_campaigns: 'vendor-confirmed-absent: legacy /ads/v1/campaigns is decommissioned (404, ' +
    'not 401/403); no successor Ads Campaigns REST endpoint exists. HubSpot\'s native ' +
    '"Campaigns" object (marketing__campaigns_public_api.json) is a DIFFERENT resource ' +
    '(marketing campaign container), not ad-network ad campaigns.',
};

// ---------------------------------------------------------------------------
// 5. Emit structured stdout
// ---------------------------------------------------------------------------
function main() {
  const catalog = loadCatalogSignal();
  const { objects, associationObjects, taxonomyCounts } = buildUniverse();

  const enumeratedCount = objects.length;
  const associationCount = associationObjects.length;
  const nonAssociationCount = enumeratedCount - associationCount;

  // Cross-check: sum of taxonomy counts must equal enumeratedCount.
  const taxonomySum = Object.values(taxonomyCounts).reduce((a, b) => a + b, 0);
  const accountingOk = taxonomySum === enumeratedCount;

  // REDO floor check: every REDO_REQUIRED_OBJECTS entry must be in `objects`
  // (via direct name or assoc alias) OR in KNOWN_GAPS.
  const objectSet = new Set(objects);
  const floorMissing = [];
  const floorPresent = [];
  const floorGapped = [];
  for (const req of REDO_REQUIRED_OBJECTS) {
    const aliased = REDO_ASSOC_ALIAS[req] ?? req;
    if (objectSet.has(aliased)) {
      floorPresent.push(req);
    } else if (KNOWN_GAPS[req]) {
      floorGapped.push({ object: req, skipReason: KNOWN_GAPS[req] });
    } else {
      floorMissing.push(req);
    }
  }

  const out = {
    vendor: 'HubSpot',
    generatedAt: new Date().toISOString(),
    enumeratedCount,
    associationCount,
    nonAssociationCount,
    informationalExcludedCount: INFORMATIONAL.length,
    scaffoldingExcludedCount: 1, // Bucket_Test111
    taxonomyCounts,
    taxonomyAccounting: {
      taxonomySum,
      enumeratedCount,
      ok: accountingOk,
    },
    redoRequiredFloor: {
      required: REDO_REQUIRED_OBJECTS.length,
      present: floorPresent.length,
      gapped: floorGapped.length,
      missing: floorMissing.length,
      gappedDetail: floorGapped,
      missingDetail: floorMissing,
      ok: floorMissing.length === 0,
    },
    independentSignals: {
      liveCatalogReachable: catalog.available,
      liveCatalogTotalAPIs: catalog.totalAPIs,
      liveCatalogByGroup: catalog.byGroup,
    },
    informationalObjects: INFORMATIONAL,
    associationObjects,
    enumeratedObjects: objects,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');

  // Non-zero exit on accounting mismatch (set-completeness self-check).
  if (!accountingOk) {
    process.stderr.write(
      `ACCOUNTING MISMATCH: taxonomy sum ${taxonomySum} != enumeratedCount ${enumeratedCount}\n`,
    );
    process.exit(2);
  }
  if (floorMissing.length > 0) {
    process.stderr.write(
      `REDO FLOOR FAILURE: ${floorMissing.length} required objects missing (no coverage, ` +
      `no logged gap): ${floorMissing.join(', ')}\n`,
    );
    process.exit(3);
  }
}

main();
