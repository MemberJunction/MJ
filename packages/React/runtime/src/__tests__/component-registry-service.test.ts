import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { ComponentRegistryService } from '../registry/component-registry-service';
import type { ComponentCompiler } from '../compiler/component-compiler';
import type { RuntimeContext } from '../types';

describe('ComponentRegistryService singleton', () => {
  const mockCompiler = {} as ComponentCompiler;
  const mockRuntimeContext = {} as RuntimeContext;

  beforeEach(() => {
    ComponentRegistryService.Reset();
  });

  afterEach(() => {
    ComponentRegistryService.Reset();
  });

  it('stores the singleton instance in GlobalObjectStore and clears it on Reset()', () => {
    const globalStore = GetGlobalObjectStore();
    expect(globalStore?.['___SINGLETON__ComponentRegistryService']).toBeUndefined();
    expect(ComponentRegistryService.Instance).toBeUndefined();

    const first = ComponentRegistryService.GetInstance(mockCompiler, mockRuntimeContext, false);
    expect(first).toBeInstanceOf(ComponentRegistryService);
    expect(globalStore?.['___SINGLETON__ComponentRegistryService']).toBe(first);
    expect(ComponentRegistryService.Instance).toBe(first);
    expect(ComponentRegistryService.getInstance(mockCompiler, mockRuntimeContext)).toBe(first);

    ComponentRegistryService.Reset();
    expect(globalStore?.['___SINGLETON__ComponentRegistryService']).toBeUndefined();
    expect(ComponentRegistryService.Instance).toBeUndefined();

    const second = ComponentRegistryService.GetInstance(mockCompiler, mockRuntimeContext, false);
    expect(second).toBeInstanceOf(ComponentRegistryService);
    expect(second).not.toBe(first);
  });
});
