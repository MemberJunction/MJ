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
            exportedStringConst('telephony/TwilioTelephonyRouter.ts', 'TWILIO_TELEPHONY_MOUNT_PATH'),
            exportedStringConst('telephony/VonageTelephonyRouter.ts', 'VONAGE_TELEPHONY_MOUNT_PATH'),
            exportedStringConst('telephony/TeamsMeetingsRouter.ts', 'TEAMS_MEETINGS_MOUNT_PATH'),
        ]);
    });

    it('includes the literal pre-auth paths serve() registers without a constant', () => {
        const indexSrc = readFileSync(join(SRC, 'index.ts'), 'utf8');
        for (const path of CORE_STATIC_RESERVED_SERVER_EXTENSION_ROOTS) {
            // /health is the prefix for /health/extensions
            const needle = path === '/health' ? '/health/extensions' : path;
            expect(indexSrc, `${path} missing from serve()`).toContain(`'${needle}'`);
        }
        expect(indexContainsLiteralPath('/healthcheck')).toBe(true);
    });

    it('includes graphqlRootPath and every core mount', () => {
        const roots = coreReservedServerExtensionRoots('/api');
        expect(roots).toEqual(
            expect.arrayContaining([
                '/api',
                '/auth',
                '/magic-link',
                '/widget',
                '/telephony/twilio',
                '/telephony/vonage',
                '/meetings/teams',
                '/healthcheck',
                '/esignature',
                '/media',
                '/oauth',
                '/health',
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
        expect(validateServerExtensionRootPath('/telephony', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/meetings/teams', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/checkout', extra)).toBeNull();
        expect(validateServerExtensionRootPath('/healthcare', extra)).toBeNull();
    });

    it('reserves a non-default graphqlRootPath and its nested paths', () => {
        const extra = coreReservedServerExtensionRoots('/api');
        expect(validateServerExtensionRootPath('/api', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/api/graphql', extra)).toMatch(/reserved prefix/);
        expect(validateServerExtensionRootPath('/apiv2', extra)).toBeNull();
    });
});
