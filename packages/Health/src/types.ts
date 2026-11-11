import type { DatabaseProviderBase, IMetadataProvider, UserInfo } from '@memberjunction/core';

/**
 * The three-value severity domain every MJ health signal evaluates to. There is no finer grain —
 * an SRE agent's playbook branches on exactly these three states.
 */
export type HealthStatus = 'GREEN' | 'YELLOW' | 'RED';

/**
 * The architectural layer a signal belongs to, matching the three-layer verification model:
 * MJ Core platform signals, installed Open App signals, bridged server-extension signals,
 * connector-owned signals, and active live-test probes.
 */
export type HealthLayer = 'core' | 'open-app' | 'server-extension' | 'connector' | 'live-test';

/**
 * Whether a probe runs on every fast passive poll, or only as an active, typically
 * transactional, live functional verification (e.g. post-install / post-upgrade gates).
 */
export type ProbeExecutionMode = 'passive' | 'live-test';

/**
 * Deterministic remediation instructions for an autonomous SRE agent, paired with an explicit
 * human-escalation boundary. Every signal carries one of these per non-GREEN state so an agent
 * never has to improvise what "degraded" or "failing" means for a given subsystem.
 */
export interface AgentRemediationPlaybook {
  /**
   * Clear, step-by-step instructions written specifically for an AI SRE agent: what context to
   * inspect, what safe remediation to attempt, and how to verify recovery.
   */
  AgentInstructions: string;

  /**
   * Explicit allow-list of MJ Action names, CLI commands, or MJC fleet operations the agent is
   * authorized to execute autonomously when this state triggers. An empty list means the agent
   * may only observe and report — any mutation requires human escalation.
   */
  AllowedAutonomousActions: string[];

  /** Maximum number of autonomous remediation attempts before mandatory human escalation. */
  MaxAutonomousAttempts: number;

  /** Cooldown window in seconds between autonomous remediation attempts. */
  RetryCooldownSeconds: number;

  /**
   * Deterministic rule stating when the agent MUST stop and escalate to a human operator, and
   * what diagnostic artifacts to attach to the escalation ticket/alert.
   */
  HumanEscalationCriteria: string;

  /** Recommended runbook steps for the human engineer who receives the escalation. */
  HumanOperatorRunbook?: string;
}

/**
 * Declarative metadata for a known signal in the MJ Core or Open App signal catalog. Every probe
 * declares one of these per signal it can emit — the signal code, its owning layer/app, and the
 * remediation playbooks for its two non-GREEN states are fixed at registration time, never
 * improvised per-evaluation.
 */
export interface HealthSignalDefinition {
  /**
   * Globally unique, dot-namespaced signal code, e.g. `'MJ.CORE.DB.CONNECTIVITY_AND_POOL'` or
   * `'BIZAPPS.COLLAB.ACCESS_TVF_PARITY'`.
   */
  Code: string;

  /** Human-readable title for dashboards and alerts. */
  Title: string;

  /** Architectural layer this signal belongs to. */
  Layer: HealthLayer;

  /** Owning Open App name (e.g. `'mj-bizapps-collaboration'`), or `'__mj'` for MJ Core. */
  OwnerApp: string;

  /** Whether this signal is evaluated during fast passive polling or active live testing. */
  Mode: ProbeExecutionMode;

  /** Description of what invariant or subsystem this signal verifies. */
  Description: string;

  /** Deterministic playbook for an autonomous SRE agent when the signal is `YELLOW`. */
  YellowPlaybook: AgentRemediationPlaybook;

  /** Deterministic playbook for an autonomous SRE agent when the signal is `RED`. */
  RedPlaybook: AgentRemediationPlaybook;
}

/**
 * Runtime result of evaluating a single registered signal. Produced by `MJHealthEngine.Evaluate()`
 * for every signal declared by every registered probe.
 */
export interface HealthSignalEvaluation {
  /** Signal code from the registered catalog. */
  Code: string;
  Title: string;
  Layer: HealthLayer;
  OwnerApp: string;
  Mode: ProbeExecutionMode;

  /** Current evaluated state. */
  Status: HealthStatus;

  /** Concise one-sentence summary of the current state. */
  Summary: string;

  /** Structured metrics measured during the check (latencies, counts, versions, watermarks). */
  ObservedMetrics: Record<string, string | number | boolean | null>;

  /** Thresholds against which `ObservedMetrics` were compared. */
  Thresholds?: Record<string, string | number | boolean>;

  /** ISO-8601 timestamp when the probe executed. */
  EvaluatedAt: string;

  /** Execution duration of this probe in milliseconds. */
  DurationMs: number;

  /** Populated automatically from the signal definition when `Status` is `YELLOW` or `RED`. */
  ActivePlaybook?: AgentRemediationPlaybook;

  /** Error stack or diagnostic snippet, populated when an exception occurred during evaluation. */
  DiagnosticError?: string;
}

/** Rollup health report across every signal evaluated in one `MJHealthEngine.Evaluate()` call. */
export interface InstanceHealthReport {
  /** Overall rollup status across all evaluated signals: `RED` if any `RED`, else `YELLOW` if any `YELLOW`, else `GREEN`. */
  OverallStatus: HealthStatus;
  MJVersion: string;
  DatabasePlatform: 'sqlserver' | 'postgresql';
  EvaluatedAt: string;
  TotalDurationMs: number;
  Mode: ProbeExecutionMode;
  SummaryCounts: {
    Green: number;
    Yellow: number;
    Red: number;
  };
  Signals: HealthSignalEvaluation[];
}

/** Context handed to every `BaseHealthProbe.Evaluate()` call. */
export interface HealthProbeContext {
  DatabaseProvider: DatabaseProviderBase;
  MetadataProvider: IMetadataProvider;
  SystemUser: UserInfo;
  Mode: ProbeExecutionMode;
  /** Target Open App filter, when the caller is checking a specific app. */
  AppFilter?: string;
  /** Timeout budget in milliseconds for this probe. */
  TimeoutMs: number;
}

/** Options accepted by `MJHealthEngine.Evaluate()`. */
export interface HealthEvaluateOptions {
  DatabaseProvider: DatabaseProviderBase;
  MetadataProvider: IMetadataProvider;
  SystemUser: UserInfo;
  /** Which execution mode to run: `'passive'` (default) or `'live-test'`. */
  Mode?: ProbeExecutionMode;
  /** Restrict evaluation to probes owned by this Open App (or `'__mj'` for MJ Core). */
  AppFilter?: string;
  /** Per-probe timeout budget in milliseconds. Defaults to 15000. */
  TimeoutMs?: number;
  /** MJ product version to stamp onto the report. Defaults to `'unknown'`. */
  MJVersion?: string;
  /** Database platform to stamp onto the report. Defaults to `'sqlserver'`. */
  DatabasePlatform?: 'sqlserver' | 'postgresql';
}
