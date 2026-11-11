import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
    AntigravityCliAdapter,
    AntigravityCloudAdapter,
    BaseHarnessAdapter,
    ClaudeCodeCliAdapter,
    ClaudeCodeCloudAdapter,
    CloudDetachedSessionRegistry,
    CloudDisallowedProcessExecutor,
    CloudHttpRequest,
    CloudHttpResponse,
    CloudJsonObject,
    CloudSandboxProvider,
    CodexCloudAdapter,
    DEFAULT_ANTIGRAVITY_CLOUD_API_URL,
    DEFAULT_ANTIGRAVITY_CLOUD_MODEL,
    DEFAULT_ANTHROPIC_VERSION,
    DEFAULT_CLAUDE_CLOUD_API_URL,
    DEFAULT_CODEX_CLOUD_API_URL,
    HarnessAgentBase,
    HarnessAgentConfig,
    HarnessProcess,
    HarnessProcessSpec,
    HarnessSessionConfig,
    HarnessTurnEvent,
    ICloudHttpTransport,
    ISandboxProvider,
    LoadAgentHarnessAdapters,
    NormalizeAntigravityEnvironment,
    ParseCloudJsonObject,
    ResolveDriverVendorFallbackEnvironment,
    ResolveProviderCredentialSecret,
    SandboxExecutor,
} from '../index.js';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

// Ensure all @RegisterClass decorators fire
LoadAgentHarnessAdapters();

// ============================================================================
// Strongly-Typed Test Doubles (Zero `any`, Zero `unknown`)
// ============================================================================

interface RecordedCliRun {
    Spec: HarnessProcessSpec;
}

class MockCliSandboxExecutor implements SandboxExecutor {
    public readonly Runs: RecordedCliRun[] = [];
    private readonly lineBatches: string[][];

    public constructor(lineBatches: string[][]) {
        this.lineBatches = lineBatches;
    }

    public Run(spec: HarnessProcessSpec): HarnessProcess {
        const batchIndex = Math.min(this.Runs.length, this.lineBatches.length - 1);
        const lines = this.lineBatches[batchIndex] ?? [];
        this.Runs.push({ Spec: spec });

        return {
            Stdout: (async function* () {
                for (const line of lines) {
                    yield line;
                }
            })(),
            Stderr: (async function* () {})(),
            ExitCode: Promise.resolve(0),
            Kill: () => undefined,
        };
    }
}

type MockRouteHandler = (request: CloudHttpRequest) => CloudHttpResponse | Promise<CloudHttpResponse>;

class MockCloudHttpTransport implements ICloudHttpTransport {
    public readonly Requests: CloudHttpRequest[] = [];
    private readonly handler: MockRouteHandler;

    public constructor(handler: MockRouteHandler) {
        this.handler = handler;
    }

    public async Send(request: CloudHttpRequest): Promise<CloudHttpResponse> {
        this.Requests.push(request);
        return await this.handler(request);
    }
}

function jsonHttpResponse(body: CloudJsonObject, status = 200): CloudHttpResponse {
    const bodyText = JSON.stringify(body);
    return {
        Status: status,
        Ok: status >= 200 && status < 300,
        StatusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
        Headers: { 'content-type': 'application/json' },
        BodyText: bodyText,
        Json: body,
    };
}

async function collectEvents(iterable: AsyncIterable<HarnessTurnEvent>): Promise<HarnessTurnEvent[]> {
    const collected: HarnessTurnEvent[] = [];
    for await (const event of iterable) {
        collected.push(event);
    }
    return collected;
}

const NOOP_CLOUD_EXECUTOR = new CloudDisallowedProcessExecutor('cloud://unit-test');

interface MetadataHarnessRecord {
    fields: {
        Name: string;
        DriverClass: string;
        CapabilitySettings?: Record<string, boolean>;
        Status: string;
    };
    primaryKey: {
        ID: string;
    };
}

/** Narrow structural interface for testing HarnessAgentBase cloud integration hooks without `any` or `unknown`. */
interface HarnessAgentBaseTestAccess {
    createSandboxProvider(config: HarnessAgentConfig): ISandboxProvider;
    resolveMcpSessionEndpoint(config: HarnessAgentConfig): {
        mcpServerUrl?: string;
        mcpCredential?: string;
    };
    findResumableSession(
        harness: { Name: string },
        scope: 'run' | 'agent' | 'agent-user',
    ): Promise<string | undefined>;
    persistExternalSessionId(sessionId: string | undefined): void;
}

class InspectableHarnessAgent extends HarnessAgentBase {
    public SetAdapterForTest(adapter: BaseHarnessAdapter | null): void {
        Reflect.set(this, 'adapter', adapter);
    }

    public SetAgentRunForTest(run: { ID: string; ExternalSessionID: string | null }): void {
        Reflect.set(this, '_agentRun', run);
    }

    public CreateSandboxForTest(config: HarnessAgentConfig): ISandboxProvider {
        const access = Reflect.get(this, 'createSandboxProvider') as HarnessAgentBaseTestAccess['createSandboxProvider'];
        return access.call(this, config);
    }

    public ResolveMcpForTest(config: HarnessAgentConfig): {
        mcpServerUrl?: string;
        mcpCredential?: string;
    } {
        const access = Reflect.get(this, 'resolveMcpSessionEndpoint') as HarnessAgentBaseTestAccess['resolveMcpSessionEndpoint'];
        return access.call(this, config);
    }

    public FindResumableForTest(
        harnessName: string,
        scope: 'run' | 'agent' | 'agent-user',
    ): Promise<string | undefined> {
        const access = Reflect.get(this, 'findResumableSession') as HarnessAgentBaseTestAccess['findResumableSession'];
        return access.call(this, { Name: harnessName }, scope);
    }

    public PersistExternalSessionForTest(sessionId: string | undefined): void {
        const access = Reflect.get(this, 'persistExternalSessionId') as HarnessAgentBaseTestAccess['persistExternalSessionId'];
        access.call(this, sessionId);
    }
}

// ============================================================================
// Test Suites
// ============================================================================

describe('CloudSandboxProvider & Fail-Closed CloudDisallowedProcessExecutor', () => {
    it('provisions a cloud handle with normalized metadata, CleanupToken, and cloud:// WorkspacePath', async () => {
        const provider = new CloudSandboxProvider();
        expect(provider.Name).toBe('cloud');

        const handle = await provider.Provision('sess-alpha-01', {
            provider: 'cloud',
            NetworkPolicy: 'mcp-only',
            cloud: {
                endpointUrl: 'https://cloud.example.com/v1/sessions///',
                region: 'us-central1',
                projectId: 'mj-prod-123',
                environmentId: 'env-abc',
                repositoryUrl: 'https://github.com/MemberJunction/MJ',
                gitRef: 'refs/heads/next',
                gitBranch: 'feat/cloud-test',
                networkAccess: 'restricted',
                waitMode: 'adaptive-wake',
                turnWaitBudgetMs: 45_000,
                pollIntervalMs: 1_500,
                mcpExternalServerUrl: 'https://mcp-tunnel.example.com/mcp/',
                extraHeaders: { 'X-Tenant-ID': 'tenant-42' },
            },
        });

        expect(handle.Provider).toBe('cloud');
        expect(handle.WorkspacePath).toBe('cloud://sess-alpha-01');
        expect(handle.Ephemeral).toBe(true);
        expect(provider.IsSessionActive('sess-alpha-01')).toBe(true);
        expect(handle.CleanupToken).toBeDefined();

        const cleanupObj = ParseCloudJsonObject(handle.CleanupToken ?? '');
        expect(cleanupObj?.provider).toBe('cloud');
        expect(cleanupObj?.sessionKey).toBe('sess-alpha-01');
        expect(cleanupObj?.environmentId).toBe('env-abc');

        expect(handle.Metadata).toEqual({
            Provider: 'cloud',
            SessionKey: 'sess-alpha-01',
            EndpointUrl: 'https://cloud.example.com/v1/sessions',
            Region: 'us-central1',
            ProjectId: 'mj-prod-123',
            EnvironmentId: 'env-abc',
            RepositoryUrl: 'https://github.com/MemberJunction/MJ',
            GitRef: 'refs/heads/next',
            GitBranch: 'feat/cloud-test',
            NetworkAccess: 'restricted',
            WaitMode: 'adaptive-wake',
            TurnWaitBudgetMs: 45_000,
            PollIntervalMs: 1_500,
            McpExternalServerUrl: 'https://mcp-tunnel.example.com/mcp',
            ExtraHeaders: { 'X-Tenant-ID': 'tenant-42' },
        });

        await provider.Finalize(handle, 'success');
        expect(provider.IsSessionActive('sess-alpha-01')).toBe(false);
    });

    it('derives deterministic cloud:// paths from WorkspaceKey scopes and maps NetworkPolicy defaults', async () => {
        const provider = new CloudSandboxProvider();
        const durableHandle = await provider.Provision(
            { Scope: 'agent-user', AgentId: 'agent-7', UserId: 'user-9', RunId: 'run-99' },
            { NetworkPolicy: 'none' },
        );

        expect(durableHandle.WorkspacePath).toBe('cloud://agent-user/agent-7/user-9');
        expect(durableHandle.Ephemeral).toBe(false);
        expect(durableHandle.Metadata?.NetworkAccess).toBe('none');
        expect(durableHandle.Metadata?.WaitMode).toBe('bounded-poll');
    });

    it('fails closed on Spawn() and Run() if any CLI adapter attempts host execution under provider === cloud', async () => {
        const provider = new CloudSandboxProvider();
        const handle = await provider.Provision('isolated-session', { provider: 'cloud' });

        expect(handle.Executor).toBeInstanceOf(CloudDisallowedProcessExecutor);
        const executor = handle.Executor as CloudDisallowedProcessExecutor;

        expect(() =>
            executor.Spawn({
                Command: 'claude',
                Args: ['-p', 'hi'],
                Environment: {},
            }),
        ).toThrow(/Host-isolation violation.*cannot spawn local 'claude'/i);

        // Verify a CLI-only adapter paired with a cloud sandbox handle surfaces a clean session-error
        const cliAdapter = new ClaudeCodeCliAdapter();
        await cliAdapter.StartSession({
            Executor: handle.Executor,
            WorkspacePath: handle.WorkspacePath,
            Environment: { ANTHROPIC_API_KEY: 'sk-ant-test' },
        });
        const events = await collectEvents(cliAdapter.RunTurn('attempt host spawn'));
        expect(events).toHaveLength(1);
        expect(events[0]?.Type).toBe('session-error');
        if (events[0]?.Type === 'session-error') {
            expect(events[0].Error).toMatch(/Host-isolation violation/i);
        }
    });
});

describe('ClassFactory Registration & Metadata Seed Parity', () => {
    it('registers all four new adapters with ClassFactory and agrees 100% with .agent-harnesses.json', () => {
        const factory = MJGlobal.Instance.ClassFactory;
        const expectedDrivers = [
            'AntigravityCliAdapter',
            'AntigravityCloudAdapter',
            'ClaudeCodeCloudAdapter',
            'CodexCloudAdapter',
        ];

        for (const driver of expectedDrivers) {
            const instance = factory.CreateInstance<BaseHarnessAdapter>(BaseHarnessAdapter, driver);
            expect(instance).toBeDefined();
        }

        const metadataPath = resolve(
            import.meta.dirname,
            '../../../../../metadata/agent-harnesses/.agent-harnesses.json',
        );
        const records = JSON.parse(readFileSync(metadataPath, 'utf8')) as MetadataHarnessRecord[];

        const expectedSeeds: Array<{ Name: string; DriverClass: string }> = [
            { Name: 'Google Antigravity (Cloud)', DriverClass: 'AntigravityCloudAdapter' },
            { Name: 'Google Antigravity (CLI)', DriverClass: 'AntigravityCliAdapter' },
            { Name: 'Claude Code (Cloud)', DriverClass: 'ClaudeCodeCloudAdapter' },
            { Name: 'OpenAI Codex (Cloud)', DriverClass: 'CodexCloudAdapter' },
        ];

        const uuidV4Pattern =
            /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;

        for (const seed of expectedSeeds) {
            const match = records.find((r) => r.fields.Name === seed.Name);
            expect(match).toBeDefined();
            expect(match?.fields.DriverClass).toBe(seed.DriverClass);
            expect(match?.primaryKey.ID).toMatch(uuidV4Pattern);

            const adapter = factory.CreateInstance<BaseHarnessAdapter>(
                BaseHarnessAdapter,
                seed.DriverClass,
            )!;
            const capabilitiesRecord = adapter.Capabilities as Record<string, boolean | undefined>;
            const declaredSettings = match?.fields.CapabilitySettings ?? {};

            for (const [capKey, declaredVal] of Object.entries(declaredSettings)) {
                expect(capabilitiesRecord[capKey]).toBe(declaredVal);
            }
        }
    });
});

describe('AntigravityCliAdapter', () => {
    it('builds verified agy CLI flags, normalizes ANTIGRAVITY_API_KEY -> GEMINI_API_KEY, and streams JSONL events', async () => {
        const turn1Lines = [
            JSON.stringify({
                type: 'thinking',
                conversation_id: 'agy-conv-77',
                thought: 'Inspecting workspace layout',
            }),
            JSON.stringify({
                type: 'tool_call',
                id: 'tc-1',
                name: 'view_file',
                args: { Path: '/workspace/README.md' },
            }),
            JSON.stringify({
                type: 'tool_result',
                tool_call_id: 'tc-1',
                name: 'view_file',
                output: '# Project Readme',
            }),
            JSON.stringify({
                type: 'assistant',
                model: 'gemini-3.8-flash',
                text: 'Checked README.',
            }),
            JSON.stringify({
                type: 'result',
                conversation_id: 'agy-conv-77',
                result: '{"taskComplete":true,"message":"Done","reasoning":"Read file"}',
                total_cost_usd: 0.042,
                usage_metadata: {
                    prompt_token_count: 500,
                    candidates_token_count: 110,
                    thoughts_token_count: 45,
                },
            }),
        ];

        const turn2Lines = [
            JSON.stringify({
                type: 'result',
                conversation_id: 'agy-conv-77',
                result: '{"taskComplete":true,"message":"Turn 2 complete","reasoning":"Resumed"}',
                usage: { input_tokens: 120, output_tokens: 40 },
            }),
        ];

        const executor = new MockCliSandboxExecutor([turn1Lines, turn2Lines]);
        const adapter = new AntigravityCliAdapter();
        adapter.ApplyPermissionPolicy({ Posture: 'auto' });
        adapter.SetSystemPrompt('Always respond with MJ Loop JSON.');
        adapter.SetAgent('architect');
        adapter.SetEffort('high');

        await adapter.StartSession({
            Executor: executor,
            WorkspacePath: '/workspace/repo',
            Environment: { ANTIGRAVITY_API_KEY: 'agy-secret-key' },
            Model: 'gemini-3.1-pro-preview',
        });

        const events1 = await collectEvents(adapter.RunTurn('Summarize README'));
        expect(executor.Runs).toHaveLength(1);

        const spec1 = executor.Runs[0]!.Spec;
        expect(spec1.Command).toBe('agy');
        expect(spec1.Environment.GEMINI_API_KEY).toBe('agy-secret-key');
        expect(spec1.Environment.GOOGLE_API_KEY).toBe('agy-secret-key');
        expect(spec1.Environment.ANTIGRAVITY_API_KEY).toBe('agy-secret-key');
        expect(spec1.Args).toEqual(
            expect.arrayContaining([
                '--output-format',
                'stream-json',
                '--add-dir',
                '/workspace/repo',
                '--model',
                'gemini-3.1-pro-preview',
                '--agent',
                'architect',
                '--effort',
                'high',
                '--mode',
                'accept-edits',
                '--sandbox',
            ]),
        );
        expect(spec1.Args[1]).toContain('Always respond with MJ Loop JSON.');
        expect(adapter.SessionId).toBe('agy-conv-77');
        expect(adapter.ReportedModel).toBe('gemini-3.8-flash');

        expect(events1).toEqual([
            { Type: 'thinking-delta', Text: 'Inspecting workspace layout' },
            {
                Type: 'tool-use-start',
                ToolCallId: 'tc-1',
                ToolName: 'view_file',
                ArgumentsJson: '{"Path":"/workspace/README.md"}',
            },
            {
                Type: 'tool-result',
                ToolCallId: 'tc-1',
                ToolName: 'view_file',
                Output: '# Project Readme',
                IsError: false,
            },
            { Type: 'assistant-text', Text: 'Checked README.' },
            {
                Type: 'usage',
                InputTokens: 500,
                OutputTokens: 110,
                PromptTokens: 500,
                CompletionTokens: 110,
                ThinkingTokens: 45,
                CostUsd: 0.042,
            },
            {
                Type: 'turn-complete',
                RawText: '{"taskComplete":true,"message":"Done","reasoning":"Read file"}',
            },
        ]);

        // Second turn resumes via --conversation agy-conv-77
        await collectEvents(adapter.RunTurn('Continue'));
        expect(executor.Runs[1]?.Spec.Args).toEqual(
            expect.arrayContaining(['--conversation', 'agy-conv-77']),
        );
    });

    it('translates strict and dangerous postures accurately for agy CLI', () => {
        const strictAdapter = new AntigravityCliAdapter();
        strictAdapter.ApplyPermissionPolicy({ Posture: 'strict' });
        const dangerousAdapter = new AntigravityCliAdapter();
        dangerousAdapter.ApplyPermissionPolicy({ Posture: 'dangerous' });

        const exec = new MockCliSandboxExecutor([
            [JSON.stringify({ response: '{"taskComplete":true,"message":"ok","reasoning":"ok"}' })],
            [JSON.stringify({ response: '{"taskComplete":true,"message":"ok","reasoning":"ok"}' })],
        ]);

        return (async () => {
            await strictAdapter.StartSession({
                Executor: exec,
                WorkspacePath: '/ws',
                Environment: { GEMINI_API_KEY: 'k' },
            });
            await collectEvents(strictAdapter.RunTurn('strict check'));
            expect(exec.Runs[0]?.Spec.Args).toEqual(
                expect.arrayContaining(['--mode', 'plan', '--sandbox']),
            );

            await dangerousAdapter.StartSession({
                Executor: exec,
                WorkspacePath: '/ws',
                Environment: { GEMINI_API_KEY: 'k' },
            });
            await collectEvents(dangerousAdapter.RunTurn('dangerous check'));
            expect(exec.Runs[1]?.Spec.Args).toContain('--dangerously-skip-permissions');
        })();
    });
});

describe('AntigravityCloudAdapter — bounded-poll, adaptive-wake handoff & resume', () => {
    beforeEach(() => {
        CloudDetachedSessionRegistry.Instance.ClearAll();
    });

    afterEach(() => {
        CloudDetachedSessionRegistry.Instance.ClearAll();
    });

    it('submits background interaction with x-goog-api-key, MCP tools, repo context, and bounded-polls to completion', async () => {
        let pollCounter = 0;
        const transport = new MockCloudHttpTransport((req) => {
            if (req.Method === 'POST' && req.Url === DEFAULT_ANTIGRAVITY_CLOUD_API_URL) {
                return jsonHttpResponse({
                    id: 'interactions/int-agy-001',
                    status: 'in_progress',
                    model: DEFAULT_ANTIGRAVITY_CLOUD_MODEL,
                    outputs: [
                        { id: 'th-1', type: 'thought', summary: 'Planning repository changes' },
                    ],
                });
            }
            if (req.Method === 'GET' && req.Url === `${DEFAULT_ANTIGRAVITY_CLOUD_API_URL}/int-agy-001`) {
                pollCounter++;
                if (pollCounter === 1) {
                    return jsonHttpResponse({
                        id: 'int-agy-001',
                        status: 'in_progress',
                        outputs: [
                            { id: 'th-1', type: 'thought', summary: 'Planning repository changes' },
                            {
                                id: 'call-1',
                                type: 'mcp_call',
                                name: 'mj_run_view',
                                args: { entityName: 'MJ: Users' },
                            },
                        ],
                    });
                }
                return jsonHttpResponse({
                    id: 'int-agy-001',
                    status: 'completed',
                    model: 'gemini-3.1-pro-preview',
                    outputs: [
                        { id: 'th-1', type: 'thought', summary: 'Planning repository changes' },
                        {
                            id: 'call-1',
                            type: 'mcp_call',
                            name: 'mj_run_view',
                            args: { entityName: 'MJ: Users' },
                        },
                        {
                            id: 'res-1',
                            type: 'mcp_result',
                            call_id: 'call-1',
                            name: 'mj_run_view',
                            output: '[{"Name":"Alice"}]',
                        },
                        {
                            id: 'txt-1',
                            type: 'text',
                            text: '{"taskComplete":true,"message":"Users audited","reasoning":"Queried via MCP"}',
                        },
                    ],
                    usage_metadata: {
                        prompt_token_count: 820,
                        candidates_token_count: 190,
                        thoughts_token_count: 65,
                        cost_usd: 0.031,
                    },
                });
            }
            return jsonHttpResponse({ error: { message: 'Unexpected route' } }, 500);
        });

        const adapter = new AntigravityCloudAdapter(transport);
        adapter.SetSleepImpl(async () => undefined);
        adapter.SetSystemPrompt('Emit MJ Loop JSON.');
        adapter.ApplyPermissionPolicy({
            Posture: 'auto',
            AllowedTools: ['mj_run_view'],
            DisallowedTools: ['run_command'],
        });

        await adapter.StartSession({
            Executor: NOOP_CLOUD_EXECUTOR,
            WorkspacePath: 'cloud://run/r1',
            Environment: { GEMINI_API_KEY: 'goog-key-123' },
            McpServerUrl: 'https://mcp.mj.example.com/sse',
            McpCredential: 'ephemeral-mcp-jwt',
            CloudOptions: {
                repositoryUrl: 'https://github.com/MemberJunction/MJ',
                gitBranch: 'next',
                projectId: 'gcp-mj',
                region: 'us-central1',
                waitMode: 'bounded-poll',
                pollIntervalMs: 10,
                turnWaitBudgetMs: 5_000,
            },
        });

        const events = await collectEvents(adapter.RunTurn('Audit users'));

        const postReq = transport.Requests[0]!;
        expect(postReq.Headers['x-goog-api-key']).toBe('goog-key-123');
        const postBody = ParseCloudJsonObject(postReq.Body ?? '')!;
        expect(postBody.background).toBe(true);
        expect(postBody.model).toBe('gemini-3.1-pro-preview');
        expect(postBody.system_instruction).toBe('Emit MJ Loop JSON.');
        expect(postBody.workspace).toEqual({
            repository_url: 'https://github.com/MemberJunction/MJ',
            git_branch: 'next',
            project_id: 'gcp-mj',
            region: 'us-central1',
            network_access: 'restricted',
        });

        // Verify deduplication across polls: th-1 and call-1 each emitted ONCE
        expect(events.filter((e) => e.Type === 'thinking-delta')).toHaveLength(1);
        expect(events.filter((e) => e.Type === 'tool-use-start')).toHaveLength(1);
        expect(events.filter((e) => e.Type === 'tool-result')).toHaveLength(1);
        expect(events).toContainEqual({
            Type: 'usage',
            InputTokens: 820,
            OutputTokens: 190,
            PromptTokens: 820,
            CompletionTokens: 190,
            ThinkingTokens: 65,
            CostUsd: 0.031,
        });
        expect(events[events.length - 1]).toEqual({
            Type: 'turn-complete',
            RawText: '{"taskComplete":true,"message":"Users audited","reasoning":"Queried via MCP"}',
            CloudExecutionState: 'completed',
            AsyncWakePending: false,
            SessionId: 'int-agy-001',
            PullRequestUrl: undefined,
            ArtifactUrls: undefined,
        });
        expect(adapter.SessionId).toBe('int-agy-001');
    });

    it('detaches cleanly WITHOUT remote cancel in adaptive-wake mode, then re-attaches on next AgentWake to collect output & PR URL', async () => {
        let remotePhase: 'running-step-1' | 'running-step-2' | 'done' = 'running-step-1';
        let cancelCalled = false;
        let postSubmissions = 0;

        const transport = new MockCloudHttpTransport((req) => {
            if (req.Url.endsWith(':cancel')) {
                cancelCalled = true;
                return jsonHttpResponse({ id: 'int-long-99', status: 'cancelled' });
            }
            if (req.Method === 'POST' && req.Url === 'https://agy.custom.example/v1beta/interactions') {
                postSubmissions++;
                return jsonHttpResponse({
                    id: 'int-long-99',
                    status: 'running',
                    outputs: [{ id: 'th-a', type: 'thought', summary: 'Cloning repository' }],
                });
            }
            if (req.Method === 'GET' && req.Url === 'https://agy.custom.example/v1beta/interactions/int-long-99') {
                if (remotePhase === 'running-step-1') {
                    return jsonHttpResponse({
                        id: 'int-long-99',
                        status: 'running',
                        outputs: [{ id: 'th-a', type: 'thought', summary: 'Cloning repository' }],
                    });
                }
                if (remotePhase === 'running-step-2') {
                    remotePhase = 'done';
                    return jsonHttpResponse({
                        id: 'int-long-99',
                        status: 'running',
                        outputs: [
                            { id: 'th-a', type: 'thought', summary: 'Cloning repository' },
                            { id: 'th-b', type: 'thought', summary: 'Running test suite' },
                        ],
                    });
                }
                return jsonHttpResponse({
                    id: 'int-long-99',
                    status: 'completed',
                    model: 'gemini-3.1-pro-preview',
                    pull_request_url: 'https://github.com/MemberJunction/MJ/pull/9999',
                    artifacts: ['https://storage.example.com/build-report.json'],
                    outputs: [
                        { id: 'th-a', type: 'thought', summary: 'Cloning repository' },
                        { id: 'th-b', type: 'thought', summary: 'Running test suite' },
                        {
                            id: 'txt-final',
                            type: 'text',
                            text: '{"taskComplete":true,"message":"Opened PR #9999","reasoning":"All tests green"}',
                        },
                    ],
                    usage_metadata: {
                        prompt_token_count: 2400,
                        candidates_token_count: 610,
                        thoughts_token_count: 320,
                        cost_usd: 0.18,
                    },
                });
            }
            return jsonHttpResponse({ error: { message: 'Unexpected request' } }, 404);
        });

        // ── Run 1: TurnWaitBudgetMs elapses while cloud run is still running ──
        const run1Adapter = new AntigravityCloudAdapter(transport);
        run1Adapter.SetSleepImpl(async (ms) => {
            await new Promise<void>((r) => setTimeout(r, Math.min(ms, 15)));
        });

        await run1Adapter.StartSession({
            Executor: NOOP_CLOUD_EXECUTOR,
            WorkspacePath: 'cloud://run-1',
            Environment: {
                ANTIGRAVITY_CLOUD_API_URL: 'https://agy.custom.example/v1beta/interactions',
                ANTIGRAVITY_BEARER_TOKEN: 'ya29.oauth-token',
            },
            CloudOptions: {
                waitMode: 'adaptive-wake',
                turnWaitBudgetMs: 20,
                pollIntervalMs: 10,
            },
        });

        expect(transport.Requests.length).toBe(0);
        const run1Events = await collectEvents(run1Adapter.RunTurn('Implement feature & open PR'));
        expect(postSubmissions).toBe(1);
        expect(transport.Requests[0]?.Headers['Authorization']).toBe('Bearer ya29.oauth-token');

        expect(run1Adapter.IsDetachedForWake).toBe(true);
        expect(run1Adapter.SessionId).toBe('int-long-99');

        const run1Complete = run1Events.find((e) => e.Type === 'turn-complete');
        expect(run1Complete).toBeDefined();
        if (run1Complete?.Type === 'turn-complete') {
            expect(run1Complete.AsyncWakePending).toBe(true);
            expect(run1Complete.CloudExecutionState).toBe('running');
            expect(run1Complete.SessionId).toBe('int-long-99');
            const parsedCheckpoint = ParseCloudJsonObject(run1Complete.RawText);
            expect(parsedCheckpoint?.taskComplete).toBe(true);
            expect(parsedCheckpoint?.asyncWakePending).toBe(true);
            expect(parsedCheckpoint?.externalSessionId).toBe('int-long-99');
        }

        // EndSession MUST detach WITHOUT cancelling the remote background interaction!
        await run1Adapter.EndSession();
        expect(cancelCalled).toBe(false);

        // ── Run 2 (AgentWake): Resumes ExternalSessionID 'int-long-99' seamlessly ──
        remotePhase = 'running-step-2';
        const wakeAdapter = new AntigravityCloudAdapter(transport);
        wakeAdapter.SetSleepImpl(async () => undefined);

        await wakeAdapter.StartSession({
            ResumeSessionId: 'int-long-99',
            Executor: NOOP_CLOUD_EXECUTOR,
            WorkspacePath: 'cloud://run-2',
            Environment: {
                ANTIGRAVITY_CLOUD_API_URL: 'https://agy.custom.example/v1beta/interactions',
                ANTIGRAVITY_BEARER_TOKEN: 'ya29.oauth-token',
            },
            CloudOptions: {
                waitMode: 'adaptive-wake',
                turnWaitBudgetMs: 5_000,
                pollIntervalMs: 10,
            },
        });

        expect(wakeAdapter.DidResumeSession).toBe(true);
        const wakeEvents = await collectEvents(wakeAdapter.RunTurn('wake check'));

        // Must NOT have posted a second user turn!
        expect(postSubmissions).toBe(1);

        // th-a was already emitted in Run 1, so only th-b is emitted in Run 2!
        const wakeThoughts = wakeEvents.filter((e) => e.Type === 'thinking-delta');
        expect(wakeThoughts).toEqual([{ Type: 'thinking-delta', Text: 'Running test suite' }]);

        const wakeTerminal = wakeEvents[wakeEvents.length - 1];
        expect(wakeTerminal).toEqual({
            Type: 'turn-complete',
            RawText: '{"taskComplete":true,"message":"Opened PR #9999","reasoning":"All tests green"}',
            CloudExecutionState: 'completed',
            AsyncWakePending: false,
            SessionId: 'int-long-99',
            PullRequestUrl: 'https://github.com/MemberJunction/MJ/pull/9999',
            ArtifactUrls: ['https://storage.example.com/build-report.json'],
        });
    });
});

describe('ClaudeCodeCloudAdapter — Managed Sessions, Cancellation & Error Handling', () => {
    it('creates /v1/sessions with anthropic headers, repo mount & MCP server, executes turn, and tracks cost', async () => {
        let getPolls = 0;
        const transport = new MockCloudHttpTransport((req) => {
            if (req.Method === 'POST' && req.Url === DEFAULT_CLAUDE_CLOUD_API_URL) {
                return jsonHttpResponse({
                    id: 'sess_claude_42',
                    status: 'idle',
                    model: 'claude-sonnet-5',
                });
            }
            if (
                req.Method === 'POST' &&
                req.Url === `${DEFAULT_CLAUDE_CLOUD_API_URL}/sess_claude_42/turns`
            ) {
                return jsonHttpResponse({
                    id: 'sess_claude_42',
                    status: 'running',
                    model: 'claude-opus-4-6',
                    content: [{ id: 'b1', type: 'thinking', thinking: 'Reviewing schema' }],
                });
            }
            if (req.Method === 'GET' && req.Url === `${DEFAULT_CLAUDE_CLOUD_API_URL}/sess_claude_42`) {
                getPolls++;
                return jsonHttpResponse({
                    id: 'sess_claude_42',
                    status: 'completed',
                    model: 'claude-opus-4-6',
                    total_cost_usd: 0.27,
                    content: [
                        { id: 'b1', type: 'thinking', thinking: 'Reviewing schema' },
                        {
                            id: 'tu1',
                            type: 'mcp_tool_use',
                            name: 'get_entity_schema',
                            input: { entity: 'MJ: Actions' },
                        },
                        {
                            type: 'mcp_tool_result',
                            tool_use_id: 'tu1',
                            name: 'get_entity_schema',
                            content: '{"fields":12}',
                        },
                        {
                            id: 'b2',
                            type: 'text',
                            text: '{"taskComplete":true,"message":"Schema verified","reasoning":"12 fields"}',
                        },
                    ],
                    usage: {
                        input_tokens: 1500,
                        output_tokens: 280,
                        thinking_tokens: 90,
                    },
                });
            }
            return jsonHttpResponse({ error: { message: 'Unexpected route' } }, 500);
        });

        const adapter = new ClaudeCodeCloudAdapter(transport);
        adapter.SetSleepImpl(async () => undefined);
        adapter.SetSystemPrompt('Follow Loop contract.');

        await adapter.StartSession({
            Executor: NOOP_CLOUD_EXECUTOR,
            WorkspacePath: 'cloud://claude-ws',
            Environment: { ANTHROPIC_API_KEY: 'sk-ant-cloud-test' },
            McpServerUrl: 'https://mcp.mj.example.com/mcp',
            McpCredential: 'mcp-tok-777',
            CloudOptions: {
                environmentId: 'env_anthropic_01',
                repositoryUrl: 'https://github.com/MemberJunction/MJ',
                gitRef: 'refs/heads/next',
                gitBranch: 'next',
                networkAccess: 'egress',
            },
        });

        expect(adapter.SessionId).toBe('sess_claude_42');
        const createReq = transport.Requests[0]!;
        expect(createReq.Headers['x-api-key']).toBe('sk-ant-cloud-test');
        expect(createReq.Headers['anthropic-version']).toBe(DEFAULT_ANTHROPIC_VERSION);
        expect(createReq.Headers['anthropic-beta']).toContain('managed-agents');

        const createBody = ParseCloudJsonObject(createReq.Body ?? '')!;
        expect(createBody.environment_id).toBe('env_anthropic_01');
        expect(createBody.network_access).toBe('egress');
        expect(createBody.repository).toEqual({
            url: 'https://github.com/MemberJunction/MJ',
            git_ref: 'refs/heads/next',
            git_branch: 'next',
        });

        const events = await collectEvents(adapter.RunTurn('Verify MJ: Actions schema'));
        expect(getPolls).toBe(1);
        expect(adapter.ReportedModel).toBe('claude-opus-4-6');

        expect(events).toEqual([
            { Type: 'thinking-delta', Text: 'Reviewing schema' },
            {
                Type: 'tool-use-start',
                ToolCallId: 'tu1',
                ToolName: 'get_entity_schema',
                ArgumentsJson: '{"entity":"MJ: Actions"}',
            },
            {
                Type: 'tool-result',
                ToolCallId: 'tu1',
                ToolName: 'get_entity_schema',
                Output: '{"fields":12}',
                IsError: false,
            },
            {
                Type: 'assistant-text',
                Text: '{"taskComplete":true,"message":"Schema verified","reasoning":"12 fields"}',
            },
            {
                Type: 'usage',
                InputTokens: 1500,
                OutputTokens: 280,
                PromptTokens: 1500,
                CompletionTokens: 280,
                ThinkingTokens: 90,
                CostUsd: 0.27,
            },
            {
                Type: 'turn-complete',
                RawText: '{"taskComplete":true,"message":"Schema verified","reasoning":"12 fields"}',
                CloudExecutionState: 'completed',
                AsyncWakePending: false,
                SessionId: 'sess_claude_42',
                PullRequestUrl: undefined,
                ArtifactUrls: undefined,
            },
        ]);
    });

    it('cancels remote session promptly when CancellationToken aborts mid-poll, and surfaces HTTP 500 errors cleanly', async () => {
        let cancelHit = false;
        const abortController = new AbortController();

        const transport = new MockCloudHttpTransport((req) => {
            if (req.Method === 'POST' && req.Url === DEFAULT_CLAUDE_CLOUD_API_URL) {
                return jsonHttpResponse({ id: 'sess_cancel_1', status: 'idle' });
            }
            if (req.Url.endsWith('/turns')) {
                return jsonHttpResponse({ id: 'sess_cancel_1', status: 'running' });
            }
            if (req.Url.endsWith('/cancel')) {
                cancelHit = true;
                return jsonHttpResponse({ id: 'sess_cancel_1', status: 'cancelled' });
            }
            return jsonHttpResponse({ id: 'sess_cancel_1', status: 'running' });
        });

        const adapter = new ClaudeCodeCloudAdapter(transport);
        adapter.SetSleepImpl(async () => {
            abortController.abort();
        });

        await adapter.StartSession({
            Executor: NOOP_CLOUD_EXECUTOR,
            WorkspacePath: 'cloud://cancel-test',
            Environment: { ANTHROPIC_API_KEY: 'sk-ant-cancel' },
            CancellationToken: abortController.signal,
            CloudOptions: { waitMode: 'bounded-poll', turnWaitBudgetMs: 10_000, pollIntervalMs: 50 },
        });

        const events = await collectEvents(adapter.RunTurn('Long running task'));
        expect(cancelHit).toBe(true);
        expect(events).toEqual([
            {
                Type: 'session-error',
                Error: 'Claude Code Cloud turn cancelled by caller',
                CloudExecutionState: 'cancelled',
            },
        ]);

        // Verify HTTP 500 surfaces a clean session-error event rather than an unhandled throw
        const failingTransport = new MockCloudHttpTransport((req) => {
            if (req.Method === 'POST' && req.Url === DEFAULT_CLAUDE_CLOUD_API_URL) {
                return jsonHttpResponse({ id: 'sess_err_1', status: 'idle' });
            }
            return jsonHttpResponse(
                { error: { message: 'Upstream sandbox capacity exhausted' } },
                503,
            );
        });
        const errAdapter = new ClaudeCodeCloudAdapter(failingTransport);
        await errAdapter.StartSession({
            Executor: NOOP_CLOUD_EXECUTOR,
            WorkspacePath: 'cloud://err-test',
            Environment: { ANTHROPIC_API_KEY: 'sk-ant-err' },
        });
        const errEvents = await collectEvents(errAdapter.RunTurn('Trigger 503'));
        expect(errEvents).toHaveLength(1);
        expect(errEvents[0]?.Type).toBe('session-error');
        if (errEvents[0]?.Type === 'session-error') {
            expect(errEvents[0].Error).toContain('HTTP 503');
            expect(errEvents[0].Error).toContain('Upstream sandbox capacity exhausted');
        }
    });
});

describe('CodexCloudAdapter — OpenAI Background Responses, Reasoning Telemetry & Chaining', () => {
    it('executes background responses with Bearer auth, chains previous_response_id on turn 2, and reports reasoning_tokens', async () => {
        const transport = new MockCloudHttpTransport((req) => {
            if (req.Method === 'POST' && req.Url === DEFAULT_CODEX_CLOUD_API_URL) {
                const parsed = ParseCloudJsonObject(req.Body ?? '')!;
                if (!parsed.previous_response_id) {
                    return jsonHttpResponse({
                        id: 'resp_codex_101',
                        status: 'queued',
                        model: 'o3',
                    });
                }
                return jsonHttpResponse({
                    id: 'resp_codex_102',
                    status: 'completed',
                    model: 'o3',
                    output: [
                        {
                            id: 'msg-2',
                            type: 'message',
                            content: [
                                {
                                    type: 'output_text',
                                    text: '{"taskComplete":true,"message":"Second turn done","reasoning":"Chained"}',
                                },
                            ],
                        },
                    ],
                    usage: {
                        input_tokens: 400,
                        output_tokens: 95,
                        output_tokens_details: { reasoning_tokens: 30 },
                    },
                });
            }
            if (req.Method === 'GET' && req.Url === `${DEFAULT_CODEX_CLOUD_API_URL}/resp_codex_101`) {
                return jsonHttpResponse({
                    id: 'resp_codex_101',
                    status: 'completed',
                    model: 'o3',
                    output: [
                        {
                            id: 'rsn-1',
                            type: 'reasoning',
                            summary: [{ type: 'summary_text', text: 'Analyzing module graph' }],
                        },
                        {
                            id: 'mc-1',
                            type: 'mcp_call',
                            call_id: 'call_mcp_1',
                            name: 'list_entities',
                            arguments: '{"schema":"__mj"}',
                            output: '["MJ: AI Agents"]',
                        },
                        {
                            id: 'msg-1',
                            type: 'message',
                            content: [
                                {
                                    type: 'output_text',
                                    text: '{"taskComplete":false,"nextStep":{"type":"Chat"},"message":"Step 1"}',
                                },
                            ],
                        },
                    ],
                    usage: {
                        input_tokens: 1100,
                        output_tokens: 350,
                        output_tokens_details: { reasoning_tokens: 140 },
                        cost_usd: 0.095,
                    },
                });
            }
            return jsonHttpResponse({ error: { message: 'Unexpected route' } }, 404);
        });

        const adapter = new CodexCloudAdapter(transport);
        adapter.SetSleepImpl(async () => undefined);
        adapter.SetSystemPrompt('Return valid Loop JSON.');

        await adapter.StartSession({
            Executor: NOOP_CLOUD_EXECUTOR,
            WorkspacePath: 'cloud://codex-ws',
            Environment: { OPENAI_API_KEY: 'sk-proj-openai-123' },
            Model: 'o3',
            McpServerUrl: 'https://mcp.mj.example.com/openai',
            McpCredential: 'codex-mcp-token',
            CloudOptions: {
                environmentId: 'codex-env-prod',
                repositoryUrl: 'https://github.com/MemberJunction/MJ',
                gitBranch: 'next',
            },
        });

        const turn1Events = await collectEvents(adapter.RunTurn('Inspect entities'));
        const req1 = transport.Requests[0]!;
        expect(req1.Headers['Authorization']).toBe('Bearer sk-proj-openai-123');
        const body1 = ParseCloudJsonObject(req1.Body ?? '')!;
        expect(body1.background).toBe(true);
        expect(body1.store).toBe(true);
        expect(body1.instructions).toBe('Return valid Loop JSON.');
        expect(adapter.SessionId).toBe('resp_codex_101');

        expect(turn1Events).toContainEqual({
            Type: 'thinking-delta',
            Text: 'Analyzing module graph',
        });
        expect(turn1Events).toContainEqual({
            Type: 'usage',
            InputTokens: 1100,
            OutputTokens: 350,
            PromptTokens: 1100,
            CompletionTokens: 350,
            ThinkingTokens: 140,
            CostUsd: 0.095,
        });

        // Turn 2 chains previous_response_id = 'resp_codex_101' and updates SessionId to 'resp_codex_102'
        const turn2Events = await collectEvents(adapter.RunTurn('Finish up'));
        const req2 = transport.Requests[2]!;
        const body2 = ParseCloudJsonObject(req2.Body ?? '')!;
        expect(body2.previous_response_id).toBe('resp_codex_101');
        expect(adapter.SessionId).toBe('resp_codex_102');
        expect(turn2Events[turn2Events.length - 1]).toMatchObject({
            Type: 'turn-complete',
            CloudExecutionState: 'completed',
            SessionId: 'resp_codex_102',
        });
    });

    it('cancels remote session and emits session-error when bounded-poll budget expires', async () => {
        let cancelledId = '';
        const transport = new MockCloudHttpTransport((req) => {
            if (req.Url.endsWith('/cancel')) {
                cancelledId = req.Url;
                return jsonHttpResponse({ id: 'resp_slow_1', status: 'cancelled' });
            }
            return jsonHttpResponse({ id: 'resp_slow_1', status: 'in_progress' });
        });

        const adapter = new CodexCloudAdapter(transport);
        adapter.SetSleepImpl(async (ms) => {
            await new Promise<void>((r) => setTimeout(r, Math.min(ms, 15)));
        });

        await adapter.StartSession({
            Executor: NOOP_CLOUD_EXECUTOR,
            WorkspacePath: 'cloud://slow',
            Environment: { OPENAI_API_KEY: 'sk-slow' },
            CloudOptions: {
                waitMode: 'bounded-poll',
                turnWaitBudgetMs: 15,
                pollIntervalMs: 10,
            },
        });

        const events = await collectEvents(adapter.RunTurn('Take too long'));
        expect(cancelledId).toContain('resp_slow_1/cancel');
        expect(events).toHaveLength(1);
        expect(events[0]?.Type).toBe('session-error');
        if (events[0]?.Type === 'session-error') {
            expect(events[0].Error).toContain('exceeded turnWaitBudgetMs');
        }
    });
});

describe('HarnessCredentialResolver & HarnessAgentBase Cloud Integration', () => {
    it('resolves Antigravity, Anthropic, and OpenAI credentials with MJ Environment priority and env-var fallback', () => {
        const agyEnv: Record<string, string> = { GOOGLE_API_KEY: 'goog-123' };
        NormalizeAntigravityEnvironment(agyEnv);
        expect(agyEnv).toEqual({
            GOOGLE_API_KEY: 'goog-123',
            GEMINI_API_KEY: 'goog-123',
            ANTIGRAVITY_API_KEY: 'goog-123',
        });

        const fallbackTarget: Record<string, string> = {};
        const fakeProcessEnv: NodeJS.ProcessEnv = {
            ANTIGRAVITY_API_KEY: 'server-agy-key',
        };
        const sourceVar = ResolveDriverVendorFallbackEnvironment(
            'AntigravityCloudAdapter',
            fallbackTarget,
            fakeProcessEnv,
        );
        expect(sourceVar).toBe('ANTIGRAVITY_API_KEY');
        expect(fallbackTarget.GEMINI_API_KEY).toBe('server-agy-key');

        const claudeResolved = ResolveProviderCredentialSecret(
            'anthropic',
            {},
            { ANTHROPIC_API_KEY: 'sk-ant-fallback' },
        );
        expect(claudeResolved).toEqual({
            Secret: 'sk-ant-fallback',
            SourceKey: 'ANTHROPIC_API_KEY',
            IsBearer: false,
        });

        const codexResolved = ResolveProviderCredentialSecret(
            'openai',
            { OPENAI_API_KEY: 'sk-granted-primary' },
            { OPENAI_API_KEY: 'sk-ignored-fallback' },
        );
        expect(codexResolved).toEqual({
            Secret: 'sk-granted-primary',
            SourceKey: 'OPENAI_API_KEY',
            IsBearer: true,
        });
    });

    it('wires CloudSandboxProvider, MCP tunnel URL handling, and ExternalSessionID resume in HarnessAgentBase', async () => {
        const agent = new InspectableHarnessAgent();
        const cloudAdapter = new AntigravityCloudAdapter(
            new MockCloudHttpTransport(() => jsonHttpResponse({ id: 'x', status: 'completed' })),
        );
        agent.SetAdapterForTest(cloudAdapter);

        // 1. Sandbox provider selection
        const provider = agent.CreateSandboxForTest({
            harnessName: 'Google Antigravity (Cloud)',
            sandbox: {
                provider: 'cloud',
                cloud: { waitMode: 'adaptive-wake', mcpExternalServerUrl: 'https://tunnel.mj.dev/mcp' },
            },
        });
        expect(provider).toBeInstanceOf(CloudSandboxProvider);
        expect(provider.Name).toBe('cloud');

        // 2. MCP external tunnel URL forwarded cleanly
        const tunnelMcp = agent.ResolveMcpForTest({
            mcpServerUrl: 'http://127.0.0.1:41999/mcp',
            mcpCredential: 'scoped-cred',
            sandbox: {
                provider: 'cloud',
                cloud: { mcpExternalServerUrl: 'https://tunnel.mj.dev/mcp' },
            },
        });
        expect(tunnelMcp).toEqual({
            mcpServerUrl: 'https://tunnel.mj.dev/mcp',
            mcpCredential: 'scoped-cred',
        });

        // 3. Localhost ephemeral MCP URL without tunnel omitted cleanly without crashing
        const loopbackOnlyMcp = agent.ResolveMcpForTest({
            mcpServerUrl: 'http://localhost:41999/mcp',
            mcpCredential: 'scoped-cred',
            sandbox: { provider: 'cloud' },
        });
        expect(loopbackOnlyMcp).toEqual({});

        // 4. ExternalSessionID updated and resumed even under 'run' workspaceScope for cloud adapters
        const fakeRun = { ID: 'run-wake-1', ExternalSessionID: null as string | null };
        agent.SetAgentRunForTest(fakeRun);
        agent.PersistExternalSessionForTest('int-detached-555');
        expect(fakeRun.ExternalSessionID).toBe('int-detached-555');

        const resumedId = await agent.FindResumableForTest('Google Antigravity (Cloud)', 'run');
        expect(resumedId).toBe('int-detached-555');
    });
});
