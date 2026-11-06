/**
 * Field-Level Security — the memoized answers stay correct when what they depend on changes.
 *
 * Several field-security answers are memoized so hot paths pay a lookup instead of a walk:
 * whether field security applies to an IS-A child, a user's denied sets, a user's denials across a
 * whole catalog (which gates every SQL fragment and keys saved-view cache slots), and the field
 * keys the client-input gate recognizes. Each test changes one thing a memo depends on, in the
 * ways production and the integration tier change it, and checks the next answer sees it:
 * - an `EnableFieldLevelSecurity` flag flipped in place, on the entity or an IS-A ancestor;
 * - a rule edited in place followed by `InvalidateFieldSecurityCache()`;
 * - an ancestor replaced by a rebuilt `EntityInfo`, or by a provider whose entity array changed;
 * - a role added to the user;
 * - an entity added to the catalog.
 * The flag survives serialization and rebuild, since it is now an accessor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CurrentFieldSecurityGeneration, EntityInfo, FieldPermissionAccess, FieldSecurityError } from '../generic/entityInfo';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { FieldSecuritySQLGate } from '../generic/fieldSecuritySQLGate';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { IMetadataProvider } from '../generic/interfaces';
import { AssertClientInputWritableForUser } from '../generic/entityValueFieldSecurity';

const HR_ROLE_ID = 'B0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'B0000000-0000-0000-0000-000000000003';
const PEOPLE_ID = 'D0000000-0000-0000-0000-000000000001';
const CONTACTS_ID = 'D0000000-0000-0000-0000-000000000002';
const NOTES_ID = 'D0000000-0000-0000-0000-000000000003';

function rules(fieldId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-rule-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
}

/** `People`: `Phone` readable by HR only (when field security is on). */
function people(enableFLS: boolean): EntityInfo {
    return new EntityInfo({
        ID: PEOPLE_ID, Name: 'People', SchemaName: 'dbo', BaseTable: 'People', BaseView: 'vwPeople',
        IncludeInAPI: true, EnableFieldLevelSecurity: enableFLS,
        Permissions: [HR_ROLE_ID, INTERN_ROLE_ID].map(r => ({ EntityID: PEOPLE_ID, RoleID: r, CanRead: true })),
        Fields: [
            { ID: 'mp-id', EntityID: PEOPLE_ID, Sequence: 1, Name: 'ID', Entity: 'People', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'mp-name', EntityID: PEOPLE_ID, Sequence: 2, Name: 'Name', Entity: 'People', Type: 'nvarchar',
              EntityFieldPermissions: rules('mp-name', [HR_ROLE_ID, INTERN_ROLE_ID]) },
            { ID: 'mp-phone', EntityID: PEOPLE_ID, Sequence: 3, Name: 'Phone', Entity: 'People', Type: 'nvarchar',
              EntityFieldPermissions: rules('mp-phone', [HR_ROLE_ID]) },
        ],
    });
}

/** `Contacts` IS-A `People`, field security off on itself. */
function contacts(): EntityInfo {
    return new EntityInfo({
        ID: CONTACTS_ID, Name: 'Contacts', ParentID: PEOPLE_ID, SchemaName: 'dbo', BaseTable: 'Contacts', BaseView: 'vwContacts',
        IncludeInAPI: true, EnableFieldLevelSecurity: false,
        Fields: [
            { ID: 'mc-id', EntityID: CONTACTS_ID, Sequence: 1, Name: 'ID', Entity: 'Contacts', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'mc-name', EntityID: CONTACTS_ID, Sequence: 2, Name: 'Name', Entity: 'Contacts', Type: 'nvarchar' },
            { ID: 'mc-phone', EntityID: CONTACTS_ID, Sequence: 3, Name: 'Phone', Entity: 'Contacts', Type: 'nvarchar' },
        ],
    });
}

/** An entity without field security, the target of the filters below. */
function plainEntity(id: string, name: string): EntityInfo {
    return new EntityInfo({
        ID: id, Name: name, SchemaName: 'dbo', BaseTable: name, BaseView: `vw${name}`, IncludeInAPI: true,
        Fields: [
            { ID: `${id}-id`, EntityID: id, Sequence: 1, Name: 'ID', Entity: name, Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: `${id}-status`, EntityID: id, Sequence: 2, Name: 'Status', Entity: name, Type: 'nvarchar' },
            { ID: `${id}-person`, EntityID: id, Sequence: 3, Name: 'PersonID', Entity: name, Type: 'uniqueidentifier' },
        ],
    });
}

function buildUser(roleIds: string[], id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = id;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

function installProvider(entities: () => EntityInfo[]): void {
    Metadata.Provider = {
        get Entities() { return entities(); },
        EntityByID: (id: string) => entities().find(e => e.ID === id),
        EntityByName: (n: string) => entities().find(e => e.Name === n),
        CurrentUser: null,
    } as unknown as ProviderBase;
}

const SUBQUERY_FILTER = "PersonID IN (SELECT ID FROM vwPeople WHERE Phone LIKE '555%')";

let previous: IMetadataProvider;
beforeEach(() => { previous = Metadata.Provider; });
afterEach(() => { Metadata.Provider = previous as unknown as ProviderBase; });

describe('the catalog denial summary follows every change it depends on', () => {
    it('REGRESSION: an EnableFieldLevelSecurity flag flipped in place is seen by the next answer', () => {
        const parent = people(false);
        const notes = plainEntity(NOTES_ID, 'Notes');
        const catalog = [parent, notes];
        const intern = buildUser([INTERN_ROLE_ID], 'intern-flip');
        const ctx = { User: intern, Dialect: 'sqlserver' as const, Catalog: catalog, TargetEntity: notes };

        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, intern)).toBe(false);
        expect(FieldSecuritySQLGate.FindViolation(SUBQUERY_FILTER, ctx)).toBeNull();

        parent.EnableFieldLevelSecurity = true; // the integration tier flips flags exactly like this

        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, intern)).toBe(true);
        expect(FieldSecuritySQLGate.FindViolation(SUBQUERY_FILTER, ctx)?.Kind).toBe('DeniedField');
        expect(FieldSecuritySQLGate.CatalogDenialProfileKey(catalog, intern)).toContain('phone');

        parent.EnableFieldLevelSecurity = false;
        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, intern)).toBe(false);
        expect(FieldSecuritySQLGate.CatalogDenialProfileKey(catalog, intern)).toBe('');
    });

    it('REGRESSION: a rule edited in place is seen after InvalidateFieldSecurityCache()', () => {
        const parent = people(true);
        const catalog = [parent, plainEntity(NOTES_ID, 'Notes')];
        const intern = buildUser([INTERN_ROLE_ID], 'intern-rule');
        expect(FieldSecuritySQLGate.CatalogDenialProfileKey(catalog, intern)).toContain('phone');

        const phone = parent.Fields.find(f => f.Name === 'Phone')!;
        const hrRule = phone.FieldPermissions.find(r => r.RoleID === HR_ROLE_ID)!;
        hrRule.RoleID = INTERN_ROLE_ID; // the rule now opens Phone to the intern instead
        parent.InvalidateFieldSecurityCache();

        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, intern)).toBe(false);
    });

    it('REGRESSION: a role added to the user is seen by the next answer', () => {
        const catalog = [people(true)];
        const user = buildUser([INTERN_ROLE_ID], 'grows');
        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, user)).toBe(true);

        user.UserRoles.push(new UserRoleInfo({ UserID: user.ID, RoleID: HR_ROLE_ID, Role: 'HR' }));

        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, user)).toBe(false);
    });

    it('REGRESSION: an entity added to the catalog is seen by the next answer', () => {
        const restricted = people(true); // built first, so adding it moves nothing but the catalog
        const catalog: EntityInfo[] = [plainEntity(NOTES_ID, 'Notes')];
        const intern = buildUser([INTERN_ROLE_ID], 'intern-grow');
        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, intern)).toBe(false);

        catalog.push(restricted);

        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, intern)).toBe(true);
    });

    it('an unrestricted user is answered from the memo without walking the catalog again', () => {
        const catalog = [people(true), plainEntity(NOTES_ID, 'Notes')];
        const hr = buildUser([HR_ROLE_ID], 'hr-memo');
        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, hr)).toBe(false);
        const generation = CurrentFieldSecurityGeneration();

        let walked = 0;
        const spied = new Proxy(catalog, {
            get(target, prop, receiver) {
                if (prop === Symbol.iterator) walked++;
                return Reflect.get(target, prop, receiver);
            },
        });
        // A different array is a different memo; the same array is answered without iterating.
        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(catalog, hr)).toBe(false);
        expect(CurrentFieldSecurityGeneration()).toBe(generation);
        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(spied, hr)).toBe(false);
        expect(walked).toBe(1);
        expect(FieldSecuritySQLGate.CatalogHasDenialsForUser(spied, hr)).toBe(false);
        expect(walked).toBe(1);
    });
});

describe('FieldLevelSecurityApplies on an IS-A child follows its ancestors', () => {
    it('REGRESSION: an ancestor flag flipped in place is seen without any invalidation call', () => {
        const parent = people(false);
        const child = contacts();
        installProvider(() => [parent, child]);
        const intern = buildUser([INTERN_ROLE_ID], 'intern-isa');

        expect(child.FieldLevelSecurityApplies).toBe(false);
        expect(child.GetDeniedReadFields(intern).size).toBe(0);

        parent.EnableFieldLevelSecurity = true;

        expect(child.FieldLevelSecurityApplies).toBe(true);
        expect(child.GetDeniedReadFields(intern).has('phone')).toBe(true);
    });

    it('REGRESSION: an ancestor swapped by a provider whose entity array changed, with nothing rebuilt, is seen', () => {
        const parentOff = people(false);
        const parentOn = people(true);
        const child = contacts();
        const arrays = { off: [parentOff, child], on: [parentOn, child] };
        let current = arrays.off;
        installProvider(() => current);
        const intern = buildUser([INTERN_ROLE_ID], 'intern-swap');

        expect(child.FieldLevelSecurityApplies).toBe(false);
        expect(child.GetDeniedReadFields(intern).size).toBe(0);

        current = arrays.on; // same EntityInfo objects, built before; only the provider's array moved

        expect(child.FieldLevelSecurityApplies).toBe(true);
        expect(child.GetDeniedReadFields(intern).has('phone')).toBe(true);
    });

    it('an ancestor not yet resolvable is not memoized as absent', () => {
        const parent = people(true);
        const child = contacts();
        const entities: EntityInfo[] = [child]; // the provider does not hold the parent yet
        installProvider(() => entities);
        expect(child.FieldLevelSecurityApplies).toBe(false);

        entities.push(parent); // same array, nothing built: only the incomplete walk can notice

        expect(child.FieldLevelSecurityApplies).toBe(true);
    });
});

describe('EnableFieldLevelSecurity survives serialization and rebuild', () => {
    it('round-trips through toJSON() and a new EntityInfo', () => {
        const on = people(true);
        const json = JSON.parse(JSON.stringify(on)) as Record<string, unknown>;
        expect(json.EnableFieldLevelSecurity).toBe(true);
        expect(Object.keys(json)).not.toContain('_enableFieldLevelSecurity');
        expect(new EntityInfo(json).EnableFieldLevelSecurity).toBe(true);
        expect(new EntityInfo({ ...json, EnableFieldLevelSecurity: false }).EnableFieldLevelSecurity).toBe(false);
    });
});

describe('the client-input gate recognizes fields after its memo', () => {
    it('refuses an unknown key and accepts transport keys in any case, call after call', () => {
        const parent = people(true);
        installProvider(() => [parent]);
        const intern = buildUser([INTERN_ROLE_ID], 'intern-input');
        for (let i = 0; i < 3; i++) {
            expect(() => AssertClientInputWritableForUser(parent, { ID: 'x', Name: 'n', oldvalues___: [] }, intern)).not.toThrow();
            expect(() => AssertClientInputWritableForUser(parent, { Nope: 1 }, intern)).toThrow(FieldSecurityError);
            expect(() => AssertClientInputWritableForUser(parent, { Extra: 1 }, intern, { additionalAllowedKeys: ['EXTRA'] })).not.toThrow();
        }
    });
});

