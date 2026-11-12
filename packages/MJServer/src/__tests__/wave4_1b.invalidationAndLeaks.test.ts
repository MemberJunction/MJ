import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ResolveOriginSessionId,
  RunWithRequestSessionId,
  StampProviderOriginSessionId,
  GetCurrentRequestSessionId,
} from '../requestSessionContext.js';
import { ResolverBase, ACTIVE_ENTITY_SESSION_TTL_MS } from '../generic/ResolverBase.js';
import { BaseEntity, BaseEntityEvent, EntityInfo, CompositeKey } from '@memberjunction/core';
import { MJGlobal, MJEventType, MJEvent } from '@memberjunction/global';
import type { PubSubEngine } from 'type-graphql';
import type { UserPayload } from '../types.js';

class ConcreteResolverSubclass extends ResolverBase {
  public RegisterListener(entity: BaseEntity, pubSub: PubSubEngine, payload: UserPayload): void {
    this.ListenForEntityMessages(entity, pubSub, payload);
  }
}

function createMockEntity(entityName: string, userId: string, provider?: object): BaseEntity {
  const pkey: CompositeKey = {
    KeyValuePairs: [{ FieldName: 'ID', Value: '100' }],
    GetValue: () => '100',
    SetValue: () => {},
    Equals: () => true,
    ToString: () => 'ID=100',
    IsEmpty: () => false,
  };

  const mockInfo = {
    Name: entityName,
    CodeName: entityName.replace(/[^a-zA-Z0-9]/g, ''),
    FieldLevelSecurityApplies: false,
    PrimaryKeys: [{ Name: 'ID' }],
  } as unknown as EntityInfo;

  return {
    EntityInfo: mockInfo,
    PrimaryKey: pkey,
    PrimaryKeys: pkey,
    ProviderToUse: provider,
    ContextCurrentUser: { ID: userId },
    GetAll: () => ({ ID: '100', Name: `Sample for ${entityName}` }),
    Get: (name: string) => (name === 'ID' ? '100' : undefined),
    GetDirtyFieldNames: () => [],
  } as unknown as BaseEntity;
}

function createMockPubSub(): PubSubEngine & { publishMock: ReturnType<typeof vi.fn> } {
  const publishMock = vi.fn().mockResolvedValue(undefined);
  return {
    publish: publishMock,
    subscribe: vi.fn().mockResolvedValue(1),
    unsubscribe: vi.fn(),
    asyncIterator: vi.fn(),
    publishMock,
  } as unknown as PubSubEngine & { publishMock: ReturnType<typeof vi.fn> };
}

describe('Wave 4.1b: ResolveOriginSessionId Integration', () => {
  it('resolves null outside of request context for server-internal saves', () => {
    expect(GetCurrentRequestSessionId()).toBeNull();
    expect(ResolveOriginSessionId()).toBeNull();
    expect(ResolveOriginSessionId(null)).toBeNull();

    const entityWithoutProvider = createMockEntity('TestEntity', 'user-1');
    expect(ResolveOriginSessionId(entityWithoutProvider)).toBeNull();
  });

  it('resolves originating sessionId inside RunWithRequestSessionId', () => {
    const testSessionId = 'browser-session-xyz-123';

    RunWithRequestSessionId(testSessionId, () => {
      expect(GetCurrentRequestSessionId()).toBe(testSessionId);
      expect(ResolveOriginSessionId()).toBe(testSessionId);

      const entity = createMockEntity('TestEntity', 'user-1');
      expect(ResolveOriginSessionId(entity)).toBe(testSessionId);
    });

    // Leaves ALS context clean
    expect(GetCurrentRequestSessionId()).toBeNull();
    expect(ResolveOriginSessionId()).toBeNull();
  });

  it('resolves stamped provider sessionId and prioritizes it over ALS', () => {
    const fakeProvider = {};
    const providerSessionId = 'provider-stamped-session-456';
    StampProviderOriginSessionId(fakeProvider, providerSessionId);

    const entityWithProvider = createMockEntity('TestEntity', 'user-1', fakeProvider);

    // Outside ALS, stamped provider resolves correctly
    expect(ResolveOriginSessionId(entityWithProvider)).toBe(providerSessionId);

    // Inside ALS with a different session ID, stamped provider takes precedence
    RunWithRequestSessionId('als-session-789', () => {
      expect(ResolveOriginSessionId(entityWithProvider)).toBe(providerSessionId);

      // Unstamped entity inside ALS still falls back to ALS
      const unstampedEntity = createMockEntity('TestEntity2', 'user-1');
      expect(ResolveOriginSessionId(unstampedEntity)).toBe('als-session-789');
    });
  });

  it('safely ignores null, undefined, or empty session IDs when stamping provider', () => {
    const p1 = {};
    StampProviderOriginSessionId(p1, null);
    expect(ResolveOriginSessionId({ ProviderToUse: p1 } as unknown as BaseEntity)).toBeNull();

    const p2 = {};
    StampProviderOriginSessionId(p2, '   ');
    expect(ResolveOriginSessionId({ ProviderToUse: p2 } as unknown as BaseEntity)).toBeNull();

    // Stamping null provider is a safe no-op
    expect(() => StampProviderOriginSessionId(null, 'valid-session')).not.toThrow();
  });
});

describe('Wave 4.1b: ResolverBase.ListenForEntityMessages O(1) Shared Dispatcher', () => {
  beforeEach(() => {
    ResolverBase.ResetEntityMessageListenersForTests();
  });

  afterEach(() => {
    ResolverBase.ResetEntityMessageListenersForTests();
    vi.restoreAllMocks();
  });

  it('creates only 1 shared MJGlobal subscription across 10 distinct ResolverBase subclass instances and 10 entities', () => {
    const getEventListenerSpy = vi.spyOn(MJGlobal.Instance, 'GetEventListener');
    getEventListenerSpy.mockClear();

    expect(ResolverBase.ActiveEntityListenerCount).toBe(0);
    expect(ResolverBase.HasActiveSharedSubscription).toBe(false);

    const resolvers: ConcreteResolverSubclass[] = [];
    const pubSubs: ReturnType<typeof createMockPubSub>[] = [];

    // Register 10 distinct subclass instances for 10 distinct entities
    for (let i = 0; i < 10; i++) {
      const resolver = new ConcreteResolverSubclass();
      resolvers.push(resolver);

      const pubSub = createMockPubSub();
      pubSubs.push(pubSub);

      const entity = createMockEntity(`Entity_${i}`, `user-${i}`);
      const payload: UserPayload = {
        sessionId: `session-${i}`,
        userRecord: { ID: `user-${i}`, Email: `user${i}@example.com` } as unknown as UserPayload['userRecord'],
      };

      resolver.RegisterListener(entity, pubSub, payload);
    }

    // All 10 entities are registered in the shared dispatch map
    expect(ResolverBase.ActiveEntityListenerCount).toBe(10);
    expect(ResolverBase.HasActiveSharedSubscription).toBe(true);

    // Only 1 single subscription call to MJGlobal.Instance.GetEventListener() occurred!
    expect(getEventListenerSpy).toHaveBeenCalledTimes(1);
  });

  it('routes status updates in O(1) strictly to matching user sessions and matching entities', async () => {
    const resolvers: ConcreteResolverSubclass[] = [];
    const pubSubs: ReturnType<typeof createMockPubSub>[] = [];

    for (let i = 0; i < 10; i++) {
      const resolver = new ConcreteResolverSubclass();
      resolvers.push(resolver);

      const pubSub = createMockPubSub();
      pubSubs.push(pubSub);

      const entity = createMockEntity(`Entity_${i}`, `user-${i}`);
      const payload: UserPayload = {
        sessionId: `session-${i}`,
        userRecord: { ID: `user-${i}`, Email: `user${i}@example.com` } as unknown as UserPayload['userRecord'],
      };

      resolver.RegisterListener(entity, pubSub, payload);
    }

    // Fire an event for Entity_3 belonging to user-3
    const targetEntity = createMockEntity('Entity_3', 'user-3');
    const baseEvent = Object.assign(new BaseEntityEvent(), {
      type: 'save' as const,
      baseEntity: targetEntity,
      ChangedFieldNames: ['Name'],
    });
    const mjEvent: MJEvent = {
      component: targetEntity,
      event: MJEventType.ComponentEvent,
      eventCode: BaseEntity.BaseEventCode,
      args: baseEvent,
    };

    // Raise event through MJGlobal
    MJGlobal.Instance.RaiseEvent(mjEvent);

    // Yield macro/microtasks so async subscriber callback finishes
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Target session #3 received the status update
    expect(pubSubs[3].publishMock).toHaveBeenCalledTimes(1);

    // Verify all other 9 sessions received NOTHING
    for (let i = 0; i < 10; i++) {
      if (i !== 3) {
        expect(pubSubs[i].publishMock).not.toHaveBeenCalled();
      }
    }
  });

  it('does NOT relay status updates when event belongs to a different user', async () => {
    const resolver = new ConcreteResolverSubclass();
    const pubSub = createMockPubSub();
    const entity = createMockEntity('TargetEntity', 'authorized-user');
    const payload: UserPayload = {
      sessionId: 'session-auth',
      userRecord: { ID: 'authorized-user', Email: 'auth@example.com' } as unknown as UserPayload['userRecord'],
    };

    resolver.RegisterListener(entity, pubSub, payload);

    // Event raised by a DIFFERENT user on the same entity
    const foreignEntity = createMockEntity('TargetEntity', 'unauthorized-user');
    const baseEvent = Object.assign(new BaseEntityEvent(), {
      type: 'save' as const,
      baseEntity: foreignEntity,
      ChangedFieldNames: ['Name'],
    });
    const mjEvent: MJEvent = {
      component: foreignEntity,
      event: MJEventType.ComponentEvent,
      eventCode: BaseEntity.BaseEventCode,
      args: baseEvent,
    };

    MJGlobal.Instance.RaiseEvent(mjEvent);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Privacy guard: foreign user's event is not broadcast to authorized-user's session
    expect(pubSub.publishMock).not.toHaveBeenCalled();
  });

  it('automatically unsubscribes the shared MJGlobal subscription when all entity sessions expire', async () => {
    const baseTime = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(baseTime);

    const resolver = new ConcreteResolverSubclass();
    const pubSub = createMockPubSub();
    const entity = createMockEntity('ExpiringEntity', 'user-1');
    const payload: UserPayload = {
      sessionId: 'session-1',
      userRecord: { ID: 'user-1', Email: 'u1@example.com' } as unknown as UserPayload['userRecord'],
    };

    resolver.RegisterListener(entity, pubSub, payload);

    expect(ResolverBase.ActiveEntityListenerCount).toBe(1);
    expect(ResolverBase.HasActiveSharedSubscription).toBe(true);

    // Advance time beyond ACTIVE_ENTITY_SESSION_TTL_MS
    vi.spyOn(Date, 'now').mockReturnValue(baseTime + ACTIVE_ENTITY_SESSION_TTL_MS + 5_000);

    // Trigger event to trigger opportunistic TTL evaluation
    const baseEvent = Object.assign(new BaseEntityEvent(), {
      type: 'save' as const,
      baseEntity: entity,
      ChangedFieldNames: ['Name'],
    });
    const mjEvent: MJEvent = {
      component: entity,
      event: MJEventType.ComponentEvent,
      eventCode: BaseEntity.BaseEventCode,
      args: baseEvent,
    };

    MJGlobal.Instance.RaiseEvent(mjEvent);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Expired session is pruned, entity map drops to 0, shared subscription auto-unsubscribes
    expect(ResolverBase.ActiveEntityListenerCount).toBe(0);
    expect(ResolverBase.HasActiveSharedSubscription).toBe(false);
    expect(pubSub.publishMock).not.toHaveBeenCalled();

    // A new session dynamically re-subscribes lazily
    const freshPubSub = createMockPubSub();
    resolver.RegisterListener(entity, freshPubSub, payload);
    expect(ResolverBase.ActiveEntityListenerCount).toBe(1);
    expect(ResolverBase.HasActiveSharedSubscription).toBe(true);
  });
});
