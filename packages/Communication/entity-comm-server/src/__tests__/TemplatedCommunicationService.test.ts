import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
  EvaluateEligibilityParams,
  EvaluateEligibilityResult,
  RenderAndSendParams,
  SendToPrincipalsParams,
  SendV2Result,
} from '@memberjunction/communication-types';
import type { EntityCommunicationParams } from '@memberjunction/entity-communications-base';

const callOrder: string[] = [];
const capturedRenderContexts: Record<string, unknown>[] = [];
const capturedRunViews: Array<{ EntityName: string; ExtraFilter?: string }> = [];
const capturedEnqueued: Array<{ taskType: string; payload: unknown }> = [];
const capturedSendCalls: SendToPrincipalsParams[] = [];
const recordRunChunkDone = vi.fn().mockResolvedValue(false);

const MOCK_USER = { ID: 'user-1', Name: 'Tester' } as unknown as UserInfo;

const state: {
  eligibilityResult: EvaluateEligibilityResult;
  templates: Record<string, {
    ID: string;
    Name: string;
    Params: Array<{ Name: string; Type: string; Entity?: string; LinkedParameterField?: string; ExtraFilter?: string }>;
    GetHighestPriorityContent: (type: string) => { ID: string; TemplateText: string } | undefined;
  }>;
  preferenceRows: Array<{ ID: string }>;
  recipientRows: Array<Record<string, unknown>>;
  relatedRows: Array<Record<string, unknown>>;
  /** When true, the related-entity (Orders) RunView fails. */
  relatedFails: boolean;
  /** Recipient FirstName whose template render fails. */
  failRenderFor?: string;
  /** Endpoint address whose send outcome is Failed. */
  sendFailFor?: string;
  /** Reason on that Failed outcome (default 'ProviderError'). */
  sendFailReason?: string;
  /** When true, every send outcome is a DryRun. */
  dryRun?: boolean;
} = {
  eligibilityResult: { Sendable: [], Blocked: [] },
  templates: {},
  preferenceRows: [{ ID: 'pref-general-updates' }],
  recipientRows: [{ ID: 'cust-1', Email: 'alice@example.com', FirstName: 'Alice' }],
  relatedRows: [{ ID: 'ord-1', CustomerID: 'cust-1', Total: 99 }],
  relatedFails: false,
};

vi.mock('@memberjunction/global', () => ({
  BaseSingleton: class {
    static getInstance<T>(): T {
      return new (this as unknown as new () => T)();
    }
  },
  EscapeSQLString: (s: string) => s,
  RegisterClass: () => () => {},
  UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
}));

vi.mock('@memberjunction/core', () => {
  const entities = [
    {
      ID: 'ent-customers',
      Name: 'Customers',
      EnableFieldLevelSecurity: false,
      FieldLevelSecurityApplies: false,
      Fields: [{ Name: 'ID' }, { Name: 'Email' }, { Name: 'FirstName' }],
      FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
      PreferredCommunicationField: '',
      GetDeniedReadFields: () => new Set<string>(),
    },
    {
      ID: 'ent-orders',
      Name: 'Orders',
      EnableFieldLevelSecurity: false,
      FieldLevelSecurityApplies: false,
      Fields: [{ Name: 'ID' }, { Name: 'CustomerID' }, { Name: 'Total' }],
      FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
      PreferredCommunicationField: '',
      GetDeniedReadFields: () => new Set<string>(),
    },
  ];
  return {
    BaseEngine: class {
      protected TryThrowIfNotLoaded() {}
    },
    LogStatus: vi.fn(),
    LogError: vi.fn(),
    Metadata: Object.assign(
      vi.fn().mockImplementation(function () {
        return {
          Entities: entities,
          EntityByName: (name: string) => entities.find((e) => e.Name === name),
        };
      }),
      {
        Provider: {
          Entities: entities,
          EntityByName: (name: string) => entities.find((e) => e.Name === name),
          EntityByID: (id: string) => entities.find((e) => e.ID.toLowerCase() === id?.toLowerCase()),
        },
      },
    ),
    RunView: vi.fn().mockImplementation(function () {
      return {
        RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
          callOrder.push(`RunView:${params.EntityName}`);
          capturedRunViews.push(params);
          if (params.EntityName === 'MJ: Communication Preferences') {
            return { Success: true, Results: state.preferenceRows };
          }
          if (params.EntityName === 'Orders') {
            if (state.relatedFails) return { Success: false, Results: [], ErrorMessage: 'query timeout' };
            return { Success: true, Results: state.relatedRows };
          }
          return { Success: true, Results: state.recipientRows };
        },
      };
    }),
  };
});

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/communication-types', () => ({
  CommunicationEngineBase: {
    Instance: {
      StartRun: vi.fn().mockResolvedValue({ ID: 'run-v2-1' }),
      EndRun: vi.fn().mockResolvedValue(true),
    },
  },
  Message: class {
    Subject = '';
    Body = '';
    HTMLBody = '';
    BodyTemplate = null;
    HTMLBodyTemplate = null;
    SubjectTemplate = null;
    ContextData = {};
  },
  ProcessedMessage: class {
    To = '';
    ProcessedSubject = '';
    ProcessedBody = '';
    ProcessedHTMLBody = '';
  },
}));

vi.mock('@memberjunction/communication-engine', () => ({
  CommunicationEngine: {
    Instance: {
      Loaded: true,
      ContextUser: { ID: 'user-1' },
      Config: vi.fn(),
      Providers: [
        {
          ID: 'prov-sendgrid',
          Name: 'SendGrid',
          SupportsSending: true,
          SupportsScheduledSending: true,
          MessageTypes: [
            {
              ID: 'pmt-email',
              Name: 'Email',
              CommunicationBaseMessageTypeID: 'chan-email',
              CommunicationBaseMessageType: 'Email',
            },
          ],
        },
      ],
      EvaluateEligibility: vi.fn().mockImplementation(async (_params: EvaluateEligibilityParams) => {
        callOrder.push('EvaluateEligibility');
        return state.eligibilityResult;
      }),
      Send: vi.fn().mockImplementation(async (params: SendToPrincipalsParams): Promise<SendV2Result> => {
        callOrder.push('CommunicationEngine.Send');
        capturedSendCalls.push(params);
        return {
          Success: true,
          CommunicationRunID: 'run-v2-1',
          IsAsyncRun: false,
          TotalCount: params.Recipients.length,
          QueuedCount: state.dryRun ? 0 : params.Recipients.filter((r) => !(state.sendFailFor && r.Endpoint?.Address === state.sendFailFor)).length,
          DryRunCount: state.dryRun ? params.Recipients.length : 0,
          BlockedCount: 0,
          DeferredCount: 0,
          Outcomes: params.Recipients.map((r) => ({
            Principal: r.Principal,
            Endpoint: {
              CommunicationEndpointID: r.Endpoint?.CommunicationEndpointID ?? 'ep-1',
              ChannelID: 'chan-email',
              NormalizedValue: r.Endpoint?.Address ?? 'alice@example.com',
              ValueHash: 'hash-1',
              RawValue: r.Endpoint?.Address ?? 'alice@example.com',
            },
            Status: state.sendFailFor && r.Endpoint?.Address === state.sendFailFor ? 'Failed' : state.dryRun ? 'DryRun' : 'Sent',
            Reason: state.sendFailFor && r.Endpoint?.Address === state.sendFailFor ? (state.sendFailReason ?? 'ProviderError') : undefined,
            Detail: state.sendFailFor && r.Endpoint?.Address === state.sendFailFor ? 'mailbox full' : undefined,
          })),
        };
      }),
    },
  },
  V2SendService: class {
    RecordRunChunkDone = recordRunChunkDone;
  },
  ProcessedMessageServer: class {
    To = '';
    ProcessedSubject = '';
    ProcessedBody = '';
    ProcessedHTMLBody = '';
  },
}));

vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: {
    Instance: {
      Loaded: true,
      Config: vi.fn(),
      FindTemplateByID: vi.fn().mockImplementation((id: string) => state.templates[id]),
      RenderTemplate: vi.fn().mockImplementation(
        async (
          template: { Name: string },
          content: { TemplateText: string },
          data: Record<string, unknown>,
        ) => {
          callOrder.push(`RenderTemplate:${template.Name}`);
          capturedRenderContexts.push(data);
          const recipient = data['Recipient'] as Record<string, unknown> | undefined;
          const fullName = String(recipient?.['FullName'] ?? '');
          if (
            state.failRenderFor &&
            (recipient?.['FirstName'] === state.failRenderFor || fullName.startsWith(`${state.failRenderFor} `))
          ) {
            return { Success: false, Message: 'unknown filter' };
          }
          return {
            Success: true,
            Output: `${content.TemplateText}|sender=${String((data['Sender'] as Record<string, unknown>)?.['BrandName'] ?? '')}`,
          };
        },
      ),
    },
  },
}));

vi.mock('@memberjunction/entity-communications-base', () => {
  class MockBase {
    protected TryThrowIfNotLoaded() {}
    static getInstance<T>(): T {
      return new (this as unknown as new () => T)();
    }
    GetEntityCommunicationMessageTypes() {
      return [
        {
          BaseMessageTypeID: 'chan-email',
          CommunicationFields: [{ FieldName: 'Email', Priority: 1 }],
        },
      ];
    }
    EntitySupportsCommunication() {
      return true;
    }
  }
  return {
    EntityCommunicationsEngineBase: MockBase,
  };
});

import { TemplatedCommunicationService, RenderBatchPayload } from '../TemplatedCommunicationService';
import { EntityCommunicationsEngine } from '../entity-communications';

function makeTemplate(
  id: string,
  name: string,
  text: string,
  params: Array<{ Name: string; Type: string; Entity?: string; LinkedParameterField?: string }> = [],
) {
  return {
    ID: id,
    Name: name,
    Params: params,
    GetHighestPriorityContent: (ct: string) =>
      ct === 'HTML' || ct === 'Text' ? { ID: `${id}-content`, TemplateText: text } : undefined,
  };
}

describe('TemplatedCommunicationService', () => {
  let service: TemplatedCommunicationService;

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    capturedRenderContexts.length = 0;
    capturedRunViews.length = 0;
    capturedEnqueued.length = 0;
    capturedSendCalls.length = 0;
    state.relatedFails = false;
    state.failRenderFor = undefined;
    state.sendFailFor = undefined;
    state.sendFailReason = undefined;
    state.dryRun = false;

    service = TemplatedCommunicationService.Instance;
    service.Configure({ BatchSize: 500, EnqueueWork: undefined });

    state.templates = {
      'tpl-subj': makeTemplate('tpl-subj', 'SubjectTpl', 'Hello Subject'),
      'tpl-body': makeTemplate('tpl-body', 'BodyTpl', 'Hello Body', [
        { Name: 'orders', Type: 'Entity', Entity: 'Orders', LinkedParameterField: 'CustomerID' },
      ]),
      'tpl-html': makeTemplate('tpl-html', 'HtmlTpl', '<p>Hello HTML</p>', [
        { Name: 'orders', Type: 'Entity', Entity: 'Orders', LinkedParameterField: 'CustomerID' },
      ]),
    };

    state.eligibilityResult = {
      Sendable: [
        {
          Principal: { EntityID: 'ent-customers', RecordID: 'cust-1', RecordData: { FirstName: 'Alice' } },
          Endpoint: {
            CommunicationEndpointID: 'ep-1',
            ChannelID: 'chan-email',
            NormalizedValue: 'alice@example.com',
            ValueHash: 'hash-1',
            RawValue: 'alice@example.com',
          },
          Decision: 'Allowed',
          Obligations: {
            RequireOneClickHeader: true,
            RequireFooterUnsubscribe: true,
            RequireSenderPostalAddress: true,
            SenderPostalAddress: '123 Main St',
            SenderName: 'Acme Corp',
            AllowOpenPixel: true,
            AllowClickTracking: true,
            UnsubscribeURL: 'https://example.com/unsub/1',
          },
          SenderTemplateContext: { BrandName: 'Acme' },
          PrincipalAttributes: { FullName: 'Alice Smith', Timezone: 'America/Chicago' },
        },
      ],
      Blocked: [],
    };
  });

  it('runs EvaluateEligibility BEFORE GetRelatedData and triggers zero RunViews/renders when all recipients are blocked', async () => {
    state.eligibilityResult = {
      Sendable: [],
      Blocked: [
        {
          Principal: { EntityID: 'ent-customers', RecordID: 'cust-1' },
          Reason: 'Suppressed',
        },
      ],
    };

    const params: RenderAndSendParams = {
      Envelope: { MessageClass: 'Marketing', ChannelID: 'chan-email' },
      EntityID: 'ent-customers',
      Recipients: [{ Principal: { EntityID: 'ent-customers', RecordID: 'cust-1' } }],
      Templates: {
        SubjectTemplateID: 'tpl-subj',
        BodyTemplateID: 'tpl-body',
        HTMLBodyTemplateID: 'tpl-html',
      },
      RenderMode: 'Inline',
    };

    const result = await service.RenderAndSend(params, MOCK_USER);
    expect(result.Success).toBe(true);
    expect(result.BlockedCount).toBe(1);
    expect(result.QueuedCount).toBe(0);
    expect(callOrder).toEqual(['EvaluateEligibility']);
    expect(capturedRunViews).toHaveLength(0);
    expect(capturedRenderContexts).toHaveLength(0);
  });

  it('executes EvaluateEligibility before RunView(Orders) and injects Sender, Recipient, and Comms.Obligations', async () => {
    const params: RenderAndSendParams = {
      Envelope: { MessageClass: 'Marketing', ChannelID: 'chan-email' },
      EntityID: 'ent-customers',
      Recipients: [
        {
          Principal: { EntityID: 'ent-customers', RecordID: 'cust-1', RecordData: { FirstName: 'Alice' } },
          ContextData: { CustomVar: 'VIP' },
        },
      ],
      Templates: {
        SubjectTemplateID: 'tpl-subj',
        BodyTemplateID: 'tpl-body',
        HTMLBodyTemplateID: 'tpl-html',
        SharedContextData: { Campaign: 'Spring' },
      },
      AutoAppendComplianceFooter: true,
      RenderMode: 'Inline',
    };

    const result = await service.RenderAndSend(params, MOCK_USER);
    expect(result.Success).toBe(true);

    // Ordering: EvaluateEligibility -> RunView:Orders -> RenderTemplate -> CommunicationEngine.Send
    const evalIdx = callOrder.indexOf('EvaluateEligibility');
    const ordersIdx = callOrder.indexOf('RunView:Orders');
    const renderIdx = callOrder.findIndex((c) => c.startsWith('RenderTemplate:'));
    const sendIdx = callOrder.indexOf('CommunicationEngine.Send');
    expect(evalIdx).toBe(0);
    expect(ordersIdx).toBeGreaterThan(evalIdx);
    expect(renderIdx).toBeGreaterThan(ordersIdx);
    expect(sendIdx).toBeGreaterThan(renderIdx);

    // Context injection verification
    expect(capturedRenderContexts.length).toBeGreaterThan(0);
    const ctx = capturedRenderContexts[0];
    expect(ctx['Sender']).toEqual({ BrandName: 'Acme' });
    expect((ctx['Recipient'] as Record<string, unknown>)['FirstName']).toBe('Alice');
    expect((ctx['Recipient'] as Record<string, unknown>)['FullName']).toBe('Alice Smith');
    expect((ctx['Comms'] as { Obligations: { UnsubscribeURL: string } }).Obligations.UnsubscribeURL).toBe(
      'https://example.com/unsub/1',
    );
    expect(ctx['Campaign']).toBe('Spring');
    expect(ctx['CustomVar']).toBe('VIP');
    expect(ctx['orders']).toEqual([{ ID: 'ord-1', CustomerID: 'cust-1', Total: 99 }]);

    // Compliance footer auto-appended
    const sentOverride = capturedSendCalls[0].Recipients[0].PayloadOverride;
    expect(sentOverride?.HTMLBody).toContain('data-mj-compliance-footer="true"');
    expect(sentOverride?.HTMLBody).toContain('https://example.com/unsub/1');
    expect(sentOverride?.Body).toContain('123 Main St');
  });

  it('REGRESSION: renders and sends in process when no work queue is configured', async () => {
    // The default path, not RenderMode 'Inline'. With no queue it renders in the calling process,
    // and the render step refuses a batch that does not name the acting user. That name was only
    // set on the queued path, so this path failed for every sendable recipient.
    const result = await service.RenderAndSend(
      {
        Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' },
        EntityID: 'ent-customers',
        Recipients: [{ Principal: { EntityID: 'ent-customers', RecordID: 'cust-1', RecordData: { FirstName: 'Alice' } } }],
        Templates: { HTMLBodyTemplateID: 'tpl-html' },
      },
      MOCK_USER,
    );

    expect(result.ErrorMessage).toBeUndefined();
    expect(result.Success).toBe(true);
    expect(capturedEnqueued).toEqual([]);
    expect(capturedSendCalls).toHaveLength(1);
  });

  describe('render failure isolation', () => {
    function addBob(): void {
      const alice = state.eligibilityResult.Sendable[0];
      state.eligibilityResult = {
        ...state.eligibilityResult,
        Sendable: [
          alice,
          {
            ...alice,
            Principal: { EntityID: 'ent-customers', RecordID: 'cust-2', RecordData: { FirstName: 'Bob' } },
            Endpoint: { ...alice.Endpoint, CommunicationEndpointID: 'ep-2', NormalizedValue: 'bob@example.com', RawValue: 'bob@example.com' },
          },
        ],
      };
    }
    const twoRecipients = [
      { Principal: { EntityID: 'ent-customers', RecordID: 'cust-1', RecordData: { FirstName: 'Alice' } } },
      { Principal: { EntityID: 'ent-customers', RecordID: 'cust-2', RecordData: { FirstName: 'Bob' } } },
    ];

    it('one recipient failing to render is reported Failed (RenderFailed) and the rest still send', async () => {
      addBob();
      state.failRenderFor = 'Bob';
      const result = await service.RenderAndSend(
        {
          Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' },
          EntityID: 'ent-customers',
          Recipients: twoRecipients,
          Templates: { SubjectTemplateID: 'tpl-subj' },
        },
        MOCK_USER,
      );

      expect(capturedSendCalls).toHaveLength(1);
      expect(capturedSendCalls[0].Recipients.map((r) => r.Principal?.RecordID)).toEqual(['cust-1']);
      const bob = result.Outcomes?.find((o) => o.Principal?.RecordID === 'cust-2');
      expect(bob?.Status).toBe('Failed');
      expect(bob?.Reason).toBe('RenderFailed');
      expect(bob?.Detail).toContain('unknown filter');
      expect(result.Outcomes?.find((o) => o.Principal?.RecordID === 'cust-1')?.Status).toBe('Sent');
    });

    it('ends the run exactly once even when a batch throws, and reports the later batches', async () => {
      const { CommunicationEngineBase } = await import('@memberjunction/communication-types');
      addBob();
      service.Configure({ BatchSize: 1, EnqueueWork: undefined });
      const { CommunicationEngine } = await import('@memberjunction/communication-engine');
      vi.mocked(CommunicationEngine.Instance.Send).mockRejectedValueOnce(new Error('provider exploded'));

      const result = await service.RenderAndSend(
        {
          Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' },
          EntityID: 'ent-customers',
          Recipients: twoRecipients,
          Templates: { SubjectTemplateID: 'tpl-subj' },
        },
        MOCK_USER,
      );

      expect(CommunicationEngineBase.Instance.EndRun).toHaveBeenCalledTimes(1);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('provider exploded');
      const statuses = result.Outcomes?.map((o) => `${o.Principal?.RecordID}:${o.Status}`);
      expect(statuses).toEqual(['cust-1:Failed', 'cust-2:Sent']);
    });

    it('a failed related-data read fails every recipient in the batch instead of rendering empty merge fields', async () => {
      state.relatedFails = true;
      const result = await service.RenderAndSend(
        {
          Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' },
          EntityID: 'ent-customers',
          Recipients: [{ Principal: { EntityID: 'ent-customers', RecordID: 'cust-1', RecordData: { FirstName: 'Alice' } } }],
          Templates: { BodyTemplateID: 'tpl-body' },
        },
        MOCK_USER,
      );

      expect(capturedSendCalls).toHaveLength(0);
      expect(capturedRenderContexts).toHaveLength(0);
      expect(result.QueuedCount).toBe(0);
      expect(result.Outcomes?.[0].Status).toBe('Failed');
      expect(result.Outcomes?.[0].Reason).toBe('RenderFailed');
      expect(result.Outcomes?.[0].Detail).toContain('query timeout');
    });
  });

  it('throws when template parameters have mismatched types across templates', async () => {
    state.templates['tpl-html'] = makeTemplate('tpl-html', 'HtmlTpl', '<p>HTML</p>', [
      { Name: 'orders', Type: 'Record' },
    ]);

    const params: RenderAndSendParams = {
      Envelope: { MessageClass: 'Marketing', ChannelID: 'chan-email' },
      EntityID: 'ent-customers',
      Recipients: [{ Principal: { EntityID: 'ent-customers', RecordID: 'cust-1' } }],
      Templates: {
        BodyTemplateID: 'tpl-body',
        HTMLBodyTemplateID: 'tpl-html',
      },
    };

    await expect(service.RenderAndSend(params, MOCK_USER)).rejects.toThrow(
      /Parameter orders has different types/,
    );
  });

  it('batches Sendable recipients to comms.render in WorkQueue mode and HandleRenderBatch renders and calls Send()', async () => {
    service.Configure({
      BatchSize: 1,
      EnqueueWork: async (taskType, payload) => {
        capturedEnqueued.push({ taskType, payload });
      },
    });

    const secondSendable = {
      ...state.eligibilityResult.Sendable[0],
      Principal: { EntityID: 'ent-customers', RecordID: 'cust-2', RecordData: { FirstName: 'Bob' } },
      Endpoint: {
        ...state.eligibilityResult.Sendable[0].Endpoint,
        CommunicationEndpointID: 'ep-2',
        NormalizedValue: 'bob@example.com',
        RawValue: 'bob@example.com',
      },
    };
    state.eligibilityResult.Sendable.push(secondSendable);

    const params: RenderAndSendParams = {
      Envelope: { MessageClass: 'Marketing', ChannelID: 'chan-email' },
      EntityID: 'ent-customers',
      Recipients: [
        { Principal: { EntityID: 'ent-customers', RecordID: 'cust-1' } },
        { Principal: { EntityID: 'ent-customers', RecordID: 'cust-2' } },
      ],
      Templates: {
        SubjectTemplateID: 'tpl-subj',
        BodyTemplateID: 'tpl-body',
        HTMLBodyTemplateID: 'tpl-html',
      },
      AutoAppendComplianceFooter: true,
    };

    const queueResult = await service.RenderAndSend(params, MOCK_USER);
    expect(queueResult.Success).toBe(true);
    expect(queueResult.IsAsyncRun).toBe(true);
    expect(queueResult.CommunicationRunID).toBe('run-v2-1');
    expect(queueResult.QueuedCount).toBe(2);
    expect(capturedEnqueued).toHaveLength(2);
    expect(capturedEnqueued[0].taskType).toBe('comms.render');
    expect(capturedSendCalls).toHaveLength(0);

    // Now execute worker handler for the first batch
    const batchResult = await service.HandleRenderBatch(
      capturedEnqueued[0].payload as RenderBatchPayload,
      MOCK_USER,
    );
    expect(batchResult.Success).toBe(true);
    expect(capturedSendCalls).toHaveLength(1);
    expect(capturedSendCalls[0].Recipients).toHaveLength(1);
    expect(capturedSendCalls[0].Recipients[0].PayloadOverride?.Subject).toContain('Hello Subject');
  });

  describe('run completion on the queued path', () => {
    const recipients = [
      { Principal: { EntityID: 'ent-customers', RecordID: 'cust-1' } },
      { Principal: { EntityID: 'ent-customers', RecordID: 'cust-2' } },
    ];
    function queueTwoBatches(): void {
      service.Configure({
        BatchSize: 1,
        EnqueueWork: async (taskType, payload) => {
          capturedEnqueued.push({ taskType, payload });
        },
      });
      const alice = state.eligibilityResult.Sendable[0];
      state.eligibilityResult.Sendable.push({
        ...alice,
        Principal: { EntityID: 'ent-customers', RecordID: 'cust-2', RecordData: { FirstName: 'Bob' } },
        Endpoint: { ...alice.Endpoint, CommunicationEndpointID: 'ep-2', NormalizedValue: 'bob@example.com', RawValue: 'bob@example.com' },
      });
    }

    it('stamps RunChunk on every comms.render batch and does not end the run itself', async () => {
      const { CommunicationEngineBase } = await import('@memberjunction/communication-types');
      queueTwoBatches();
      await service.RenderAndSend(
        { Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' }, EntityID: 'ent-customers', Recipients: recipients, Templates: { SubjectTemplateID: 'tpl-subj' } },
        MOCK_USER,
      );
      const chunks = capturedEnqueued.map((e) => (e.payload as RenderBatchPayload).RunChunk);
      expect(chunks).toEqual([{ Index: 0, Count: 2 }, { Index: 1, Count: 2 }]);
      expect(CommunicationEngineBase.Instance.EndRun).not.toHaveBeenCalled();
    });

    it('HandleRenderBatch passes the batch RunChunk into Send()', async () => {
      queueTwoBatches();
      await service.RenderAndSend(
        { Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' }, EntityID: 'ent-customers', Recipients: recipients, Templates: { SubjectTemplateID: 'tpl-subj' } },
        MOCK_USER,
      );
      await service.HandleRenderBatch(capturedEnqueued[1].payload as RenderBatchPayload, MOCK_USER);
      expect(capturedSendCalls[0].CommunicationRunID).toBe('run-v2-1');
      expect(capturedSendCalls[0].RunChunk).toEqual({ Index: 1, Count: 2 });
      expect(recordRunChunkDone).not.toHaveBeenCalled();
    });

    it('a batch whose recipients all fail to render still records its chunk, so the run can end', async () => {
      queueTwoBatches();
      state.failRenderFor = 'Alice';
      await service.RenderAndSend(
        { Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' }, EntityID: 'ent-customers', Recipients: recipients, Templates: { SubjectTemplateID: 'tpl-subj' } },
        MOCK_USER,
      );
      const result = await service.HandleRenderBatch(capturedEnqueued[0].payload as RenderBatchPayload, MOCK_USER);
      expect(capturedSendCalls).toHaveLength(0);
      expect(result.Outcomes?.[0].Reason).toBe('RenderFailed');
      expect(recordRunChunkDone).toHaveBeenCalledWith('run-v2-1', { Index: 0, Count: 2 }, MOCK_USER);
    });

    it('a batch whose acting user cannot be resolved still records its chunk', async () => {
      queueTwoBatches();
      await service.RenderAndSend(
        { Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' }, EntityID: 'ent-customers', Recipients: recipients, Templates: { SubjectTemplateID: 'tpl-subj' } },
        MOCK_USER,
      );
      const payload = { ...(capturedEnqueued[1].payload as RenderBatchPayload), ActingUserID: 'someone-else' };
      const result = await service.HandleRenderBatch(payload, MOCK_USER);
      expect(result.Success).toBe(false);
      expect(recordRunChunkDone).toHaveBeenCalledWith('run-v2-1', { Index: 1, Count: 2 }, MOCK_USER);
    });

    it('the in-process path sends without RunChunk and ends the run itself', async () => {
      const { CommunicationEngineBase } = await import('@memberjunction/communication-types');
      await service.RenderAndSend(
        { Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email' }, EntityID: 'ent-customers', Recipients: [recipients[0]], Templates: { SubjectTemplateID: 'tpl-subj' } },
        MOCK_USER,
      );
      expect(capturedSendCalls[0].RunChunk).toBeUndefined();
      expect(CommunicationEngineBase.Instance.EndRun).toHaveBeenCalledTimes(1);
      expect(recordRunChunkDone).not.toHaveBeenCalled();
    });
  });
});

describe('EntityCommunicationsEngine — V1 Compatibility via V2 pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    capturedSendCalls.length = 0;
    capturedRunViews.length = 0;
    state.relatedFails = false;
    state.failRenderFor = undefined;
    state.sendFailFor = undefined;
    state.sendFailReason = undefined;
    state.dryRun = false;

    TemplatedCommunicationService.Instance.Configure({ BatchSize: 500, EnqueueWork: undefined });
    state.templates = {
      'tpl-body': {
        ID: 'tpl-body',
        Name: 'BodyTpl',
        Params: [],
        GetHighestPriorityContent: (ct: string) =>
          ct === 'Text' || ct === 'HTML' ? { ID: 'c1', TemplateText: 'Hi {{ Recipient.FirstName }}' } : undefined,
      },
    };
    state.eligibilityResult = {
      Sendable: [
        {
          Principal: { EntityID: 'ent-customers', RecordID: 'cust-1', RecordData: { FirstName: 'Alice' } },
          Endpoint: {
            CommunicationEndpointID: 'ep-1',
            ChannelID: 'chan-email',
            NormalizedValue: 'alice@example.com',
            ValueHash: 'hash-1',
            RawValue: 'alice@example.com',
          },
          Decision: 'Allowed',
          Obligations: {
            RequireOneClickHeader: true,
            RequireFooterUnsubscribe: true,
            RequireSenderPostalAddress: true,
            SenderPostalAddress: '123 Main St',
            AllowOpenPixel: true,
            AllowClickTracking: true,
            UnsubscribeURL: 'https://example.com/unsub/v1',
          },
          SenderTemplateContext: { BrandName: 'Acme' },
        },
      ],
      Blocked: [],
    };
  });

  it('routes V1 RunEntityCommunication through EvaluateEligibility + TemplatedCommunicationService with Operational/footer defaults', async () => {
    const engine = new EntityCommunicationsEngine();
    const v1Params = {
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: {
        BodyTemplate: state.templates['tpl-body'],
        HTMLBodyTemplate: null,
        SubjectTemplate: null,
        ContextData: {},
      },
      PreviewOnly: false,
      IncludeProcessedMessages: true,
      UseV2: true,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams;

    const result = await engine.RunEntityCommunication(v1Params);
    expect(result.Success).toBe(true);
    expect(result.Results).toHaveLength(1);
    expect(capturedSendCalls).toHaveLength(1);

    const envelope = capturedSendCalls[0].Envelope;
    expect(envelope.SenderID).toBeUndefined(); // V2SendService defaults to IsDefault = 1
    expect(envelope.PreferenceID).toBeUndefined();
    expect(envelope.MessageClass).toBe('Operational');
    expect(capturedSendCalls[0].Recipients[0].PayloadOverride?.HTMLBody).toContain('data-mj-compliance-footer="true"');
  });

  it('forwards literal Subject/Body/HTMLBody and DryRun for non-templated V1 RunEntityCommunication calls', async () => {
    const engine = new EntityCommunicationsEngine();
    const v1Params = {
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: {
        Subject: 'Literal V1 Subject',
        Body: 'Literal V1 Body',
        HTMLBody: '<p>Literal V1 HTML</p>',
        DryRun: true,
        ContextData: {},
      },
      PreviewOnly: false,
      UseV2: true,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams;

    const result = await engine.RunEntityCommunication(v1Params);
    expect(result.Success).toBe(true);
    expect(capturedSendCalls).toHaveLength(1);
    expect(capturedSendCalls[0].Envelope.MessageClass).toBe('Operational');
    expect(capturedSendCalls[0].Envelope.DryRun).toBe(true);
    expect(capturedSendCalls[0].Payload).toMatchObject({
      Subject: 'Literal V1 Subject',
      Body: 'Literal V1 Body',
      HTMLBody: '<p>Literal V1 HTML</p>',
    });
  });

  it('supports V1 PreviewOnly without calling CommunicationEngine.Send and returns ProcessedMessage', async () => {
    const engine = new EntityCommunicationsEngine();
    const v1Params = {
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: {
        BodyTemplate: state.templates['tpl-body'],
        HTMLBodyTemplate: null,
        SubjectTemplate: null,
        ContextData: {},
      },
      PreviewOnly: true,
      IncludeProcessedMessages: true,
      UseV2: true,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams;

    const result = await engine.RunEntityCommunication(v1Params);
    expect(result.Success).toBe(true);
    expect(result.Results).toHaveLength(1);
    expect(result.Results?.[0].Message.ProcessedBody).toContain('Hi {{ Recipient.FirstName }}');
    expect(capturedSendCalls).toHaveLength(0);
  });

  it('keeps V1 RunEntityCommunication on the V1 path by default when UseV2 is not set', async () => {
    const engine = new EntityCommunicationsEngine();
    const v1Params = {
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: {
        Subject: 'Literal V1 Subject',
        Body: 'Literal V1 Body',
        ContextData: {},
      },
      PreviewOnly: false,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams;

    await engine.RunEntityCommunication(v1Params);
    expect(capturedSendCalls).toHaveLength(0);
  });
  it('reports a Failed V2 outcome as a V1 failure: the item is kept, the error is surfaced, Success is false', async () => {
    state.sendFailFor = 'alice@example.com';
    const engine = new EntityCommunicationsEngine();
    const result = await engine.RunEntityCommunication({
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: { BodyTemplate: state.templates['tpl-body'], HTMLBodyTemplate: null, SubjectTemplate: null, ContextData: {} },
      PreviewOnly: false,
      IncludeProcessedMessages: true,
      UseV2: true,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams);

    expect(result.Success).toBe(false);
    expect(result.Results).toHaveLength(1);
    expect(result.Results?.[0].Skipped).toBeUndefined();
    expect(result.ErrorMessage).toContain('ProviderError');
    expect(result.ErrorMessage).toContain('mailbox full');
  });

  it('reports a Failed V2 outcome as a failure on the non-templated path too', async () => {
    state.sendFailFor = 'alice@example.com';
    const { CommunicationEngine } = await import('@memberjunction/communication-engine');
    const engine = new EntityCommunicationsEngine();
    const result = await engine.RunEntityCommunication({
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: { Subject: 'S', Body: 'B', ContextData: {} },
      PreviewOnly: false,
      UseV2: true,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams);

    expect(CommunicationEngine.Instance.Send).toHaveBeenCalledTimes(1);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('mailbox full');
  });

  it('PreviewOnly reports a recipient whose message could not be rendered as a failure', async () => {
    state.failRenderFor = 'Alice';
    const engine = new EntityCommunicationsEngine();
    const result = await engine.RunEntityCommunication({
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: { BodyTemplate: state.templates['tpl-body'], HTMLBodyTemplate: null, SubjectTemplate: null, ContextData: {} },
      PreviewOnly: true,
      UseV2: true,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams);

    expect(capturedSendCalls).toHaveLength(0);
    expect(result.Success).toBe(false);
    expect(result.Results).toHaveLength(1);
    expect(result.Results?.[0].Message).toBeUndefined();
    expect(result.ErrorMessage).toContain('unknown filter');
  });
  it('reports a DryRun V2 send as a successful V1 result, as a V1 dry run does', async () => {
    state.dryRun = true;
    const engine = new EntityCommunicationsEngine();
    const result = await engine.RunEntityCommunication({
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: { Subject: 'S', Body: 'B', ContextData: {}, DryRun: true },
      PreviewOnly: false,
      UseV2: true,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams);

    expect(result.Success).toBe(true);
    expect(result.Results).toHaveLength(1);
    expect(result.Results?.[0].Skipped).toBeUndefined();
    expect(result.Results?.[0].Message).toBeDefined();
  });

  it('reports an OutcomeUnknown V2 outcome as a V1 failure', async () => {
    state.sendFailFor = 'alice@example.com';
    state.sendFailReason = 'OutcomeUnknown';
    const engine = new EntityCommunicationsEngine();
    const result = await engine.RunEntityCommunication({
      EntityID: 'ent-customers',
      RunViewParams: { ViewID: 'view-1' },
      ProviderName: 'SendGrid',
      ProviderMessageTypeName: 'Email',
      Message: { Subject: 'S', Body: 'B', ContextData: {} },
      PreviewOnly: false,
      UseV2: true,
      ContextUser: MOCK_USER,
    } as unknown as EntityCommunicationParams);

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('OutcomeUnknown');
  });
});
