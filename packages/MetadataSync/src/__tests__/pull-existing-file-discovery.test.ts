import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { findExistingRecordFiles } from '../lib/existing-record-files.js';

/**
 * Pull matches a database record to the file that already represents it, and uses that
 * match to update the file in place and to preserve any `@file:` reference it carries.
 *
 * A `**\/` prefix on `filePattern` declares the records may sit in subdirectories — the
 * regression suite keeps its tests in `tests/regression/`, and integration-test keeps
 * its own in `tests/integration/`. Discovery has to honor that prefix, or every record
 * looks new: pull writes a second, hash-named copy beside the real one and the existing
 * reference is lost.
 */
describe('findExistingRecordFiles', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-discovery-'));
    });

    afterEach(async () => {
        await fs.remove(dir);
    });

    it('finds dot-prefixed record files in the directory itself', async () => {
        await fs.writeFile(path.join(dir, '.T001-login.json'), '{}');
        await fs.writeFile(path.join(dir, 'not-a-record.json'), '{}');

        const found = await findExistingRecordFiles(dir, '.*.json');

        expect(found.map((f) => path.basename(f))).toEqual(['.T001-login.json']);
    });

    it('descends into subdirectories when the pattern is prefixed with **/', async () => {
        await fs.ensureDir(path.join(dir, 'regression'));
        await fs.writeFile(path.join(dir, 'regression', '.T001-login.json'), '{}');
        await fs.writeFile(path.join(dir, 'regression', '.T002-grid.json'), '{}');

        const found = await findExistingRecordFiles(dir, '**/.*.json');

        expect(found.map((f) => path.basename(f)).sort()).toEqual(['.T001-login.json', '.T002-grid.json']);
    });

    it('stays in the top directory when the pattern has no **/ prefix', async () => {
        await fs.writeFile(path.join(dir, '.top.json'), '{}');
        await fs.ensureDir(path.join(dir, 'nested'));
        await fs.writeFile(path.join(dir, 'nested', '.deep.json'), '{}');

        const found = await findExistingRecordFiles(dir, '.*.json');

        expect(found.map((f) => path.basename(f))).toEqual(['.top.json']);
    });

    it('skips ignored directories so externalized files are never read as records', async () => {
        await fs.ensureDir(path.join(dir, 'regression', 'scripts'));
        await fs.writeFile(path.join(dir, 'regression', '.T001-login.json'), '{}');
        // an externalized replay script — a .json file, but not a record
        await fs.writeFile(path.join(dir, 'regression', 'scripts', '.t001-login.json'), '{}');

        const found = await findExistingRecordFiles(dir, '**/.*.json', ['regression/scripts']);

        expect(found.map((f) => path.basename(f))).toEqual(['.T001-login.json']);
    });

    it('never descends into a dot-directory such as .backups', async () => {
        await fs.ensureDir(path.join(dir, '.backups'));
        await fs.writeFile(path.join(dir, '.backups', '.T001-login.json'), '{}');
        await fs.writeFile(path.join(dir, '.T001-login.json'), '{}');

        const found = await findExistingRecordFiles(dir, '**/.*.json');

        expect(found).toHaveLength(1);
        expect(path.dirname(found[0])).toBe(dir);
    });

    it('returns an empty list for a directory that does not exist', async () => {
        expect(await findExistingRecordFiles(path.join(dir, 'nope'), '**/.*.json')).toEqual([]);
    });

    it('matches a plain *.json pattern', async () => {
        await fs.writeFile(path.join(dir, 'record.json'), '{}');
        await fs.writeFile(path.join(dir, '.dotted.json'), '{}');

        const found = await findExistingRecordFiles(dir, '*.json');

        expect(found.map((f) => path.basename(f))).toEqual(['record.json']);
    });
});
