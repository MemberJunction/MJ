import { describe, expect, it } from 'vitest';
import {
  CalculateOperationsMetrics,
  BuildTelephonyOperationsAgentContext,
  FormatCurrency,
  FormatDuration,
  ValidateChannelParam,
  ValidateTimeRangeParam,
  type InteractionRecordLike,
  type InteractionEventRecordLike,
  type PhoneNumberRecordLike,
} from '../TelephonyOperations/telephony-operations-agent-context';

describe('telephony-operations-agent-context', () => {
  describe('FormatDuration', () => {
    it('formats seconds and minutes correctly', () => {
      expect(FormatDuration(0)).toBe('0s');
      expect(FormatDuration(45)).toBe('45s');
      expect(FormatDuration(60)).toBe('1m 00s');
      expect(FormatDuration(185)).toBe('3m 05s');
      expect(FormatDuration(-10)).toBe('0s');
    });
  });

  describe('FormatCurrency', () => {
    it('formats currency numbers into USD', () => {
      expect(FormatCurrency(0)).toBe('$0.00');
      expect(FormatCurrency(12.345)).toBe('$12.35');
      expect(FormatCurrency(1500)).toBe('$1,500.00');
    });
  });

  describe('CalculateOperationsMetrics', () => {
    const fixedNow = new Date('2026-10-03T18:00:00.000Z');

    const sampleInteractions: InteractionRecordLike[] = [
      {
        ID: 'int-1',
        Channel: 'Phone',
        Direction: 'Inbound',
        Status: 'Ended',
        AgentSessionID: 'sess-1',
        RoomName: null,
        PhoneNumberID: 'pn-1',
        RemoteAddress: '+15551112222',
        StartedAt: '2026-10-03T17:00:00.000Z',
        AnsweredAt: '2026-10-03T17:00:10.000Z',
        EndedAt: '2026-10-03T17:05:10.000Z',
        EndReason: 'CallerHangup',
        RecordingEnabled: true,
        CostEstimate: 0.15,
      },
      {
        ID: 'int-2',
        Channel: 'Phone',
        Direction: 'Inbound',
        Status: 'Abandoned',
        AgentSessionID: null,
        RoomName: null,
        PhoneNumberID: 'pn-1',
        RemoteAddress: '+15553334444',
        StartedAt: '2026-10-03T17:10:00.000Z',
        AnsweredAt: null,
        EndedAt: '2026-10-03T17:10:20.000Z',
        EndReason: 'CallerHangup',
        RecordingEnabled: false,
        CostEstimate: 0.02,
      },
      {
        ID: 'int-3',
        Channel: 'Web',
        Direction: 'Inbound',
        Status: 'Active',
        AgentSessionID: 'sess-2',
        RoomName: 'room-web-1',
        PhoneNumberID: null,
        RemoteAddress: 'session-guest-99',
        StartedAt: '2026-10-03T17:55:00.000Z',
        AnsweredAt: '2026-10-03T17:55:05.000Z',
        EndedAt: null,
        EndReason: null,
        RecordingEnabled: true,
        CostEstimate: 0.08,
      },
      {
        ID: 'int-4',
        Channel: 'Meeting',
        Direction: 'Internal',
        Status: 'Ended',
        AgentSessionID: null,
        RoomName: 'mj-mtg-sample',
        PhoneNumberID: null,
        RemoteAddress: 'host-user-1',
        StartedAt: '2026-10-03T16:00:00.000Z',
        AnsweredAt: '2026-10-03T16:00:00.000Z',
        EndedAt: '2026-10-03T16:30:00.000Z',
        EndReason: 'MeetingEnded',
        RecordingEnabled: true,
        CostEstimate: 1.25,
      },
    ];

    const sampleEvents: InteractionEventRecordLike[] = [
      {
        ID: 'evt-1',
        InteractionID: 'int-1',
        EventType: 'Transferred',
        OccurredAt: '2026-10-03T17:02:00.000Z',
        ActorUserID: 'u-1',
        ActorAgentID: null,
        Details: '{"Target":"Tier 2 Support"}',
      },
      {
        ID: 'evt-2',
        InteractionID: 'int-1',
        EventType: 'Escalated',
        OccurredAt: '2026-10-03T17:03:00.000Z',
        ActorUserID: null,
        ActorAgentID: 'agent-1',
        Details: '{"Reason":"Human assistance requested"}',
      },
    ];

    const samplePhoneNumbers: PhoneNumberRecordLike[] = [
      {
        ID: 'pn-1',
        PhoneNumber: '+18005550199',
        FriendlyName: 'Main Support Line',
      },
    ];

    it('handles empty interaction set gracefully', () => {
      const metrics = CalculateOperationsMetrics([], [], [], fixedNow);
      expect(metrics.TotalVolume).toBe(0);
      expect(metrics.LiveCallsCount).toBe(0);
      expect(metrics.AnswerRate).toBe(0);
      expect(metrics.AbandonmentRate).toBe(0);
      expect(metrics.AverageHandleTimeSeconds).toBe(0);
      expect(metrics.TotalCost).toBe(0);
      expect(metrics.LiveInteractions.length).toBe(0);
    });

    it('calculates totals, rates, and aggregations correctly', () => {
      const metrics = CalculateOperationsMetrics(sampleInteractions, sampleEvents, samplePhoneNumbers, fixedNow);

      expect(metrics.TotalVolume).toBe(4);
      expect(metrics.LiveCallsCount).toBe(1);
      expect(metrics.LiveInteractions[0].ID).toBe('int-3');
      expect(metrics.LiveInteractions[0].ElapsedSeconds).toBe(300); // 5 mins from 17:55 to 18:00
      expect(metrics.LiveInteractions[0].ElapsedLabel).toBe('5m 00s');

      // Answered: int-1 (answered), int-3 (active), int-4 (ended) = 3
      expect(metrics.AnsweredCount).toBe(3);
      expect(metrics.AnswerRate).toBe(75);

      // Abandoned: int-2 = 1
      expect(metrics.AbandonedCount).toBe(1);
      expect(metrics.AbandonmentRate).toBe(25);

      // Transfers & Escalations
      expect(metrics.TransferCount).toBe(1);
      expect(metrics.EscalationCount).toBe(1);

      // Handle time:
      // int-1: 17:00:10 to 17:05:10 = 300s
      // int-2: 17:10:00 to 17:10:20 = 20s
      // int-4: 16:00:00 to 16:30:00 = 1800s
      // avg = (300 + 20 + 1800) / 3 = 706.66s
      expect(metrics.AverageHandleTimeSeconds).toBeCloseTo(706.67, 1);

      // Total cost: 0.15 + 0.02 + 0.08 + 1.25 = 1.50
      expect(metrics.TotalCost).toBeCloseTo(1.5, 2);
      expect(metrics.TotalCostFormatted).toBe('$1.50');

      // Breakdown by channel
      const phoneMetric = metrics.VolumeByChannel.find((c) => c.Channel === 'Phone');
      expect(phoneMetric?.Count).toBe(2);
      expect(phoneMetric?.Percentage).toBe(50);

      // Cost by number: pn-1 friendly name mapped
      const pn1 = metrics.CostByNumber.find((n) => n.PhoneNumber === 'Main Support Line');
      expect(pn1).toBeDefined();
      expect(pn1?.Cost).toBeCloseTo(0.17, 2);
      expect(pn1?.Count).toBe(2);
    });

    it('builds agent context snapshot', () => {
      const metrics = CalculateOperationsMetrics(sampleInteractions, sampleEvents, samplePhoneNumbers, fixedNow);
      const ctx = BuildTelephonyOperationsAgentContext(metrics, '7d', 'all');

      expect(ctx.Surface).toBe('TelephonyOperationsDashboard');
      expect(ctx.TotalVolume).toBe(4);
      expect(ctx.LiveCallsCount).toBe(1);
      expect(ctx.AnswerRatePercent).toBe(75);
      expect(ctx.AbandonmentRatePercent).toBe(25);
      expect(ctx.TransferCount).toBe(1);
      expect(ctx.EscalationCount).toBe(1);
    });

    it('validates tool parameters', () => {
      expect(ValidateTimeRangeParam('7d')).toEqual({ ok: true, value: '7d' });
      expect(ValidateTimeRangeParam('invalid').ok).toBe(false);

      expect(ValidateChannelParam('Phone')).toEqual({ ok: true, value: 'Phone' });
      expect(ValidateChannelParam('all')).toEqual({ ok: true, value: 'all' });
      expect(ValidateChannelParam('Unknown').ok).toBe(false);
    });
  });
});
