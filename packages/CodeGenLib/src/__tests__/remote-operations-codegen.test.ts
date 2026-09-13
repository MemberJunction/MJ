/**
 * RemoteOperationGeneratorBase tests — the RO-2 CodeGen emitter that turns each `MJ: Remote Operations`
 * row into a typed `BaseRemotableOperation` subclass. Covers:
 *  - Manual rows → typed shell (no @RegisterClass, no body, correct readonly members)
 *  - AI/Default + Approved Code → complete registered class with the body in InternalExecute
 *  - AI without approval / empty Code → shell (unapproved code is never emitted)
 *  - shared Input/Output type definitions emitted exactly once (de-dup)
 *  - class-name derivation from the dotted OperationKey
 *  - header imports: Manual-only minimal; body files add essentials + defaults + declared libraries
 *  - declared-library aggregation + de-dup, ExecutionMode literal, RequiredScope omission, Status filter
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { RemoteOperationGeneratorBase, DEFAULT_REMOTE_OP_LIBRARY_ITEMS, resolveRemoteOperationSchema } from '../Misc/remote_operations_codegen';
import type { MJRemoteOperationEntity } from '@memberjunction/core-entities';

vi.mock('@memberjunction/core-entities', () => ({ MJRemoteOperationEntity: class {} }));
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));
vi.mock('fs', () => ({
    default: { writeFileSync: vi.fn(), mkdirSync: vi.fn() },
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
}));

type OpShape = Partial<{
    Status: string;
    OperationKey: string;
    SchemaName?: string;
    Name: string;
    Description: string | null;
    GenerationType: string;
    Code: string | null;
    CodeApprovalStatus: string;
    InputTypeName: string | null;
    InputTypeDefinition: string | null;
    OutputTypeName: string | null;
    OutputTypeDefinition: string | null;
    ExecutionMode: string;
    RequiredScope: string | null;
    RequiresSystemUser: boolean;
    LibrariesObject: Array<{ Library: string; ItemsUsed: string[] }> | null;
}>;

/** A mock row carrying only the fields the generator reads. */
function makeOp(overrides: OpShape = {}): MJRemoteOperationEntity {
    return {
        Status: 'Active',
        OperationKey: 'Test.Op',
        Name: 'Test Op',
        Description: 'A test operation',
        GenerationType: 'Manual',
        Code: null,
        CodeApprovalStatus: 'Pending',
        InputTypeName: 'TestInput',
        InputTypeDefinition: 'export interface TestInput {\n    id: string;\n}',
        InputTypeIsArray: false,
        OutputTypeName: 'TestOutput',
        OutputTypeDefinition: 'export interface TestOutput {\n    ok: boolean;\n}',
        OutputTypeIsArray: false,
        ExecutionMode: 'Sync',
        RequiredScope: 'test:execute',
        RequiresSystemUser: false,
        LibrariesObject: null,
        ...overrides,
    } as unknown as MJRemoteOperationEntity;
}

/** Runs the generator over the given ops and returns the full text it would write to remote_operations.ts. */
async function generate(ops: MJRemoteOperationEntity[]): Promise<string> {
    vi.mocked(fs.writeFileSync).mockClear();
    const gen = new RemoteOperationGeneratorBase();
    const ok = await gen.generateRemoteOperations(ops, '/tmp/out');
    expect(ok).toBe(true);
    const calls = vi.mocked(fs.writeFileSync).mock.calls;
    expect(calls.length).toBe(1);
    return String(calls[0][1]);
}

describe('RemoteOperationGeneratorBase', () => {
    let gen: RemoteOperationGeneratorBase;
    beforeEach(() => {
        gen = new RemoteOperationGeneratorBase();
    });

    describe('class-name derivation', () => {
        it('joins dotted key segments and appends Operation', () => {
            expect(gen['operationClassName']('RecordProcess.RunNow')).toBe('RecordProcessRunNowOperation');
            expect(gen['operationClassName']('Template.Run')).toBe('TemplateRunOperation');
        });
        it('capitalizes each segment', () => {
            expect(gen['operationClassName']('foo.bar')).toBe('FooBarOperation');
        });
    });

    describe('Manual rows → typed shell', () => {
        it('emits the class with no @RegisterClass and no InternalExecute', async () => {
            const out = await generate([makeOp({ OperationKey: 'Template.Run', GenerationType: 'Manual' })]);
            expect(out).toContain('export class TemplateRunOperation extends BaseRemotableOperation<TestInput, TestOutput>');
            expect(out).not.toContain('@RegisterClass(BaseRemotableOperation');
            expect(out).not.toContain('protected async InternalExecute');
        });
        it('emits the readonly members from metadata', async () => {
            const out = await generate([makeOp({ OperationKey: 'Template.Run', ExecutionMode: 'Sync', RequiredScope: 'template:execute', RequiresSystemUser: false })]);
            expect(out).toContain(`public readonly OperationKey = "Template.Run";`);
            expect(out).toContain(`public readonly ExecutionMode = 'Sync' as const;`);
            expect(out).toContain(`public readonly RequiredScope = "template:execute";`);
            expect(out).toContain(`public readonly RequiresSystemUser = false;`);
        });
        it('emits LongRunning as a const literal', async () => {
            const out = await generate([makeOp({ ExecutionMode: 'LongRunning' })]);
            expect(out).toContain(`public readonly ExecutionMode = 'LongRunning' as const;`);
        });
        it('omits the RequiredScope line when the scope is null', async () => {
            const out = await generate([makeOp({ RequiredScope: null })]);
            expect(out).not.toContain('public readonly RequiredScope');
        });
        it('emits RequiresSystemUser=true when set', async () => {
            const out = await generate([makeOp({ RequiresSystemUser: true })]);
            expect(out).toContain('public readonly RequiresSystemUser = true;');
        });
    });

    describe('AI/Default rows → complete registered class', () => {
        const body = 'const x = 1;\nreturn { ok: true };';
        it('emits @RegisterClass + InternalExecute body when Approved', async () => {
            const out = await generate([
                makeOp({ OperationKey: 'My.Op', GenerationType: 'AI', CodeApprovalStatus: 'Approved', Code: body }),
            ]);
            expect(out).toContain('@RegisterClass(BaseRemotableOperation, "My.Op")');
            expect(out).toContain('protected async InternalExecute(input: TestInput, provider: IMetadataProvider, user: UserInfo): Promise<TestOutput>');
            expect(out).toContain('return { ok: true };');
        });
        it('emits a shell (no body) when AI code is NOT approved', async () => {
            const out = await generate([
                makeOp({ GenerationType: 'AI', CodeApprovalStatus: 'Pending', Code: body }),
            ]);
            expect(out).not.toContain('@RegisterClass(BaseRemotableOperation');
            expect(out).not.toContain('protected async InternalExecute');
        });
        it('emits a shell when Approved but Code is empty', async () => {
            const out = await generate([
                makeOp({ GenerationType: 'AI', CodeApprovalStatus: 'Approved', Code: '   ' }),
            ]);
            expect(out).not.toContain('@RegisterClass(BaseRemotableOperation');
        });
        it('treats Default like AI for body emission', async () => {
            const out = await generate([
                makeOp({ GenerationType: 'Default', CodeApprovalStatus: 'Approved', Code: body }),
            ]);
            expect(out).toContain('@RegisterClass');
            expect(out).toContain('InternalExecute');
        });
    });

    describe('shared type definitions are de-duped', () => {
        it('emits a shared Input/Output definition exactly once across ops', async () => {
            const sharedIn = 'export interface ProcessRunControlInput {\n    processRunID: string;\n}';
            const sharedOut = 'export interface ProcessRunControlOutput {\n    status: string;\n}';
            const mk = (key: string) =>
                makeOp({ OperationKey: key, InputTypeName: 'ProcessRunControlInput', InputTypeDefinition: sharedIn, OutputTypeName: 'ProcessRunControlOutput', OutputTypeDefinition: sharedOut });
            const out = await generate([mk('RecordProcess.PauseRun'), mk('RecordProcess.ResumeRun'), mk('RecordProcess.CancelRun')]);
            expect(out.match(/export interface ProcessRunControlInput/g)?.length).toBe(1);
            expect(out.match(/export interface ProcessRunControlOutput/g)?.length).toBe(1);
            // all three classes still present
            expect(out).toContain('export class RecordProcessPauseRunOperation');
            expect(out).toContain('export class RecordProcessResumeRunOperation');
            expect(out).toContain('export class RecordProcessCancelRunOperation');
        });
        it('de-duplicates shared auxiliary types embedded in multi-declaration blocks', async () => {
            const op1Out = 'export type SharedStatus = "A" | "B";\nexport interface Op1Output {\n    status: SharedStatus;\n}';
            const op2Out = 'export type SharedStatus = "A" | "B";\nexport interface Op2Output {\n    status: SharedStatus;\n}';
            const out = await generate([
                makeOp({ OperationKey: 'Test.Op1', OutputTypeName: 'Op1Output', OutputTypeDefinition: op1Out }),
                makeOp({ OperationKey: 'Test.Op2', OutputTypeName: 'Op2Output', OutputTypeDefinition: op2Out }),
            ]);
            expect(out.match(/export type SharedStatus/g)?.length).toBe(1);
            expect(out).toContain('export interface Op1Output');
            expect(out).toContain('export interface Op2Output');
        });
        it('preserves inner comments and closing braces within interfaces', async () => {
            const opOut = 'export interface OpWithCommentsOutput {\n    id: string;\n    /** Inner comment */\n    amount?: number;\n}';
            const out = await generate([
                makeOp({ OperationKey: 'Test.OpComments', OutputTypeName: 'OpWithCommentsOutput', OutputTypeDefinition: opOut }),
            ]);
            expect(out).toContain('export interface OpWithCommentsOutput {\n    id: string;\n    /** Inner comment */\n    amount?: number;\n}');
        });
    });

    describe('header imports', () => {
        it('Manual-only file imports just BaseRemotableOperation', async () => {
            const out = await generate([makeOp({ GenerationType: 'Manual' })]);
            expect(out).toContain('import { BaseRemotableOperation } from "@memberjunction/core";');
            expect(out).not.toContain('IMetadataProvider');
            expect(out).not.toContain('import { RegisterClass }');
        });
        it('a file with a body imports the essentials + defaults from core, and RegisterClass from global', async () => {
            const out = await generate([
                makeOp({ GenerationType: 'AI', CodeApprovalStatus: 'Approved', Code: 'return { ok: true };' }),
            ]);
            const coreImport = out.split('\n').find((l) => l.includes('from "@memberjunction/core"')) ?? '';
            for (const item of ['BaseRemotableOperation', 'IMetadataProvider', 'UserInfo', ...DEFAULT_REMOTE_OP_LIBRARY_ITEMS]) {
                expect(coreImport).toContain(item);
            }
            expect(out).toContain('import { RegisterClass } from "@memberjunction/global";');
        });
        it('aggregates + de-dups declared libraries across ops, excluding core duplicates', async () => {
            const out = await generate([
                makeOp({ OperationKey: 'A.One', GenerationType: 'AI', CodeApprovalStatus: 'Approved', Code: 'return { ok: true };', LibrariesObject: [{ Library: '@memberjunction/ai-prompts', ItemsUsed: ['AIPromptRunner'] }] }),
                makeOp({ OperationKey: 'A.Two', GenerationType: 'AI', CodeApprovalStatus: 'Approved', Code: 'return { ok: true };', LibrariesObject: [{ Library: '@memberjunction/ai-prompts', ItemsUsed: ['AIPromptParams', 'AIPromptRunner'] }] }),
            ]);
            const promptImport = out.split('\n').find((l) => l.includes('@memberjunction/ai-prompts')) ?? '';
            expect(promptImport).toBe('import { AIPromptParams, AIPromptRunner } from "@memberjunction/ai-prompts";');
            // exactly one ai-prompts import line
            expect(out.match(/@memberjunction\/ai-prompts/g)?.length).toBe(1);
        });
    });

    describe('Status filter + determinism', () => {
        it('skips non-Active rows', async () => {
            const out = await generate([
                makeOp({ OperationKey: 'Live.Op', Status: 'Active' }),
                makeOp({ OperationKey: 'Dead.Op', Status: 'Disabled' }),
            ]);
            expect(out).toContain('LiveOpOperation');
            expect(out).not.toContain('DeadOpOperation');
        });
        it('emits ops sorted by OperationKey', async () => {
            const out = await generate([makeOp({ OperationKey: 'Z.Op' }), makeOp({ OperationKey: 'A.Op' })]);
            expect(out.indexOf('AOpOperation')).toBeLessThan(out.indexOf('ZOpOperation'));
        });
    });

    describe('resolveRemoteOperationSchema', () => {
        const entities = [
            { Name: 'MJ: Record Processes', BaseTable: 'RecordProcess', SchemaName: '__mj' },
            { Name: 'MJ: Templates', BaseTable: 'Template', SchemaName: '__mj' },
            { Name: 'MJ: AI Skills', BaseTable: 'AISkill', SchemaName: '__mj' },
            { Name: 'MJ_BizApps_Orders: Order Headers', BaseTable: 'OrderHeader', SchemaName: '__mj_BizAppsOrders' },
            { Name: 'MJ_BizApps_Orders: Orders', BaseTable: 'Order', SchemaName: '__mj_BizAppsOrders' },
            { Name: 'MJ_BizApps_Sales: Deals', BaseTable: 'Deal', SchemaName: '__mj_BizAppsSales' },
        ];
        const schemas = ['__mj', '__mj_BizAppsOrders', '__mj_BizAppsSales', 'app_custom'];

        it('returns explicit SchemaName if present on the entity', () => {
            const op = Object.assign(makeOp({ OperationKey: 'Orders.PreviewPrice' }), { SchemaName: 'custom_orders' });
            expect(resolveRemoteOperationSchema(op, entities, schemas, '__mj')).toBe('custom_orders');
        });

        it('prioritizes entity match over fuzzy schema name match', () => {
            // Suppose an entity 'RecordProcess' lives in __mj, even if a schema '__mj_bizappsrecordprocess' existed
            const entitiesWithCore = [
                { Name: 'MJ: Record Processes', BaseTable: 'RecordProcess', SchemaName: '__mj' },
            ];
            const testSchemas = ['__mj', '__mj_bizappsrecordprocess'];
            const op = makeOp({ OperationKey: 'RecordProcess.RunNow' });
            expect(resolveRemoteOperationSchema(op, entitiesWithCore, testSchemas, '__mj')).toBe('__mj');
        });

        it('resolves schema matching OpenApp namespace (e.g. Orders -> __mj_BizAppsOrders)', () => {
            const op = makeOp({ OperationKey: 'Orders.PreviewPrice' });
            expect(resolveRemoteOperationSchema(op, entities, schemas, '__mj')).toBe('__mj_BizAppsOrders');
        });

        it('resolves schema matching OpenApp namespace for Sales -> __mj_BizAppsSales', () => {
            const op = makeOp({ OperationKey: 'Sales.CloseDeal' });
            expect(resolveRemoteOperationSchema(op, entities, schemas, '__mj')).toBe('__mj_BizAppsSales');
        });

        it('resolves schema via entity BaseTable match (e.g. RecordProcess -> __mj)', () => {
            const op = makeOp({ OperationKey: 'RecordProcess.RunNow' });
            expect(resolveRemoteOperationSchema(op, entities, schemas, '__mj')).toBe('__mj');
        });

        it('resolves schema via entity Name match (e.g. AISkill -> __mj)', () => {
            const op = makeOp({ OperationKey: 'AISkill.ExportMarkdown' });
            expect(resolveRemoteOperationSchema(op, entities, schemas, '__mj')).toBe('__mj');
        });

        it('core ops without a same-named entity reach core via fallback', () => {
            const op = makeOp({ OperationKey: 'PredictiveStudio.TrainModel' });
            expect(resolveRemoteOperationSchema(op, entities, schemas, '__mj')).toBe('__mj');
        });

        it('non-core op with resolvable schema does not fall back to core', () => {
            const op = makeOp({ OperationKey: 'Orders.RefundPayment' });
            expect(resolveRemoteOperationSchema(op, entities, schemas, '__mj')).not.toBe('__mj');
            expect(resolveRemoteOperationSchema(op, entities, schemas, '__mj')).toBe('__mj_BizAppsOrders');
        });

        it('generator method delegates to resolveRemoteOperationSchema', () => {
            const op = makeOp({ OperationKey: 'Orders.CheckEntitlement' });
            expect(gen.resolveOperationSchema(op, entities, schemas, '__mj')).toBe('__mj_BizAppsOrders');
        });
    });
});
