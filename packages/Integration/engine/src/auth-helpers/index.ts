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
