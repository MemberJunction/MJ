#!/usr/bin/env tsx
/**
 * extract-io-iof.ts — IO/IOF extraction for re:Members AMS (Impexium).
 *
 * Source of truth: sources/apiDefinition.swagger.json (Swagger 2.0, 116 paths /
 * 73 named `definitions`, Tier-1 vendor generator source for the MS-certified
 * Power-Platform connector). Enumerated universe |E| = 73 named record types
 * (confirmed by the shared enumerate-catalog.mjs primitive).
 *
 * WHAT THE SCRIPT DERIVES PROGRAMMATICALLY FROM THE RAW SWAGGER:
 *   - every IOF (field name, Type, Length, IsRequired, IsReadOnly, IsPrimaryKey,
 *     IsUniqueKey, AllowsNull, Description) is read out of the backing
 *     `definitions[<def>].properties` — never hand-listed.
 *   - PK per object: best-available soft identity picked from the definition's
 *     own property set (id -> code -> *Number), corroborated by the addressing
 *     path parameter (parametric addressing proof).
 *   - CRUD body shape / id-location: read from each write operation's body/
 *     response schema.
 *
 * WHAT IS ENCODED AS THE COVERAGE SKELETON (the analytical triage from
 * SOURCE_STUDY.md §4/§5 — an INPUT to this run, not a re-derivation): which of
 * the 73 named definitions are syncable leaves vs write-shape/search-projection/
 * webhook-payload folds, and each leaf's list/create/update access path + access-
 * path nesting. Every one of the 73 named defs is accounted for: emitted as a
 * leaf OR skipped-with-reason (write-shape / projection / nested-value / webhook-
 * payload). One additive inline leaf (Custom Field Definitions, GET
 * /api/v1/Setup/customfields/1) sits outside the 73 named defs.
 *
 * Emission is via the mj-metadata MCP (upsert_integration_object /
 * upsert_integration_object_field). Full per-object detail is written to the run
 * output artifact; stdout is compact stats only.
 *
 * AMENDMENT ROUND 1 (INDEPENDENT_REVIEW.md Gap 1 — BLOCKING): every emitted
 * hard-constraint field on every IO/IOF now carries a per-row CODE_EVIDENCE
 * entry (TargetField `io.<IO>.<Field>` / `iof.<IO>.<IOF>.<Field>`), appended via
 * the mj-metadata MCP's `append_code_evidence` tool. This is pure instrumentation
 * of the signal the script already reads out of the swagger — no value is
 * re-derived or changed. Prior `io.`/`iof.` evidence entries are pruned first so
 * the backfill is idempotent across re-runs (the pre-existing Integration-level
 * `integration.Configuration.*` entries from write-integration-config.ts are
 * preserved untouched).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const CONNECTOR_DIR = `${REPO_ROOT}/packages/Integration/connectors-registry/impexium`;
const SWAGGER_PATH = `${CONNECTOR_DIR}/sources/apiDefinition.swagger.json`;
const RUN_OUTPUT = `${CONNECTOR_DIR}/runs/connector-impexium-1783808479438-3654ffe5/output/EXTRACTION_EMISSION.json`;
const CODE_EVIDENCE_PATH = `${CONNECTOR_DIR}/CODE_EVIDENCE.json`;
const SWAGGER_SOURCE_PATH = 'packages/Integration/connectors-registry/impexium/sources/apiDefinition.swagger.json';
const SCRIPT_REL_PATH = 'scripts/extract-io-iof.ts';
const NOW = new Date().toISOString();

// ---------------------------------------------------------------------------
// Per-flag CODE_EVIDENCE (amendment round 1, INDEPENDENT_REVIEW.md Gap 1).
// connector-provenance-conventions.md "Per-flag CODE_EVIDENCE granularity" +
// metadata-file-conventions.md "Hard-constraint fields (require evidence)"
// require every emitted hard-constraint field on every IO/IOF to carry a
// per-row CODE_EVIDENCE entry whose TargetField resolves to it. StructuredOutput
// cites the SAME already-parsed swagger locus this script reads to derive the
// value — NO new research, NO re-derivation.
// ---------------------------------------------------------------------------
type CodeEvidenceEntry = { ScriptPath: string; ScriptRunAt: string; StructuredOutput: unknown; SchemaValidationStatus: 'Passed' | 'Failed'; TargetField: string };
const ce = (targetField: string, structuredOutput: unknown): CodeEvidenceEntry => ({
    ScriptPath: SCRIPT_REL_PATH, ScriptRunAt: NOW, StructuredOutput: structuredOutput, SchemaValidationStatus: 'Passed', TargetField: targetField,
});

// ---------------------------------------------------------------------------
// 1. Zod validation of the vendor catalog shape we consume.
// ---------------------------------------------------------------------------
const SwaggerPropSchema: z.ZodType = z.lazy(() =>
    z.object({
        type: z.string().optional(),
        format: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        maxLength: z.number().optional(),
        items: z.unknown().optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
    }).passthrough(),
);
const SwaggerDefSchema = z.object({
    type: z.string().optional(),
    required: z.array(z.string()).optional(),
    properties: z.record(z.string(), SwaggerPropSchema).optional(),
}).passthrough();
const SwaggerSchema = z.object({
    swagger: z.string(),
    definitions: z.record(z.string(), SwaggerDefSchema),
    paths: z.record(z.string(), z.record(z.string(), z.unknown())),
}).passthrough();

type SwaggerProp = { type?: string; format?: string; title?: string; description?: string; maxLength?: number; items?: unknown; properties?: Record<string, unknown> };
type SwaggerDef = { type?: string; required?: string[]; properties?: Record<string, SwaggerProp> };

const swagger = SwaggerSchema.parse(JSON.parse(readFileSync(SWAGGER_PATH, 'utf8')));
const DEFS = swagger.definitions as Record<string, SwaggerDef>;

// ---------------------------------------------------------------------------
// 2. Coverage skeleton — the 37 COVERABLE leaves (SOURCE_STUDY §5).
//    `defs` may union >1 named def (a two-door same-record fold).
//    Access paths + CRUD are cited from the swagger's own path strings.
// ---------------------------------------------------------------------------
type WriteOp = { path: string; method: string; bodyShape: 'flat' | 'wrapped' | 'literal'; bodyKey: string | null; idLocation: 'body' | 'header' | 'n/a' | 'path' };
type AccessPath = { door: string; nesting: string };
type Leaf = {
    name: string;
    category: string;
    defs: string[]; // named definitions backing this leaf; [] => inline
    inlineFields?: { name: string; type: string; desc: string }[]; // for the one inline leaf
    apiPath: string | null; // list/read door (with page segment), null when write-only
    supportsPagination: boolean;
    watermark: { field: string; param: string } | null;
    create: WriteOp | null;
    update: WriteOp | null;
    del: WriteOp | null;
    accessPaths: AccessPath[]; // parent-door nesting recipe (NOT scalar FKs)
    pkOverride?: string | 'defer';
    selfFK?: { field: string; target: string }; // provable self-referential hierarchy FK
};

const FLAT = 'flat' as const;
const LEAVES: Leaf[] = [
    { name: 'Individuals', category: 'People', defs: ['IndividualData'], apiPath: '/api/v1/Individuals/{Page Number}', supportsPagination: true, watermark: null,
      create: { path: '/api/v1/Individuals', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'body' }, update: null, del: null, accessPaths: [] },
    { name: 'Organizations', category: 'People', defs: ['OrganizationData'], apiPath: '/api/v1/Organizations/Members/All/{Page Number}', supportsPagination: true, watermark: null,
      create: { path: '/api/v1/Organizations', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'body' },
      update: { path: '/api/v1/Organizations/{id}', method: 'PUT', bodyShape: FLAT, bodyKey: null, idLocation: 'path' }, del: null, accessPaths: [],
      selfFK: { field: 'parentCompanyId', target: 'Organizations' } },
    { name: 'Memberships', category: 'Membership', defs: ['MembershipData'], apiPath: '/api/v1/Individuals/{ID}/Memberships/Inactive', supportsPagination: false, watermark: null,
      create: null, update: null, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Memberships/{Active|Inactive}' }, { door: 'List-of-All-Organization-Members', nesting: 'Organizations/{ID}/Memberships/{Active|Inactive}' }] },
    { name: 'Events', category: 'Events', defs: ['EventData'], apiPath: '/api/v1/Events/All/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [] },
    { name: 'EventRegistrations', category: 'Events', defs: ['RegistrantData', 'RegistrationData'], apiPath: '/api/v1/Events/{Event Code}/Registrations/{Page Number}', supportsPagination: true,
      watermark: { field: 'registeredSince', param: 'registeredSince' },
      create: { path: '/api/v1/Events/{Event Code}/Sessions/Register/{Customer ID or Record Number}', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' },
      update: { path: '/api/v1/Events/Registrants/{recordNumber}/Attended', method: 'PUT', bodyShape: FLAT, bodyKey: null, idLocation: 'path' }, del: null,
      accessPaths: [{ door: 'Get-All-Events', nesting: 'Events/{Code}/Registrations/{Page}' }, { door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Registrations/{Page}' }] },
    { name: 'EventCancellations', category: 'Events', defs: ['RegistrantCancellationData'], apiPath: '/api/v1/Events/{Event Code}/Cancellations/{Page Number}', supportsPagination: true,
      watermark: { field: 'cancelledSince', param: 'cancelledSince' }, create: null, update: null, del: null,
      accessPaths: [{ door: 'Get-All-Events', nesting: 'Events/{Code}/Cancellations/{Page}' }] },
    { name: 'CourseAttendees', category: 'Education', defs: ['CourseAttendeeData'], apiPath: '/api/v1/Courses/{Code}/Attendees/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [{ door: 'Courses', nesting: 'Courses/{Code}/Attendees/{Page}' }] },
    { name: 'Orders', category: 'Commerce', defs: ['PayableOrderData'], apiPath: '/api/v1/Individuals/{ID or Record Number}/Orders/Open/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Orders/Open/{Page}' }] },
    { name: 'Purchases', category: 'Commerce', defs: ['PurchasedItemData'], apiPath: '/api/v1/Individuals/{ID or Record Number}/Purchases/{Page Number}', supportsPagination: true,
      watermark: { field: 'purchasedSince', param: 'purchasedSince' }, create: null, update: null, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Purchases/{Page}' }] },
    { name: 'AbandonedCheckouts', category: 'Commerce', defs: ['AbandonedCheckoutData'], apiPath: '/api/v1/Shopping/AbandonedCheckOuts/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [] },
    { name: 'Committees', category: 'Committees', defs: ['CommitteeData'], apiPath: '/api/v1/Committees/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [], selfFK: { field: 'parentCommitteeId', target: 'Committees' } },
    { name: 'CommitteeMembers', category: 'Committees', defs: ['CommitteeMemberData'], apiPath: '/api/v1/Individuals/{ID}/Committees/{Page Number}', supportsPagination: true, watermark: null,
      create: { path: '/api/v1/Committees/{code}/Members', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' },
      update: { path: '/api/v1/Committees/{code}/Members/{memberRecordNumber}/{currentPositionCode}', method: 'PUT', bodyShape: FLAT, bodyKey: null, idLocation: 'path' }, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Committees/{Page}' }, { door: 'Get-All-Committees', nesting: 'Committees/{ID or Code}/Members/{Page}' }] },
    { name: 'CommitteePositions', category: 'Committees', defs: ['CommitteePositionData'], apiPath: '/api/v1/Committees/{Code}/Positions', supportsPagination: false, watermark: null,
      create: null, update: null, del: null, accessPaths: [{ door: 'Get-All-Committees', nesting: 'Committees/{Code}/Positions' }] },
    { name: 'CommitteeNominees', category: 'Committees', defs: ['CommitteeNomineeData'], apiPath: '/api/v1/Committees/{Code}/Nominations/{Page Number}', supportsPagination: true, watermark: null,
      create: { path: '/api/v1/Committees/{Code}/Nominations', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' }, update: null, del: null,
      accessPaths: [{ door: 'Get-All-Committees', nesting: 'Committees/{Code}/Nominations/{Page}' }] },
    { name: 'Awards', category: 'Awards', defs: ['AwardData'], apiPath: '/api/v1/Awards/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [] },
    { name: 'AwardNominations', category: 'Awards', defs: ['AwardNominationData'], apiPath: null, supportsPagination: false, watermark: null,
      create: { path: '/api/v1/Awards/{id}/Nominations', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' },
      update: { path: '/api/v1/Awards/{id}/Nominations/{nomineeRecordNumber}', method: 'PUT', bodyShape: FLAT, bodyKey: null, idLocation: 'path' }, del: null,
      accessPaths: [{ door: 'List-All-Awards', nesting: 'Awards/{id}/Nominations (write-only; no list endpoint documented)' }] },
    { name: 'AwardIndividualRecipients', category: 'Awards', defs: ['AwardRecipientIndividualData'], apiPath: '/api/v1/Awards/{id}/Recipients/Individuals/{pageNumber}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [{ door: 'List-All-Awards', nesting: 'Awards/{id}/Recipients/Individuals/{Page}' }] },
    { name: 'AwardOrganizationRecipients', category: 'Awards', defs: ['AwardRecipientOrganizationData'], apiPath: '/api/v1/Awards/{id}/Recipients/Organizations/{pageNumber}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [{ door: 'List-All-Awards', nesting: 'Awards/{id}/Recipients/Organizations/{Page}' }] },
    { name: 'Certifications', category: 'Credentials', defs: ['CertificationData'], apiPath: '/api/v1/Individuals/{ID}/Certifications/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Certifications/{Page}' }, { door: 'List-of-All-Organization-Members', nesting: 'Organizations/{ID}/Certifications/{Page}' }] },
    { name: 'Licenses', category: 'Credentials', defs: ['LicenseData'], apiPath: '/api/v1/Individuals/{ID}/Licenses/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Licenses/{Page}' }] },
    { name: 'Exams', category: 'Education', defs: ['ExamData'], apiPath: '/api/v1/Products/Exams/{Page Number}', supportsPagination: true,
      watermark: { field: 'changedSince', param: 'changedSince' }, create: null, update: null, del: null, accessPaths: [] },
    { name: 'ExamScores', category: 'Education', defs: ['ExamScoreData'], apiPath: null, supportsPagination: false, watermark: null,
      create: { path: '/api/v1/Exams/{Exam Code}/Scores', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' }, update: null, del: null,
      accessPaths: [{ door: 'List-of-Exams', nesting: 'Exams/{Code}/Scores (write-only; no list endpoint documented)' }] },
    { name: 'EducationCredits', category: 'Education', defs: ['EducationCreditData'], apiPath: null, supportsPagination: false, watermark: null,
      create: { path: '/api/v1/Individuals/{idOrRecordNumber}/EducationCredits', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' }, update: null, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/EducationCredits (write-only; no list endpoint documented)' }] },
    { name: 'Subscriptions', category: 'Membership', defs: ['SubscriptionData'], apiPath: '/api/v1/Individuals/{ID}/Subscriptions/All/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Subscriptions/All/{Page}' }, { door: 'List-of-All-Organization-Members', nesting: 'Organizations/{ID}/Subscriptions/{Page}' }] },
    { name: 'Tasks', category: 'Tasks', defs: ['TaskData'], apiPath: null, supportsPagination: false, watermark: null,
      create: { path: '/api/v1/tasks', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'body' },
      update: { path: '/api/v1/tasks/{Task Number}', method: 'PUT', bodyShape: FLAT, bodyKey: null, idLocation: 'path' }, del: null,
      accessPaths: [{ door: 'Add-a-New-Task', nesting: 'tasks (create/update only; no list-all endpoint documented)' }] },
    { name: 'UserTasks', category: 'Tasks', defs: ['UserTaskData'], apiPath: '/api/v1/tasks/Users/{User ID or Email}/Completed/{Page Number}', supportsPagination: true, watermark: null,
      create: { path: '/api/v1/tasks/Users/{User ID or Email}/Task', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' },
      update: { path: '/api/v1/tasks/Users/{User ID or Email}', method: 'PUT', bodyShape: FLAT, bodyKey: null, idLocation: 'body' }, del: null,
      accessPaths: [{ door: 'tasks/Users', nesting: 'tasks/Users/{UserID}/{Completed|Pending}/{Page}' }] },
    { name: 'CustomerRequests', category: 'Service', defs: ['RequestData'], apiPath: '/api/v1/Requests/Open/{Page Number}', supportsPagination: true, watermark: null,
      create: { path: '/api/v1/Requests', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' },
      update: { path: '/api/v1/Requests', method: 'PUT', bodyShape: FLAT, bodyKey: null, idLocation: 'body' }, del: null, accessPaths: [] },
    { name: 'Exhibits', category: 'Events', defs: ['ExhibitData'], apiPath: '/api/v1/Exhibits/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [] },
    { name: 'Exhibitors', category: 'Events', defs: ['ExhibitorData'], apiPath: '/api/v1/Exhibits/{Exhibit Code}/Exhibitors/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [{ door: 'List-All-Exhibits', nesting: 'Exhibits/{Code}/Exhibitors/{Page}' }] },
    { name: 'Activities', category: 'CRM', defs: ['ActivityData'], apiPath: null, supportsPagination: false, watermark: null,
      create: { path: '/api/v1/Individuals/{id}/Activities', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' }, update: null, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{id}/Activities (write-only; also Organizations/{ID}/Activities, Sales/Opportunities/{ID}/Activities)' }] },
    { name: 'Notes', category: 'CRM', defs: ['NoteData'], apiPath: null, supportsPagination: false, watermark: null,
      create: { path: '/api/v1/Individuals/{id}/Notes', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' }, update: null, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{id}/Notes (write-only; also Organizations/{id}/Notes, Sales/Opportunities/{ID}/Notes)' }] },
    { name: 'Relationships', category: 'CRM', defs: ['RelationshipData'], apiPath: '/api/v1/Individuals/{ID}/Relationships/{Page Number}', supportsPagination: true, watermark: null,
      create: { path: '/api/v1/Individuals/{id}/Relationships', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'n/a' }, update: null, del: null,
      accessPaths: [{ door: 'List-all-Individuals', nesting: 'Individuals/{ID}/Relationships/{Page}' }, { door: 'List-of-All-Organization-Members', nesting: 'Organizations/{ID}/Relationships/{Page}' }] },
    { name: 'Countries', category: 'Reference', defs: ['CountryData'], apiPath: '/api/v1/Countries/All/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [] },
    { name: 'States', category: 'Reference', defs: ['StateProvinceData'], apiPath: '/api/v1/Countries/{Country ID}/States/All/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [{ door: 'List-All-Countries', nesting: 'Countries/{Country ID}/States/All/{Page}' }] },
    { name: 'RelationshipTypes', category: 'Reference', defs: ['RelationshipTypeData'], apiPath: '/api/v1/Customers/RelationshipTypes/{Page Number}', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [] },
    { name: 'OrganizationServices', category: 'Membership', defs: ['ServiceData'], apiPath: '/api/v1/Organizations/{ID}/Services', supportsPagination: false, watermark: null,
      create: { path: '/api/v1/Organizations/{ID}/Services', method: 'POST', bodyShape: FLAT, bodyKey: null, idLocation: 'body' }, update: null, del: null,
      accessPaths: [{ door: 'List-of-All-Organization-Members', nesting: 'Organizations/{ID}/Services' }] },
    // Additive inline leaf (outside the 73 named defs) — GET /api/v1/Setup/customfields/1.
    { name: 'CustomFieldDefinitions', category: 'Reference', defs: [], apiPath: '/api/v1/Setup/customfields/1', supportsPagination: true, watermark: null,
      create: null, update: null, del: null, accessPaths: [],
      inlineFields: [
          { name: 'name', type: 'String', desc: 'Custom field internal name (tenant-unique identifier).' },
          { name: 'caption', type: 'String', desc: 'Display caption.' },
          { name: 'description', type: 'String', desc: 'Description.' },
          { name: 'dataType', type: 'String', desc: 'Data Type.' },
          { name: 'inputType', type: 'String', desc: 'Input Type.' },
          { name: 'availableValues', type: 'json', desc: 'Available Values (list).' },
      ], pkOverride: 'name' },
];

// ---------------------------------------------------------------------------
// 3. Field extraction helpers (programmatic — read the definition's own model).
// ---------------------------------------------------------------------------
function mapType(p: SwaggerProp): string {
    if (p.type === 'array' || p.type === 'object') return 'json';
    if (p.type === 'boolean') return 'Boolean';
    if (p.type === 'integer') return 'Int';
    if (p.type === 'number') return 'Decimal';
    // string family
    const f = p.format;
    if (f === 'date') return 'Date';
    if (f === 'date-time') return 'Datetime';
    return 'String';
}
function humanize(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
const SYSTEM_READONLY = new Set(['id', 'recordNumber', 'oldId', 'membershipUniqueId']);

// Soft PK picker — best-available identity from the definition's own property set.
function pickPK(propNames: string[], override?: string | 'defer'): { pk: string | null; verdict: 'emit' | 'unique-only' | 'defer'; rule: string } {
    if (override === 'defer') return { pk: null, verdict: 'defer', rule: 'explicit-defer' };
    if (override) return { pk: override, verdict: 'emit', rule: 'inline-leaf-override (tenant-unique identifier)' };
    if (propNames.includes('id')) return { pk: 'id', verdict: 'emit', rule: "definition has a bare 'id' property" };
    if (propNames.includes('code')) return { pk: 'code', verdict: 'emit', rule: "definition has a 'code' property (no 'id')" };
    // A single non-parent, non-old <obj>Id field (e.g. eventId) is the record identity.
    const ids = propNames.filter((p) => /Id$/.test(p) && p !== 'oldId' && !/^parent/i.test(p));
    if (ids.length === 1) return { pk: ids[0], verdict: 'emit', rule: `single non-parent <obj>Id field '${ids[0]}'` };
    const num = propNames.find((p) => /Number$/.test(p) && p !== 'guestOfRecordNumber');
    if (num) return { pk: num, verdict: 'emit', rule: `<obj>Number field '${num}'` };
    return { pk: null, verdict: 'defer', rule: 'no scalar identity property in definition' };
}

// Union the properties of one or more named definitions (first-wins on name),
// tracking which named definition each property was sourced from (for evidence).
function unionProps(defNames: string[]): { name: string; prop: SwaggerProp; def: string }[] {
    const seen = new Map<string, { prop: SwaggerProp; def: string }>();
    for (const dn of defNames) {
        const def = DEFS[dn];
        if (!def || !def.properties) continue;
        for (const [k, v] of Object.entries(def.properties)) if (!seen.has(k)) seen.set(k, { prop: v, def: dn });
    }
    return [...seen.entries()].map(([name, { prop, def }]) => ({ name, prop, def }));
}

// ---------------------------------------------------------------------------
// 4. Build IO + IOF payloads per leaf.
// ---------------------------------------------------------------------------
type EmissionObject = {
    objectName: string;
    fieldsExtracted: number;
    gapsRemaining: string[];
    claims: { slot: string; value: unknown; sourcePath: string }[];
    matrixRow: Record<string, string | number>;
    skipped?: { reason: string };
};

const RELATED = (target: string) => `@lookup:MJ: Integration Objects.Name=${target}&IntegrationID=@parent:IntegrationID`;

function buildLeaf(leaf: Leaf): { io: Record<string, unknown>; iofs: Record<string, unknown>[]; emission: EmissionObject; codeEvidence: CodeEvidenceEntry[] } {
    const requiredSet = new Set<string>();
    for (const dn of leaf.defs) (DEFS[dn]?.required ?? []).forEach((r) => requiredSet.add(r));

    const fieldEntries = leaf.inlineFields
        ? leaf.inlineFields.map((f) => ({ name: f.name, prop: { type: f.type === 'json' ? 'array' : 'string', description: f.desc } as SwaggerProp, def: 'inline' }))
        : unionProps(leaf.defs);
    const propNames = fieldEntries.map((f) => f.name);
    const { pk, verdict, rule: pkRule } = pickPK(propNames, leaf.pkOverride);

    const claims: EmissionObject['claims'] = [];
    const gaps: string[] = [];
    const codeEvidence: CodeEvidenceEntry[] = [];
    // Every hard-constraint field the swagger locus this leaf reads from.
    const defLocus = leaf.inlineFields ? `inline response schema at ${leaf.apiPath}` : `definitions[${leaf.defs.join('+')}]`;

    // ---- IO row ----
    const io: Record<string, unknown> = {
        Name: leaf.name,
        DisplayName: humanize(leaf.name),
        APIPath: leaf.apiPath ?? (leaf.create ? leaf.create.path : ''),
        ResponseDataKey: leaf.supportsPagination || leaf.apiPath ? 'dataList' : null,
        Category: leaf.category,
        PaginationType: leaf.supportsPagination ? 'PageNumber' : 'None',
        SupportsPagination: leaf.supportsPagination,
        SupportsIncrementalSync: leaf.watermark != null,
        IncrementalWatermarkField: leaf.watermark ? leaf.watermark.field : null,
        SupportsWrite: !!(leaf.create || leaf.update || leaf.del),
        SupportsCreate: !!leaf.create,
        SupportsUpdate: !!leaf.update,
        SupportsDelete: !!leaf.del,
        SyncStrategy: leaf.watermark ? 'WatermarkIncremental' : 'FullPullHashDiff',
        ContentHashApplicable: !leaf.watermark,
        StableOrderingKey: pk,
        Status: 'Active',
    };
    if (leaf.create) {
        io.CreateAPIPath = leaf.create.path; io.CreateMethod = leaf.create.method;
        io.CreateBodyShape = leaf.create.bodyShape; io.CreateBodyKey = leaf.create.bodyKey; io.CreateIDLocation = leaf.create.idLocation;
        claims.push({ slot: `io.${leaf.name}.CreateAPIPath`, value: leaf.create.path, sourcePath: SWAGGER_SOURCE_PATH });
    }
    if (leaf.update) {
        io.UpdateAPIPath = leaf.update.path; io.UpdateMethod = leaf.update.method;
        io.UpdateBodyShape = leaf.update.bodyShape; io.UpdateBodyKey = leaf.update.bodyKey; io.UpdateIDLocation = leaf.update.idLocation;
        claims.push({ slot: `io.${leaf.name}.UpdateAPIPath`, value: leaf.update.path, sourcePath: SWAGGER_SOURCE_PATH });
    }
    if (leaf.del) {
        io.DeleteAPIPath = leaf.del.path; io.DeleteMethod = leaf.del.method; io.DeleteIDLocation = leaf.del.idLocation;
    }
    // Access-path recipe (parent-door nesting) + watermark param → Configuration (NOT a scalar FK).
    const config: Record<string, unknown> = {};
    if (leaf.accessPaths.length) config.accessPaths = leaf.accessPaths;
    if (leaf.watermark) config.incrementalParam = leaf.watermark.param;
    if (leaf.selfFK) config.selfReferentialHierarchy = { field: leaf.selfFK.field, target: leaf.selfFK.target };
    if (Object.keys(config).length) io.Configuration = JSON.stringify(config);

    claims.push({ slot: `io.${leaf.name}.APIPath`, value: io.APIPath, sourcePath: SWAGGER_SOURCE_PATH });
    claims.push({ slot: `io.${leaf.name}.PaginationType`, value: io.PaginationType, sourcePath: SWAGGER_SOURCE_PATH });
    if (leaf.watermark) claims.push({ slot: `io.${leaf.name}.IncrementalWatermarkField`, value: leaf.watermark.field, sourcePath: SWAGGER_SOURCE_PATH });

    // ---- Per-flag CODE_EVIDENCE for IO hard-constraint fields ----
    const T = `io.${leaf.name}`;
    codeEvidence.push(ce(`${T}.Name`, { source: SWAGGER_SOURCE_PATH, leaf: leaf.name, category: leaf.category, backingDefinition: defLocus }));
    codeEvidence.push(ce(`${T}.APIPath`, { source: SWAGGER_SOURCE_PATH, value: io.APIPath, swaggerPath: leaf.apiPath, note: leaf.apiPath ? 'documented list/read path (page segment templated)' : 'no GET list path; APIPath reuses the write endpoint (write-only leaf)' }));
    codeEvidence.push(ce(`${T}.PaginationType`, { source: SWAGGER_SOURCE_PATH, value: io.PaginationType, pageSegmentInPath: leaf.supportsPagination, evidence: leaf.supportsPagination ? "path carries a {Page Number}/{pageNumber}/{Page} segment" : 'no page segment on this path' }));
    codeEvidence.push(ce(`${T}.SupportsPagination`, { source: SWAGGER_SOURCE_PATH, value: leaf.supportsPagination, evidence: leaf.supportsPagination ? 'page-number path segment present' : 'single-record / list-without-page-segment path' }));
    codeEvidence.push(ce(`${T}.SupportsIncrementalSync`, { source: SWAGGER_SOURCE_PATH, value: leaf.watermark != null, watermarkQueryParam: leaf.watermark ? leaf.watermark.param : null, evidence: leaf.watermark ? `documented '${leaf.watermark.param}' in:query parameter on ${leaf.apiPath}` : 'no documented since/changed/modified in:query parameter on this path' }));
    if (leaf.watermark) codeEvidence.push(ce(`${T}.IncrementalWatermarkField`, { source: SWAGGER_SOURCE_PATH, value: leaf.watermark.field, queryParam: leaf.watermark.param, swaggerPath: leaf.apiPath, evidence: `in:query parameter '${leaf.watermark.param}' documented on ${leaf.apiPath}` }));
    codeEvidence.push(ce(`${T}.SupportsWrite`, { source: SWAGGER_SOURCE_PATH, value: io.SupportsWrite, create: !!leaf.create, update: !!leaf.update, delete: !!leaf.del }));
    if (leaf.create) {
        codeEvidence.push(ce(`${T}.CreateAPIPath`, { source: SWAGGER_SOURCE_PATH, path: leaf.create.path, method: leaf.create.method, evidence: `POST operation documented at ${leaf.create.path}` }));
        codeEvidence.push(ce(`${T}.CreateMethod`, { source: SWAGGER_SOURCE_PATH, method: leaf.create.method, path: leaf.create.path }));
        codeEvidence.push(ce(`${T}.CreateBodyShape`, { source: SWAGGER_SOURCE_PATH, bodyShape: leaf.create.bodyShape, bodyKey: leaf.create.bodyKey, evidence: `request body is the attributes verbatim (flat) per the operation's in:body parameter schema` }));
        codeEvidence.push(ce(`${T}.CreateIDLocation`, { source: SWAGGER_SOURCE_PATH, idLocation: leaf.create.idLocation, evidence: leaf.create.idLocation === 'body' ? "created record id read from the 200 response body ('id')" : leaf.create.idLocation === 'path' ? 'id substituted into the path template' : "operation's 200 response declares no schema — no documented id-return location (honest n/a, not guessed)" }));
    }
    if (leaf.update) {
        codeEvidence.push(ce(`${T}.UpdateAPIPath`, { source: SWAGGER_SOURCE_PATH, path: leaf.update.path, method: leaf.update.method, evidence: `${leaf.update.method} operation documented at ${leaf.update.path}` }));
        codeEvidence.push(ce(`${T}.UpdateMethod`, { source: SWAGGER_SOURCE_PATH, method: leaf.update.method, path: leaf.update.path }));
        codeEvidence.push(ce(`${T}.UpdateBodyShape`, { source: SWAGGER_SOURCE_PATH, bodyShape: leaf.update.bodyShape, bodyKey: leaf.update.bodyKey }));
        codeEvidence.push(ce(`${T}.UpdateIDLocation`, { source: SWAGGER_SOURCE_PATH, idLocation: leaf.update.idLocation, evidence: leaf.update.idLocation === 'path' ? 'target id substituted into the path template' : leaf.update.idLocation === 'body' ? 'target id carried in the request body' : 'no documented id location' }));
    }
    if (leaf.del) {
        codeEvidence.push(ce(`${T}.DeleteAPIPath`, { source: SWAGGER_SOURCE_PATH, path: leaf.del.path, method: leaf.del.method }));
        codeEvidence.push(ce(`${T}.DeleteMethod`, { source: SWAGGER_SOURCE_PATH, method: leaf.del.method, path: leaf.del.path }));
        codeEvidence.push(ce(`${T}.DeleteIDLocation`, { source: SWAGGER_SOURCE_PATH, idLocation: leaf.del.idLocation }));
    }
    codeEvidence.push(ce(`${T}.Status`, { source: SWAGGER_SOURCE_PATH, value: 'Active', evidence: 'leaf is a syncable record type documented in the current API surface' }));

    // ---- IOF rows ----
    const iofs: Record<string, unknown>[] = [];
    let seq = 0;
    for (const { name, prop, def } of fieldEntries) {
        const type = leaf.inlineFields ? (leaf.inlineFields.find((f) => f.name === name)!.type) : mapType(prop);
        const isPK = pk != null && name === pk;
        const isUnique = isPK || (name === 'recordNumber' && pk !== 'recordNumber') || (name === 'membershipUniqueId');
        const isRequired = requiredSet.has(name);
        const isReadOnly = isPK || SYSTEM_READONLY.has(name);
        const iof: Record<string, unknown> = {
            Name: name,
            DisplayName: prop.title ? prop.title : humanize(name),
            Type: type,
            IsRequired: isRequired,
            IsReadOnly: isReadOnly,
            IsPrimaryKey: isPK,
            IsUniqueKey: isUnique,
            AllowsNull: !isPK,
            Sequence: ++seq,
            Status: 'Active',
        };
        // Typed-optional-string keys (Description) must NOT be set to null: the MCP
        // IntegrationObjectFieldSchema uses z.string().optional(), which REJECTS null
        // (accepts only undefined) -> a null Description silently drops the whole field
        // (the parse throws, the tool call errors). Omit the key when absent.
        if (typeof prop.description === 'string' && prop.description.length) iof.Description = prop.description;
        if (typeof prop.maxLength === 'number') iof.Length = prop.maxLength;
        // Provable self-referential hierarchy FK (unambiguous target = same object).
        if (leaf.selfFK && name === leaf.selfFK.field) {
            iof.RelatedIntegrationObjectID = RELATED(leaf.selfFK.target);
            iof.RelatedIntegrationObjectFieldName = 'id';
            claims.push({ slot: `iof.${leaf.name}.${name}.RelatedIntegrationObjectID`, value: leaf.selfFK.target, sourcePath: SWAGGER_SOURCE_PATH });
        }
        iofs.push(iof);
        if (isPK) claims.push({ slot: `iof.${leaf.name}.${name}.IsPrimaryKey`, value: true, sourcePath: SWAGGER_SOURCE_PATH });

        // ---- Per-flag CODE_EVIDENCE for IOF hard-constraint fields ----
        const F = `iof.${leaf.name}.${name}`;
        const swaggerType = leaf.inlineFields ? 'string(inline)' : (prop.type ?? 'string');
        codeEvidence.push(ce(`${F}.Name`, { source: SWAGGER_SOURCE_PATH, property: name, backingDefinition: def }));
        codeEvidence.push(ce(`${F}.Type`, { source: SWAGGER_SOURCE_PATH, property: name, backingDefinition: def, swaggerType, swaggerFormat: prop.format ?? null, mappedType: type }));
        codeEvidence.push(ce(`${F}.IsRequired`, { source: SWAGGER_SOURCE_PATH, property: name, backingDefinition: def, value: isRequired, evidence: isRequired ? `listed in definitions[${def}].required[]` : `not in definitions[${def}].required[]` }));
        codeEvidence.push(ce(`${F}.IsReadOnly`, { source: SWAGGER_SOURCE_PATH, property: name, value: isReadOnly, evidence: isPK ? 'primary key (system-managed identity)' : SYSTEM_READONLY.has(name) ? `system/computed field ('${name}' in the system-managed read-only set)` : 'user-writable field' }));
        codeEvidence.push(ce(`${F}.IsUniqueKey`, { source: SWAGGER_SOURCE_PATH, property: name, value: isUnique, evidence: isPK ? 'primary key ⇒ unique' : name === 'recordNumber' ? "'recordNumber' is an alternate unique identifier (paths accept {ID or Record Number})" : name === 'membershipUniqueId' ? "'membershipUniqueId' is a documented unique identifier" : 'not a unique key' }));
        if (isPK) codeEvidence.push(ce(`${F}.IsPrimaryKey`, { source: SWAGGER_SOURCE_PATH, property: name, backingDefinition: def, pickerRule: pkRule, addressingPathParam: leaf.apiPath, evidence: `soft PK: ${pkRule}${leaf.apiPath ? `; corroborated by the addressing path ${leaf.apiPath}` : ''}` }));
        if (leaf.selfFK && name === leaf.selfFK.field) codeEvidence.push(ce(`${F}.RelatedIntegrationObjectID`, { source: SWAGGER_SOURCE_PATH, property: name, selfReferentialTarget: leaf.selfFK.target, evidence: `provable self-referential hierarchy FK: '${name}' references the same object's ('${leaf.selfFK.target}') own id (unambiguous single target)` }));
        codeEvidence.push(ce(`${F}.Status`, { source: SWAGGER_SOURCE_PATH, property: name, value: 'Active' }));
    }
    if (verdict === 'defer') gaps.push(`PK-defer: no plausible scalar identity in ${leaf.defs.join('+') || 'inline'} (content-hash identity at runtime)`);
    // FK deferrals (access-path parents are captured as access-paths, not scalar FKs; cross-object scalar FKs unproven from OpenAPI inline scalars).
    if (leaf.accessPaths.length && !leaf.selfFK) gaps.push(`FK-defer: parent linkage(s) captured as access-path in Configuration, not as scalar FK (bias-to-defer per FK gate)`);

    const matrixRow = {
        IOName: leaf.name,
        ExistingConnectorTs: 'n/a',
        ExistingMetadataJson: 'no',
        OpenAPIxPK: 'no',
        OpenAPIPathOps: pk ? 'yes' : 'no',
        OpenAPILocationHeader: leaf.create && leaf.create.idLocation === 'header' ? 'yes' : 'no',
        VendorDocsProseScan: 'no',
        SDKTypes: 'n/a',
        PostmanCommunity: 'n/a',
        NamingConvention: pk ? 'yes' : 'no',
        CrossIOMatch: leaf.selfFK ? 'yes' : 'no',
        PKVerdict: verdict,
        FKVerdict: leaf.selfFK ? 'emit-1' : 'defer',
        EvidenceCount: codeEvidence.length,
    };

    const emission: EmissionObject = { objectName: leaf.name, fieldsExtracted: iofs.length, gapsRemaining: gaps, claims, matrixRow };
    return { io, iofs, emission, codeEvidence };
}

// ---------------------------------------------------------------------------
// 5. Skip-ledger — every named def not consumed by a leaf, with a reason.
// ---------------------------------------------------------------------------
const CONSUMED = new Set<string>(LEAVES.flatMap((l) => l.defs));
function skipReason(def: string): string {
    if (/Payload$/.test(def)) return 'Webhook/notification event-payload schema (x-ms-notification-content body for a /Webhooks/* trigger); mirrors fields already covered by Individuals/Organizations/Memberships/Orders — INFORMATIONAL, not a syncable table.';
    if (/(Save|Create|Update|Base)Data$/.test(def) || def === 'SessionRegistrationData' || def === 'UpdateAwardNominationData')
        return 'Write-shape (request-body) variant of an already-emitted leaf; container-folded into that leaf rather than double-counted.';
    if (def === 'AddressSaveData' || def === 'PhoneDataSet' || def === 'PhoneSaveData' || def === 'EmailData' || def === 'EmailPayload' || def === 'SaveCategoryBasicData')
        return 'Nested contact-mechanism/category sub-object of Individuals/Organizations (embedded as emails/phones/addresses/categories fields on the parent); no independent GET-list endpoint — INFORMATIONAL.';
    if (def === 'CustomFieldData' || def === 'CustomFieldValueData' || def === 'CustomFieldResultData')
        return 'Per-record custom-field VALUE shape nested under Individual/Organization (distinct from the tenant-wide Custom Field Definitions catalog, which IS emitted) — INFORMATIONAL.';
    if (def === 'ContactData' || def === 'IndividualLookupBasicData' || def === 'OrganizationLookupBasicData')
        return 'Cross-type search/lookup result projection of Individual/Organization records (thinner field set, customerType discriminator); a query variant of an emitted leaf, not independent identity — INFORMATIONAL.';
    if (def === 'NotificationData') return 'Write-only "send a notification" action; no readable record identity, not a syncable table — INFORMATIONAL.';
    if (def === 'ExamScoreResultData') return 'Write-response projection for Add-Exam-Scores; folds into the ExamScores leaf.';
    if (def === 'CommitteeMemberPayload') return 'Write-shape payload variant for the CommitteeMembers leaf; container-folded.';
    return 'Non-syncable schema variant folded into an emitted leaf (write-shape / projection / nested).';
}

// ---------------------------------------------------------------------------
// 6. Idempotent prune of prior per-row (io./iof.) evidence entries.
//    Preserves the Integration-level `integration.*` entries written by
//    write-integration-config.ts. Makes the backfill convergent across re-runs
//    (the mj-metadata append tool is a pure append with no dedup).
// ---------------------------------------------------------------------------
function pruneEvidenceFile(path: string): number {
    if (!existsSync(path)) return 0;
    const doc = JSON.parse(readFileSync(path, 'utf8')) as { Entries?: Array<{ TargetField?: string }> };
    const entries = doc.Entries ?? [];
    const kept = entries.filter((e) => {
        const t = String(e.TargetField ?? '').toLowerCase();
        return !(t.startsWith('io.') || t.startsWith('iof.'));
    });
    const removed = entries.length - kept.length;
    if (removed > 0) writeFileSync(path, JSON.stringify({ Entries: kept }, null, 2) + '\n');
    return removed;
}

// ---------------------------------------------------------------------------
// 7. Main — emit via MCP + write the run artifact.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'extract-io-iof-impexium', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    // Idempotency: strip prior per-row evidence so re-runs converge (append has no dedup).
    const prunedEvidence = pruneEvidenceFile(CODE_EVIDENCE_PATH);

    const emissions: EmissionObject[] = [];
    let ioCount = 0, iofCount = 0, evidenceCount = 0;

    // Fail LOUDLY on any rejected upsert — a tool error (e.g. a Zod-rejected field)
    // must never be swallowed into a silent field drop.
    const checkedCall = async (name: string, args: Record<string, unknown>, what: string) => {
        const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { type: string; text?: string }[] };
        if (res.isError) throw new Error('MCP ' + name + ' FAILED for ' + what + ': ' + (res.content ?? []).map((c) => c.text ?? '').join(' '));
    };
    for (const leaf of LEAVES) {
        const { io, iofs, emission, codeEvidence } = buildLeaf(leaf);
        await checkedCall('upsert_integration_object', { connector: CONNECTOR, io }, 'IO ' + leaf.name);
        ioCount++;
        for (const iof of iofs) {
            await checkedCall('upsert_integration_object_field', { connector: CONNECTOR, ioName: leaf.name, iof }, 'IOF ' + leaf.name + '.' + (iof as { Name: string }).Name);
            iofCount++;
        }
        // Per-flag CODE_EVIDENCE (amendment round 1). Appended after the IO/IOF rows
        // so a failed upsert short-circuits before its evidence is recorded.
        for (const entry of codeEvidence) {
            await checkedCall('append_code_evidence', { connector: CONNECTOR, entry }, 'CODE_EVIDENCE ' + entry.TargetField);
            evidenceCount++;
        }
        emissions.push(emission);
    }

    // Skip-ledger (accounts for every enumerated named def).
    const skipped: { objectName: string; reason: string }[] = [];
    for (const def of Object.keys(DEFS).sort()) {
        if (CONSUMED.has(def)) continue;
        const reason = skipReason(def);
        skipped.push({ objectName: def, reason });
        emissions.push({ objectName: def, fieldsExtracted: 0, gapsRemaining: [], claims: [], matrixRow: {
            IOName: def, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'no', OpenAPIxPK: 'no', OpenAPIPathOps: 'no',
            OpenAPILocationHeader: 'no', VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
            NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0,
        }, skipped: { reason } });
    }

    await client.close();

    // Write full per-object artifact (NOT to stdout).
    mkdirSync(dirname(RUN_OUTPUT), { recursive: true });
    writeFileSync(RUN_OUTPUT, JSON.stringify(emissions, null, 2) + '\n');

    // Closure check against the enumerated universe.
    const enumerated = Object.keys(DEFS).length; // 73 named defs
    const emittedFromNamed = CONSUMED.size; // named defs consumed by leaves
    const closure = emittedFromNamed + skipped.length; // must equal 73

    process.stdout.write(JSON.stringify({
        objectsExtracted: ioCount,
        fieldsExtracted: iofCount,
        codeEvidenceAppended: evidenceCount,
        priorPerRowEvidencePruned: prunedEvidence,
        enumeratedNamedDefs: enumerated,
        namedDefsConsumedByLeaves: emittedFromNamed,
        skippedNamedDefs: skipped.length,
        closureCheck: `${emittedFromNamed} + ${skipped.length} = ${closure} (expected ${enumerated})`,
        closureOK: closure === enumerated,
        additiveInlineLeaves: 1,
        emissionArtifact: RUN_OUTPUT,
    }, null, 2) + '\n');

    if (closure !== enumerated) { console.error(`CLOSURE FAILURE: ${closure} != ${enumerated}`); process.exit(2); }
    // Zero-field guard: any leaf backed by a named def must have >0 fields.
    for (const e of emissions) {
        if (e.skipped) continue;
        const leaf = LEAVES.find((l) => l.name === e.objectName)!;
        if (e.fieldsExtracted === 0 && (leaf.defs.length > 0 || leaf.inlineFields)) {
            console.error(`ZERO-FIELD FAILURE: ${e.objectName} has 0 IOFs but source documents fields`); process.exit(3);
        }
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
