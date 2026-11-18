/**
 * Unit tests for the Communication/notifications package.
 * Tests: delivery channel resolution, type lookup, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

const { mockUserInfoEngineInstance } = vi.hoisted(() => ({
  mockUserInfoEngineInstance: {
    Config: vi.fn().mockResolvedValue(undefined),
    NotificationTypes: [] as Array<{ ID: string; Name: string; AllowUserPreference: boolean; DefaultInApp: boolean; DefaultEmail: boolean; DefaultSMS: boolean; EmailTemplateID: string | null; SMSTemplateID: string | null }>,
    GetUserPreferenceForType: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('@memberjunction/core', () => {
  const mockLoad = vi.fn().mockResolvedValue(undefined);
  const mockProvider: Record<string, unknown> = {};
  class FakeBaseEngine {
    _loaded = false;
    Load = mockLoad;
    TryThrowIfNotLoaded() {
      if (!this._loaded) {
        // For testing, just mark as loaded
        this._loaded = true;
      }
    }
    static getInstance<T>(): T {
      return new (this as unknown as { new(): T })();
    }
    get ProviderToUse() {
      return mockProvider;
    }
  }
  mockProvider.GetEntityObject = vi.fn().mockResolvedValue({
    UserID: '',
    NotificationTypeID: '',
    Title: '',
    Message: '',
    Unread: true,
    ResourceTypeID: null,
    ResourceRecordID: null,
    ResourceConfiguration: null,
    ID: 'notif-1',
    Save: vi.fn().mockResolvedValue(true),
  });
  mockProvider.EntityByName = (name: string) => (name === 'MJ: Roles' ? { ID: 'roles-entity-id' } : undefined);
  class FakeRunView {
    RunView = mockRunView;
    static FromMetadataProvider() {
      return new FakeRunView();
    }
  }
  return {
    RunView: FakeRunView,
    BaseEngine: FakeBaseEngine,
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    Metadata: class {
      GetEntityObject: <T>() => Promise<T>;
      constructor() {
        this.GetEntityObject = vi.fn().mockResolvedValue({
          UserID: '',
          NotificationTypeID: '',
          Title: '',
          Message: '',
          Unread: true,
          ResourceTypeID: null,
          ResourceRecordID: null,
          ResourceConfiguration: null,
          ID: 'notif-1',
          Save: vi.fn().mockResolvedValue(true),
        });
      }
      static Provider = {};
    },
    UserInfo: class { ID = 'user-1'; },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RegisterForStartup: () => (target: unknown) => target,
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJUserNotificationEntity: class {},
  MJUserNotificationTypeEntity: class {},
  MJUserNotificationPreferenceEntity: class {},
  UserInfoEngine: {
    Instance: mockUserInfoEngineInstance,
  },
}));

vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: {
    Instance: {
      Config: vi.fn().mockResolvedValue(undefined),
      Templates: [],
    },
  },
}));

vi.mock('@memberjunction/communication-engine', () => ({
  CommunicationEngine: {
    Instance: {
      Config: vi.fn().mockResolvedValue(undefined),
      SendSingleMessage: vi.fn().mockResolvedValue({ Success: true }),
      Providers: [{ Name: 'SendGrid' }, { Name: 'MSGraph' }, { Name: 'Twilio' }],
    },
  },
}));

vi.mock('@memberjunction/communication-types', () => ({
  Message: class {
    From = '';
    To = '';
    Subject = '';
    HTMLBodyTemplate: unknown = null;
    BodyTemplate: unknown = null;
    ContextData: Record<string, unknown> = {};
  },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: {
    Instance: {
      Users: [
        { ID: 'user-1', Email: 'user@example.com', Name: 'Test User' },
      ],
    },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { NotificationEngine } from '../NotificationEngine';
import type { SendNotificationParams } from '../types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationEngine', () => {
  let engine: NotificationEngine;
  const contextUser = { ID: 'user-1' } as InstanceType<typeof import('@memberjunction/core').UserInfo>;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new NotificationEngine();
    // Override internal _loaded state
    (engine as unknown as Record<string, boolean>)['_loaded'] = true;

    // Set up default notification types
    mockUserInfoEngineInstance.NotificationTypes = [
      {
        ID: 'type-1',
        Name: 'Agent Completion',
        AllowUserPreference: true,
        DefaultInApp: true,
        DefaultEmail: false,
        DefaultSMS: false,
        EmailTemplateID: null,
        SMSTemplateID: null,
      },
      {
        ID: 'type-2',
        Name: 'System Alert',
        AllowUserPreference: false,
        DefaultInApp: true,
        DefaultEmail: true,
        DefaultSMS: false,
        EmailTemplateID: 'tmpl-email-1',
        SMSTemplateID: null,
      },
    ];
  });

  describe('SendNotification - type lookup', () => {
    it('should fail when notification type not found', async () => {
      const params: SendNotificationParams = {
        userId: 'user-1',
        typeNameOrId: 'NonExistentType',
        title: 'Test',
        message: 'Test message',
      };

      const result = await engine.SendNotification(params, contextUser);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Notification type not found: NonExistentType');
    });

    it('should find notification type by name (case-insensitive)', async () => {
      const params: SendNotificationParams = {
        userId: 'user-1',
        typeNameOrId: 'agent completion',
        title: 'Done!',
        message: 'Your agent is done',
      };

      const result = await engine.SendNotification(params, contextUser);
      expect(result.success).toBe(true);
      expect(result.deliveryChannels.inApp).toBe(true);
    });

    it('should find notification type by ID', async () => {
      const params: SendNotificationParams = {
        userId: 'user-1',
        typeNameOrId: 'type-1',
        title: 'Done!',
        message: 'Your agent is done',
      };

      const result = await engine.SendNotification(params, contextUser);
      expect(result.success).toBe(true);
    });
  });

  describe('SendNotification - delivery channel resolution', () => {
    it('should use type defaults when no user preference exists', async () => {
      const params: SendNotificationParams = {
        userId: 'user-1',
        typeNameOrId: 'Agent Completion',
        title: 'Test',
        message: 'Test',
      };

      const result = await engine.SendNotification(params, contextUser);
      expect(result.deliveryChannels.inApp).toBe(true);
      expect(result.deliveryChannels.email).toBe(false);
      expect(result.deliveryChannels.sms).toBe(false);
    });

    it('should use forceDeliveryChannels when specified', async () => {
      const params: SendNotificationParams = {
        userId: 'user-1',
        typeNameOrId: 'Agent Completion',
        title: 'Test',
        message: 'Test',
        forceDeliveryChannels: { inApp: false, email: true, sms: true },
      };

      const result = await engine.SendNotification(params, contextUser);
      expect(result.deliveryChannels.inApp).toBe(false);
      expect(result.deliveryChannels.email).toBe(true);
      expect(result.deliveryChannels.sms).toBe(true);
    });

    it('should disable all channels when user has opted out', async () => {
      mockUserInfoEngineInstance.GetUserPreferenceForType.mockReturnValue({
        Enabled: false,
        InAppEnabled: null,
        EmailEnabled: null,
        SMSEnabled: null,
      });

      const params: SendNotificationParams = {
        userId: 'user-1',
        typeNameOrId: 'Agent Completion',
        title: 'Test',
        message: 'Test',
      };

      const result = await engine.SendNotification(params, contextUser);
      expect(result.deliveryChannels.inApp).toBe(false);
      expect(result.deliveryChannels.email).toBe(false);
      expect(result.deliveryChannels.sms).toBe(false);
    });

    it('should respect user preferences when allowed', async () => {
      mockUserInfoEngineInstance.GetUserPreferenceForType.mockReturnValue({
        Enabled: true,
        InAppEnabled: false,
        EmailEnabled: true,
        SMSEnabled: null,
      });

      const params: SendNotificationParams = {
        userId: 'user-1',
        typeNameOrId: 'Agent Completion',
        title: 'Test',
        message: 'Test',
      };

      const result = await engine.SendNotification(params, contextUser);
      expect(result.deliveryChannels.inApp).toBe(false);
      expect(result.deliveryChannels.email).toBe(true);
      expect(result.deliveryChannels.sms).toBe(false);
    });

    it('should use type defaults when AllowUserPreference is false', async () => {
      const params: SendNotificationParams = {
        userId: 'user-1',
        typeNameOrId: 'System Alert',
        title: 'Alert!',
        message: 'System message',
      };

      const result = await engine.SendNotification(params, contextUser);
      // System Alert: DefaultInApp=true, DefaultEmail=true, DefaultSMS=false
      expect(result.deliveryChannels.inApp).toBe(true);
      expect(result.deliveryChannels.email).toBe(true);
      expect(result.deliveryChannels.sms).toBe(false);
    });
  });

  describe('SendNotification - allowedDeliveryChannels (the ceiling)', () => {
    // For callers that carry their own per-record channel toggles — a Scheduled Job's
    // NotifyViaEmail/NotifyViaInApp — where the job's author and the recipient BOTH have a say.
    // The delivered set has to be the intersection of the two.

    // vi.clearAllMocks() clears CALLS but not implementations, so a preference set by one test
    // leaks into the next. Start each of these from "no preference recorded".
    beforeEach(() => {
      mockUserInfoEngineInstance.GetUserPreferenceForType.mockReturnValue(null);
    });

    const send = (allowedDeliveryChannels: SendNotificationParams['allowedDeliveryChannels']) =>
      engine.SendNotification(
        { userId: 'user-1', typeNameOrId: 'System Alert', title: 'Alert!', message: 'System message', allowedDeliveryChannels },
        contextUser,
      );

    it('subtracts a channel the caller closed, even though the type defaults it on', async () => {
      // System Alert defaults email ON; a job configured with NotifyViaEmail=false must not email.
      const result = await send({ inApp: true, email: false, sms: false });
      expect(result.deliveryChannels.inApp).toBe(true);
      expect(result.deliveryChannels.email).toBe(false);
    });

    it('CANNOT escalate — an open ceiling never turns a channel back on', async () => {
      // The property that makes this safe to expose: a caller cannot use it to bypass an opt-out.
      mockUserInfoEngineInstance.GetUserPreferenceForType.mockReturnValue({
        Enabled: false, InAppEnabled: null, EmailEnabled: null, SMSEnabled: null,
      });

      const result = await send({ inApp: true, email: true, sms: true });
      expect(result.deliveryChannels).toEqual({ inApp: false, email: false, sms: false });
    });

    it('applies over forceDeliveryChannels too — a ceiling is a ceiling', async () => {
      const result = await engine.SendNotification({
        userId: 'user-1',
        typeNameOrId: 'Agent Completion',
        title: 'Test',
        message: 'Test',
        forceDeliveryChannels: { inApp: true, email: true, sms: true },
        allowedDeliveryChannels: { email: false },
      }, contextUser);

      expect(result.deliveryChannels.inApp).toBe(true);
      expect(result.deliveryChannels.email).toBe(false);
      expect(result.deliveryChannels.sms).toBe(true);
    });

    it('leaves an omitted channel to normal resolution', async () => {
      // Partial means "no opinion", not "off" — otherwise every caller would have to restate
      // channels it does not care about.
      const result = await send({ email: false });
      expect(result.deliveryChannels.inApp).toBe(true);
    });

    it('changes nothing when absent', async () => {
      const result = await send(undefined);
      expect(result.deliveryChannels).toEqual({ inApp: true, email: true, sms: false });
    });
  });
});

describe('NotificationEngine — provider choice (#5983)', () => {
  const contextUser = { ID: 'user-1' } as InstanceType<typeof import('@memberjunction/core').UserInfo>;
  const emailType = { ID: 'type-2', Name: 'System Alert', EmailTemplateID: 'tmpl-email-1' };
  let engine: NotificationEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    engine = new NotificationEngine();
    NotificationEngine.EmailProviderName = undefined;
    NotificationEngine.SMSProviderName = undefined;
    delete process.env.NOTIFICATION_EMAIL_PROVIDER;
    const { TemplateEngineServer } = await import('@memberjunction/templates');
    (TemplateEngineServer.Instance as unknown as { Templates: Array<{ ID: string; Name: string }> }).Templates = [{ ID: 'tmpl-email-1', Name: 'Alert' }];
  });

  const sendEmail = () =>
    (engine as unknown as { sendEmail(p: unknown, t: unknown, u: unknown): Promise<boolean> }).sendEmail(
      { userId: 'user-1', typeNameOrId: 'System Alert', title: 't', message: 'm' }, emailType, contextUser);

  const providerUsed = async (): Promise<string> => {
    const { CommunicationEngine } = await import('@memberjunction/communication-engine');
    const send = CommunicationEngine.Instance.SendSingleMessage as unknown as ReturnType<typeof vi.fn>;
    return send.mock.calls[0][0] as string;
  };

  it('defaults to SendGrid', async () => {
    await sendEmail();
    expect(await providerUsed()).toBe('SendGrid');
  });

  it('uses NOTIFICATION_EMAIL_PROVIDER', async () => {
    process.env.NOTIFICATION_EMAIL_PROVIDER = 'MSGraph';
    await sendEmail();
    expect(await providerUsed()).toBe('MSGraph');
    delete process.env.NOTIFICATION_EMAIL_PROVIDER;
  });

  it('lets the host setting win over the environment', async () => {
    process.env.NOTIFICATION_EMAIL_PROVIDER = 'SendGrid';
    NotificationEngine.EmailProviderName = 'MSGraph';
    await sendEmail();
    expect(await providerUsed()).toBe('MSGraph');
    delete process.env.NOTIFICATION_EMAIL_PROVIDER;
  });

  it('fails an unknown provider with a message naming the setting', async () => {
    process.env.NOTIFICATION_EMAIL_PROVIDER = 'Postmark';
    await expect(sendEmail()).rejects.toThrow("Notification provider 'Postmark' (from NOTIFICATION_EMAIL_PROVIDER) is not a configured Communication Provider.");
    delete process.env.NOTIFICATION_EMAIL_PROVIDER;
  });
});

describe('NotificationEngine — scoped configs for locked Denies and uncached recipients (#5492)', () => {
  const contextUser = { ID: 'user-1' } as InstanceType<typeof import('@memberjunction/core').UserInfo>;
  const ROLE = 'role-restricted';
  let engine: NotificationEngine;

  const lockedRoleDeny = {
    ID: 'cfg-1', NotificationTypeID: 'type-1', PrimaryScopeEntityID: 'roles-entity-id', PrimaryScopeRecordID: ROLE,
    SecondaryScopes: null, InApp: 'Deny', Email: null, SMS: null, IsLocked: true, Priority: 0, Status: 'Active',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new NotificationEngine();
    (engine as unknown as Record<string, boolean>)['_loaded'] = true;
    mockUserInfoEngineInstance.NotificationTypes = [
      { ID: 'type-1', Name: 'Agent Completion', AllowUserPreference: true, DefaultInApp: true, DefaultEmail: false, DefaultSMS: false, EmailTemplateID: null, SMSTemplateID: null },
    ];
    (engine as unknown as { _scopedConfigs: unknown[] })._scopedConfigs = [lockedRoleDeny];
  });

  const send = (userId: string) => engine.SendNotification({ userId, typeNameOrId: 'Agent Completion', title: 't', message: 'm' }, contextUser);

  it('a seeded locked Deny suppresses the channel, even against the recipient preference', async () => {
    (engine as unknown as { _scopedConfigs: unknown[] })._scopedConfigs = [{ ...lockedRoleDeny, PrimaryScopeEntityID: null, PrimaryScopeRecordID: null }];
    mockUserInfoEngineInstance.GetUserPreferenceForType.mockReturnValueOnce({ Enabled: true, InAppEnabled: true, EmailEnabled: null, SMSEnabled: null });
    const result = await send('user-1');
    expect(result.deliveryChannels.inApp).toBe(false);
  });

  it('reads an uncached recipient\'s roles, so their role-scoped locked Deny applies', async () => {
    mockRunView.mockResolvedValueOnce({ Success: true, Results: [{ RoleID: ROLE }] });
    const result = await send('user-not-cached');
    expect(mockRunView).toHaveBeenCalledWith(expect.objectContaining({ EntityName: 'MJ: User Roles', Fields: ['RoleID'], ResultType: 'simple' }), contextUser);
    expect(result.deliveryChannels.inApp).toBe(false);
  });

  it('an uncached recipient without that role keeps the channel', async () => {
    mockRunView.mockResolvedValueOnce({ Success: true, Results: [{ RoleID: 'some-other-role' }] });
    const result = await send('user-not-cached');
    expect(result.deliveryChannels.inApp).toBe(true);
  });

  it('fails closed when the role lookup fails: every role-scoped locked Deny applies', async () => {
    mockRunView.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'db down' });
    const result = await send('user-not-cached');
    expect(result.deliveryChannels.inApp).toBe(false);
  });

  it('does not query for a cached recipient', async () => {
    await send('user-1');
    expect(mockRunView).not.toHaveBeenCalled();
  });
});
