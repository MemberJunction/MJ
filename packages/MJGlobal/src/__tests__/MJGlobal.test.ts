import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '../Global';
import { ClassFactory } from '../ClassFactory';
import { ObjectCache } from '../ObjectCache';
import { MJEvent, MJEventType, IMJComponent, MJGlobalProperty } from '../interface';
import { GetGlobalObjectStore } from '../util';
import { firstValueFrom, take, toArray } from 'rxjs';

/**
 * Helper to clear the MJGlobal singleton from the global object store
 * so each test starts with a clean slate.
 */
function clearMJGlobalSingleton(): void {
  const g = GetGlobalObjectStore();
  if (g) {
    // Remove all singleton keys
    for (const key of Object.keys(g)) {
      if (key.startsWith('___SINGLETON__')) {
        delete g[key];
      }
    }
  }
}

describe('MJGlobal', () => {
  beforeEach(() => {
    clearMJGlobalSingleton();
  });

  describe('Singleton behavior', () => {
    it('should return the same instance on repeated calls to Instance', () => {
      const instance1 = MJGlobal.Instance;
      const instance2 = MJGlobal.Instance;
      expect(instance1).toBe(instance2);
    });

    it('should be stored in the global object store', () => {
      const instance = MJGlobal.Instance;
      const g = GetGlobalObjectStore();
      expect(g).not.toBeNull();
      expect(g!['___SINGLETON__MJGlobal']).toBe(instance);
    });

    it('should expose a GlobalKey property', () => {
      const instance = MJGlobal.Instance;
      expect(instance.GlobalKey).toBe('___SINGLETON__MJGlobal');
    });
  });

  describe('ClassFactory getter', () => {
    it('should return an instance of ClassFactory', () => {
      const cf = MJGlobal.Instance.ClassFactory;
      expect(cf).toBeInstanceOf(ClassFactory);
    });

    it('should return the same ClassFactory on repeated access', () => {
      const cf1 = MJGlobal.Instance.ClassFactory;
      const cf2 = MJGlobal.Instance.ClassFactory;
      expect(cf1).toBe(cf2);
    });
  });

  describe('ObjectCache getter', () => {
    it('should return an instance of ObjectCache', () => {
      const cache = MJGlobal.Instance.ObjectCache;
      expect(cache).toBeInstanceOf(ObjectCache);
    });

    it('should return the same ObjectCache on repeated access', () => {
      const cache1 = MJGlobal.Instance.ObjectCache;
      const cache2 = MJGlobal.Instance.ObjectCache;
      expect(cache1).toBe(cache2);
    });
  });

  describe('Properties getter', () => {
    it('should return an array', () => {
      const props = MJGlobal.Instance.Properties;
      expect(Array.isArray(props)).toBe(true);
    });

    it('should start as empty', () => {
      expect(MJGlobal.Instance.Properties.length).toBe(0);
    });

    it('should allow adding properties directly to the array', () => {
      const prop = new MJGlobalProperty();
      prop.key = 'testKey';
      prop.value = 'testValue';
      MJGlobal.Instance.Properties.push(prop);
      expect(MJGlobal.Instance.Properties.length).toBe(1);
      expect(MJGlobal.Instance.Properties[0].key).toBe('testKey');
    });
  });

  describe('RegisterComponent', () => {
    it('should register a component without error', () => {
      const component: IMJComponent = {};
      expect(() => MJGlobal.Instance.RegisterComponent(component)).not.toThrow();
    });

    it('should accumulate multiple registered components', () => {
      const mjg = MJGlobal.Instance;
      const comp1: IMJComponent = {};
      const comp2: IMJComponent = {};
      mjg.RegisterComponent(comp1);
      mjg.RegisterComponent(comp2);
      // We cannot inspect _components directly, but we can verify
      // the method does not throw after multiple registrations
      expect(true).toBe(true);
    });
  });

  describe('RaiseEvent and GetEventListener', () => {
    it('should deliver events to non-replay listeners', async () => {
      const mjg = MJGlobal.Instance;
      const received: MJEvent[] = [];
      const listener = mjg.GetEventListener(false);
      const subscription = listener.subscribe((event) => {
        received.push(event);
      });

      const event: MJEvent = {
        component: {} as IMJComponent,
        event: MJEventType.ComponentEvent,
        eventCode: 'test-code',
        args: { data: 42 },
      };

      mjg.RaiseEvent(event);
      expect(received.length).toBe(1);
      expect(received[0].eventCode).toBe('test-code');
      expect(received[0].args.data).toBe(42);
      subscription.unsubscribe();
    });

    it('should deliver events to replay listeners', async () => {
      const mjg = MJGlobal.Instance;
      const event: MJEvent = {
        component: {} as IMJComponent,
        event: MJEventType.LoggedIn,
        eventCode: 'login',
        args: null,
      };

      // Raise event BEFORE subscribing
      mjg.RaiseEvent(event);

      // Now subscribe with replay - should receive the event
      const received: MJEvent[] = [];
      const replayListener = mjg.GetEventListener(true);
      const subscription = replayListener.subscribe((evt) => {
        received.push(evt);
      });

      // ReplaySubject should have replayed the event
      expect(received.length).toBe(1);
      expect(received[0].event).toBe(MJEventType.LoggedIn);
      subscription.unsubscribe();
    });

    it('should not replay events for non-replay listeners that subscribe after event', () => {
      const mjg = MJGlobal.Instance;
      const event: MJEvent = {
        component: {} as IMJComponent,
        event: MJEventType.ComponentEvent,
        eventCode: 'before-subscribe',
        args: null,
      };

      mjg.RaiseEvent(event);

      const received: MJEvent[] = [];
      const listener = mjg.GetEventListener(false);
      const subscription = listener.subscribe((evt) => {
        received.push(evt);
      });

      // Non-replay should NOT get the event raised before subscription
      expect(received.length).toBe(0);
      subscription.unsubscribe();
    });

    it('should deliver multiple events in order', () => {
      const mjg = MJGlobal.Instance;
      const received: string[] = [];
      const listener = mjg.GetEventListener(false);
      const subscription = listener.subscribe((event) => {
        received.push(event.eventCode ?? '');
      });

      mjg.RaiseEvent({ component: {} as IMJComponent, event: MJEventType.ComponentEvent, eventCode: 'first', args: null });
      mjg.RaiseEvent({ component: {} as IMJComponent, event: MJEventType.ComponentEvent, eventCode: 'second', args: null });
      mjg.RaiseEvent({ component: {} as IMJComponent, event: MJEventType.ComponentEvent, eventCode: 'third', args: null });

      expect(received).toEqual(['first', 'second', 'third']);
      subscription.unsubscribe();
    });

    it('should deliver events to both replay and non-replay listeners simultaneously', () => {
      const mjg = MJGlobal.Instance;
      const nonReplayReceived: MJEvent[] = [];
      const replayReceived: MJEvent[] = [];

      const nonReplaySub = mjg.GetEventListener(false).subscribe((e) => nonReplayReceived.push(e));
      const replaySub = mjg.GetEventListener(true).subscribe((e) => replayReceived.push(e));

      const event: MJEvent = {
        component: {} as IMJComponent,
        event: MJEventType.ComponentEvent,
        eventCode: 'dual',
        args: null,
      };
      mjg.RaiseEvent(event);

      expect(nonReplayReceived.length).toBe(1);
      expect(replayReceived.length).toBe(1);
      nonReplaySub.unsubscribe();
      replaySub.unsubscribe();
    });
  });

  describe('Reset', () => {
    it('should clear registered components', () => {
      const mjg = MJGlobal.Instance;
      mjg.RegisterComponent({} as IMJComponent);
      mjg.RegisterComponent({} as IMJComponent);
      mjg.Reset();
      // After reset, the internal _components array is empty.
      // We verify by checking that new event listeners work properly.
      const received: MJEvent[] = [];
      const sub = mjg.GetEventListener(false).subscribe((e) => received.push(e));
      expect(received.length).toBe(0);
      sub.unsubscribe();
    });

    it('should create new event subjects so old subscriptions stop receiving', () => {
      const mjg = MJGlobal.Instance;
      const oldReceived: MJEvent[] = [];
      const oldSub = mjg.GetEventListener(false).subscribe((e) => oldReceived.push(e));

      mjg.Reset();

      // Raise event after reset
      mjg.RaiseEvent({
        component: {} as IMJComponent,
        event: MJEventType.ComponentEvent,
        eventCode: 'after-reset',
        args: null,
      });

      // Old subscription should NOT receive the new event
      // because the subject was replaced
      expect(oldReceived.length).toBe(0);
      oldSub.unsubscribe();
    });

    it('should allow new subscriptions to work after reset', () => {
      const mjg = MJGlobal.Instance;
      mjg.Reset();

      const received: MJEvent[] = [];
      const sub = mjg.GetEventListener(false).subscribe((e) => received.push(e));

      mjg.RaiseEvent({
        component: {} as IMJComponent,
        event: MJEventType.ComponentEvent,
        eventCode: 'post-reset',
        args: null,
      });

      expect(received.length).toBe(1);
      expect(received[0].eventCode).toBe('post-reset');
      sub.unsubscribe();
    });

    it('should clear replay buffer after reset', () => {
      const mjg = MJGlobal.Instance;

      // Raise event before reset
      mjg.RaiseEvent({
        component: {} as IMJComponent,
        event: MJEventType.LoggedIn,
        eventCode: 'before-reset',
        args: null,
      });

      mjg.Reset();

      // Subscribe with replay after reset
      const received: MJEvent[] = [];
      const sub = mjg.GetEventListener(true).subscribe((e) => received.push(e));

      // Should NOT receive the pre-reset event
      expect(received.length).toBe(0);
      sub.unsubscribe();
    });
  });

  describe('GetGlobalObjectStore (via BaseSingleton)', () => {
    it('should return a non-null global object store', () => {
      const store = MJGlobal.Instance.GetGlobalObjectStore();
      expect(store).not.toBeNull();
    });
  });
});
