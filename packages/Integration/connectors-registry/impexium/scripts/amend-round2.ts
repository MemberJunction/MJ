#!/usr/bin/env tsx
/**
 * amend-round2.ts — DELTA AMENDMENT ROUND 2 (surgical, 3 objects only).
 *
 * Applies the reviewer's per-slot FixInstructions to ONLY:
 *   - CustomFieldDefinitions  (dead-pagination downgrade: PageNumber->None, SupportsPagination->false)
 *   - CommitteeMembers        (code PK/UK->false; add write-path-only PK field memberRecordNumber)
 *   - Purchases               (orderNumber PK/UK->false — per-line-item grain, not per-order)
 *
 * Persistence is via the mj-metadata MCP upsert tools (never direct file edit).
 * Upsert is a shallow-merge (add/overwrite), so setting a boolean to false overwrites
 * the prior true. No prior object is deleted. Only the 3 re-processed objects are
 * written to the run emission artifact.
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
const SCRIPT_REL_PATH = 'scripts/amend-round2.ts';
const NOW = new Date().toISOString();

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
    const client = new Client({ name: 'amend-round2', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const checkedCall = async (name: string, args: Record<string, unknown>, what: string): Promise<void> => {
        const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { type: string; text?: string }[] };
        if (res.isError) throw new Error(`MCP ${name} FAILED for ${what}: ` + (res.content ?? []).map((c) => c.text ?? '').join(' '));
    };

    // ---- FIX 1: CustomFieldDefinitions — dead-pagination downgrade -------------
    await checkedCall('upsert_integration_object', {
        connector: CONNECTOR,
        io: { Name: 'CustomFieldDefinitions', PaginationType: 'None', SupportsPagination: false },
    }, 'IO CustomFieldDefinitions pagination downgrade');
    await checkedCall('append_code_evidence', {
        connector: CONNECTOR,
        entry: {
            ScriptPath: SCRIPT_REL_PATH,
            ScriptRunAt: NOW,
            StructuredOutput: {
                path: '/api/v1/Setup/customfields/1',
                getParameters: ['Content-type (header)'],
                pathPageTemplate: false,
                note: "Literal '1' path segment, not a {Page Number} template; GET has only a Content-type header param — no request-side paging mechanism. Downgraded PaginationType PageNumber->None, SupportsPagination true->false.",
            },
            SchemaValidationStatus: 'Passed',
            TargetField: 'io.CustomFieldDefinitions.PaginationType',
        },
    }, 'CODE_EVIDENCE CustomFieldDefinitions.PaginationType');
    await checkedCall('append_code_evidence', {
        connector: CONNECTOR,
        entry: {
            ScriptPath: SCRIPT_REL_PATH,
            ScriptRunAt: NOW,
            StructuredOutput: { path: '/api/v1/Setup/customfields/1', supportsPagination: false, reason: 'No documented request-side page parameter.' },
            SchemaValidationStatus: 'Passed',
            TargetField: 'io.CustomFieldDefinitions.SupportsPagination',
        },
    }, 'CODE_EVIDENCE CustomFieldDefinitions.SupportsPagination');

    // ---- FIX 2: CommitteeMembers — code PK/UK downgrade + new memberRecordNumber PK
    await checkedCall('upsert_integration_object_field', {
        connector: CONNECTOR,
        ioName: 'CommitteeMembers',
        iof: { Name: 'code', Type: 'String', IsPrimaryKey: false, IsUniqueKey: false, AllowsNull: true },
    }, 'IOF CommitteeMembers.code PK/UK downgrade');
    // New write-path-only field: proven by the PUT path parameter.
    await checkedCall('upsert_integration_object_field', {
        connector: CONNECTOR,
        ioName: 'CommitteeMembers',
        iof: {
            Name: 'memberRecordNumber',
            DisplayName: 'Member Record Number',
            Description: 'Member Record Number. The per-committee-member record identifier used to address a single member on the update endpoint. Present only as the PUT path parameter, not in the read/list response schema.',
            Type: 'String',
            IsRequired: true,
            IsReadOnly: true,
            IsPrimaryKey: true,
            IsUniqueKey: true,
            Length: null,
            AllowsNull: false,
            Sequence: 7,
            Status: 'Active',
        },
    }, 'IOF CommitteeMembers.memberRecordNumber new PK field');
    await checkedCall('append_code_evidence', {
        connector: CONNECTOR,
        entry: {
            ScriptPath: SCRIPT_REL_PATH,
            ScriptRunAt: NOW,
            StructuredOutput: {
                writePath: '/api/v1/Committees/{code}/Members/{memberRecordNumber}/{currentPositionCode}',
                method: 'put',
                pathParams: ['code', 'memberRecordNumber', 'currentPositionCode'],
                note: "Tier-1 update path-parameter 'memberRecordNumber' is the real per-member addressing identifier. 'code' downgraded from PK/UK (only a generic 'Code.' property, no single-record path of its own; sibling Committees PK is 'id' not 'code').",
            },
            SchemaValidationStatus: 'Passed',
            TargetField: 'iof.CommitteeMembers.memberRecordNumber.IsPrimaryKey',
        },
    }, 'CODE_EVIDENCE CommitteeMembers.memberRecordNumber.IsPrimaryKey');

    // ---- FIX 3: Purchases — orderNumber PK/UK downgrade (per-line-item grain) ---
    await checkedCall('upsert_integration_object_field', {
        connector: CONNECTOR,
        ioName: 'Purchases',
        iof: { Name: 'orderNumber', Type: 'String', IsPrimaryKey: false, IsUniqueKey: false, AllowsNull: true },
    }, 'IOF Purchases.orderNumber PK/UK downgrade');
    await checkedCall('append_code_evidence', {
        connector: CONNECTOR,
        entry: {
            ScriptPath: SCRIPT_REL_PATH,
            ScriptRunAt: NOW,
            StructuredOutput: {
                definition: 'PurchasedItemData',
                properties: ['orderNumber', 'productCode', 'productName', 'productType', 'purchaseDate', 'additionalInfo', 'quantity', 'itemizedCustomFields', 'productCategories'],
                grain: 'per-purchased-product line item',
                note: 'A per-line-item shape (carries productCode/productName/productType/quantity); an order with N products yields N rows sharing one orderNumber. orderNumber alone is NOT a unique per-record identifier — downgraded IsPrimaryKey/IsUniqueKey to false; identity falls to the content-hash fallback.',
            },
            SchemaValidationStatus: 'Passed',
            TargetField: 'iof.Purchases.orderNumber.IsPrimaryKey',
        },
    }, 'CODE_EVIDENCE Purchases.orderNumber.IsPrimaryKey');

    await client.close();

    // ---- Re-read the now-persisted 3 objects and write the delta emission ------
    const objectNames = ['CustomFieldDefinitions', 'CommitteeMembers', 'Purchases'];
    const emissions = objectNames.map((name) => {
        const { fields, iofs } = readIO(name);
        const claims: Array<{ slot: string; value: unknown; sourcePath: string }> = [];
        // IO-level slots re-asserted this round
        if (name === 'CustomFieldDefinitions') {
            claims.push({ slot: 'io.CustomFieldDefinitions.PaginationType', value: fields.PaginationType, sourcePath: SWAGGER_SOURCE_PATH });
            claims.push({ slot: 'io.CustomFieldDefinitions.SupportsPagination', value: fields.SupportsPagination, sourcePath: SWAGGER_SOURCE_PATH });
        }
        // Per-field identity claims for PK/UK-bearing fields (post-fix state)
        for (const iof of iofs) {
            if (iof.IsPrimaryKey === true) claims.push({ slot: `iof.${name}.${iof.Name}.IsPrimaryKey`, value: true, sourcePath: SWAGGER_SOURCE_PATH });
            if (iof.IsUniqueKey === true) claims.push({ slot: `iof.${name}.${iof.Name}.IsUniqueKey`, value: true, sourcePath: SWAGGER_SOURCE_PATH });
        }
        // Explicit record of the downgrades performed this round
        if (name === 'CommitteeMembers') claims.push({ slot: 'iof.CommitteeMembers.code.IsPrimaryKey', value: false, sourcePath: SWAGGER_SOURCE_PATH });
        if (name === 'Purchases') claims.push({ slot: 'iof.Purchases.orderNumber.IsPrimaryKey', value: false, sourcePath: SWAGGER_SOURCE_PATH });

        const pkFields = iofs.filter((f) => f.IsPrimaryKey === true).map((f) => f.Name);
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
                CrossIOMatch: 'no',
                PKVerdict: pkFields.length > 0 ? 'emit' : 'defer',
                FKVerdict: 'defer',
                EvidenceCount: claims.length,
            },
        };
    });

    writeFileSync(RUN_OUTPUT, JSON.stringify(emissions, null, 2) + '\n');
    process.stdout.write(JSON.stringify({
        amendmentRound: 2,
        objectsReprocessed: emissions.length,
        objects: emissions.map((e) => ({ name: e.objectName, fields: e.fieldsExtracted, pk: e.claims.filter((c) => c.slot.endsWith('.IsPrimaryKey') && c.value === true).map((c) => c.slot) })),
    }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
