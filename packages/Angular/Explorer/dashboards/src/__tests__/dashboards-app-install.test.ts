/**
 * Tests for the Dashboards app install logic (`shared/dashboards-app-install.ts`).
 *
 * Two paths: the automatic path (Home load) installs the app at most once per user and never
 * again after that, so a user who removes the app keeps it removed. The explicit path (a user
 * click that goes to the app) installs it when it is missing so navigation can proceed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DASHBOARDS_APP_AUTO_INSTALL_SETTING_KEY,
  DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS,
  DashboardsAppInstallOperations,
  DashboardsAppInstallState,
  DecideDashboardsAppAutoInstall,
  DecideDashboardsAppExplicitInstall,
  RunDashboardsAppAutoInstall,
  RunDashboardsAppExplicitInstall,
} from '../shared/dashboards-app-install';

const hoisted = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('@memberjunction/core', () => ({ LogError: hoisted.logError }));

function makeState(overrides: Partial<DashboardsAppInstallState> = {}): DashboardsAppInstallState {
  return { AppExists: true, Access: 'not_installed', AutoInstallRecorded: false, ...overrides };
}

/** A step that never settles, like a request the server never answers. */
const neverSettles = (): Promise<boolean> => new Promise<boolean>(() => undefined);

/** A promise and whether it has settled yet. */
interface TrackedPromise<T> {
  promise: Promise<T>;
  settled: boolean;
}

function track<T>(promise: Promise<T>): TrackedPromise<T> {
  const tracked: TrackedPromise<T> = { promise, settled: false };
  promise.then(
    () => (tracked.settled = true),
    () => (tracked.settled = true)
  );
  return tracked;
}

/** An in-memory user whose state changes when the flows install the app or record the marker. */
class FakeInstallOperations implements DashboardsAppInstallOperations {
  public InstallSucceeds = true;
  public RecordSucceeds = true;
  public InstallCalls = 0;
  public RecordCalls = 0;

  constructor(public State: DashboardsAppInstallState | null) {}

  public ReadState(): DashboardsAppInstallState | null {
    return this.State ? { ...this.State } : null;
  }

  public async Install(): Promise<boolean> {
    this.InstallCalls++;
    await Promise.resolve();
    if (this.InstallSucceeds && this.State) {
      this.State = { ...this.State, Access: 'installed_active' };
    }
    return this.InstallSucceeds;
  }

  public async RecordAutoInstall(): Promise<boolean> {
    this.RecordCalls++;
    await Promise.resolve();
    if (this.RecordSucceeds && this.State) {
      this.State = { ...this.State, AutoInstallRecorded: true };
    }
    return this.RecordSucceeds;
  }
}

describe('dashboards-app-install', () => {
  it('keys the one-time marker as Dashboards.AppAutoInstalled', () => {
    expect(DASHBOARDS_APP_AUTO_INSTALL_SETTING_KEY).toBe('Dashboards.AppAutoInstalled');
  });

  describe('DecideDashboardsAppAutoInstall', () => {
    it('installs when the app exists, the user has no row for it, and no install is recorded', () => {
      expect(DecideDashboardsAppAutoInstall(makeState())).toBe('install');
    });

    it.each([
      ['the user already has the app', makeState({ Access: 'installed_active' })],
      ['the user removed the app (inactive row)', makeState({ Access: 'installed_inactive' })],
      ['the one-time install is recorded', makeState({ AutoInstallRecorded: true })],
      ['the user is not authorized for the app', makeState({ Access: 'not_authorized' })],
      ['no active Dashboards app exists', makeState({ AppExists: false })],
    ])('skips when %s', (_label, state) => {
      expect(DecideDashboardsAppAutoInstall(state)).toBe('skip');
    });
  });

  describe('DecideDashboardsAppExplicitInstall', () => {
    it('opens without installing when the user has the app', () => {
      expect(DecideDashboardsAppExplicitInstall(makeState({ Access: 'installed_active' }))).toBe('open');
    });

    it.each([
      ['the user has no row for the app', makeState()],
      ['the user removed the app (inactive row)', makeState({ Access: 'installed_inactive' })],
      ['the one-time install is recorded', makeState({ AutoInstallRecorded: true })],
    ])('installs when %s', (_label, state) => {
      expect(DecideDashboardsAppExplicitInstall(state)).toBe('install');
    });

    it.each([
      ['no active Dashboards app exists', makeState({ AppExists: false })],
      ['the user is not authorized for the app', makeState({ Access: 'not_authorized' })],
    ])('is unavailable when %s', (_label, state) => {
      expect(DecideDashboardsAppExplicitInstall(state)).toBe('unavailable');
    });
  });

  describe('RunDashboardsAppAutoInstall', () => {
    it('installs the app, records the marker, and resolves true', async () => {
      const operations = new FakeInstallOperations(makeState());
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(true);
      expect(operations.InstallCalls).toBe(1);
      expect(operations.State).toEqual(makeState({ Access: 'installed_active', AutoInstallRecorded: true }));
    });

    it('does nothing when the user already has the app', async () => {
      const operations = new FakeInstallOperations(makeState({ Access: 'installed_active' }));
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(false);
      expect(operations.InstallCalls).toBe(0);
      expect(operations.RecordCalls).toBe(0);
    });

    it('leaves the marker unset when the install fails, so the next load retries', async () => {
      const operations = new FakeInstallOperations(makeState());
      operations.InstallSucceeds = false;
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(false);
      expect(operations.RecordCalls).toBe(0);

      operations.InstallSucceeds = true;
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(true);
      expect(operations.InstallCalls).toBe(2);
    });

    it('installs at most once across Home loads', async () => {
      const operations = new FakeInstallOperations(makeState());
      await RunDashboardsAppAutoInstall(operations);
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(false);
      expect(operations.InstallCalls).toBe(1);
    });

    it('keeps the app removed when the user disables it after the install', async () => {
      const operations = new FakeInstallOperations(makeState());
      await RunDashboardsAppAutoInstall(operations);
      operations.State = makeState({ Access: 'installed_inactive', AutoInstallRecorded: true });
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(false);
      expect(operations.InstallCalls).toBe(1);
    });

    it('keeps the app removed when the row is deleted after the install', async () => {
      const operations = new FakeInstallOperations(makeState());
      await RunDashboardsAppAutoInstall(operations);
      operations.State = makeState({ Access: 'not_installed', AutoInstallRecorded: true });
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(false);
      expect(operations.InstallCalls).toBe(1);
    });

    it('keeps the app removed for a user who got it by default and then disabled it', async () => {
      const operations = new FakeInstallOperations(makeState({ Access: 'installed_inactive' }));
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(false);
      expect(operations.InstallCalls).toBe(0);
    });

    it('still reports the install when the marker cannot be saved', async () => {
      const operations = new FakeInstallOperations(makeState());
      operations.RecordSucceeds = false;
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(true);
      expect(operations.RecordCalls).toBe(1);
    });

    it('does nothing when the user data cannot be read', async () => {
      const operations = new FakeInstallOperations(null);
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(false);
      expect(operations.InstallCalls).toBe(0);
    });
  });

  describe('RunDashboardsAppExplicitInstall', () => {
    it('resolves true without writing anything when the user has the app', async () => {
      const operations = new FakeInstallOperations(makeState({ Access: 'installed_active' }));
      await expect(RunDashboardsAppExplicitInstall(operations)).resolves.toBe(true);
      expect(operations.InstallCalls).toBe(0);
      expect(operations.RecordCalls).toBe(0);
    });

    it('installs a missing app, records the marker, and resolves true', async () => {
      const operations = new FakeInstallOperations(makeState());
      await expect(RunDashboardsAppExplicitInstall(operations)).resolves.toBe(true);
      expect(operations.State).toEqual(makeState({ Access: 'installed_active', AutoInstallRecorded: true }));
    });

    it('re-enables an app the user removed', async () => {
      const operations = new FakeInstallOperations(makeState({ Access: 'installed_inactive', AutoInstallRecorded: true }));
      await expect(RunDashboardsAppExplicitInstall(operations)).resolves.toBe(true);
      expect(operations.InstallCalls).toBe(1);
      expect(operations.RecordCalls).toBe(0);
    });

    it.each([
      ['no active Dashboards app exists', makeState({ AppExists: false })],
      ['the user is not authorized for the app', makeState({ Access: 'not_authorized' })],
    ])('resolves false without installing when %s', async (_label, state) => {
      const operations = new FakeInstallOperations(state);
      await expect(RunDashboardsAppExplicitInstall(operations)).resolves.toBe(false);
      expect(operations.InstallCalls).toBe(0);
    });

    it('resolves false and leaves the marker unset when the install fails', async () => {
      const operations = new FakeInstallOperations(makeState());
      operations.InstallSucceeds = false;
      await expect(RunDashboardsAppExplicitInstall(operations)).resolves.toBe(false);
      expect(operations.RecordCalls).toBe(0);
    });

    it('still resolves true when the marker cannot be saved', async () => {
      const operations = new FakeInstallOperations(makeState());
      operations.RecordSucceeds = false;
      await expect(RunDashboardsAppExplicitInstall(operations)).resolves.toBe(true);
    });

    it('resolves false when the user data cannot be read', async () => {
      await expect(RunDashboardsAppExplicitInstall(new FakeInstallOperations(null))).resolves.toBe(false);
    });
  });

  describe('overlapping calls', () => {
    it('installs once when two clicks overlap, and both resolve true', async () => {
      const operations = new FakeInstallOperations(makeState());
      const results = await Promise.all([RunDashboardsAppExplicitInstall(operations), RunDashboardsAppExplicitInstall(operations)]);
      expect(results).toEqual([true, true]);
      expect(operations.InstallCalls).toBe(1);
    });

    it('installs once when a Home load and a click overlap', async () => {
      const operations = new FakeInstallOperations(makeState());
      const results = await Promise.all([RunDashboardsAppAutoInstall(operations), RunDashboardsAppExplicitInstall(operations)]);
      expect(results).toEqual([true, true]);
      expect(operations.InstallCalls).toBe(1);
    });

    it('keeps running later calls after one fails', async () => {
      const failing = new FakeInstallOperations(makeState());
      failing.Install = async () => {
        throw new Error('network down');
      };
      const healthy = new FakeInstallOperations(makeState());
      const [first, second] = await Promise.allSettled([RunDashboardsAppAutoInstall(failing), RunDashboardsAppAutoInstall(healthy)]);
      expect(first.status).toBe('rejected');
      expect(second).toEqual({ status: 'fulfilled', value: true });
    });
  });

  describe('install steps that do not finish', () => {
    beforeEach(() => {
      hoisted.logError.mockClear();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('limits each step to 5 seconds', () => {
      expect(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS).toBe(5000);
    });

    it('counts an install that does not finish in time as not installed, saves no marker, and lets the next call run', async () => {
      const stuck = new FakeInstallOperations(makeState());
      stuck.Install = neverSettles;
      const next = new FakeInstallOperations(makeState());
      const auto = track(RunDashboardsAppAutoInstall(stuck));
      const explicit = track(RunDashboardsAppExplicitInstall(next));

      await vi.advanceTimersByTimeAsync(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS - 1);
      expect(auto.settled).toBe(false);
      expect(next.InstallCalls).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(auto.settled).toBe(true);
      await expect(auto.promise).resolves.toBe(false);
      expect(stuck.RecordCalls).toBe(0);
      expect(stuck.State).toEqual(makeState());
      await expect(explicit.promise).resolves.toBe(true);
      expect(next.InstallCalls).toBe(1);
      expect(hoisted.logError).toHaveBeenCalledTimes(1);
      expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('did not finish'));
    });

    it('retries the automatic install on a later load after an install that did not finish', async () => {
      const operations = new FakeInstallOperations(makeState());
      const install = operations.Install.bind(operations);
      operations.Install = neverSettles;
      const first = track(RunDashboardsAppAutoInstall(operations));
      await vi.advanceTimersByTimeAsync(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS);
      expect(first.settled).toBe(true);
      await expect(first.promise).resolves.toBe(false);

      operations.Install = install;
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(true);
      expect(operations.State).toEqual(makeState({ Access: 'installed_active', AutoInstallRecorded: true }));
    });

    it('resolves the explicit path false when its install does not finish in time', async () => {
      const operations = new FakeInstallOperations(makeState());
      operations.Install = neverSettles;
      const explicit = track(RunDashboardsAppExplicitInstall(operations));

      await vi.advanceTimersByTimeAsync(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS);

      expect(explicit.settled).toBe(true);
      await expect(explicit.promise).resolves.toBe(false);
      expect(operations.RecordCalls).toBe(0);
    });

    it('stops waiting for a marker save that does not finish, still reports the install, and lets the next call run', async () => {
      const operations = new FakeInstallOperations(makeState());
      operations.RecordAutoInstall = neverSettles;
      const auto = track(RunDashboardsAppAutoInstall(operations));
      const next = track(RunDashboardsAppExplicitInstall(new FakeInstallOperations(makeState({ Access: 'installed_active' }))));

      await vi.advanceTimersByTimeAsync(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS - 1);
      expect(auto.settled).toBe(false);
      expect(next.settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(auto.settled).toBe(true);
      await expect(auto.promise).resolves.toBe(true);
      await expect(next.promise).resolves.toBe(true);
    });

    it('clears the step timers when the steps finish in time', async () => {
      const operations = new FakeInstallOperations(makeState());
      await expect(RunDashboardsAppAutoInstall(operations)).resolves.toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(hoisted.logError).not.toHaveBeenCalled();
    });
  });
});
