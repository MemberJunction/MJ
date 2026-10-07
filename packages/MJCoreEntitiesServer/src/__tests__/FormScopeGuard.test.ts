import { describe, it, expect } from 'vitest';
import { ValidationResult, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { FormScope } from '@memberjunction/core-entities';
import {
    ApplyFormScopeValidation,
    DescribeFormScopeWrite,
    FormScopeDeleteRefusal,
    FormScopeGuardRefusal,
    FormScopeReplayRefusal,
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
    /** `Owner` makes the caller a grant holder without any authorization metadata. */
    CallerType?: string;
}): GuardedFormScopeRow {
    const prior: Record<string, unknown> = {
        Scope: init.PriorScope ?? init.Scope,
        UserID: init.PriorUserID === undefined ? init.UserID : init.PriorUserID,
    };
    return {
        IsSaved: init.IsSaved,
        ActiveUser: init.Caller === null ? null : ({ ID: init.Caller ?? ME, Type: init.CallerType ?? 'User' } as UserInfo),
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

    /** A delete removes the row as stored, so an unsaved edit to its scope cannot change the check. */
    it('reads both sides of a delete from the loaded values, not unsaved edits', () => {
        const r = row({ IsSaved: true, Scope: 'User', UserID: ME, PriorScope: 'Global', PriorUserID: null });
        const write = DescribeFormScopeWrite(r, 'delete', false);
        expect(write).toMatchObject({ PriorScope: 'Global', PriorUserID: null, NextScope: 'Global', NextUserID: null });
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

/** No authorization metadata: only an `Owner`-type caller holds the grant. */
const PROVIDER = { Authorizations: [] } as unknown as IMetadataProvider;

describe('FormScopeDeleteRefusal', () => {
    it('lets an owner delete their own personal row', () => {
        expect(FormScopeDeleteRefusal(row({ IsSaved: true, Scope: 'User', UserID: ME }), PROVIDER)).toBeNull();
    });

    it('refuses a holder deleting someone else\'s personal row', () => {
        const r = row({ IsSaved: true, Scope: 'User', UserID: 'someone-else', CallerType: 'Owner' });
        expect(FormScopeDeleteRefusal(r, PROVIDER)).toMatch(/your own/i);
    });

    it('refuses a non-holder deleting a shared row they edited into their own in memory', () => {
        const r = row({ IsSaved: true, Scope: 'User', UserID: ME, PriorScope: 'Global', PriorUserID: null });
        expect(FormScopeDeleteRefusal(r, PROVIDER)).toMatch(/Manage Form Defaults/);
    });

    it('lets a holder delete a shared row', () => {
        expect(FormScopeDeleteRefusal(row({ IsSaved: true, Scope: 'Global', UserID: null, CallerType: 'Owner' }), PROVIDER)).toBeNull();
    });
});

/** `ReplayOnly` skips `Validate()`, so the replay check is the only scope check on that path. */
describe('FormScopeReplayRefusal', () => {
    const replay = { ReplayOnly: true };

    it('ignores an ordinary save, which Validate() checks', () => {
        expect(FormScopeReplayRefusal(row({ IsSaved: false, Scope: 'Global', UserID: null }), PROVIDER, {})).toBeNull();
    });

    it('refuses a non-holder, whatever the row', () => {
        expect(FormScopeReplayRefusal(row({ IsSaved: false, Scope: 'User', UserID: ME }), PROVIDER, replay))
            .toMatch(/ReplayOnly/);
    });

    it('refuses a holder writing someone else\'s personal row', () => {
        const r = row({ IsSaved: true, Scope: 'User', UserID: 'someone-else', CallerType: 'Owner' });
        expect(FormScopeReplayRefusal(r, PROVIDER, replay)).toMatch(/your own/i);
    });

    it('lets a holder replay a shared row or their own', () => {
        expect(FormScopeReplayRefusal(row({ IsSaved: true, Scope: 'Global', UserID: null, CallerType: 'Owner' }), PROVIDER, replay)).toBeNull();
        expect(FormScopeReplayRefusal(row({ IsSaved: false, Scope: 'User', UserID: ME, CallerType: 'Owner' }), PROVIDER, replay)).toBeNull();
    });

    it('allows a canonical scope in a trusted context with no caller', () => {
        expect(FormScopeReplayRefusal(row({ IsSaved: false, Scope: 'Global', UserID: null, Caller: null }), PROVIDER, replay)).toBeNull();
    });

    /** A replayed write skips Validate(), so the canonical-Scope check runs here too. */
    it('refuses a Scope that is not exactly User, Role or Global, from a holder and with no caller', () => {
        for (const caller of [ME, null]) {
            const r = row({ IsSaved: false, Scope: 'Global ' as FormScope, UserID: null, Caller: caller, CallerType: 'Owner' });
            expect(FormScopeReplayRefusal(r, PROVIDER, replay)).toMatch(/exactly/);
        }
    });
});

describe('ApplyFormScopeValidation', () => {
    function validate(r: GuardedFormScopeRow): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        ApplyFormScopeValidation(r, PROVIDER, result);
        return result;
    }

    it('leaves an owner\'s own personal row valid', () => {
        expect(validate(row({ IsSaved: true, Scope: 'User', UserID: ME })).Success).toBe(true);
    });

    it('adds the rule\'s refusal as a Scope error', () => {
        const result = validate(row({ IsSaved: false, Scope: 'Global', UserID: null }));
        expect(result.Success).toBe(false);
        expect(result.Errors[0]).toMatchObject({ Source: 'Scope' });
        expect(result.Errors[0].Message).toMatch(/Manage Form Defaults/);
    });

    /**
     * BaseEntity's value-list check trims and case-folds, and SQL Server ignores trailing spaces
     * in the CHECK, so a padded or re-cased Scope would otherwise save.
     */
    it('refuses a Scope that is not exactly User, Role or Global, even from a holder', () => {
        for (const scope of ['Global ', 'global', 'USER', '']) {
            const result = validate(row({ IsSaved: false, Scope: scope as FormScope, UserID: null, CallerType: 'Owner' }));
            expect(result.Success).toBe(false);
            expect(result.Errors[0]).toMatchObject({ Source: 'Scope' });
            expect(result.Errors[0].Message).toMatch(/exactly/);
        }
    });

    it('refuses a Scope that is not exactly one of the three in a trusted context too', () => {
        expect(validate(row({ IsSaved: false, Scope: 'Global ' as FormScope, UserID: null, Caller: null })).Success).toBe(false);
    });
});
