/**
 * Shared authentication helpers for REST integration connectors.
 * Connectors import these to avoid re-implementing token/grant logic.
 */
export { OAuth2TokenManager } from './OAuth2TokenManager.js';
export type {
    OAuth2GrantType,
    OAuth2TokenRequest,
    OAuth2Token,
} from './OAuth2TokenManager.js';
export { OAuth1aSigner, percentEncodeRFC3986 } from './OAuth1aSigner.js';
export type {
    OAuth1aSignRequest,
    OAuth1aSignatureMethod,
} from './OAuth1aSigner.js';
