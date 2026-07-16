#!/usr/bin/env tsx
/**
 * fk-recovery-pass0.ts — MagnetMail connector, operator-approved FK recovery (pass 0).
 *
 * Surgical amendment: applies ONLY the operator-approved FixInstructions from the
 * Independent Review's §2.4 / §1.1 cross-IO FK-name-match findings. Does NOT
 * re-walk or re-enumerate the catalog (that re-derivation is item 14 below —
 * flagged for escalation, not performed here).
 *
 * Evidence base (credential-free): the saved WSDL
 * (packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml)
 * cross-checked against the current metadata's emitted sibling PKs (Recipient.id,
 * Message.message_id, group.group_id, MessageCategory.ID, GroupCategory.ID,
 * Registrant.ClientReferenceId).
 *
 * PROVABLE-ONLY GUARD: user_id / UserId / MailUserId fields are NOT wired as FKs.
 * The WSDL's `getUserDetails(user_id)` operation returns a SINGLE `User` (the
 * caller's own account profile via the mmAuthHeader session scope) — there is no
 * `getUsers` (list) operation anywhere in the WSDL, so `user_id` on Message /
 * MessageDetails / Unsubscribe / UploadInitialJob / EventSignUp is the
 * authenticated-account scope field copied from AuthenticationResult.user_id,
 * NOT a business reference to an enumerable "User" collection. Wiring it as an
 * FK would be the path-LMS / GrowthZone FK-over-guess trap. Left wired NOWHERE
 * (consistent across all 5 occurrences) and recorded in Configuration.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const REPO = '/Users/bcladmin/Projects/MemberJunction/MJ';
const CONNECTOR = 'magnetmail';
const META = resolve(REPO, 'metadata/integrations/magnetmail/.magnetmail.integration.json');
const WSDL = resolve(REPO, 'packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml');
const RUN_ID = `connector-magnetmail-fk-recovery-pass0-${Date.now()}`;
const EMISSION_OUT = resolve(REPO, `packages/Integration/connectors-registry/magnetmail/runs/${RUN_ID}/output/FK_RECOVERY_EMISSION.json`);
const SRC = 'packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml (WSDL XSD cross-IO PK-name match) + metadata/integrations/magnetmail/.magnetmail.integration.json (emitted sibling PKs)';

type IOFields = Record<string, unknown>;

// ── read current metadata (reference ONLY — all writes go through the MCP) ────
const file = JSON.parse(readFileSync(META, 'utf8')) as Array<{
    relatedEntities: { 'MJ: Integration Objects': Array<{ fields: IOFields; relatedEntities?: { 'MJ: Integration Object Fields': Array<{ fields: IOFields }> } }> };
}>;
const IOS = file[0].relatedEntities['MJ: Integration Objects'];
function currentIOFType(ioName: string, fieldName: string): string {
    const io = IOS.find(i => (i.fields.Name as string).toLowerCase() === ioName.toLowerCase());
    const iof = io?.relatedEntities?.['MJ: Integration Object Fields']?.find(f => (f.fields.Name as string) === fieldName);
    return (iof?.fields.Type as string) ?? 'string';
}
function currentIOFState(ioName: string, fieldName: string): IOFields | undefined {
    const io = IOS.find(i => (i.fields.Name as string).toLowerCase() === ioName.toLowerCase());
    return io?.relatedEntities?.['MJ: Integration Object Fields']?.find(f => (f.fields.Name as string) === fieldName)?.fields;
}
const wsdl = readFileSync(WSDL, 'utf8');

// ── FK wiring fixes to apply (Task A) ──────────────────────────────────────────
type FKFix = { io: string; field: string; targetIO: string; targetField: string; note: string };
const fkFixes: FKFix[] = [
    { io: 'Unsubscribe', field: 'RecipientId', targetIO: 'Recipient', targetField: 'id', note: '<ObjectName>Id pattern vs Recipient emitted PK' },
    { io: 'Unsubscribe', field: 'MessageId', targetIO: 'Message', targetField: 'message_id', note: '<ObjectName>Id pattern vs Message emitted PK' },
    { io: 'Unsubscribe', field: 'GroupId', targetIO: 'group', targetField: 'group_id', note: '<ObjectName>Id pattern vs group emitted PK' },
    { io: 'Unsubscribe', field: 'MessageCategoryId', targetIO: 'MessageCategory', targetField: 'ID', note: '<ObjectName>Id pattern vs MessageCategory emitted PK' },
    { io: 'Unsubscribe', field: 'GroupCategoryId', targetIO: 'GroupCategory', targetField: 'ID', note: '<ObjectName>Id pattern vs GroupCategory emitted PK' },
    { io: 'GroupRecipient', field: 'RecipientId', targetIO: 'Recipient', targetField: 'id', note: '<ObjectName>Id pattern vs Recipient emitted PK (named in round-1 FixInstructions, still open until now)' },
    { io: 'email_history', field: 'message_id', targetIO: 'Message', targetField: 'message_id', note: 'exact name match vs Message emitted PK (field is ALSO email_history\'s own emitted PK)' },
    { io: 'PaidItem', field: 'ClientReferenceId', targetIO: 'Registrant', targetField: 'ClientReferenceId', note: 'exact name match vs Registrant emitted PK; hedged confidence — likely a correlation key between sibling child arrays of the same EventSignUp request rather than strict parent/child' },
    { io: 'recp_unsubscribe', field: 'message_CategoryId', targetIO: 'MessageCategory', targetField: 'ID', note: 'casing-variant half-set field sharing the semantic already wired on Unsubscribe.MessageCategoryId' },
];

// ── user_id / UserId / MailUserId — SKIPPED per provable-only guard ────────────
type SkipFix = { io: string; field: string; wouldBeTargetIO: string; wouldBeTargetField: string };
const skipFixes: SkipFix[] = [
    { io: 'Message', field: 'user_id', wouldBeTargetIO: 'User', wouldBeTargetField: 'User_Id' },
    { io: 'MessageDetails', field: 'user_id', wouldBeTargetIO: 'User', wouldBeTargetField: 'User_Id' },
    { io: 'Unsubscribe', field: 'UserId', wouldBeTargetIO: 'User', wouldBeTargetField: 'User_Id' },
    { io: 'UploadInitialJob', field: 'UserId', wouldBeTargetIO: 'User', wouldBeTargetField: 'User_Id' },
    { io: 'EventSignUp', field: 'UserId', wouldBeTargetIO: 'User', wouldBeTargetField: 'User_Id' },
];
const SKIP_REASON = "user_id / UserId / MailUserId is the mmAuthHeader authenticated-account scope field (copied verbatim from AuthenticateResponse.AuthenticationResult.user_id and re-sent on every subsequent SOAP call's <mmAuthHeader>). The WSDL's only User-shaped read operation is getUserDetails(user_id) -> a SINGLE tns:User (the caller's OWN account profile) -- there is no getUsers (list) operation anywhere in the 55-operation WSDL. So this field is an auth-scope identifier, NOT a business reference to an enumerable User collection. Wiring it as RelatedIntegrationObjectID -> User would be the path-LMS / GrowthZone FK-over-guess trap (a field that merely resembles an FK pattern but has no target collection semantics). Left wired NOWHERE, consistently, across all 5 occurrences.";

async function main(): Promise<void> {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
        command: 'node',
        args: [resolve(REPO, 'packages/MCP/mj-metadata/dist/server.js')],
        env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: resolve(REPO, 'packages/Integration/connectors-registry'),
            MJ_METADATA_ROOT: resolve(REPO, 'metadata/integrations'),
            MJ_MCP_LOG: resolve(REPO, 'logs/mcp-trace.jsonl'),
        } as Record<string, string>,
    });
    const client = new Client({ name: 'fk-recovery-pass0', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const nowIso = new Date().toISOString();
    const applied: Array<{ io: string; field: string; targetIO: string; targetField: string; wasAlreadySet: boolean }> = [];
    const skipped: Array<{ io: string; field: string; reason: string }> = [];

    // ── Task A: apply the 9 FK wirings ─────────────────────────────────────────
    for (const fix of fkFixes) {
        const before = currentIOFState(fix.io, fix.field);
        const wasAlreadySet = before?.RelatedIntegrationObjectID != null;
        const relID = `@lookup:MJ: Integration Objects.Name=${fix.targetIO}&IntegrationID=@parent:IntegrationID`;
        const iofPayload: IOFields = {
            Name: fix.field,
            Type: currentIOFType(fix.io, fix.field),
            RelatedIntegrationObjectID: relID,
            RelatedIntegrationObjectFieldName: fix.targetField,
        };
        await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: CONNECTOR, ioName: fix.io, iof: iofPayload } });
        await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
            ScriptPath: 'scripts/fk-recovery-pass0.ts',
            ScriptRunAt: nowIso,
            StructuredOutput: {
                pass: 0, io: fix.io, field: fix.field,
                targetIO: fix.targetIO, targetField: fix.targetField,
                relatedIntegrationObjectID: relID,
                how: fix.note,
                strength: 'ImpliedFromExample',
                operatorApproved: true,
                wasAlreadySetBeforeThisRun: wasAlreadySet,
            },
            SchemaValidationStatus: 'Passed',
            TargetField: `iof.${fix.io}.${fix.field}.RelatedIntegrationObjectID`,
        } } });
        applied.push({ io: fix.io, field: fix.field, targetIO: fix.targetIO, targetField: fix.targetField, wasAlreadySet });
    }

    // ── Task A (negative): record the skip decision per field for auditability ──
    for (const s of skipFixes) {
        await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
            ScriptPath: 'scripts/fk-recovery-pass0.ts',
            ScriptRunAt: nowIso,
            StructuredOutput: {
                pass: 0, io: s.io, field: s.field, decision: 'skip-not-wired-as-fk',
                wouldBeTargetIO: s.wouldBeTargetIO, wouldBeTargetField: s.wouldBeTargetField,
                reason: SKIP_REASON,
                wsdlEvidence: 'getUserDetails(user_id) -> single tns:User; no getUsers list operation found in WSDL',
            },
            SchemaValidationStatus: 'Passed',
            TargetField: `iof.${s.io}.${s.field}.RelatedIntegrationObjectID`,
        } } });
        skipped.push({ io: s.io, field: s.field, reason: SKIP_REASON });
    }

    // ── Superseding CODE_EVIDENCE entry for stale JobToGroup.group_id.IsPrimaryKey ──
    await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
        ScriptPath: 'scripts/fk-recovery-pass0.ts',
        ScriptRunAt: nowIso,
        StructuredOutput: {
            pass: 0, supersedes: 'iof.JobToGroup.group_id.IsPrimaryKey (Weak, ScriptRunAt 2026-07-04T03:55:32.367Z and 2026-07-04T03:56:16.420Z)',
            correction: 'JobToGroup.group_id is FK-classified, not PK-classified. Current authoritative state: IsPrimaryKey=false, IsUniqueKey=false, RelatedIntegrationObjectID=@lookup:MJ: Integration Objects.Name=group&IntegrationID=@parent:IntegrationID (set in amend-round2, ScriptRunAt 2026-07-04T05:05:34.813Z). The prior Weak IsPrimaryKey claim is stale and superseded by the FK classification -- no MCP primitive exists to physically delete a CODE_EVIDENCE.json entry (append_code_evidence is append-only), so this entry records the supersession explicitly rather than deleting the stale one.',
            strength: 'ExplicitStatement',
        },
        SchemaValidationStatus: 'Passed',
        TargetField: 'iof.JobToGroup.group_id.IsPrimaryKey',
    } } });

    // ── Task B: record the recovery decisions in Integration.Configuration ──────
    // NOTE: unlike per-IO Configuration (stored as a JSON-encoded string), the root
    // Integration.Configuration in this file is stored as a nested JSON OBJECT
    // (IntegrationRootFieldsSchema allows record(string,unknown) values directly)
    // -- confirmed by reading the raw file. Do NOT JSON.parse/stringify it.
    const integrationRaw = await client.callTool({ name: 'read_integration', arguments: { connector: CONNECTOR } });
    const integrationText = (integrationRaw as { content: { type: string; text: string }[] }).content[0].text;
    const integration = JSON.parse(integrationText) as { fields: { Configuration?: Record<string, unknown> } };
    const cfg: Record<string, unknown> = integration.fields.Configuration ?? {};
    const additionalObservations = Array.isArray(cfg.AdditionalObservations) ? cfg.AdditionalObservations as unknown[] : [];
    const alreadyRecorded = additionalObservations.some((o) => typeof o === 'object' && o !== null && (o as Record<string, unknown>).Key === 'FKSkip.UserIdAuthScope');
    let configRecorded = alreadyRecorded;
    if (!alreadyRecorded) {
        additionalObservations.push({
            Key: 'FKSkip.UserIdAuthScope',
            Value: {
                fields: skipFixes.map(s => `${s.io}.${s.field}`),
                decision: 'Not wired as FK to User. Kept wired nowhere on all 5 occurrences, for consistency.',
                reason: SKIP_REASON,
            },
            Provenance: SRC,
        });
        cfg.AdditionalObservations = additionalObservations;
        await client.callTool({ name: 'upsert_integration_fields', arguments: { connector: CONNECTOR, fields: { Configuration: cfg } } });
        configRecorded = true;
    }
    // OutOfScopeObjectFamilies (sendEmailToIndividual / sendMessageToGroup) was already
    // recorded prior to this pass (verified via read_integration above) -- no write needed.
    const outOfScopeAlreadyPresent = Array.isArray(cfg.OutOfScopeObjectFamilies)
        && (cfg.OutOfScopeObjectFamilies as Array<{ Operation?: string }>).some(o => o.Operation === 'sendEmailToIndividual')
        && (cfg.OutOfScopeObjectFamilies as Array<{ Operation?: string }>).some(o => o.Operation === 'sendMessageToGroup');

    await client.close();

    // ── item 14: extractor script rework — NOT performed, escalated ────────────
    const escalated = {
        slot: 'extract-io-iof.ts:matrixRow.FKVerdict / CrossIOMatch',
        status: 'escalated-not-applied',
        reason: 'Requires reworking extract-io-iof.ts to implement a real aggregatePKFKSignals cross-IO matching pass (currently hardcodes FKVerdict=\'defer\'/CrossIOMatch=\'no\' for the other 37 of 45 IOs). This is a script code change, not a metadata slot -- out of scope for a surgical metadata-only MCP write pass. Flagged for a follow-up pass with a full re-walk.',
    };

    mkdirSync(dirname(EMISSION_OUT), { recursive: true });
    writeFileSync(EMISSION_OUT, JSON.stringify({ applied, skipped, configRecorded, outOfScopeAlreadyPresent, escalated }, null, 2));

    process.stdout.write(JSON.stringify({
        applied: applied.length,
        skipped: skipped.length,
        configRecorded,
        outOfScopeAlreadyPresent,
        escalated,
        skipReasons: skipped.map(s => `${s.io}.${s.field}: ${SKIP_REASON}`),
        appliedDetail: applied,
    }, null, 2) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
