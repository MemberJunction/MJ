/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentVersionService } from './component-version.service';
import type { ComponentStudioStateService } from './component-studio-state.service';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';

describe('ComponentVersionService.UpdateCurrentVersion (N4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new immutable artifact version via SaveVersion instead of overwriting in place', async () => {
    const fakeSpec = { name: 'DemoComponent', code: 'export const X = 1;' } as ComponentSpec;
    const stateService = {
      GetCurrentSpec: vi.fn(() => fakeSpec),
    } as Pick<ComponentStudioStateService, 'GetCurrentSpec'> as ComponentStudioStateService;

    const service = new ComponentVersionService(stateService);
    const saveVersionSpy = vi.spyOn(service, 'SaveVersion').mockResolvedValue(true);

    const ok = await service.UpdateCurrentVersion('Fix bug in component');
    expect(ok).toBe(true);
    expect(saveVersionSpy).toHaveBeenCalledTimes(1);
    expect(saveVersionSpy).toHaveBeenCalledWith('Fix bug in component');
  });
});
