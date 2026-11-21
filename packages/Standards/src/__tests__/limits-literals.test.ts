import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LimitsLiteralsCheck } from '../checks/limits-literals.js';

const tempDirs: string[] = [];

function createTempRepo(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-std-limits-'));
    tempDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
    }
    return dir;
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const d = tempDirs.pop();
        if (d && fs.existsSync(d)) {
            fs.rmSync(d, { recursive: true, force: true });
        }
    }
});

describe('limits-literals standard', () => {
    it('flags unapproved RunawayGuard literals introduced outside LimitsConfigResolver', async () => {
        const repo = createTempRepo({
            'packages/Example/src/bad.ts': [
                'export const MAX_AGENT_ITERATIONS = 5000;',
                'export function loop(params: { maxIterations?: number }) {',
                '  return params.maxIterations ?? 100;',
                '}',
            ].join('\n'),
        });

        const res = await LimitsLiteralsCheck.Run({
            RepoRoot: repo,
            Roots: ['packages'],
            Options: LimitsLiteralsCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(2);
        expect(res.Violations[0].File).toBe('packages/Example/src/bad.ts');
        expect(res.Violations[0].Message).toContain('MAX_AGENT_ITERATIONS');
        expect(res.Violations[1].Message).toContain('params.maxIterations');
    });

    it('permits literals inside AllowedFiles and literals annotated as ProtocolLimit / ResourceGuard / UX / Tuning', async () => {
        const repo = createTempRepo({
            'packages/MJCore/src/generic/limitsConfig.ts': 'export const CODE_FALLBACK = { AgentAbsoluteIterations: 100000 };\n',
            'packages/Example/src/ok.ts': [
                '// ProtocolLimit: RFC 5321 specifies max 254 characters',
                'export const MAX_EMAIL_LENGTH = 254;',
                '// Tuning: batch size for display',
                'export const DEFAULT_ITERATION_PREVIEW = 20;',
            ].join('\n'),
        });

        const res = await LimitsLiteralsCheck.Run({
            RepoRoot: repo,
            Roots: ['packages'],
            Options: { AllowedFiles: ['packages/MJCore/src/generic/limitsConfig.ts'] },
        });

        expect(res.Violations).toHaveLength(0);
    });
});
