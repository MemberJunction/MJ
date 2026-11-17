import { describe, it, expect, vi, afterEach } from 'vitest';
import { LogError } from '@memberjunction/core';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { MJAIAgentHarnessEntity, MJAIPromptEntity } from '@memberjunction/core-entities';
import { HarnessAgentBase } from '../HarnessAgentBase.js';
import { AntigravityCliAdapter } from '../adapters/AntigravityCliAdapter.js';
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

    protected override async recordPromptRun(): Promise<undefined> {
        this.LastResolvedModel = this.configuredModel;
        return undefined;
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
});
