import { InjectionToken, Type } from '@angular/core';

/**
 * Minimal user identity passed to the guard. This is the auth-provider-level
 * info available at guard-call time. Guards that need the full MJ UserInfo
 * should read Metadata().CurrentUser (available in the success path) or
 * query the server directly.
 */
export interface PreShellGuardUserInfo {
  id: string;
  email: string;
  name: string;
}

/**
 * Optional guard that runs after authentication but before the MJ shell renders.
 * If CheckPreShellBlock() returns a component Type, the shell is blocked and
 * the component is rendered as a full-page overlay. Return null to allow
 * normal shell rendering.
 *
 * Consuming libraries provide their implementation via Angular DI:
 *   { provide: MJ_PRE_SHELL_GUARD, useClass: MyGuardClass }
 */
export interface PreShellGuard {
  CheckPreShellBlock(user: PreShellGuardUserInfo): Promise<Type<unknown> | null>;
}

/**
 * Injection token for the pre-shell guard. Defaults to null (no guard).
 * Uses providedIn: 'root' with a null factory so it is optional — consumers
 * that don't provide a guard get null injected automatically.
 */
export const MJ_PRE_SHELL_GUARD = new InjectionToken<PreShellGuard | null>(
  'MJ_PRE_SHELL_GUARD',
  {
    providedIn: 'root',
    factory: () => null
  }
);
