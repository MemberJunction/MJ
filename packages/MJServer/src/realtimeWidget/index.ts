/**
 * @fileoverview Public web widget guest-session module barrel.
 * @module @memberjunction/server/widget
 */
export * from './widgetCore.js';
export {
  verifyHostAssertion,
  extractHostIdentity,
  type HostAssertedIdentity,
  type HostAssertionResult,
  type HostAssertionError,
} from './host-identity.js';
export { WidgetSessionService } from './WidgetSessionService.js';
export type { MintGuestSessionInput, MintGuestSessionResult, WidgetMintAuditContext } from './WidgetSessionService.js';
export { createWidgetHandler, WIDGET_MOUNT_PATH } from './WidgetRouter.js';
