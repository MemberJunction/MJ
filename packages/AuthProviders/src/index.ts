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

// Concrete auth providers. These are @RegisterClass plugins resolved by key at runtime, so
// they were reachable via the factory but not importable by name — leaving downstream
// consumers unable to subclass or reference them directly. MagicLinkProvider (above) was
// already exported; these are the remaining six, for parity.
export { Auth0Provider } from './providers/Auth0Provider.js';
export { CognitoProvider } from './providers/CognitoProvider.js';
export { GoogleProvider } from './providers/GoogleProvider.js';
export { MSALProvider } from './providers/MSALProvider.js';
export { OktaProvider } from './providers/OktaProvider.js';
export { WorkOSProvider } from './providers/WorkOSProvider.js';
