/**
 * #5492 — a Scoped Notification Config whose SecondaryScopes is not a JSON object is refused at save.
 * The resolver reads secondary scopes as conditions; an unreadable value used to mean "no conditions".
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJScopedNotificationConfigEntity: class {
        public SecondaryScopes: string | null = null;
        public Validate() {
            return { Success: true, Errors: [] as unknown[] };
        }
    },
}));

import {
    CheckSecondaryScopesIsObject,
    MJScopedNotificationConfigEntityServer,
} from '../custom/MJScopedNotificationConfigEntityServer.server';

describe('CheckSecondaryScopesIsObject', () => {
    it.each([null, undefined, '', '   ', '{}', '{"origin":"System"}'])('accepts %j', (value) => {
        expect(CheckSecondaryScopesIsObject(value)).toBeNull();
    });

    it.each(['{bad json', '[]', '["origin"]', '"origin"', '42', 'null'])('refuses %j', (value) => {
        expect(CheckSecondaryScopesIsObject(value)).toMatch(/must be a JSON object/);
    });
});

describe('MJScopedNotificationConfigEntityServer.Validate', () => {
    it('fails a row whose SecondaryScopes is not an object, naming the field', () => {
        const row = new MJScopedNotificationConfigEntityServer() as unknown as { SecondaryScopes: string | null; Validate(): { Success: boolean; Errors: Array<{ Source: string }> } };
        row.SecondaryScopes = '[1,2]';
        const result = row.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('SecondaryScopes');
    });

    it('passes a well-formed row', () => {
        const row = new MJScopedNotificationConfigEntityServer() as unknown as { SecondaryScopes: string | null; Validate(): { Success: boolean } };
        row.SecondaryScopes = '{"origin":"Automation"}';
        expect(row.Validate().Success).toBe(true);
    });
});
