import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIPromptParams, type AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { MJAIAgentHarnessEntity } from '@memberjunction/core-entities';
import {
    ClassifyHarnessQuotaError,
    DEFAULT_HARNESS_QUOTA_COOLDOWN_MS,
} from '../HarnessQuotaClassifier.js';
import {
    HARNESS_ACCOUNT_POOL_DIR_ENV_VAR,
    HarnessAccountPoolService,
    type HarnessAccountPoolOptions,
} from '../HarnessAccountPoolService.js';
import {
    BuildCrossAccountContinuityHandoff,
    HarnessAgentBase,
    type HarnessAgentConfig,
} from '../HarnessAgentBase.js';
import { BaseHarnessAdapter } from '../adapters/BaseHarnessAdapter.js';
import type { ISandboxProvider, SandboxHandle, WorkspaceKey } from '../sandbox/ISandboxProvider.js';
import type {
    HarnessCapabilities,
    HarnessSessionConfig,
    HarnessTurnEvent,
} from '../types.js';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        public async RunView(): Promise<{ Success: boolean; Results: never[] }> {
            return { Success: true, Results: [] };
        }
    }
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: MockRunView,
    };
});

interface CapturedSessionStart {
    ResumeSessionId?: string;
    Environment: Record<string, string>;
    AuthMode?: string;
}

class FailoverFakeAdapter extends BaseHarnessAdapter {
    public readonly startedSessions: CapturedSessionStart[] = [];
    public readonly turnInputs: string[] = [];
    public endSessionCalls = 0;
    private currentSessionId: string | undefined;
    private turnScriptIndex = 0;

    public constructor(
        private readonly turnScripts: Array<() => AsyncIterable<HarnessTurnEvent>>,
    ) {
        super();
    }

    public get Capabilities(): HarnessCapabilities {
        return {
            SessionResume: true,
            MidTurnCancellation: true,
            StructuredOutput: false,
            UsageReporting: true,
            PermissionPolicy: true,
            PermissionHooks: false,
            McpClient: false,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    public override get SessionId(): string | undefined {
        return this.currentSessionId;
    }

    public SetCurrentSessionId(sessionId: string | undefined): void {
        this.currentSessionId = sessionId;
    }

    public async StartSession(config: HarnessSessionConfig): Promise<void> {
        this.startedSessions.push({
            ResumeSessionId: config.ResumeSessionId,
            Environment: { ...config.Environment },
            AuthMode: config.AuthMode,
        });
        // Starting a fresh session clears previous sessionId unless resuming
        this.currentSessionId = config.ResumeSessionId;
    }

    public async *RunTurn(input: string): AsyncIterable<HarnessTurnEvent> {
        this.turnInputs.push(input);
        const script = this.turnScripts[this.turnScriptIndex++];
        if (!script) {
            yield { Type: 'session-error', Error: 'No scripted turn left' };
            return;
        }
        for await (const event of script()) {
            if (event.Type === 'turn-complete' && event.SessionId) {
                this.currentSessionId = event.SessionId;
            }
            yield event;
        }
    }

    public async RespondToPermission(): Promise<void> {}

    public async EndSession(): Promise<void> {
        this.endSessionCalls++;
    }
}

class FakeSandboxProvider implements ISandboxProvider {
    public async Provision(key: WorkspaceKey): Promise<SandboxHandle> {
        return {
            WorkspacePath: '/tmp/shared-working-tree',
            Key: key,
            Ephemeral: false,
            Executor: {
                Run: () => {
                    throw new Error('Executor.Run not used in FailoverFakeAdapter test');
                },
            },
        };
    }
    public async Finalize(): Promise<void> {}
}

class FailoverTestableHarnessAgent extends HarnessAgentBase {
    public fakeAdapter: FailoverFakeAdapter | null = null;
    public fakeHarnessRow: MJAIAgentHarnessEntity | null = null;
    public fakeAgentRun: { ID: string; Agent: string; ExternalSessionID: string | null } = {
        ID: 'run-failover-1',
        Agent: 'Coding Agent',
        ExternalSessionID: 'prior-account-session-abc',
    };
    private fakeTypeConfig: HarnessAgentConfig = {};
    private readonly fakeSandboxProvider: ISandboxProvider = new FakeSandboxProvider();

    public ConfigureForTest(
        adapter: FailoverFakeAdapter,
        harnessRow: MJAIAgentHarnessEntity,
        typeConfig: HarnessAgentConfig,
    ): void {
        this.fakeAdapter = adapter;
        this.fakeHarnessRow = harnessRow;
        this.fakeTypeConfig = typeConfig;
    }

    public async ExecutePromptForTest(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        return this.executePrompt(promptParams);
    }

    protected override _agentRunId(): string {
        return this.fakeAgentRun.ID;
    }

    protected override _agentRunAgentId(): string {
        return 'agent-1';
    }

    protected override _agentRunExternalSessionId(): string | undefined {
        const current = this.fakeAgentRun.ExternalSessionID?.trim();
        return current && current.length > 0 ? current : undefined;
    }

    protected override _agentTypeConfiguration(): string | null {
        return JSON.stringify(this.fakeTypeConfig);
    }

    protected override persistExternalSessionId(sessionId: string | undefined): void {
        if (sessionId && this.fakeAgentRun.ExternalSessionID !== sessionId) {
            this.fakeAgentRun.ExternalSessionID = sessionId;
        }
    }

    protected override clearExternalSessionId(): void {
        this.fakeAgentRun.ExternalSessionID = null;
    }

    protected override async loadHarnessRow(): Promise<MJAIAgentHarnessEntity> {
        if (!this.fakeHarnessRow) {
            throw new Error('fakeHarnessRow not configured');
        }
        return this.fakeHarnessRow;
    }

    protected override resolveAdapter(): BaseHarnessAdapter {
        if (!this.fakeAdapter) {
            throw new Error('fakeAdapter not configured');
        }
        return this.fakeAdapter;
    }

    protected override createSandboxProvider(): ISandboxProvider {
        return this.fakeSandboxProvider;
    }

    protected override async recordPromptRun(): Promise<undefined> {
        return undefined;
    }

    protected override async renderSystemPrompt(): Promise<string> {
        return '';
    }
}

describe('HarnessQuotaClassifier', () => {
    const fixedNow = Date.parse('2026-11-24T12:00:00.000Z');

    it('detects quota and rate-limit errors across Claude Code, Antigravity, Codex, and Gemini CLI', () => {
        const positives = [
            'HTTP 429 Too Many Requests',
            'Error: 429 rate_limit_error: Too many requests',
            'API error: overloaded_error - please try again later',
            "You've hit your limit · resets 5pm (UTC)",
            'You have reached your usage limit for this billing period',
            'Error: RESOURCE_EXHAUSTED: Quota exceeded for quota metric',
            'Insufficient quota. Check your plan and billing details.',
            'Rate limit reached. Please try again in 45 minutes.',
            '429: limit resets at 2026-11-24T14:00:00Z',
        ];

        for (const sample of positives) {
            const result = ClassifyHarnessQuotaError(sample, { nowMs: fixedNow });
            expect(result.isQuotaError, `expected quota match for: ${sample}`).toBe(true);
            expect(result.cooldownUntilIso).toBeTruthy();
            expect(result.cooldownMs).toBeGreaterThan(0);
            expect(result.reason.length).toBeGreaterThan(0);
        }

        // Also accepts Error instances
        const errResult = ClassifyHarnessQuotaError(new Error('HTTP 429 Too Many Requests'), {
            nowMs: fixedNow,
        });
        expect(errResult.isQuotaError).toBe(true);
    });

    it('does not false-positive on normal non-quota errors', () => {
        const negatives = [
            '',
            'SyntaxError: Unexpected token } in JSON at position 42',
            'Fixed 429 lines across 3 TypeScript files',
            'ENOENT: no such file or directory, open /tmp/foo.ts',
            'Process exited with code 1: TypeScript compilation failed',
        ];

        for (const sample of negatives) {
            const result = ClassifyHarnessQuotaError(sample, { nowMs: fixedNow });
            expect(result.isQuotaError, `unexpected quota match for: ${sample}`).toBe(false);
        }
    });

    it('parses relative durations, ISO timestamps, and clock times into cooldownUntilIso', () => {
        const relMin = ClassifyHarnessQuotaError('Rate limit exceeded. Try again in 45 minutes.', {
            nowMs: fixedNow,
        });
        expect(relMin.isQuotaError).toBe(true);
        expect(relMin.cooldownMs).toBe(45 * 60 * 1000);
        expect(relMin.cooldownUntilIso).toBe('2026-11-24T12:45:00.000Z');

        const relCompound = ClassifyHarnessQuotaError('Usage limit reached, resets in 2h 30m.', {
            nowMs: fixedNow,
        });
        expect(relCompound.cooldownMs).toBe((2 * 60 + 30) * 60 * 1000);
        expect(relCompound.cooldownUntilIso).toBe('2026-11-24T14:30:00.000Z');

        const isoTs = ClassifyHarnessQuotaError('Quota exceeded; resets at 2026-11-24T15:15:00Z', {
            nowMs: fixedNow,
        });
        expect(isoTs.parsedResetAtIso).toBe('2026-11-24T15:15:00.000Z');
        expect(isoTs.cooldownUntilIso).toBe('2026-11-24T15:15:00.000Z');

        const clockUtc = ClassifyHarnessQuotaError("You've hit your limit · resets at 5pm UTC", {
            nowMs: fixedNow,
        });
        expect(clockUtc.cooldownUntilIso).toBe('2026-11-24T17:00:00.000Z');

        // Default cooldown when no reset time is advertised
        const defaultCd = ClassifyHarnessQuotaError('overloaded_error', { nowMs: fixedNow });
        expect(defaultCd.cooldownMs).toBe(DEFAULT_HARNESS_QUOTA_COOLDOWN_MS);
        expect(defaultCd.cooldownUntilIso).toBe(
            new Date(fixedNow + DEFAULT_HARNESS_QUOTA_COOLDOWN_MS).toISOString(),
        );
    });
});

describe('BuildCrossAccountContinuityHandoff', () => {
    it('formats a structured handoff preamble referencing objective, turns, progress, and git inspection', () => {
        const handoff = BuildCrossAccountContinuityHandoff({
            previousSlotId: 'claude-acct-1',
            previousSlotLabel: 'Primary Pro',
            nextSlotId: 'claude-acct-2',
            nextSlotLabel: 'Backup Pro',
            reason: 'HTTP 429 rate_limit_error',
            originalObjective: 'Implement multi-account failover and tests',
            turnsCompleted: 2,
            recentAssistantSummary: 'Created HarnessQuotaClassifier.ts and wired tests.',
        });

        expect(handoff).toContain('[Cross-Account Continuity Handoff]');
        expect(handoff).toContain('Primary Pro (claude-acct-1) -> Backup Pro (claude-acct-2)');
        expect(handoff).toContain('Implement multi-account failover and tests');
        expect(handoff).toContain('Turns completed before failover: 2');
        expect(handoff).toContain('Created HarnessQuotaClassifier.ts and wired tests.');
        expect(handoff).toContain('git status');
        expect(handoff).toContain('git diff');
    });
});

describe('HarnessAgentBase Mid-Run Quota Failover & Session Continuity', () => {
    const tempDirs: string[] = [];
    let poolDir: string;
    let fakeRealHome: string;
    let origPoolDirEnv: string | undefined;
    let origHomeEnv: string | undefined;

    beforeEach(() => {
        origPoolDirEnv = process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR];
        origHomeEnv = process.env.HOME;
        poolDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-failover-pool-'));
        fakeRealHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-failover-home-'));
        tempDirs.push(poolDir, fakeRealHome);
        process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR] = poolDir;
        process.env.HOME = fakeRealHome;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (origPoolDirEnv === undefined) {
            delete process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR];
        } else {
            process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR] = origPoolDirEnv;
        }
        if (origHomeEnv === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = origHomeEnv;
        }
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
    });

    it('fails over to next healthy slot on 429, marks exhausted slot in cooldown, clears ExternalSessionID, injects handoff preamble, and releases leases', async () => {
        const poolService = HarnessAccountPoolService.Instance;
        const poolOpts: HarnessAccountPoolOptions = {
            poolDir,
            realHomeDir: fakeRealHome,
            env: { HOME: fakeRealHome, [HARNESS_ACCOUNT_POOL_DIR_ENV_VAR]: poolDir },
        };
        poolService.SetIncludeOsDefaultLogin(false, poolOpts);

        const slot1 = poolService.AddSlot(
            { vendor: 'claude', slotId: 'claude-slot-1', label: 'Account 1', priority: 10 },
            poolOpts,
        );
        const slot2 = poolService.AddSlot(
            { vendor: 'claude', slotId: 'claude-slot-2', label: 'Account 2', priority: 20 },
            poolOpts,
        );
        fs.writeFileSync(path.join(slot1.slotDir, '.credentials.json'), '{}', 'utf8');
        fs.writeFileSync(path.join(slot2.slotDir, '.credentials.json'), '{}', 'utf8');

        const adapter = new FailoverFakeAdapter([
            // Attempt 1 (on claude-slot-1): streams partial progress, then fails with 429 quota error!
            async function* () {
                yield { Type: 'assistant-text', Text: 'Edited src/service.ts and updated types.' };
                yield { Type: 'session-error', Error: "You've hit your limit · try again in 30 minutes" };
            },
            // Attempt 2 (after failover onto claude-slot-2): succeeds with new session id!
            async function* () {
                yield { Type: 'usage', InputTokens: 120, OutputTokens: 45, CostUsd: 0 };
                yield {
                    Type: 'turn-complete',
                    RawText: '{"taskComplete": true, "message": "Finished after failover", "reasoning": "done"}',
                    SessionId: 'new-account-2-session-xyz',
                };
            },
        ]);

        const agent = new FailoverTestableHarnessAgent();
        const harnessRow = {
            Name: 'Claude Code',
            DriverClass: 'ClaudeCodeCliAdapter',
            CapabilitySettings: JSON.stringify({ authMode: 'cli-login' }),
        } as MJAIAgentHarnessEntity;

        const typeConfig: HarnessAgentConfig = {
            harnessName: 'Claude Code',
            authMode: 'cli-login',
            accountPool: {
                enabled: true,
                strategy: 'priority-failover',
                poolDir,
            },
        };
        agent.ConfigureForTest(adapter, harnessRow, typeConfig);

        const promptParams = new AIPromptParams();
        promptParams.conversationMessages = [
            { role: 'user', content: 'Refactor the scheduler and add unit tests.' },
        ];

        const result = await agent.ExecutePromptForTest(promptParams);

        // 1. Run succeeded transparently after automatic failover
        expect(result.success).toBe(true);
        expect(result.result).toContain('Finished after failover');

        // 2. Adapter started twice: first on slot 1 (with prior resume ID), then on slot 2 with ResumeSessionId=undefined!
        expect(adapter.startedSessions).toHaveLength(2);
        expect(adapter.startedSessions[0].Environment.CLAUDE_CONFIG_DIR).toBe(slot1.slotDir);
        expect(adapter.startedSessions[0].Environment.ANTHROPIC_API_KEY).toBeUndefined();
        expect(adapter.startedSessions[0].ResumeSessionId).toBe('prior-account-session-abc');

        expect(adapter.startedSessions[1].Environment.CLAUDE_CONFIG_DIR).toBe(slot2.slotDir);
        expect(adapter.startedSessions[1].Environment.ANTHROPIC_API_KEY).toBeUndefined();
        expect(adapter.startedSessions[1].ResumeSessionId).toBeUndefined();

        // 3. Retry prompt on slot 2 contains [Cross-Account Continuity Handoff] with objective, progress, and git note
        expect(adapter.turnInputs).toHaveLength(2);
        const retryPrompt = adapter.turnInputs[1];
        expect(retryPrompt).toContain('[Cross-Account Continuity Handoff]');
        expect(retryPrompt).toContain('Account 1 (claude-slot-1) -> Account 2 (claude-slot-2)');
        expect(retryPrompt).toContain('Refactor the scheduler and add unit tests.');
        expect(retryPrompt).toContain('Edited src/service.ts and updated types.');
        expect(retryPrompt).toContain('git status');
        expect(retryPrompt).toContain('git diff');

        // 4. Exhausted slot 1 is marked in cooldown and has 0 active leases; slot 2 holds the active lease until EndHarnessSession
        const slot1Status = poolService.GetSlot('claude-slot-1', poolOpts);
        expect(slot1Status?.inCooldown).toBe(true);
        expect(slot1Status?.totalRateLimitHits).toBe(1);
        expect(slot1Status?.activeLeaseCount).toBe(0);

        const slot2Status = poolService.GetSlot('claude-slot-2', poolOpts);
        expect(slot2Status?.inCooldown).toBe(false);
        expect(slot2Status?.activeLeaseCount).toBe(1);

        // 5. ExternalSessionID updated to the new account's session ID
        expect(agent.fakeAgentRun.ExternalSessionID).toBe('new-account-2-session-xyz');

        // 6. EndHarnessSession releases slot 2's lease cleanly
        await agent.EndHarnessSession('success');
        expect(poolService.ListActiveLeases(poolOpts)).toHaveLength(0);
    });

    it('renews the active account lease on live activity heartbeats', async () => {
        const poolService = HarnessAccountPoolService.Instance;
        const poolOpts: HarnessAccountPoolOptions = {
            poolDir,
            realHomeDir: fakeRealHome,
            env: { HOME: fakeRealHome, [HARNESS_ACCOUNT_POOL_DIR_ENV_VAR]: poolDir },
        };
        poolService.SetIncludeOsDefaultLogin(false, poolOpts);

        const slot1 = poolService.AddSlot({ vendor: 'claude', slotId: 'claude-hb-1' }, poolOpts);
        fs.writeFileSync(path.join(slot1.slotDir, '.credentials.json'), '{}', 'utf8');

        const renewSpy = vi.spyOn(poolService, 'RenewSlotLease');
        const callerHeartbeat = vi.fn();

        const adapter = new FailoverFakeAdapter([
            async function* () {
                yield { Type: 'liveness-heartbeat', Source: 'stdout' };
                yield { Type: 'turn-complete', RawText: '{"taskComplete": true, "message": "ok"}' };
            },
        ]);

        const agent = new FailoverTestableHarnessAgent();
        const harnessRow = {
            Name: 'Claude Code',
            DriverClass: 'ClaudeCodeCliAdapter',
            CapabilitySettings: JSON.stringify({ authMode: 'cli-login' }),
        } as MJAIAgentHarnessEntity;

        agent.ConfigureForTest(adapter, harnessRow, {
            harnessName: 'Claude Code',
            authMode: 'cli-login',
            limits: { heartbeatIntervalSeconds: 0 },
            accountPool: { enabled: true, poolDir, leaseTtlMs: 120_000 },
        });
        agent.SetActivityHeartbeatCallback(callerHeartbeat);

        const promptParams = new AIPromptParams();
        promptParams.conversationMessages = [{ role: 'user', content: 'ping' }];
        const result = await agent.ExecutePromptForTest(promptParams);

        expect(result.success).toBe(true);
        expect(renewSpy).toHaveBeenCalledTimes(1);
        expect(callerHeartbeat).toHaveBeenCalledTimes(1);

        await agent.EndHarnessSession('success');
        expect(poolService.ListActiveLeases(poolOpts)).toHaveLength(0);
    });
});
