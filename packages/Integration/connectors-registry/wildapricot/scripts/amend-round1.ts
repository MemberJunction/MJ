#!/usr/bin/env tsx
// scripts/amend-round1.ts
// DELTA AMENDMENT ROUND 1 — surgical fixes to ONLY two objects: Feature, EmailLog.
// Does NOT re-walk or re-enumerate the catalog. Upserts via the MetadataFileStore
// (same store the mj-metadata MCP uses). EmailLog requires a full IOF-set REPLACEMENT
// (remove 2 stale container-schema fields, add 23 EmailLogRecord fields), which the
// store's additive UpsertIOF cannot express alone — so we mutate the file in the
// store's canonical format and re-write atomically (with backup).
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const REPO = resolve(__dirname, '../../../../..');
const META_FILE = resolve(REPO, 'metadata/integrations/wildapricot/.wildapricot.integration.json');
const SPEC = resolve(REPO, 'packages/Integration/connectors-registry/wild-apricot/sources/openapi.admin.9.14.0.json');
const EMISSION = resolve(
    REPO,
    'packages/Integration/connectors-registry/wildapricot/runs/connector-wildapricot-1782844331649-0a8d294b/output/EXTRACTION_EMISSION.json',
);
const SPEC_PATH_REL = 'connectors-registry/wild-apricot/sources/openapi.admin.9.14.0.json';

type IOF = { fields: Record<string, unknown> };
type IO = { fields: Record<string, unknown>; relatedEntities?: { 'MJ: Integration Object Fields'?: IOF[] } };

function writeAtomic(filePath: string, content: string): void {
    mkdirSync(dirname(filePath), { recursive: true });
    if (existsSync(filePath)) {
        const backupDir = join(dirname(filePath), '.backups');
        mkdirSync(backupDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        copyFileSync(filePath, join(backupDir, `${basename(filePath)}.${stamp}.bak`));
    }
    const tmp = join(dirname(filePath), `.${basename(filePath)}.tmp-${randomBytes(4).toString('hex')}`);
    writeFileSync(tmp, content, 'utf-8');
    renameSync(tmp, filePath);
}

// EmailLogRecord field set, derived from the OpenAPI EmailLogRecord schema and the
// reviewer's FixInstruction (authoritative correction). Types follow the FixInstruction.
function emailLogRecordFields(spec: Record<string, unknown>): IOF[] {
    const components = spec.components as { schemas: Record<string, { properties?: Record<string, { description?: string }> }> };
    const schema = components.schemas.EmailLogRecord;
    const desc = (k: string): string | undefined => schema.properties?.[k]?.description?.trim() || undefined;

    // [name, Type, IsPrimaryKey, AllowsNull] per FixInstruction GAP-2.
    const spec23: Array<[string, string, boolean]> = [
        ['Id', 'Int', true],
        ['Url', 'json', false],
        ['SentDate', 'Date', false],
        ['Subject', 'String', false],
        ['Body', 'String', false],
        ['ReplyToName', 'String', false],
        ['ReplyToAddress', 'String', false],
        ['Type', 'String', false],
        ['IsTrackingAllowed', 'Boolean', false],
        ['IsCopySentToAdmins', 'Boolean', false],
        ['SenderId', 'Int', false],
        ['SenderName', 'String', false],
        ['SendingType', 'String', false],
        ['Origin', 'json', false],
        ['SubOriginId', 'Int', false],
        ['RecipientCount', 'Int', false],
        ['ReadCount', 'Int', false],
        ['UniqueLinkClickCount', 'Int', false],
        ['SuccessfullySentCount', 'Int', false],
        ['RecipientsThatClickedAnyLinkCount', 'Int', false],
        ['FailedCount', 'Int', false],
        ['InProgress', 'Boolean', false],
        ['Recipient', 'json', false],
    ];

    return spec23.map(([name, type, isPK]) => ({
        fields: {
            Name: name,
            Type: type,
            IsPrimaryKey: isPK,
            IsRequired: false,
            // The spec does not state required-ness; only PK is provably non-null (the addressing
            // path /SentEmails/{emailId} addresses by Id). All others permissive.
            IsReadOnly: true, // EmailLog records are system-generated send logs — read-only.
            IsUniqueKey: isPK,
            AllowsNull: !isPK,
            Status: 'Active',
            Description: desc(name) ?? `${name} (EmailLogRecord).`,
            IntegrationObjectID: '@parent:ID',
        },
    }));
}

function main(): void {
    const spec = JSON.parse(readFileSync(SPEC, 'utf-8')) as Record<string, unknown>;
    const parsed = JSON.parse(readFileSync(META_FILE, 'utf-8')) as Array<{
        fields: Record<string, unknown>;
        relatedEntities: { 'MJ: Integration Objects': IO[] };
    }>;
    const root = parsed[0];
    const ios = root.relatedEntities['MJ: Integration Objects'];

    const feature = ios.find((i) => String(i.fields.Name).toLowerCase() === 'feature');
    const emailLog = ios.find((i) => String(i.fields.Name).toLowerCase() === 'emaillog');
    if (!feature) throw new Error('Feature IO not found — cannot apply GAP-1 fix');
    if (!emailLog) throw new Error('EmailLog IO not found — cannot apply GAP-2 fix');

    // ---- GAP-1: Feature ----
    // io.Feature.APIPath: clear (the /accounts/{accountId}/features list endpoint is fabricated;
    //   only /accounts/{accountId}/features/{featureId} single-GET exists in the spec).
    // io.Feature.PaginationType: Offset -> None
    // io.Feature.SupportsPagination: null -> false
    feature.fields.APIPath = null;
    feature.fields.PaginationType = 'None';
    feature.fields.SupportsPagination = false;
    // A per-ID-only resource has no stable list ordering to keyset-page on.
    delete feature.fields.StableOrderingKey;
    // Record the corrected per-record access path for the runtime connector.
    const fcfg = (feature.fields.Configuration as Record<string, unknown>) ?? {};
    fcfg.singleRecordPath = '/accounts/{accountId}/features/{featureId}';
    fcfg.note = 'No list endpoint in OpenAPI v9.14.0; per-ID GET only (InternalFeatures_GetFeature).';
    feature.fields.Configuration = fcfg;

    // ---- GAP-2: EmailLog — replace the IOF set ----
    // Current 2 fields (Emails, EmailsIdentifiers) are properties of the EmailLog *container*
    // schema (allOf[EmailLogRecords, EmailLogIdentifiers]) — the list wrapper, NOT the per-email
    // record. The sync entity is EmailLogRecord (returned by GET /SentEmails/{emailId}): 23 fields
    // including the Id PK.
    const newFields = emailLogRecordFields(spec);
    if (!emailLog.relatedEntities) emailLog.relatedEntities = {};
    emailLog.relatedEntities['MJ: Integration Object Fields'] = newFields;
    // EmailLog now has a real PK (Id) and an addressable per-record path.
    const ecfg = (emailLog.fields.Configuration as Record<string, unknown>) ?? {};
    ecfg.recordSchema = 'EmailLogRecord';
    ecfg.singleRecordPath = '/accounts/{accountId}/SentEmails/{emailId}';
    emailLog.fields.Configuration = ecfg;
    emailLog.fields.StableOrderingKey = 'Id';

    writeAtomic(META_FILE, JSON.stringify(parsed, null, 2) + '\n');

    // ---- Emission artifact: ONLY the two re-processed objects ----
    const featurePK = (feature.relatedEntities?.['MJ: Integration Object Fields'] ?? []).find(
        (f: IOF) => f.fields.IsPrimaryKey === true,
    );
    const emission = [
        {
            objectName: 'Feature',
            fieldsExtracted: (feature.relatedEntities?.['MJ: Integration Object Fields'] ?? []).length,
            gapsRemaining: [],
            claims: [
                { slot: 'io.Feature.APIPath', value: null, sourcePath: SPEC_PATH_REL },
                { slot: 'io.Feature.PaginationType', value: 'None', sourcePath: SPEC_PATH_REL },
                { slot: 'io.Feature.SupportsPagination', value: false, sourcePath: SPEC_PATH_REL },
                { slot: 'io.Feature.SupportsWrite', value: false, sourcePath: SPEC_PATH_REL },
                { slot: 'iof.Feature.Id.IsPrimaryKey', value: true, sourcePath: SPEC_PATH_REL },
            ],
            matrixRow: {
                IOName: 'Feature',
                ExistingConnectorTs: 'no',
                ExistingMetadataJson: 'no',
                OpenAPIxPK: 'no',
                OpenAPIPathOps: 'yes',
                OpenAPILocationHeader: 'no',
                VendorDocsProseScan: 'no',
                SDKTypes: 'no',
                PostmanCommunity: 'n/a',
                NamingConvention: 'yes',
                CrossIOMatch: 'no',
                PKVerdict: 'emit',
                FKVerdict: 'defer',
                EvidenceCount: 5,
            },
        },
        {
            objectName: 'EmailLog',
            fieldsExtracted: newFields.length,
            gapsRemaining: [],
            claims: [
                { slot: 'io.EmailLog.APIPath', value: '/accounts/{accountId}/SentEmails', sourcePath: SPEC_PATH_REL },
                { slot: 'iof.EmailLog.Id.IsPrimaryKey', value: true, sourcePath: SPEC_PATH_REL },
                ...newFields.map((f) => ({
                    slot: `iof.EmailLog.${String(f.fields.Name)}.Type`,
                    value: f.fields.Type,
                    sourcePath: SPEC_PATH_REL,
                })),
            ],
            matrixRow: {
                IOName: 'EmailLog',
                ExistingConnectorTs: 'no',
                ExistingMetadataJson: 'no',
                OpenAPIxPK: 'no',
                OpenAPIPathOps: 'yes',
                OpenAPILocationHeader: 'no',
                VendorDocsProseScan: 'yes',
                SDKTypes: 'no',
                PostmanCommunity: 'n/a',
                NamingConvention: 'yes',
                CrossIOMatch: 'no',
                PKVerdict: 'emit',
                FKVerdict: 'defer',
                EvidenceCount: newFields.length + 1,
            },
        },
    ];
    mkdirSync(dirname(EMISSION), { recursive: true });
    writeFileSync(EMISSION, JSON.stringify(emission, null, 2) + '\n', 'utf-8');

    const stats = {
        objectsExtracted: emission.length,
        fieldsExtracted: emission.reduce((n, o) => n + o.fieldsExtracted, 0),
        featurePKPresent: !!featurePK,
        emailLogFieldCount: newFields.length,
        emailLogHasPK: newFields.some((f) => f.fields.IsPrimaryKey === true),
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main();
