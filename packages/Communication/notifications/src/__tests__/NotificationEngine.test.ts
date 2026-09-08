/**
 * Unit tests for the Communication/notifications package.
 * Tests: delivery channel resolution, type lookup, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
  return {
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
