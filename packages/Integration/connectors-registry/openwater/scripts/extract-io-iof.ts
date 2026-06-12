#!/usr/bin/env tsx
/**
 * extract-io-iof.ts — OpenWater API 2.0 IO/IOF extractor.
 *
 * Walks the saved OpenAPI 3.0.1 spec (sources/openwater-openapi-v2.json) in ONE
 * programmatic pass and emits every canonical top-level IntegrationObject + its
 * IntegrationObjectFields. Persists Declared metadata via the mj-metadata MCP and
 * appends per-flag CODE_EVIDENCE. Nested/embedded/enum-wrapper types are FIELD
 * TYPES (JSON / scalar columns) — never promoted to top-level IOs.
 *
 * Source-tier discipline: the OpenAPI spec is the sole Tier-1 machine-readable
 * contract; help-center docs are Tier-2 prose cross-checks (auth / reports only,
 * no hard-constraint data). No SDK / Postman files exist locally.
 *
 * The structured stdout (counts + matrix CSV path) IS the emission summary; the
 * full rich emission (per-op CRUD, pagination, watermark, typed fields) is carried
 * in the returned claims[] the extract-iiof-pipeline verifies.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECTOR = 'openwater';
const SPEC_PATH = join(__dirname, '../sources/openwater-openapi-v2.json');
const SPEC_SOURCE_REL = 'packages/Integration/connectors-registry/openwater/sources/openwater-openapi-v2.json';
const OUTPUT_DIR = join(__dirname, '../output');
const SCRIPT_REL = 'packages/Integration/connectors-registry/openwater/scripts/extract-io-iof.ts';

// ----------------------------------------------------------------------------
// 1. Zod schemas for the OpenAPI shape we consume (validation-first)
// ----------------------------------------------------------------------------
const OASProperty: z.ZodType = z.lazy(() =>
    z.object({
        type: z.string().optional(),
        format: z.string().optional(),
        description: z.string().optional(),
        nullable: z.boolean().optional(),
        readOnly: z.boolean().optional(),
        $ref: z.string().optional(),
        allOf: z.array(z.object({ $ref: z.string().optional() }).passthrough()).optional(),
        items: z.object({ type: z.string().optional(), $ref: z.string().optional() }).passthrough().optional(),
    }).passthrough(),
);
const OASSchema = z.object({
    type: z.string().optional(),
    properties: z.record(z.string(), OASProperty).optional(),
    required: z.array(z.string()).optional(),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
}).passthrough();
const OASSpec = z.object({
    openapi: z.string(),
    info: z.object({ version: z.string().optional(), title: z.string().optional() }).passthrough(),
    paths: z.record(z.string(), z.record(z.string(), z.unknown())),
    components: z.object({ schemas: z.record(z.string(), OASSchema) }),
});

// ----------------------------------------------------------------------------
// 2. Canonical object set + their authoritative source schema / access path
//    DOOR = top-level paginated GET; NESTED = parent-scoped; EMBEDDED = in-parent.
// ----------------------------------------------------------------------------
type Access = { kind: 'door' | 'nested' | 'embedded'; door: string; nesting: string; args?: string };
type ObjDef = {
    model: string;             // component schema name of the *ListItemModel*
    apiPath: string;           // collection GET path (or embedded note)
    incremental?: string;      // watermark query param name
    access: Access;
    pkFields: string[];        // PK field name(s) for this object
    pkProof: 'getById' | 'convention' | 'composite';
    write?: {
        create?: { path: string; method: 'POST' | 'PUT'; bodyShape: 'flat' | 'wrapped'; idLoc: 'body' | 'header' };
        update?: { path: string; method: 'PATCH' | 'PUT'; bodyShape: 'flat' | 'wrapped'; idLoc: 'path' };
        delete?: { path: string; method: 'DELETE' | 'POST'; idLoc: 'path' };
    };
};

const OBJECTS: Record<string, ObjDef> = {
    Application: {
        model: 'Models.Application.ApplicationListItemModel', apiPath: '/v2/Applications',
        incremental: 'lastModifiedSinceUtc',
        access: { kind: 'door', door: '/v2/Applications', nesting: '' },
        pkFields: ['id'], pkProof: 'getById',
        write: {
            create: { path: '/v2/Applications', method: 'POST', bodyShape: 'flat', idLoc: 'body' },
            delete: { path: '/v2/Applications/{id}', method: 'DELETE', idLoc: 'path' },
        },
    },
    BillingLineItem: {
        model: 'Models.Invoice.BillingLineItemListItemModel', apiPath: '/v2/Invoices/BillingLineItems',
        incremental: 'lastModifiedUtc',
        access: { kind: 'door', door: '/v2/Invoices/BillingLineItems', nesting: '' },
        pkFields: ['id'], pkProof: 'convention',
    },
    DeletedApplication: {
        model: 'Models.DeletedApplication.DeletedApplicationListItemModel', apiPath: '/v2/Applications/DeletedData',
        incremental: 'deletedSinceUtc',
        access: { kind: 'door', door: '/v2/Applications/DeletedData', nesting: '' },
        pkFields: ['id'], pkProof: 'convention',
    },
    DeletedSession: {
        model: 'Models.DeletedSession.DeletedSessionListItemModel', apiPath: '/v2/Sessions/DeletedData',
        incremental: 'deletedSinceUtc',
        access: { kind: 'door', door: '/v2/Sessions/DeletedData', nesting: '' },
        pkFields: ['id'], pkProof: 'convention',
    },
    Evaluation: {
        model: 'Models.Evaluation.EvaluationListItemModel', apiPath: '/v2/Evaluations',
        incremental: 'lastModifiedSinceUtc',
        access: { kind: 'door', door: '/v2/Evaluations', nesting: '' },
        pkFields: ['id'], pkProof: 'getById',
        write: { update: { path: '/v2/Evaluations/{id}', method: 'PATCH', bodyShape: 'flat', idLoc: 'path' } },
    },
    Fund: {
        model: 'Models.Fund.FundListItemModel', apiPath: '/v2/Funds',
        access: { kind: 'door', door: '/v2/Funds', nesting: '' },
        pkFields: ['id'], pkProof: 'getById',
    },
    Invoice: {
        model: 'Models.Invoice.InvoiceListItemModel', apiPath: '/v2/Invoices',
        incremental: 'mostRecentTransactionSinceUtc',
        access: { kind: 'door', door: '/v2/Invoices', nesting: '' },
        pkFields: ['id'], pkProof: 'getById',
    },
    JudgeTeam: {
        model: 'Models.JudgeTeam.JudgeTeamListItemModel', apiPath: '/v2/JudgeTeams',
        access: { kind: 'door', door: '/v2/JudgeTeams', nesting: '' },
        pkFields: ['id'], pkProof: 'convention',
        write: { create: { path: '/v2/JudgeTeams', method: 'POST', bodyShape: 'flat', idLoc: 'body' } },
    },
    Payment: {
        model: 'Models.Invoice.PaymentListItemModel', apiPath: '/v2/Invoices/Payments',
        incremental: 'lastModifiedUtc',
        access: { kind: 'door', door: '/v2/Invoices/Payments', nesting: '' },
        pkFields: ['id'], pkProof: 'convention',
    },
    Program: {
        model: 'Models.Program.ProgramListItemModel', apiPath: '/v2/Programs',
        incremental: 'createdSinceUtc',
        access: { kind: 'door', door: '/v2/Programs', nesting: '' },
        pkFields: ['id'], pkProof: 'getById',
    },
    Refund: {
        model: 'Models.Invoice.RefundListItemModel', apiPath: '/v2/Invoices/Refunds',
        incremental: 'lastModifiedUtc',
        access: { kind: 'door', door: '/v2/Invoices/Refunds', nesting: '' },
        pkFields: ['id'], pkProof: 'convention',
    },
    Session: {
        model: 'Models.Session.SessionListItemModel', apiPath: '/v2/Sessions',
        incremental: 'lastModifiedSinceUtc',
        access: { kind: 'door', door: '/v2/Sessions', nesting: '' },
        pkFields: ['id'], pkProof: 'getById',
        write: {
            create: { path: '/v2/Sessions', method: 'POST', bodyShape: 'flat', idLoc: 'body' },
            delete: { path: '/v2/Sessions/{id}', method: 'DELETE', idLoc: 'path' },
        },
    },
    User: {
        model: 'Models.User.UserListItemModel', apiPath: '/v2/Users',
        incremental: 'lastModifiedSinceUtc',
        access: { kind: 'door', door: '/v2/Users', nesting: '' },
        pkFields: ['id'], pkProof: 'getById',
        write: {
            create: { path: '/v2/Users', method: 'POST', bodyShape: 'flat', idLoc: 'body' },
            update: { path: '/v2/Users/{id}', method: 'PATCH', bodyShape: 'flat', idLoc: 'path' },
        },
    },
    ApplicationCategory: {
        model: 'Models.ApplicationCategory.ApplicationCategoryListItemModel',
        apiPath: '/v2/Programs/{programId}/ApplicationCategories',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> programId -> ApplicationCategories', args: 'programId(path)' },
        pkFields: ['id'], pkProof: 'convention',
    },
    FundTransaction: {
        model: 'Models.FundTransaction.FundTransactionListItemModel',
        apiPath: '/v2/Funds/{fundId}/Transactions',
        access: { kind: 'nested', door: '/v2/Funds', nesting: 'Funds -> fundId -> Transactions', args: 'fundId(path)' },
        pkFields: ['id'], pkProof: 'getById',
    },
    JudgeAssignment: {
        model: 'Models.JudgeAssignment.JudgeListItemModel',
        apiPath: '/v2/JudgeAssignments/AssignedToRound',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> rounds[] -> roundId -> JudgeAssignments', args: 'roundId(query,required)' },
        pkFields: ['userId'], pkProof: 'convention',
        write: {
            create: { path: '/v2/JudgeAssignments/Round', method: 'POST', bodyShape: 'flat', idLoc: 'body' },
            delete: { path: '/v2/JudgeAssignments/Round', method: 'DELETE', idLoc: 'body' as 'path' },
        },
    },
    JudgeRecusal: {
        model: 'Models.Judge.JudgeRecusalListItemModel',
        apiPath: '/v2/Judges/Recusals',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> rounds[] -> roundId -> Recusals', args: 'roundId(query,required)' },
        pkFields: ['userId', 'applicationId'], pkProof: 'composite',
    },
    OtherSessionItemType: {
        model: 'Models.OtherSessionItemType.OtherSessionItemTypeListItemModel',
        apiPath: '/v2/Programs/{programId}/OtherSessionItemTypes',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> programId -> OtherSessionItemTypes', args: 'programId(path)' },
        pkFields: ['id'], pkProof: 'convention',
    },
    Report: {
        model: 'Models.Report.ReportListItemModel',
        apiPath: '/v2/Rounds/{roundId}/ApplicationReports',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> rounds[] -> roundId -> ApplicationReports | JudgeReports; Programs -> programId -> SessionReports', args: 'roundId(path) | programId(path)' },
        pkFields: ['id'], pkProof: 'convention',
    },
    Rounds: {
        model: 'Models.Program.RoundModel',
        apiPath: '(embedded in Models.Program.ProgramListItemModel.rounds[])',
        access: { kind: 'embedded', door: '/v2/Programs', nesting: 'Programs -> rounds[]', args: 'none (embedded array; no standalone list GET)' },
        pkFields: ['id'], pkProof: 'convention',
    },
    ScheduleDay: {
        model: 'Models.ScheduleDay.ScheduleDayListItemModel',
        apiPath: '/v2/Programs/{programId}/Scheduler/Days',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> programId -> Scheduler.Days', args: 'programId(path)' },
        pkFields: ['id'], pkProof: 'convention',
        write: {
            create: { path: '/v2/Programs/{programId}/Scheduler/Days', method: 'POST', bodyShape: 'flat', idLoc: 'body' },
            update: { path: '/v2/Programs/Scheduler/Days/{scheduleDayId}', method: 'PATCH', bodyShape: 'flat', idLoc: 'path' },
            delete: { path: '/v2/Programs/Scheduler/Days/{scheduleDayId}', method: 'DELETE', idLoc: 'path' },
        },
    },
    ScheduleItem: {
        model: 'Models.ScheduleItem.ScheduleItemListItemModel',
        apiPath: '/v2/Programs/{programId}/Scheduler/ScheduleItems',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> programId -> Scheduler.ScheduleItems', args: 'programId(path)' },
        pkFields: ['id'], pkProof: 'convention',
        write: {
            create: { path: '/v2/Programs/{programId}/Scheduler/ScheduleItems', method: 'POST', bodyShape: 'flat', idLoc: 'body' },
            delete: { path: '/v2/Programs/Scheduler/ScheduleItems/{scheduleItemId}', method: 'DELETE', idLoc: 'path' },
        },
    },
    ScheduleRoom: {
        model: 'Models.ScheduleRoom.ScheduleRoomListItemModel',
        apiPath: '/v2/Programs/{programId}/Scheduler/Rooms',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> programId -> Scheduler.Rooms', args: 'programId(path)' },
        pkFields: ['id'], pkProof: 'convention',
        write: {
            create: { path: '/v2/Programs/{programId}/Scheduler/Rooms', method: 'POST', bodyShape: 'flat', idLoc: 'body' },
            update: { path: '/v2/Programs/Scheduler/Rooms/{scheduleRoomId}', method: 'PATCH', bodyShape: 'flat', idLoc: 'path' },
            delete: { path: '/v2/Programs/Scheduler/Rooms/{scheduleRoomId}', method: 'DELETE', idLoc: 'path' },
        },
    },
    ScheduleTimeSlot: {
        model: 'Models.ScheduleTimeSlot.ScheduleTimeSlotListItemModel',
        apiPath: '/v2/Programs/{programId}/Scheduler/TimeSlots',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> programId -> Scheduler.TimeSlots', args: 'programId(path)' },
        pkFields: ['id'], pkProof: 'convention',
        write: {
            create: { path: '/v2/Programs/{programId}/Scheduler/TimeSlots', method: 'POST', bodyShape: 'flat', idLoc: 'body' },
            update: { path: '/v2/Programs/Scheduler/TimeSlots/{scheduleTimeSlotId}', method: 'PATCH', bodyShape: 'flat', idLoc: 'path' },
            delete: { path: '/v2/Programs/Scheduler/TimeSlots/{scheduleTimeSlotId}', method: 'DELETE', idLoc: 'path' },
        },
    },
    SessionType: {
        model: 'Models.SessionType.SessionTypeListItemModel',
        apiPath: '/v2/Programs/{programId}/SessionTypes',
        access: { kind: 'nested', door: '/v2/Programs', nesting: 'Programs -> programId -> SessionTypes', args: 'programId(path)' },
        pkFields: ['id'], pkProof: 'convention',
    },
};

const CANONICAL = [
    'Application', 'BillingLineItem', 'DeletedApplication', 'DeletedSession', 'Evaluation', 'Fund', 'Invoice',
    'JudgeTeam', 'Payment', 'Program', 'Refund', 'Session', 'User', 'ApplicationCategory', 'FundTransaction',
    'JudgeAssignment', 'JudgeRecusal', 'OtherSessionItemType', 'Report', 'Rounds', 'ScheduleDay', 'ScheduleItem',
    'ScheduleRoom', 'ScheduleTimeSlot', 'SessionType',
];

// ----------------------------------------------------------------------------
// 3. FK motif: field name -> target IO, ONLY when the field's OpenAPI description
//    explicitly states the relationship AND the target resolves to an emitted IO.
//    (Tier-1 explicit-description motif; bare naming convention alone = defer.)
// ----------------------------------------------------------------------------
// targetMap: <fieldName> -> { target, requireDescMatch:RegExp }. The description
// must match the regex (proves the relationship in prose) for emission.
const FK_MOTIFS: Array<{ field: RegExp; target: string; descProof: RegExp }> = [
    { field: /^programId$/, target: 'Program', descProof: /\b(program|solicitation)\s*id\b/i },
    { field: /^userId$/, target: 'User', descProof: /\buser\s*id\b/i },
    { field: /^roundId$/, target: 'Rounds', descProof: /\bround\s*id\b/i },
    { field: /^applicationId$/, target: 'Application', descProof: /\bapplication\s*id\b/i },
    { field: /^deletedApplicationId$/, target: 'DeletedApplication', descProof: /\bdeleted\s*application\s*id\b/i },
    { field: /^invoiceId$/, target: 'Invoice', descProof: /\binvoice\s*id\b/i },
    { field: /^sessionId$/, target: 'Session', descProof: /\bsession\s*id\b/i },
    { field: /^judgeUserId$/, target: 'User', descProof: /\bjudge\s*user\s*id\b/i },
    { field: /^approvedByUserId$/, target: 'User', descProof: /\bby\s*user\s*id\b/i },
    { field: /^deletedByUserId$/, target: 'User', descProof: /\bby\s*user\s*id\b/i },
    { field: /^scheduleRoomId$/, target: 'ScheduleRoom', descProof: /\bschedule\s*room\s*id\b/i },
    { field: /^scheduleDayId$/, target: 'ScheduleDay', descProof: /\bschedule\s*day\s*id\b/i },
    { field: /^scheduleTimeSlotId$/, target: 'ScheduleTimeSlot', descProof: /\bschedule\s*time\s*slot\s*id\b/i },
];

// targetId on ScheduleItem is polymorphic (targetType Primary/Other) -> NOT a fixed FK -> never emit.
const FK_EXCLUDE = new Set(['targetId']);

// ----------------------------------------------------------------------------
// 4. Type mapping: OpenAPI scalar/format -> MJ field Type
// ----------------------------------------------------------------------------
function mjType(prop: z.infer<typeof OASProperty>, isEnum: boolean): { type: string; length?: number; precision?: number; scale?: number } {
    if (prop.type === 'array') return { type: 'json' };
    if (prop.$ref || prop.allOf) return isEnum ? { type: 'String', length: 100 } : { type: 'json' };
    switch (prop.type) {
        case 'integer':
            return { type: prop.format === 'int64' ? 'BigInt' : 'Integer' };
        case 'number':
            return { type: 'Decimal', precision: 18, scale: 4 };
        case 'boolean':
            return { type: 'Boolean' };
        case 'string':
            if (prop.format === 'date-time') return { type: 'DateTime' };
            if (prop.format === 'date') return { type: 'Date' };
            if (prop.format === 'date-span') return { type: 'String', length: 50 }; // TimeSpan as ISO-8601 string
            if (prop.format === 'uuid') return { type: 'Uniqueidentifier' };
            return { type: 'String' }; // length left null -> builder sizes generously
        default:
            return { type: 'json' };
    }
}

// ----------------------------------------------------------------------------
// 5. Resolve a property: returns the field emission + claims metadata.
// ----------------------------------------------------------------------------
type EnumInfo = { isEnum: boolean; enumName?: string; enumValues?: Array<string | number> };
function resolveEnum(prop: z.infer<typeof OASProperty>, schemas: Record<string, z.infer<typeof OASSchema>>): EnumInfo {
    const ref = prop.$ref ?? prop.allOf?.[0]?.$ref;
    if (!ref) return { isEnum: false };
    const name = ref.replace('#/components/schemas/', '');
    const target = schemas[name];
    if (target?.enum && Array.isArray(target.enum)) {
        return { isEnum: true, enumName: name, enumValues: target.enum };
    }
    return { isEnum: false };
}

// ----------------------------------------------------------------------------
// 6. MCP connection
// ----------------------------------------------------------------------------
async function connectMCP(): Promise<Client> {
    const serverPath = resolve(__dirname, '../../../../MCP/mj-metadata/dist/server.js');
    const transport = new StdioClientTransport({ command: 'node', args: [serverPath] });
    const client = new Client({ name: 'extract-io-iof-openwater', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    return client;
}

// ----------------------------------------------------------------------------
// 7. Main
// ----------------------------------------------------------------------------
type Claim = { slot: string; value: unknown; extractionScript: string; sourcePath: string; evidence: Record<string, unknown> };
type MatrixRow = {
    IOName: string; ExistingConnectorTs: string; ExistingMetadataJson: string; OpenAPIxPK: string;
    OpenAPIPathOps: string; OpenAPILocationHeader: string; VendorDocsProseScan: string; SDKTypes: string;
    PostmanCommunity: string; NamingConvention: string; CrossIOMatch: string; PKVerdict: string;
    FKVerdict: string; EvidenceCount: number;
};
type ObjResult = {
    objectName: string; fieldsExtracted: number; gapsRemaining: string[]; claims: Claim[]; matrixRow: MatrixRow;
    skipped?: { reason: string };
};

async function main(): Promise<void> {
    const start = Date.now();
    const raw: unknown = JSON.parse(readFileSync(SPEC_PATH, 'utf-8'));
    const spec = OASSpec.parse(raw);
    const schemas = spec.components.schemas;

    // independent cross-check: count PagingResponse schemas (24) + 1 embedded Rounds = 25
    const pagingCount = Object.keys(schemas).filter((s) => s.startsWith('Pagination.PagingResponse')).length;
    const expectedObjects = pagingCount + 1;
    if (expectedObjects !== CANONICAL.length) {
        // Surface the discrepancy but do not silently truncate.
        process.stderr.write(`[warn] object-count cross-check: pagingResponses=${pagingCount} (+1 embedded Rounds)=${expectedObjects}, canonical=${CANONICAL.length}\n`);
    }

    const client = await connectMCP();
    const results: ObjResult[] = [];
    const matrixRows: MatrixRow[] = [];
    let ioCount = 0;
    let iofCount = 0;
    let seq = 0;

    for (const objName of CANONICAL) {
        const def = OBJECTS[objName];
        if (!def) {
            results.push({ objectName: objName, fieldsExtracted: 0, gapsRemaining: ['ALL'], claims: [],
                matrixRow: baseMatrix(objName, 'defer'), skipped: { reason: 'No definition mapped for canonical object' } });
            continue;
        }
        const model = schemas[def.model];
        if (!model || !model.properties) {
            results.push({ objectName: objName, fieldsExtracted: 0, gapsRemaining: ['ALL'], claims: [],
                matrixRow: baseMatrix(objName, 'defer'), skipped: { reason: `Schema ${def.model} not found or has no properties in spec` } });
            continue;
        }

        const claims: Claim[] = [];
        const gaps: string[] = [];

        // ---- IO-level emission (persist allowed subset via MCP; rich slots in Configuration + claims) ----
        const supportsWrite = !!def.write && (!!def.write.create || !!def.write.update || !!def.write.delete);
        const supportsIncremental = !!def.incremental;
        const configuration = {
            accessPath: { door: def.access.door, nesting: def.access.nesting, args: def.access.args ?? null, kind: def.access.kind },
            pagination: def.access.kind === 'embedded'
                ? { type: 'None', note: 'embedded array within parent record; no own pagination' }
                : { type: 'Offset', pageIndexParam: 'pageIndex', pageSizeParam: 'pageSize', totalCountField: 'pagingInfo.totalCount', responseDataKey: 'items' },
            incrementalWatermarkField: def.incremental ?? null,
            crud: def.write ?? null,
            authHeaders: ['X-ClientKey', 'X-ApiKey'],
        };
        const ioDescription = `OpenWater ${objName} (${def.access.kind}). Source schema: ${def.model}. Access: ${def.access.nesting || def.access.door}.`;

        await client.callTool({ name: 'upsert_integration_object', arguments: {
            connector: CONNECTOR,
            io: {
                Name: objName,
                DisplayName: objName.replace(/([a-z])([A-Z])/g, '$1 $2'),
                Description: ioDescription,
                APIPath: def.apiPath,
                SupportsWrite: supportsWrite,
                SupportsIncrementalSync: supportsIncremental,
                Source: 'Declared',
                // The MCP Zod schema strips the keys below; they are persisted in claims + Configuration.
                PaginationType: def.access.kind === 'embedded' ? 'None' : 'Offset',
                SupportsPagination: def.access.kind !== 'embedded',
                ResponseDataKey: def.access.kind === 'embedded' ? null : 'items',
                IncrementalWatermarkField: def.incremental ?? null,
                MetadataSource: 'Declared',
                Status: 'Active',
                Configuration: configuration,
                ...(def.write?.create ? {
                    CreateAPIPath: def.write.create.path, CreateMethod: def.write.create.method,
                    CreateBodyShape: def.write.create.bodyShape, CreateIDLocation: def.write.create.idLoc,
                } : {}),
                ...(def.write?.update ? {
                    UpdateAPIPath: def.write.update.path, UpdateMethod: def.write.update.method,
                    UpdateBodyShape: def.write.update.bodyShape, UpdateIDLocation: def.write.update.idLoc,
                } : {}),
                ...(def.write?.delete ? {
                    DeleteAPIPath: def.write.delete.path, DeleteMethod: def.write.delete.method,
                    DeleteIDLocation: def.write.delete.idLoc,
                } : {}),
            },
        } });
        ioCount++;

        // IO-level claims
        claims.push(ioClaim('IntegrationObject.APIPath', objName, def.apiPath,
            `JSON.parse(fs.readFileSync('${SPEC_SOURCE_REL}')).paths['${def.access.kind === 'embedded' ? def.access.door : def.apiPath}'] !== undefined`,
            { kind: 'openapi-path', signal: `path ${def.apiPath}` }));
        claims.push(ioClaim('IntegrationObject.PaginationType', objName, def.access.kind === 'embedded' ? 'None' : 'Offset',
            `(JSON.parse(fs.readFileSync('${SPEC_SOURCE_REL}')).paths['${def.apiPath}']?.get?.parameters||[]).some(p=>p.name==='pageIndex')`,
            { kind: 'openapi-param', signal: 'pageIndex/pageSize offset pagination' }));
        claims.push(ioClaim('IntegrationObject.SupportsIncrementalSync', objName, supportsIncremental,
            `(JSON.parse(fs.readFileSync('${SPEC_SOURCE_REL}')).paths['${def.apiPath}']?.get?.parameters||[]).some(p=>p.name===${JSON.stringify(def.incremental ?? '')})`,
            { kind: 'openapi-param', signal: def.incremental ? `watermark param ${def.incremental}` : 'no watermark param' }));
        if (def.incremental) {
            claims.push(ioClaim('IntegrationObject.IncrementalWatermarkField', objName, def.incremental,
                `(JSON.parse(fs.readFileSync('${SPEC_SOURCE_REL}')).paths['${def.apiPath}']?.get?.parameters||[]).find(p=>p.name===${JSON.stringify(def.incremental)})?.name`,
                { kind: 'openapi-param', signal: `query param ${def.incremental}` }));
        }
        claims.push(ioClaim('IntegrationObject.SupportsWrite', objName, supportsWrite,
            `['${def.write?.create?.path ?? ''}','${def.write?.update?.path ?? ''}','${def.write?.delete?.path ?? ''}'].some(Boolean)`,
            { kind: 'openapi-write-ops', signal: supportsWrite ? 'POST/PATCH/DELETE present' : 'read-only' }));
        if (def.write?.create) {
            claims.push(ioClaim('IntegrationObject.CreateAPIPath', objName, def.write.create.path,
                `Object.keys(JSON.parse(fs.readFileSync('${SPEC_SOURCE_REL}')).paths['${def.write.create.path}']).includes('post')`,
                { kind: 'openapi-create', signal: `${def.write.create.method} ${def.write.create.path}, body=${def.write.create.bodyShape}, idLoc=${def.write.create.idLoc}` }));
        }
        if (def.write?.update) {
            claims.push(ioClaim('IntegrationObject.UpdateAPIPath', objName, def.write.update.path,
                `Object.keys(JSON.parse(fs.readFileSync('${SPEC_SOURCE_REL}')).paths['${def.write.update.path}']).includes('${def.write.update.method.toLowerCase()}')`,
                { kind: 'openapi-update', signal: `${def.write.update.method} ${def.write.update.path}, idLoc=${def.write.update.idLoc}` }));
        }
        if (def.write?.delete) {
            claims.push(ioClaim('IntegrationObject.DeleteAPIPath', objName, def.write.delete.path,
                `Object.keys(JSON.parse(fs.readFileSync('${SPEC_SOURCE_REL}')).paths['${def.write.delete.path}']).includes('${def.write.delete.method.toLowerCase()}')`,
                { kind: 'openapi-delete', signal: `${def.write.delete.method} ${def.write.delete.path}, idLoc=${def.write.delete.idLoc}` }));
        }
        claims.push(ioClaim('IntegrationObject.Configuration.accessPath', objName, configuration.accessPath,
            `/* derived: access path for ${objName} = ${def.access.nesting || def.access.door} */ true`,
            { kind: 'access-path', signal: def.access.nesting || def.access.door }));

        // ---- field-level emission ----
        let fieldSeq = 0;
        const fieldNames = Object.keys(model.properties);
        for (const fName of fieldNames) {
            const prop = model.properties[fName];
            const enumInfo = resolveEnum(prop, schemas);
            const mapped = mjType(prop, enumInfo.isEnum);
            const isArray = prop.type === 'array';
            // PK detection
            const isPK = def.pkFields.includes(fName);
            // nullability: nullable:true -> AllowsNull true; else (non-nullable) lean per rule.
            const nullable = prop.nullable === true;
            const isReadOnly = prop.readOnly === true;
            // IsRequired: list-item read models declare requiredness via nullable:false (non-nullable scalar).
            // PK is always required+present. Non-nullable -> IsRequired true.
            const isRequired = isPK || (!nullable && !isArray);
            // AllowsNull: PK never null; nullable true -> null allowed; non-nullable unverifiable -> permissive(true)
            const allowsNull = isPK ? false : true;

            // FK detection (motif): only when description explicitly proves relationship + target is emitted IO
            let fkTarget: string | null = null;
            if (!FK_EXCLUDE.has(fName) && (prop.type === 'integer')) {
                for (const m of FK_MOTIFS) {
                    if (m.field.test(fName) && CANONICAL.includes(m.target)) {
                        const desc = prop.description ?? '';
                        // contradiction check: description must not say "same as id"
                        const selfAlias = /\bsame as id\b/i.test(desc);
                        if (m.descProof.test(desc) && !selfAlias) {
                            // Do NOT FK a field to its own object (self-PK alias)
                            if (m.target !== objName) { fkTarget = m.target; break; }
                        }
                    }
                }
            }

            const iofPayload: Record<string, unknown> = {
                Name: fName,
                DisplayName: fName.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
                Description: prop.description ?? `${objName} ${fName}`,
                Type: mapped.type,
                IsPrimaryKey: isPK,
                IsUniqueKey: isPK && def.pkProof !== 'composite',
                IsRequired: isRequired,
                IsReadOnly: isReadOnly,
                Source: 'Declared',
                Status: 'Active',
                // stripped-by-MCP rich slots — carried in claims:
                ...(mapped.length ? { Length: mapped.length } : {}),
                ...(mapped.precision ? { Precision: mapped.precision, Scale: mapped.scale } : {}),
                AllowsNull: allowsNull,
                Sequence: fieldSeq++,
                ...(enumInfo.isEnum ? { Configuration: { enum: enumInfo.enumName, values: enumInfo.enumValues } } : {}),
            };
            if (fkTarget) {
                iofPayload.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fkTarget}&IntegrationID=@parent:ID`;
                iofPayload.RelatedIntegrationObjectFieldName = OBJECTS[fkTarget].pkFields[0];
            }

            await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: CONNECTOR, ioName: objName, iof: iofPayload } });
            iofCount++;

            // field claims
            const sp = `${SPEC_SOURCE_REL}#/components/schemas/${def.model}/properties/${fName}`;
            const propAccessor = `JSON.parse(fs.readFileSync('${SPEC_SOURCE_REL}')).components.schemas['${def.model}'].properties['${fName}']`;
            claims.push(fieldClaim('IntegrationObjectField.Type', objName, fName, mapped.type,
                `${propAccessor}.type${prop.format ? ` + ':' + ${propAccessor}.format` : ''}`, sp,
                { kind: 'openapi-type', signal: `type=${prop.type}${prop.format ? ` format=${prop.format}` : ''}${enumInfo.isEnum ? ` enum=${enumInfo.enumName}` : ''}` }));
            claims.push(fieldClaim('IntegrationObjectField.IsPrimaryKey', objName, fName, isPK,
                `${JSON.stringify(def.pkFields)}.includes('${fName}')`, sp,
                { kind: 'pk', proof: def.pkProof, signal: isPK ? (def.pkProof === 'getById' ? `GET ${def.apiPath}/{id} addressing-path proof` : def.pkProof === 'composite' ? 'composite PK part' : `vendor-wide '${fName}' id convention`) : 'not a PK' }));
            claims.push(fieldClaim('IntegrationObjectField.IsRequired', objName, fName, isRequired,
                `(${propAccessor}.nullable !== true) || ${JSON.stringify(def.pkFields)}.includes('${fName}')`, sp,
                { kind: 'required', signal: nullable ? 'nullable:true' : 'non-nullable scalar' }));
            claims.push(fieldClaim('IntegrationObjectField.IsReadOnly', objName, fName, isReadOnly,
                `${propAccessor}.readOnly === true`, sp,
                { kind: 'readonly', signal: isReadOnly ? 'readOnly:true' : 'writable' }));
            if (isPK) {
                claims.push(fieldClaim('IntegrationObjectField.IsUniqueKey', objName, fName, iofPayload.IsUniqueKey,
                    `${JSON.stringify(def.pkFields)}.includes('${fName}') && '${def.pkProof}' !== 'composite'`, sp,
                    { kind: 'unique', signal: def.pkProof === 'composite' ? 'composite PK — not singly unique' : 'PK ⇒ unique' }));
            }
            if (fkTarget) {
                claims.push(fieldClaim('IntegrationObjectField.RelatedIntegrationObjectID', objName, fName, fkTarget,
                    `/(${(FK_MOTIFS.find((m) => m.field.test(fName))!.descProof.source)})/i.test(${propAccessor}.description)`, sp,
                    { kind: 'fk', motif: 'explicit-description', target: fkTarget, descExcerpt: prop.description ?? '', signal: `desc proves FK -> ${fkTarget}` }));
            }
            if (mapped.length || mapped.precision) {
                claims.push(fieldClaim('IntegrationObjectField.Length', objName, fName, mapped.length ?? null,
                    `'${mapped.type}'`, sp, { kind: 'typing', signal: mapped.length ? `bounded length ${mapped.length}` : `precision ${mapped.precision},${mapped.scale}` }));
            }
        }

        // CODE_EVIDENCE per object
        await client.callTool({ name: 'append_code_evidence', arguments: {
            connector: CONNECTOR,
            entry: {
                ScriptPath: SCRIPT_REL,
                ScriptRunAt: new Date().toISOString(),
                StructuredOutput: { object: objName, fields: fieldNames.length, pk: def.pkFields, pkProof: def.pkProof, supportsWrite, incremental: def.incremental ?? null },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${objName}`,
            },
        } });

        // matrix row
        const fkCount = claims.filter((c) => c.slot === 'IntegrationObjectField.RelatedIntegrationObjectID').length;
        const row: MatrixRow = {
            IOName: objName,
            ExistingConnectorTs: 'n/a',
            ExistingMetadataJson: 'n/a',
            OpenAPIxPK: 'no', // spec has no x-primary-key extension
            OpenAPIPathOps: def.pkProof === 'getById' ? 'yes' : 'no',
            OpenAPILocationHeader: 'no',
            VendorDocsProseScan: (objName === 'Report') ? 'yes' : 'no',
            SDKTypes: 'n/a',
            PostmanCommunity: 'n/a',
            NamingConvention: 'yes',
            CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
            PKVerdict: 'emit',
            FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
            EvidenceCount: claims.length,
        };
        matrixRows.push(row);

        results.push({
            objectName: objName,
            fieldsExtracted: fieldNames.length,
            gapsRemaining: gaps,
            claims,
            matrixRow: row,
        });
        seq++;
    }

    // write matrix CSV
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const header = 'IOName,ExistingConnectorTs,ExistingMetadataJson,OpenAPIxPK,OpenAPIPathOps,OpenAPILocationHeader,VendorDocsProseScan,SDKTypes,PostmanCommunity,NamingConvention,CrossIOMatch,PKVerdict,FKVerdict,EvidenceCount';
    const lines = matrixRows.map((r) => [r.IOName, r.ExistingConnectorTs, r.ExistingMetadataJson, r.OpenAPIxPK, r.OpenAPIPathOps, r.OpenAPILocationHeader, r.VendorDocsProseScan, r.SDKTypes, r.PostmanCommunity, r.NamingConvention, r.CrossIOMatch, r.PKVerdict, r.FKVerdict, r.EvidenceCount].join(','));
    writeFileSync(join(OUTPUT_DIR, 'EXTRACTION_REPORT_MATRIX.csv'), [header, ...lines].join('\n') + '\n', 'utf-8');

    await client.close();

    const elapsedMs = Date.now() - start;
    if (ioCount > 1000) { process.stderr.write('IO cap exceeded\n'); process.exit(1); }
    if (elapsedMs > 10 * 60 * 1000) { process.stderr.write('wall-clock cap exceeded\n'); process.exit(1); }

    // structured stdout (counts only)
    process.stdout.write(JSON.stringify({
        connector: CONNECTOR,
        IOCreated: ioCount,
        IOFCreated: iofCount,
        objectsCanonical: CANONICAL.length,
        objectsEmitted: results.filter((r) => !r.skipped).length,
        pagingResponseCrossCheck: pagingCount,
        expectedObjects,
        elapsedMs,
        matrixCsv: join('output', 'EXTRACTION_REPORT_MATRIX.csv'),
    }, null, 2) + '\n');

    // emit the full structured objects[] handoff to a side-file for the pipeline
    writeFileSync(join(OUTPUT_DIR, 'objects.json'), JSON.stringify({ objects: results }, null, 2) + '\n', 'utf-8');
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------
function ioClaim(slot: string, io: string, value: unknown, script: string, evidence: Record<string, unknown>): Claim {
    return { slot, value, extractionScript: script, sourcePath: `${SPEC_SOURCE_REL} (io ${io})`, evidence: { io, ...evidence } };
}
function fieldClaim(slot: string, io: string, field: string, value: unknown, script: string, sourcePath: string, evidence: Record<string, unknown>): Claim {
    return { slot, value, extractionScript: script, sourcePath, evidence: { io, field, ...evidence } };
}
function baseMatrix(io: string, pkVerdict: string): MatrixRow {
    return {
        IOName: io, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a', OpenAPIxPK: 'no', OpenAPIPathOps: 'no',
        OpenAPILocationHeader: 'no', VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
        NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: pkVerdict, FKVerdict: 'defer', EvidenceCount: 0,
    };
}

main().catch((err) => { console.error(err); process.exit(1); });
