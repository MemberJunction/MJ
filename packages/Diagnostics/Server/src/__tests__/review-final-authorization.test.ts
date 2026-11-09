import { describe, it, expect } from 'vitest';
import { AuthorizationInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AuthorizeDiagnosticsUser } from '../remoteOperations.js';

const PARENT_ID = 'C0A80001-0000-4000-8000-000000000001';
const CHILD_ID = 'C0A80001-0000-4000-8000-000000000002';

const user = { ID: 'AAAAAAAA-1111-4111-8111-000000000009', IsActive: true, Type: 'User', UserRoles: [] } as unknown as UserInfo;

/** A provider whose authorizations are a parent the user holds and a diagnostics child it does not. */
function providerWithParentGrant(): IMetadataProvider {
    const parent = { ID: PARENT_ID, Name: 'Diagnostics', ParentID: null, UserCanExecute: () => true };
    const child = { ID: CHILD_ID.toLowerCase(), Name: 'Diagnostics: Run Sessions', ParentID: PARENT_ID, UserCanExecute: () => false };
    const authorizations = [parent, child] as unknown as AuthorizationInfo[];
    return { Authorizations: authorizations } as unknown as IMetadataProvider;
}

describe('AuthorizeDiagnosticsUser ancestor grants', () => {
    it('passes a user granted the parent of the diagnostics authorization', async () => {
        expect(await AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', providerWithParentGrant())).toBe(true);
    });
});
