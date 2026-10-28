/**
 * Pins the boot consumer's `archive-seed` dispatch in the source: it runs before the
 * `promote-columns` branch, never completes or fails the row itself (the job owns its row), and
 * leaves the `processRSUPendingWork().catch(` call site untouched.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('processRSUPendingWork: archive-seed dispatch', () => {
    const archive = source.indexOf("item.WorkType === 'archive-seed'");
    const promote = source.indexOf("item.WorkType === 'promote-columns'");

    it('is dispatched before promote-columns', () => {
        expect(archive).toBeGreaterThan(-1);
        expect(archive).toBeLessThan(promote);
    });

    it('resumes the job and continues without completing or failing the row', () => {
        const branch = source.slice(archive, promote);
        expect(branch).toContain('.Resume(');
        expect(branch).toContain('continue;');
        expect(branch).not.toContain('CompletePendingWork');
        expect(branch).not.toContain('FailPendingWork');
    });

    it('leaves the processRSUPendingWork call site unchanged', () => {
        expect(source).toContain("processRSUPendingWork().catch(err => console.warn(`RSU pending work processing failed: ${err}`));");
    });
});
