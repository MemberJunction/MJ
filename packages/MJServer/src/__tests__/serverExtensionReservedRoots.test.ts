/**
 * Pins the reserved-root set passed into prepareServerExtensionConfigs.
 * A new public mount in index.ts / a drifted `*_MOUNT_PATH` constant is a
 * contract failure — this file reads those sources as text so it never loads
 * `config.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CORE_CONSTANT_RESERVED_SERVER_EXTENSION_ROOTS,
    CORE_STATIC_RESERVED_SERVER_EXTENSION_ROOTS,
    coreReservedServerExtensionRoots,
} from '../serverExtensionReservedRoots.js';
import { validateServerExtensionRootPath } from '@memberjunction/server-extensions-core';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function exportedStringConst(relativeFile: string, name: string): string {
    const src = readFileSync(join(SRC, relativeFile), 'utf8');
    const match = src.match(new RegExp(`export const ${name} = '([^']+)'`));
    if (!match) {
        throw new Error(`Could not find export const ${name} in ${relativeFile}`);
    }
    return match[1];
}

function indexContainsLiteralPath(path: string): boolean {
    const src = readFileSync(join(SRC, 'index.ts'), 'utf8');
    return src.includes(`'${path}'`) || src.includes(`\`${path}\``) || src.includes(path.replace(/^\//, ''));
}

describe('coreReservedServerExtensionRoots', () => {
    it('stays in lockstep with exported *_MOUNT_PATH constants', () => {
        expect(CORE_CONSTANT_RESERVED_SERVER_EXTENSION_ROOTS).toEqual([
            exportedStringConst('auth/AuthProviderCatalogRouter.ts', 'AUTH_CATALOG_MOUNT_PATH'),
            exportedStringConst('auth/magicLink/MagicLinkRouter.ts', 'MAGIC_LINK_MOUNT_PATH'),
            exportedStringConst('realtimeWidget/WidgetRouter.ts', 'WIDGET_MOUNT_PATH'),
        ]);
    });

    it('includes the literal pre-auth paths serve() registers without a constant', () => {
        const indexSrc = readFileSync(join(SRC, 'index.ts'), 'utf8');
        for (const path of CORE_STATIC_RESERVED_SERVER_EXTENSION_ROOTS) {
            if (path === '/health') {
                expect(indexSrc, `${path} missing from serve()`).toContain("'/health/extensions'");
            } else if (path === '/realtime') {
                expect(indexSrc, `${path} missing from serve()`).toMatch(/REALTIME_SDP_EXCHANGE_PATH|'\/realtime'/);
            } else if (path === '/realtime-proxy') {
                expect(indexSrc, `${path} missing from serve()`).toContain('/realtime-proxy');
            } else {
                expect(indexSrc, `${path} missing from serve()`).toContain(`'${path}'`);
            }
        }
        expect(indexContainsLiteralPath('/healthcheck')).toBe(true);
    });

    it('structurally guarantees every pre-auth app.use / app.get / app.post mount in index.ts is reserved', () => {
        const indexSrc = readFileSync(join(SRC, 'index.ts'), 'utf8');
        const authMiddlewareIndex = indexSrc.indexOf('app.use(createUnifiedAuthMiddleware');
        expect(authMiddlewareIndex).toBeGreaterThan(0);
        const preAuthSrc = indexSrc.substring(0, authMiddlewareIndex);

        const mountRegex = /app\.(?:use|get|post)\s*\(\s*([^,\s)]+)/g;
        const reservedRoots = coreReservedServerExtensionRoots('/');

        // Explicit allowlist of known non-path middleware mounts (e.g. app.use(mw), app.use(cors()), app.use(compression(...)))
        const knownNonPathTokens = [
            'cors',
            'express.',
            'compression',
            'cookieParser',
            'createUnifiedAuthMiddleware',
            'mw',
        ];
        const isKnownNonPath = (t: string): boolean =>
            knownNonPathTokens.some(k => t === k || t.startsWith(k));

        // Strip single-line and multi-line comments so comments like `app.use(...)` are not treated as code
        const cleanPreAuthSrc = preAuthSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

        let match: RegExpExecArray | null;
        const mountedTokens: string[] = [];
        while ((match = mountRegex.exec(cleanPreAuthSrc)) !== null) {
            mountedTokens.push(match[1].trim());
        }

        expect(mountedTokens.length).toBeGreaterThan(0);

        const knownConstants: Record<string, string> = {
            REALTIME_SDP_EXCHANGE_PATH: '/realtime',
            MAGIC_LINK_MOUNT_PATH: '/magic-link',
            WIDGET_MOUNT_PATH: '/widget',
            AUTH_CATALOG_MOUNT_PATH: '/auth',
        };

        for (const token of mountedTokens) {
            const isLiteralPath = token.startsWith("'") || token.startsWith('"') || token.startsWith('`');
            const isPathConstant = /^[A-Z0-9_]+_PATH$/.test(token) || token in knownConstants;
            if (!isLiteralPath && !isPathConstant) {
                if (isKnownNonPath(token)) {
                    continue;
                }
                throw new Error(`Unrecognized pre-auth mount argument '${token}' in index.ts. If this is a non-path middleware, add it to knownNonPathTokens; if it is a route, reserve its prefix or map its constant.`);
            }

            let pathPrefix: string;
            if (isLiteralPath) {
                pathPrefix = token.slice(1, -1);
            } else if (token in knownConstants) {
                pathPrefix = knownConstants[token];
            } else {
                throw new Error(`Unrecognized pre-auth mount constant '${token}' in index.ts. If this is a new pre-auth route, map its constant or reserve its prefix.`);
            }

            const isCovered = reservedRoots.some(root => pathPrefix === root || pathPrefix.startsWith(`${root}/`));
            expect(isCovered, `Pre-auth mount '${pathPrefix}' (from token '${token}') must be covered by reserved roots`).toBe(true);
        }
    });

    it('includes graphqlRootPath and every core mount', () => {
        const roots = coreReservedServerExtensionRoots('/api');
        expect(roots).toEqual(
            expect.arrayContaining([
                '/api',
                '/auth',
                '/magic-link',
                '/widget',
                '/healthcheck',
                '/esignature',
                '/media',
                '/oauth',
                '/health',
                '/realtime',
                '/realtime-proxy',
            ])
        );
    });

    it('closes the F-M2 bypasses: cased /auth and sibling /healthcheck', () => {
        const extra = coreReservedServerExtensionRoots('/');
        expect(validateServerExtensionRootPath('/Auth', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/healthcheck', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/Healthcheck', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/esignature', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/media', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/widget', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/realtime', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/realtime-proxy', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/Realtime', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/checkout', extra)).toBeNull();
        expect(validateServerExtensionRootPath('/healthcare', extra)).toBeNull();
        expect(validateServerExtensionRootPath('/telephony/twilio', extra)).toBeNull();
        expect(validateServerExtensionRootPath('/meetings/teams', extra)).toBeNull();
    });

    it('reserves a non-default graphqlRootPath and its nested paths', () => {
        const extra = coreReservedServerExtensionRoots('/api');
        expect(validateServerExtensionRootPath('/api', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/api/graphql', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/apiv2', extra)).toBeNull();
    });
});
