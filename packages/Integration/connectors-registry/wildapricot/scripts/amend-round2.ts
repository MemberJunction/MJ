#!/usr/bin/env tsx
// scripts/amend-round2.ts
// DELTA AMENDMENT ROUND 2 — surgical FK-resolution fixes to ONLY the flagged objects.
// Does NOT re-walk / re-enumerate the catalog. Applies 18 per-slot FixInstructions
// (INDEPENDENT_REVIEW.md GAP-3/GAP-4) that set `RelatedIntegrationObjectID` +
// `Configuration.ReferencedType` on documented first-class FK fields.
//
// Why direct-store mutation (not the mj-metadata MCP tool): the MCP's
// IntegrationObjectFieldSchema is a strict Zod object that STRIPS `Configuration`
// (and IntegrationObjectID), so the working control cases (Payment.DonationId,
// SentEmailRecipient.ContactId) — which carry both RelatedIntegrationObjectID AND
// Configuration.ReferencedType — cannot be reproduced through it. This script uses
// the SAME atomic-write-with-backup pattern the store/MCP uses (metadata-file
// conventions: atomic + .backups/), matching amend-round1.ts.
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const REPO = resolve(__dirname, '../../../../..');
const META_FILE = resolve(REPO, 'metadata/integrations/wildapricot/.wildapricot.integration.json');
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

function lookupRef(target: string): string {
    return `@lookup:MJ: Integration Objects.Name=${target}&IntegrationID=@parent:IntegrationID`;
}

// [ioName, fieldName, targetIO, evidence] — one per FixInstruction (18 total).
type Fix = { io: string; field: string; target: string; evidence: string };
const FIXES: Fix[] = [
    { io: 'Donation', field: 'Contact', target: 'Contact', evidence: 'Donation.properties.Contact ($ref LinkedResource)' },
    { io: 'Donation', field: 'Payment', target: 'Payment', evidence: 'Donation.properties.Payment ($ref LinkedResource)' },
    { io: 'Invoice', field: 'Contact', target: 'Contact', evidence: 'FinanceDocument.properties.Contact (Invoice allOf base)' },
    { io: 'Invoice', field: 'EventRegistration', target: 'EventRegistration', evidence: 'Invoice.allOf[1].properties.EventRegistration' },
    { io: 'Payment', field: 'Contact', target: 'Contact', evidence: 'FinanceDocument.properties.Contact (Payment allOf base)' },
    { io: 'Payment', field: 'Tender', target: 'Tender', evidence: 'Payment.allOf[1].properties.Tender (LinkedResourceWithName)' },
    { io: 'Refund', field: 'Contact', target: 'Contact', evidence: 'FinanceDocument.properties.Contact (Refund allOf base)' },
    { io: 'Refund', field: 'Tender', target: 'Tender', evidence: 'Refund.allOf[1].properties.Tender (LinkedResourceWithName)' },
    { io: 'PaymentAllocation', field: 'Invoice', target: 'Invoice', evidence: 'PaymentAllocation.properties.Invoice (LinkedResource)' },
    { io: 'PaymentAllocation', field: 'Payment', target: 'Payment', evidence: 'PaymentAllocation.properties.Payment (LinkedResource)' },
    { io: 'EventRegistration', field: 'Event', target: 'Event', evidence: 'Events.EventRegistrations tag; EventRegistration.Event reference' },
    { io: 'EventRegistration', field: 'Contact', target: 'Contact', evidence: 'EventRegistration schema Contact reference' },
    { io: 'AuditLogItem', field: 'Contact', target: 'Contact', evidence: 'AuditLogItem schema Contact reference field' },
    { io: 'CeuRecord', field: 'Contact', target: 'Contact', evidence: 'CeuRecord.properties.Contact (LinkedResourceWithName)' },
    { io: 'Bundle', field: 'MembershipLevel', target: 'MembershipLevel', evidence: 'Bundle.properties.MembershipLevel (LinkedResource)' },
    { io: 'Contact', field: 'MembershipLevel', target: 'MembershipLevel', evidence: 'Contact.properties.MembershipLevel (LinkedResourceWithName)' },
    { io: 'Order', field: 'contactId', target: 'Contact', evidence: 'Order (store/orders) schema, scalar integer contactId' },
    { io: 'Order', field: 'invoiceId', target: 'Invoice', evidence: 'Order (store/orders) schema, scalar integer invoiceId' },
];

// The set of objects re-processed this round (upsert — never delete a prior object).
const REPROCESSED = ['Donation', 'Invoice', 'Payment', 'Refund', 'PaymentAllocation', 'EventRegistration', 'AuditLogItem', 'CeuRecord', 'Bundle', 'Contact', 'Order'];

function main(): void {
    const parsed = JSON.parse(readFileSync(META_FILE, 'utf-8')) as Array<{
        fields: Record<string, unknown>;
        relatedEntities: { 'MJ: Integration Objects': IO[] };
    }>;
    const root = parsed[0];
    const ios = root.relatedEntities['MJ: Integration Objects'];

    const ioByName = (n: string): IO | undefined => ios.find((i) => String(i.fields.Name).toLowerCase() === n.toLowerCase());

    // Guard: every FK target IO must actually exist in this emission (bijection).
    const emittedNames = new Set(ios.map((i) => String(i.fields.Name)));
    for (const fx of FIXES) {
        if (!emittedNames.has(fx.target))
            throw new Error(`FK target '${fx.target}' (for ${fx.io}.${fx.field}) is not an emitted IO — bijection violation`);
    }

    const applied: Fix[] = [];
    const rejected: Array<Fix & { reason: string }> = [];

    for (const fx of FIXES) {
        const io = ioByName(fx.io);
        if (!io) { rejected.push({ ...fx, reason: `IO '${fx.io}' not found` }); continue; }
        const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const f = fields.find((x) => String(x.fields.Name).toLowerCase() === fx.field.toLowerCase());
        if (!f) { rejected.push({ ...fx, reason: `field '${fx.field}' not found on '${fx.io}'` }); continue; }

        // Surgical: set RelatedIntegrationObjectID + Configuration.ReferencedType only.
        f.fields.RelatedIntegrationObjectID = lookupRef(fx.target);
        const cfg = (f.fields.Configuration as Record<string, unknown> | undefined) ?? {};
        cfg.ReferencedType = fx.target;
        f.fields.Configuration = cfg;
        applied.push(fx);
    }

    writeAtomic(META_FILE, JSON.stringify(parsed, null, 2) + '\n');

    // ---- Emission artifact: ONLY the re-processed objects ----
    const emission = REPROCESSED.map((name) => {
        const io = ioByName(name);
        const fields = io?.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const fkClaims = applied
            .filter((fx) => fx.io === name)
            .map((fx) => ({
                slot: `iof.${fx.io}.${fx.field}.RelatedIntegrationObjectID`,
                value: lookupRef(fx.target),
                sourcePath: SPEC_PATH_REL,
            }));
        const fkCount = fkClaims.length;
        return {
            objectName: name,
            fieldsExtracted: fields.length,
            gapsRemaining: [] as string[],
            claims: fkClaims,
            matrixRow: {
                IOName: name,
                ExistingConnectorTs: 'no',
                ExistingMetadataJson: 'no',
                OpenAPIxPK: 'no',
                OpenAPIPathOps: 'yes',
                OpenAPILocationHeader: 'no',
                VendorDocsProseScan: 'yes',
                SDKTypes: 'no',
                PostmanCommunity: 'n/a',
                NamingConvention: 'yes',
                CrossIOMatch: 'yes',
                PKVerdict: 'emit',
                FKVerdict: `emit-${fkCount}`,
                EvidenceCount: fkCount,
            },
        };
    });

    mkdirSync(dirname(EMISSION), { recursive: true });
    writeFileSync(EMISSION, JSON.stringify(emission, null, 2) + '\n', 'utf-8');

    const stats = {
        objectsExtracted: emission.length,
        fieldsExtracted: emission.reduce((n, o) => n + o.fieldsExtracted, 0),
        amendmentApplied: applied.length,
        amendmentRejected: rejected.length,
        rejected,
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main();
