/**
 * Pins the reserved-root set passed into prepareServerExtensionConfigs.
 * A drifted `*_MOUNT_PATH` constant is a contract failure — this file reads those
 * sources as text so it never loads `config.ts`. That every core mount is reserved
 * is checked against the real mounts in apiRootBoot.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CORE_CONSTANT_RESERVED_SERVER_EXTENSION_ROOTS,
    CORE_STATIC_RESERVED_SERVER_EXTENSION_ROOTS,
    CoreReservedServerExtensionRoots,
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

describe('coreReservedServerExtensionRoots', () => {
    it('stays in lockstep with exported *_MOUNT_PATH constants', () => {
        expect(CORE_CONSTANT_RESERVED_SERVER_EXTENSION_ROOTS).toEqual([
            exportedStringConst('auth/AuthProviderCatalogRouter.ts', 'AUTH_CATALOG_MOUNT_PATH'),
            exportedStringConst('auth/magicLink/MagicLinkRouter.ts', 'MAGIC_LINK_MOUNT_PATH'),
            exportedStringConst('realtimeWidget/WidgetRouter.ts', 'WIDGET_MOUNT_PATH'),
        ]);
    });

    it('includes every core mount, and no longer graphqlRootPath', () => {
        const roots = CoreReservedServerExtensionRoots();
        expect(roots).not.toContain('/api');
        expect(roots).toEqual(
            expect.arrayContaining([
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
        const extra = CoreReservedServerExtensionRoots();
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

    it('lets extensions sit under the API root (#5674): RootPaths are relative to it', () => {
        const extra = CoreReservedServerExtensionRoots();
        expect(validateServerExtensionRootPath('/api', extra)).toBeNull();
        expect(validateServerExtensionRootPath('/forms', extra)).toBeNull();
    });
});
