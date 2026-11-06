import type { AuthorizationInfo } from '@memberjunction/core';

/**
 * The seeded record-cloning authorization tree (metadata/authorizations/.record-cloning.json),
 * every node granted. Attach as `Authorizations` on a mock provider so plans are not FORBIDDEN.
 */
export function GrantedCloneAuthorizations(granted = true): AuthorizationInfo[] {
    const node = (ID: string, Name: string, ParentID: string | null) =>
        ({ ID, Name, ParentID, IsActive: true, UserCanExecute: () => granted }) as unknown as AuthorizationInfo;
    return [
        node('auth-record-cloning', 'Record Cloning', null),
        node('auth-clone-records', 'Clone Records', 'auth-record-cloning'),
        node('auth-clone-platform', 'Clone Records in Platform Schema', 'auth-clone-records'),
        node('auth-clone-custom', 'Clone Records in Custom Schemas', 'auth-clone-records'),
        node('auth-clone-fire-hooks', 'Clone Records: Fire Hooks', 'auth-record-cloning'),
        node('auth-clone-batch', 'Clone Records: Batch', 'auth-record-cloning'),
        node('auth-clone-override-scope', 'Clone Records: Override Scope', 'auth-record-cloning'),
    ];
}
