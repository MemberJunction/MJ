import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendV2Result } from '@memberjunction/communication-types';
import {
  DEFAULT_DELIVERY_GUARANTEE,
  DescribeChunkOutcome,
  PickDeliveryGuarantee,
  V2SendService,
} from '../V2SendService';
import { ENTITY, IDS, InstallCommsEngine, InstalledEngine, SeedRun, SeedSender } from './helpers/CommsV2Harness';
import { FakeCommsDb } from './helpers/FakeCommsDb';
import type { MJCommunicationSenderEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';

function result(overrides: Partial<SendV2Result>): SendV2Result {
  return { Success: true, IsAsyncRun: false, TotalCount: 1, QueuedCount: 0, BlockedCount: 0, DeferredCount: 0, ...overrides };
}

describe('PickDeliveryGuarantee', () => {
  it('returns the first value that is set', () => {
    expect(PickDeliveryGuarantee([null, undefined, 'At Least Once', 'At Most Once'])).toBe('At Least Once');
    expect(PickDeliveryGuarantee(['At Most Once', 'At Least Once'])).toBe('At Most Once');
  });

  it('defaults to At Most Once when nothing is set', () => {
    expect(PickDeliveryGuarantee([])).toBe('At Most Once');
    expect(PickDeliveryGuarantee([null, undefined])).toBe(DEFAULT_DELIVERY_GUARANTEE);
    expect(DEFAULT_DELIVERY_GUARANTEE).toBe('At Most Once');
  });
});

describe('DescribeChunkOutcome', () => {
  it('is Complete when recipients were processed, even if each was blocked or failed', () => {
    const blockedAndFailed = result({
      Success: true,
      BlockedCount: 1,
      Outcomes: [
        { Status: 'Blocked', Reason: 'Hard Bounce' },
        { Status: 'Failed', Reason: 'ProviderError' },
      ],
    });
    expect(DescribeChunkOutcome(2, blockedAndFailed, undefined)).toEqual({ Status: 'Complete', RecipientCount: 2 });
  });

  it('is Failed when the chunk was refused before any recipient was processed', () => {
    const refused = result({ Success: false, ErrorMessage: 'Sender not found' });
    expect(DescribeChunkOutcome(3, refused, undefined)).toEqual({ Status: 'Failed', RecipientCount: 3, ErrorMessage: 'Sender not found' });
  });

  it('is Failed when the send threw', () => {
    expect(DescribeChunkOutcome(4, undefined, new Error('provider unavailable'))).toEqual({
      Status: 'Failed',
      RecipientCount: 4,
      ErrorMessage: 'provider unavailable',
    });
  });

  it('is Failed when there is no result at all', () => {
    expect(DescribeChunkOutcome(1, undefined, undefined).Status).toBe('Failed');
  });
});

describe('V2SendService.ResolveDeliveryGuarantee', () => {
  let db: FakeCommsDb;
  let users: InstalledEngine;
  let service: V2SendService;
  const PARENT = 'aaaaaaaa-0000-4000-8000-00000000000a';
  const GRANDPARENT = 'aaaaaaaa-0000-4000-8000-00000000000b';

  async function loadSender(): Promise<MJCommunicationSenderEntity> {
    const res = await RunView.FromMetadataProvider(db.Provider).RunView<MJCommunicationSenderEntity>({
      EntityName: ENTITY.Senders,
      ExtraFilter: `ID='${IDS.Sender}'`,
      ResultType: 'entity_object',
    });
    return res.Results[0];
  }

  function arrange(options: {
    Provider?: 'At Most Once' | 'At Least Once';
    Sender?: 'At Most Once' | 'At Least Once' | null;
    Parent?: 'At Most Once' | 'At Least Once' | null;
    Grandparent?: 'At Most Once' | 'At Least Once' | null;
  }): void {
    db = new FakeCommsDb();
    service = new V2SendService();
    users = InstallCommsEngine(db, { ProviderDeliveryGuarantee: options.Provider });
    db.Seed(ENTITY.Senders, { ID: GRANDPARENT, Name: 'Grandparent', Status: 'Active', IsDefault: false, ParentSenderID: null, DeliveryGuarantee: options.Grandparent ?? null });
    db.Seed(ENTITY.Senders, { ID: PARENT, Name: 'Parent', Status: 'Active', IsDefault: false, ParentSenderID: GRANDPARENT, DeliveryGuarantee: options.Parent ?? null });
    SeedSender(db, { ParentSenderID: PARENT, DeliveryGuarantee: options.Sender ?? null });
  }

  const envelope = { ChannelID: IDS.ChannelEmail, MessageClass: 'Operational' as const, SenderID: IDS.Sender };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('the envelope wins over everything', async () => {
    arrange({ Provider: 'At Most Once', Sender: 'At Most Once' });
    const run = SeedRun(db, { DeliveryGuarantee: 'At Most Once' });
    const sender = await loadSender();
    const value = await service.ResolveDeliveryGuarantee(
      { ...envelope, DeliveryGuarantee: 'At Least Once' },
      String(run.ID),
      sender,
      IDS.Provider,
      users.SystemUser,
    );
    expect(value).toBe('At Least Once');
  });

  it('the run wins over the sender chain and the provider', async () => {
    arrange({ Provider: 'At Most Once', Sender: 'At Most Once' });
    const run = SeedRun(db, { DeliveryGuarantee: 'At Least Once' });
    expect(await service.ResolveDeliveryGuarantee(envelope, String(run.ID), await loadSender(), IDS.Provider, users.SystemUser)).toBe('At Least Once');
  });

  it('the sender wins over its ancestors and the provider', async () => {
    arrange({ Provider: 'At Most Once', Sender: 'At Least Once', Parent: 'At Most Once' });
    expect(await service.ResolveDeliveryGuarantee(envelope, undefined, await loadSender(), IDS.Provider, users.SystemUser)).toBe('At Least Once');
  });

  it('the nearest ancestor wins over farther ancestors and the provider', async () => {
    arrange({ Provider: 'At Most Once', Parent: 'At Least Once', Grandparent: 'At Most Once' });
    expect(await service.ResolveDeliveryGuarantee(envelope, undefined, await loadSender(), IDS.Provider, users.SystemUser)).toBe('At Least Once');
  });

  it('falls back to the provider', async () => {
    arrange({ Provider: 'At Least Once' });
    const run = SeedRun(db);
    expect(await service.ResolveDeliveryGuarantee(envelope, String(run.ID), await loadSender(), IDS.Provider, users.SystemUser)).toBe('At Least Once');
  });

  it('resolves to At Most Once when the run cannot be read, even if the provider says At Least Once', async () => {
    arrange({ Provider: 'At Least Once' });
    const run = SeedRun(db);
    db.FailRunView(ENTITY.Runs);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await service.ResolveDeliveryGuarantee(envelope, String(run.ID), await loadSender(), IDS.Provider, users.SystemUser)).toBe('At Most Once');
  });
});
