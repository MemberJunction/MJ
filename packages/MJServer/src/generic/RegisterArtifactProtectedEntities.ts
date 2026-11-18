import {
  EnsureAnchoredConversationReadHookRegistered,
  EnsureArtifactGuestShareLinkReadHookRegistered,
  EnsureArtifactPermissionReadHookRegistered,
  EnsureArtifactReadHookRegistered,
  EnsureArtifactVersionAttributeReadHookRegistered,
  EnsureArtifactVersionReadHookRegistered,
  EnsureArtifactWorkingStateReadHookRegistered,
  EnsureCollectionArtifactReadHookRegistered,
  EnsureCollectionPermissionReadHookRegistered,
  EnsureCollectionReadHookRegistered,
  RegisterArtifactPostRunViewProtectedEntityRegistry,
} from '@memberjunction/core-entities-server';

/**
 * Registers all `PostRunView` ACL hooks and marks the 9 artifact/collection security entities as
 * protected in `ClientClauseScreen` (so generic `RunView` cannot bypass `PostRunView` filtering).
 */
export function RegisterArtifactPostRunViewProtectedEntities(): void {
  EnsureAnchoredConversationReadHookRegistered();
  EnsureArtifactReadHookRegistered();
  EnsureArtifactVersionReadHookRegistered();
  EnsureArtifactVersionAttributeReadHookRegistered();
  EnsureArtifactPermissionReadHookRegistered();
  EnsureArtifactWorkingStateReadHookRegistered();
  EnsureArtifactGuestShareLinkReadHookRegistered();
  EnsureCollectionReadHookRegistered();
  EnsureCollectionPermissionReadHookRegistered();
  EnsureCollectionArtifactReadHookRegistered();
  RegisterArtifactPostRunViewProtectedEntityRegistry();
}
