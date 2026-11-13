import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CollectTypeFields, FieldsNotInType, PackageScopes } = require('../lib/uncoded-view-fields.cjs');

describe('FieldsNotInType', () => {
    it('returns the fields that the GraphQL type of their entity does not define, even when the name is in other code', () => {
        const code = [
            '__decorate([(0, type_graphql_1.Field)()], mjBizAppsCommitteesMeeting_.prototype, "Committee", void 0);',
            '__decorate([(0, type_graphql_1.Field)()], mjBizAppsCommitteesMeeting_.prototype, "_mj__CreatedAt", void 0);',
            'const health = { AgendaItemCount: 0 };',
        ].join('\n');
        const meeting = { Entity: 'Committees: Meetings', ClassName: 'mjBizAppsCommitteesMeeting' };
        const fields = [
            { ...meeting, Field: 'Committee' },
            { ...meeting, Field: '__mj_CreatedAt' },
            { ...meeting, Field: 'AgendaItemCount' },
            { Entity: 'Other: Things', ClassName: 'otherThing', Field: 'Anything' },
        ];
        expect(FieldsNotInType(fields, CollectTypeFields(code))).toEqual([{ ...meeting, Field: 'AgendaItemCount' }]);
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
