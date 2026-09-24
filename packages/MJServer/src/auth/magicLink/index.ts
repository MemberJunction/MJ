export * from './types.js';
export {
  GenerateRawToken, generateRawToken,
  HashToken, hashToken,
  EvaluateInvite, evaluateInvite,
  BuildSessionClaims, buildSessionClaims,
  MAGIC_LINK_TOKEN_PREFIX,
  type InviteEvaluationInput,
} from './magicLinkCore.js';
export { MagicLinkKeyManager } from './MagicLinkKeys.js';
export { MagicLinkService } from './MagicLinkService.js';
export {
  CreateMagicLinkHandler, createMagicLinkHandler,
  CreateMagicLinkJwksRouter, createMagicLinkJwksRouter,
  RegisterMagicLinkAuthProvider, registerMagicLinkAuthProvider,
  MAGIC_LINK_MOUNT_PATH,
  MAGIC_LINK_JWKS_PATH,
} from './MagicLinkRouter.js';
