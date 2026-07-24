/**
 * Unit tests for ShellFrontDoorComponent's pure logic (SLICE-S3): greeting
 * buckets, Needs-you assembly (requests + failed runs, conversation resolution
 * via the run→conversation map), Ran-overnight assembly (cap 3, failed note,
 * conversation resolution), and the relative-time label. All static methods —
 * no component instantiation needed.
 */
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { ShellFrontDoorComponent } from '../lib/components/shell/shell-front-door.component';

describe('ShellFrontDoorComponent — pure logic', () => {
  it('GreetingForHour buckets: morning / afternoon / evening', () => {
    expect(ShellFrontDoorComponent.GreetingForHour(0)).toBe('Good morning');
    expect(ShellFrontDoorComponent.GreetingForHour(11)).toBe('Good morning');
    expect(ShellFrontDoorComponent.GreetingForHour(12)).toBe('Good afternoon');
    expect(ShellFrontDoorComponent.GreetingForHour(17)).toBe('Good afternoon');
    expect(ShellFrontDoorComponent.GreetingForHour(18)).toBe('Good evening');
    expect(ShellFrontDoorComponent.GreetingForHour(23)).toBe('Good evening');
  });

  it('BuildNeedsYou: requests first (primary Review), then failed runs (Open); run map resolves conversations case-insensitively', () => {
    const map = new Map([['run-1', 'conv-9']]);
    const items = ShellFrontDoorComponent.BuildNeedsYou(
      [
        { ID: 'r1', Agent: 'Sage', RequestType: 'Approval', Status: 'Requested', OriginatingAgentRunID: 'RUN-1' },
        { ID: 'r2', Agent: null, RequestType: null, Status: 'Requested', OriginatingAgentRunID: null },
      ],
      [{ ID: 'f1', ConversationID: 'conv-3', Agent: 'Skip', StartedAt: '2026-07-22' }],
      map
    );
    expect(items.map((i) => i.Kind)).toEqual(['request', 'request', 'failed-run']);
    expect(items[0]).toMatchObject({ Strong: 'Sage', ActionLabel: 'Review', ConversationId: 'conv-9' });
    expect(items[1]).toMatchObject({ Strong: 'Agent', ConversationId: null }); // null-safe fallbacks
    expect(items[2]).toMatchObject({ Strong: 'Skip', ActionLabel: 'Open', ConversationId: 'conv-3', IconClass: 'err' });
  });

  it('BuildNeedsYou: empty inputs → empty list (section stays hidden)', () => {
    expect(ShellFrontDoorComponent.BuildNeedsYou([], [], new Map())).toEqual([]);
  });

  it('BuildRan: caps at 3, resolves conversation via AgentRunID, failed runs note "failed"', () => {
    const map = new Map([['ar-1', 'conv-1']]);
    const runs = [
      { ID: '1', Routine: 'Weekly digest', StartedAt: new Date().toISOString(), Status: 'Completed', ResultSummary: '247 lapsed', AgentRunID: 'AR-1' },
      { ID: '2', Routine: null, StartedAt: new Date().toISOString(), Status: 'Failed', ResultSummary: null, AgentRunID: null },
      { ID: '3', Routine: 'Pulse', StartedAt: new Date().toISOString(), Status: 'Completed', ResultSummary: null, AgentRunID: 'missing' },
      { ID: '4', Routine: 'Fourth', StartedAt: new Date().toISOString(), Status: 'Completed', ResultSummary: null, AgentRunID: null },
    ];
    const items = ShellFrontDoorComponent.BuildRan(runs, map);
    expect(items).toHaveLength(3); // capped
    expect(items[0]).toMatchObject({ RoutineName: 'Weekly digest', Note: '247 lapsed', ConversationId: 'conv-1' });
    expect(items[1]).toMatchObject({ RoutineName: 'Routine', Note: 'failed', ConversationId: null });
    expect(items[2]).toMatchObject({ Note: 'completed', ConversationId: null }); // unresolvable run id → null
  });

  it('RelativeLabel: now / minutes / hours / days / weeks; empty for missing dates', () => {
    const ago = (ms: number) => new Date(Date.now() - ms);
    expect(ShellFrontDoorComponent.RelativeLabel(ago(30_000))).toBe('now');
    expect(ShellFrontDoorComponent.RelativeLabel(ago(10 * 60_000))).toBe('10m ago');
    expect(ShellFrontDoorComponent.RelativeLabel(ago(5 * 3600_000))).toBe('5h ago');
    expect(ShellFrontDoorComponent.RelativeLabel(ago(3 * 86400_000))).toBe('3d ago');
    expect(ShellFrontDoorComponent.RelativeLabel(ago(15 * 86400_000))).toBe('2w ago');
    expect(ShellFrontDoorComponent.RelativeLabel(null)).toBe('');
    expect(ShellFrontDoorComponent.RelativeLabel(undefined)).toBe('');
  });
});
