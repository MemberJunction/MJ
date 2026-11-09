/**
 * A host mj.config.cjs serverExtensions[] entry may be a partial OVERLAY of an extension an Open App
 * package publishes: only DriverClass is required. The schema used to require RootPath and default
 * Enabled to true, so `{ DriverClass, OwnsCORS: false }` failed config parsing at startup, and an
 * overlay that omitted Enabled re-enabled an extension its package ships disabled. Completeness is
 * checked after the merge instead.
 */
import { describe, it, expect, vi } from 'vitest';

// config.ts evaluates `configInfo = LoadConfig()` at module load, and it rejects a configuration
// carrying no database credentials. Stubbing only the cosmiconfig search lets the module import so the
// REAL ServerExtensionSchema is under test (same pattern as newUserRolesDefault.test.ts).
vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: () => ({
        search: () => ({
            filepath: '/test/mj.config.cjs',
            isEmpty: false,
            config: { dbUsername: 'test-user', dbPassword: 'test-password', dbDatabase: 'test-db' },
        }),
    }),
}));

import { MergeServerExtensionConfigs, PrepareServerExtensionConfigs } from '@memberjunction/server-extensions-core';
import type { ServerExtensionConfig } from '@memberjunction/server-extensions-core';
import { ServerExtensionSchema } from '../config.js';

const published: ServerExtensionConfig = {
    Enabled: true,
    DriverClass: 'BallotEdge',
    RootPath: '/vote',
    OwnsCORS: true,
    Settings: { RateLimitMax: 20 },
};

describe('host serverExtensions[] overlay schema', () => {
    it('accepts an overlay that names only DriverClass and the fields it overrides', () => {
        const parsed = ServerExtensionSchema.safeParse({ DriverClass: 'BallotEdge', OwnsCORS: false });
        expect(parsed.success).toBe(true);
        expect(parsed.success && parsed.data.RootPath).toBeUndefined();
        expect(parsed.success && parsed.data.Enabled).toBeUndefined();
    });

    it('merges the overlay onto the published entry without losing RootPath or Enabled', () => {
        const overlay = ServerExtensionSchema.parse({ DriverClass: 'BallotEdge', OwnsCORS: false, Settings: { RateLimitMax: 2000 } });
        const [merged] = MergeServerExtensionConfigs([published], [overlay as ServerExtensionConfig]);
        expect(merged).toMatchObject({ DriverClass: 'BallotEdge', RootPath: '/vote', Enabled: true, OwnsCORS: false });
        expect(merged.Settings).toEqual({ RateLimitMax: 2000 });
    });

    it('does not re-enable an extension the package ships disabled', () => {
        const overlay = ServerExtensionSchema.parse({ DriverClass: 'BallotEdge', Settings: { RateLimitMax: 5 } });
        const [merged] = MergeServerExtensionConfigs([{ ...published, Enabled: false }], [overlay as ServerExtensionConfig]);
        expect(merged.Enabled).toBe(false);
    });

    it('still rejects a host-only entry without a RootPath, after the merge', () => {
        const overlay = ServerExtensionSchema.parse({ DriverClass: 'NotPublishedAnywhere' });
        const problems: string[] = [];
        const prepared = PrepareServerExtensionConfigs(
            MergeServerExtensionConfigs([published], [overlay as ServerExtensionConfig]),
            { onInvalid: (message: string) => problems.push(message) },
        );
        expect(prepared.map(c => c.DriverClass)).toEqual(['BallotEdge']);
        expect(problems.some(p => p.includes('NotPublishedAnywhere') && p.includes('RootPath is empty'))).toBe(true);
    });
});
