import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationInfo, AuthorizationRoleInfo, Metadata, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import {
    FormScopeWriteRefusal,
    MANAGE_FORM_DEFAULTS_AUTHORIZATION,
    UserCanManageFormDefaults,
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
