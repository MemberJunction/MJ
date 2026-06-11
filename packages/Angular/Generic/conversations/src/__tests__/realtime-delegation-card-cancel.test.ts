// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the whiteboard component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { RealtimeDelegationCardComponent } from '../lib/components/realtime/realtime-delegation-card.component';
import { RealtimeDelegationCardVM } from '../lib/components/realtime/realtime-session-state';

/**
 * The WORKING card's ✕ cancel affordance — the first hop of the explicit-cancel event
 * chain (card ✕ → thread re-emit → overlay → `VoiceSessionService.CancelDelegation`).
 * Class-level tests (no TestBed): the card's emission contract is what the chain depends
 * on — the thread/overlay hops are template re-emits ((CancelRequested)="….emit($event)").
 */

function workingCard(overrides: Partial<RealtimeDelegationCardVM> = {}): RealtimeDelegationCardVM {
  return {
    CallID: 'call-1',
    AgentName: 'Sage',
    LatestMessage: 'Looking things up',
    LatestStep: 'prompt_execution',
    Done: false,
    Success: false,
    StartedAt: Date.now(),
    ...overrides,
  };
}

/** A minimal MouseEvent stand-in whose stopPropagation is observable. */
function fakeClick(): MouseEvent & { stopPropagation: ReturnType<typeof vi.fn> } {
  return { stopPropagation: vi.fn() } as unknown as MouseEvent & { stopPropagation: ReturnType<typeof vi.fn> };
}

describe('RealtimeDelegationCardComponent — ✕ cancel affordance (explicit user intent)', () => {
  it('emits CancelRequested with the call id for a WORKING card and stops propagation', () => {
    const component = new RealtimeDelegationCardComponent();
    component.Card = workingCard({ CallID: 'call-9' });
    const emitted: string[] = [];
    component.CancelRequested.subscribe((id: string) => emitted.push(id));

    const event = fakeClick();
    component.CancelWork(event);

    expect(emitted).toEqual(['call-9']);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('does NOT emit for a DONE card (the affordance only exists while work runs)', () => {
    const component = new RealtimeDelegationCardComponent();
    component.Card = workingCard({ Done: true, Success: true, Result: 'all set' });
    const emitted: string[] = [];
    component.CancelRequested.subscribe((id: string) => emitted.push(id));

    component.CancelWork(fakeClick());

    expect(emitted).toEqual([]);
  });
});
