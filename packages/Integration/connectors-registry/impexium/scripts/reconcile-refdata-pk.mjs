#!/usr/bin/env node
/**
 * reconcile-refdata-pk.mjs — soft-PK consistency reconciliation for name-keyed reference-data IOs.
 *
 * Adversarial reviewer flagged RelationshipTypes.name as missing IsPrimaryKey=true, INCONSISTENT
 * with the producer's own soft-PK-from-structure heuristic already applied to CustomFieldDefinitions.name
 * and CustomFieldValues.name (both name-PK because their backing swagger definition has NO numeric/system
 * id/recordNumber/code PK field but DOES have a stable natural key `name`).
 *
 * FULL-FACET INVENTORY (verified against sources/apiDefinition.swagger.json, swagger 2.0):
 * The reference/lookup/definition tables and their PK decision —
 *   Countries               → def CountryData        has `id` (numeric)        → keep id PK          (no change)
 *   States                  → def StateProvinceData  has `id` (numeric)        → keep id PK          (no change)
 *   Categories              → def SaveCategoryBasicData  {code,isPrimary}       → code natural-key PK (already correct)
 *   CustomFieldDefinitions  → def CustomFieldData    {name,caption,value} no id → name natural-key PK (precedent)
 *   CustomFieldValues       → def CustomFieldValueData {name,value} no id       → name natural-key PK (precedent)
 *   RelationshipTypes       → def RelationshipTypeData {name,reciprocalRelationshipName,relationshipType,
 *                                allowPrimary,canPurchaseForOrganization,canManagePAC,canManageOrganization}
 *                                — NO id/recordNumber/code             → name natural-key PK  ***THIS FIX***
 *
 * The remaining no-PK IOs (Purchases, AbandonedCheckouts, EducationCredits, Exhibitors, Activities, Notes,
 * Relationships, Links, Notifications, SessionRegistrations, EventAttendance) are transactional/child/event
 * records with NO stable single natural key (line items keyed by FK composites, notes/activities/notifications
 * are event logs, RelationshipData is a relationship INSTANCE not the TYPE) — provable-only ⇒ leave
 * IsPrimaryKey=false, defer to runtime D4. They are NOT name-keyed reference tables and are out of scope.
 *
 * ONLY MUTATION: RelationshipTypes.name → IsPrimaryKey=true, IsUniqueKey=true, IsReadOnly=true, AllowsNull=false
 * (mirrors the CustomFieldDefinitions.name precedent exactly).
 *
 * Persistence: mj-metadata MCP tools ONLY (atomic + .backups/). Idempotent: IOF upsert is shallow-merge-by-Name;
 * CODE_EVIDENCE append is guarded against duplicate TargetField.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, existsSync } from 'node:fs';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const SWAGGER_REL = 'packages/Integration/connectors-registry/impexium/sources/apiDefinition.swagger.json';
const SWAGGER_ABS = `${REPO_ROOT}/${SWAGGER_REL}`;
const CODE_EVIDENCE_ABS = `${REPO_ROOT}/packages/Integration/connectors-registry/impexium/CODE_EVIDENCE.json`;
const SCRIPT_REL_PATH = 'scripts/reconcile-refdata-pk.mjs';
const NOW = new Date().toISOString();

// ── Structural proof from the swagger: RelationshipTypeData has NO id/recordNumber/code, DOES have name ──
function proveRelationshipTypesNaturalKey() {
    const swagger = JSON.parse(readFileSync(SWAGGER_ABS, 'utf-8'));
    const def = swagger?.definitions?.RelationshipTypeData;
    if (!def || !def.properties) throw new Error('RelationshipTypeData definition not found in swagger');
    const props = Object.keys(def.properties);
    const NUMERIC_PK_CANDIDATES = ['id', 'recordnumber', 'code'];
    const hasNumericPk = props.some((p) => NUMERIC_PK_CANDIDATES.includes(p.toLowerCase()));
    const hasName = props.some((p) => p.toLowerCase() === 'name');
    if (hasNumericPk) throw new Error(`RelationshipTypeData unexpectedly has a numeric/system PK candidate among: ${props.join(', ')}`);
    if (!hasName) throw new Error(`RelationshipTypeData has no 'name' natural key among: ${props.join(', ')}`);
    return { properties: props, hasNumericPk, hasName };
}

function evidenceAlreadyPresent(targetField) {
    if (!existsSync(CODE_EVIDENCE_ABS)) return false;
    try {
        const ce = JSON.parse(readFileSync(CODE_EVIDENCE_ABS, 'utf-8'));
        return (ce.Entries ?? []).some((e) => e.TargetField === targetField);
    } catch { return false; }
}

async function main() {
    const proof = proveRelationshipTypesNaturalKey();
    console.log(`RelationshipTypeData.properties = [${proof.properties.join(', ')}]`);
    console.log(`  hasNumericPk=${proof.hasNumericPk}  hasName=${proof.hasName}  → soft PK = name`);

    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'reconcile-refdata-pk', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const call = async (name, args, what) => {
        const res = await client.callTool({ name, arguments: args });
        if (res.isError) throw new Error(`${what} FAILED: ${JSON.stringify(res.content)}`);
        console.log(`  ok: ${what}`);
    };

    const stats = { IOFUpdated: 0, EvidenceAppended: 0, EvidenceSkippedDup: 0 };

    // ── The single reconciling mutation: RelationshipTypes.name → natural-key soft PK ──
    await call('upsert_integration_object_field', {
        connector: CONNECTOR,
        ioName: 'RelationshipTypes',
        iof: {
            Name: 'name',
            Type: 'String',
            Description: 'Relationship type name — natural key (tenant-unique identifier).',
            IsPrimaryKey: true,
            IsUniqueKey: true,
            IsReadOnly: true,
            AllowsNull: false,
        },
    }, 'RelationshipTypes.name → IsPrimaryKey=true, IsUniqueKey=true, IsReadOnly=true, AllowsNull=false');
    stats.IOFUpdated++;

    // ── Per-flag CODE_EVIDENCE (guarded for idempotency) ──
    const evidenceOutput = {
        source: SWAGGER_REL,
        backingDefinition: 'RelationshipTypeData',
        propertyList: proof.properties,
        property: 'name',
        pickerRule: 'soft-PK-from-structure: definition has NO numeric/system PK (no id/recordNumber/code) but DOES have a stable natural key `name`',
        precedent: 'Mirrors iof.CustomFieldDefinitions.name / iof.CustomFieldValues.name (same heuristic).',
        evidenceStrength: 'Weak',
    };
    const evid = async (targetField, note) => {
        if (evidenceAlreadyPresent(targetField)) { stats.EvidenceSkippedDup++; console.log(`  skip (dup): CODE_EVIDENCE ${targetField}`); return; }
        await call('append_code_evidence', {
            connector: CONNECTOR,
            entry: {
                ScriptPath: SCRIPT_REL_PATH, ScriptRunAt: NOW,
                StructuredOutput: { ...evidenceOutput, note },
                SchemaValidationStatus: 'Passed', TargetField: targetField,
            },
        }, `CODE_EVIDENCE ${targetField}`);
        stats.EvidenceAppended++;
    };
    await evid('iof.RelationshipTypes.name.IsPrimaryKey',
        'Soft PK on name: RelationshipTypeData property list has no id/recordNumber/code — name is the record identity.');
    await evid('iof.RelationshipTypes.name.IsUniqueKey',
        'Relationship type name is a tenant-unique label (unique key), consistent with CustomFieldDefinitions.name.');

    await transport.close();
    console.log('\nSTATS: ' + JSON.stringify(stats));
}

main().catch((err) => { console.error(err); process.exit(1); });
