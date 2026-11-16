import type * as childProcess from 'node:child_process';
import * as fssync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const execFileSpy = vi.fn();

vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof childProcess>();
    return {
        ...actual,
        execFile: (...args: unknown[]) => {
            if (execFileSpy.getMockImplementation()) {
                return execFileSpy(...args);
            }
            return (actual.execFile as (...a: unknown[]) => unknown)(...args);
        },
    };
});

import { HyperFramesRenderBackend } from '../hyperframes-backend.js';
import {
    BuildCheckCliFailedIssue,
    BuildReducedCheckCliEnv,
    MJ_CHECK_CLI_FAILED_CODE,
    MJ_CHECK_CLI_UNREADABLE_CODE,
    MapHyperFramesCheckOutput,
} from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDED_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'hyperframes-check-output.json');

describe('MapHyperFramesCheckOutput', () => {
    it('maps the recorded hyperframes check --json output to Layout and Contrast issues', async () => {
        const rawJson = await fs.readFile(RECORDED_FIXTURE_PATH, 'utf8');
        const issues = MapHyperFramesCheckOutput(rawJson);

        const layoutErrors = issues.filter(
            (i) => i.Category === 'Layout' && i.Severity === 'Error',
        );
        const layoutWarnings = issues.filter(
            (i) => i.Category === 'Layout' && i.Severity === 'Warning',
        );
        const contrastErrors = issues.filter(
            (i) => i.Category === 'Contrast' && i.Severity === 'Error',
        );

        expect(layoutErrors).toEqual([
            expect.objectContaining({
                Code: 'text_box_overflow',
                Category: 'Layout',
                Severity: 'Error',
                Selector: '#overflow-box',
                File: 'index.html',
                TimestampSeconds: 0.111,
            }),
        ]);
        expect(layoutWarnings).toEqual([
            expect.objectContaining({
                Code: 'canvas_overflow',
                Category: 'Layout',
                Severity: 'Warning',
                Selector: '#overflow-box',
                File: 'index.html',
                TimestampSeconds: 0.111,
            }),
        ]);
        expect(contrastErrors.length).toBe(5);
        expect(contrastErrors[0]).toEqual(
            expect.objectContaining({
                Code: 'contrast_aa_failure',
                Category: 'Contrast',
                Severity: 'Error',
                Selector: '#low-contrast',
                File: 'index.html',
                TimestampSeconds: 0.111,
            }),
        );
    });

    it('maps motion findings to Lint category with Error or Warning severity', () => {
        const issues = MapHyperFramesCheckOutput({
            ok: false,
            layout: { findings: [] },
            contrast: { findings: [] },
            motion: {
                findings: [
                    {
                        code: 'jitter',
                        severity: 'warning',
                        message: 'Jitter detected on #card.',
                        selector: '#card',
                        sourceFile: 'index.html',
                        time: 0.5,
                    },
                    {
                        code: 'motion_spike',
                        severity: 'error',
                        message: 'Excessive velocity spike.',
                        selector: '#card',
                        sourceFile: 'index.html',
                        time: 1.0,
                    },
                ],
            },
        });

        expect(issues).toEqual([
            {
                Code: 'jitter',
                Category: 'Lint',
                Severity: 'Warning',
                Message: 'Jitter detected on #card.',
                Selector: '#card',
                File: 'index.html',
                TimestampSeconds: 0.5,
            },
            {
                Code: 'motion_spike',
                Category: 'Lint',
                Severity: 'Error',
                Message: 'Excessive velocity spike.',
                Selector: '#card',
                File: 'index.html',
                TimestampSeconds: 1.0,
            },
        ]);
    });

    it('maps garbage, empty output, or missing sections to one MJ_CHECK_CLI_UNREADABLE Warning', () => {
        for (const badInput of ['', 'not-json {{{', 'null', '[]', '{}']) {
            const issues = MapHyperFramesCheckOutput(badInput);
            expect(issues).toEqual([
                expect.objectContaining({
                    Code: MJ_CHECK_CLI_UNREADABLE_CODE,
                    Category: 'Lint',
                    Severity: 'Warning',
                }),
            ]);
        }
    });

    it('maps top-level {"ok":false,"error":"..."} JSON to one MJ_CHECK_CLI_FAILED Warning naming the error', () => {
        const issues = MapHyperFramesCheckOutput('{"ok":false,"error":"Chrome not found"}');
        expect(issues).toEqual([
            {
                Code: MJ_CHECK_CLI_FAILED_CODE,
                Category: 'Lint',
                Severity: 'Warning',
                Message: 'HyperFrames check CLI failed: Chrome not found',
            },
        ]);
    });

    it('builds MJ_CHECK_CLI_FAILED Warning for crashed subprocesses', () => {
        const issue = BuildCheckCliFailedIssue('Command timed out after 120000ms');
        expect(issue).toEqual({
            Code: MJ_CHECK_CLI_FAILED_CODE,
            Category: 'Lint',
            Severity: 'Warning',
            Message: 'HyperFrames check CLI failed: Command timed out after 120000ms',
        });
    });

    it('BuildReducedCheckCliEnv returns only the 6 allowlisted keys and strips secrets like OPENAI_API_KEY', () => {
        const prevOpenAi = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'sk-secret';
        try {
            const env = BuildReducedCheckCliEnv(process.env, '/tmp/mj-hf-home', '/opt/chrome-headless-shell');
            expect(Object.keys(env)).toEqual([
                'PATH',
                'TMPDIR',
                'HOME',
                'HYPERFRAMES_NO_TELEMETRY',
                'DO_NOT_TRACK',
                'HYPERFRAMES_BROWSER_PATH',
            ]);
            expect(env.OPENAI_API_KEY).toBeUndefined();
            expect(env.HOME).toBe('/tmp/mj-hf-home');
            expect(env.HYPERFRAMES_NO_TELEMETRY).toBe('1');
            expect(env.DO_NOT_TRACK).toBe('1');
            expect(env.HYPERFRAMES_BROWSER_PATH).toBe('/opt/chrome-headless-shell');
        } finally {
            if (prevOpenAi === undefined) {
                delete process.env.OPENAI_API_KEY;
            } else {
                process.env.OPENAI_API_KEY = prevOpenAi;
            }
        }
    });

    it('HyperFramesRenderBackend.RunCheckCli passes --no-browser-gpu, exact 6-key reduced env with HYPERFRAMES_BROWSER_PATH===CHROME_PATH, and removes the temporary HOME directory after completion', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-runcheckcli-test-'));
        const fakeBrowserPath = path.join(tempRoot, 'fake-chrome-binary');
        const bundleDir = path.join(tempRoot, 'bundle');
        await fs.mkdir(bundleDir, { recursive: true });
        await fs.writeFile(fakeBrowserPath, '#!/bin/sh\n', 'utf8');
        await fs.writeFile(path.join(bundleDir, 'index.html'), '<!doctype html><html><body></body></html>', 'utf8');

        const prevChromePath = process.env.CHROME_PATH;
        const prevOpenAi = process.env.OPENAI_API_KEY;
        process.env.CHROME_PATH = fakeBrowserPath;
        process.env.OPENAI_API_KEY = 'sk-should-not-leak';

        let capturedFile = '';
        let capturedArgs: string[] = [];
        let capturedEnv: NodeJS.ProcessEnv | undefined;
        let homeExistedDuringCall = false;

        execFileSpy.mockImplementation(
            (
                file: string,
                args: readonly string[],
                options: { env?: NodeJS.ProcessEnv },
                cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
            ) => {
                capturedFile = file;
                capturedArgs = [...args];
                capturedEnv = options?.env ? { ...options.env } : undefined;
                if (capturedEnv?.HOME) {
                    homeExistedDuringCall = fssync.existsSync(capturedEnv.HOME);
                }
                cb(null, {
                    stdout: JSON.stringify({
                        ok: true,
                        layout: { findings: [] },
                        contrast: { findings: [] },
                        motion: { findings: [] },
                    }),
                    stderr: '',
                });
            },
        );

        try {
            const backend = new HyperFramesRenderBackend();
            const issues = await backend.RunCheckCli({
                RootDir: bundleDir,
                EntryFile: 'index.html',
                Width: 1280,
                Height: 720,
                Fps: 30,
            });
            expect(issues).toEqual([]);
            expect(capturedFile).toBe(process.execPath);
            expect(capturedArgs).toContain('check');
            expect(capturedArgs).toContain('--json');
            expect(capturedArgs).toContain('--no-proxy');
            expect(capturedArgs).toContain('--no-browser-gpu');
            expect(capturedArgs[capturedArgs.length - 1]).toBe(bundleDir);

            expect(capturedEnv).toBeDefined();
            expect(Object.keys(capturedEnv ?? {})).toEqual([
                'PATH',
                'TMPDIR',
                'HOME',
                'HYPERFRAMES_NO_TELEMETRY',
                'DO_NOT_TRACK',
                'HYPERFRAMES_BROWSER_PATH',
            ]);
            expect(capturedEnv?.HYPERFRAMES_NO_TELEMETRY).toBe('1');
            expect(capturedEnv?.DO_NOT_TRACK).toBe('1');
            expect(capturedEnv?.HYPERFRAMES_BROWSER_PATH).toBe(fakeBrowserPath);
            expect(capturedEnv?.OPENAI_API_KEY).toBeUndefined();
            expect(homeExistedDuringCall).toBe(true);
            expect(fssync.existsSync(capturedEnv?.HOME ?? '')).toBe(false);
        } finally {
            execFileSpy.mockReset();
            if (prevChromePath === undefined) {
                delete process.env.CHROME_PATH;
            } else {
                process.env.CHROME_PATH = prevChromePath;
            }
            if (prevOpenAi === undefined) {
                delete process.env.OPENAI_API_KEY;
            } else {
                process.env.OPENAI_API_KEY = prevOpenAi;
            }
            await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
        }
    });
});
