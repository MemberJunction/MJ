/**
 * Tests for SetNewUserTemplate: writing `userHandling.newUserTemplate` into mj.config.cjs so MJAPI
 * builds each first-sign-in user as a copy of an app's template user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SetNewUserTemplate } from '../install/config-manager.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function write(config: string): string {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(config);
    const result = SetNewUserTemplate('/fake/repo', 'demo.user@example.org', 'template');
    expect(result.Success).toBe(true);
    return mockedWriteFileSync.mock.calls[0][1] as string;
}

/** Evaluates a written config the way MJAPI's loader would see it. */
function load(content: string): { userHandling?: Record<string, unknown> } {
    const module = { exports: {} as { userHandling?: Record<string, unknown> } };
    new Function('module', 'require', 'process', content)(module, () => ({}), { env: {} });
    return module.exports;
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('SetNewUserTemplate', () => {
    it('adds a userHandling section when the config has none', () => {
        const out = write(['module.exports = {', "  dbHost: 'localhost',", '};'].join('\n'));
        expect(load(out).userHandling).toEqual({ newUserTemplate: { email: 'demo.user@example.org', preset: 'template' } });
    });

    it('adds newUserTemplate to an existing userHandling, keeping its other settings', () => {
        const out = write(['module.exports = {', '  userHandling: {', '    autoCreateNewUsers: true,', "    newUserRoles: ['UI'],", '  },', '};'].join('\n'));
        expect(load(out).userHandling).toEqual({
            newUserTemplate: { email: 'demo.user@example.org', preset: 'template' },
            autoCreateNewUsers: true,
            newUserRoles: ['UI'],
        });
    });

    it('replaces an existing newUserTemplate instead of adding a second one', () => {
        const out = write(
            ['module.exports = {', '  userHandling: {', "    newUserTemplate: { email: 'old@example.org', preset: 'with-views' },", '    autoCreateNewUsers: true,', '  },', '};'].join('\n')
        );
        expect(out.match(/newUserTemplate/g)).toHaveLength(1);
        expect(load(out).userHandling).toEqual({
            newUserTemplate: { email: 'demo.user@example.org', preset: 'template' },
            autoCreateNewUsers: true,
        });
    });

    it('writes into a config exported through a variable', () => {
        const out = write(['const config = {', "  dbHost: 'localhost',", '};', 'module.exports = config;'].join('\n'));
        expect(load(out).userHandling).toEqual({ newUserTemplate: { email: 'demo.user@example.org', preset: 'template' } });
    });
});
