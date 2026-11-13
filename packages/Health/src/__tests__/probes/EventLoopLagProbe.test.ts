import { describe, it, expect, vi } from 'vitest';
import { EventLoopLagProbe, EVENT_LOOP_LAG_SIGNAL_CODE } from '../../probes/EventLoopLagProbe';

describe('EventLoopLagProbe', () => {
  it('reports GREEN when measured lag is below the YELLOW threshold', async () => {
    const probe = new EventLoopLagProbe();
    vi.spyOn(probe, 'MeasureEventLoopLagMs').mockResolvedValue(2);

    const [evaluation] = await probe.Evaluate();

    expect(evaluation.Code).toBe(EVENT_LOOP_LAG_SIGNAL_CODE);
    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ObservedMetrics.EventLoopLagMs).toBe(2);
    expect(evaluation.ActivePlaybook).toBeUndefined();
  });

  it('reports YELLOW when measured lag is between the YELLOW and RED thresholds', async () => {
    const probe = new EventLoopLagProbe();
    vi.spyOn(probe, 'MeasureEventLoopLagMs').mockResolvedValue(35);

    const [evaluation] = await probe.Evaluate();

    expect(evaluation.Status).toBe('YELLOW');
    expect(evaluation.ActivePlaybook).toBeDefined();
  });

  it('reports RED when measured lag meets or exceeds the RED threshold', async () => {
    const probe = new EventLoopLagProbe();
    vi.spyOn(probe, 'MeasureEventLoopLagMs').mockResolvedValue(300);

    const [evaluation] = await probe.Evaluate();

    expect(evaluation.Status).toBe('RED');
  });

  it('actually measures a real (near-zero) lag via setImmediate when not mocked', async () => {
    const probe = new EventLoopLagProbe();

    const [evaluation] = await probe.Evaluate();

    expect(evaluation.ObservedMetrics.EventLoopLagMs).toBeTypeOf('number');
    expect(evaluation.ObservedMetrics.EventLoopLagMs as number).toBeGreaterThanOrEqual(0);
  });

  it('declares exactly one signal owned by MJ Core, in passive mode', () => {
    const probe = new EventLoopLagProbe();
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.Mode).toBe('passive');
    expect(probe.SignalDefinitions).toHaveLength(1);
    expect(probe.SignalDefinitions[0].Code).toBe(EVENT_LOOP_LAG_SIGNAL_CODE);
  });
});
