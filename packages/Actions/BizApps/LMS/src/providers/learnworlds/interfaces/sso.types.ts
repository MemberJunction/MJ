import { LearnWorldsBaseParams } from './common.types';

/**
 * Parameters for the SSOLogin action.
 * Requires either Email or UserID.
 */
export interface SSOLoginParams extends LearnWorldsBaseParams {
  Email?: string;
  UserID?: string;
  RedirectTo?: string;
}

/**
 * Result of the SSOLogin action
 */
export interface SSOLoginResult {
  LoginURL: string;
  LearnWorldsUserID?: string;
}
