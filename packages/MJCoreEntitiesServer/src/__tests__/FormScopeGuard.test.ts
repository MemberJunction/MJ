import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { FormScope } from '@memberjunction/core-entities';
import {
    DescribeFormScopeWrite,
    FormScopeGuardRefusal,
    type GuardedFormScopeRow,
} from '../custom/FormScopeGuard';

/**
 * The glue between an entity row and the scope rule.
 *
 * The rule itself is tested as a matrix in `@memberjunction/core-entities`. What is tested here is
 * that the subclasses feed it the right values: the value BEFORE the write, read from the field's
 * `OldValue`, and the value after. Getting the prior value wrong is precisely the hole the rule's
 * two-sided check exists to close — a guard that saw only the new scope would let a user demote a
 * shared row to their own.
 */

const ME = 'user-me';

/** A row double exposing exactly what the guard reads. */
function row(init: {
    IsSaved: boolean;
    Scope: FormScope;
    UserID: string | null;
    PriorScope?: FormScope;
    PriorUserID?: string | null;
    Caller?: string | null;
}): GuardedFormScopeRow {
    const prior: Record<string, unknown> = {
        Scope: init.PriorScope ?? init.Scope,
        UserID: init.PriorUserID === undefined ? init.UserID : init.PriorUserID,
    };
    return {
        IsSaved: init.IsSaved,
        ActiveUser: init.Caller === null ? null : ({ ID: init.Caller ?? ME } as UserInfo),
        Scope: init.Scope,
        UserID: init.UserID,
        GetFieldByName: (name: string) => ({ OldValue: prior[name] }),
    };
}

describe('DescribeFormScopeWrite', () => {
    it('reads no prior values on a create', () => {
        const write = DescribeFormScopeWrite(row({ IsSaved: false, Scope: 'User', UserID: ME }), 'create', false);
        expect(write).toMatchObject({
            Operation: 'create', PriorScope: null, PriorUserID: null, NextScope: 'User', NextUserID: ME,
        });
    });

    it('reads the prior scope and owner from the fields on an update', () => {
        const r = row({ IsSaved: true, Scope: 'User', UserID: ME, PriorScope: 'Global', PriorUserID: null });
        const write = DescribeFormScopeWrite(r, 'update', false);
        expect(write).toMatchObject({ PriorScope: 'Global', PriorUserID: null, NextScope: 'User', NextUserID: ME });
    });

    it('uses the row as it stands for both sides of a delete', () => {
        const r = row({ IsSaved: true, Scope: 'Role', UserID: null });
        const write = DescribeFormScopeWrite(r, 'delete', true);
        expect(write).toMatchObject({ PriorScope: 'Role', NextScope: 'Role', CallerHoldsGrant: true });
    });

    it('carries the caller and whether they hold the grant', () => {
        const write = DescribeFormScopeWrite(row({ IsSaved: false, Scope: 'User', UserID: ME }), 'create', true);
        expect(write).toMatchObject({ CallerID: ME, CallerHoldsGrant: true });
    });

    /**
     * No caller means a trusted, server-internal context — the same reading
     * `MJUserRoleEntityServer` gives it. There is nobody to check.
     */
    it('describes nothing when there is no caller', () => {
        const r = row({ IsSaved: false, Scope: 'Global', UserID: null, Caller: null });
        expect(DescribeFormScopeWrite(r, 'create', false)).toBeNull();
    });
});

describe('FormScopeGuardRefusal', () => {
    it('refuses a non-holder demoting a Global row to their own', () => {
        const r = row({ IsSaved: true, Scope: 'User', UserID: ME, PriorScope: 'Global', PriorUserID: null });
        expect(FormScopeGuardRefusal(r, 'update', false)).toMatch(/Manage Form Defaults/);
    });

    it('lets an owner edit their own personal row', () => {
        expect(FormScopeGuardRefusal(row({ IsSaved: true, Scope: 'User', UserID: ME }), 'update', false)).toBeNull();
    });

    it('refuses a holder deleting someone else\'s personal row', () => {
        const r = row({ IsSaved: true, Scope: 'User', UserID: 'someone-else' });
        expect(FormScopeGuardRefusal(r, 'delete', true)).toMatch(/your own/i);
    });

    it('allows anything in a trusted context with no caller', () => {
        const r = row({ IsSaved: false, Scope: 'Global', UserID: null, Caller: null });
        expect(FormScopeGuardRefusal(r, 'create', false)).toBeNull();
    });
});
