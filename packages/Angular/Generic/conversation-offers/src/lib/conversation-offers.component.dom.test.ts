import { describe, it, expect, vi, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { GraphQLHandoffClient, HandoffOfferChange, HandoffOfferInfo } from '@memberjunction/graphql-dataprovider';
import { MJConversationOffersComponent, type ConversationOfferAcceptedEvent } from './conversation-offers.component';

function future(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function makeOffer(overrides: Partial<HandoffOfferInfo> = {}): HandoffOfferInfo {
  return {
    OfferID: 'offer-1',
    RoomName: 'call-1',
    Mode: 'warm',
    Summary: 'Wants a refund',
    CallerLabel: 'Phone caller ****0123',
    AgentName: 'Sage',
    Status: 'Pending',
    CreatedAt: new Date().toISOString(),
    ExpiresAt: future(45),
    ...overrides,
  };
}

interface FakeClient {
  GetMyOffers: ReturnType<typeof vi.fn>;
  AcceptOffer: ReturnType<typeof vi.fn>;
  DeclineOffer: ReturnType<typeof vi.fn>;
  ObserveOfferChanges: ReturnType<typeof vi.fn>;
  Changes: Subject<HandoffOfferChange>;
}

function makeClient(offers: HandoffOfferInfo[]): FakeClient {
  const Changes = new Subject<HandoffOfferChange>();
  return {
    GetMyOffers: vi.fn(async () => offers),
    AcceptOffer: vi.fn(async (id: string) => ({ Success: true, RoomName: 'call-1', Offer: makeOffer({ OfferID: id, Status: 'Accepted' }) })),
    DeclineOffer: vi.fn(async () => ({ Success: true })),
    ObserveOfferChanges: vi.fn(() => Changes),
    Changes,
  };
}

async function render(client: FakeClient): Promise<{ fixture: ComponentFixture<MJConversationOffersComponent>; host: HTMLElement }> {
  const fixture = TestBed.createComponent(MJConversationOffersComponent);
  fixture.componentInstance.Client = client as unknown as GraphQLHandoffClient;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

function buttons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

describe('MJConversationOffersComponent (DOM)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the empty state when nothing is waiting', async () => {
    const { host } = await render(makeClient([]));
    expect(host.textContent).toContain('Nothing waiting');
    expect(buttons(host)).toHaveLength(0);
  });

  it('lists a pending offer with the caller, the summary, a countdown, and Accept before Decline', async () => {
    const { host } = await render(makeClient([makeOffer()]));
    expect(host.textContent).toContain('Phone caller ****0123');
    expect(host.textContent).toContain('Wants a refund');
    expect(host.querySelector('.mj-co__countdown')?.textContent?.trim()).toMatch(/^0:\d\d$/);
    const labels = buttons(host).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Accept', 'Decline']);
  });

  it('accepting raises OfferAccepted with the room to join, and the row stops being actionable', async () => {
    const client = makeClient([makeOffer()]);
    const { fixture, host } = await render(client);
    const events: ConversationOfferAcceptedEvent[] = [];
    fixture.componentInstance.OfferAccepted.subscribe((e) => events.push(e));

    buttons(host)[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(client.AcceptOffer).toHaveBeenCalledWith('offer-1');
    expect(events).toHaveLength(1);
    expect(events[0].RoomName).toBe('call-1');
    expect(buttons(host)).toHaveLength(0);
    expect(host.textContent).toContain('Accepted');
  });

  it('shows a refusal from the server and reloads the list instead of raising OfferAccepted', async () => {
    const client = makeClient([makeOffer()]);
    client.AcceptOffer.mockResolvedValueOnce({ Success: false, ErrorMessage: 'This conversation offer is no longer available.', RoomName: '' });
    const { fixture, host } = await render(client);
    const events: ConversationOfferAcceptedEvent[] = [];
    fixture.componentInstance.OfferAccepted.subscribe((e) => events.push(e));

    buttons(host)[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(events).toHaveLength(0);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('no longer available');
    expect(client.GetMyOffers).toHaveBeenCalledTimes(2);
  });

  it('declining calls the server and marks the row Declined', async () => {
    const client = makeClient([makeOffer()]);
    const { fixture, host } = await render(client);

    buttons(host)[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(client.DeclineOffer).toHaveBeenCalledWith('offer-1');
    expect(host.textContent).toContain('Declined');
  });

  it('adds an offer pushed over the live stream, and updates one that was cancelled', async () => {
    const client = makeClient([]);
    const { fixture, host } = await render(client);

    client.Changes.next({ Kind: 'offered', Offer: makeOffer({ OfferID: 'pushed', CallerLabel: 'Web visitor' }) });
    fixture.detectChanges();
    expect(host.textContent).toContain('Web visitor');
    expect(buttons(host)).toHaveLength(2);

    client.Changes.next({ Kind: 'updated', Offer: makeOffer({ OfferID: 'pushed', CallerLabel: 'Web visitor', Status: 'Cancelled' }) });
    fixture.detectChanges();
    expect(buttons(host)).toHaveLength(0);
    expect(host.textContent).toContain('no longer waiting');
  });

  it('stops the countdown timer and the live stream when destroyed', async () => {
    const client = makeClient([makeOffer()]);
    const { fixture } = await render(client);
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    fixture.destroy();
    expect(clearSpy).toHaveBeenCalled();
    expect(client.Changes.observed).toBe(false);
    clearSpy.mockRestore();
  });
});
