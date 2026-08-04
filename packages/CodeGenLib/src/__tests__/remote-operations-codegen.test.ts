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
import { RemoteOperationGeneratorBase, DEFAULT_REMOTE_OP_LIBRARY_ITEMS } from '../Misc/remote_operations_codegen';
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
});
