import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DiscoverRequest, DiscoveredItem, LocatorFetchRequest } from '@memberjunction/content-pipeline-base';
import { AutotagLocalFileSystem } from '../LocalFileSystem/generic/AutotagLocalFileSystem';

/** Fetch must stay inside the source root: a locator is a row anyone who can edit an item can change. */
describe('AutotagLocalFileSystem Discover and Fetch', () => {
    let base: string;
    let root: string;

    beforeAll(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-localfs-'));
        root = path.join(base, 'root');
        fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
        fs.writeFileSync(path.join(root, 'sub', 'doc.txt'), 'inside');
        fs.writeFileSync(path.join(root, '..notes.txt'), 'dotdot-inside');
        fs.writeFileSync(path.join(base, 'secret.txt'), 'outside');
        fs.symlinkSync(path.join(base, 'secret.txt'), path.join(root, 'link.txt'));
    });

    afterAll(() => {
        fs.rmSync(base, { recursive: true, force: true });
    });

    const fetch = (url: string) =>
        new AutotagLocalFileSystem().Fetch({
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

    it('reads a file inside the root whose filename begins with ..', async () => {
        const result = await fetch(path.join(root, '..notes.txt'));
        expect(new TextDecoder().decode(result.Content)).toBe('dotdot-inside');
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

    it('walks nested directories, skipping symlinks and yielding title, date, and file type', async () => {
        const items: DiscoveredItem[] = [];
        const request = { URL: root, Signal: new AbortController().signal } as DiscoverRequest;
        for await (const item of new AutotagLocalFileSystem().Discover(request)) {
            items.push(item);
        }
        const doc = items.find((i) => i.URL === path.join(root, 'sub', 'doc.txt'));
        expect(doc?.Fields?.map((f) => [f.Field, f.Value])).toEqual(expect.arrayContaining([['Title', 'doc.txt'], ['FileType', 'txt']]));
        expect(items.find((i) => i.URL === path.join(root, 'link.txt'))).toBeUndefined();
    });

    it('skips files not modified after request.Since', async () => {
        const future = new Date(Date.now() + 60_000);
        const items: DiscoveredItem[] = [];
        const request = { URL: root, Since: future, Signal: new AbortController().signal } as DiscoverRequest;
        for await (const item of new AutotagLocalFileSystem().Discover(request)) {
            items.push(item);
        }
        expect(items).toHaveLength(0);
    });
});
