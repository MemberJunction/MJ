#!/usr/bin/env node
// verify-gap-coverage.mjs
//
// MetadataWriter gap-resolution pass. Consumes a fixed list of "gap" object
// names (handed down from a coordinator) and, for EACH ONE, reproducibly
// verifies against the credential-free OpenAPI sources whether the object:
//   (a) is a real source-derived leaf (enumerate-zendesk-catalog.mjs logic,
//       re-run fresh here rather than trusting a cached output file), and
//   (b) already has a fully-populated IntegrationObject row in the current
//       metadata file (Status, APIPath, field count, capability flags).
//
// This is a READ-ONLY confirmation pass over IO/IOF data (owned by
// ioiof-extractor, already extracted + independently reviewed 4 rounds deep
// per INDEPENDENT_REVIEW.md — 0 confirmed blocking gaps). It does NOT mutate
// IO/IOF rows. Its output is the reproducible evidence backing the
// MetadataWriter's filledSlots confirmation for each gap name.
//
// Usage: node scripts/verify-gap-coverage.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPO = resolve(ROOT, '..', '..', '..', '..');
const METADATA_FILE = resolve(REPO, 'metadata/integrations/zendesk/.zendesk.integration.json');

const GAPS = [
  'activities','approval_requests','article_attachments','article_labels','articles','asset_types',
  'assets','audit_logs','audits','automations','bookmarks','brand_agents','brands','community_posts',
  'community_topics','compliance_deletion_statuses','custom_field_options','custom_object_access_rules',
  'custom_object_fields','custom_object_permission_policies','custom_object_record_attachments',
  'custom_object_records','custom_objects','custom_roles','custom_statuses','deleted_tickets',
  'deleted_users','deletion_schedules','dynamic_content_items','dynamic_content_variants',
  'email_notifications','events','group_memberships','group_sla_policies','groups','help_center_votes',
  'itam_asset_fields','itam_asset_statuses','locations','macro_attachments','macro_categories','macros',
  'monitored_twitter_handles','omnichannel_routing_queues','organization_fields','organization_memberships',
  'organization_merges','organization_subscriptions','organizations','post_subscriptions',
  'recipient_addresses','remote_authentications','requests','resource_collections',
  'routing_attribute_values','routing_attributes','routing_instance_values','satisfaction_ratings',
  'satisfaction_reasons','saved_searches','schedule_holidays','schedules','sections',
  'service_catalog_items','sessions','sharing_agreements','skips','sla_policies','suspended_tickets',
  'tags','target_failures','targets','task_list_templates','task_lists','tasks','ticket_comments',
  'ticket_content_pins','ticket_events','ticket_fields','ticket_form_statuses','ticket_forms',
  'ticket_metric_events','ticket_metrics','tickets','translations','trigger_categories',
  'trigger_revisions','triggers','user_fields','user_identities','user_segments','user_subscriptions',
  'users','view_counts','views','workspaces',
];

// ── re-derive the OAS leaf set fresh (do not trust the cached output file) ──
function resolveRef(doc, ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let cur = doc;
  for (const p of parts) { cur = cur?.[p]; if (cur === undefined) return null; }
  return cur;
}
function schemaName(ref) { const m = ref?.match(/\/([^/]+)$/); return m ? m[1] : null; }
function findArrayProperty(doc, schema, depth = 0) {
  if (!schema || depth > 3) return null;
  if (schema.$ref) return findArrayProperty(doc, resolveRef(doc, schema.$ref), depth + 1);
  if (schema.allOf) { for (const s of schema.allOf) { const r = findArrayProperty(doc, s, depth + 1); if (r) return r; } }
  if (schema.type === 'array') return { key: null, itemSchema: schema.items };
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      let resolved = propSchema;
      if (resolved.$ref) resolved = resolveRef(doc, resolved.$ref) ?? resolved;
      if (resolved.type === 'array') return { key, itemSchema: resolved.items };
    }
  }
  return null;
}
function isTemplateVar(seg) { return /^\{.*\}$/.test(seg); }
function pathScore(segs) {
  let score = segs.length;
  for (const s of segs) { if (isTemplateVar(s)) score += 3; if (['incremental', 'autocomplete', 'search', 'count_many'].includes(s)) score += 10; }
  return score;
}
function deriveLeafSet(files) {
  const leaves = new Map();
  for (const file of files) {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    for (const [pathTemplate, pathItem] of Object.entries(doc.paths ?? {})) {
      const get = pathItem.get;
      if (!get) continue;
      const ok200 = get.responses?.['200'];
      const schema = ok200?.content?.['application/json']?.schema;
      if (!schema) continue;
      const found = findArrayProperty(doc, schema);
      if (!found) continue;
      const segs = pathTemplate.split('/').filter(Boolean).filter((s) => !['api', 'v2'].includes(s));
      let objectName = found.key;
      if (!objectName) { const lastReal = [...segs].reverse().find((s) => !isTemplateVar(s)); objectName = lastReal ?? segs[segs.length - 1]; }
      if (!objectName) continue;
      const score = pathScore(segs);
      const existing = leaves.get(objectName);
      if (!existing || score < existing.score) leaves.set(objectName, { listPath: pathTemplate, score, sourceFile: file });
    }
  }
  return leaves;
}

// Objects Tier-1 documented as REAL but NOT present in the downloaded OAS
// (SOURCES.json: "IMPORTANT GAP IN THE OAS" note on the Schedules API family
// — /api/v2/business_hours/schedules + .../holidays are real, versioned,
// full-CRUD endpoints captured via OfficialDocs prose, not the OAS). A
// literal-path OAS miss for these two is EXPECTED, not a coverage gap.
const OAS_COVERAGE_DOCUMENTED_GAP = new Set(['schedules', 'schedule_holidays']);

function main() {
  const leafMap = deriveLeafSet([resolve(ROOT, 'sources/ticketing-oas.json'), resolve(ROOT, 'sources/helpcenter-oas.json')]);
  const ticketingDoc = JSON.parse(readFileSync(resolve(ROOT, 'sources/ticketing-oas.json'), 'utf8'));
  const helpcenterDoc = JSON.parse(readFileSync(resolve(ROOT, 'sources/helpcenter-oas.json'), 'utf8'));
  const allOASPaths = new Set([...Object.keys(ticketingDoc.paths ?? {}), ...Object.keys(helpcenterDoc.paths ?? {})]);

  const metadataRaw = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
  const root = Array.isArray(metadataRaw) ? metadataRaw[0] : metadataRaw;
  const ios = root.relatedEntities?.['MJ: Integration Objects'] ?? [];
  const ioByName = new Map(ios.map((io) => [io.fields.Name, io]));

  const results = [];
  let allCovered = true;
  for (const name of GAPS) {
    const io = ioByName.get(name);
    const inMetadata = !!io;
    const fieldCount = inMetadata ? (io.relatedEntities?.['MJ: Integration Object Fields']?.length ?? 0) : 0;
    const f = inMetadata ? io.fields : {};

    // Primary check: the object's own recorded APIPath, re-verified as a
    // LITERAL path key in one of the two OAS documents (robust to
    // name-vs-path-segment mismatches that a generic leaf-name derivation
    // can miss — e.g. "user_identities" is recorded at path
    // /api/v2/end_users/{user_id}/identities, whose last path segment is
    // "identities", not "user_identities").
    const literalPathMatch = inMetadata && !!f.APIPath && allOASPaths.has(f.APIPath);
    // Secondary/fallback check: generic leaf-name derivation (catches cases
    // where APIPath is null but the object is still a real list-endpoint leaf).
    const nameLeafMatch = leafMap.has(name);
    const documentedOASGap = OAS_COVERAGE_DOCUMENTED_GAP.has(name);
    const inOAS = literalPathMatch || nameLeafMatch || documentedOASGap;

    const covered = inOAS && inMetadata && f.Status === 'Active' && fieldCount > 0;
    if (!covered) allCovered = false;
    results.push({
      object: name,
      inOAS,
      oasEvidence: literalPathMatch ? 'literal-path-match' : nameLeafMatch ? 'name-leaf-match' : documentedOASGap ? 'documented-oas-coverage-gap-prose-source' : 'no-match',
      inMetadata,
      metadataStatus: f.Status ?? null,
      metadataAPIPath: f.APIPath ?? null,
      fieldCount,
      supportsCreate: f.SupportsCreate ?? null,
      supportsUpdate: f.SupportsUpdate ?? null,
      supportsDelete: f.SupportsDelete ?? null,
      covered,
    });
  }

  process.stdout.write(JSON.stringify({
    gapCount: GAPS.length,
    allCovered,
    coveredCount: results.filter((r) => r.covered).length,
    uncoveredObjects: results.filter((r) => !r.covered).map((r) => r.object),
    results,
  }, null, 2) + '\n');
}

main();
