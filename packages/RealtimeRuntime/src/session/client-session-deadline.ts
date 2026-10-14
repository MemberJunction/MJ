import { BehaviorSubject, Observable } from 'rxjs';

/**
 * The client's view of when its session must end — the CLIENT half of a limit the server enforces
 * authoritatively (the janitor closes a session past its stored deadline whatever a client does).
 *
 * The client keeps a copy so it can end the call gracefully before the server does, and show a
 * countdown. It follows one rule: **the server's word moves the deadline only later** when it arrives
 * as an extension (identity verification relaxes a session's limits) — a stale or hostile value can
 * therefore never cut a session short here, and nothing a client does with this class extends the
 * server's deadline.
 */
export class ClientSessionDeadline {
  private readonly subject = new BehaviorSubject<Date | null>(null);

  /** Emits the current deadline (or `null` when none is known), then every change. */
  public readonly Deadline$: Observable<Date | null> = this.subject.asObservable();

  /** The current deadline, or `null` when none is known. */
  public get Value(): Date | null {
    return this.subject.value;
  }

  /** Sets the baseline deadline outright (a host that knows the session's cap at start). `null` clears it. */
  public Set(deadline: Date | null): void {
    this.subject.next(deadline && Number.isFinite(deadline.getTime()) ? deadline : null);
  }

  /**
   * Applies a server-announced deadline: adopted when none is known or when it is LATER than the one
   * held; ignored when earlier, equal or unparseable. Returns whether the deadline changed.
   */
  public Extend(deadlineIso: string | undefined): boolean {
    if (!deadlineIso) {
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
    this.subject.next(parsed);
    return true;
  }

  /** Forgets the deadline (session ended). */
  public Clear(): void {
    this.subject.next(null);
  }
}
