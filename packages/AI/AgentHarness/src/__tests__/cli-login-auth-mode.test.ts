import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DetectLocalCliLoginSession,
    GetLocalCliLoginCommand,
    HARNESS_STRIPPED_API_KEY_VARS,
    IsHarnessApiKeyEnvVar,
    IsLocalCliLoginDriver,
    ResolveEffectiveHarnessAuthMode,
    StripHarnessApiKeyEnvironment,
} from '../HarnessCredentialResolver.js';
import { AntigravityCliAdapter } from '../adapters/AntigravityCliAdapter.js';
import { ClaudeCodeCliAdapter } from '../adapters/ClaudeCodeCliAdapter.js';
import { CodexAdapter } from '../adapters/CodexAdapter.js';
import { GeminiCliAdapter } from '../adapters/GeminiCliAdapter.js';
import { HarnessAgentBase, type HarnessAgentConfig } from '../HarnessAgentBase.js';
import { ChildProcessExecutor } from '../sandbox/ChildProcessExecutor.js';
import type { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from '../sandbox/SandboxExecutor.js';
import type { MJAIAgentHarnessEntity } from '@memberjunction/core-entities';

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

class TestableHarnessAgent extends HarnessAgentBase {
    public SetHarnessRow(row: MJAIAgentHarnessEntity): void {
        this.harnessRow = row;
    }

    public GetEffectiveAuthMode(): 'cli-login' | 'api-key' {
        return this.effectiveAuthMode;
    }

    public async ResolveEnvForTest(config: HarnessAgentConfig): Promise<Record<string, string>> {
        return this.resolveGrantedEnvironment(undefined, config);
    }
}

function createTempHome(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mj-cli-login-test-'));
}

function createFakeProcess(stdoutLines: string[]): HarnessProcess {
    async function* emitLines(lines: string[]): AsyncIterable<string> {
        for (const line of lines) {
            yield line;
        }
    }
    return {
        Stdin: null,
        Stdout: emitLines(stdoutLines),
        Stderr: emitLines([]),
        ExitCode: Promise.resolve(0),
        Kill: vi.fn(),
    };
}

describe('Local CLI Login / Subscription Auth Mode', () => {
    let tempDirs: string[] = [];

    beforeEach(() => {
        tempDirs = [];
    });

    afterEach(() => {
        for (const dir of tempDirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        tempDirs = [];
    });

    function makeTempDir(): string {
        const dir = createTempHome();
        tempDirs.push(dir);
        return dir;
    }

    describe('DetectLocalCliLoginSession', () => {
        it('detects AntigravityCliAdapter login under ~/.gemini/antigravity, ~/.config/antigravity, or $XDG_CONFIG_HOME/antigravity', () => {
            const home1 = makeTempDir();
            expect(DetectLocalCliLoginSession('AntigravityCliAdapter', { homeDir: home1 })).toEqual({
                hasLocalLogin: false,
                indicatorPath: null,
            });

            const agyDir = path.join(home1, '.gemini', 'antigravity');
            fs.mkdirSync(agyDir, { recursive: true });
            expect(DetectLocalCliLoginSession('AntigravityCliAdapter', { homeDir: home1 })).toEqual({
                hasLocalLogin: true,
                indicatorPath: agyDir,
            });

            const home2 = makeTempDir();
            const configAgyDir = path.join(home2, '.config', 'antigravity');
            fs.mkdirSync(configAgyDir, { recursive: true });
            expect(
                DetectLocalCliLoginSession('AntigravityCliAdapter', { homeDir: home2, env: {} }),
            ).toEqual({
                hasLocalLogin: true,
                indicatorPath: configAgyDir,
            });

            const home3 = makeTempDir();
            const xdgDir = makeTempDir();
            const xdgAgy = path.join(xdgDir, 'antigravity');
            fs.mkdirSync(xdgAgy, { recursive: true });
            expect(
                DetectLocalCliLoginSession('AntigravityCliAdapter', {
                    homeDir: home3,
                    env: { XDG_CONFIG_HOME: xdgDir },
                }),
            ).toEqual({
                hasLocalLogin: true,
                indicatorPath: xdgAgy,
            });
        });

        it('detects ClaudeCodeCliAdapter login via ~/.claude/.credentials.json, ~/.claude.json, or ~/.claude', () => {
            const home = makeTempDir();
            expect(DetectLocalCliLoginSession('ClaudeCodeCliAdapter', { homeDir: home }).hasLocalLogin).toBe(false);

            const claudeJson = path.join(home, '.claude.json');
            fs.writeFileSync(claudeJson, '{"oauthAccount":{}}', 'utf8');
            expect(DetectLocalCliLoginSession('ClaudeCodeCliAdapter', { homeDir: home })).toEqual({
                hasLocalLogin: true,
                indicatorPath: claudeJson,
            });

            const credsFile = path.join(home, '.claude', '.credentials.json');
            fs.mkdirSync(path.dirname(credsFile), { recursive: true });
            fs.writeFileSync(credsFile, '{}', 'utf8');
            expect(DetectLocalCliLoginSession('ClaudeCodeCliAdapter', { homeDir: home })).toEqual({
                hasLocalLogin: true,
                indicatorPath: credsFile,
            });
        });

        it('detects CodexAdapter login via ~/.codex/auth.json', () => {
            const home = makeTempDir();
            expect(DetectLocalCliLoginSession('CodexAdapter', { homeDir: home }).hasLocalLogin).toBe(false);

            const authFile = path.join(home, '.codex', 'auth.json');
            fs.mkdirSync(path.dirname(authFile), { recursive: true });
            fs.writeFileSync(authFile, '{"tokens":{}}', 'utf8');
            expect(DetectLocalCliLoginSession('CodexAdapter', { homeDir: home })).toEqual({
                hasLocalLogin: true,
                indicatorPath: authFile,
            });
        });

        it('detects GeminiCliAdapter login via ~/.gemini/oauth_creds.json or ~/.gemini/google_accounts.json', () => {
            const home = makeTempDir();
            expect(DetectLocalCliLoginSession('GeminiCliAdapter', { homeDir: home }).hasLocalLogin).toBe(false);

            const accountsFile = path.join(home, '.gemini', 'google_accounts.json');
            fs.mkdirSync(path.dirname(accountsFile), { recursive: true });
            fs.writeFileSync(accountsFile, '{}', 'utf8');
            expect(DetectLocalCliLoginSession('GeminiCliAdapter', { homeDir: home })).toEqual({
                hasLocalLogin: true,
                indicatorPath: accountsFile,
            });

            const oauthFile = path.join(home, '.gemini', 'oauth_creds.json');
            fs.writeFileSync(oauthFile, '{}', 'utf8');
            expect(DetectLocalCliLoginSession('GeminiCliAdapter', { homeDir: home })).toEqual({
                hasLocalLogin: true,
                indicatorPath: oauthFile,
            });
        });

        it('returns hasLocalLogin=false for cloud adapters', () => {
            const home = makeTempDir();
            fs.mkdirSync(path.join(home, '.gemini', 'antigravity'), { recursive: true });
            expect(IsLocalCliLoginDriver('AntigravityCloudAdapter')).toBe(false);
            expect(IsLocalCliLoginDriver('ClaudeCodeCloudAdapter')).toBe(false);
            expect(IsLocalCliLoginDriver('CodexCloudAdapter')).toBe(false);
            expect(DetectLocalCliLoginSession('AntigravityCloudAdapter', { homeDir: home })).toEqual({
                hasLocalLogin: false,
                indicatorPath: null,
            });
        });
    });

    describe('ResolveEffectiveHarnessAuthMode', () => {
        it('resolves auto -> cli-login on local CLI adapters when local login exists and no explicit API-key grant is bound', () => {
            const home = makeTempDir();
            fs.mkdirSync(path.join(home, '.gemini', 'antigravity'), { recursive: true });

            const resolved = ResolveEffectiveHarnessAuthMode('AntigravityCliAdapter', {
                homeDir: home,
                env: {},
                hasExplicitApiKeyGrant: false,
            });
            expect(resolved.requestedMode).toBe('auto');
            expect(resolved.effectiveMode).toBe('cli-login');
            expect(resolved.hasLocalLogin).toBe(true);
        });

        it('resolves auto -> api-key when an explicit API-key grant is bound or MJ_HARNESS_PREFER_CLI_LOGIN=0', () => {
            const home = makeTempDir();
            fs.mkdirSync(path.join(home, '.gemini', 'antigravity'), { recursive: true });

            const withGrant = ResolveEffectiveHarnessAuthMode('AntigravityCliAdapter', {
                homeDir: home,
                env: {},
                hasExplicitApiKeyGrant: true,
            });
            expect(withGrant.effectiveMode).toBe('api-key');

            const disabledByEnv = ResolveEffectiveHarnessAuthMode('AntigravityCliAdapter', {
                homeDir: home,
                env: { MJ_HARNESS_PREFER_CLI_LOGIN: '0' },
                hasExplicitApiKeyGrant: false,
            });
            expect(disabledByEnv.effectiveMode).toBe('api-key');
        });

        it('honors precedence: configuredAuthMode > harnessConfigurationJson > MJ_HARNESS_AUTH_MODE > auto', () => {
            const home = makeTempDir();
            fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
            fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}', 'utf8');

            const fromEnv = ResolveEffectiveHarnessAuthMode('CodexAdapter', {
                homeDir: home,
                env: { MJ_HARNESS_AUTH_MODE: 'api-key' },
            });
            expect(fromEnv.requestedMode).toBe('api-key');
            expect(fromEnv.effectiveMode).toBe('api-key');

            const fromConfigJson = ResolveEffectiveHarnessAuthMode('CodexAdapter', {
                homeDir: home,
                harnessConfigurationJson: JSON.stringify({ authMode: 'cli-login' }),
                env: { MJ_HARNESS_AUTH_MODE: 'api-key' },
            });
            expect(fromConfigJson.requestedMode).toBe('cli-login');
            expect(fromConfigJson.effectiveMode).toBe('cli-login');

            const fromConfigured = ResolveEffectiveHarnessAuthMode('CodexAdapter', {
                homeDir: home,
                configuredAuthMode: 'api-key',
                harnessConfigurationJson: JSON.stringify({ authMode: 'cli-login' }),
                env: { MJ_HARNESS_AUTH_MODE: 'cli-login' },
            });
            expect(fromConfigured.requestedMode).toBe('api-key');
            expect(fromConfigured.effectiveMode).toBe('api-key');
        });

        it('always resolves cloud adapters to api-key', () => {
            const home = makeTempDir();
            fs.mkdirSync(path.join(home, '.gemini', 'antigravity'), { recursive: true });

            for (const cloudDriver of [
                'AntigravityCloudAdapter',
                'ClaudeCodeCloudAdapter',
                'CodexCloudAdapter',
            ]) {
                const resolved = ResolveEffectiveHarnessAuthMode(cloudDriver, {
                    configuredAuthMode: 'cli-login',
                    homeDir: home,
                    env: {},
                });
                expect(resolved.isLocalCliDriver).toBe(false);
                expect(resolved.effectiveMode).toBe('api-key');
            }
        });

        it('returns actionable login command hints for all 4 local CLI drivers', () => {
            expect(GetLocalCliLoginCommand('AntigravityCliAdapter')).toContain('agy');
            expect(GetLocalCliLoginCommand('ClaudeCodeCliAdapter')).toContain('claude');
            expect(GetLocalCliLoginCommand('CodexAdapter')).toContain('codex');
            expect(GetLocalCliLoginCommand('GeminiCliAdapter')).toContain('gemini');
        });
    });

    describe('StripHarnessApiKeyEnvironment & adapter env isolation', () => {
        it('strips all provider API-key variables and AI_VENDOR_API_KEY__* while keeping GH_TOKEN and HOME', () => {
            const env: Record<string, string> = {
                GEMINI_API_KEY: 'gm-1',
                GOOGLE_API_KEY: 'go-1',
                ANTIGRAVITY_API_KEY: 'ag-1',
                ANTHROPIC_API_KEY: 'an-1',
                OPENAI_API_KEY: 'oa-1',
                CODEX_API_KEY: 'cx-1',
                AI_VENDOR_API_KEY__GEMINILLM: 'v-1',
                AI_VENDOR_API_KEY__ANTHROPICLLM: 'v-2',
                GH_TOKEN: 'ghs_keep_me',
                HOME: '/tmp/user-home',
                XDG_CONFIG_HOME: '/tmp/user-config',
            };

            StripHarnessApiKeyEnvironment(env);

            for (const key of HARNESS_STRIPPED_API_KEY_VARS) {
                expect(env[key]).toBeUndefined();
                expect(IsHarnessApiKeyEnvVar(key)).toBe(true);
            }
            expect(env.AI_VENDOR_API_KEY__GEMINILLM).toBeUndefined();
            expect(env.AI_VENDOR_API_KEY__ANTHROPICLLM).toBeUndefined();
            expect(env.GH_TOKEN).toBe('ghs_keep_me');
            expect(env.HOME).toBe('/tmp/user-home');
            expect(env.XDG_CONFIG_HOME).toBe('/tmp/user-config');
        });

        it('strips API keys across all 4 local CLI adapters when AuthMode is cli-login', async () => {
            const adapters = [
                {
                    adapter: new AntigravityCliAdapter(),
                    stdout: [JSON.stringify({ type: 'result', response: '{"taskComplete":true}' })],
                },
                {
                    adapter: new ClaudeCodeCliAdapter(),
                    stdout: [JSON.stringify({ type: 'result', result: '{"taskComplete":true}' })],
                },
                {
                    adapter: new CodexAdapter(),
                    stdout: [JSON.stringify({ type: 'turn_complete', text: '{"taskComplete":true}' })],
                },
                {
                    adapter: new GeminiCliAdapter(),
                    stdout: [JSON.stringify({ response: '{"taskComplete":true}' })],
                },
            ];

            for (const entry of adapters) {
                let capturedEnv: Record<string, string> | undefined;
                const executor: SandboxExecutor = {
                    Run(spec: HarnessProcessSpec): HarnessProcess {
                        capturedEnv = spec.Environment;
                        return createFakeProcess(entry.stdout);
                    },
                };

                await entry.adapter.StartSession({
                    Executor: executor,
                    WorkspacePath: '/tmp/test-workspace',
                    AuthMode: 'cli-login',
                    Environment: {
                        GEMINI_API_KEY: 'secret-gemini',
                        GOOGLE_API_KEY: 'secret-google',
                        ANTIGRAVITY_API_KEY: 'secret-agy',
                        ANTHROPIC_API_KEY: 'secret-anthropic',
                        OPENAI_API_KEY: 'secret-openai',
                        CODEX_API_KEY: 'secret-codex',
                        AI_VENDOR_API_KEY__GEMINILLM: 'secret-vendor',
                        GH_TOKEN: 'ghs_allowed',
                    },
                });

                for await (const _ev of entry.adapter.RunTurn('hello')) {
                    // drain turn events
                }

                expect(capturedEnv).toBeDefined();
                expect(capturedEnv?.GEMINI_API_KEY).toBeUndefined();
                expect(capturedEnv?.GOOGLE_API_KEY).toBeUndefined();
                expect(capturedEnv?.ANTIGRAVITY_API_KEY).toBeUndefined();
                expect(capturedEnv?.ANTHROPIC_API_KEY).toBeUndefined();
                expect(capturedEnv?.OPENAI_API_KEY).toBeUndefined();
                expect(capturedEnv?.CODEX_API_KEY).toBeUndefined();
                expect(capturedEnv?.AI_VENDOR_API_KEY__GEMINILLM).toBeUndefined();
                expect(capturedEnv?.GH_TOKEN).toBe('ghs_allowed');
            }
        });

        it('preserves NormalizeAntigravityEnvironment when AuthMode is api-key', async () => {
            let capturedEnv: Record<string, string> | undefined;
            const executor: SandboxExecutor = {
                Run(spec: HarnessProcessSpec): HarnessProcess {
                    capturedEnv = spec.Environment;
                    return createFakeProcess([
                        JSON.stringify({ type: 'result', response: '{"taskComplete":true}' }),
                    ]);
                },
            };

            const adapter = new AntigravityCliAdapter();
            await adapter.StartSession({
                Executor: executor,
                WorkspacePath: '/tmp/test-workspace',
                AuthMode: 'api-key',
                Environment: { GEMINI_API_KEY: 'gm-api-key-123' },
            });

            for await (const _ev of adapter.RunTurn('hello')) {
                // drain
            }

            expect(capturedEnv?.GEMINI_API_KEY).toBe('gm-api-key-123');
            expect(capturedEnv?.ANTIGRAVITY_API_KEY).toBe('gm-api-key-123');
            expect(capturedEnv?.GOOGLE_API_KEY).toBe('gm-api-key-123');
        });
    });

    describe('ChildProcessExecutor host environment allowlist', () => {
        it('preserves HOME, USER, LOGNAME, and XDG_CONFIG_HOME while never leaking ungranted host secrets', async () => {
            const origXdg = process.env.XDG_CONFIG_HOME;
            const origDbPass = process.env.DB_PASSWORD;
            const origVendorKey = process.env.AI_VENDOR_API_KEY__GEMINILLM;
            const origGeminiKey = process.env.GEMINI_API_KEY;

            const fakeXdg = makeTempDir();
            process.env.XDG_CONFIG_HOME = fakeXdg;
            process.env.DB_PASSWORD = 'super-secret-db-password';
            process.env.AI_VENDOR_API_KEY__GEMINILLM = 'super-secret-vendor-key';
            process.env.GEMINI_API_KEY = 'super-secret-gemini-key';

            try {
                const executor = new ChildProcessExecutor(os.tmpdir());
                const proc = executor.Run({
                    Command: process.execPath,
                    Args: [
                        '-e',
                        'console.log(JSON.stringify({HOME:process.env.HOME,USER:process.env.USER,LOGNAME:process.env.LOGNAME,XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME,DB_PASSWORD:process.env.DB_PASSWORD,AI_VENDOR_API_KEY__GEMINILLM:process.env.AI_VENDOR_API_KEY__GEMINILLM,GEMINI_API_KEY:process.env.GEMINI_API_KEY}))',
                    ],
                    Environment: {},
                });

                const lines: string[] = [];
                for await (const line of proc.Stdout) {
                    lines.push(line);
                }
                await proc.ExitCode;

                interface EnvProbe {
                    HOME?: string;
                    USER?: string;
                    LOGNAME?: string;
                    XDG_CONFIG_HOME?: string;
                    DB_PASSWORD?: string;
                    AI_VENDOR_API_KEY__GEMINILLM?: string;
                    GEMINI_API_KEY?: string;
                }
                const observed: EnvProbe = JSON.parse(lines.join(''));
                expect(observed.HOME).toBe(process.env.HOME);
                expect(observed.XDG_CONFIG_HOME).toBe(fakeXdg);
                if (process.env.USER !== undefined) {
                    expect(observed.USER).toBe(process.env.USER);
                }
                if (process.env.LOGNAME !== undefined) {
                    expect(observed.LOGNAME).toBe(process.env.LOGNAME);
                }
                expect(observed.DB_PASSWORD).toBeUndefined();
                expect(observed.AI_VENDOR_API_KEY__GEMINILLM).toBeUndefined();
                expect(observed.GEMINI_API_KEY).toBeUndefined();
            } finally {
                if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
                else process.env.XDG_CONFIG_HOME = origXdg;
                if (origDbPass === undefined) delete process.env.DB_PASSWORD;
                else process.env.DB_PASSWORD = origDbPass;
                if (origVendorKey === undefined) delete process.env.AI_VENDOR_API_KEY__GEMINILLM;
                else process.env.AI_VENDOR_API_KEY__GEMINILLM = origVendorKey;
                if (origGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
                else process.env.GEMINI_API_KEY = origGeminiKey;
            }
        });
    });

    describe('HarnessAgentBase authMode enforcement', () => {
        it('throws an actionable error when authMode=cli-login is explicitly requested but no local login session exists', async () => {
            const emptyHome = makeTempDir();
            const origHome = process.env.HOME;
            const origXdg = process.env.XDG_CONFIG_HOME;
            process.env.HOME = emptyHome;
            delete process.env.XDG_CONFIG_HOME;

            try {
                const agent = new TestableHarnessAgent();
                const harnessRow = {
                    Name: 'Antigravity CLI',
                    DriverClass: 'AntigravityCliAdapter',
                    CapabilitySettings: JSON.stringify({ authMode: 'cli-login' }),
                } as MJAIAgentHarnessEntity;
                agent.SetHarnessRow(harnessRow);

                await expect(
                    agent.ResolveEnvForTest({ authMode: 'cli-login' }),
                ).rejects.toThrow(/agy auth login.*api-key/s);
            } finally {
                if (origHome === undefined) delete process.env.HOME;
                else process.env.HOME = origHome;
                if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
                else process.env.XDG_CONFIG_HOME = origXdg;
            }
        });

        it('skips vendor API-key fallback and strips API keys in cli-login mode when local login exists', async () => {
            const fakeHome = makeTempDir();
            fs.mkdirSync(path.join(fakeHome, '.gemini', 'antigravity'), { recursive: true });
            const origHome = process.env.HOME;
            const origGemini = process.env.GEMINI_API_KEY;
            const origVendor = process.env.AI_VENDOR_API_KEY__GEMINILLM;
            process.env.HOME = fakeHome;
            process.env.GEMINI_API_KEY = 'should-not-be-injected';
            process.env.AI_VENDOR_API_KEY__GEMINILLM = 'should-not-be-injected-vendor';

            try {
                const agent = new TestableHarnessAgent();
                const harnessRow = {
                    Name: 'Antigravity CLI',
                    DriverClass: 'AntigravityCliAdapter',
                    CapabilitySettings: null,
                } as MJAIAgentHarnessEntity;
                agent.SetHarnessRow(harnessRow);

                const env = await agent.ResolveEnvForTest({ authMode: 'cli-login' });
                expect(agent.GetEffectiveAuthMode()).toBe('cli-login');
                expect(env.GEMINI_API_KEY).toBeUndefined();
                expect(env.GOOGLE_API_KEY).toBeUndefined();
                expect(env.ANTIGRAVITY_API_KEY).toBeUndefined();
                expect(env.AI_VENDOR_API_KEY__GEMINILLM).toBeUndefined();
            } finally {
                if (origHome === undefined) delete process.env.HOME;
                else process.env.HOME = origHome;
                if (origGemini === undefined) delete process.env.GEMINI_API_KEY;
                else process.env.GEMINI_API_KEY = origGemini;
                if (origVendor === undefined) delete process.env.AI_VENDOR_API_KEY__GEMINILLM;
                else process.env.AI_VENDOR_API_KEY__GEMINILLM = origVendor;
            }
        });
    });
});
