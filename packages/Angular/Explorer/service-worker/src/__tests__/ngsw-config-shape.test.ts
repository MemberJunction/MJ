import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Static-analysis tests on the shipped `ngsw-config.json`.
 *
 * The config is a single JSON file consumed by the Angular CLI's `ngsw-config`
 * tool at build time. There are no compile-time guarantees about its content,
 * so we encode the invariants here. If anyone (or any tool) edits the config
 * in a way that breaks an invariant, this test catches it before a production
 * SW deploy goes wrong.
 *
 * Invariants we care about:
 *   - app-shell group is `prefetch` install/update mode (must be available
 *     for the first paint and on every update)
 *   - app-shell ONLY references the eager bundle prefixes (main-, polyfills-,
 *     styles-, plus shell HTML / favicon / manifest). NOT `/*.js` — that was
 *     the pre-fix bug that swept lazy chunks into the prefetched group.
 *   - lazy-chunks group is `lazy` install (downloads on demand) with
 *     `prefetch` update (already-visited chunks get refreshed silently)
 *   - lazy-chunks captures `chunk-*.js`
 *   - GraphQL, GraphQL-WS, /api, /auth, MSAL callbacks are all excluded
 *     from SW navigation handling (must always go to network)
 */

const CONFIG_PATH = resolve(__dirname, '../../ngsw-config.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as {
    index: string;
    assetGroups: Array<{
        name: string;
        installMode: 'prefetch' | 'lazy';
        updateMode: 'prefetch' | 'lazy';
        resources: { files?: string[]; urls?: string[] };
    }>;
    navigationUrls: string[];
};

function findGroup(name: string) {
    const g = config.assetGroups.find(x => x.name === name);
    if (!g) throw new Error(`Asset group "${name}" not found in ngsw-config.json`);
    return g;
}

describe('ngsw-config.json shape', () => {
    it('points at /index.html as the navigation index', () => {
        expect(config.index).toBe('/index.html');
    });

    it('declares exactly the three expected asset groups', () => {
        const names = config.assetGroups.map(g => g.name).sort();
        expect(names).toEqual(['app-shell', 'lazy-assets', 'lazy-chunks']);
    });

    describe('app-shell group', () => {
        const g = findGroup('app-shell');

        it('is prefetched on install AND on update', () => {
            expect(g.installMode).toBe('prefetch');
            expect(g.updateMode).toBe('prefetch');
        });

        it('includes the shell HTML, favicon, and manifest', () => {
            expect(g.resources.files).toContain('/index.html');
            expect(g.resources.files).toContain('/favicon.ico');
            expect(g.resources.files).toContain('/manifest.webmanifest');
        });

        it('captures the eager JS bundles by prefix (main-*, polyfills-*)', () => {
            expect(g.resources.files).toContain('/main-*.js');
            expect(g.resources.files).toContain('/polyfills-*.js');
        });

        it('captures the eager CSS bundle (styles-*)', () => {
            expect(g.resources.files).toContain('/styles-*.css');
        });

        it('does NOT use a wildcard /*.js glob (regression guard for the pre-fix bug)', () => {
            // The old config had `/*.js` which swept lazy chunks into the
            // prefetched app-shell group, completely defeating lazy loading.
            // If anyone re-introduces this pattern, this assertion fires.
            expect(g.resources.files).not.toContain('/*.js');
        });
    });

    describe('lazy-chunks group', () => {
        const g = findGroup('lazy-chunks');

        it('downloads on demand (lazy install)', () => {
            expect(g.installMode).toBe('lazy');
        });

        it('keeps already-cached chunks fresh on update (prefetch update)', () => {
            expect(g.updateMode).toBe('prefetch');
        });

        it('captures Angular emitted chunks (chunk-*.js)', () => {
            expect(g.resources.files).toContain('/chunk-*.js');
        });
    });

    describe('lazy-assets group', () => {
        const g = findGroup('lazy-assets');

        it('downloads on demand (lazy install) with prefetch updates', () => {
            expect(g.installMode).toBe('lazy');
            expect(g.updateMode).toBe('prefetch');
        });

        it('includes /assets/** for app-defined assets', () => {
            expect(g.resources.files).toContain('/assets/**');
        });

        it('includes /media/** for Angular-builder CSS-imported assets', () => {
            // Modern @angular/build emits CSS-imported url() assets to /media/.
            // If this glob is missing, fonts and images referenced by @import
            // chains silently bypass the SW cache.
            expect(g.resources.files).toContain('/media/**');
        });
    });

    describe('navigationUrls', () => {
        it('catches all navigations by default', () => {
            expect(config.navigationUrls).toContain('/**');
        });

        it.each([
            ['!/**/graphql', 'GraphQL HTTP endpoint'],
            ['!/**/graphql-ws', 'GraphQL WebSocket endpoint'],
            ['!/api/**', 'REST API surface'],
            ['!/auth/**', 'Auth provider callbacks'],
            ['!/**/?msal*', 'MSAL OAuth fragment'],
            ['!/**/*__*', 'Internal MJ routes with double-underscore segments'],
        ])('excludes %s (%s)', (pattern) => {
            expect(config.navigationUrls).toContain(pattern);
        });
    });
});
