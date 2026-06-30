import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
    fetchPack,
    PackFetchError,
    PackChecksumError,
    type HttpGetter,
    type HttpResponse,
} from '../../lib/claude-pack/PackFetcher.js';
import type { Manifest } from '../../lib/claude-pack/PackTypes.js';

/** sha256(content) as hex — small helper for fixtures. */
function sha(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

/** Build a fixture manifest + file map keyed by file path. */
function fixturePack(files: Record<string, string>, packVersion = '5.1.0', mjMajor = '5'): {
    manifest: Manifest;
    bodies: Record<string, string>;
} {
    const entries = Object.entries(files).map(([path, content]) => ({
        path,
        bytes: Buffer.byteLength(content, 'utf8'),
        sha256: sha(content),
    }));
    return {
        manifest: {
            packVersion,
            mjMajor,
            remoteUrlPrefix: `https://example/v${mjMajor}/`,
            files: entries,
        },
        bodies: files,
    };
}

/** Build a mock HttpGetter from a URL → response map. */
function mockHttp(responses: Record<string, HttpResponse>): HttpGetter {
    return vi.fn(async (url: string) => {
        if (responses[url] === undefined) {
            return { statusCode: 404, body: Buffer.from('') };
        }
        return responses[url];
    });
}

const ok = (body: string | Buffer): HttpResponse => ({
    statusCode: 200,
    body: typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
});
const notFound = (): HttpResponse => ({ statusCode: 404, body: Buffer.from('Not Found') });
const serverError = (): HttpResponse => ({ statusCode: 500, body: Buffer.from('Server Error') });

describe('fetchPack', () => {
    it('fetches manifest + all files when everything is reachable', async () => {
        const { manifest, bodies } = fixturePack({
            '.claude/mj/core.md': '# core',
            'CLAUDE.md': '# root',
        });
        const base = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [base + '.claude/mj/MANIFEST.json']: ok(JSON.stringify(manifest)),
            [base + '.claude/mj/core.md']: ok(bodies['.claude/mj/core.md']),
            [base + 'CLAUDE.md']: ok(bodies['CLAUDE.md']),
        });

        const result = await fetchPack({ Major: '5', HttpGet: http });

        expect(result.RefUsed).toBe('main');
        expect(result.BaseUrl).toBe(base);
        expect(result.Manifest.packVersion).toBe('5.1.0');
        expect(result.Files.get('CLAUDE.md')?.toString()).toBe('# root');
        expect(result.Files.get('.claude/mj/core.md')?.toString()).toBe('# core');
    });

    it('falls back from a 404-ing tag to main', async () => {
        const { manifest, bodies } = fixturePack({ 'CLAUDE.md': '# from main' });
        const tagBase = 'https://raw.githubusercontent.com/MemberJunction/MJ/v5.33.0/templates/claude-pack/dist/v5/';
        const mainBase = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [tagBase + '.claude/mj/MANIFEST.json']: notFound(),
            [mainBase + '.claude/mj/MANIFEST.json']: ok(JSON.stringify(manifest)),
            [mainBase + 'CLAUDE.md']: ok(bodies['CLAUDE.md']),
        });

        const result = await fetchPack({ Major: '5', Ref: 'v5.33.0', HttpGet: http });
        expect(result.RefUsed).toBe('main');
        expect(result.BaseUrl).toBe(mainBase);
    });

    it('does NOT fall back if requested ref is already main', async () => {
        const mainBase = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [mainBase + '.claude/mj/MANIFEST.json']: notFound(),
        });

        await expect(fetchPack({ Major: '5', Ref: 'main', HttpGet: http })).rejects.toBeInstanceOf(
            PackFetchError
        );
    });

    it('does NOT fall back on 5xx (only on 404)', async () => {
        const tagBase = 'https://raw.githubusercontent.com/MemberJunction/MJ/v5.33.0/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [tagBase + '.claude/mj/MANIFEST.json']: serverError(),
        });

        await expect(fetchPack({ Major: '5', Ref: 'v5.33.0', HttpGet: http })).rejects.toMatchObject(
            { statusCode: 500 }
        );
    });

    it('throws when manifest fallback to main also 404s', async () => {
        const tagBase = 'https://raw.githubusercontent.com/MemberJunction/MJ/v5.33.0/templates/claude-pack/dist/v5/';
        const mainBase = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [tagBase + '.claude/mj/MANIFEST.json']: notFound(),
            [mainBase + '.claude/mj/MANIFEST.json']: notFound(),
        });

        await expect(fetchPack({ Major: '5', Ref: 'v5.33.0', HttpGet: http })).rejects.toMatchObject(
            { name: 'PackFetchError' }
        );
    });

    it('throws PackFetchError on a per-file 404', async () => {
        const { manifest } = fixturePack({ 'CLAUDE.md': '# root' });
        const base = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [base + '.claude/mj/MANIFEST.json']: ok(JSON.stringify(manifest)),
            // CLAUDE.md is missing — defaults to 404 via mockHttp
        });

        await expect(fetchPack({ Major: '5', HttpGet: http })).rejects.toMatchObject({
            name: 'PackFetchError',
            statusCode: 404,
        });
    });

    it('throws PackChecksumError when a file has been tampered', async () => {
        const { manifest, bodies } = fixturePack({ 'CLAUDE.md': '# original' });
        const base = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const tamperedBody = '# tampered';
        const http = mockHttp({
            [base + '.claude/mj/MANIFEST.json']: ok(JSON.stringify(manifest)),
            [base + 'CLAUDE.md']: ok(tamperedBody),
        });

        await expect(fetchPack({ Major: '5', HttpGet: http })).rejects.toBeInstanceOf(
            PackChecksumError
        );
        // The original body is still referenced from the fixture to assert determinism
        expect(bodies['CLAUDE.md']).toBe('# original');
    });

    it('throws PackFetchError on malformed manifest JSON', async () => {
        const base = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [base + '.claude/mj/MANIFEST.json']: ok('{not valid json'),
        });

        await expect(fetchPack({ Major: '5', HttpGet: http })).rejects.toMatchObject({
            name: 'PackFetchError',
        });
    });

    it('throws PackFetchError on manifest with wrong shape', async () => {
        const base = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [base + '.claude/mj/MANIFEST.json']: ok(JSON.stringify({ packVersion: 5.1 })),
        });

        await expect(fetchPack({ Major: '5', HttpGet: http })).rejects.toMatchObject({
            name: 'PackFetchError',
        });
    });

    it('reports progress for the manifest and each file', async () => {
        const { manifest, bodies } = fixturePack({
            'CLAUDE.md': '# root',
            '.claude/mj/core.md': '# core',
        });
        const base = 'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/';
        const http = mockHttp({
            [base + '.claude/mj/MANIFEST.json']: ok(JSON.stringify(manifest)),
            [base + 'CLAUDE.md']: ok(bodies['CLAUDE.md']),
            [base + '.claude/mj/core.md']: ok(bodies['.claude/mj/core.md']),
        });

        const messages: string[] = [];
        await fetchPack({ Major: '5', HttpGet: http, OnProgress: (m) => messages.push(m) });
        expect(messages.some((m) => m.includes('manifest'))).toBe(true);
        expect(messages.some((m) => m.includes('CLAUDE.md'))).toBe(true);
        expect(messages.some((m) => m.includes('core.md'))).toBe(true);
    });
});
