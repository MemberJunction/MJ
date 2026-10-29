import { BehaviorSubject, Observable, Subject } from 'rxjs';

/**
 * Longest single `setTimeout` we arm. Browsers store the delay as a signed 32-bit integer (max
 * 2_147_483_647 ms, about 24.8 days); a larger delay fires immediately. A far deadline is therefore
 * reached in hops of at most this many ms.
 */
export const MAX_TIMER_MS = 2_147_000_000;

/** What happens as the deadline approaches. Both fields are optional; see the defaults on {@link ClientSessionDeadline.Options}. */
export interface SessionDeadlineOptions {
  /** Whether the host intends the session to end when the deadline is reached. The class never ends a session itself; it only carries the flag for the runtime. Default `true`. */
  autoEnd?: boolean;
  /** Offsets, in ms before the deadline, at which `Warning$` fires once each. Default none. */
  warnBeforeMs?: readonly number[];
}

/**
 * The client's view of when its session must end — the CLIENT half of a limit the server enforces
 * authoritatively (the janitor closes a session past its stored deadline whatever a client does).
 *
 * It holds the deadline, runs the alarm for it (`Warning$` ahead of the deadline, `Reached$` at it)
 * and follows one rule: **the server's word moves the deadline only later** when it arrives as an
 * extension (identity verification relaxes a session's limits). A stale or hostile value can never
 * pull the deadline earlier, and nothing a client does with this class extends the server's deadline.
 * "Never cut a session short here" describes the VALUE this class holds, not the runtime's behaviour:
 * when `Reached$` fires the runtime may end the session, because that is the deadline the host asked for.
 *
 * Time counts down by elapsed time measured by the timers from the moment the deadline was set or
 * extended, never by comparing the wall clock to the deadline at fire time, so a laptop clock that
 * is behind cannot fire late and let the server cut first. The class never ends a session: `Reached$`
 * emits synchronously inside the timer callback and the runtime decides what follows.
 */
export class ClientSessionDeadline {
  /** Shared by every instance until its first Set, so frozen (array too): a caller mutating `Options` cannot change another instance's defaults. */
  private static readonly DEFAULT_OPTIONS: Readonly<Required<SessionDeadlineOptions>> = Object.freeze({ autoEnd: true, warnBeforeMs: Object.freeze([]) });

  private readonly subject = new BehaviorSubject<Date | null>(null);
  private readonly warningSubject = new Subject<{ deadline: Date; remainingMs: number }>();
  private readonly reachedSubject = new Subject<{ deadline: Date }>();
  private options: Readonly<Required<SessionDeadlineOptions>> = ClientSessionDeadline.DEFAULT_OPTIONS;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;

  /** @param now Clock read once per Set/Extend to anchor the countdown; injectable for tests. */
  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Emits the current deadline (or `null` when none is known), then every change. */
  public readonly Deadline$: Observable<Date | null> = this.subject.asObservable();

  /** Emits once per configured warning offset as its moment arrives; `remainingMs` is that offset. */
  public readonly Warning$: Observable<{ deadline: Date; remainingMs: number }> = this.warningSubject.asObservable();

  /** Emits once when the deadline is reached. */
  public readonly Reached$: Observable<{ deadline: Date }> = this.reachedSubject.asObservable();

  /** The current deadline, or `null` when none is known. */
  public get Value(): Date | null {
    return this.subject.value;
  }

  /** The options of the current arming (defaults `{ autoEnd: true, warnBeforeMs: [] }`). */
  public get Options(): Readonly<Required<SessionDeadlineOptions>> {
    return this.options;
  }

  /** Sets the baseline deadline outright (a host that knows the session's cap at start) and arms the alarm. `null` clears it. A second call replaces the options. */
  public Set(deadline: Date | null, options?: SessionDeadlineOptions): void {
    if (this.disposed) {
      return;
    }
    this.cancelTimers();
    const valid = deadline && Number.isFinite(deadline.getTime()) ? deadline : null;
    this.options = {
      autoEnd: options?.autoEnd ?? true,
      warnBeforeMs: ClientSessionDeadline.normalizeOffsets(options?.warnBeforeMs),
    };
    this.subject.next(valid);
    if (valid) {
      this.arm(valid);
    }
  }

  /**
   * Applies a server-announced deadline: adopted when none is known or when it is LATER than the one
   * held; ignored when earlier, equal or unparseable. Keeps the options and re-arms every timer.
   * Returns whether the deadline changed.
   */
  public Extend(deadlineIso: string | undefined): boolean {
    if (this.disposed || !deadlineIso) {
      return false;
    }
    const parsed = new Date(deadlineIso);
    if (!Number.isFinite(parsed.getTime())) {
      return false;
    }
    const current = this.subject.value;
    if (current !== null && parsed.getTime() <= current.getTime()) {
      return false;
    }
    this.cancelTimers();
    this.subject.next(parsed);
    this.arm(parsed);
    return true;
  }

  /** Forgets the deadline (session ended) and cancels every timer. */
  public Clear(): void {
    if (this.disposed) {
      return;
    }
    this.cancelTimers();
    this.subject.next(null);
  }

  /** Cancels every timer and completes the streams; later calls are no-ops. */
  public Dispose(): void {
    if (this.disposed) {
      return;
    }
    this.cancelTimers();
    this.disposed = true;
    this.subject.complete();
    this.warningSubject.complete();
    this.reachedSubject.complete();
  }

  private static normalizeOffsets(offsets: readonly number[] | undefined): readonly number[] {
    const valid = (offsets ?? []).filter((ms) => Number.isFinite(ms) && ms > 0);
    return [...new Set(valid)].sort((a, b) => b - a);
  }

  /** Anchors the countdown now and schedules the warnings and the deadline, all measured by elapsed time. */
  private arm(deadline: Date): void {
    const remainingAtAnchorMs = deadline.getTime() - this.now();
    for (const offset of this.options.warnBeforeMs) {
      const fireAfterMs = remainingAtAnchorMs - offset;
      // Moment already passed at anchor time: skip rather than fire a stale warning.
      if (fireAfterMs >= 0) {
        this.schedule(fireAfterMs, () => this.warningSubject.next({ deadline, remainingMs: offset }));
      }
    }
    // A past deadline (negative remaining) fires on the next tick, never synchronously inside Set.
    this.schedule(Math.max(0, remainingAtAnchorMs), () => this.reachedSubject.next({ deadline }));
  }

  /** Runs `fire` after `delayMs` of elapsed time, re-arming in MAX_TIMER_MS hops (each hop is one finite timer, so the chain ends). */
  private schedule(delayMs: number, fire: () => void): void {
    const hopMs = Math.min(delayMs, MAX_TIMER_MS);
    const handle = setTimeout(() => {
      this.timers.delete(handle);
      const leftMs = delayMs - hopMs;
      if (leftMs > 0) {
        this.schedule(leftMs, fire);
      } else {
        fire();
      }
    }, hopMs);
    this.timers.add(handle);
  }

  private cancelTimers(): void {
    for (const handle of this.timers) {
      clearTimeout(handle);
    }
    this.timers.clear();
  }
}
