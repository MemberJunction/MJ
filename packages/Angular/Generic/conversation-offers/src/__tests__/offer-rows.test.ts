import { describe, expect, it } from 'vitest';
import type { HandoffOfferInfo } from '@memberjunction/graphql-dataprovider';
import {
  ApplyOfferChange,
  BuildOfferRow,
  BuildOfferRows,
  FormatCountdown,
  HasActionableOffer,
  RESOLVED_OFFER_DISPLAY_MS,
  SecondsRemaining,
  StatusLabelFor,
  WithOfferStatus,
} from '../lib/offer-rows';

const NOW = Date.parse('2026-10-03T10:00:00.000Z');

function offer(overrides: Partial<HandoffOfferInfo> = {}): HandoffOfferInfo {
  return {
    OfferID: 'offer-1',
    RoomName: 'call-1',
    Mode: 'warm',
    Summary: 'Wants a refund',
    CallerLabel: 'Phone caller ****0123',
    AgentName: 'Sage',
    Status: 'Pending',
    CreatedAt: '2026-10-03T09:59:30.000Z',
    ExpiresAt: '2026-10-03T10:00:45.000Z',
    ...overrides,
  };
}

describe('SecondsRemaining / FormatCountdown', () => {
  it('counts whole seconds up to the expiry, rounding a part second up, never below zero', () => {
    expect(SecondsRemaining('2026-10-03T10:00:45.000Z', NOW)).toBe(45);
    expect(SecondsRemaining('2026-10-03T10:00:00.400Z', NOW)).toBe(1);
    expect(SecondsRemaining('2026-10-03T09:59:00.000Z', NOW)).toBe(0);
  });

  it('treats an unparseable timestamp as already lapsed', () => {
    expect(SecondsRemaining('not a date', NOW)).toBe(0);
  });

  it('formats as m:ss', () => {
    expect(FormatCountdown(45)).toBe('0:45');
    expect(FormatCountdown(65)).toBe('1:05');
    expect(FormatCountdown(0)).toBe('0:00');
    expect(FormatCountdown(-3)).toBe('0:00');
  });
});

describe('BuildOfferRow', () => {
  it('makes a pending offer actionable, with a countdown and no status', () => {
    const row = BuildOfferRow(offer(), NOW);
    expect(row).toMatchObject({ IsActionable: true, SecondsRemaining: 45, CountdownLabel: '0:45', StatusLabel: '' });
  });

  it('shows a pending offer past its expiry as Expired, not actionable', () => {
    const row = BuildOfferRow(offer(), NOW + 60_000);
    expect(row).toMatchObject({ IsActionable: false, CountdownLabel: '', StatusLabel: 'Expired' });
  });

  it('labels every resolved status', () => {
    expect(StatusLabelFor('Accepted', false)).toBe('Accepted');
    expect(StatusLabelFor('Declined', false)).toBe('Declined');
    expect(StatusLabelFor('Expired', false)).toBe('Expired');
    expect(StatusLabelFor('Cancelled', false)).toMatch(/no longer waiting/);
    expect(BuildOfferRow(offer({ Status: 'Accepted' }), NOW).IsActionable).toBe(false);
  });
});

describe('BuildOfferRows', () => {
  it('lists actionable offers first (soonest to lapse first), then resolved ones newest first', () => {
    const rows = BuildOfferRows(
      [
        offer({ OfferID: 'declined', Status: 'Declined', CreatedAt: '2026-10-03T09:57:00.000Z', ExpiresAt: '2026-10-03T09:57:45.000Z' }),
        offer({ OfferID: 'later', ExpiresAt: '2026-10-03T10:00:50.000Z' }),
        offer({ OfferID: 'accepted', Status: 'Accepted', CreatedAt: '2026-10-03T09:58:30.000Z', ExpiresAt: '2026-10-03T09:59:00.000Z' }),
        offer({ OfferID: 'sooner', ExpiresAt: '2026-10-03T10:00:20.000Z' }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.Offer.OfferID)).toEqual(['sooner', 'later', 'accepted', 'declined']);
  });

  it('drops offers that resolved long ago, but never an actionable one', () => {
    const old = new Date(NOW - RESOLVED_OFFER_DISPLAY_MS - 60_000).toISOString();
    const rows = BuildOfferRows([offer({ OfferID: 'old', Status: 'Declined', ExpiresAt: old }), offer({ OfferID: 'live' })], NOW);
    expect(rows.map((r) => r.Offer.OfferID)).toEqual(['live']);
  });

  it('reports whether anything can still be answered', () => {
    expect(HasActionableOffer([offer()], NOW)).toBe(true);
    expect(HasActionableOffer([offer({ Status: 'Declined' })], NOW)).toBe(false);
    expect(HasActionableOffer([offer()], NOW + 60_000)).toBe(false);
    expect(HasActionableOffer([], NOW)).toBe(false);
  });
});

describe('ApplyOfferChange / WithOfferStatus', () => {
  it('adds a new offer and replaces a known one (ids compared case-insensitively), without mutating the input', () => {
    const list = [offer({ OfferID: 'AAAA-1' })];
    const added = ApplyOfferChange(list, { Kind: 'offered', Offer: offer({ OfferID: 'bbbb-2' }) });
    expect(added.map((o) => o.OfferID)).toEqual(['AAAA-1', 'bbbb-2']);
    const replaced = ApplyOfferChange(list, { Kind: 'updated', Offer: offer({ OfferID: 'aaaa-1', Status: 'Cancelled' }) });
    expect(replaced).toHaveLength(1);
    expect(replaced[0].Status).toBe('Cancelled');
    expect(list[0].Status).toBe('Pending');
  });

  it('sets one offer\'s status', () => {
    const next = WithOfferStatus([offer({ OfferID: 'a' }), offer({ OfferID: 'b' })], 'A', 'Declined');
    expect(next.map((o) => o.Status)).toEqual(['Declined', 'Pending']);
  });
});
