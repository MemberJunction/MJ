import { LogError } from '@memberjunction/core';
import type { UserApplicationAccessStatus } from '@memberjunction/core-entities';

/**
 * UserInfoEngine setting that records the one-time automatic install of the Dashboards app.
 * The value is 'true' when set.
 */
export const DASHBOARDS_APP_AUTO_INSTALL_SETTING_KEY = 'Dashboards.AppAutoInstalled';

/**
 * How long one install step (the install, or the marker save) may take. A step that takes longer
 * counts as failed, so the install queue moves on and its callers are not held.
 */
export const DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS = 5000;

/** What the install paths know about the Dashboards app and the current user. */
export interface DashboardsAppInstallState {
  /** An Active application named Dashboards exists in metadata. */
  AppExists: boolean;
  /** The user's access to the app: role authorization, then the UserApplication row. Ignored when AppExists is false. */
  Access: UserApplicationAccessStatus;
  /** The one-time automatic install is recorded for the user. */
  AutoInstallRecorded: boolean;
}

/** The operations the install paths call. `dashboards-app.helpers.ts` builds them from ApplicationManager and UserInfoEngine. */
export interface DashboardsAppInstallOperations {
  /** The current state, or null when the user's app data cannot be read. */
  ReadState(): DashboardsAppInstallState | null;
  /** Installs or re-enables the app for the user and refreshes the user's app list. Resolves true on success. */
  Install(): Promise<boolean>;
  /** Saves the one-time automatic-install marker. Resolves true on success. */
  RecordAutoInstall(): Promise<boolean>;
}

/** What a Home load does about the Dashboards app. */
export type DashboardsAppAutoInstallAction = 'install' | 'skip';

/** What a user click that goes to the Dashboards app does before it navigates. */
export type DashboardsAppExplicitInstallAction = 'open' | 'install' | 'unavailable';

/**
 * The automatic path installs only for a user with no UserApplication row for the app and no
 * recorded install. An inactive row means the user removed the app, so it is left alone.
 */
export function DecideDashboardsAppAutoInstall(state: DashboardsAppInstallState): DashboardsAppAutoInstallAction {
  const install = state.AppExists && state.Access === 'not_installed' && !state.AutoInstallRecorded;
  return install ? 'install' : 'skip';
}

/**
 * The explicit path ignores the marker: a missing or removed app is installed, an active one
 * opens, and a missing or unauthorized app is unavailable.
 */
export function DecideDashboardsAppExplicitInstall(state: DashboardsAppInstallState): DashboardsAppExplicitInstallAction {
  if (!state.AppExists || state.Access === 'not_authorized') {
    return 'unavailable';
  }
  return state.Access === 'installed_active' ? 'open' : 'install';
}

/**
 * Automatic path (Home load). Installs the app when {@link DecideDashboardsAppAutoInstall} says so,
 * then records the marker. The marker is written only after a successful install, so a failed or
 * timed-out install is retried on the next load. Each step waits at most
 * {@link DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS}.
 * @returns true when this call installed the app.
 */
export function RunDashboardsAppAutoInstall(operations: DashboardsAppInstallOperations): Promise<boolean> {
  return runOneAtATime(async () => {
    const state = operations.ReadState();
    if (!state || DecideDashboardsAppAutoInstall(state) === 'skip') {
      return false;
    }
    if (!(await withStepTimeout(operations.Install(), 'the install'))) {
      return false;
    }
    await withStepTimeout(operations.RecordAutoInstall(), 'the marker save');
    return true;
  });
}

/**
 * Explicit path (a user click that goes to the app). Installs the app when it is missing or
 * removed, and records the marker if it is not set yet. Each step waits at most
 * {@link DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS}.
 * @returns true when the user has the app active afterwards, so the caller can navigate.
 */
export function RunDashboardsAppExplicitInstall(operations: DashboardsAppInstallOperations): Promise<boolean> {
  return runOneAtATime(async () => {
    const state = operations.ReadState();
    if (!state) {
      return false;
    }
    const action = DecideDashboardsAppExplicitInstall(state);
    if (action !== 'install') {
      return action === 'open';
    }
    if (!(await withStepTimeout(operations.Install(), 'the install'))) {
      return false;
    }
    if (!state.AutoInstallRecorded) {
      await withStepTimeout(operations.RecordAutoInstall(), 'the marker save');
    }
    return true;
  });
}

/**
 * Resolves with the step's result, or with false when the step does not settle within
 * {@link DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS}. A timed-out step is logged and keeps running in
 * the background, but nothing waits for it. The timer is cleared when the step settles first.
 */
function withStepTimeout(step: Promise<boolean>, stepName: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      LogError(`Dashboards app install: ${stepName} did not finish within ${DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS} ms, so it counts as failed`);
      resolve(false);
    }, DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS);
  });
  return Promise.race([step, timedOut]).finally(() => clearTimeout(timer));
}

let installQueue: Promise<unknown> = Promise.resolve();

/** Runs install work one call at a time, so each call reads the state the previous call left. */
function runOneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = installQueue.then(work);
  installQueue = run.catch(() => undefined);
  return run;
}
