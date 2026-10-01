import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationInfo, AuthorizationRoleInfo, Metadata, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import {
    ComponentWriteIsGuarded,
    ComponentWriteRefusal,
    ContributionScopeRank,
    FormContributionOutranks,
    FormScopeAllowedOnEntity,
    IsSelectableFormOverride,
    FormScopeWriteRefusal,
    IsCanonicalFormScope,
    MANAGE_FORM_DEFAULTS_AUTHORIZATION,
    UserCanManageFormDefaults,
    type ComponentWrite,
    type FormScope,
    type FormScopeOperation,
    type FormScopeWrite,
} from '../custom/FormScope/FormScopeRules';

/**
 * Who may write a custom form or a panel at which scope.
 *
 * Everything else in form scoping rests on this rule: the server subclasses enforce it on every
 * write path and the drawer uses it to decide what to draw. So it is tested as a matrix rather
 * than by example — every caller against every operation against every scope, and every scope
 * change in both directions.
 */

const ME = 'user-me';
const SOMEONE = 'user-someone';

/** A write by `ME`, with whatever the case overrides. */
function write(over: Partial<FormScopeWrite>): FormScopeWrite {
    return {
        Operation: 'update',
        PriorScope: 'User',
        PriorUserID: ME,
        NextScope: 'User',
        NextUserID: ME,
        CallerID: ME,
        CallerHoldsGrant: false,
        ...over,
    };
}

const allowed = (w: FormScopeWrite): boolean => FormScopeWriteRefusal(w) === null;

describe('the authorization name', () => {
    it('is the one the metadata declares', () => {
        expect(MANAGE_FORM_DEFAULTS_AUTHORIZATION).toBe('Manage Form Defaults');
    });
});

describe('a personal item — User scope', () => {
    const operations: FormScopeOperation[] = ['create', 'update', 'delete'];

    for (const operation of operations) {
        const prior = operation === 'create' ? null : 'User';
        const priorUser = operation === 'create' ? null : ME;

        it(`lets its owner ${operation} it`, () => {
            expect(allowed(write({ Operation: operation, PriorScope: prior, PriorUserID: priorUser }))).toBe(true);
        });

        it(`refuses anyone else who tries to ${operation} it, without the grant`, () => {
            const theirs = write({
                Operation: operation,
                PriorScope: prior,
                PriorUserID: operation === 'create' ? null : SOMEONE,
                NextUserID: SOMEONE,
            });
            expect(allowed(theirs)).toBe(false);
        });

        /**
         * The grant is about what OTHER people are shown. It does not reach into a person's own
         * customisations, so a holder is refused here exactly as anyone else is.
         */
        it(`refuses a holder who tries to ${operation} someone else's`, () => {
            const theirs = write({
                Operation: operation,
                PriorScope: prior,
                PriorUserID: operation === 'create' ? null : SOMEONE,
                NextUserID: SOMEONE,
                CallerHoldsGrant: true,
            });
            expect(allowed(theirs)).toBe(false);
        });
    }

    it('refuses giving your own item to someone else', () => {
        expect(allowed(write({ NextUserID: SOMEONE }))).toBe(false);
    });

    it('refuses taking over someone else\'s item by writing your own id onto it', () => {
        expect(allowed(write({ PriorUserID: SOMEONE, NextUserID: ME }))).toBe(false);
    });
});

describe('a shared item — Role or Global scope', () => {
    const scopes: FormScope[] = ['Role', 'Global'];
    const operations: FormScopeOperation[] = ['create', 'update', 'delete'];

    for (const scope of scopes) {
        for (const operation of operations) {
            const prior = operation === 'create' ? null : scope;

            it(`lets a holder ${operation} a ${scope} item`, () => {
                const w = write({
                    Operation: operation, PriorScope: prior, PriorUserID: null,
                    NextScope: scope, NextUserID: null, CallerHoldsGrant: true,
                });
                expect(allowed(w)).toBe(true);
            });

            it(`refuses a non-holder who tries to ${operation} a ${scope} item`, () => {
                const w = write({
                    Operation: operation, PriorScope: prior, PriorUserID: null,
                    NextScope: scope, NextUserID: null, CallerHoldsGrant: false,
                });
                expect(allowed(w)).toBe(false);
            });
        }
    }
});

/**
 * A scope change is checked at BOTH ends. Checking only the new scope would let a user demote a
 * Global row to their own and take it over; checking only the old one would let them promote
 * their own row to everyone.
 */
describe('changing scope', () => {
    it('refuses promoting your own item to a role, without the grant', () => {
        expect(allowed(write({ NextScope: 'Role', NextUserID: null }))).toBe(false);
    });

    it('refuses promoting your own item to everyone, without the grant', () => {
        expect(allowed(write({ NextScope: 'Global', NextUserID: null }))).toBe(false);
    });

    it('refuses demoting a Global item to your own, without the grant', () => {
        expect(allowed(write({ PriorScope: 'Global', PriorUserID: null, NextScope: 'User', NextUserID: ME }))).toBe(false);
    });

    it('refuses demoting a Role item to your own, without the grant', () => {
        expect(allowed(write({ PriorScope: 'Role', PriorUserID: null, NextScope: 'User', NextUserID: ME }))).toBe(false);
    });

    it('lets a holder publish their own item', () => {
        expect(allowed(write({ NextScope: 'Global', NextUserID: null, CallerHoldsGrant: true }))).toBe(true);
    });

    it('lets a holder unpublish an item back to themselves', () => {
        const w = write({
            PriorScope: 'Global', PriorUserID: null, NextScope: 'User', NextUserID: ME, CallerHoldsGrant: true,
        });
        expect(allowed(w)).toBe(true);
    });

    /**
     * Unpublishing hands the item to whoever unpublished it. A holder may not use that to drop a
     * shared item into another person's personal space.
     */
    it('refuses a holder unpublishing an item into someone else\'s hands', () => {
        const w = write({
            PriorScope: 'Global', PriorUserID: null, NextScope: 'User', NextUserID: SOMEONE, CallerHoldsGrant: true,
        });
        expect(allowed(w)).toBe(false);
    });

    it('refuses a holder publishing someone else\'s personal item', () => {
        const w = write({
            PriorScope: 'User', PriorUserID: SOMEONE, NextScope: 'Global', NextUserID: null, CallerHoldsGrant: true,
        });
        expect(allowed(w)).toBe(false);
    });

    it('lets a holder move an item between a role and everyone', () => {
        const w = write({
            PriorScope: 'Role', PriorUserID: null, NextScope: 'Global', NextUserID: null, CallerHoldsGrant: true,
        });
        expect(allowed(w)).toBe(true);
    });
});

describe('the refusal', () => {
    it('names the grant when a shared scope is the reason', () => {
        const reason = FormScopeWriteRefusal(write({ NextScope: 'Role', NextUserID: null }));
        expect(reason).toContain('Manage Form Defaults');
    });

    it('names ownership when someone else\'s personal item is the reason', () => {
        const reason = FormScopeWriteRefusal(write({ PriorUserID: SOMEONE, NextUserID: SOMEONE }));
        expect(reason).toMatch(/your own/i);
    });

    it('compares ids case-insensitively, as SQL Server and PostgreSQL return them differently', () => {
        const w = write({ PriorUserID: ME.toUpperCase(), NextUserID: ` ${ME.toUpperCase()} ` });
        expect(allowed(w)).toBe(true);
    });
});

/**
 * A Scope can reach the database in a form the rule did not expect: BaseEntity's value-list
 * check trims and case-folds, and SQL Server ignores trailing spaces in the CHECK. The rule reads
 * a scope the way the database does, and anything that is not exactly `User` needs the grant.
 */
describe('a scope that is not written exactly', () => {
    const notExact = ['Global ', 'global', '', 'Team', ' ROLE'];

    for (const scope of notExact) {
        it(`treats '${scope}' as shared, so a non-holder may not create it`, () => {
            const w = write({
                Operation: 'create', PriorScope: null, PriorUserID: null,
                NextScope: scope as FormScope, NextUserID: null,
            });
            expect(FormScopeWriteRefusal(w)).toContain('Manage Form Defaults');
        });

        it(`treats a prior '${scope}' as shared, so a non-holder may not demote it to their own`, () => {
            const w = write({ PriorScope: scope as FormScope, PriorUserID: null, NextScope: 'User', NextUserID: ME });
            expect(allowed(w)).toBe(false);
        });
    }

    it('reads a padded, lower-cased User as personal, so a holder may not write someone else\'s', () => {
        const w = write({
            PriorScope: 'user ' as FormScope, PriorUserID: SOMEONE, NextScope: 'user ' as FormScope,
            NextUserID: SOMEONE, CallerHoldsGrant: true,
        });
        expect(FormScopeWriteRefusal(w)).toMatch(/your own/i);
    });

    it('needs the grant for a User scope in the wrong casing, even from its owner', () => {
        const w = write({ PriorScope: 'user' as FormScope, NextScope: 'user' as FormScope });
        expect(allowed(w)).toBe(false);
    });

    it('refuses a holder writing an exact User row that belongs to someone else', () => {
        expect(allowed(write({ PriorUserID: SOMEONE, NextUserID: SOMEONE, CallerHoldsGrant: true }))).toBe(false);
    });

    it('treats a missing prior scope on an update as shared', () => {
        expect(allowed(write({ PriorScope: null, PriorUserID: null }))).toBe(false);
        expect(allowed(write({ PriorScope: null, PriorUserID: null, CallerHoldsGrant: true }))).toBe(true);
    });
});

describe('IsCanonicalFormScope', () => {
    it('accepts the three scopes exactly as stored', () => {
        expect(['User', 'Role', 'Global'].every(IsCanonicalFormScope)).toBe(true);
    });

    it('refuses padding, other casing, blanks and unknown values', () => {
        for (const value of ['Global ', 'global', ' User', '', 'Team', null, undefined]) {
            expect(IsCanonicalFormScope(value)).toBe(false);
        }
    });
});

/**
 * Two rows under one key at the same precedence: the narrower audience wins. The form's collapse
 * ranks by this, and code on either tier can rank the same way.
 */
describe('ContributionScopeRank', () => {
    it('ranks User over Role over Global', () => {
        expect(ContributionScopeRank('User')).toBeGreaterThan(ContributionScopeRank('Role'));
        expect(ContributionScopeRank('Role')).toBeGreaterThan(ContributionScopeRank('Global'));
    });

    it('ranks a missing or unknown scope below every scope', () => {
        expect(ContributionScopeRank(null)).toBeLessThan(ContributionScopeRank('Global'));
        expect(ContributionScopeRank(undefined)).toBe(0);
        expect(ContributionScopeRank('global ' as FormScope)).toBe(0);
    });
});

/**
 * The caller check the drawer uses to decide what to draw, and the server uses to decide whether
 * a shared-scope write is allowed. It must fail closed: a deployment that has not synced the
 * authorization yet grants nobody the right to publish.
 */
describe('UserCanManageFormDefaults', () => {
    const GRANT_ID = 'auth-form-defaults';
    const DEVELOPER = 'role-developer';
    const UI_ROLE = 'role-ui';

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
            AuthorizationRoles: [
                new AuthorizationRoleInfo({ ID: 'ar-1', AuthorizationID: GRANT_ID, RoleID: DEVELOPER, Type: 'Allow' }),
            ],
        } as never);
    });

    const grant = new AuthorizationInfo({
        ID: GRANT_ID, Name: MANAGE_FORM_DEFAULTS_AUTHORIZATION, ParentID: null, IsActive: true,
    });

    function user(roleIDs: string[], type = 'User'): UserInfo {
        return new UserInfo(null, {
            ID: 'u-1', Type: type,
            UserRoles: roleIDs.map((RoleID) => ({ UserID: 'u-1', RoleID })),
        });
    }

    const provider = (authorizations: AuthorizationInfo[]): IMetadataProvider =>
        ({ Authorizations: authorizations }) as unknown as IMetadataProvider;

    it('grants a user whose role holds the authorization', () => {
        expect(UserCanManageFormDefaults(user([DEVELOPER]), provider([grant]))).toBe(true);
    });

    it('refuses a user whose roles do not', () => {
        expect(UserCanManageFormDefaults(user([UI_ROLE]), provider([grant]))).toBe(false);
    });

    it('grants an Owner, who must never be locked out of publishing', () => {
        expect(UserCanManageFormDefaults(user([UI_ROLE], 'Owner'), provider([grant]))).toBe(true);
    });

    it('fails closed when the authorization has not been synced', () => {
        expect(UserCanManageFormDefaults(user([DEVELOPER]), provider([]))).toBe(false);
    });

    it('fails closed without a user', () => {
        expect(UserCanManageFormDefaults(null, provider([grant]))).toBe(false);
    });

    it('finds the authorization whatever its casing', () => {
        const lower = new AuthorizationInfo({ ID: GRANT_ID, Name: 'manage form defaults', ParentID: null, IsActive: true });
        expect(UserCanManageFormDefaults(user([DEVELOPER]), provider([lower]))).toBe(true);
    });
});

/**
 * The identity, permission and form-metadata surfaces take only the user's own forms and panels:
 * one published to a role or to everyone would change what other people see where it matters most.
 */
describe('FormScopeAllowedOnEntity', () => {
    const RESTRICTED = [
        'MJ: Users', 'MJ: Roles', 'MJ: User Roles', 'MJ: Authorizations', 'MJ: Authorization Roles',
        'MJ: Entity Permissions', 'MJ: Row Level Security Filters', 'MJ: API Keys',
        'MJ: Entity Field Permissions', 'MJ: Entity Form Overrides', 'MJ: Entity Form Contributions',
    ];

    it.each(RESTRICTED)('allows only User items on %s', (name) => {
        expect(FormScopeAllowedOnEntity(name, 'User')).toBe(true);
        expect(FormScopeAllowedOnEntity(name, 'Role')).toBe(false);
        expect(FormScopeAllowedOnEntity(name, 'Global')).toBe(false);
    });

    it('allows every scope on an ordinary entity', () => {
        for (const scope of ['User', 'Role', 'Global']) {
            expect(FormScopeAllowedOnEntity('MJ: Applications', scope)).toBe(true);
        }
    });

    it('matches the name whatever its casing or padding', () => {
        expect(FormScopeAllowedOnEntity('  mj: api keys ', 'Global')).toBe(false);
    });

    it('treats an unknown or blank scope as shared', () => {
        expect(FormScopeAllowedOnEntity('MJ: Users', null)).toBe(false);
        expect(FormScopeAllowedOnEntity('MJ: Users', ' user')).toBe(false);
    });
});

/** Two contributions under one key: the browser's collapse and the server's composition pick the same one. */
describe('FormContributionOutranks', () => {
    it('lets the higher precedence win, whatever the scope or source', () => {
        expect(FormContributionOutranks({ Precedence: 2, Scope: 'Global' }, { Precedence: 1, Scope: 'User' })).toBe(true);
        expect(FormContributionOutranks({ Precedence: 1, Scope: 'User' }, { Precedence: 0, Compiled: true })).toBe(true);
        expect(FormContributionOutranks({ Precedence: 0, Compiled: true }, { Precedence: 1, Scope: 'Global' })).toBe(false);
    });

    it('breaks a tie by the narrower scope between rows', () => {
        expect(FormContributionOutranks({ Precedence: 0, Scope: 'User' }, { Precedence: 0, Scope: 'Role' })).toBe(true);
        expect(FormContributionOutranks({ Precedence: 0, Scope: 'Role' }, { Precedence: 0, Scope: 'Global' })).toBe(true);
        expect(FormContributionOutranks({ Precedence: 0, Scope: 'Global' }, { Precedence: 0, Scope: 'User' })).toBe(false);
    });

    it('lets a compiled panel win a tie against any row', () => {
        expect(FormContributionOutranks({ Precedence: 0, Compiled: true }, { Precedence: 0, Scope: 'User' })).toBe(true);
        expect(FormContributionOutranks({ Precedence: 0, Scope: 'User' }, { Precedence: 0, Compiled: true })).toBe(false);
    });

    it('keeps the incumbent on a full tie, and reads a missing precedence as 0', () => {
        expect(FormContributionOutranks({ Precedence: 0, Scope: 'Role' }, { Precedence: 0, Scope: 'Role' })).toBe(false);
        expect(FormContributionOutranks({ Precedence: 0, Compiled: true }, { Precedence: 0, Compiled: true })).toBe(false);
        expect(FormContributionOutranks({ Precedence: null, Scope: 'User' }, { Precedence: undefined, Scope: 'Role' })).toBe(true);
    });
});

/** A form the user may pick: an Active one, or their own set aside; never a retracted shared one or a draft. */
describe('IsSelectableFormOverride', () => {
    it('offers live forms and the user\'s own set-aside form', () => {
        expect(IsSelectableFormOverride({ Status: 'Active', Scope: 'Global' })).toBe(true);
        expect(IsSelectableFormOverride({ Status: 'Active', Scope: 'Role' })).toBe(true);
        expect(IsSelectableFormOverride({ Status: 'Inactive', Scope: 'User' })).toBe(true);
    });

    it('withholds a shared form set aside, and every draft', () => {
        expect(IsSelectableFormOverride({ Status: 'Inactive', Scope: 'Global' })).toBe(false);
        expect(IsSelectableFormOverride({ Status: 'Inactive', Scope: 'Role' })).toBe(false);
        expect(IsSelectableFormOverride({ Status: 'Pending', Scope: 'User' })).toBe(false);
    });
});

/**
 * A form or panel draws the `MJ: Components` row its form or panel row points at, so changing that
 * component changes the form or panel. The rule treats such a change as a write to every form and
 * panel row that uses the component.
 */
describe('ComponentWriteRefusal', () => {
    const own = { Scope: 'User' as FormScope, UserID: ME };
    const others = { Scope: 'User' as FormScope, UserID: SOMEONE };
    const role = { Scope: 'Role' as FormScope, UserID: null };
    const global = { Scope: 'Global' as FormScope, UserID: null };

    /** A change to the component's specification by `ME`, with whatever the case overrides. */
    function componentWrite(over: Partial<ComponentWrite>): ComponentWrite {
        return {
            Operation: 'update',
            ChangedFields: ['Specification'],
            References: [],
            CallerID: ME,
            CallerHoldsGrant: false,
            ...over,
        };
    }

    const componentAllowed = (w: ComponentWrite): boolean => ComponentWriteRefusal(w) === null;

    it('lets the caller change a component only their own personal row uses', () => {
        expect(componentAllowed(componentWrite({ References: [own] }))).toBe(true);
        expect(componentAllowed(componentWrite({ References: [own, { Scope: 'User', UserID: ME.toUpperCase() }] }))).toBe(true);
    });

    it("refuses a component another user's personal row uses, a holder included", () => {
        for (const holds of [false, true]) {
            const refusal = ComponentWriteRefusal(componentWrite({ References: [others], CallerHoldsGrant: holds }));
            expect(refusal).toMatch(/belongs to someone else/);
        }
    });

    it('refuses a component a Role or Global row uses without the grant, and allows it with the grant', () => {
        for (const shared of [role, global]) {
            expect(ComponentWriteRefusal(componentWrite({ References: [shared] }))).toMatch(/Manage Form Defaults/);
            expect(componentAllowed(componentWrite({ References: [shared], CallerHoldsGrant: true }))).toBe(true);
        }
    });

    it('needs every row that uses the component to pass', () => {
        expect(componentAllowed(componentWrite({ References: [own, role] }))).toBe(false);
        expect(componentAllowed(componentWrite({ References: [own, role], CallerHoldsGrant: true }))).toBe(true);
        expect(componentAllowed(componentWrite({ References: [own, role, others], CallerHoldsGrant: true }))).toBe(false);
    });

    it('names the ownership reason when the grant would not help either', () => {
        expect(ComponentWriteRefusal(componentWrite({ References: [role, others] }))).toMatch(/belongs to someone else/);
    });

    it('says the component is used by a form or panel', () => {
        expect(ComponentWriteRefusal(componentWrite({ References: [global] }))).toMatch(/used by a form or panel/);
    });

    it('allows a component no form or panel row uses', () => {
        for (const operation of ['update', 'delete'] as const) {
            expect(componentAllowed(componentWrite({ Operation: operation, References: [] }))).toBe(true);
        }
    });

    it('allows any write when there is no caller', () => {
        for (const operation of ['update', 'delete'] as const) {
            expect(componentAllowed(componentWrite({ Operation: operation, References: [others, global], CallerID: null }))).toBe(true);
        }
    });

    it('allows a change to a column that does not change what the form or panel draws', () => {
        for (const field of ['Description', 'Title', 'Version', 'FunctionalRequirements']) {
            expect(componentAllowed(componentWrite({ ChangedFields: [field], References: [others, global] }))).toBe(true);
        }
        expect(componentAllowed(componentWrite({ ChangedFields: [], References: [global] }))).toBe(true);
    });

    it('guards a change to the specification, status, name or type, however the column name is cased', () => {
        for (const field of ['Specification', 'Status', 'Name', 'Type', 'status', ' Type ']) {
            expect(componentAllowed(componentWrite({ ChangedFields: [field], References: [global] }))).toBe(false);
        }
    });

    it('guards a delete whatever columns changed', () => {
        expect(componentAllowed(componentWrite({ Operation: 'delete', ChangedFields: [], References: [role] }))).toBe(false);
        expect(componentAllowed(componentWrite({ Operation: 'delete', ChangedFields: [], References: [own] }))).toBe(true);
    });

    it('never guards a create', () => {
        expect(componentAllowed(componentWrite({ Operation: 'create', References: [others, global] }))).toBe(true);
    });

    it('reads a padded or re-cased scope the way the database does', () => {
        expect(componentAllowed(componentWrite({ References: [{ Scope: ' user' as FormScope, UserID: SOMEONE }], CallerHoldsGrant: true }))).toBe(false);
        expect(componentAllowed(componentWrite({ References: [{ Scope: 'Global ' as FormScope, UserID: null }] }))).toBe(false);
    });
});

describe('ComponentWriteIsGuarded', () => {
    it('is true for a guarded change or a delete by a caller', () => {
        expect(ComponentWriteIsGuarded({ Operation: 'update', ChangedFields: ['Status'], CallerID: ME })).toBe(true);
        expect(ComponentWriteIsGuarded({ Operation: 'delete', ChangedFields: [], CallerID: ME })).toBe(true);
    });

    it('is false for a create, an unguarded change, or no caller', () => {
        expect(ComponentWriteIsGuarded({ Operation: 'create', ChangedFields: ['Specification'], CallerID: ME })).toBe(false);
        expect(ComponentWriteIsGuarded({ Operation: 'update', ChangedFields: ['Description'], CallerID: ME })).toBe(false);
        expect(ComponentWriteIsGuarded({ Operation: 'delete', ChangedFields: [], CallerID: null })).toBe(false);
    });
});
