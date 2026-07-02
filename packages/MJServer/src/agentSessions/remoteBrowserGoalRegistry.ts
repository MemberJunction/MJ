import { BaseSingleton } from '@memberjunction/global';

/**
 * Terminal/structural outcome of a remote-browser goal run — the fields the client needs to render
 * the result, decoupled from the GraphQL `RemoteBrowserGoalResultType` (avoids a resolver↔registry
 * import cycle) and from the engine's `RemoteBrowserGoalResult` (whose `Strategy` is a string union).
 */
export interface RemoteBrowserGoalOutcome {
  Success: boolean;
  Strategy?: string;
  CurrentUrl?: string;
  Status?: string;
  StepCount?: number;
  Detail?: string;
}

type GoalRunStatus = 'Running' | 'Complete';

/** One tracked goal run: its lifecycle status plus the terminal outcome once it finishes. */
export interface GoalRunRecord {
  GoalRunID: string;
  /** Lowercased `AIAgentSession` id the goal runs against (one in-flight goal per session). */
  AgentSessionID: string;
  Status: GoalRunStatus;
  Outcome?: RemoteBrowserGoalOutcome;
  StartedAt: number;
  CompletedAt?: number;
}

/** Default time a COMPLETED record is retained so a slow poller can still read it (then swept). */
const COMPLETED_TTL_MS = 5 * 60 * 1000;
/** Safety cap: a record that never completes (e.g. a crashed loop) is swept after this long. */
const RUNNING_MAX_MS = 30 * 60 * 1000;

/**
 * Process-local registry of in-flight + recently-completed remote-browser GOAL runs.
 *
 * ## Why this exists
 * A goal-driven browser run (computer-use loop) can take many minutes. Running it inside a single
 * synchronous GraphQL mutation means the client holds one long-lived HTTP request open for the whole
 * loop — fragile against browser fetch timeouts, proxy/ngrok idle limits, and session-janitor churn.
 * Observed symptom: the loop completes successfully server-side but the client's request has already
 * died, so the agent gets "no response from the server" and never learns the outcome.
 *
 * The fix is async: the start mutation kicks the goal off and registers it here (status `Running`),
 * returning a `GoalRunID` immediately; the client then POLLS a short query that reads this registry
 * until the run is `Complete`. Every request stays short, so no transport boundary times out.
 *
 * Keyed by `AIAgentSession` id (at most one in-flight goal per session, mirroring the engine's
 * per-session abort registry). Process-local is correct: the browser session — and thus the goal —
 * is pinned to the MJAPI instance hosting its CDP connection, the same instance the client's
 * session-scoped mutations already target.
 */
export class RemoteBrowserGoalRegistry extends BaseSingleton<RemoteBrowserGoalRegistry> {
  private runs = new Map<string, GoalRunRecord>();

  protected constructor() {
    super();
  }

  public static get Instance(): RemoteBrowserGoalRegistry {
    return super.getInstance<RemoteBrowserGoalRegistry>();
  }

  private key(agentSessionID: string): string {
    return (agentSessionID ?? '').toLowerCase();
  }

  /** Registers a newly-started goal as `Running`, replacing any prior record for the session. */
  public Begin(agentSessionID: string, goalRunID: string): void {
    this.sweep();
    this.runs.set(this.key(agentSessionID), {
      GoalRunID: goalRunID,
      AgentSessionID: this.key(agentSessionID),
      Status: 'Running',
      StartedAt: Date.now(),
    });
  }

  /**
   * Marks a goal run `Complete` with its terminal outcome. No-op when the session's current record is
   * for a DIFFERENT `goalRunID` (a newer goal superseded it) — the stale completion is dropped.
   */
  public Complete(agentSessionID: string, goalRunID: string, outcome: RemoteBrowserGoalOutcome): void {
    const rec = this.runs.get(this.key(agentSessionID));
    if (!rec || rec.GoalRunID !== goalRunID) {
      return;
    }
    rec.Status = 'Complete';
    rec.Outcome = outcome;
    rec.CompletedAt = Date.now();
  }

  /**
   * Returns the tracked record for a session, or `undefined` when none exists or `goalRunID` is
   * supplied and doesn't match the current run (so a poll for an expired/superseded id reads nothing).
   */
  public Get(agentSessionID: string, goalRunID?: string): GoalRunRecord | undefined {
    this.sweep();
    const rec = this.runs.get(this.key(agentSessionID));
    if (!rec) {
      return undefined;
    }
    if (goalRunID && rec.GoalRunID !== goalRunID) {
      return undefined;
    }
    return rec;
  }

  /** Drops completed records past their TTL and never-completing records past the safety cap. */
  private sweep(): void {
    const now = Date.now();
    for (const [k, rec] of this.runs) {
      const expired =
        (rec.Status === 'Complete' && rec.CompletedAt != null && now - rec.CompletedAt > COMPLETED_TTL_MS) ||
        now - rec.StartedAt > RUNNING_MAX_MS;
      if (expired) {
        this.runs.delete(k);
      }
    }
  }
}
