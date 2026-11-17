import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AIPromptRunResult, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { LocalDirectorySandboxProvider } from '../sandbox/LocalDirectorySandboxProvider.js';
import { ClaudeCodeCliAdapter } from '../adapters/ClaudeCodeCliAdapter.js';
import { HarnessAgentBase } from '../HarnessAgentBase.js';
import { HarnessAgentType } from '../HarnessAgentType.js';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from '../sandbox/SandboxExecutor.js';

class CapturingExecutor implements SandboxExecutor {
    public LastSpec: HarnessProcessSpec | undefined;

    public Run(spec: HarnessProcessSpec): HarnessProcess {
        this.LastSpec = spec;
        const resultLine = JSON.stringify({
            type: 'result',
            session_id: 'sess-attach-1',
            result: '{"step":"Success"}',
            total_cost_usd: 0.01,
            usage: { input_tokens: 10, output_tokens: 5 },
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

describe('LocalDirectorySandboxProvider attach mode', () => {
    let tempBase: string;
    let allowedRoot: string;
    let outsideRoot: string;
    let repoDir: string;
    let prevAllowedRootsEnv: string | undefined;

    beforeEach(() => {
        prevAllowedRootsEnv = process.env.MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS;
        delete process.env.MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS;

        tempBase = realpathSync(mkdtempSync(join(tmpdir(), 'mj-harness-attach-test-')));
        allowedRoot = join(tempBase, 'workspace-root');
        outsideRoot = join(tempBase, 'outside-root');
        repoDir = join(allowedRoot, 'bizapps-planning');
        mkdirSync(join(repoDir, '.git'), { recursive: true });
        mkdirSync(join(outsideRoot, 'secret-repo', '.git'), { recursive: true });
    });

    afterEach(() => {
        if (prevAllowedRootsEnv === undefined) {
            delete process.env.MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS;
        } else {
            process.env.MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS = prevAllowedRootsEnv;
        }
        rmSync(tempBase, { recursive: true, force: true });
    });

    it('fails closed when neither allowedRoots nor MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS is configured', async () => {
        const provider = new LocalDirectorySandboxProvider();
        await expect(
            provider.Provision(
                { Scope: 'run', AgentId: 'a1', RunId: 'r1' },
                { workspace: { mode: 'attach', path: repoDir } },
            ),
        ).rejects.toThrow(/requires at least one existing allowed root/i);
    });

    it('attaches an existing git repository inside MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS without deleting it on finalize', async () => {
        process.env.MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS = allowedRoot;
        const provider = new LocalDirectorySandboxProvider();

        const handle = await provider.Provision(
            { Scope: 'run', AgentId: 'a1', RunId: 'r1' },
            {
                workspace: {
                    mode: 'attach',
                    path: repoDir,
                    additionalDirectories: ['${parentDir}'],
                },
            },
        );

        expect(handle.Ephemeral).toBe(false);
        expect(handle.WorkspacePath).toBe(repoDir);
        expect(handle.HostWorkspacePath).toBe(repoDir);
        expect(handle.AdditionalDirectories).toEqual([allowedRoot]);

        await provider.Finalize(handle, 'success');
        expect(existsSync(repoDir)).toBe(true);
        expect(existsSync(join(repoDir, '.git'))).toBe(true);
    });

    it('rejects paths outside allowedRoots and symlink escapes', async () => {
        const provider = new LocalDirectorySandboxProvider();
        const escapeLink = join(allowedRoot, 'escape-link');
        symlinkSync(join(outsideRoot, 'secret-repo'), escapeLink);

        await expect(
            provider.Provision(
                { Scope: 'run', AgentId: 'a1', RunId: 'r2' },
                {
                    workspace: {
                        mode: 'attach',
                        path: escapeLink,
                        allowedRoots: [allowedRoot],
                    },
                },
            ),
        ).rejects.toThrow(/outside allowed workspace roots/i);
    });

    it('rejects non-git directories when requireGitRepo is not false', async () => {
        const plainDir = join(allowedRoot, 'plain-folder');
        mkdirSync(plainDir, { recursive: true });
        const provider = new LocalDirectorySandboxProvider();

        await expect(
            provider.Provision(
                { Scope: 'run', AgentId: 'a1', RunId: 'r3' },
                {
                    workspace: {
                        mode: 'attach',
                        path: plainDir,
                        allowedRoots: [allowedRoot],
                    },
                },
            ),
        ).rejects.toThrow(/not a git repository/i);
    });
});

describe('ClaudeCodeCliAdapter AdditionalDirectories', () => {
    it('passes unique --add-dir arguments excluding WorkspacePath', async () => {
        const executor = new CapturingExecutor();
        const adapter = new ClaudeCodeCliAdapter();
        await adapter.StartSession({
            Executor: executor,
            WorkspacePath: '/ws/bizapps-planning',
            AdditionalDirectories: ['/ws/bizapps-planning', '/ws', '  ', '/ws'],
            Environment: {},
        });

        for await (const _ of adapter.RunTurn('check status')) {
            // consume
        }

        expect(executor.LastSpec?.Args).toContain('--add-dir');
        const addDirIdx = executor.LastSpec?.Args.indexOf('--add-dir') ?? -1;
        expect(executor.LastSpec?.Args[addDirIdx + 1]).toBe('/ws');
        expect(executor.LastSpec?.Args.filter((a) => a === '--add-dir')).toHaveLength(1);
    });
});

class TestableHarnessAgent extends HarnessAgentBase {
    public async callDetermineNextStep<P>(
        params: ExecuteAgentParams<Record<string, string>, P>,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
    ) {
        return this.determineNextStep(params, agentType, promptResult, currentPayload);
    }
}

describe('HarnessAgentBase wall-clock timeout handling', () => {
    it('terminates immediately without burning retries when limits.maxWallClockSeconds is exceeded', async () => {
        const agent = new TestableHarnessAgent();
        Reflect.set(agent, '_agentTypeInstance', new HarnessAgentType());
        const promptResult = {
            success: false,
            result: '',
            rawResult: '',
            errorMessage: 'Harness turn exceeded configured limits.maxWallClockSeconds (1800s). (claude exited (code 143))',
        } as AIPromptRunResult;
        const params = {
            conversationMessages: [],
        } as ExecuteAgentParams<Record<string, string>, Record<string, string>>;
        const agentType = { Name: 'HarnessAgentType' } as MJAIAgentTypeEntity;

        const step = await agent.callDetermineNextStep(params, agentType, promptResult, {});
        expect(step.step).toBe('Failed');
        expect(step.terminate).toBe(true);
        expect(step.errorMessage).toContain('limits.maxWallClockSeconds');
    });
});
