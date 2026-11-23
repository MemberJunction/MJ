import { AuthenticationError } from 'type-graphql';
import { INVITE_ONLY_AUTH_ERROR_PREFIX } from './inviteOnlyPolicy.js';

/**
 * Authentication error thrown when invite-only external user policy rejects a sign-in
 * (uninvited identity, inactive invited account, or unverified external email claim).
 */
export class InviteOnlyAuthenticationError extends AuthenticationError {
  public readonly Code = 'INVITE_ONLY_AUTH_REFUSED';

  constructor(message: string) {
    super(message.startsWith(INVITE_ONLY_AUTH_ERROR_PREFIX) ? message : `${INVITE_ONLY_AUTH_ERROR_PREFIX} ${message}`);
    this.name = 'InviteOnlyAuthenticationError';
  }
}

/**
 * Classifies an error as an {@link InviteOnlyAuthenticationError} safely even when bundler
 * boundaries duplicate `type-graphql`'s `AuthenticationError` class.
 */
export function IsInviteOnlyAuthenticationError(error: unknown): error is InviteOnlyAuthenticationError {
  if (error instanceof InviteOnlyAuthenticationError) {
    return true;
  }
  return error instanceof Error && (error.name === 'InviteOnlyAuthenticationError' || error.message.startsWith(INVITE_ONLY_AUTH_ERROR_PREFIX));
}
