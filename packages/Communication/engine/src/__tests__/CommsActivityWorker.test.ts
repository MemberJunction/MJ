import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseCommunicationPrincipal,
  BaseCommunicationSuppressionPolicy,
  CommunicationEngineBase,
  NormalizedActivityEvent,
} from '@memberjunction/communication-types';
import { IMetadataProvider, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import type { MJCommunicationSuppressionPolicyEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { CommsActivityWorker } from '../CommsActivityWorker';

interface MockRecord {
  ID: string;
  [key: string]: unknown;
  Save: () => Promise<boolean>;
  GetAll: () => Record<string, unknown>;
}

interface MockStore {
  'MJ: Communication Provider Events': MockRecord[];
  'MJ: Communication Logs': MockRecord[];
  'MJ: Communication Endpoints': MockRecord[];
  'MJ: Communication Suppressions': MockRecord[];
  'MJ: Communication Principal Preferences': MockRecord[];
  'MJ: Communication Consent Audit Logs': MockRecord[];
  'MJ: Communication Activities': MockRecord[];
}

function createEmptyStore(): MockStore {
  return {
    'MJ: Communication Provider Events': [],
    'MJ: Communication Logs': [],
    'MJ: Communication Endpoints': [],
    'MJ: Communication Suppressions': [],
    'MJ: Communication Principal Preferences': [],
    'MJ: Communication Consent Audit Logs': [],
    'MJ: Communication Activities': [],
  };
}

let idCounter = 0;

function makeRecord(
  table: keyof MockStore,
  store: MockStore,
  initial: Record<string, unknown>,
  isNew: boolean,
): MockRecord {
  const rec: MockRecord = {
    ID: (initial.ID as string | undefined) ?? `rec-${++idCounter}`,
    ...initial,
    GetAll() {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(this)) {
        if (typeof v !== 'function') {
          copy[k] = v;
        }
      }
      return copy;
    },
    async Save() {
      // Save() never throws on a constraint violation: it returns false and reports through LatestResult.
      const violation =
        table === 'MJ: Communication Suppressions'
          ? suppressionConstraintViolation(this)
          : table === 'MJ: Communication Provider Events'
            ? providerEventConstraintViolation(this, store[table])
            : null;
      if (violation) {
        this.LatestResult = { Success: false, CompleteMessage: violation };
        rejectedSaves.push({ Table: table, Message: violation });
        return false;
      }
      if (isNew && !store[table].some((r) => r.ID === this.ID)) {
        store[table].push(this);
      }
      return true;
    },
  };
  return rec;
}

/** Saves the fake refused, so a test can prove the worker never attempted an invalid write. */
let rejectedSaves: Array<{ Table: keyof MockStore; Message: string }> = [];

function isUnset(value: unknown): boolean {
  return value === null || value === undefined;
}

/** UQ_CommunicationProviderEvent_Event: one row per provider and provider event ID. This is the claim. */
function providerEventConstraintViolation(row: MockRecord, existing: MockRecord[]): string | null {
  const taken = existing.some(
    (r) =>
      r.ID !== row.ID &&
      String(r.CommunicationProviderID).toLowerCase() === String(row.CommunicationProviderID).toLowerCase() &&
      r.ProviderEventID === row.ProviderEventID,
  );
  return taken ? 'Violation of UNIQUE KEY constraint "UQ_CommunicationProviderEvent_Event".' : null;
}

/**
 * CHECK constraints on CommunicationSuppression that the real database enforces
 * (migrations/v6/V202611231029__v6.3.x__Communications_V2_Schema.sql).
 */
function suppressionConstraintViolation(row: MockRecord): string | null {
  const prefix = 'The INSERT statement conflicted with the CHECK constraint';
  if (isUnset(row.CommunicationEndpointID) && isUnset(row.EntityID)) {
    return `${prefix} "CK_CommunicationSuppression_Target".`;
  }
  if (isUnset(row.EntityID) !== isUnset(row.RecordID)) {
    return `${prefix} "CK_CommunicationSuppression_PrincipalPair".`;
  }
  if (row.Reason === 'Policy' && isUnset(row.CommunicationSuppressionPolicyID)) {
    return `${prefix} "CK_CommunicationSuppression_PolicyLink".`;
  }
  return null;
}

/** The policy row shipped in metadata/communication-suppression-policies. */
const SOFT_BOUNCE_POLICY = {
  ID: '2A0A405B-03EA-419B-A93E-E4C5646F3CEB',
  Name: 'SoftBounceThresholdPolicy',
  DriverClass: 'SoftBounceThresholdPolicy',
  Parameters: JSON.stringify({ threshold: 5, cooldownDays: 30, scope: 'Global' }),
  Status: 'Active',
} as MJCommunicationSuppressionPolicyEntity;

function softBounceEvent(endpointID: string, occurredAt: Date): NormalizedActivityEvent {
  return {
    CommunicationProviderID: 'prov-1',
    CommunicationEndpointID: endpointID,
    NormalizedAddress: 'soft@example.com',
    EventType: 'Soft Bounce',
    OccurredAt: occurredAt,
    IsMachineEvent: false,
  };
}

function parseSimpleEqualityFilters(filter: string): Array<[string, string | null]> {
  const parts = filter.split(/\s+AND\s+/i);
  const pairs: Array<[string, string | null]> = [];
  for (const part of parts) {
    const eqMatch = part.trim().match(/^(\w+)\s*=\s*'([^']*)'$/);
    if (eqMatch) {
      pairs.push([eqMatch[1], eqMatch[2]]);
      continue;
    }
    const nullMatch = part.trim().match(/^(\w+)\s+IS\s+NULL$/i);
    if (nullMatch) {
      pairs.push([nullMatch[1], null]);
    }
  }
  return pairs;
}

function matchesFilter(row: MockRecord, filter?: string): boolean {
  if (!filter) return true;
  if (/\s+OR\s+/i.test(filter)) {
    return filter
      .split(/\s+OR\s+/i)
      .some((branch) => matchesFilter(row, branch.trim()));
  }
  const inMatch = filter.match(/(\w+)\s+IN\s+\(([^)]+)\)/i);
  if (inMatch) {
    const field = inMatch[1];
    const values = inMatch[2]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''));
    const remainder = filter
      .replace(inMatch[0], '')
      .replace(/^\s*AND\s*|\s*AND\s*$/gi, '')
      .trim();
    const rowVal = String(row[field] ?? '');
    const inMatched = values.includes(rowVal);
    return inMatched && (remainder ? matchesFilter(row, remainder) : true);
  }

  const pairs = parseSimpleEqualityFilters(filter);
  return pairs.every(([k, v]) => {
    if (v === null) return row[k] === null || row[k] === undefined;
    return String(row[k] ?? '').toLowerCase() === v.toLowerCase();
  });
}

function createMockProvider(store: MockStore): IMetadataProvider {
  const provider = {
    async RunView<T>(params: RunViewParams): Promise<{
      Success: boolean;
      Results: T[];
      RowCount: number;
      TotalRowCount: number;
      ErrorMessage: string;
    }> {
      const entityName = params.EntityName as keyof MockStore;
      const rows = (store[entityName] ?? []).filter((r) =>
        matchesFilter(r, params.ExtraFilter),
      );
      const results =
        params.ResultType === 'simple'
          ? rows.map((r) => r.GetAll() as T)
          : (rows as unknown as T[]);
      return {
        Success: true,
        Results: results,
        RowCount: results.length,
        TotalRowCount: results.length,
        ErrorMessage: '',
      };
    },
    async GetEntityObject<T>(entityName: string): Promise<T> {
      const table = entityName as keyof MockStore;
      return makeRecord(table, store, {}, true) as unknown as T;
    },
  };
  return provider as unknown as IMetadataProvider;
}

const mockUser = { ID: 'user-1', Name: 'Test User' } as UserInfo;

describe('CommsActivityWorker', () => {
  let store: MockStore;
  let worker: CommsActivityWorker;

  beforeEach(() => {
    vi.restoreAllMocks();
    idCounter = 0;
    rejectedSaves = [];
    store = createEmptyStore();
    worker = new CommsActivityWorker();
    const provider = createMockProvider(store);

    vi.spyOn(CommunicationEngineBase.Instance, 'ProviderToUse', 'get').mockReturnValue(
      provider,
    );
    vi.spyOn(CommunicationEngineBase.Instance, 'Principals', 'get').mockReturnValue([]);
    vi.spyOn(
      CommunicationEngineBase.Instance,
      'SuppressionPolicies',
      'get',
    ).mockReturnValue([]);
  });

  it('deduplicates events via MJ: Communication Provider Events across DB and batch', async () => {
    store['MJ: Communication Provider Events'].push(
      makeRecord(
        'MJ: Communication Provider Events',
        store,
        {
          CommunicationProviderID: 'prov-1',
          ProviderEventID: 'evt-already-seen',
        },
        false,
      ),
    );

    const events: NormalizedActivityEvent[] = [
      {
        CommunicationProviderID: 'prov-1',
        ProviderEventID: 'evt-already-seen',
        NormalizedAddress: 'a@example.com',
        EventType: 'Delivered',
        OccurredAt: new Date('2026-01-01T10:00:00Z'),
        IsMachineEvent: false,
      },
      {
        CommunicationProviderID: 'prov-1',
        ProviderEventID: 'evt-new-1',
        NormalizedAddress: 'b@example.com',
        EventType: 'Delivered',
        OccurredAt: new Date('2026-01-01T10:01:00Z'),
        IsMachineEvent: false,
      },
      {
        CommunicationProviderID: 'prov-1',
        ProviderEventID: 'evt-new-1',
        NormalizedAddress: 'b@example.com',
        EventType: 'Delivered',
        OccurredAt: new Date('2026-01-01T10:01:00Z'),
        IsMachineEvent: false,
      },
    ];

    const result = await worker.ProcessActivityBatch(events, mockUser);
    expect(result.ProcessedCount).toBe(1);
    expect(result.DuplicateCount).toBe(2);
    expect(store['MJ: Communication Provider Events']).toHaveLength(2);
    expect(store['MJ: Communication Activities']).toHaveLength(1);
  });

  it('correlates CommunicationLog by UnsubscribeToken / TrackingToken / ProviderMessageID and re-hydrates fields', async () => {
    store['MJ: Communication Logs'].push(
      makeRecord(
        'MJ: Communication Logs',
        store,
        {
          ID: 'log-1',
          CommunicationProviderID: 'prov-1',
          CommunicationSenderID: 'sender-1',
          CommunicationEndpointID: 'ep-1',
          UnsubscribeToken: 'unsub-tok-1',
          TrackingToken: 'track-tok-1',
          ProviderMessageID: 'pm-1',
          EntityID: 'ent-contacts',
          RecordID: 'contact-42',
          CorrelationData: JSON.stringify({ campaignId: 'camp-9' }),
        },
        false,
      ),
    );

    const event: NormalizedActivityEvent = {
      CommunicationProviderID: 'prov-1',
      TrackingToken: 'track-tok-1',
      NormalizedAddress: 'alice@example.com',
      EventType: 'Opened',
      OccurredAt: new Date('2026-01-02T12:00:00Z'),
      IsMachineEvent: false,
      UserAgent: 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0 Safari/537.36',
    };

    await worker.ProcessActivityBatch([event], mockUser);

    expect(event.CommunicationLogID).toBe('log-1');
    expect(event.CommunicationSenderID).toBe('sender-1');
    expect(event.CommunicationEndpointID).toBe('ep-1');
    expect(event.Principal).toEqual({ EntityID: 'ent-contacts', RecordID: 'contact-42' });
    expect(event.CorrelationData).toEqual({ campaignId: 'camp-9' });
    expect(store['MJ: Communication Activities'][0].CommunicationLogID).toBe('log-1');
  });

  it('resets SoftBounceCount on Delivered only when OccurredAt is newer than LastBouncedAt', async () => {
    const ep = makeRecord(
      'MJ: Communication Endpoints',
      store,
      {
        ID: 'ep-1',
        BaseMessageTypeID: 'chan-email',
        Status: 'Soft Bouncing',
        SoftBounceCount: 3,
        LastBouncedAt: new Date('2026-01-05T12:00:00Z'),
        LastDeliveredAt: null,
      },
      false,
    );
    store['MJ: Communication Endpoints'].push(ep);

    // Older Delivered event (out-of-order) -> must NOT reset SoftBounceCount
    await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          CommunicationEndpointID: 'ep-1',
          NormalizedAddress: 'a@example.com',
          EventType: 'Delivered',
          OccurredAt: new Date('2026-01-05T10:00:00Z'),
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );
    expect(ep.SoftBounceCount).toBe(3);
    expect(ep.Status).toBe('Soft Bouncing');

    // Newer Delivered event -> resets SoftBounceCount to 0 and Status to Active
    await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          CommunicationEndpointID: 'ep-1',
          NormalizedAddress: 'a@example.com',
          EventType: 'Delivered',
          OccurredAt: new Date('2026-01-05T14:00:00Z'),
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );
    expect(ep.SoftBounceCount).toBe(0);
    expect(ep.Status).toBe('Active');
  });

  function seedSoftBouncingEndpoint(softBounceCount: number): MockRecord {
    const ep = makeRecord(
      'MJ: Communication Endpoints',
      store,
      {
        ID: 'ep-soft',
        BaseMessageTypeID: 'chan-email',
        Status: 'Active',
        SoftBounceCount: softBounceCount,
        LastBouncedAt: null,
      },
      false,
    );
    store['MJ: Communication Endpoints'].push(ep);
    return ep;
  }

  it('creates a 30-day Policy suppression linked to the SoftBounceThresholdPolicy row on the 5th soft bounce', async () => {
    vi.spyOn(CommunicationEngineBase.Instance, 'SuppressionPolicies', 'get').mockReturnValue([
      SOFT_BOUNCE_POLICY,
    ]);
    const ep = seedSoftBouncingEndpoint(4);

    const occurredAt = new Date('2026-02-01T00:00:00Z');
    await worker.ProcessActivityBatch([softBounceEvent('ep-soft', occurredAt)], mockUser);

    expect(ep.SoftBounceCount).toBe(5);
    expect(ep.Status).toBe('Soft Bouncing');
    expect(rejectedSaves).toEqual([]);
    expect(store['MJ: Communication Suppressions']).toHaveLength(1);
    const supp = store['MJ: Communication Suppressions'][0];
    expect(supp.Reason).toBe('Policy');
    expect(supp.Source).toBe('Policy');
    // CK_CommunicationSuppression_PolicyLink: a Policy suppression must name its policy.
    expect(supp.CommunicationSuppressionPolicyID).toBe(SOFT_BOUNCE_POLICY.ID);
    expect(supp.CommunicationEndpointID).toBe('ep-soft');
    expect((supp.ExpiresAt as Date).getTime()).toBe(
      occurredAt.getTime() + 30 * 86_400_000,
    );
    expect(store['MJ: Communication Consent Audit Logs']).toHaveLength(1);
  });

  it('does not suppress below the soft-bounce threshold', async () => {
    vi.spyOn(CommunicationEngineBase.Instance, 'SuppressionPolicies', 'get').mockReturnValue([
      SOFT_BOUNCE_POLICY,
    ]);
    const ep = seedSoftBouncingEndpoint(3);

    await worker.ProcessActivityBatch(
      [softBounceEvent('ep-soft', new Date('2026-02-01T00:00:00Z'))],
      mockUser,
    );

    expect(ep.SoftBounceCount).toBe(4);
    expect(store['MJ: Communication Suppressions']).toHaveLength(0);
    expect(rejectedSaves).toEqual([]);
  });

  it('without a SoftBounceThresholdPolicy row, does not attempt a Policy suppression the database rejects', async () => {
    const ep = seedSoftBouncingEndpoint(4);

    await worker.ProcessActivityBatch(
      [softBounceEvent('ep-soft', new Date('2026-02-01T00:00:00Z'))],
      mockUser,
    );

    expect(ep.SoftBounceCount).toBe(5);
    expect(rejectedSaves).toEqual([]);
  });

  it('maps Dropped reasons to global vs sender-scoped suppressions', async () => {
    store['MJ: Communication Endpoints'].push(
      makeRecord(
        'MJ: Communication Endpoints',
        store,
        { ID: 'ep-inv', BaseMessageTypeID: 'chan-email', Status: 'Active' },
        false,
      ),
      makeRecord(
        'MJ: Communication Endpoints',
        store,
        { ID: 'ep-unsub', BaseMessageTypeID: 'chan-email', Status: 'Active' },
        false,
      ),
    );

    await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          CommunicationEndpointID: 'ep-inv',
          CommunicationSenderID: 'sender-1',
          NormalizedAddress: 'inv@example.com',
          EventType: 'Dropped',
          DropReason: 'Invalid Address',
          OccurredAt: new Date('2026-02-02T00:00:00Z'),
          IsMachineEvent: false,
        },
        {
          CommunicationProviderID: 'prov-1',
          CommunicationEndpointID: 'ep-unsub',
          CommunicationSenderID: 'sender-1',
          NormalizedAddress: 'unsub@example.com',
          EventType: 'Dropped',
          DropReason: 'Unsubscribed Address',
          OccurredAt: new Date('2026-02-02T00:01:00Z'),
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );

    expect(store['MJ: Communication Suppressions']).toHaveLength(2);
    const invSupp = store['MJ: Communication Suppressions'][0];
    expect(invSupp.Reason).toBe('Invalid Address');
    expect(invSupp.CommunicationSenderID).toBeNull();

    const unsubSupp = store['MJ: Communication Suppressions'][1];
    expect(unsubSupp.Reason).toBe('User Unsubscribe');
    expect(unsubSupp.CommunicationSenderID).toBe('sender-1');
  });

  it('applies all 3 Unsubscribed write rules and appends CommunicationConsentAuditLog', async () => {
    store['MJ: Communication Endpoints'].push(
      makeRecord(
        'MJ: Communication Endpoints',
        store,
        { ID: 'ep-u1', BaseMessageTypeID: 'chan-email', Status: 'Active' },
        false,
      ),
      makeRecord(
        'MJ: Communication Endpoints',
        store,
        { ID: 'ep-u2', BaseMessageTypeID: 'chan-email', Status: 'Active' },
        false,
      ),
      makeRecord(
        'MJ: Communication Endpoints',
        store,
        { ID: 'ep-u3', BaseMessageTypeID: 'chan-email', Status: 'Active' },
        false,
      ),
    );
    store['MJ: Communication Logs'].push(
      makeRecord(
        'MJ: Communication Logs',
        store,
        {
          ID: 'log-pref',
          CommunicationProviderID: 'prov-1',
          CommunicationSenderID: 'sender-1',
          CommunicationEndpointID: 'ep-u1',
          CommunicationPreferenceID: 'pref-newsletter',
          EntityID: 'ent-1',
          RecordID: 'rec-1',
        },
        false,
      ),
      makeRecord(
        'MJ: Communication Logs',
        store,
        {
          ID: 'log-nopref',
          CommunicationProviderID: 'prov-1',
          CommunicationSenderID: 'sender-1',
          CommunicationEndpointID: 'ep-u2',
          CommunicationPreferenceID: null,
          EntityID: 'ent-1',
          RecordID: 'rec-2',
        },
        false,
      ),
    );

    await worker.ProcessActivityBatch(
      [
        // Rule 1: Principal + Preference
        {
          CommunicationProviderID: 'prov-1',
          CommunicationLogID: 'log-pref',
          NormalizedAddress: 'u1@example.com',
          EventType: 'Unsubscribed',
          OccurredAt: new Date('2026-02-03T10:00:00Z'),
          IsMachineEvent: false,
        },
        // Rule 2: Principal + No Preference
        {
          CommunicationProviderID: 'prov-1',
          CommunicationLogID: 'log-nopref',
          NormalizedAddress: 'u2@example.com',
          EventType: 'Unsubscribed',
          OccurredAt: new Date('2026-02-03T10:01:00Z'),
          IsMachineEvent: false,
        },
        // Rule 3: No Principal
        {
          CommunicationProviderID: 'prov-1',
          CommunicationEndpointID: 'ep-u3',
          CommunicationSenderID: 'sender-1',
          NormalizedAddress: 'u3@example.com',
          EventType: 'Unsubscribed',
          OccurredAt: new Date('2026-02-03T10:02:00Z'),
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );

    // Rule 1 created PrincipalPreference Opted Out + scoped suppression
    expect(store['MJ: Communication Principal Preferences']).toHaveLength(1);
    expect(store['MJ: Communication Principal Preferences'][0].State).toBe('Opted Out');

    expect(store['MJ: Communication Suppressions']).toHaveLength(3);
    expect(store['MJ: Communication Suppressions'][0].CommunicationPreferenceID).toBe(
      'pref-newsletter',
    );
    expect(store['MJ: Communication Suppressions'][1].CommunicationPreferenceID).toBeNull();
    expect(store['MJ: Communication Suppressions'][1].RecordID).toBe('rec-2');
    expect(store['MJ: Communication Suppressions'][2].RecordID).toBeNull();
    expect(store['MJ: Communication Suppressions'][2].CommunicationEndpointID).toBe(
      'ep-u3',
    );

    // 1 audit log for PrincipalPreference + 3 audit logs for Suppressions = 4
    expect(store['MJ: Communication Consent Audit Logs']).toHaveLength(4);
  });

  it('flags machine events for Apple MPP, GoogleImageProxy, SafeLinks, Proofpoint, Barracuda and skips LastEngagedAt', async () => {
    const ep = makeRecord(
      'MJ: Communication Endpoints',
      store,
      {
        ID: 'ep-eng',
        BaseMessageTypeID: 'chan-email',
        Status: 'Active',
        LastEngagedAt: null,
      },
      false,
    );
    store['MJ: Communication Endpoints'].push(ep);

    const machineAgents = [
      'Mozilla/5.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GoogleImageProxy',
      'Mozilla/5.0 Microsoft SafeLinks Scanner',
      'Proofpoint URL Defense',
      'Barracuda Email Security',
    ];

    for (const ua of machineAgents) {
      await worker.ProcessActivityBatch(
        [
          {
            CommunicationProviderID: 'prov-1',
            CommunicationEndpointID: 'ep-eng',
            NormalizedAddress: 'eng@example.com',
            EventType: 'Opened',
            OccurredAt: new Date('2026-02-04T08:00:00Z'),
            IsMachineEvent: false,
            UserAgent: ua,
          },
        ],
        mockUser,
      );
    }

    expect(ep.LastEngagedAt).toBeNull();
    expect(
      store['MJ: Communication Activities'].every((a) => a.IsMachineEvent === true),
    ).toBe(true);

    const humanTime = new Date('2026-02-04T09:00:00Z');
    await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          CommunicationEndpointID: 'ep-eng',
          NormalizedAddress: 'eng@example.com',
          EventType: 'Clicked',
          OccurredAt: humanTime,
          IsMachineEvent: false,
          UserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/121.0.0.0 Safari/537.36',
        },
      ],
      mockUser,
    );

    expect(ep.LastEngagedAt).toEqual(humanTime);
  });

  it('respects PersistActivity: false while still deduplicating and updating health/suppressions', async () => {
    const ep = makeRecord(
      'MJ: Communication Endpoints',
      store,
      { ID: 'ep-rasa', BaseMessageTypeID: 'chan-email', Status: 'Active' },
      false,
    );
    store['MJ: Communication Endpoints'].push(ep);

    const res = await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          ProviderEventID: 'evt-rasa-1',
          CommunicationEndpointID: 'ep-rasa',
          NormalizedAddress: 'rasa@example.com',
          EventType: 'Hard Bounce',
          OccurredAt: new Date('2026-02-05T00:00:00Z'),
          IsMachineEvent: false,
        },
      ],
      mockUser,
      { PersistActivity: false },
    );

    expect(res.ProcessedCount).toBe(1);
    expect(store['MJ: Communication Provider Events']).toHaveLength(1);
    expect(store['MJ: Communication Suppressions']).toHaveLength(1);
    expect(ep.Status).toBe('Hard Bounced');
    expect(store['MJ: Communication Activities']).toHaveLength(0);
  });

  it('invokes BaseCommunicationPrincipal.OnActivity and active BaseCommunicationSuppressionPolicy drivers', async () => {
    const onActivitySpy = vi.fn().mockResolvedValue(undefined);
    const policyEvalSpy = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(CommunicationEngineBase.Instance, 'Principals', 'get').mockReturnValue([
      { EntityID: 'ent-1', Status: 'Active', DriverClass: 'TestPrincipal' } as never,
    ]);
    vi.spyOn(
      CommunicationEngineBase.Instance,
      'SuppressionPolicies',
      'get',
    ).mockReturnValue([
      {
        ID: 'pol-1',
        Name: 'ComplaintRatePolicy',
        Status: 'Active',
        DriverClass: 'TestPolicy',
        Parameters: JSON.stringify({ Threshold: 3 }),
      } as never,
    ]);

    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(
      (baseClass: unknown, key?: string) => {
        if (baseClass === BaseCommunicationPrincipal && key === 'TestPrincipal') {
          return { OnActivity: onActivitySpy } as unknown as never;
        }
        if (baseClass === BaseCommunicationSuppressionPolicy && key === 'TestPolicy') {
          return { Evaluate: policyEvalSpy } as unknown as never;
        }
        return undefined as never;
      },
    );

    await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          Principal: { EntityID: 'ent-1', RecordID: 'r-1' },
          NormalizedAddress: 'hook@example.com',
          EventType: 'Delivered',
          OccurredAt: new Date('2026-02-06T00:00:00Z'),
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );

    expect(onActivitySpy).toHaveBeenCalledTimes(1);
    expect(policyEvalSpy).toHaveBeenCalledWith(
      expect.any(Array),
      { Threshold: 3 },
      mockUser,
    );
  });

  it('executes EraseEndpointPII: marks Erased, nulls NormalizedValue, keeps ValueHash + Suppressions, scrubs PII', async () => {
    const ep = makeRecord(
      'MJ: Communication Endpoints',
      store,
      {
        ID: '11111111-1111-1111-1111-111111111111',
        BaseMessageTypeID: 'chan-email',
        NormalizedValue: 'gdpr@example.com',
        ValueHash: 'hash-gdpr-123',
        Status: 'Active',
      },
      false,
    );
    store['MJ: Communication Endpoints'].push(ep);

    const supp = makeRecord(
      'MJ: Communication Suppressions',
      store,
      {
        ID: 'supp-gdpr',
        CommunicationEndpointID: ep.ID,
        Reason: 'User Unsubscribe',
        Status: 'Active',
      },
      false,
    );
    store['MJ: Communication Suppressions'].push(supp);

    const log = makeRecord(
      'MJ: Communication Logs',
      store,
      {
        ID: 'log-gdpr',
        CommunicationEndpointID: ep.ID,
        RecipientAddress: 'gdpr@example.com',
        CorrelationData: JSON.stringify({ campaignId: 'c1', __deferredPayload: { Body: 'Secret body' } }),
      },
      false,
    );
    store['MJ: Communication Logs'].push(log);

    const activity = makeRecord(
      'MJ: Communication Activities',
      store,
      {
        ID: 'act-gdpr',
        CommunicationEndpointID: ep.ID,
        IPAddress: '203.0.113.42',
        UserAgent: 'CustomUA/1.0',
        CorrelationData: JSON.stringify({ campaignId: 'c1' }),
      },
      false,
    );
    store['MJ: Communication Activities'].push(activity);

    const audit = makeRecord(
      'MJ: Communication Consent Audit Logs',
      store,
      {
        ID: 'audit-gdpr',
        CommunicationSuppressionID: supp.ID,
        IPAddress: '203.0.113.42',
        UserAgent: 'CustomUA/1.0',
      },
      false,
    );
    store['MJ: Communication Consent Audit Logs'].push(audit);

    const res = await worker.EraseEndpointPII(ep.ID, 'chan-email', mockUser);

    expect(res.Found).toBe(true);
    expect(res.ScrubbedLogs).toBe(1);
    expect(res.ScrubbedActivities).toBe(1);
    expect(res.ScrubbedAuditLogs).toBe(0);

    expect(ep.Status).toBe('Erased');
    expect(ep.NormalizedValue).toBeNull();
    expect(ep.ValueHash).toBe('hash-gdpr-123');
    expect(store['MJ: Communication Suppressions']).toHaveLength(1);
    expect(log.RecipientAddress).toBeNull();
    expect(log.CorrelationData).toBeNull();
    expect(activity.IPAddress).toBeNull();
    expect(activity.UserAgent).toBeNull();
    expect(activity.CorrelationData).toBeNull();
    // Append-only consent audit log is never mutated by erasure
    expect(audit.IPAddress).toBe('203.0.113.42');
    expect(audit.UserAgent).toBe('CustomUA/1.0');
  });

  it('reports ErrorCount instead of dropping an event when CommunicationLog correlation RunView fails', async () => {
    const origFromProvider = RunView.FromMetadataProvider;
    vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((md) => {
      const rv = origFromProvider.call(RunView, md);
      const origRunView = rv.RunView.bind(rv);
      rv.RunView = vi.fn().mockImplementation(async (params: { EntityName: string }, u?: UserInfo) => {
        if (params.EntityName === 'MJ: Communication Logs') {
          return { Success: false, Results: [], ErrorMessage: 'DB read timeout' };
        }
        return origRunView(params as never, u);
      }) as typeof rv.RunView;
      return rv;
    });

    const result = await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          UnsubscribeToken: 'tok-unsub-fail',
          EventType: 'Unsubscribed',
          OccurredAt: new Date('2026-02-02T00:00:00Z'),
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );

    expect(result.ErrorCount).toBe(1);
    expect(result.ProcessedCount).toBe(0);
    expect(store['MJ: Communication Activities']).toHaveLength(0);
  });

  it('reports ErrorCount when endpoint resolution RunView fails', async () => {
    const origFromProvider = RunView.FromMetadataProvider;
    vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((md) => {
      const rv = origFromProvider.call(RunView, md);
      const origRunView = rv.RunView.bind(rv);
      rv.RunView = vi.fn().mockImplementation(async (params: { EntityName: string }, u?: UserInfo) => {
        if (params.EntityName === 'MJ: Communication Endpoints') {
          return { Success: false, Results: [], ErrorMessage: 'Endpoint table unavailable' };
        }
        return origRunView(params as never, u);
      }) as typeof rv.RunView;
      return rv;
    });

    const result = await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          CommunicationEndpointID: 'ep-1',
          EventType: 'Unsubscribed',
          OccurredAt: new Date('2026-02-02T00:00:00Z'),
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );

    expect(result.ErrorCount).toBe(1);
    expect(result.ProcessedCount).toBe(0);
  });

  it('deduplicates first-party events lacking ProviderEventID and strips __deferredPayload from CorrelationData', async () => {
    store['MJ: Communication Logs'].push(
      makeRecord(
        'MJ: Communication Logs',
        store,
        {
          ID: 'log-fp',
          CommunicationProviderID: 'prov-1',
          CommunicationSenderID: 'sender-1',
          CommunicationEndpointID: 'ep-fp',
          TrackingToken: 'tok-fp-1',
          CorrelationData: JSON.stringify({
            campaignId: 'camp-fp',
            __deferredPayload: { Subject: 'Secret', Body: 'Private body' },
          }),
        },
        false,
      ),
    );

    const occurredAt = new Date('2026-02-03T12:00:00Z');
    const first = await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          TrackingToken: 'tok-fp-1',
          EventType: 'Opened',
          OccurredAt: occurredAt,
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );
    const second = await worker.ProcessActivityBatch(
      [
        {
          CommunicationProviderID: 'prov-1',
          TrackingToken: 'tok-fp-1',
          EventType: 'Opened',
          OccurredAt: occurredAt,
          IsMachineEvent: false,
        },
      ],
      mockUser,
    );

    expect(first.ProcessedCount).toBe(1);
    expect(second.DuplicateCount).toBe(1);
    expect(second.ProcessedCount).toBe(0);
    expect(store['MJ: Communication Activities']).toHaveLength(1);
    const savedCorrelation = JSON.parse(String(store['MJ: Communication Activities'][0].CorrelationData));
    expect(savedCorrelation).toEqual({ campaignId: 'camp-fp' });
  });

  it('REGRESSION: takes the provider of an open, click or unsubscribe hit from its log, and rejects a redelivery', async () => {
    // MJ's own tracking routes do not know which provider sent the message, so the hit arrives
    // with an idempotency key and no provider. It used to be stamped with the provider named
    // "SendGrid" before it got here.
    store['MJ: Communication Logs'].push(
      makeRecord(
        'MJ: Communication Logs',
        store,
        {
          ID: 'log-mock',
          CommunicationProviderID: 'prov-local-mock',
          CommunicationSenderID: 'sender-1',
          CommunicationEndpointID: 'ep-mock',
          TrackingToken: 'tok-mock-1',
        },
        false,
      ),
    );

    // The real database refuses an empty provider ID (it is not a uniqueidentifier), so the
    // fake refuses it too: a lookup keyed on it must never be issued.
    const provider = CommunicationEngineBase.Instance.ProviderToUse;
    const runView = provider.RunView.bind(provider);
    const emptyProviderLookups: string[] = [];
    vi.spyOn(provider, 'RunView').mockImplementation(async (params: RunViewParams, user?: UserInfo) => {
      if (/CommunicationProviderID\s*=\s*''/.test(params.ExtraFilter ?? '')) {
        emptyProviderLookups.push(params.ExtraFilter ?? '');
        return {
          Success: false,
          Results: [],
          RowCount: 0,
          TotalRowCount: 0,
          ErrorMessage: 'Conversion failed when converting from a character string to uniqueidentifier.',
        } as unknown as Awaited<ReturnType<typeof runView>>;
      }
      return runView(params, user);
    });

    const hit = (): NormalizedActivityEvent => ({
      CommunicationProviderID: '',
      ProviderEventID: 'hit-click-1',
      NormalizedAddress: '',
      TrackingToken: 'tok-mock-1',
      TargetURL: 'https://example.com/landing',
      EventType: 'Clicked',
      OccurredAt: new Date('2026-03-04T12:00:00Z'),
      IsMachineEvent: false,
    });

    const first = await worker.ProcessActivityBatch([hit()], mockUser);
    const redelivered = await worker.ProcessActivityBatch([hit()], mockUser);

    expect(emptyProviderLookups).toEqual([]);
    expect(first).toMatchObject({ ProcessedCount: 1, ErrorCount: 0 });
    expect(redelivered).toMatchObject({ ProcessedCount: 0, DuplicateCount: 1, ErrorCount: 0 });
    expect(store['MJ: Communication Activities']).toHaveLength(1);
    expect(store['MJ: Communication Activities'][0]).toMatchObject({
      CommunicationLogID: 'log-mock',
      CommunicationProviderID: 'prov-local-mock',
      EventType: 'Clicked',
    });
    expect(store['MJ: Communication Provider Events'].map((r) => [r.CommunicationProviderID, r.ProviderEventID])).toEqual([
      ['prov-local-mock', 'hit-click-1'],
    ]);
  });
});
