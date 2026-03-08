import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry, PreRunViewHook, PostRunViewHook, PreSaveHook, HookRegistrationOptions } from '../generic/hookRegistry';

describe('HookRegistry', () => {
  beforeEach(() => {
    HookRegistry.ClearAll();
  });

  describe('Register and GetHooks', () => {
    it('should return empty array when no hooks registered', () => {
      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toEqual([]);
    });

    it('should register and retrieve a single hook', () => {
      const hook: PreRunViewHook = (params) => params;
      HookRegistry.Register('PreRunView', hook);

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hook);
    });

    it('should register multiple hooks in order', () => {
      const hook1: PreRunViewHook = (params) => params;
      const hook2: PreRunViewHook = (params) => params;
      const hook3: PreRunViewHook = (params) => params;

      HookRegistry.Register('PreRunView', hook1);
      HookRegistry.Register('PreRunView', hook2);
      HookRegistry.Register('PreRunView', hook3);

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(3);
      expect(hooks[0]).toBe(hook1);
      expect(hooks[1]).toBe(hook2);
      expect(hooks[2]).toBe(hook3);
    });

    it('should keep hooks separated by name', () => {
      const preHook: PreRunViewHook = (params) => params;
      const postHook: PostRunViewHook = (params, results) => results;
      const saveHook: PreSaveHook = () => true;

      HookRegistry.Register('PreRunView', preHook);
      HookRegistry.Register('PostRunView', postHook);
      HookRegistry.Register('PreSave', saveHook);

      expect(HookRegistry.GetHooks('PreRunView')).toHaveLength(1);
      expect(HookRegistry.GetHooks('PostRunView')).toHaveLength(1);
      expect(HookRegistry.GetHooks('PreSave')).toHaveLength(1);
    });
  });

  describe('Clear', () => {
    it('should clear hooks for a specific name', () => {
      HookRegistry.Register('PreRunView', (params) => params);
      HookRegistry.Register('PostRunView', (params, results) => results);

      HookRegistry.Clear('PreRunView');

      expect(HookRegistry.GetHooks('PreRunView')).toHaveLength(0);
      expect(HookRegistry.GetHooks('PostRunView')).toHaveLength(1);
    });

    it('should be safe to clear a name that has no hooks', () => {
      expect(() => HookRegistry.Clear('PreRunView')).not.toThrow();
    });
  });

  describe('ClearAll', () => {
    it('should clear all hooks across all names', () => {
      HookRegistry.Register('PreRunView', (params) => params);
      HookRegistry.Register('PostRunView', (params, results) => results);
      HookRegistry.Register('PreSave', () => true);

      HookRegistry.ClearAll();

      expect(HookRegistry.GetHooks('PreRunView')).toHaveLength(0);
      expect(HookRegistry.GetHooks('PostRunView')).toHaveLength(0);
      expect(HookRegistry.GetHooks('PreSave')).toHaveLength(0);
    });
  });

  describe('Hook execution patterns', () => {
    it('should support async PreRunView hooks that modify params', async () => {
      const hook: PreRunViewHook = async (params) => {
        return { ...params, ExtraFilter: `${params.ExtraFilter ?? ''} AND TenantID = '123'`.trim() };
      };
      HookRegistry.Register('PreRunView', hook);

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      let params = { EntityName: 'Test', ExtraFilter: "Status = 'Active'" } as Parameters<PreRunViewHook>[0];
      for (const h of hooks) {
        params = await h(params, undefined);
      }

      expect(params.ExtraFilter).toBe("Status = 'Active' AND TenantID = '123'");
    });

    it('should support PreSave hooks that reject saves', async () => {
      const rejectHook: PreSaveHook = () => 'Tenant mismatch';
      HookRegistry.Register('PreSave', rejectHook);

      const hooks = HookRegistry.GetHooks<PreSaveHook>('PreSave');
      const result = await hooks[0](null as Parameters<PreSaveHook>[0], undefined);
      expect(result).toBe('Tenant mismatch');
    });

    it('should support PreSave hooks that allow saves', async () => {
      const allowHook: PreSaveHook = () => true;
      HookRegistry.Register('PreSave', allowHook);

      const hooks = HookRegistry.GetHooks<PreSaveHook>('PreSave');
      const result = await hooks[0](null as Parameters<PreSaveHook>[0], undefined);
      expect(result).toBe(true);
    });
  });

  describe('Priority ordering', () => {
    it('should return hooks sorted by priority (lower first)', () => {
      const hookA: PreRunViewHook = (params) => params;
      const hookB: PreRunViewHook = (params) => params;
      const hookC: PreRunViewHook = (params) => params;

      HookRegistry.Register('PreRunView', hookA, { Priority: 200 });
      HookRegistry.Register('PreRunView', hookB, { Priority: 50 });
      HookRegistry.Register('PreRunView', hookC, { Priority: 100 });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(3);
      expect(hooks[0]).toBe(hookB); // priority 50
      expect(hooks[1]).toBe(hookC); // priority 100
      expect(hooks[2]).toBe(hookA); // priority 200
    });

    it('should use default priority of 100 when not specified', () => {
      const hookDefault: PreRunViewHook = (params) => params;
      const hookLow: PreRunViewHook = (params) => params;
      const hookHigh: PreRunViewHook = (params) => params;

      HookRegistry.Register('PreRunView', hookHigh, { Priority: 200 });
      HookRegistry.Register('PreRunView', hookDefault); // default 100
      HookRegistry.Register('PreRunView', hookLow, { Priority: 50 });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks[0]).toBe(hookLow);     // 50
      expect(hooks[1]).toBe(hookDefault);  // 100
      expect(hooks[2]).toBe(hookHigh);     // 200
    });

    it('should maintain stable order for equal priorities', () => {
      const hook1: PreRunViewHook = (params) => params;
      const hook2: PreRunViewHook = (params) => params;
      const hook3: PreRunViewHook = (params) => params;

      // All same priority — should maintain insertion order
      HookRegistry.Register('PreRunView', hook1, { Priority: 100 });
      HookRegistry.Register('PreRunView', hook2, { Priority: 100 });
      HookRegistry.Register('PreRunView', hook3, { Priority: 100 });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks[0]).toBe(hook1);
      expect(hooks[1]).toBe(hook2);
      expect(hooks[2]).toBe(hook3);
    });
  });

  describe('Namespace replacement', () => {
    it('should replace a hook with the same namespace', () => {
      const hookV1: PreRunViewHook = (params) => params;
      const hookV2: PreRunViewHook = (params) => ({ ...params, ExtraFilter: 'replaced' });

      HookRegistry.Register('PreRunView', hookV1, { Namespace: 'mj:tenantFilter' });
      HookRegistry.Register('PreRunView', hookV2, { Namespace: 'mj:tenantFilter' });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hookV2);
    });

    it('should not replace hooks with different namespaces', () => {
      const hookMJ: PreRunViewHook = (params) => params;
      const hookSaaS: PreRunViewHook = (params) => params;

      HookRegistry.Register('PreRunView', hookMJ, { Namespace: 'mj:tenantFilter' });
      HookRegistry.Register('PreRunView', hookSaaS, { Namespace: 'bcsaas:tenantFilter' });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(2);
    });

    it('should allow hooks without namespaces to coexist with namespaced hooks', () => {
      const hookNamespaced: PreRunViewHook = (params) => params;
      const hookAnonymous1: PreRunViewHook = (params) => params;
      const hookAnonymous2: PreRunViewHook = (params) => params;

      HookRegistry.Register('PreRunView', hookNamespaced, { Namespace: 'mj:tenantFilter' });
      HookRegistry.Register('PreRunView', hookAnonymous1);
      HookRegistry.Register('PreRunView', hookAnonymous2);

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(3);
    });

    it('should preserve priority when replacing a namespaced hook', () => {
      const hookMJ: PreRunViewHook = (params) => params;
      const hookSaaS: PreRunViewHook = (params) => params;
      const hookAppLevel: PreRunViewHook = (params) => params;

      // MJ registers at priority 50
      HookRegistry.Register('PreRunView', hookMJ, { Priority: 50, Namespace: 'mj:tenantFilter' });
      // App registers at priority 200
      HookRegistry.Register('PreRunView', hookAppLevel, { Priority: 200 });
      // SaaS replaces MJ's hook at priority 50 (same namespace)
      HookRegistry.Register('PreRunView', hookSaaS, { Priority: 50, Namespace: 'mj:tenantFilter' });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(2);
      expect(hooks[0]).toBe(hookSaaS);    // priority 50 (replaced MJ)
      expect(hooks[1]).toBe(hookAppLevel); // priority 200
    });

    it('should support namespace replacement with different priority', () => {
      const hookMJ: PreRunViewHook = (params) => params;
      const hookSaaS: PreRunViewHook = (params) => params;

      // MJ registers at priority 50
      HookRegistry.Register('PreRunView', hookMJ, { Priority: 50, Namespace: 'mj:tenantFilter' });
      // SaaS replaces at priority 100 (same namespace, different priority)
      HookRegistry.Register('PreRunView', hookSaaS, { Priority: 100, Namespace: 'mj:tenantFilter' });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hookSaaS);
    });

    it('should support custom hook names with string type', () => {
      const hook: PreRunViewHook = (params) => params;
      HookRegistry.Register('CustomHookName', hook, { Priority: 50 });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('CustomHookName');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hook);
    });
  });

  describe('Multi-layer stacking scenario', () => {
    it('should support MJ → Middle Layer → App hook chain with proper ordering', () => {
      const results: string[] = [];

      const mjHook: PreRunViewHook = (params) => { results.push('mj'); return params; };
      const middleHook: PreRunViewHook = (params) => { results.push('middle'); return params; };
      const appHook: PreRunViewHook = (params) => { results.push('app'); return params; };

      // Register in random order
      HookRegistry.Register('PreRunView', appHook, { Priority: 200, Namespace: 'app:filter' });
      HookRegistry.Register('PreRunView', mjHook, { Priority: 50, Namespace: 'mj:tenantFilter' });
      HookRegistry.Register('PreRunView', middleHook, { Priority: 100, Namespace: 'bcsaas:tenantFilter' });

      // Execute all hooks in order
      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      const params = { EntityName: 'Test' } as Parameters<PreRunViewHook>[0];
      for (const h of hooks) {
        h(params, undefined);
      }

      // Should execute in priority order
      expect(results).toEqual(['mj', 'middle', 'app']);
    });

    it('should allow middle layer to replace MJ hook without affecting app hook', () => {
      const mjHook: PreRunViewHook = (params) => params;
      const appHook: PreRunViewHook = (params) => params;
      const saasHook: PreRunViewHook = (params) => params;

      // MJ and app register
      HookRegistry.Register('PreRunView', mjHook, { Priority: 50, Namespace: 'mj:tenantFilter' });
      HookRegistry.Register('PreRunView', appHook, { Priority: 200, Namespace: 'app:extraFilter' });

      // SaaS replaces MJ's hook
      HookRegistry.Register('PreRunView', saasHook, { Priority: 50, Namespace: 'mj:tenantFilter' });

      const hooks = HookRegistry.GetHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(2);
      expect(hooks[0]).toBe(saasHook);  // replaced MJ
      expect(hooks[1]).toBe(appHook);   // untouched
    });
  });
});
