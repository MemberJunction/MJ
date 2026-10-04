import { describe, it, expect, beforeEach } from 'vitest';
import {
  HandoffOfferRegistry,
  HANDOFF_OFFER_RETENTION_MS,
  HANDOFF_OFFER_TIMEOUT_MS,
  MAX_PENDING_OFFERS_PER_USER,
  ToOfferView,
  type CreateOfferInput,
} from '../room-handoff/handoff-offer-registry';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

function input(overrides: Partial<CreateOfferInput> = {}): CreateOfferInput {
  return { RoomName: 'call-1', TargetUserID: USER_A, Mode: 'warm', Summary: 'Wants a refund', CallerLabel: 'Phone caller ****1234', AgentName: 'Sage', ...overrides };
}

describe('HandoffOfferRegistry', () => {
  let now = 1_000_000;
  let registry: HandoffOfferRegistry;

  beforeEach(() => {
    registry = HandoffOfferRegistry.Instance;
    registry.Clear();
    now = 1_000_000;
    registry.SetClock(() => now);
  });

  it('is a process-wide singleton', () => {
    expect(HandoffOfferRegistry.Instance).toBe(HandoffOfferRegistry.Instance);
  });

  it('creates a pending offer that expires after the offer timeout', () => {
    const offer = registry.Create(input())!;
    expect(offer.Status).toBe('Pending');
    expect(offer.ExpiresAtMs - offer.CreatedAtMs).toBe(HANDOFF_OFFER_TIMEOUT_MS);
  });

  it('lists only the person\'s own pending offers, soonest to expire first', () => {
    const first = registry.Create(input({ RoomName: 'a' }))!;
    now += 1000;
    const second = registry.Create(input({ RoomName: 'b' }))!;
    registry.Create(input({ RoomName: 'c', TargetUserID: USER_B }));
    expect(registry.PendingForUser(USER_A).map((o) => o.OfferID)).toEqual([first.OfferID, second.OfferID]);
  });

  it('compares user ids case-insensitively (SQL Server and PostgreSQL disagree on case)', () => {
    registry.Create(input({ TargetUserID: USER_A.toUpperCase() }));
    expect(registry.PendingForUser(USER_A.toLowerCase())).toHaveLength(1);
  });

  it('refuses more pending offers than the per-person cap', () => {
    for (let i = 0; i < MAX_PENDING_OFFERS_PER_USER; i++) {
      expect(registry.Create(input({ RoomName: `r${i}` }))).toBeDefined();
    }
    expect(registry.Create(input({ RoomName: 'one-too-many' }))).toBeUndefined();
  });

  it('lets the target accept a pending offer exactly once', () => {
    const offer = registry.Create(input())!;
    const accepted = registry.ResolveForUser(offer.OfferID, USER_A, 'Accepted');
    expect(accepted.Ok).toBe(true);
    expect(registry.Get(offer.OfferID)?.Status).toBe('Accepted');
    expect(registry.ResolveForUser(offer.OfferID, USER_A, 'Accepted').Ok).toBe(false);
  });

  it('answers a stranger exactly as it answers a missing offer, so existence is not leaked', () => {
    const offer = registry.Create(input())!;
    const stranger = registry.ResolveForUser(offer.OfferID, USER_B, 'Accepted');
    const missing = registry.ResolveForUser('does-not-exist', USER_A, 'Accepted');
    expect(stranger).toEqual(missing);
    expect(registry.Get(offer.OfferID)?.Status).toBe('Pending');
  });

  it('refuses to resolve an offer past its expiry', () => {
    const offer = registry.Create(input())!;
    now += HANDOFF_OFFER_TIMEOUT_MS + 1;
    expect(registry.ResolveForUser(offer.OfferID, USER_A, 'Accepted').Ok).toBe(false);
    expect(registry.PendingForUser(USER_A)).toHaveLength(0);
  });

  it('closes a pending offer as expired or cancelled, and not twice', () => {
    const offer = registry.Create(input())!;
    expect(registry.Close(offer.OfferID, 'Expired')?.Status).toBe('Expired');
    expect(registry.Close(offer.OfferID, 'Cancelled')).toBeUndefined();
  });

  it('keeps resolved offers listed for the retention window, then drops them', () => {
    const offer = registry.Create(input())!;
    registry.ResolveForUser(offer.OfferID, USER_A, 'Declined');
    expect(registry.ListForUser(USER_A)).toHaveLength(1);
    now += HANDOFF_OFFER_RETENTION_MS + 1;
    expect(registry.ListForUser(USER_A)).toHaveLength(0);
  });

  it('finds the offers made from a room regardless of case and padding', () => {
    registry.Create(input({ RoomName: 'Call-XYZ' }));
    expect(registry.ForRoom('  call-xyz ')).toHaveLength(1);
  });

  it('never puts the target user or any server-only field in the console view', () => {
    const offer = registry.Create(input())!;
    const view = ToOfferView(offer);
    expect(view).not.toHaveProperty('TargetUserID');
    expect(Object.keys(view).sort()).toEqual(
      ['AgentName', 'CallerLabel', 'CreatedAt', 'ExpiresAt', 'Mode', 'OfferID', 'RoomName', 'Status', 'Summary'].sort(),
    );
    expect(new Date(view.ExpiresAt).getTime()).toBe(offer.ExpiresAtMs);
  });
});
