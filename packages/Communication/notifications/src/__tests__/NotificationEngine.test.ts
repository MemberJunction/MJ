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
  }
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
  UserNotificationEntity: class {},
  UserNotificationTypeEntity: class {},
  UserNotificationPreferenceEntity: class {},
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

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
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
    (engine as Record<string, boolean>)['_loaded'] = true;

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
});
