import type { DatabaseProviderBase } from '@memberjunction/core';
import type { AgentRemediationPlaybook, HealthProbeContext } from './types';

const DEFAULT_YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'A synthetic CRUD/permission verification succeeded but exceeded its expected latency budget, or ' +
    'returned a non-fatal warning. Record this as a performance data point; no autonomous remediation ' +
    'is warranted from a single sample.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 300,
  HumanEscalationCriteria: 'Escalate only if this verifier reports YELLOW on three or more consecutive runs.',
};

const DEFAULT_RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'A synthetic CRUD/permission verification failed to execute or did not roll back cleanly. Block any ' +
    'pending post-install/post-upgrade promotion for this Open App and escalate immediately with the full error.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 300,
  HumanEscalationCriteria: 'Escalate immediately — this verifier gates install/upgrade promotion for its Open App.',
};

/**
 * Result of a single {@link BaseLiveCrudVerifier.Verify} call.
 */
export interface LiveCrudVerifierResult {
  /** Whether the verifier's synthetic round trip succeeded. */
  Success: boolean;

  /** One-sentence human-readable outcome, used as the signal's `Summary` on success. */
  Summary: string;

  /** Structured metrics captured during verification (row counts, latencies, RLS outcomes). */
  ObservedMetrics?: Record<string, string | number | boolean | null>;

  /** Populated when `Success` is `false`: the diagnostic detail for the failure. */
  DiagnosticError?: string;
}

/**
 * Extension point an Open App (or MJ Core subsystem) implements to plug its own synthetic
 * create/read/update/delete and permission-function verification into {@link LiveEntityCrudProbe}
 * — e.g. `BIZAPPS.COLLAB.LIVE.ACCESS_REACH_PROBE`, which creates a synthetic `Space`, assigns a
 * `SpaceMember`, and executes `fnCollaborationAccess` to confirm reachability.
 *
 * Register a subclass with `@RegisterClass(BaseLiveCrudVerifier, '<VerifierKey>')`. `LiveEntityCrudProbe`
 * discovers every registration via the ClassFactory (mirroring how `MJHealthEngine` discovers
 * `BaseHealthProbe` subclasses) and runs each one inside its own
 * {@link BaseHealthProbe.WithRolledBackTransaction} scope — `Verify` never needs to manage
 * transactional isolation itself.
 */
export abstract class BaseLiveCrudVerifier {
  /** Unique verifier key matching the `@RegisterClass` key, used to derive this verifier's signal code. */
  public abstract get VerifierKey(): string;

  /** Owning Open App name (e.g. `'mj-bizapps-collaboration'`), or `'__mj'` for MJ Core. */
  public abstract get OwnerApp(): string;

  /** Human-readable title for this verifier's signal, shown on dashboards and alerts. */
  public abstract get Title(): string;

  /** Remediation playbook when this verifier's signal is `YELLOW`. Override for app-specific guidance. */
  public get YellowPlaybook(): AgentRemediationPlaybook {
    return DEFAULT_YELLOW_PLAYBOOK;
  }

  /** Remediation playbook when this verifier's signal is `RED`. Override for app-specific guidance. */
  public get RedPlaybook(): AgentRemediationPlaybook {
    return DEFAULT_RED_PLAYBOOK;
  }

  /**
   * Runs the synthetic CRUD/permission round trip. Called by `LiveEntityCrudProbe` from inside an
   * already-open, unconditionally-rolled-back transaction scope on `txProvider`.
   *
   * **Important Transaction Isolation Boundary:**
   * Unconditional rollback holds strictly for direct database writes executed through `txProvider`
   * within this async scope. It does NOT undo out-of-band side effects produced by server entity
   * subclasses, hooks, or external handlers (such as sending emails, computing embeddings, enqueuing
   * background jobs, calling external APIs, or broadcasting WebSocket / pub-sub invalidations).
   * Likewise, writes made through another provider instance (e.g. an ambient per-request provider)
   * commit independently.
   *
   * Authors of `BaseLiveCrudVerifier` implementations must design synthetic records to exercise
   * safe, side-effect-free database paths, and must perform all writes exclusively through `txProvider`.
   *
   * Implementations should let unexpected exceptions propagate (do not catch-and-swallow); the
   * probe applies the same uniform RED-with-diagnostic fallback it uses for a thrown `Evaluate()`.
   */
  public abstract Verify(context: HealthProbeContext, txProvider: DatabaseProviderBase): Promise<LiveCrudVerifierResult>;
}
