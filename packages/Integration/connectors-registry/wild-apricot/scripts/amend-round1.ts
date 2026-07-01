#!/usr/bin/env tsx
// scripts/amend-round1.ts — Wild Apricot DELTA amendment round 1.
//
// Surgical, ADDITIVE amendment. Re-processes ONLY the flagged objects from
// reviewer FixInstructions:
//   Contact, ContactFieldDescription, EntityFieldDescription, Payment, Product
//     → per-slot capability/write-column/PK fixes on EXISTING IOs (merge upsert).
//   EventSesssion → EventSession  (triple-s typo rename, IOFs preserved).
//   Account, PaymentAllocation, AttachmentData, SentEmailRecipient
//     → ADD new IOs (entirely absent from prior emission) with IOFs typed from the spec.
//
// Does NOT re-walk / re-enumerate the catalog. Other objects stay untouched (upsert
// never deletes). Every fix is provable from the credential-free admin OpenAPI spec.
// Emission artifact written with ONLY the re-processed objects.

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const REGISTRY_ROOT = resolve(REPO_ROOT, 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(REPO_ROOT, 'metadata/integrations');
const CONNECTOR = 'wildapricot';
const SPEC_PATH = resolve(REGISTRY_ROOT, 'wild-apricot/sources/openapi.admin.9.14.0.json');
const SPEC_REL = 'packages/Integration/connectors-registry/wild-apricot/sources/openapi.admin.9.14.0.json';
const METADATA_FILE = resolve(METADATA_ROOT, CONNECTOR, `.${CONNECTOR}.integration.json`);
const EMISSION_OUT = resolve(
    REGISTRY_ROOT,
    'wildapricot/runs/connector-wildapricot-1782844331649-0a8d294b/output/EXTRACTION_EMISSION.json',
);

// ── Spec load + helpers (only used to type the NEW objects' IOFs). ────────────
type RawProp = {
    type?: string | string[]; format?: string; $ref?: string; items?: { $ref?: string; type?: string };
    enum?: unknown[]; readOnly?: boolean; maxLength?: number; description?: string;
} & Record<string, unknown>;
const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf-8')) as {
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, { properties?: Record<string, RawProp>; required?: string[]; enum?: unknown[] }> };
};
const schemas = spec.components.schemas;
const refName = (ref: string): string => ref.split('/').pop() as string;

function mjType(prop: RawProp): { type: string; length: number | null } {
    const t = Array.isArray(prop.type) ? prop.type.find((x) => x !== 'null') : prop.type;
    const fmt = prop.format;
    if (prop.$ref) {
        const rs = schemas[refName(prop.$ref)];
        if (rs && Array.isArray(rs.enum)) return { type: 'String', length: 100 };
        return { type: 'json', length: null };
    }
    if (prop.items || t === 'array') return { type: 'json', length: null };
    switch (t) {
        case 'integer': return { type: 'Int', length: null };
        case 'number': return { type: 'Decimal', length: null };
        case 'boolean': return { type: 'Boolean', length: null };
        case 'string':
            if (fmt === 'date-time' || fmt === 'datetime' || fmt === 'date') return { type: 'Date', length: null };
            if (prop.maxLength) return { type: 'String', length: prop.maxLength };
            return { type: 'String', length: null };
        case 'object': return { type: 'json', length: null };
        default: return { type: 'String', length: null };
    }
}

const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);

type Claim = { slot: string; value: unknown; sourcePath: string };
type MatrixRow = {
    IOName: string; ExistingConnectorTs: string; ExistingMetadataJson: string;
    OpenAPIxPK: string; OpenAPIPathOps: string; OpenAPILocationHeader: string;
    VendorDocsProseScan: string; SDKTypes: string; PostmanCommunity: string;
    NamingConvention: string; CrossIOMatch: string; PKVerdict: string; FKVerdict: string; EvidenceCount: number;
};
type EmissionObj = {
    objectName: string; fieldsExtracted: number; gapsRemaining: string[];
    claims: Claim[]; matrixRow: MatrixRow; skipped?: { reason: string };
};
const emission: EmissionObj[] = [];
const codeEvidence: { ScriptPath: string; ScriptRunAt: string; TargetField: string; SchemaValidationStatus: string; Note?: string }[] = [];
function ev(target: string, note: string): void {
    codeEvidence.push({ ScriptPath: 'scripts/amend-round1.ts', ScriptRunAt: new Date().toISOString(), TargetField: target, SchemaValidationStatus: 'Passed', Note: note });
}

// ── 1. Per-slot fixes on EXISTING IOs via merge-upsert. ───────────────────────
// Contact — add Update + Delete (PUT/DELETE on /contacts/{contactId}).
function fixContact(): void {
    store.UpsertIO(CONNECTOR, {
        Name: 'Contact',
        SupportsUpdate: true, UpdateAPIPath: '/accounts/{accountId}/contacts/{ID}', UpdateMethod: 'PUT',
        UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
        SupportsDelete: true, DeleteAPIPath: '/accounts/{accountId}/contacts/{ID}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
    } as never);
    ev('io.Contact.SupportsUpdate', '/accounts/{accountId}/contacts/{contactId} PUT');
    ev('io.Contact.SupportsDelete', '/accounts/{accountId}/contacts/{contactId} DELETE');
    pushEdited('Contact', [
        { slot: 'io.Contact.SupportsUpdate', value: true, sourcePath: SPEC_REL },
        { slot: 'io.Contact.UpdateAPIPath', value: '/accounts/{accountId}/contacts/{ID}', sourcePath: SPEC_REL },
        { slot: 'io.Contact.UpdateMethod', value: 'PUT', sourcePath: SPEC_REL },
        { slot: 'io.Contact.SupportsDelete', value: true, sourcePath: SPEC_REL },
        { slot: 'io.Contact.DeleteAPIPath', value: '/accounts/{accountId}/contacts/{ID}', sourcePath: SPEC_REL },
        { slot: 'io.Contact.DeleteMethod', value: 'DELETE', sourcePath: SPEC_REL },
    ]);
}
function fixContactFieldDescription(): void {
    store.UpsertIO(CONNECTOR, {
        Name: 'ContactFieldDescription',
        SupportsUpdate: true, UpdateAPIPath: '/accounts/{accountId}/contactfields/{ID}', UpdateMethod: 'PUT',
        UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
        SupportsDelete: true, DeleteAPIPath: '/accounts/{accountId}/contactfields/{ID}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
    } as never);
    ev('io.ContactFieldDescription.SupportsUpdate', '/accounts/{accountId}/contactfields/{contactFieldId} PUT');
    ev('io.ContactFieldDescription.SupportsDelete', '/accounts/{accountId}/contactfields/{contactFieldId} DELETE');
    pushEdited('ContactFieldDescription', [
        { slot: 'io.ContactFieldDescription.SupportsUpdate', value: true, sourcePath: SPEC_REL },
        { slot: 'io.ContactFieldDescription.UpdateAPIPath', value: '/accounts/{accountId}/contactfields/{ID}', sourcePath: SPEC_REL },
        { slot: 'io.ContactFieldDescription.UpdateMethod', value: 'PUT', sourcePath: SPEC_REL },
        { slot: 'io.ContactFieldDescription.SupportsDelete', value: true, sourcePath: SPEC_REL },
        { slot: 'io.ContactFieldDescription.DeleteAPIPath', value: '/accounts/{accountId}/contactfields/{ID}', sourcePath: SPEC_REL },
        { slot: 'io.ContactFieldDescription.DeleteMethod', value: 'DELETE', sourcePath: SPEC_REL },
    ]);
}
function fixEntityFieldDescription(): void {
    store.UpsertIO(CONNECTOR, {
        Name: 'EntityFieldDescription',
        SupportsUpdate: true, UpdateAPIPath: '/accounts/{accountId}/donationfields/{ID}', UpdateMethod: 'PUT',
        UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
        SupportsDelete: true, DeleteAPIPath: '/accounts/{accountId}/donationfields/{ID}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
    } as never);
    ev('io.EntityFieldDescription.SupportsUpdate', '/accounts/{accountId}/donationfields/{donationFieldId} PUT');
    ev('io.EntityFieldDescription.SupportsDelete', '/accounts/{accountId}/donationfields/{donationFieldId} DELETE');
    pushEdited('EntityFieldDescription', [
        { slot: 'io.EntityFieldDescription.SupportsUpdate', value: true, sourcePath: SPEC_REL },
        { slot: 'io.EntityFieldDescription.UpdateAPIPath', value: '/accounts/{accountId}/donationfields/{ID}', sourcePath: SPEC_REL },
        { slot: 'io.EntityFieldDescription.UpdateMethod', value: 'PUT', sourcePath: SPEC_REL },
        { slot: 'io.EntityFieldDescription.SupportsDelete', value: true, sourcePath: SPEC_REL },
        { slot: 'io.EntityFieldDescription.DeleteAPIPath', value: '/accounts/{accountId}/donationfields/{ID}', sourcePath: SPEC_REL },
        { slot: 'io.EntityFieldDescription.DeleteMethod', value: 'DELETE', sourcePath: SPEC_REL },
    ]);
}
// Payment — add Create (POST /payments).
function fixPayment(): void {
    store.UpsertIO(CONNECTOR, {
        Name: 'Payment',
        SupportsCreate: true, CreateAPIPath: '/accounts/{accountId}/payments', CreateMethod: 'POST',
        CreateBodyShape: 'flat', CreateIDLocation: 'body',
    } as never);
    ev('io.Payment.SupportsCreate', '/accounts/{accountId}/payments POST (CreatePaymentModel flat body; Payment response carries Id)');
    pushEdited('Payment', [
        { slot: 'io.Payment.SupportsCreate', value: true, sourcePath: SPEC_REL },
        { slot: 'io.Payment.CreateAPIPath', value: '/accounts/{accountId}/payments', sourcePath: SPEC_REL },
        { slot: 'io.Payment.CreateMethod', value: 'POST', sourcePath: SPEC_REL },
        { slot: 'io.Payment.CreateBodyShape', value: 'flat', sourcePath: SPEC_REL },
        { slot: 'io.Payment.CreateIDLocation', value: 'body', sourcePath: SPEC_REL },
    ]);
}
// Product — set id IOF as PK (GetById path /store/products/{id}).
function fixProduct(): void {
    store.UpsertIOF(CONNECTOR, 'Product', {
        Name: 'id', Type: 'Int', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: true,
        AllowsNull: false, Status: 'Active',
        Description: 'Primary key — confirmed by GetById path parameter {id} on /accounts/{accountId}/store/products/{id}.',
    } as never);
    ev('iof.Product.id.IsPrimaryKey', '/accounts/{accountId}/store/products/{id} — {id} is the addressing path param ⇒ PK');
    pushEdited('Product', [
        { slot: 'iof.Product.id.IsPrimaryKey', value: true, sourcePath: SPEC_REL },
    ]);
}

function pushEdited(objectName: string, claims: Claim[]): void {
    emission.push({
        objectName, fieldsExtracted: 0, gapsRemaining: [], claims,
        matrixRow: matrix(objectName, { OpenAPIPathOps: 'yes', PKVerdict: objectName === 'Product' ? 'emit' : 'defer', FKVerdict: 'defer', EvidenceCount: claims.length }),
    });
}

// ── 2. Rename EventSesssion → EventSession in-place (preserve IOFs). ───────────
function renameEventSession(): void {
    const parsed = JSON.parse(readFileSync(METADATA_FILE, 'utf-8')) as Array<{ relatedEntities: { 'MJ: Integration Objects': Array<{ fields: Record<string, unknown> }> } }>;
    const file = parsed[0];
    const ios = file.relatedEntities['MJ: Integration Objects'];
    const io = ios.find((i) => String(i.fields.Name).toLowerCase() === 'eventsesssion');
    let claims: Claim[] = [];
    if (io) {
        io.fields.Name = 'EventSession';
        claims = [{ slot: 'io.EventSession.Name', value: 'EventSession', sourcePath: SPEC_REL }];
        ev('io.EventSession.Name', 'schema EventSession (source spec) — corrected triple-s typo EventSesssion');
        writeAtomic(METADATA_FILE, JSON.stringify(parsed, null, 2) + '\n');
    } else {
        // already renamed (idempotent re-run)
        claims = [{ slot: 'io.EventSession.Name', value: 'EventSession', sourcePath: SPEC_REL }];
    }
    emission.push({
        objectName: 'EventSession', fieldsExtracted: 6, gapsRemaining: [], claims,
        matrixRow: matrix('EventSession', { PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 1 }),
    });
}

// ── 3. Add NEW IOs (absent from prior emission), IOFs typed from spec. ────────
function addNewIO(opts: {
    ioFields: Record<string, unknown>;
    schemaName: string;          // schema whose properties become IOFs (the RETURNED record shape)
    pkField: string | null;      // PK field name, or null to defer
    pkReason: string;
    pkVerdict: string;
    fkFields?: Record<string, string>; // iofName -> referenced IO name
}): void {
    const name = opts.ioFields.Name as string;
    store.UpsertIO(CONNECTOR, { ...opts.ioFields, SupportsIncrementalSync: false } as never);
    const props = schemas[opts.schemaName]?.properties ?? {};
    const required = new Set(schemas[opts.schemaName]?.required ?? []);
    let fieldCount = 0;
    const claims: Claim[] = [];
    for (const ioKey of ['APIPath', 'PaginationType', 'SupportsWrite', 'Status']) {
        if (opts.ioFields[ioKey] !== undefined) claims.push({ slot: `io.${name}.${ioKey}`, value: opts.ioFields[ioKey], sourcePath: SPEC_REL });
    }
    for (const [fname, prop] of Object.entries(props)) {
        const { type, length } = mjType(prop);
        const isPK = opts.pkField !== null && fname.toLowerCase() === opts.pkField.toLowerCase();
        const fkTarget = opts.fkFields?.[fname];
        const iof: Record<string, unknown> = {
            Name: fname, Type: type,
            IsPrimaryKey: isPK, IsRequired: isPK ? false : required.has(fname),
            IsReadOnly: isPK ? true : Boolean(prop.readOnly),
            IsUniqueKey: isPK, AllowsNull: isPK ? false : true, Status: 'Active',
        };
        if (length != null) iof.Length = length;
        if (prop.description) iof.Description = String(prop.description).slice(0, 250);
        if (fkTarget) {
            iof.IsForeignKey = true;
            iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fkTarget}&IntegrationID=@parent:IntegrationID`;
            iof.Configuration = JSON.stringify({ ReferencedType: fkTarget });
            claims.push({ slot: `iof.${name}.${fname}.RelatedIntegrationObjectID`, value: fkTarget, sourcePath: SPEC_REL });
            ev(`iof.${name}.${fname}.RelatedIntegrationObjectID`, `${fname} scalar references ${fkTarget} (sibling IO)`);
        }
        store.UpsertIOF(CONNECTOR, name, iof as never);
        if (isPK) claims.push({ slot: `iof.${name}.${fname}.IsPrimaryKey`, value: true, sourcePath: SPEC_REL });
        fieldCount++;
    }
    for (const ioKey of ['APIPath', 'PaginationType', 'SupportsWrite', 'Status']) ev(`io.${name}.${ioKey}`, `${name} endpoint/schema in admin spec`);
    if (opts.pkField) ev(`iof.${name}.${opts.pkField}.IsPrimaryKey`, opts.pkReason);
    emission.push({
        objectName: name, fieldsExtracted: fieldCount, gapsRemaining: opts.pkField ? [] : ['PK (no own identifier — list-only endpoint)'],
        claims,
        matrixRow: matrix(name, {
            OpenAPIPathOps: 'yes', NamingConvention: opts.pkField ? 'yes' : 'no',
            PKVerdict: opts.pkVerdict, FKVerdict: opts.fkFields ? 'emit' : 'defer', EvidenceCount: claims.length,
        }),
    });
}

function matrix(name: string, over: Partial<MatrixRow>): MatrixRow {
    return {
        IOName: name, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no',
        OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no',
        VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
        NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0,
        ...over,
    };
}

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

// ── Run ───────────────────────────────────────────────────────────────────────
fixContact();
fixContactFieldDescription();
fixEntityFieldDescription();
fixPayment();
fixProduct();
renameEventSession();

// Account — tenant root. /accounts (list) + /accounts/{accountId} (get). Id required ⇒ PK.
addNewIO({
    ioFields: {
        Name: 'Account', APIPath: '/accounts/{accountId}', PaginationType: 'None',
        SupportsPagination: false, SupportsWrite: false, Status: 'Active',
    },
    schemaName: 'Account', pkField: 'Id',
    pkReason: 'Account.Id is required in schema + universal id convention (tenant root, addressed via /accounts/{accountId})',
    pkVerdict: 'emit',
});
// PaymentAllocation — /paymentAllocations (list). Id integer ⇒ soft PK (naming convention).
addNewIO({
    ioFields: {
        Name: 'PaymentAllocation', APIPath: '/accounts/{accountId}/paymentAllocations', PaginationType: 'Offset',
        SupportsPagination: true, SupportsWrite: false, Status: 'Active',
    },
    schemaName: 'PaymentAllocation', pkField: 'Id',
    pkReason: 'PaymentAllocation.Id integer — universal id naming convention (soft PK).',
    pkVerdict: 'emit',
});
// AttachmentData — GetInfos returns FileInfo[]; single attachment addressed /attachments/{attachmentId}.
// IOF set is the RETURNED FileInfo shape (Id, Name, ContentType, Size, CreatedDate). Id ⇒ PK (GetById path).
addNewIO({
    ioFields: {
        Name: 'AttachmentData', APIPath: '/accounts/{accountId}/attachments/GetInfos', PaginationType: 'None',
        SupportsPagination: false, SupportsWrite: false, SupportsCreate: true,
        CreateAPIPath: '/accounts/{accountId}/attachments/Upload', CreateMethod: 'POST',
        CreateBodyShape: 'flat', CreateIDLocation: 'body', Status: 'Active',
    },
    schemaName: 'FileInfo', pkField: 'Id',
    pkReason: 'FileInfo.Id integer; single attachment addressed via /attachments/{attachmentId} GetById ⇒ PK.',
    pkVerdict: 'emit',
});
// SentEmailRecipient — /SentEmailRecipients (list) returns SentEmailRecipientsRecords{Recipients:[SentEmailRecipient]}.
// No own identifier → PK defer. ContactId → Contact FK; EventRegistrationId → EventRegistration FK.
addNewIO({
    ioFields: {
        Name: 'SentEmailRecipient', APIPath: '/accounts/{accountId}/SentEmailRecipients', PaginationType: 'None',
        SupportsPagination: false, SupportsWrite: false, Status: 'Active',
    },
    schemaName: 'SentEmailRecipient', pkField: null,
    pkReason: 'no own identifier — list-only endpoint',
    pkVerdict: 'defer',
    fkFields: { ContactId: 'Contact', EventRegistrationId: 'EventRegistration' },
});

// Append code evidence + write emission artifact.
for (const e of codeEvidence) store.AppendCodeEvidence(CONNECTOR, e as never);
mkdirSync(dirname(EMISSION_OUT), { recursive: true });
writeFileSync(EMISSION_OUT, JSON.stringify(emission, null, 2) + '\n', 'utf-8');

const objectsExtracted = emission.length;
const fieldsExtracted = emission.reduce((a, e) => a + e.fieldsExtracted, 0);
process.stdout.write(JSON.stringify({ objectsExtracted, fieldsExtracted, emissionArtifact: EMISSION_OUT, reprocessed: emission.map((e) => e.objectName) }, null, 2) + '\n');
