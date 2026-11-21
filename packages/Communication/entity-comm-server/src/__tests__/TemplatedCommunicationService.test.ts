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
} = {
  eligibilityResult: { Sendable: [], Blocked: [] },
  templates: {},
  preferenceRows: [{ ID: 'pref-general-updates' }],
  recipientRows: [{ ID: 'cust-1', Email: 'alice@example.com', FirstName: 'Alice' }],
  relatedRows: [{ ID: 'ord-1', CustomerID: 'cust-1', Total: 99 }],
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
          QueuedCount: params.Recipients.length,
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
            Status: 'Sent',
          })),
        };
      }),
    },
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
});

describe('EntityCommunicationsEngine — V1 Compatibility via V2 pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    capturedSendCalls.length = 0;
    capturedRunViews.length = 0;

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
});
