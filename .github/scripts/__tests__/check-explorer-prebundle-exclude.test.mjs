import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateAngularJson, SELF_TEST_FIXTURES } from '../check-explorer-prebundle-exclude.mjs';
import { readJobSteps, readJobNeeds, stepCondition, readWorkflow } from './lib/workflow.mjs';

// Issue #3875: a joined workspace's linked scopes must not be committed to an angular.json.

const SCRIPT = fileURLToPath(new URL('../check-explorer-prebundle-exclude.mjs', import.meta.url));
const GUARD = 'Angular prebundle exclude guard';

const withExclude = (exclude) => ({ projects: { App: { architect: { serve: { options: { prebundle: { exclude } } } } } } });

describe('evaluateAngularJson', () => {
    it('passes "@memberjunction/*" only', () => {
        expect(evaluateAngularJson(withExclude(['@memberjunction/*'])).ok).toBe(true);
    });

    it('fails an extra scope and names it', () => {
        const { ok, errors } = evaluateAngularJson(withExclude(['@memberjunction/*', '@mj-biz-apps/*']));
        expect(ok).toBe(false);
        expect(errors[0]).toContain('"@mj-biz-apps/*"');
    });

    it('self-test fixtures all behave as labelled', () => {
        for (const [label, expectedOk, json] of SELF_TEST_FIXTURES) {
            expect(evaluateAngularJson(json).ok, label).toBe(expectedOk);
        }
    });
});

describe('CLI', () => {
    const run = (content) => {
        const dir = mkdtempSync(join(tmpdir(), 'prebundle-guard-'));
        try {
            const file = join(dir, 'angular.json');
            writeFileSync(file, content, 'utf8');
            return spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    };

    it('exits 1 on a committed linked scope', () => {
        expect(run(JSON.stringify(withExclude(['@memberjunction/*', '@mj-biz-apps/*']))).status).toBe(1);
    });

    it('exits 0 on the committed default', () => {
        expect(run(JSON.stringify(withExclude(['@memberjunction/*']))).status).toBe(0);
    });

    it('passes the repo as committed', () => {
        expect(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status).toBe(0);
    });
});

describe('test.yml placement', () => {
    const guard = readJobSteps('guards').find((s) => s.name === GUARD);

    it('runs in the guards job, self-test first, regardless of earlier failures', () => {
        expect(guard, `"${GUARD}" step in the guards job`).toBeDefined();
        expect(readJobNeeds('guards')).toEqual([]);
        const body = guard.body.join('\n');
        expect(body.indexOf('--self-test')).toBeGreaterThanOrEqual(0);
        expect(body.indexOf('--self-test')).toBeLessThan(body.lastIndexOf('check-explorer-prebundle-exclude.mjs'));
        expect(stepCondition(guard)).toMatch(/cancelled\(\)/);
    });

    it('triggers the workflow on an edit to the guard script alone', () => {
        const pathsBlock = readWorkflow().match(/<<'PATHS'\n([\s\S]*?)\n\s*PATHS\n/);
        expect(pathsBlock).not.toBeNull();
        expect(pathsBlock[1].split('\n').map((l) => l.trim())).toContain('.github/scripts/check-explorer-prebundle-exclude.mjs');
    });
});
