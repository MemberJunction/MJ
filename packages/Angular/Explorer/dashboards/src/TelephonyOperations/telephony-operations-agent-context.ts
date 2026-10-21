import { BoundNameList, ValidateEnumParam, type AgentToolResult } from '../shared/agent-tool-validation';

export type TimeRangeFilter = '24h' | '7d' | '30d' | 'all';
export type ChannelFilter = 'all' | 'Phone' | 'Web' | 'Meeting';

export const VALID_TIME_RANGES: readonly TimeRangeFilter[] = ['24h', '7d', '30d', 'all'] as const;
export const VALID_CHANNELS: readonly ChannelFilter[] = ['all', 'Phone', 'Web', 'Meeting'] as const;

export interface ChannelMetrics {
  Channel: 'Phone' | 'Web' | 'Meeting';
  Count: number;
  Percentage: number;
}

export interface DirectionMetrics {
  Direction: 'Inbound' | 'Outbound' | 'Internal';
  Count: number;
  Percentage: number;
}

export interface CostByDay {
  Date: string;
  Cost: number;
  Count: number;
}

export interface CostByNumber {
  PhoneNumberID: string | null;
  PhoneNumber: string;
  Cost: number;
  Count: number;
}

export interface LiveInteractionSummary {
  ID: string;
  Channel: 'Phone' | 'Web' | 'Meeting';
  Direction: 'Inbound' | 'Outbound' | 'Internal';
  Status: string;
  RemoteAddress: string | null;
  StartedAt: Date;
  ElapsedSeconds: number;
  ElapsedLabel: string;
}

export interface OperationsMetrics {
  TotalVolume: number;
  LiveCallsCount: number;
  AnsweredCount: number;
  AnswerRate: number;
  AbandonedCount: number;
  AbandonmentRate: number;
  AverageHandleTimeSeconds: number;
  AverageHandleTimeFormatted: string;
  AverageSpeedToAnswerSeconds: number;
  AverageSpeedToAnswerFormatted: string;
  TransferCount: number;
  EscalationCount: number;
  TotalCost: number;
  TotalCostFormatted: string;
  VolumeByChannel: ChannelMetrics[];
  VolumeByDirection: DirectionMetrics[];
  CostByDay: CostByDay[];
  CostByNumber: CostByNumber[];
  LiveInteractions: LiveInteractionSummary[];
}

export interface InteractionRecordLike {
  ID: string;
  Channel: 'Meeting' | 'Phone' | 'Web' | string;
  Direction: 'Inbound' | 'Internal' | 'Outbound' | string;
  Status: 'Abandoned' | 'Active' | 'Ended' | 'Failed' | 'Queued' | string;
  AgentSessionID: string | null;
  RoomName: string | null;
  PhoneNumberID: string | null;
  RemoteAddress: string | null;
  StartedAt: Date | string;
  AnsweredAt: Date | string | null;
  EndedAt: Date | string | null;
  EndReason: string | null;
  RecordingEnabled: boolean;
  CostEstimate: number | null;
}

export interface InteractionEventRecordLike {
  ID: string;
  InteractionID: string;
  EventType: 'Abandoned' | 'Accepted' | 'Answered' | 'Created' | 'Declined' | 'Ended' | 'Escalated' | 'Held' | 'Offered' | 'Queued' | 'RecordingStarted' | 'RecordingStopped' | 'Resumed' | 'Transferred' | string;
  OccurredAt: Date | string;
  ActorUserID: string | null;
  ActorAgentID: string | null;
  Details: string | null;
}

export interface PhoneNumberRecordLike {
  ID: string;
  PhoneNumber: string;
  FriendlyName?: string | null;
}

export function FormatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s';
  }
  const rounded = Math.floor(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function FormatCurrency(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '$0.00';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ParseDate(val: Date | string | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function CalculateOperationsMetrics(
  interactions: readonly InteractionRecordLike[],
  events: readonly InteractionEventRecordLike[],
  phoneNumbers: readonly PhoneNumberRecordLike[],
  now: Date = new Date(),
): OperationsMetrics {
  const totalVolume = interactions.length;
  const phoneNumberMap = new Map<string, string>();
  for (const pn of phoneNumbers) {
    phoneNumberMap.set(pn.ID.toLowerCase(), pn.FriendlyName?.trim() || pn.PhoneNumber);
  }

  let answeredCount = 0;
  let abandonedCount = 0;
  let totalHandleTime = 0;
  let completedHandledCount = 0;
  let totalWaitTime = 0;
  let speedToAnswerCount = 0;
  let totalCost = 0;

  const channelCounts: Record<'Phone' | 'Web' | 'Meeting', number> = { Phone: 0, Web: 0, Meeting: 0 };
  const directionCounts: Record<'Inbound' | 'Outbound' | 'Internal', number> = { Inbound: 0, Outbound: 0, Internal: 0 };
  const costByDayMap = new Map<string, { cost: number; count: number }>();
  const costByNumberMap = new Map<string, { phoneNumber: string; cost: number; count: number }>();
  const liveInteractions: LiveInteractionSummary[] = [];

  // Group events by interaction id for quick checks
  const eventsByInteraction = new Map<string, InteractionEventRecordLike[]>();
  let transferCount = 0;
  let escalationCount = 0;

  for (const evt of events) {
    if (evt.EventType === 'Transferred') transferCount++;
    if (evt.EventType === 'Escalated') escalationCount++;

    const key = evt.InteractionID.toLowerCase();
    const existing = eventsByInteraction.get(key);
    if (existing) {
      existing.push(evt);
    } else {
      eventsByInteraction.set(key, [evt]);
    }
  }

  for (const row of interactions) {
    const started = ParseDate(row.StartedAt) ?? new Date();
    const answered = ParseDate(row.AnsweredAt);
    const ended = ParseDate(row.EndedAt);
    const status = row.Status;

    // Channel count
    const ch = (row.Channel as 'Phone' | 'Web' | 'Meeting') || 'Phone';
    if (ch in channelCounts) {
      channelCounts[ch]++;
    }

    // Direction count
    const dir = (row.Direction as 'Inbound' | 'Outbound' | 'Internal') || 'Inbound';
    if (dir in directionCounts) {
      directionCounts[dir]++;
    }

    // Cost accumulation
    const cost = typeof row.CostEstimate === 'number' && Number.isFinite(row.CostEstimate) ? row.CostEstimate : 0;
    totalCost += cost;

    // Cost by day
    const dayKey = started.toISOString().split('T')[0];
    const dayEntry = costByDayMap.get(dayKey) ?? { cost: 0, count: 0 };
    dayEntry.cost += cost;
    dayEntry.count++;
    costByDayMap.set(dayKey, dayEntry);

    // Cost by number
    const pnId = row.PhoneNumberID ? row.PhoneNumberID.toLowerCase() : null;
    const pnLabel = pnId ? (phoneNumberMap.get(pnId) ?? row.RemoteAddress ?? 'Assigned Pool') : (row.RemoteAddress ?? 'Non-Phone');
    const pnKey = pnId ?? pnLabel;
    const numberEntry = costByNumberMap.get(pnKey) ?? { phoneNumber: pnLabel, cost: 0, count: 0 };
    numberEntry.cost += cost;
    numberEntry.count++;
    costByNumberMap.set(pnKey, numberEntry);

    // Live interactions
    const isLive = (status === 'Active' || status === 'Queued') && ended === null;
    if (isLive) {
      const elapsed = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
      liveInteractions.push({
        ID: row.ID,
        Channel: ch,
        Direction: dir,
        Status: status,
        RemoteAddress: row.RemoteAddress,
        StartedAt: started,
        ElapsedSeconds: elapsed,
        ElapsedLabel: FormatDuration(elapsed),
      });
    }

    // Answered check
    const hasAnswerEvent = (eventsByInteraction.get(row.ID.toLowerCase()) ?? []).some(
      (e) => e.EventType === 'Answered' || e.EventType === 'Accepted',
    );
    const isAnswered = answered !== null || hasAnswerEvent || status === 'Active' || status === 'Ended';
    if (isAnswered) {
      answeredCount++;
    }

    // Abandoned check
    const isAbandoned = status === 'Abandoned' || (eventsByInteraction.get(row.ID.toLowerCase()) ?? []).some(
      (e) => e.EventType === 'Abandoned',
    );
    if (isAbandoned) {
      abandonedCount++;
    }

    // Handle time: for ended interactions
    if (ended !== null) {
      const effectiveStart = answered ?? started;
      const durationSec = Math.max(0, Math.floor((ended.getTime() - effectiveStart.getTime()) / 1000));
      totalHandleTime += durationSec;
      completedHandledCount++;
    }

    // Speed to answer
    if (answered !== null) {
      const waitSec = Math.max(0, Math.floor((answered.getTime() - started.getTime()) / 1000));
      totalWaitTime += waitSec;
      speedToAnswerCount++;
    }
  }

  const answerRate = totalVolume > 0 ? (answeredCount / totalVolume) * 100 : 0;
  const abandonmentRate = totalVolume > 0 ? (abandonedCount / totalVolume) * 100 : 0;
  const avgHandleTime = completedHandledCount > 0 ? totalHandleTime / completedHandledCount : 0;
  const avgSpeedToAnswer = speedToAnswerCount > 0 ? totalWaitTime / speedToAnswerCount : 0;

  const volumeByChannel: ChannelMetrics[] = (['Phone', 'Web', 'Meeting'] as const).map((channel) => ({
    Channel: channel,
    Count: channelCounts[channel],
    Percentage: totalVolume > 0 ? Math.round((channelCounts[channel] / totalVolume) * 100) : 0,
  }));

  const volumeByDirection: DirectionMetrics[] = (['Inbound', 'Outbound', 'Internal'] as const).map((direction) => ({
    Direction: direction,
    Count: directionCounts[direction],
    Percentage: totalVolume > 0 ? Math.round((directionCounts[direction] / totalVolume) * 100) : 0,
  }));

  const costByDay: CostByDay[] = Array.from(costByDayMap.entries())
    .map(([date, data]) => ({ Date: date, Cost: data.cost, Count: data.count }))
    .sort((a, b) => a.Date.localeCompare(b.Date));

  const costByNumber: CostByNumber[] = Array.from(costByNumberMap.entries())
    .map(([id, data]) => ({
      PhoneNumberID: id.includes('-') ? id : null,
      PhoneNumber: data.phoneNumber,
      Cost: data.cost,
      Count: data.count,
    }))
    .sort((a, b) => b.Cost - a.Cost);

  return {
    TotalVolume: totalVolume,
    LiveCallsCount: liveInteractions.length,
    AnsweredCount: answeredCount,
    AnswerRate: answerRate,
    AbandonedCount: abandonedCount,
    AbandonmentRate: abandonmentRate,
    AverageHandleTimeSeconds: avgHandleTime,
    AverageHandleTimeFormatted: FormatDuration(avgHandleTime),
    AverageSpeedToAnswerSeconds: avgSpeedToAnswer,
    AverageSpeedToAnswerFormatted: FormatDuration(avgSpeedToAnswer),
    TransferCount: transferCount,
    EscalationCount: escalationCount,
    TotalCost: totalCost,
    TotalCostFormatted: FormatCurrency(totalCost),
    VolumeByChannel: volumeByChannel,
    VolumeByDirection: volumeByDirection,
    CostByDay: costByDay,
    CostByNumber: costByNumber,
    LiveInteractions: liveInteractions.sort((a, b) => b.ElapsedSeconds - a.ElapsedSeconds),
  };
}

export function BuildTelephonyOperationsAgentContext(
  metrics: OperationsMetrics,
  timeRange: TimeRangeFilter,
  channelFilter: ChannelFilter,
): Record<string, unknown> {
  return {
    Surface: 'TelephonyOperationsDashboard',
    TimeRange: timeRange,
    ChannelFilter: channelFilter,
    TotalVolume: metrics.TotalVolume,
    LiveCallsCount: metrics.LiveCallsCount,
    AnswerRatePercent: Math.round(metrics.AnswerRate * 10) / 10,
    AbandonmentRatePercent: Math.round(metrics.AbandonmentRate * 10) / 10,
    AverageHandleTime: metrics.AverageHandleTimeFormatted,
    AverageSpeedToAnswer: metrics.AverageSpeedToAnswerFormatted,
    TransferCount: metrics.TransferCount,
    EscalationCount: metrics.EscalationCount,
    TotalCostEstimate: metrics.TotalCostFormatted,
    VolumeByChannel: metrics.VolumeByChannel.map((c) => `${c.Channel}: ${c.Count} (${c.Percentage}%)`),
    VolumeByDirection: metrics.VolumeByDirection.map((d) => `${d.Direction}: ${d.Count} (${d.Percentage}%)`),
    VisibleLiveCallAddresses: BoundNameList(
      metrics.LiveInteractions.map((i) => `${i.Channel} (${i.Direction}): ${i.RemoteAddress || i.ID} [${i.ElapsedLabel}]`),
    ),
    TopCostNumbers: BoundNameList(
      metrics.CostByNumber.map((n) => `${n.PhoneNumber}: $${n.Cost.toFixed(2)} (${n.Count} calls)`),
    ),
  };
}

export function ValidateTimeRangeParam(raw: unknown): { ok: true; value: TimeRangeFilter } | { ok: false; result: AgentToolResult } {
  return ValidateEnumParam(raw, VALID_TIME_RANGES, 'timeRange');
}

export function ValidateChannelParam(raw: unknown): { ok: true; value: ChannelFilter } | { ok: false; result: AgentToolResult } {
  return ValidateEnumParam(raw, VALID_CHANNELS, 'channel');
}
