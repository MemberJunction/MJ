import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { FieldExternalizer } from '../lib/FieldExternalizer.js';
import {
    fieldExternalizerAdapter,
    externalizeSubProperties,
    findSubPropertyExternalizations,
} from '../lib/json-subproperty-externalization.js';

/**
 * These run the real FieldExternalizer against a real temp directory. The point is the
 * seam between the JSON walk and the existing file IO — pattern resolution, path
 * preservation and the unchanged-content skip are that class's behavior, and this is
 * where a sub-property either inherits them correctly or silently does not.
 */
describe('fieldExternalizerAdapter', () => {
    let dir: string;
    const config = [{ field: 'Configuration.ReplayScript', pattern: '@file:scripts/{Name}.json' }];
    const properties = { Name: 'T001 - Login Smoke', ID: 'abc' };

    function adapter(targetDir: string, mergeStrategy = 'merge') {
        return fieldExternalizerAdapter(new FieldExternalizer(), properties, targetDir, mergeStrategy);
    }

    async function run(fieldValue: unknown, existingFieldValue?: unknown, mergeStrategy = 'merge') {
        return externalizeSubProperties(
            fieldValue,
            findSubPropertyExternalizations('Configuration', config),
            adapter(dir, mergeStrategy),
            existingFieldValue
        );
    }

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-subprop-'));
    });

    afterEach(async () => {
        await fs.remove(dir);
    });

    it('writes the sub-property to the pattern path, sanitizing the record name', async () => {
        await run({ maxSteps: 35, ReplayScript: { steps: [{ action: 'ClickElement' }] } });
        const written = path.join(dir, 'scripts', 't001-login-smoke.json');
        expect(await fs.pathExists(written)).toBe(true);
    });

    it('writes the leaf as readable JSON, not "[object Object]"', async () => {
        await run({ ReplayScript: { steps: [{ action: 'ClickElement' }] } });
        const body = await fs.readFile(path.join(dir, 'scripts', 't001-login-smoke.json'), 'utf8');
        expect(body).not.toContain('[object Object]');
        expect(JSON.parse(body)).toEqual({ steps: [{ action: 'ClickElement' }] });
        expect(body).toContain('\n'); // pretty-printed, so the file is diffable
    });

    it('replaces the sub-property with a reference to the file it wrote', async () => {
        const result = (await run({ maxSteps: 35, ReplayScript: { steps: [] } })) as Record<string, unknown>;
        expect(result.ReplayScript).toBe('@file:scripts/t001-login-smoke.json');
        expect(result.maxSteps).toBe(35);
    });

    it('keeps writing to a hand-placed path instead of relocating it to the pattern', async () => {
        const result = (await run(
            { ReplayScript: { steps: [1] } },
            { ReplayScript: '@file:scripts/curated/login.json' }
        )) as Record<string, unknown>;
        expect(result.ReplayScript).toBe('@file:scripts/curated/login.json');
        expect(await fs.pathExists(path.join(dir, 'scripts', 'curated', 'login.json'))).toBe(true);
        expect(await fs.pathExists(path.join(dir, 'scripts', 't001-login-smoke.json'))).toBe(false);
    });

    it('relocates to the pattern path under the overwrite strategy', async () => {
        const result = (await run(
            { ReplayScript: { steps: [1] } },
            { ReplayScript: '@file:scripts/curated/login.json' },
            'overwrite'
        )) as Record<string, unknown>;
        expect(result.ReplayScript).toBe('@file:scripts/t001-login-smoke.json');
    });

    it('does not rewrite the file when the script is unchanged', async () => {
        const value = { ReplayScript: { steps: [{ action: 'ClickElement' }] } };
        await run(value);
        const written = path.join(dir, 'scripts', 't001-login-smoke.json');
        const firstWrite = (await fs.stat(written)).mtimeMs;

        await run(value, { ReplayScript: '@file:scripts/t001-login-smoke.json' });

        expect((await fs.stat(written)).mtimeMs).toBe(firstWrite);
    });

    it('writes nothing at all for a record that has no script', async () => {
        const result = await run({ maxSteps: 35 });
        expect(result).toEqual({ maxSteps: 35 });
        expect(await fs.pathExists(path.join(dir, 'scripts'))).toBe(false);
    });
});
