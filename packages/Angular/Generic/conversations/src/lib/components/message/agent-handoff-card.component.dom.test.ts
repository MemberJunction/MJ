import { describe, expect, it } from 'vitest';
import { Query, QueryAll, renderComponentFixture, Text } from '@memberjunction/ng-test-utils';
import {
  AgentHandoffCardComponent,
  type HandoffRefusalReason,
  type MessageHandoffInfo,
} from './agent-handoff-card.component';

function buildSummary(overrides: Partial<MessageHandoffInfo> = {}): MessageHandoffInfo {
  return {
    Status: 'Transferred',
    SourceAgent: {
      ID: '11111111-1111-4111-8111-111111111111',
      Name: 'Sage',
      IconClass: 'fa-solid fa-sparkles',
      AvatarUrl: null,
    },
    TargetAgent: {
      ID: '22222222-2222-4222-8222-222222222222',
      Name: 'Research Agent',
      IconClass: 'fa-solid fa-magnifying-glass',
      AvatarUrl: null,
    },
    Reason: 'Needs deep literature synthesis',
    Brief: 'User asked for a literature review on fusion propulsion.',
    TargetDetailId: 'det-2',
    PresetName: 'Balanced',
    HopChain: [
      { ID: '11111111-1111-4111-8111-111111111111', Name: 'Sage' },
      { ID: '22222222-2222-4222-8222-222222222222', Name: 'Research Agent' },
    ],
    ...overrides,
  };
}

describe('AgentHandoffCardComponent (DOM)', () => {
  it('renders Transferring state with spark, status title, and polite live region', async () => {
    const summary = buildSummary({ Status: 'Transferring' });
    const fixture = await renderComponentFixture(AgentHandoffCardComponent, {
      inputs: { Handoff: summary },
    });

    const card = Query(fixture, '.handoff');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('role')).toBe('status');
    expect(card?.getAttribute('aria-live')).toBe('polite');
    expect(card?.classList.contains('handoff--transferring')).toBe(true);

    const spark = Query(fixture, '.spark');
    expect(spark).not.toBeNull();

    const title = Text(fixture, '.handoff-title strong');
    expect(title).toBe('Transferring to Research Agent…');
  });

  it('renders Transferred state with agent chips and collapsible brief details', async () => {
    const summary = buildSummary({ Status: 'Transferred' });
    const fixture = await renderComponentFixture(AgentHandoffCardComponent, {
      inputs: { Handoff: summary },
    });

    const card = Query(fixture, '.handoff');
    expect(card?.classList.contains('handoff--transferred')).toBe(true);

    const ends = QueryAll(fixture, '.baton .end .name');
    expect(ends.length).toBe(2);
    expect(ends[0]?.textContent?.trim()).toBe('Sage');
    expect(ends[1]?.textContent?.trim()).toBe('Research Agent');

    const title = Text(fixture, '.handoff-title strong');
    expect(title).toBe('Transferred to Research Agent');

    const detailsEl = Query(fixture, 'details.handoff-details') as HTMLDetailsElement | null;
    expect(detailsEl).not.toBeNull();
    expect(detailsEl?.open).toBe(false);

    expect(Text(fixture, 'details.handoff-details > summary')).toBe('Brief from Sage');

    if (detailsEl) {
      detailsEl.open = true;
      fixture.detectChanges();
    }
    expect(detailsEl?.open).toBe(true);
    expect(Text(fixture, 'details.handoff-details .brief')).toBe(
      'User asked for a literature review on fusion propulsion.',
    );
  });

  it.each<[HandoffRefusalReason, string, string]>([
    [
      'NoRunPermission',
      "You don't have access to Research Agent. Sage will continue.",
      'Ask an admin for access to Research Agent',
    ],
    [
      'NotDiscoverable',
      "Research Agent isn't available for direct transfers. Sage will continue.",
      'Continue with Sage or mention another agent',
    ],
    [
      'NotAllowedHere',
      'Research Agent is not available in this app. Sage will continue.',
      'Open a full workspace to use Research Agent',
    ],
    [
      'HopLimit',
      'Maximum transfer limit reached for this turn. Sage will continue.',
      'Send a follow-up message to continue',
    ],
    [
      'AlreadyInThisTurn',
      'Research Agent already participated in this turn. Sage will continue.',
      'Mention @Research Agent in your next message',
    ],
    [
      'NotFound',
      "Couldn't find an active agent named Research Agent. Sage will continue.",
      'Check the agent name or pick another agent',
    ],
  ])('renders Failed state with danger class and copy for %s', async (reason, expectedReason, expectedNextStep) => {
    const summary = buildSummary({ Status: 'Failed', FailureReason: reason });
    const fixture = await renderComponentFixture(AgentHandoffCardComponent, {
      inputs: { Handoff: summary },
    });

    const card = Query(fixture, '.handoff');
    expect(card?.classList.contains('handoff--failed')).toBe(true);
    expect(card?.getAttribute('role')).toBe('status');

    expect(Text(fixture, '.handoff-title strong')).toBe("Couldn't transfer to Research Agent");
    expect(Text(fixture, '.handoff-title .sub')).toBe(expectedReason);
    expect(Text(fixture, '.pill--next-step')).toBe(expectedNextStep);
  });

  it('renders multi-hop chain with last two hops and +1 overflow badge', async () => {
    const summary = buildSummary({
      HopChain: [
        { ID: '11111111-1111-4111-8111-111111111111', Name: 'Sage' },
        { ID: '22222222-2222-4222-8222-222222222222', Name: 'Research Agent' },
        { ID: '33333333-3333-4333-8333-333333333333', Name: 'Copywriter' },
      ],
      SourceAgent: { ID: '22222222-2222-4222-8222-222222222222', Name: 'Research Agent' },
      TargetAgent: { ID: '33333333-3333-4333-8333-333333333333', Name: 'Copywriter' },
    });
    const fixture = await renderComponentFixture(AgentHandoffCardComponent, {
      inputs: { Handoff: summary },
    });

    expect(Text(fixture, '.hop-chain-tail')).toBe('Research Agent → Copywriter');
    expect(Text(fixture, '.hop-chain-extra')).toBe('+1');

    const chainWrap = Query(fixture, '.hop-chain');
    expect(chainWrap?.getAttribute('title')).toBe('Sage → Research Agent → Copywriter');
  });
});
