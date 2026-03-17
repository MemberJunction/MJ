import { describe, it, expect, beforeEach } from 'vitest';
import { RegisterDataHook, GetDataHooks, ClearAllDataHooks, PreRunViewHook, PostRunViewHook, PreSaveHook, HookName } from '../generic/dataHooks';

describe('Data Hooks (RegisterDataHook / GetDataHooks)', () => {
  beforeEach(() => {
    ClearAllDataHooks();
  });

  describe('RegisterDataHook and GetDataHooks', () => {
    it('should return empty array when no hooks registered', () => {
      const hooks = GetDataHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toEqual([]);
    });

    it('should register and retrieve a single hook', () => {
      const hook: PreRunViewHook = (params) => params;
      RegisterDataHook('PreRunView', hook);

      const hooks = GetDataHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hook);
    });

    it('should register multiple hooks in insertion order', () => {
      const hook1: PreRunViewHook = (params) => params;
      const hook2: PreRunViewHook = (params) => params;
      const hook3: PreRunViewHook = (params) => params;

      RegisterDataHook('PreRunView', hook1);
      RegisterDataHook('PreRunView', hook2);
      RegisterDataHook('PreRunView', hook3);

      const hooks = GetDataHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(3);
      expect(hooks[0]).toBe(hook1);
      expect(hooks[1]).toBe(hook2);
      expect(hooks[2]).toBe(hook3);
    });

    it('should keep hooks separated by name', () => {
      const preHook: PreRunViewHook = (params) => params;
      const postHook: PostRunViewHook = (params, results) => results;
      const saveHook: PreSaveHook = () => true;

      RegisterDataHook('PreRunView', preHook);
      RegisterDataHook('PostRunView', postHook);
      RegisterDataHook('PreSave', saveHook);

      expect(GetDataHooks('PreRunView')).toHaveLength(1);
      expect(GetDataHooks('PostRunView')).toHaveLength(1);
      expect(GetDataHooks('PreSave')).toHaveLength(1);
    });

    it('should support custom hook names with string type', () => {
      const hook: PreRunViewHook = (params) => params;
      RegisterDataHook('CustomHookName', hook);

      const hooks = GetDataHooks<PreRunViewHook>('CustomHookName');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hook);
    });
  });

  describe('ClearAllDataHooks', () => {
    it('should clear all hooks across all names', () => {
      RegisterDataHook('PreRunView', (params: unknown) => params);
      RegisterDataHook('PostRunView', (params: unknown, results: unknown) => results);
      RegisterDataHook('PreSave', () => true);

      ClearAllDataHooks();

      expect(GetDataHooks('PreRunView')).toHaveLength(0);
      expect(GetDataHooks('PostRunView')).toHaveLength(0);
      expect(GetDataHooks('PreSave')).toHaveLength(0);
    });
  });

  describe('Hook execution patterns', () => {
    it('should support async PreRunView hooks that modify params', async () => {
      const hook: PreRunViewHook = async (params) => {
        return { ...params, ExtraFilter: `${params.ExtraFilter ?? ''} AND TenantID = '123'`.trim() };
      };
      RegisterDataHook('PreRunView', hook);

      const hooks = GetDataHooks<PreRunViewHook>('PreRunView');
      let params = { EntityName: 'Test', ExtraFilter: "Status = 'Active'" } as Parameters<PreRunViewHook>[0];
      for (const h of hooks) {
        params = await h(params, undefined);
      }

      expect(params.ExtraFilter).toBe("Status = 'Active' AND TenantID = '123'");
    });

    it('should support PreSave hooks that reject saves', async () => {
      const rejectHook: PreSaveHook = () => 'Tenant mismatch';
      RegisterDataHook('PreSave', rejectHook);

      const hooks = GetDataHooks<PreSaveHook>('PreSave');
      const result = await hooks[0](null as Parameters<PreSaveHook>[0], undefined);
      expect(result).toBe('Tenant mismatch');
    });

    it('should support PreSave hooks that allow saves', async () => {
      const allowHook: PreSaveHook = () => true;
      RegisterDataHook('PreSave', allowHook);

      const hooks = GetDataHooks<PreSaveHook>('PreSave');
      const result = await hooks[0](null as Parameters<PreSaveHook>[0], undefined);
      expect(result).toBe(true);
    });
  });

  describe('No priority or namespace logic', () => {
    it('should preserve insertion order regardless of registration order', () => {
      const hookA: PreRunViewHook = (params) => params;
      const hookB: PreRunViewHook = (params) => params;
      const hookC: PreRunViewHook = (params) => params;

      // Order is purely insertion order -- no priority sorting
      RegisterDataHook('PreRunView', hookA);
      RegisterDataHook('PreRunView', hookB);
      RegisterDataHook('PreRunView', hookC);

      const hooks = GetDataHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(3);
      expect(hooks[0]).toBe(hookA);
      expect(hooks[1]).toBe(hookB);
      expect(hooks[2]).toBe(hookC);
    });

    it('should NOT deduplicate -- same hook registered twice appears twice', () => {
      const hook: PreRunViewHook = (params) => params;

      RegisterDataHook('PreRunView', hook);
      RegisterDataHook('PreRunView', hook);

      const hooks = GetDataHooks<PreRunViewHook>('PreRunView');
      expect(hooks).toHaveLength(2);
      expect(hooks[0]).toBe(hook);
      expect(hooks[1]).toBe(hook);
    });
  });

  describe('Multi-layer execution scenario', () => {
    it('should support MJ -> Middle Layer -> App hook chain in insertion order', () => {
      const results: string[] = [];

      const mjHook: PreRunViewHook = (params) => { results.push('mj'); return params; };
      const middleHook: PreRunViewHook = (params) => { results.push('middle'); return params; };
      const appHook: PreRunViewHook = (params) => { results.push('app'); return params; };

      // serve() registers hooks in ClassFactory registration order:
      // MJ packages first, then middle-layer, then app
      RegisterDataHook('PreRunView', mjHook);
      RegisterDataHook('PreRunView', middleHook);
      RegisterDataHook('PreRunView', appHook);

      // Execute all hooks in order
      const hooks = GetDataHooks<PreRunViewHook>('PreRunView');
      const params = { EntityName: 'Test' } as Parameters<PreRunViewHook>[0];
      for (const h of hooks) {
        h(params, undefined);
      }

      // Should execute in insertion order (which is ClassFactory registration order)
      expect(results).toEqual(['mj', 'middle', 'app']);
    });
  });

  describe('HookName type', () => {
    it('should accept well-known HookName values', () => {
      const hookNames: HookName[] = ['PreRunView', 'PostRunView', 'PreSave'];
      for (const name of hookNames) {
        RegisterDataHook(name, () => {});
        expect(GetDataHooks(name)).toHaveLength(1);
        ClearAllDataHooks();
      }
    });
  });
});
