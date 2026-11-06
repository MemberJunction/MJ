import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CloneAuthorizer } from '../CloneAuthorization';
import { GrantedCloneAuthorizations } from './helpers/cloneAuthorizations';

const user = { ID: 'u-1' } as UserInfo;

/** The seeded tree with only the named nodes granted directly. */
const authorizer = (...granted: string[]) =>
    new CloneAuthorizer({
        Authorizations: GrantedCloneAuthorizations(false).map((a) => (granted.includes(a.Name) ? ({ ...a, UserCanExecute: () => true } as typeof a) : a)),
    } as unknown as IMetadataProvider);

describe('CloneAuthorizer', () => {
    it('lets a Clone Records holder clone in either schema', () => {
        const auth = authorizer('Clone Records');
        expect(auth.CanCloneEntity({ Name: 'MJ: Users', SchemaName: '__mj' } as EntityInfo, user).Granted).toBe(true);
        expect(auth.CanCloneEntity({ Name: 'Members', SchemaName: 'app' } as EntityInfo, user).Granted).toBe(true);
    });

    it('does not give a Clone Records holder Fire Hooks, Batch or Override Scope', () => {
        const auth = authorizer('Clone Records');
        expect(auth.CanFireHooks(user)).toBe(false);
        expect(auth.CanBatchClone(user)).toBe(false);
        expect(auth.CanOverrideScope(user)).toBe(false);
    });

    it('grants each of them explicitly, or through the Record Cloning root', () => {
        const explicit = authorizer('Clone Records: Fire Hooks', 'Clone Records: Batch');
        expect(explicit.CanFireHooks(user)).toBe(true);
        expect(explicit.CanBatchClone(user)).toBe(true);
        expect(explicit.CanOverrideScope(user)).toBe(false);

        const root = authorizer('Record Cloning');
        expect([root.CanFireHooks(user), root.CanBatchClone(user), root.CanOverrideScope(user)]).toEqual([true, true, true]);
    });

    it('fails closed when an authorization is missing from metadata', () => {
        const auth = new CloneAuthorizer({ Authorizations: [] } as unknown as IMetadataProvider);
        expect(auth.CanBatchClone(user)).toBe(false);
    });
});
