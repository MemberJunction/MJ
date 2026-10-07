import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceData } from '@memberjunction/core-entities';
import type {
  InteractionRecordLike,
  InteractionEventRecordLike,
  PhoneNumberRecordLike,
} from '../TelephonyOperations/telephony-operations-agent-context';

const navServiceMock = {
  SetAgentContext: vi.fn(),
  SetAgentClientTools: vi.fn(),
};

const cdrMock = {
  markForCheck: vi.fn(),
  detectChanges: vi.fn(),
  detach: vi.fn(),
  checkNoChanges: vi.fn(),
  reattach: vi.fn(),
};

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return {
    ...actual,
    inject: (token: { name?: string }) => {
      if (token?.name === 'ChangeDetectorRef') return cdrMock;
      return navServiceMock;
    },
  };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: () => (target: Function) => target,
  };
});

import { TelephonyOperationsDashboardComponent } from '../TelephonyOperations/telephony-operations-dashboard.component';

describe('TelephonyOperationsDashboardComponent', () => {
  it('initializes with default state and display name', async () => {
    const comp = new TelephonyOperationsDashboardComponent();
    Object.assign(comp, { cdr: cdrMock });

    const name = await comp.GetResourceDisplayName({} as unknown as ResourceData);
    expect(name).toBe('Telephony & Interaction Operations');

    const icon = await comp.GetResourceIconClass({} as unknown as ResourceData);
    expect(icon).toBe('fa-solid fa-chart-line');

    expect(comp.SelectedTimeRange).toBe('7d');
    expect(comp.SelectedChannelFilter).toBe('all');
  });

  it('filters live and recent interactions by search query', () => {
    const comp = new TelephonyOperationsDashboardComponent();
    Object.assign(comp, { cdr: cdrMock });

    const sampleInteractions: InteractionRecordLike[] = [
      {
        ID: 'int-1',
        Channel: 'Phone',
        Direction: 'Inbound',
        Status: 'Active',
        AgentSessionID: null,
        RoomName: null,
        PhoneNumberID: null,
        RemoteAddress: '+18005551234',
        StartedAt: new Date(),
        AnsweredAt: new Date(),
        EndedAt: null,
        EndReason: null,
        RecordingEnabled: false,
        CostEstimate: 0.1,
      },
      {
        ID: 'int-2',
        Channel: 'Web',
        Direction: 'Inbound',
        Status: 'Ended',
        AgentSessionID: null,
        RoomName: 'room-1',
        PhoneNumberID: null,
        RemoteAddress: 'guest-session-42',
        StartedAt: new Date(),
        AnsweredAt: new Date(),
        EndedAt: new Date(),
        EndReason: 'NormalEnd',
        RecordingEnabled: true,
        CostEstimate: 0.5,
      },
    ];

    comp.RawInteractions = sampleInteractions;
    comp.RawEvents = [];
    comp.RawPhoneNumbers = [];

    // Trigger calculation
    (comp as unknown as { recalculateMetrics: () => void }).recalculateMetrics();

    expect(comp.FilteredLiveInteractions.length).toBe(1);
    expect(comp.FilteredLiveInteractions[0].ID).toBe('int-1');

    comp.OnSearchQueryChange('guest');
    expect(comp.FilteredLiveInteractions.length).toBe(0);
    expect(comp.FilteredRecentInteractions.length).toBe(1);
    expect(comp.FilteredRecentInteractions[0].ID).toBe('int-2');
  });

  it('formats dates, times, durations, and costs gracefully', () => {
    const comp = new TelephonyOperationsDashboardComponent();
    Object.assign(comp, { cdr: cdrMock });

    expect(comp.FormatCost(null)).toBe('$0.00');
    expect(comp.FormatCost(14.5)).toBe('$14.50');

    expect(comp.FormatTime(null)).toBe('-');
    expect(comp.FormatDate(null)).toBe('-');

    const started = new Date('2026-10-03T12:00:00.000Z');
    const ended = new Date('2026-10-03T12:03:30.000Z');
    expect(comp.ComputeDuration(started, ended)).toBe('3m 30s');
    expect(comp.ComputeDuration('invalid', null)).toBe('-');
  });
});
