import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LocatorFetchRequest } from '@memberjunction/content-pipeline-base';
import { LocalFileSystemDiscoverDriver } from '../LocalFileSystem/generic/LocalFileSystemDiscoverDriver';

/**
 * A locator is a row in the database; the server reading whatever path a row names would read any
 * file on the box for anyone able to edit a content item. These pin the confinement to the source's
 * root against a real directory tree.
 */
describe('LocalFileSystemDiscoverDriver.Fetch', () => {
    let base: string;
    let root: string;

    beforeAll(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-localfs-'));
        root = path.join(base, 'root');
        fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
        fs.writeFileSync(path.join(root, 'sub', 'doc.txt'), 'inside');
        fs.writeFileSync(path.join(base, 'secret.txt'), 'outside');
        fs.symlinkSync(path.join(base, 'secret.txt'), path.join(root, 'link.txt'));
    });

    afterAll(() => {
        fs.rmSync(base, { recursive: true, force: true });
    });

    const fetch = (url: string) =>
        new LocalFileSystemDiscoverDriver().Fetch({
            URL: url,
            SourceURL: root,
            ContentSourceID: 'S1',
            Parameters: {},
            Configuration: {},
            ContextUser: {} as never,
            Provider: {} as never,
            Signal: new AbortController().signal,
        } as LocatorFetchRequest);

    it('reads a file the walk found', async () => {
        const result = await fetch(path.join(root, 'sub', 'doc.txt'));
        expect(new TextDecoder().decode(result.Content)).toBe('inside');
    });

    it('refuses a path that climbs out of the root', async () => {
        await expect(fetch(path.join(root, '..', 'secret.txt'))).rejects.toThrow(/outside/);
    });

    it('refuses an absolute path elsewhere on the machine', async () => {
        await expect(fetch(path.join(base, 'secret.txt'))).rejects.toThrow(/outside/);
    });

    it('refuses a symlink inside the root that points out of it', async () => {
        await expect(fetch(path.join(root, 'link.txt'))).rejects.toThrow(/outside/);
    });
});
