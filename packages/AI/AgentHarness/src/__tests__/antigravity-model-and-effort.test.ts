import { describe, it, expect, vi, afterEach } from 'vitest';
import { LogError, RunView, type IMetadataProvider, type RunViewResult } from '@memberjunction/core';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { MJAIAgentHarnessEntity, MJAIPromptEntity } from '@memberjunction/core-entities';
import { HarnessAgentBase } from '../HarnessAgentBase.js';
import { AntigravityCliAdapter } from '../adapters/AntigravityCliAdapter.js';
import { AntigravityCloudAdapter } from '../adapters/AntigravityCloudAdapter.js';
import { type CloudJsonObject, type ICloudHttpTransport } from '../adapters/BaseCloudHarnessAdapter.js';
import { ISandboxProvider, SandboxHandle, WorkspaceKey } from '../sandbox/ISandboxProvider.js';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from '../sandbox/SandboxExecutor.js';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

class CapturingAgyExecutor implements SandboxExecutor {
    public LastSpec: HarnessProcessSpec | undefined;

    public Run(spec: HarnessProcessSpec): HarnessProcess {
        this.LastSpec = spec;
        const resultLine = JSON.stringify({
            type: 'result',
            conversation_id: 'agy-conv-1',
            model: 'gemini-4-hydrogen-high',
            result: '{"step":"Success","terminate":true,"message":"done"}',
            usage: { input_tokens: 15, output_tokens: 7 },
        });
        return {
            Stdout: (async function* () {
                yield resultLine;
            })(),
            Stderr: (async function* () {})(),
            ExitCode: Promise.resolve(0),
            Kill: () => undefined,
        };
    }
}

class FakeSandboxProvider implements ISandboxProvider {
    private readonly executor: SandboxExecutor;

    public constructor(executor: SandboxExecutor) {
        this.executor = executor;
    }

    public async Provision(key: WorkspaceKey): Promise<SandboxHandle> {
        return {
            WorkspacePath: '/tmp/community-repo',
            Key: key,
            Ephemeral: false,
            Executor: this.executor,
        };
    }

    public async Finalize(): Promise<void> {}
}

class TestableAntigravityHarnessAgent extends HarnessAgentBase {
    private readonly rawTypeConfig: string;
    private readonly harnessEntity: MJAIAgentHarnessEntity;
    private readonly sandbox: ISandboxProvider;
    public LastResolvedModel: string | undefined;

    public constructor(
        rawTypeConfig: string,
        harnessEntity: MJAIAgentHarnessEntity,
        sandbox: ISandboxProvider,
    ) {
        super();
        this.rawTypeConfig = rawTypeConfig;
        this.harnessEntity = harnessEntity;
        this.sandbox = sandbox;
    }

    public override async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        return super.executePrompt(promptParams);
    }

    protected override _agentTypeConfiguration(): string | null {
        return this.rawTypeConfig;
    }

    protected override _agentRunAgentId(): string {
        return 'agent-id-1';
    }

    protected override _agentRunId(): string {
        return 'run-id-1';
    }

    protected override async loadHarnessRow(): Promise<MJAIAgentHarnessEntity> {
        return this.harnessEntity;
    }

    protected override resolveAdapter(): AntigravityCliAdapter {
        const adapter = new AntigravityCliAdapter();
        if (this.harnessEntity.ExecutablePath) {
            adapter.SetExecutable(this.harnessEntity.ExecutablePath);
        }
        return adapter;
    }

    protected override createSandboxProvider(): ISandboxProvider {
        return this.sandbox;
    }

    protected override async resolveGrantedEnvironment(): Promise<Record<string, string>> {
        return { GEMINI_API_KEY: 'test-gemini-key' };
    }

    protected override async findResumableSession(): Promise<string | undefined> {
        return undefined;
    }

    protected override async renderSystemPrompt(): Promise<string> {
        return 'System prompt instructions';
    }

    public GetConfiguredModelForTest(): string | undefined {
        return this.configuredModel;
    }

    public GetConfiguredEffortForTest(): string | undefined {
        return this.configuredEffort;
    }

    public GetHarnessRowForTest(): MJAIAgentHarnessEntity | null {
        return this.harnessRow;
    }

    public GetSessionEnvironmentForTest(): Record<string, string> {
        return this.sessionEnvironment;
    }

    protected override async recordPromptRun(): Promise<undefined> {
        this.LastResolvedModel = this.configuredModel;
        return undefined;
    }
}

class RealRecordHarnessAgent extends HarnessAgentBase {
    private readonly rawTypeConfig: string;
    private readonly harnessEntity: MJAIAgentHarnessEntity;
    private readonly sandbox: ISandboxProvider;
    public SavedRun: { ModelID?: string; VendorID?: string; EffortLevel?: number } | undefined;

    public constructor(
        rawTypeConfig: string,
        harnessEntity: MJAIAgentHarnessEntity,
        sandbox: ISandboxProvider,
    ) {
        super();
        this.rawTypeConfig = rawTypeConfig;
        this.harnessEntity = harnessEntity;
        this.sandbox = sandbox;
    }

    public override async executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        return super.executePrompt(promptParams);
    }

    protected override _agentTypeConfiguration(): string | null {
        return this.rawTypeConfig;
    }

    protected override _agentRunAgentId(): string {
        return 'agent-id-real';
    }

    protected override _agentRunId(): string {
        return 'run-id-real';
    }

    protected override async loadHarnessRow(): Promise<MJAIAgentHarnessEntity> {
        return this.harnessEntity;
    }

    protected override resolveAdapter(): AntigravityCliAdapter {
        const adapter = new AntigravityCliAdapter();
        if (this.harnessEntity.ExecutablePath) {
            adapter.SetExecutable(this.harnessEntity.ExecutablePath);
        }
        return adapter;
    }

    protected override createSandboxProvider(): ISandboxProvider {
        return this.sandbox;
    }

    protected override async resolveGrantedEnvironment(): Promise<Record<string, string>> {
        return { GEMINI_API_KEY: 'test-gemini-key' };
    }

    protected override async findResumableSession(): Promise<string | undefined> {
        return undefined;
    }

    protected override async renderSystemPrompt(): Promise<string> {
        return 'System prompt instructions';
    }

    protected override get ProviderToUse(): IMetadataProvider {
        const saved = {
            ModelID: '',
            VendorID: '',
            EffortLevel: undefined as number | undefined,
            NewRecord: () => undefined,
            Save: async () => {
                this.SavedRun = saved;
                return true;
            },
        };
        const provider: Partial<IMetadataProvider> = {
            GetEntityObject: (async () => saved) as IMetadataProvider['GetEntityObject'],
        };
        return provider as IMetadataProvider;
    }
}

describe('HarnessAgentBase model & effort forwarding to AntigravityCliAdapter', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('forwards TypeConfiguration.model and TypeConfiguration.effort=high to agy CLI without unknown-key warnings', async () => {
        const executor = new CapturingAgyExecutor();
        const harness = {
            ID: '83B96013-4591-4FDC-B755-E4B6A656C35F',
            Name: 'Google Antigravity (CLI)',
            DriverClass: 'AntigravityCliAdapter',
            ExecutablePath: '/Users/amith/.local/bin/agy',
            DefaultModel: 'gemini-4-hydrogen-medium',
            AIModelID: 'B5F93D02-82A5-4C94-AE23-9D4B5F607111',
            AIVendorID: 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E',
        } as MJAIAgentHarnessEntity;

        const agent = new TestableAntigravityHarnessAgent(
            JSON.stringify({
                harnessName: 'Google Antigravity (CLI)',
                model: 'gemini-4-hydrogen-high',
                effort: 'high',
                posture: 'auto',
            }),
            harness,
            new FakeSandboxProvider(executor),
        );

        const promptParams = {
            conversationMessages: [{ role: 'user', content: 'Build feature' }],
        } as AIPromptParams;

        await agent.executePrompt(promptParams);

        const args = executor.LastSpec?.Args ?? [];
        const modelIdx = args.indexOf('--model');
        const effortIdx = args.indexOf('--effort');
        expect(modelIdx).toBeGreaterThan(-1);
        expect(args[modelIdx + 1]).toBe('gemini-4-hydrogen-high');
        expect(effortIdx).toBeGreaterThan(-1);
        expect(args[effortIdx + 1]).toBe('high');
        expect(agent.LastResolvedModel).toBe('gemini-4-hydrogen-high');
        expect(vi.mocked(LogError)).not.toHaveBeenCalled();
    });

    it('maps numeric prompt.EffortLevel to --effort high when config.effort is omitted', async () => {
        const executor = new CapturingAgyExecutor();
        const harness = {
            ID: '83B96013-4591-4FDC-B755-E4B6A656C35F',
            Name: 'Google Antigravity (CLI)',
            DriverClass: 'AntigravityCliAdapter',
            ExecutablePath: 'agy',
            DefaultModel: 'gemini-4-hydrogen-high',
            AIModelID: 'B5F93D02-82A5-4C94-AE23-9D4B5F607222',
            AIVendorID: 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E',
        } as MJAIAgentHarnessEntity;

        const agent = new TestableAntigravityHarnessAgent(
            JSON.stringify({
                harnessName: 'Google Antigravity (CLI)',
                posture: 'auto',
            }),
            harness,
            new FakeSandboxProvider(executor),
        );

        const promptParams = {
            conversationMessages: [{ role: 'user', content: 'Build feature' }],
            prompt: { EffortLevel: 95 } as MJAIPromptEntity,
        } as AIPromptParams;

        await agent.executePrompt(promptParams);

        const args = executor.LastSpec?.Args ?? [];
        const modelIdx = args.indexOf('--model');
        const effortIdx = args.indexOf('--effort');
        expect(args[modelIdx + 1]).toBe('gemini-4-hydrogen-high');
        expect(args[effortIdx + 1]).toBe('high');
    });

    it('preserves --model and --effort on Turn 2 --conversation resume and clears state on EndHarnessSession', async () => {
        const executor = new CapturingAgyExecutor();
        const harness = {
            ID: '83B96013-4591-4FDC-B755-E4B6A656C35F',
            Name: 'Google Antigravity (CLI)',
            DriverClass: 'AntigravityCliAdapter',
            ExecutablePath: 'agy',
            DefaultModel: 'gemini-4-hydrogen-high',
            AIModelID: 'B5F93D02-82A5-4C94-AE23-9D4B5F607222',
            AIVendorID: 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E',
        } as MJAIAgentHarnessEntity;

        const agent = new TestableAntigravityHarnessAgent(
            JSON.stringify({
                harnessName: 'Google Antigravity (CLI)',
                model: 'gemini-4-hydrogen-high',
                effort: 'high',
                posture: 'auto',
            }),
            harness,
            new FakeSandboxProvider(executor),
        );

        await agent.executePrompt({
            conversationMessages: [{ role: 'user', content: 'Turn 1' }],
        } as AIPromptParams);
        await agent.executePrompt({
            conversationMessages: [{ role: 'user', content: 'Turn 2' }],
        } as AIPromptParams);

        const args2 = executor.LastSpec?.Args ?? [];
        expect(args2).toContain('--conversation');
        expect(args2).toContain('agy-conv-1');
        expect(args2[args2.indexOf('--model') + 1]).toBe('gemini-4-hydrogen-high');
        expect(args2[args2.indexOf('--effort') + 1]).toBe('high');

        await agent.EndHarnessSession('success');
        expect(agent.GetConfiguredModelForTest()).toBeUndefined();
        expect(agent.GetConfiguredEffortForTest()).toBeUndefined();
        expect(agent.GetHarnessRowForTest()).toBeNull();
        expect(agent.GetSessionEnvironmentForTest()).toEqual({});
    });

    it('applies effort precedence (config.effort > promptParams.effortLevel > prompt.EffortLevel) and boundary rules', async () => {
        const cases: Array<{
            configEffort?: string | number;
            paramEffort?: string;
            promptEffort?: number;
            expectedEffort: string | undefined;
        }> = [
            { configEffort: 'medium', paramEffort: 'low', promptEffort: 99, expectedEffort: 'medium' },
            { configEffort: undefined, paramEffort: 'xhigh', promptEffort: 10, expectedEffort: 'high' },
            { configEffort: undefined, paramEffort: 'max', promptEffort: 10, expectedEffort: 'high' },
            { configEffort: undefined, paramEffort: '33', promptEffort: 90, expectedEffort: 'low' },
            { configEffort: undefined, paramEffort: '34', promptEffort: 90, expectedEffort: 'medium' },
            { configEffort: undefined, paramEffort: '66', promptEffort: 10, expectedEffort: 'medium' },
            { configEffort: undefined, paramEffort: '67', promptEffort: 10, expectedEffort: 'high' },
            { configEffort: 0, paramEffort: undefined, promptEffort: undefined, expectedEffort: undefined },
            { configEffort: -5, paramEffort: undefined, promptEffort: undefined, expectedEffort: undefined },
            { configEffort: 'not-valid', paramEffort: undefined, promptEffort: undefined, expectedEffort: undefined },
        ];

        for (const c of cases) {
            const executor = new CapturingAgyExecutor();
            const harness = {
                ID: '83B96013-4591-4FDC-B755-E4B6A656C35F',
                Name: 'Google Antigravity (CLI)',
                DriverClass: 'AntigravityCliAdapter',
                ExecutablePath: 'agy',
                DefaultModel: 'gemini-4-hydrogen-high',
                AIModelID: 'B5F93D02-82A5-4C94-AE23-9D4B5F607222',
                AIVendorID: 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E',
            } as MJAIAgentHarnessEntity;

            const agent = new TestableAntigravityHarnessAgent(
                JSON.stringify({
                    harnessName: 'Google Antigravity (CLI)',
                    ...(c.configEffort !== undefined ? { effort: c.configEffort } : {}),
                }),
                harness,
                new FakeSandboxProvider(executor),
            );
            await agent.executePrompt({
                conversationMessages: [{ role: 'user', content: 'Test boundary' }],
                ...(c.paramEffort !== undefined ? { effortLevel: c.paramEffort } : {}),
                ...(c.promptEffort !== undefined ? { prompt: { EffortLevel: c.promptEffort } as MJAIPromptEntity } : {}),
            } as AIPromptParams);

            const args = executor.LastSpec?.Args ?? [];
            const effortIdx = args.indexOf('--effort');
            if (c.expectedEffort === undefined) {
                expect(effortIdx).toBe(-1);
            } else {
                expect(args[effortIdx + 1]).toBe(c.expectedEffort);
            }
        }
    });

    it('falls back to configuredModel when CLI strips tier suffix and persists EffortLevel on AIPromptRun', async () => {
        const strippedExecutor: SandboxExecutor = {
            Run: () => ({
                Stdout: (async function* () {
                    yield JSON.stringify({
                        type: 'result',
                        conversation_id: 'agy-conv-stripped',
                        model: 'gemini-4-hydrogen',
                        result: '{"step":"Success","terminate":true,"message":"done"}',
                        usage: { input_tokens: 10, output_tokens: 5 },
                    });
                })(),
                Stderr: (async function* () {})(),
                ExitCode: Promise.resolve(0),
                Kill: () => undefined,
            }),
        };

        const runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: { ExtraFilter?: string }) => {
            if (params.ExtraFilter?.includes('gemini-4-hydrogen-medium')) {
                const res: RunViewResult<{ ModelID: string }> = {
                    Success: true,
                    Results: [{ ModelID: 'B5F93D02-82A5-4C94-AE23-9D4B5F607111' }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 0,
                    ErrorMessage: '',
                    UserView: null,
                };
                return res;
            }
            const emptyRes: RunViewResult<{ ModelID: string }> = {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0,
                ErrorMessage: '',
                UserView: null,
            };
            return emptyRes;
        });

        try {
            const harness = {
                ID: '83B96013-4591-4FDC-B755-E4B6A656C35F',
                Name: 'Google Antigravity (CLI)',
                DriverClass: 'AntigravityCliAdapter',
                ExecutablePath: 'agy',
                DefaultModel: 'gemini-4-hydrogen-high',
                AIModelID: 'B5F93D02-82A5-4C94-AE23-9D4B5F607222',
                AIVendorID: 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E',
            } as MJAIAgentHarnessEntity;

            const agent = new RealRecordHarnessAgent(
                JSON.stringify({
                    harnessName: 'Google Antigravity (CLI)',
                    model: 'gemini-4-hydrogen-medium',
                    effort: 'medium',
                }),
                harness,
                new FakeSandboxProvider(strippedExecutor),
            );

            await agent.executePrompt({
                conversationMessages: [{ role: 'user', content: 'Run medium' }],
                prompt: { ID: 'prompt-id-1' } as MJAIPromptEntity,
            } as AIPromptParams);

            expect(agent.SavedRun?.ModelID).toBe('B5F93D02-82A5-4C94-AE23-9D4B5F607111');
            expect(agent.SavedRun?.EffortLevel).toBe(50);
        } finally {
            runViewSpy.mockRestore();
        }
    });

    it('AntigravityCloudAdapter defaults to gemini-4-hydrogen-high and forwards SetEffort thinking_level', async () => {
        let capturedBody: CloudJsonObject | undefined;
        const transport: ICloudHttpTransport = {
            Send: async (req) => {
                if (req.Method === 'POST') {
                    capturedBody = JSON.parse(req.Body ?? '{}') as CloudJsonObject;
                }
                return {
                    Status: 200,
                    Ok: true,
                    StatusText: 'OK',
                    Headers: { 'content-type': 'application/json' },
                    BodyText: JSON.stringify({ id: 'int-1', status: 'completed', outputs: [{ text: 'OK' }] }),
                    Json: { id: 'int-1', status: 'completed', outputs: [{ text: 'OK' }] },
                };
            },
        };
        const cloudAdapter = new AntigravityCloudAdapter(transport);
        cloudAdapter.SetEffort('high');
        await cloudAdapter.StartSession({
            PermissionPolicy: { Posture: 'auto' },
            Executor: new CapturingAgyExecutor(),
            WorkspacePath: 'cloud://run/r2',
            Environment: { GEMINI_API_KEY: 'key-123' },
        });
        for await (const _event of cloudAdapter.RunTurn('Check effort')) {
            // drain events
        }

        expect(capturedBody?.model).toBe('gemini-4-hydrogen-high');
        expect((capturedBody?.generation_config as { thinking_config?: { thinking_level?: string } })?.thinking_config?.thinking_level).toBe('high');
    });
});
