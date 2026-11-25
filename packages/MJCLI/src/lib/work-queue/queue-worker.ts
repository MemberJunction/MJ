import { HOST_SHUT_DOWN_REASON } from '@memberjunction/work-queue-engine';
import type { WorkQueueHostConfig, WorkQueueHostHealth } from '@memberjunction/work-queue-engine';

const LONG_RUNNING_SWEEPER_INTERVAL_MS = 60000;
const LONG_RUNNING_RECONCILE_INTERVAL_MS = 30000;

/** The `mj queue work` flags that shape the host; oclif flag names, so not PascalCase. */
interface WorkerConfigFlags {
  subscription: string;
  concurrency: number;
  once: boolean;
  'shutdown-drain-ms': number;
  'sweeper-interval-ms'?: number;
  'reconcile-interval-ms'?: number;
}

/**
 * A one-shot job neither sweeps nor re-plans: it is short-lived and some other instance owns both. A long-running worker
 * may be the only host against the database, so it sweeps and re-plans on the same defaults as MJAPI. An explicit
 * interval wins in either mode, and 0 disables.
 */
export function BuildWorkerHostConfig(flags: WorkerConfigFlags, pid: number): WorkQueueHostConfig {
  return {
    InstanceID: `mj-queue-work-${pid}`,
    Subscriptions: [{ Name: flags.subscription, Concurrency: flags.concurrency }],
    IdlePollMinMs: 250,
    IdlePollMaxMs: 2000,
    ShutdownDrainMs: flags['shutdown-drain-ms'],
    SweeperIntervalMs: flags['sweeper-interval-ms'] ?? (flags.once ? 0 : LONG_RUNNING_SWEEPER_INTERVAL_MS),
    ReconcileIntervalMs: flags['reconcile-interval-ms'] ?? (flags.once ? 0 : LONG_RUNNING_RECONCILE_INTERVAL_MS),
  };
}

export interface StoppableWorkHost {
  Shutdown(): Promise<void>;
}

/** The slice of `process` RunUntilStopped needs; an EventEmitter satisfies it in tests. */
interface SignalSource {
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

/**
 * Why this worker must exit non-zero, or null (03 §11). A scheduler reads exit 0 as "the job did what it could", so a
 * job that CANNOT run — unknown subscription, handler missing from the image, unsupported transport — has to fail
 * loudly instead of churning "successful" jobs. A subscription an operator PAUSED is not a failure: pausing is
 * deliberate, and the scaler query already stops spawning jobs for it.
 */
export function WorkerStartFailure(health: WorkQueueHostHealth, requested: string): string | null {
  // After Shutdown() a subscription that WAS running reports Paused / HOST_SHUT_DOWN_REASON — that one ran.
  if (health.Subscriptions.some(s => s.State === 'Running' || s.Reason === HOST_SHUT_DOWN_REASON)) {
    return null;
  }
  if (health.Subscriptions.length === 0) {
    return `No subscription is running for '${requested}': no MJWorker subscriptions matched`;
  }
  const broken = health.Subscriptions.filter(s => s.State !== 'Paused');
  if (broken.length === 0) {
    return null;
  }
  return `No subscription is running for '${requested}': ${broken.map(s => `${s.Name} is ${s.State}${s.Reason ? ` (${s.Reason})` : ''}`).join('; ')}`;
}

/**
 * Waits for `work` to finish, or for SIGINT/SIGTERM — whichever comes first. On a signal it awaits host.Shutdown()
 * (the shared drain promise) before resolving, so the caller never closes the connection pool under in-flight
 * handlers. Listeners are always removed.
 */
export async function RunUntilStopped(host: StoppableWorkHost, work: Promise<unknown>, signals: SignalSource = process): Promise<'Signal' | 'Finished'> {
  let onSignal: () => void = () => undefined;
  const signalled = new Promise<'Signal'>(resolve => {
    onSignal = () => resolve('Signal');
  });
  signals.once('SIGINT', onSignal);
  signals.once('SIGTERM', onSignal);
  try {
    const outcome = await Promise.race([signalled, work.then(() => 'Finished' as const)]);
    if (outcome === 'Signal') {
      await host.Shutdown();
      // RunOnce resolves 'Shutdown' in the microtasks right after the shared drain promise, so its result is captured
      // by the next macrotask. The long-running mode passes a promise that never settles, so the wait is bounded:
      // awaiting it outright would hang the worker on SIGTERM.
      await Promise.race([work.catch(() => undefined), new Promise<void>(resolve => setImmediate(resolve))]);
    }
    return outcome;
  } finally {
    signals.off('SIGINT', onSignal);
    signals.off('SIGTERM', onSignal);
  }
}
