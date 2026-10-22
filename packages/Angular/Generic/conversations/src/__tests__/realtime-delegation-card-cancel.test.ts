// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the whiteboard component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { RealtimeDelegationCardComponent } from '../lib/components/realtime/realtime-delegation-card.component';
import { RealtimeDelegationCardVM } from '../lib/components/realtime/realtime-session-state';

/**
 * The WORKING card's ✕ cancel affordance — the first hop of the explicit-cancel event
 * chain (card ✕ → thread re-emit → overlay → `RealtimeSessionService.CancelDelegation`).
 * Class-level tests (no TestBed): the card's emission contract is what the chain depends
 * on — the thread/overlay hops are template re-emits ((CancelRequested)="….emit($event)").
 */

function workingCard(overrides: Partial<RealtimeDelegationCardVM> = {}): RealtimeDelegationCardVM {
  return {
    Kind: 'agent',
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

  it('does NOT emit for a WORKING narration card (narration cannot be cancelled)', () => {
    const component = new RealtimeDelegationCardComponent();
    component.Card = workingCard({ Kind: 'narration', CallID: 'call-thought' });
    const emitted: string[] = [];
    component.CancelRequested.subscribe((id: string) => emitted.push(id));

    component.CancelWork(fakeClick());

    expect(emitted).toEqual([]);
  });

  describe('RealtimeDelegationCardComponent properties across kinds (agent, action, narration)', () => {
    it('suppresses Artifacts for action and narration, permits for agent when done', () => {
      const component = new RealtimeDelegationCardComponent();
      const mockArtifacts = [{ ArtifactID: 'a1', ArtifactVersionID: 'v1', Name: 'doc' }];

      component.Card = workingCard({ Kind: 'narration', Done: true, Artifacts: mockArtifacts });
      expect(component.Artifacts).toEqual([]);

      component.Card = workingCard({ Kind: 'action', Done: true, Artifacts: mockArtifacts });
      expect(component.Artifacts).toEqual([]);

      component.Card = workingCard({ Kind: 'agent', Done: true, Artifacts: mockArtifacts });
      expect(component.Artifacts).toEqual(mockArtifacts);
    });

    it('suppresses ShowOpenRun for action and narration, permits for agent with RunID in DevMode', () => {
      const component = new RealtimeDelegationCardComponent();
      component.DevMode = true;

      component.Card = workingCard({ Kind: 'narration', RunID: 'run-1' });
      expect(component.ShowOpenRun).toBe(false);

      component.Card = workingCard({ Kind: 'action', RunID: 'run-1' });
      expect(component.ShowOpenRun).toBe(false);

      component.Card = workingCard({ Kind: 'agent', RunID: 'run-1' });
      expect(component.ShowOpenRun).toBe(true);
    });

    it('formats ResultText and ProvenanceTitle for narration cards', () => {
      const component = new RealtimeDelegationCardComponent();

      component.Card = workingCard({
        Kind: 'narration',
        AgentName: 'Sage',
        Result: 'Reasoned about product metrics.',
      });
      expect(component.ResultText).toBe('Reasoned about product metrics.');
      expect(component.ProvenanceTitle).toBe('Thought / narration authored by Sage.');

      // Fallback text when Result and LatestMessage are empty
      component.Card = workingCard({
        Kind: 'narration',
        AgentName: 'Sage',
        LatestMessage: '',
        Result: null,
      });
      expect(component.ResultText).toBe('Sage shared a thought.');
    });
  });
});
