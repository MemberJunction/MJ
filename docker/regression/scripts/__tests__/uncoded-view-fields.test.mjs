import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CollectTypeFields, FieldsNotInType, NarrowViewBatches, PackageScopes } = require('../lib/uncoded-view-fields.cjs');

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

describe('NarrowViewBatches', () => {
    it('keeps the full view under a new name and recreates the view with only the given columns and the same grants', () => {
        expect(NarrowViewBatches('app', 'vwMeetings', ['ID', 'Odd]Name'], [{ Permission: 'SELECT', Grantee: 'cdp_UI' }])).toEqual([
            "EXEC sp_rename '[app].[vwMeetings]', 'vwMeetings__Full';",
            'CREATE VIEW [app].[vwMeetings] AS SELECT [ID], [Odd]]Name] FROM [app].[vwMeetings__Full];',
            'GRANT SELECT ON [app].[vwMeetings] TO [cdp_UI];',
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
