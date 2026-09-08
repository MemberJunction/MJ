import { describe, it, expect } from 'vitest';
import {
    restarLayeredOuterView,
    buildCreateOrReplaceLayeredOuterViewSQL,
    LayeredOuterRestarError,
    splitTopLevelCommaList,
} from '../postgresqlRestarLayeredOuter';

const ORG_INNER = [
    'ID',
    'Name',
    'LegalName',
    'Status',
    '__mj_CreatedAt',
    '__mj_UpdatedAt',
    'OrganizationType',
    'Parent',
    '__mj_Latitude',
    '__mj_Longitude',
    'RootParentID',
];

describe('splitTopLevelCommaList', () => {
    it('splits on commas not inside parentheses or quotes', () => {
        expect(splitTopLevelCommaList('g."ID", COALESCE(cm."Value", g."Email") AS "PrimaryEmail"')).toEqual([
            'g."ID"',
            'COALESCE(cm."Value", g."Email") AS "PrimaryEmail"',
        ]);
    });
});

describe('restarLayeredOuterView', () => {
    it('rewrites an expanded g.* prefix plus trailing extras back to g.*', () => {
        const def = `
 SELECT g."ID",
    g."Name",
    g."LegalName",
    g."Status",
    g."__mj_CreatedAt",
    g."__mj_UpdatedAt",
    g."OrganizationType",
    g."Parent",
    g."__mj_Latitude",
    g."__mj_Longitude",
    g."RootParentID",
    COALESCE(cm."Value", g."Email") AS "PrimaryEmail",
    ( SELECT count(*) AS count
           FROM child c
          WHERE c."ParentID" = g."ID") AS "ChildOrgCount"
   FROM __mj_bizappscommon."vwOrganizationsGenerated" g
     LEFT JOIN __mj_bizappscommon."ContactMethod" cm ON cm."OrganizationID" = g."ID"
        `.trim();

        const result = restarLayeredOuterView({
            viewDefinition: def,
            innerViewName: 'vwOrganizationsGenerated',
            innerColumns: ORG_INNER,
        });

        expect(result).toMatch(/^SELECT "g"\.\*/);
        expect(result).toContain('COALESCE(cm."Value", g."Email") AS "PrimaryEmail"');
        expect(result).toContain('AS "ChildOrgCount"');
        expect(result).toContain('FROM __mj_bizappscommon."vwOrganizationsGenerated" g');
        expect(result).not.toContain('g."RootParentID",');
        expect(result).not.toMatch(/SELECT "g"\.\*,\s*g\."ID"/);
    });

    it('picks up an inner column added in the middle that the frozen def never listed', () => {
        const innerWithTemp = [
            'ID',
            'Name',
            'Status',
            '__mj_CreatedAt',
            '__mj_UpdatedAt',
            'GrokE2ETempCol',
            'OrganizationType',
            'RootParentID',
        ];
        const def = `
 SELECT g."ID",
    g."Name",
    g."Status",
    g."__mj_CreatedAt",
    g."__mj_UpdatedAt",
    g."OrganizationType",
    g."RootParentID",
    addr."Line1" AS "PrimaryAddressLine1"
   FROM sales."vwOrganizationsGenerated" g
     LEFT JOIN sales."Address" addr ON addr."ID" = g."ID"
        `.trim();

        const result = restarLayeredOuterView({
            viewDefinition: def,
            innerViewName: 'vwOrganizationsGenerated',
            innerColumns: innerWithTemp,
        });

        expect(result.startsWith('SELECT "g".*')).toBe(true);
        expect(result).toContain('addr."Line1" AS "PrimaryAddressLine1"');
        expect(result).not.toContain('g."OrganizationType"');
    });

    it('is a no-op reshape when the definition is already g.*', () => {
        const def = `
 SELECT g.*,
    (g."MajorVersion")::text || '.' || (g."MinorVersion")::text || '.' || (g."PatchVersion")::text AS "CompleteVersion"
   FROM __mj."vwVersionInstallationsGenerated" g
        `.trim();

        const result = restarLayeredOuterView({
            viewDefinition: def,
            innerViewName: 'vwVersionInstallationsGenerated',
            innerColumns: ['ID', 'MajorVersion', 'MinorVersion', 'PatchVersion'],
        });

        expect(result).toMatch(/^SELECT "g"\.\*,/);
        expect(result).toContain('AS "CompleteVersion"');
        expect(result).toContain('FROM __mj."vwVersionInstallationsGenerated" g');
    });

    it('keeps two-hop extras and joins for User View Run Details', () => {
        const def = `
 SELECT g."ID",
    g."UserViewRunID",
    g."RecordID",
    g."UserViewRun",
    uv."ID" AS "UserViewID",
    uv."EntityID" AS "EntityID"
   FROM __mj."vwUserViewRunDetailsGenerated" g
     JOIN __mj."UserViewRun" uvr ON g."UserViewRunID" = uvr."ID"
     JOIN __mj."UserView" uv ON uvr."UserViewID" = uv."ID"
        `.trim();

        const result = restarLayeredOuterView({
            viewDefinition: def,
            innerViewName: 'vwUserViewRunDetailsGenerated',
            innerColumns: ['ID', 'UserViewRunID', 'RecordID', 'UserViewRun'],
        });

        expect(result).toMatch(/^SELECT "g"\.\*,/);
        expect(result).toContain('uv."ID" AS "UserViewID"');
        expect(result).toContain('uv."EntityID" AS "EntityID"');
        expect(result).toContain('JOIN __mj."UserViewRun" uvr');
    });

    it('throws when the SELECT list is not an inner-column prefix', () => {
        expect(() =>
            restarLayeredOuterView({
                viewDefinition: 'SELECT 1 AS x FROM other.t',
                innerViewName: 'vwInner',
                innerColumns: ['ID'],
            }),
        ).toThrow(LayeredOuterRestarError);
    });
});

describe('buildCreateOrReplaceLayeredOuterViewSQL', () => {
    it('quotes schema and view names', () => {
        const sql = buildCreateOrReplaceLayeredOuterViewSQL('__mj', 'vwVersionInstallations', 'SELECT "g".*\nFROM __mj."vwVersionInstallationsGenerated" g');
        expect(sql).toContain('CREATE OR REPLACE VIEW "__mj"."vwVersionInstallations"');
        expect(sql).toContain('SELECT "g".*');
    });
});
