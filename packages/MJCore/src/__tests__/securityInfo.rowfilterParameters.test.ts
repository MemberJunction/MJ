/**
 * Row filters with the user's values bound as query parameters (#5713).
 *
 * MarkupFilterText writes each user's values into the SQL as literals, so the text differs per user
 * and SQL Server compiles a plan per user per query shape. MarkupFilterParameterized replaces a
 * token that is a whole quoted literal with a placeholder from the provider's binder; every other
 * placement stays literal, so no filter changes meaning.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EntityInfo, EntityPermissionType } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { RowFilterParameterBinder, RowLevelSecurityFilterInfo, UserInfo } from '../generic/securityInfo';

/** Binds every value as `@rls<n>`, one per occurrence, and records them in order. */
class TestBinder implements RowFilterParameterBinder {
    public readonly Values: Array<{ Token: string; Value: string }> = [];
    constructor(private readonly refuse: (value: string) => boolean = () => false) {}
    Bind(token: string, value: string): string | null {
        if (this.refuse(value)) return null;
        this.Values.push({ Token: token, Value: value });
        return `@rls${this.Values.length - 1}`;
    }
}

function buildFilter(filterText: string, id = 'RLS00000-0000-0000-0000-000000000001'): RowLevelSecurityFilterInfo {
    return new RowLevelSecurityFilterInfo({ ID: id, Name: `Filter ${id}`, FilterText: filterText });
}

describe('RowLevelSecurityFilterInfo.MarkupFilterParameterized', () => {
    it('binds a whole quoted-literal user token and leaves the rest of the text alone', () => {
        const binder = new TestBinder();
        const user = new UserInfo(null, { ID: 'user-1', Email: 'a@example.com' });

        const text = buildFilter("OwnerID = '{{UserID}}' AND Email = N'{{UserEmail}}'").MarkupFilterParameterized(user, binder);

        expect(text).toBe('OwnerID = @rls0 AND Email = @rls1');
        expect(binder.Values).toEqual([
            { Token: 'UserID', Value: 'user-1' },
            { Token: 'UserEmail', Value: 'a@example.com' },
        ]);
    });

    it('produces the same text for two users and different bound values', () => {
        const filter = buildFilter("OwnerID = '{{UserID}}'");
        const a = new TestBinder();
        const b = new TestBinder();

        const textA = filter.MarkupFilterParameterized(new UserInfo(null, { ID: 'user-a' }), a);
        const textB = filter.MarkupFilterParameterized(new UserInfo(null, { ID: 'user-b' }), b);

        expect(textA).toBe(textB);
        expect(a.Values[0].Value).toBe('user-a');
        expect(b.Values[0].Value).toBe('user-b');
    });

    it('binds an apostrophe unescaped instead of doubling it into the text', () => {
        const binder = new TestBinder();
        const text = buildFilter("Name = '{{UserName}}'").MarkupFilterParameterized(new UserInfo(null, { ID: 'u', Name: "O'Brien" }), binder);

        expect(text).toBe('Name = @rls0');
        expect(binder.Values[0].Value).toBe("O'Brien");
    });

    it('keeps literal text for a token inside a LIKE pattern, an unquoted token and the list token', () => {
        const binder = new TestBinder();
        const user = new UserInfo(null, { ID: 'u', Name: "O'Brien", Email: 'e@example.com' });
        user.APIKeyActingContext = { ActingCompanyIDs: ['c2', 'c1'] };

        const text = buildFilter("Name LIKE '%{{UserName}}%' AND Contact = {{UserEmail}} AND CompanyID IN ({{ActingCompanyIDs}})")
            .MarkupFilterParameterized(user, binder);

        expect(text).toBe("Name LIKE '%O''Brien%' AND Contact = e@example.com AND CompanyID IN ('c1','c2')");
        expect(binder.Values).toEqual([]);
    });

    it('binds the magic-link scope and scalar acting tokens', () => {
        const binder = new TestBinder();
        const user = new UserInfo(null, { ID: 'u' });
        user.MagicLinkScope = { ResourceID: 'r-1', ResourceType: 'Report' };
        user.APIKeyActingContext = { ActingOrganizationID: 'org-1' };

        const text = buildFilter("ID = '{{ScopeResourceID}}' AND OrgID = '{{ActingOrganizationID}}'").MarkupFilterParameterized(user, binder);

        expect(text).toBe('ID = @rls0 AND OrgID = @rls1');
        expect(binder.Values.map((v) => v.Value)).toEqual(['r-1', 'org-1']);
    });

    it('does not bind a token-shaped literal inside a comment, an identifier or a longer literal', () => {
        const binder = new TestBinder();
        const user = new UserInfo(null, { ID: 'u' });

        const text = buildFilter("[Col'{{UserID}}'] = 'x''{{UserID}}''' -- '{{UserID}}'\nAND A = '{{UserID}}'").MarkupFilterParameterized(user, binder);

        expect(text).toBe("[Col'u'] = 'x''u''' -- 'u'\nAND A = @rls0");
        expect(binder.Values).toHaveLength(1);
    });

    it('keeps the value literal when the binder refuses it', () => {
        const binder = new TestBinder((value) => value.length > 3);
        const text = buildFilter("Name = '{{UserName}}'").MarkupFilterParameterized(new UserInfo(null, { ID: 'u', Name: 'Longer' }), binder);

        expect(text).toBe("Name = 'Longer'");
    });

    it('leaves an unresolved token in place (legacy) and binds nothing for it', () => {
        const binder = new TestBinder();
        const text = buildFilter("Team = '{{UserTeamName}}' AND OwnerID = '{{UserID}}'").MarkupFilterParameterized(new UserInfo(null, { ID: 'u' }), binder);

        expect(text).toBe("Team = '{{UserTeamName}}' AND OwnerID = @rls0");
    });

    it('resolves to (1=0) and binds nothing when match-nothing finds an unresolved token', () => {
        const binder = new TestBinder();
        const text = buildFilter("OwnerID = '{{UserID}}' AND OrgID = '{{ActingOrganizationID}}'")
            .MarkupFilterParameterized(new UserInfo(null, { ID: 'u' }), binder, { unresolvedBehavior: 'match-nothing' });

        expect(text).toBe('(1=0)');
        expect(binder.Values).toEqual([]);
    });

    it('MarkupFilterText is unchanged', () => {
        const text = buildFilter("OwnerID = '{{UserID}}'").MarkupFilterText(new UserInfo(null, { ID: 'u-1' }));
        expect(text).toBe("OwnerID = 'u-1'");
    });
});

describe('EntityInfo.GetEffectiveRowFilterWhereClause with a binder', () => {
    const ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
    const ROLE_A = 'R0000000-0000-0000-0000-00000000000A';
    const ROLE_B = 'R0000000-0000-0000-0000-00000000000B';
    const F1 = 'F0000000-0000-0000-0000-000000000001';
    const F2 = 'F0000000-0000-0000-0000-000000000002';
    const filter1 = buildFilter("Contact = '{{UserEmail}}'", F1);
    const filter2 = buildFilter("OwnerID = '{{UserID}}'", F2);
    let savedProvider: typeof Metadata.Provider;

    beforeAll(() => {
        savedProvider = Metadata.Provider;
        Metadata.Provider = { Entities: [], RowLevelSecurityFilters: [filter1, filter2] } as unknown as ProviderBase;
    });
    afterAll(() => {
        Metadata.Provider = savedProvider;
    });

    function entity(): EntityInfo {
        const permission = (roleId: string, filterId: string) => ({
            ID: `perm-${roleId}`, EntityID: ENTITY_ID, RoleID: roleId,
            CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true,
            ReadRLSFilterID: filterId, CreateRLSFilterID: null, UpdateRLSFilterID: null, DeleteRLSFilterID: null, Type: 'Allow',
        });
        return new EntityInfo({
            ID: ENTITY_ID, Name: 'Test Entity', SchemaName: '__mj', BaseTable: 'TestEntity', BaseView: 'vwTestEntities',
            Permissions: [permission(ROLE_A, F1), permission(ROLE_B, F2)],
            Fields: [],
        });
    }

    function user(id: string, email: string): UserInfo {
        return new UserInfo(null, {
            ID: id, Name: 'Test User', Email: email, IsActive: true,
            UserRoles: [ROLE_A, ROLE_B].map((r) => ({ UserID: id, RoleID: r, Role: `Role-${r}` })),
        });
    }

    it('composes the same layers as the literal clause, with placeholders in place of the values', () => {
        const binder = new TestBinder();
        const u = user('user-1', 'one@example.com');

        const bound = entity().GetEffectiveRowFilterWhereClause(u, EntityPermissionType.Read, '', binder);
        const literal = entity().GetEffectiveRowFilterWhereClause(u, EntityPermissionType.Read, '');

        expect(bound).toBe('(((Contact = @rls0) OR (OwnerID = @rls1)))');
        expect(literal).toBe("(((Contact = 'one@example.com') OR (OwnerID = 'user-1')))");
        expect(binder.Values.map((v) => v.Value)).toEqual(['one@example.com', 'user-1']);
    });

    it('is identical text for two users, call after call', () => {
        const first = entity().GetEffectiveRowFilterWhereClause(user('user-1', 'one@example.com'), EntityPermissionType.Read, '', new TestBinder());
        const second = entity().GetEffectiveRowFilterWhereClause(user('user-2', 'two@example.com'), EntityPermissionType.Read, '', new TestBinder());

        expect(first).toBe(second);
    });

    it('binds nothing and returns empty text when no layer applies', () => {
        const binder = new TestBinder();
        const outsider = new UserInfo(null, { ID: 'u', UserRoles: [] });

        expect(entity().GetEffectiveRowFilterWhereClause(outsider, EntityPermissionType.Read, '', binder)).toBe('');
        expect(binder.Values).toEqual([]);
    });
});
