export { IAuthProvider } from './IAuthProvider.js';
export { BaseAuthProvider } from './BaseAuthProvider.js';
export { AuthProviderFactory } from './AuthProviderFactory.js';
export { TokenExpiredError } from './tokenExpiredError.js';
export { MagicLinkProvider } from './providers/MagicLinkProvider.js';
export {
  HostIdentityProvider,
  type HostAssertionVerifyResult,
  type HostAssertionError,
} from './providers/HostIdentityProvider.js';

// Re-export types consumers commonly need alongside the auth providers
export type { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
