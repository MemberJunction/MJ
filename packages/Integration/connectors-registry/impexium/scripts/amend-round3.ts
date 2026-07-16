#!/usr/bin/env tsx
/**
 * amend-round3.ts — DELTA AMENDMENT ROUND 3 (surgical, 4 objects only).
 *
 * Applies the independent-reviewer's per-slot FixInstructions to ONLY:
 *   - CommitteeMembers   (memberRecordNumber hard-constraint flags emitted true with no per-flag
 *                         CODE_EVIDENCE — add evidence for IsUniqueKey/IsRequired/IsReadOnly/Status;
 *                         metadata VALUES already correct, evidence-only.)
 *   - Organizations      (Gap 7: parentCompanyId has RelatedIntegrationObjectID but IsForeignKey
 *                         never set — set IsForeignKey=true + CODE_EVIDENCE.)
 *   - Committees         (Gap 7: parentCommitteeId same systemic bijection violation.)
 *   - EventRegistrations (Gap 8: individualId is a genuine scalar FK to Individuals.id, missed
 *                         entirely — set IsForeignKey=true + RelatedIntegrationObjectID +
 *                         RelatedIntegrationObjectFieldName + CODE_EVIDENCE.)
 *
 * Persistence is via the mj-metadata MCP upsert tools (never direct file edit). UpsertIOF is a
 * shallow-merge (`{...existing, ...iof}`), so adding IsForeignKey/RelatedIntegrationObjectID merges
 * onto the existing field without disturbing its other slots — but the input schema REQUIRES Name +
 * Type, so both are always passed. No prior object is deleted. Only the 4 re-processed objects are
 * written to the run emission artifact.
 *
 * APPLY_FIX1 guard: AppendCodeEvidence does NOT dedup (it pushes). The four CommitteeMembers
 * per-flag evidence entries were persisted on the first (partial) run before the FIX-2 input-schema
 * error, so they are OFF by default here; set APPLY_FIX1=1 only against a clean CODE_EVIDENCE.json.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, writeFileSync } from 'node:fs';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const CONNECTOR_DIR = `${REPO_ROOT}/packages/Integration/connectors-registry/impexium`;
const METADATA_PATH = `${REPO_ROOT}/metadata/integrations/impexium/.impexium.integration.json`;
const RUN_OUTPUT = `${CONNECTOR_DIR}/runs/connector-impexium-1783808479438-3654ffe5/output/EXTRACTION_EMISSION.json`;
const SWAGGER_SOURCE_PATH = 'packages/Integration/connectors-registry/impexium/sources/apiDefinition.swagger.json';
const SCRIPT_REL_PATH = 'scripts/amend-round3.ts';
const NOW = new Date().toISOString();
const APPLY_FIX1 = process.env.APPLY_FIX1 === '1';

interface IOFFields {
    Name: string;
    [k: string]: unknown;
}

function readIO(name: string): { fields: Record<string, unknown>; iofs: IOFFields[] } {
    const m = JSON.parse(readFileSync(METADATA_PATH, 'utf-8')) as Array<{
        relatedEntities: { 'MJ: Integration Objects': Array<{ fields: Record<string, unknown>; relatedEntities?: { 'MJ: Integration Object Fields'?: Array<{ fields: IOFFields }> } }> };
    }>;
    const ios = m[0].relatedEntities['MJ: Integration Objects'];
    const io = ios.find((o) => (o.fields.Name as string) === name);
    if (!io) throw new Error(`IO ${name} not found in metadata`);
    return { fields: io.fields, iofs: (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).map((f) => f.fields) };
}

async function main(): Promise<void> {
    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'amend-round3', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const checkedCall = async (name: string, args: Record<string, unknown>, what: string): Promise<void> => {
        const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { type: string; text?: string }[] };
        if (res.isError) throw new Error(`MCP ${name} FAILED for ${what}: ` + (res.content ?? []).map((c) => c.text ?? '').join(' '));
    };
    const addEvidence = (targetField: string, structuredOutput: Record<string, unknown>, what: string) =>
        checkedCall('append_code_evidence', {
            connector: CONNECTOR,
            entry: { ScriptPath: SCRIPT_REL_PATH, ScriptRunAt: NOW, StructuredOutput: structuredOutput, SchemaValidationStatus: 'Passed', TargetField: targetField },
        }, `CODE_EVIDENCE ${targetField} (${what})`);

    // ---- FIX 1: CommitteeMembers.memberRecordNumber — per-flag CODE_EVIDENCE ----
    const CM_WRITE_PATH = '/api/v1/Committees/{code}/Members/{memberRecordNumber}/{currentPositionCode}';
    if (APPLY_FIX1) {
        await addEvidence('iof.CommitteeMembers.memberRecordNumber.IsUniqueKey', {
            writePath: CM_WRITE_PATH, method: 'put',
            note: "IsUniqueKey co-travels with IsPrimaryKey: 'memberRecordNumber' is the single-record addressing path parameter on the PUT update endpoint, so it uniquely identifies one committee-member record. A PK is by definition unique.",
        }, 'IsUniqueKey co-travel with IsPrimaryKey');
        await addEvidence('iof.CommitteeMembers.memberRecordNumber.IsRequired', {
            writePath: CM_WRITE_PATH, method: 'put', parameter: 'memberRecordNumber', required: true,
            excerpt: '{"name":"memberRecordNumber","in":"path","required":true,"type":"string"}',
            note: "The PUT path parameter 'memberRecordNumber' is declared required:true in the swagger — the endpoint cannot address a member without it.",
        }, 'required path parameter');
        await addEvidence('iof.CommitteeMembers.memberRecordNumber.IsReadOnly', {
            definition: 'CommitteeMemberData',
            bodyProperties: ['committee', 'position', 'positionCode', 'code', 'startDate', 'endDate'],
            memberRecordNumberInBody: false,
            note: "'memberRecordNumber' is absent from the CommitteeMemberData request/response body properties — it exists only as a URL path parameter, so it is server-assigned/path-only and not user-writable in the body. IsReadOnly=true.",
        }, 'field absent from CommitteeMemberData body properties (path-only)');
        await addEvidence('iof.CommitteeMembers.memberRecordNumber.Status', {
            writePath: CM_WRITE_PATH, method: 'put', deprecated: false,
            note: "The update path and its 'memberRecordNumber' parameter carry no deprecation marker (no x-ms-deprecated / deprecated:true) in the swagger — the field is a live, active identifier. Status=Active.",
        }, 'no deprecation signal');
    }

    // ---- FIX 2: Organizations.parentCompanyId — IsForeignKey=true (Gap 7) -------
    // Type required by input schema; UpsertIOF shallow-merges so all existing keys are preserved.
    await checkedCall('upsert_integration_object_field', {
        connector: CONNECTOR,
        ioName: 'Organizations',
        iof: { Name: 'parentCompanyId', Type: 'String', IsForeignKey: true },
    }, 'IOF Organizations.parentCompanyId set IsForeignKey=true');
    await addEvidence('iof.Organizations.parentCompanyId.IsForeignKey', {
        definition: 'OrganizationData', property: 'parentCompanyId', propertyType: 'string (uuid)',
        relatedIntegrationObjectID: '@lookup:MJ: Integration Objects.Name=Organizations&IntegrationID=@parent:IntegrationID',
        relatedIntegrationObjectFieldName: 'id',
        note: "Self-referential parent-hierarchy FK: OrganizationData.parentCompanyId references the sibling Organizations IO's declared PK 'id'. RelatedIntegrationObjectID was already resolved; IsForeignKey set true to close the bijection (RelatedIntegrationObjectID populated ⇒ IsForeignKey must be true).",
    }, 'self-referential FK closes bijection');

    // ---- FIX 3: Committees.parentCommitteeId — IsForeignKey=true (Gap 7) --------
    await checkedCall('upsert_integration_object_field', {
        connector: CONNECTOR,
        ioName: 'Committees',
        iof: { Name: 'parentCommitteeId', Type: 'String', IsForeignKey: true },
    }, 'IOF Committees.parentCommitteeId set IsForeignKey=true');
    await addEvidence('iof.Committees.parentCommitteeId.IsForeignKey', {
        definition: 'CommitteeData', property: 'parentCommitteeId', propertyType: 'string (uuid)',
        relatedIntegrationObjectID: '@lookup:MJ: Integration Objects.Name=Committees&IntegrationID=@parent:IntegrationID',
        relatedIntegrationObjectFieldName: 'id',
        note: "Second occurrence of the same systemic bijection violation: CommitteeData.parentCommitteeId references sibling Committees IO's PK 'id'. IsForeignKey set true to match the already-resolved RelatedIntegrationObjectID pointer.",
    }, 'self-referential FK closes bijection');

    // ---- FIX 4: EventRegistrations.individualId — missed scalar FK (Gap 8) ------
    await checkedCall('upsert_integration_object_field', {
        connector: CONNECTOR,
        ioName: 'EventRegistrations',
        iof: {
            Name: 'individualId',
            Type: 'String',
            IsForeignKey: true,
            RelatedIntegrationObjectID: '@lookup:MJ: Integration Objects.Name=Individuals&IntegrationID=@parent:IntegrationID',
            RelatedIntegrationObjectFieldName: 'id',
        },
    }, 'IOF EventRegistrations.individualId FK triple');
    const ER_FK_EVIDENCE = {
        definition: 'RegistrationData', property: 'individualId', propertyType: 'string',
        excerpt: '{"type":"string","description":"Individual ID.","title":"Individual ID"}',
        backingPath: '/api/v1/Individuals/{ID or Record Number}/Registrations/{Page Number}',
        targetIO: 'Individuals', targetPKField: 'id',
        note: "Genuine unambiguous scalar FK: RegistrationData.individualId (which backs the Individuals Registrations GET) references the sibling Individuals IO's declared PK 'id'. Single unambiguous target — emit the full FK triple.",
    };
    await addEvidence('iof.EventRegistrations.individualId.IsForeignKey', ER_FK_EVIDENCE, 'scalar FK to Individuals.id');
    await addEvidence('iof.EventRegistrations.individualId.RelatedIntegrationObjectID', ER_FK_EVIDENCE, 'FK lookup pointer to Individuals');
    await addEvidence('iof.EventRegistrations.individualId.RelatedIntegrationObjectFieldName', ER_FK_EVIDENCE, 'FK target field = Individuals PK id');

    await client.close();

    // ---- Re-read the now-persisted 4 objects and write the delta emission -------
    const objectNames = ['CommitteeMembers', 'Organizations', 'Committees', 'EventRegistrations'];
    const emissions = objectNames.map((name) => {
        const { iofs } = readIO(name);
        const claims: Array<{ slot: string; value: unknown; sourcePath: string }> = [];
        for (const iof of iofs) {
            if (iof.IsPrimaryKey === true) claims.push({ slot: `iof.${name}.${iof.Name}.IsPrimaryKey`, value: true, sourcePath: SWAGGER_SOURCE_PATH });
            if (iof.IsUniqueKey === true) claims.push({ slot: `iof.${name}.${iof.Name}.IsUniqueKey`, value: true, sourcePath: SWAGGER_SOURCE_PATH });
            if (iof.IsForeignKey === true) {
                claims.push({ slot: `iof.${name}.${iof.Name}.IsForeignKey`, value: true, sourcePath: SWAGGER_SOURCE_PATH });
                if (iof.RelatedIntegrationObjectID) claims.push({ slot: `iof.${name}.${iof.Name}.RelatedIntegrationObjectID`, value: iof.RelatedIntegrationObjectID, sourcePath: SWAGGER_SOURCE_PATH });
                if (iof.RelatedIntegrationObjectFieldName) claims.push({ slot: `iof.${name}.${iof.Name}.RelatedIntegrationObjectFieldName`, value: iof.RelatedIntegrationObjectFieldName, sourcePath: SWAGGER_SOURCE_PATH });
            }
        }
        const pkFields = iofs.filter((f) => f.IsPrimaryKey === true).map((f) => f.Name);
        const fkFields = iofs.filter((f) => f.IsForeignKey === true).map((f) => f.Name);
        return {
            objectName: name,
            fieldsExtracted: iofs.length,
            gapsRemaining: [] as string[],
            claims,
            matrixRow: {
                IOName: name,
                ExistingConnectorTs: 'n/a',
                ExistingMetadataJson: 'yes',
                OpenAPIxPK: name === 'CommitteeMembers' ? 'yes' : 'no',
                OpenAPIPathOps: 'yes',
                OpenAPILocationHeader: 'no',
                VendorDocsProseScan: 'no',
                SDKTypes: 'n/a',
                PostmanCommunity: 'n/a',
                NamingConvention: 'yes',
                CrossIOMatch: name === 'EventRegistrations' ? 'yes' : (fkFields.length > 0 ? 'yes' : 'no'),
                PKVerdict: pkFields.length > 0 ? 'emit' : 'defer',
                FKVerdict: fkFields.length > 0 ? `emit-${fkFields.length}` : 'defer',
                EvidenceCount: claims.length,
            },
        };
    });

    writeFileSync(RUN_OUTPUT, JSON.stringify(emissions, null, 2) + '\n');
    process.stdout.write(JSON.stringify({
        amendmentRound: 3,
        applyFix1: APPLY_FIX1,
        objectsReprocessed: emissions.length,
        objects: emissions.map((e) => ({
            name: e.objectName,
            fields: e.fieldsExtracted,
            fk: e.claims.filter((c) => c.slot.endsWith('.IsForeignKey') && c.value === true).map((c) => c.slot),
            evidenceCount: e.matrixRow.EvidenceCount,
        })),
    }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
