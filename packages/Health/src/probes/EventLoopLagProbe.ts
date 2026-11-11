import { RegisterClass } from '@memberjunction/global';
import { BaseHealthProbe } from '../BaseHealthProbe';
import type { AgentRemediationPlaybook, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, HealthStatus, ProbeExecutionMode } from '../types';

/** Signal code for {@link EventLoopLagProbe}. */
export const EVENT_LOOP_LAG_SIGNAL_CODE = 'MJ.CORE.RUNTIME.EVENT_LOOP_LAG';

const YELLOW_LAG_MS = 20;
const RED_LAG_MS = 250;

const YELLOW_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'Node.js event loop lag is between 20ms and 250ms. Profile active GraphQL subscriptions, large JSON payload ' +
    'serialization, or un-indexed in-memory filters running on this process. Do not restart the process for a ' +
    'single elevated sample.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 60,
  HumanEscalationCriteria: 'Escalate if lag stays above the YELLOW threshold for more than 2 consecutive minutes of passive polling.',
};

const RED_PLAYBOOK: AgentRemediationPlaybook = {
  AgentInstructions:
    'Node.js event loop lag exceeds 250ms — the process is at risk of heartbeat timeouts and dropped connections. ' +
    'Capture a heap snapshot and active CPU profile before any restart, since a restart destroys that evidence.',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 60,
  HumanEscalationCriteria: 'Escalate immediately with the heap snapshot and CPU profile attached.',
};

/**
 * Measures Node.js event loop lag: the delay between scheduling a `setImmediate` callback and it
 * actually running. Under a healthy, idle-enough loop this is near-zero; under backlog pressure
 * (synchronous CPU work, a GC pause, a blocking call) the callback is delayed by however busy the
 * loop currently is — making this a lightweight, dependency-free proxy for Issue #5510's event
 * loop starvation concern, without pulling in `perf_hooks.monitorEventLoopDelay`'s continuous
 * histogram (overkill for a point-in-time passive poll).
 */
@RegisterClass(BaseHealthProbe, EVENT_LOOP_LAG_SIGNAL_CODE)
export class EventLoopLagProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return EVENT_LOOP_LAG_SIGNAL_CODE;
  }

  public override get OwnerApp(): string {
    return '__mj';
  }

  public override get Mode(): ProbeExecutionMode {
    return 'passive';
  }

  public override get SignalDefinitions(): readonly HealthSignalDefinition[] {
    return [
      {
        Code: EVENT_LOOP_LAG_SIGNAL_CODE,
        Title: 'Node.js Event Loop Lag',
        Layer: 'core',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description: 'Measures Node.js event loop lag via a setImmediate round trip to detect backlog pressure before heartbeat timeouts occur.',
        YellowPlaybook: YELLOW_PLAYBOOK,
        RedPlaybook: RED_PLAYBOOK,
      },
    ];
  }

  public override async Evaluate(): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    const definition = this.SignalDefinitions[0];
    const lagMs = await this.measureEventLoopLagMs();
    const durationMs = Date.now() - startedAt;

    const status = this.classify(lagMs);
    const summary = `Event loop lag measured at ${lagMs.toFixed(1)}ms (thresholds: YELLOW ${YELLOW_LAG_MS}ms, RED ${RED_LAG_MS}ms).`;

    return [
      {
        Code: definition.Code,
        Title: definition.Title,
        Layer: definition.Layer,
        OwnerApp: definition.OwnerApp,
        Mode: definition.Mode,
        Status: status,
        Summary: summary,
        ObservedMetrics: { EventLoopLagMs: Number(lagMs.toFixed(2)) },
        Thresholds: { YellowLagMs: YELLOW_LAG_MS, RedLagMs: RED_LAG_MS },
        EvaluatedAt: new Date().toISOString(),
        DurationMs: durationMs,
        ActivePlaybook: status === 'GREEN' ? undefined : status === 'YELLOW' ? YELLOW_PLAYBOOK : RED_PLAYBOOK,
      },
    ];
  }

  /**
   * Resolves with the elapsed time between scheduling and running a `setImmediate` callback,
   * in milliseconds. A busy event loop delays the callback proportionally to its backlog.
   */
  protected measureEventLoopLagMs(): Promise<number> {
    return new Promise<number>((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const elapsedNs = process.hrtime.bigint() - start;
        resolve(Number(elapsedNs) / 1_000_000);
      });
    });
  }

  private classify(lagMs: number): HealthStatus {
    if (lagMs >= RED_LAG_MS) return 'RED';
    if (lagMs >= YELLOW_LAG_MS) return 'YELLOW';
    return 'GREEN';
  }
}
