import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CollectIdentifiers, FieldsWithoutCode, PackageScopes } = require('../lib/uncoded-view-fields.cjs');

describe('CollectIdentifiers', () => {
    it('adds every identifier in the text to the set', () => {
        const ids = CollectIdentifiers('get MeetingID() { return this.Get("Name_2"); } $x', new Set(['Old']));
        expect([...ids].sort()).toEqual(['$x', 'Get', 'MeetingID', 'Name_2', 'Old', 'get', 'return', 'this'].sort());
    });
});

describe('FieldsWithoutCode', () => {
    it('returns the fields whose name is not an identifier in the app code', () => {
        const fields = [
            { Entity: 'Committees: Meetings', Field: 'Committee' },
            { Entity: 'Committees: Meetings', Field: 'MeetingDurationMinutes' },
        ];
        expect(FieldsWithoutCode(fields, new Set(['Committee', 'MeetingDuration']))).toEqual([
            { Entity: 'Committees: Meetings', Field: 'MeetingDurationMinutes' },
        ]);
    });
});

describe('PackageScopes', () => {
    it('returns the npm scopes of the dynamic packages, without @memberjunction', () => {
        const config = {
            dynamicPackages: {
                server: [{ PackageName: '@mj-biz-apps/committees-server' }, { PackageName: '@askskip/server' }],
                client: [{ PackageName: '@mj-biz-apps/committees-ng' }, { PackageName: '@memberjunction/ng-x' }],
            },
        };
        expect(PackageScopes(config)).toEqual(['@askskip', '@mj-biz-apps']);
    });
});
